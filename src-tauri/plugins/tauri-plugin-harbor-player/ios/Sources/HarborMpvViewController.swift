/// Fullscreen libmpv engine, the codec-parity sibling of HarborPlayerViewController.
/// AVFoundation cannot open MKV containers, AC3/DTS audio, or sidecar SRT/ASS subs,
/// which is most torrent releases; MPVKit (libmpv + FFmpeg + libass, Metal via the
/// patched moltenvk gpu-context) decodes all of it. The plugin routes HLS/MP4-family
/// URLs to the AVPlayer engine (PiP, battery, system UI) and everything else here;
/// both engines speak the same wire contract through HarborPlayerEngine.
///
/// Threading doctrine (client.h): the client API is thread-safe, so commands run on
/// the main queue; events drain on a serial queue kicked by mpv_set_wakeup_callback,
/// which itself never calls the client API. Teardown is unobserve, then the quit
/// command, then MPV_EVENT_SHUTDOWN on the event queue where mpv_terminate_destroy
/// runs; shuttingDown fences every main-queue entry point once quit is issued.
import AVFoundation
import Libmpv
import UIKit

// MoltenVK forces drawableSize to 1x1 to complete presentation, which flickers and
// can stick at 1x1; reject that size (mpv PR #13651, mirrored from the MPVKit demo).
private final class HarborMetalLayer: CAMetalLayer {
  override var drawableSize: CGSize {
    get { super.drawableSize }
    set {
      if Int(newValue.width) > 1 && Int(newValue.height) > 1 {
        super.drawableSize = newValue
      }
    }
  }
}

final class HarborMpvViewController: UIViewController, HarborPlayerEngine {
  var onTick: ((Double, Double, Double, Bool) -> Void)?
  var onState: ((String, String?) -> Void)?
  var onClosed: ((Double, Double) -> Void)?
  var onTracks: (([NativeTrackEntry], [NativeTrackEntry]) -> Void)?

  private let metalLayer = HarborMetalLayer()
  private let closeButton = UIButton(type: .system)
  private let nowPlaying = HarborNowPlaying()
  private let eventQueue = DispatchQueue(label: "harbor-player.mpv-events", qos: .userInitiated)

  // Main-queue state.
  private var mpv: OpaquePointer?
  private var shuttingDown = false
  private var wakeupContext: UnsafeMutableRawPointer?
  private var tickTimer: Timer?
  private var closedReported = false
  private var fileLoaded = false
  private var lastStatus: String?
  private var currentTitle: String?
  private var pendingSubtitles: [SubArg] = []
  private var defaultUserAgent: String?
  private var resumeOnForeground = false
  private var resumeAfterInterruption = false
  private var notificationTokens: [NSObjectProtocol] = []

  // Latest observed values; the tick timer reads these instead of polling the core
  // (mpv coalesces observation events, so this matches the 500 ms cadence).
  private var cachedPosition = 0.0
  private var cachedDuration = 0.0
  private var cachedBuffered = 0.0
  private var cachedPaused = false
  private var cachedPausedForCache = false

  // Only touched on eventQueue.
  private var eventLoopEnded = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    metalLayer.frame = view.bounds
    metalLayer.framebufferOnly = true
    metalLayer.backgroundColor = UIColor.black.cgColor
    // MoltenVK does not track layer resizes (MPVKit issue #3); resizeAspect at
    // least keeps the picture scaled correctly through rotation.
    metalLayer.contentsGravity = .resizeAspect
    // Issue #3 also makes the scale at swapchain creation permanent, and a fast
    // source can reach VO init before the first in-window layout (configure
    // loads and starts the core before presentation settles), so the scale must
    // be seeded here or the session sticks at the CALayer default of 1.0. No
    // window exists yet; the scene's screen stands in for it (the demo's
    // UIScreen.main works too but is deprecated since the iOS 16 SDK).
    let scenes = UIApplication.shared.connectedScenes
    if let screen = scenes.compactMap({ ($0 as? UIWindowScene)?.screen }).first {
      metalLayer.contentsScale = screen.nativeScale
    }
    view.layer.addSublayer(metalLayer)
    setupCloseButton()
    let tap = UITapGestureRecognizer(target: self, action: #selector(surfaceTapped(_:)))
    // Without this the recognizer cancels the close button's own touch handling.
    tap.cancelsTouchesInView = false
    view.addGestureRecognizer(tap)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    metalLayer.frame = view.bounds
    // Refinement of the viewDidLoad seed; only effective while VO init has not
    // yet fixed the swapchain size (MPVKit issue #3).
    if let scale = view.window?.screen.nativeScale, metalLayer.contentsScale != scale {
      metalLayer.contentsScale = scale
    }
  }

  override var prefersStatusBarHidden: Bool { true }
  override var prefersHomeIndicatorAutoHidden: Bool { true }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    // A bare Metal surface does not get AVPlayer's automatic display-sleep
    // prevention, so the screen would dim mid-movie without this.
    UIApplication.shared.isIdleTimerDisabled = true
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    UIApplication.shared.isIdleTimerDisabled = false
    // Same closed-once semantics as the AVPlayer engine: only a genuine dismissal
    // reports closed and tears down.
    if isBeingDismissed {
      reportClosed()
      teardown()
    }
  }

  deinit {
    for token in notificationTokens { NotificationCenter.default.removeObserver(token) }
  }

  /// First load and every in-place stream swap. A swap issues another loadfile
  /// replace on the live core with no closed event, mirroring the AVPlayer leg
  /// and Android's singleTask onNewIntent path.
  func configure(_ args: LoadArgs) {
    loadViewIfNeeded()
    closedReported = false
    lastStatus = nil
    fileLoaded = false
    currentTitle = args.title
    pendingSubtitles = args.subtitles
    cachedPosition = 0
    cachedDuration = 0
    cachedBuffered = 0
    cachedPaused = false
    cachedPausedForCache = false
    emitState("loading")

    guard let url = URL(string: args.url) else {
      emitState("error", "SOURCE_URL_INVALID")
      return
    }
    ensureMpv()
    guard mpv != nil, !shuttingDown else {
      emitState("error", "ERROR_CODE_UNSPECIFIED")
      return
    }

    applyHeaders(args.headers)
    var commandArgs = [url.absoluteString, "replace", "-1"]
    if args.startAtSec > 0 {
      // Per-file option in the loadfile options slot (input.rst 0.41): reverts
      // automatically at end of playback. The 0.38+ arg order requires index -1
      // before the options argument. "+" keeps the time relative to the rebased
      // start under the default rebase-start-time=yes.
      commandArgs.append(String(format: "start=+%.3f", args.startAtSec))
    }
    runCommand("loadfile", commandArgs)
    setFlag("pause", false)

    registerLifecycleObservers()
    registerRemoteCommands()
    startTicking()
    updateNowPlaying()
  }

  func doPlay() { setFlag("pause", false) }
  func doPause() { setFlag("pause", true) }

  func doSeek(_ sec: Double) {
    runCommand("seek", [String(format: "%.3f", sec), "absolute"])
  }

  func doStop() {
    reportClosed()
    teardown()
    dismiss(animated: true)
  }

  func doSetAudioTrack(_ id: String?) {
    guard let trackId = mpvTrackId(id, prefix: "a"), trackExists(type: "audio", id: trackId)
    else { return }
    setString("aid", trackId)
    emitTracks()
  }

  func doSetSubtitleTrack(_ id: String?) {
    if let id = id {
      guard let trackId = mpvTrackId(id, prefix: "s"), trackExists(type: "sub", id: trackId)
      else { return }
      setString("sid", trackId)
    } else {
      setString("sid", "no")
    }
    emitTracks()
  }

  // gpu-next has no frame-export path on iOS (MPVKit issue #41), so there is no
  // buffer to hand an AVPictureInPictureController; PiP stays an AVPlayer-engine
  // feature and this resolves as a documented no-op.
  func enterPip() {
    NSLog("%@", "[harbor-player] enterPip: not supported on the mpv engine")
  }

  // MARK: - mpv core lifecycle

  private func ensureMpv() {
    guard mpv == nil, !shuttingDown else { return }
    guard let handle = mpv_create() else { return }

    mpv_request_log_messages(handle, "warn")
    // The MPVKit iOS stack: gpu-next rendering over Vulkan/MoltenVK into the layer
    // passed as wid, VideoToolbox hardware decode. gpu-context=moltenvk is an
    // MPVKit patch, not upstream mpv.
    mpv_set_option_string(handle, "vo", "gpu-next")
    mpv_set_option_string(handle, "gpu-api", "vulkan")
    mpv_set_option_string(handle, "gpu-context", "moltenvk")
    mpv_set_option_string(handle, "hwdec", "videotoolbox")
    // avfoundation first: the audiounit AO goes silent on multichannel HDMI and
    // AirPlay routes (MPVKit issue #67, AO shipped fixed in MPVKit 1.0.0).
    mpv_set_option_string(handle, "ao", "avfoundation,audiounit")
    // mpv reads the CAMetalLayer object pointer back out of the int64 wid option
    // (context_moltenvk patch); the layer is retained by this controller's view
    // for the core's whole lifetime.
    var wid = Int64(Int(bitPattern: Unmanaged.passUnretained(metalLayer).toOpaque()))
    mpv_set_option(handle, "wid", MPV_FORMAT_INT64, &wid)

    guard mpv_initialize(handle) >= 0 else {
      mpv_terminate_destroy(handle)
      return
    }
    mpv = handle
    defaultUserAgent = getString("user-agent")

    mpv_observe_property(handle, 0, "time-pos", MPV_FORMAT_DOUBLE)
    mpv_observe_property(handle, 0, "duration", MPV_FORMAT_DOUBLE)
    mpv_observe_property(handle, 0, "demuxer-cache-time", MPV_FORMAT_DOUBLE)
    mpv_observe_property(handle, 0, "pause", MPV_FORMAT_FLAG)
    mpv_observe_property(handle, 0, "paused-for-cache", MPV_FORMAT_FLAG)
    mpv_observe_property(handle, 0, "track-list", MPV_FORMAT_NONE)

    // The wakeup context holds a retain on self until mpv_terminate_destroy has
    // run, so the C callback can never see a dangling pointer; the event queue
    // releases it after SHUTDOWN.
    let context = Unmanaged.passRetained(self).toOpaque()
    wakeupContext = context
    mpv_set_wakeup_callback(
      handle,
      { context in
        // Foreign mpv thread; client API calls are forbidden here (client.h),
        // so this only kicks the drain queue.
        guard let context = context else { return }
        let controller = Unmanaged<HarborMpvViewController>.fromOpaque(context)
          .takeUnretainedValue()
        controller.scheduleEventDrain()
      }, context)
  }

  private func teardown() {
    tickTimer?.invalidate()
    tickTimer = nil
    nowPlaying.clear()
    for token in notificationTokens { NotificationCenter.default.removeObserver(token) }
    notificationTokens.removeAll()
    shutdownMpv()
  }

  private func shutdownMpv() {
    guard !shuttingDown, let handle = mpv else { return }
    shuttingDown = true
    // Observers must go before quit: mpv emits property changes during shutdown
    // and handlers must not touch the dying core (IINA's hard-learned rule).
    mpv_unobserve_property(handle, 0)
    runQuitCommand(handle)
  }

  // Bypasses runCommand: shuttingDown is already set to fence normal commands,
  // and quit is the one command that must still go through.
  private func runQuitCommand(_ handle: OpaquePointer) {
    _ = withCommandArgv("quit", []) { argv in mpv_command(handle, argv) }
  }

  private func reportClosed() {
    guard !closedReported, mpv != nil else { return }
    closedReported = true
    onClosed?(cachedPosition, cachedDuration)
  }

  // MARK: - Event loop (eventQueue)

  // Called from mpv's internal threads via the wakeup callback.
  private func scheduleEventDrain() {
    eventQueue.async { [weak self] in self?.drainEvents() }
  }

  private func drainEvents() {
    if eventLoopEnded { return }
    while let handle = mpv {
      guard let event = mpv_wait_event(handle, 0) else { return }
      if event.pointee.event_id == MPV_EVENT_NONE { return }
      handleEvent(event.pointee, handle: handle)
      // SHUTDOWN destroys the handle; reading another event would use-after-free.
      if eventLoopEnded { return }
    }
  }

  private func handleEvent(_ event: mpv_event, handle: OpaquePointer) {
    switch event.event_id {
    case MPV_EVENT_PROPERTY_CHANGE:
      guard let data = event.data else { return }
      handlePropertyEvent(data.assumingMemoryBound(to: mpv_event_property.self).pointee)
    case MPV_EVENT_FILE_LOADED:
      DispatchQueue.main.async { self.handleFileLoaded() }
    case MPV_EVENT_END_FILE:
      guard let data = event.data else { return }
      let end = data.assumingMemoryBound(to: mpv_event_end_file.self).pointee
      let reason = end.reason
      let mpvError = end.error
      DispatchQueue.main.async { self.handleEndFile(reason: reason, mpvError: mpvError) }
    case MPV_EVENT_LOG_MESSAGE:
      guard let data = event.data else { return }
      let message = data.assumingMemoryBound(to: mpv_event_log_message.self).pointee
      let prefix = String(cString: message.prefix)
      let text = String(cString: message.text).trimmingCharacters(in: .newlines)
      NSLog("%@", "[harbor-player] mpv \(prefix): \(text)")
    case MPV_EVENT_SHUTDOWN:
      eventLoopEnded = true
      mpv = nil
      mpv_terminate_destroy(handle)
      if let context = wakeupContext {
        wakeupContext = nil
        // Balances the passRetained in ensureMpv; after terminate_destroy mpv
        // guarantees no further wakeups, so self may now deallocate.
        Unmanaged<HarborMpvViewController>.fromOpaque(context).release()
      }
    default:
      break
    }
  }

  private func handlePropertyEvent(_ property: mpv_event_property) {
    guard let cName = property.name else { return }
    let name = String(cString: cName)
    // Values are copied here because the event data dies at the next
    // mpv_wait_event call; format is MPV_FORMAT_NONE when unavailable.
    var doubleValue: Double?
    var flagValue: Bool?
    if property.format == MPV_FORMAT_DOUBLE, let data = property.data {
      doubleValue = data.assumingMemoryBound(to: Double.self).pointee
    } else if property.format == MPV_FORMAT_FLAG, let data = property.data {
      flagValue = data.assumingMemoryBound(to: CInt.self).pointee != 0
    }
    DispatchQueue.main.async {
      self.applyPropertyChange(name, double: doubleValue, flag: flagValue)
    }
  }

  // MARK: - Event handling (main queue)

  private func applyPropertyChange(_ name: String, double: Double?, flag: Bool?) {
    guard !shuttingDown else { return }
    switch name {
    case "time-pos":
      // Unavailable (idle, post-EOF) keeps the last value so closed reports a
      // real position.
      if let value = double { cachedPosition = value }
    case "duration":
      if let value = double { cachedDuration = value }
    case "demuxer-cache-time":
      if let value = double { cachedBuffered = value }
    case "pause":
      if let value = flag { cachedPaused = value }
    case "paused-for-cache":
      guard let value = flag else { return }
      cachedPausedForCache = value
      // Mirror media3: buffering drops to loading, recovery returns to ready.
      // fileLoaded gates the initial pre-load notification.
      if fileLoaded { emitState(value ? "loading" : "ready") }
    case "track-list":
      // Covers late-appearing tracks and selection changes from any source.
      if fileLoaded { emitTracks() }
    default:
      break
    }
  }

  private func handleFileLoaded() {
    guard !shuttingDown, mpv != nil else { return }
    fileLoaded = true
    addSidecarSubtitles()
    emitState("ready")
    emitTracks()
    updateNowPlaying()
  }

  private func handleEndFile(reason: mpv_end_file_reason, mpvError: Int32) {
    guard !shuttingDown else { return }
    fileLoaded = false
    switch reason {
    case MPV_END_FILE_REASON_EOF:
      // client.h: EOF also fires on truncated files and dropped connections. A
      // playhead nowhere near a known duration is a broken stream, not a finish.
      if cachedDuration > 0 && cachedPosition < cachedDuration - 10 {
        emitState("error", "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED")
      } else {
        emitState("ended")
      }
    case MPV_END_FILE_REASON_ERROR:
      emitState("error", media3ErrorCode(mpvError))
    default:
      // STOP and QUIT come from our own swap or teardown; REDIRECT is playlist
      // bookkeeping. None of them is a JS-visible state change.
      break
    }
  }

  // The JS bridge substring-matches media3 error-code names, so raw mpv error
  // strings never cross the wire (same rule as the AVPlayer engine).
  private func media3ErrorCode(_ mpvError: Int32) -> String {
    switch mpvError {
    case MPV_ERROR_LOADING_FAILED.rawValue:
      return "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED"
    case MPV_ERROR_UNKNOWN_FORMAT.rawValue, MPV_ERROR_NOTHING_TO_PLAY.rawValue:
      return "ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED"
    case MPV_ERROR_UNSUPPORTED.rawValue:
      return "ERROR_CODE_DECODING_FAILED"
    default:
      return "ERROR_CODE_UNSPECIFIED"
    }
  }

  // MARK: - Load plumbing

  private func applyHeaders(_ headers: [String: String]) {
    // change-list append treats the value as one list item with no comma
    // splitting or escape parsing (input.rst 0.41), so cookie and auth values
    // survive verbatim. Cleared on every load so debrid headers never leak onto
    // the next stream.
    runCommand("change-list", ["http-header-fields", "clr", ""])
    var userAgent: String?
    for (key, value) in headers {
      if key.lowercased() == "user-agent" {
        userAgent = value
      } else {
        runCommand("change-list", ["http-header-fields", "append", "\(key): \(value)"])
      }
    }
    // The dedicated option carries the UA to avoid a duplicate header; restore
    // mpv's default when a load stops sending one.
    if let userAgent = userAgent {
      setString("user-agent", userAgent)
    } else if let fallback = defaultUserAgent {
      setString("user-agent", fallback)
    }
  }

  private func addSidecarSubtitles() {
    guard !pendingSubtitles.isEmpty else { return }
    // Android flags every sidecar SELECTION_FLAG_DEFAULT and lets media3 pick
    // one; the mpv equivalent: leave a container-selected subtitle alone,
    // otherwise the first sidecar gets the select flag (input.rst 0.41 sub-add).
    // Async because a slow subtitle host must not block the main thread; a
    // failed add is logged by mpv and the track simply never appears.
    var selectFirst = !hasSelectedSubtitle()
    for subtitle in pendingSubtitles {
      guard URL(string: subtitle.url) != nil else { continue }
      var args = [subtitle.url, selectFirst ? "select" : "auto"]
      if let title = subtitle.label ?? subtitle.lang {
        args.append(title)
        if let lang = subtitle.lang { args.append(lang) }
      }
      runCommandAsync("sub-add", args)
      selectFirst = false
    }
  }

  private func hasSelectedSubtitle() -> Bool {
    guard let sid = getString("sid") else { return false }
    return sid != "no" && sid != "auto"
  }

  // MARK: - Tick and tracks

  private func startTicking() {
    tickTimer?.invalidate()
    // Same wall-clock cadence as the AVPlayer engine; .common keeps it firing
    // during UI tracking.
    let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
    RunLoop.main.add(timer, forMode: .common)
    tickTimer = timer
  }

  private func tick() {
    onTick?(cachedPosition, cachedDuration, cachedBuffered, isPlayingNow)
    updateNowPlaying()
  }

  private var isPlayingNow: Bool {
    fileLoaded && !cachedPaused && !cachedPausedForCache
  }

  private func emitState(_ status: String, _ code: String? = nil) {
    if status != "error" && status == lastStatus { return }
    lastStatus = status
    onState?(status, code)
  }

  private func emitTracks() {
    guard mpv != nil, !shuttingDown else { return }
    let count = getInt64("track-list/count") ?? 0
    var audio: [NativeTrackEntry] = []
    var subtitle: [NativeTrackEntry] = []
    for index in 0..<count {
      let base = "track-list/\(index)"
      guard let type = getString("\(base)/type"), type == "audio" || type == "sub",
        let id = getInt64("\(base)/id")
      else { continue }
      let lang = getString("\(base)/lang") ?? ""
      let title = getString("\(base)/title")
      let selected = getFlag("\(base)/selected") ?? false
      let ordinal = (type == "audio" ? audio.count : subtitle.count) + 1
      let label = (title?.isEmpty == false) ? title! : (!lang.isEmpty ? lang : "Track \(ordinal)")
      if type == "audio" {
        audio.append(
          NativeTrackEntry(
            id: "a/\(id)", lang: lang, label: label, selected: selected,
            channelCount: getInt64("\(base)/demux-channel-count").map { Int($0) }))
      } else {
        subtitle.append(
          NativeTrackEntry(id: "s/\(id)", lang: lang, label: label, selected: selected))
      }
    }
    onTracks?(audio, subtitle)
  }

  private func mpvTrackId(_ id: String?, prefix: String) -> String? {
    guard let id = id else { return nil }
    let parts = id.components(separatedBy: "/")
    guard parts.count == 2, parts[0] == prefix, Int(parts[1]) != nil else { return nil }
    return parts[1]
  }

  private func trackExists(type: String, id: String) -> Bool {
    let count = getInt64("track-list/count") ?? 0
    for index in 0..<count {
      guard let entryType = getString("track-list/\(index)/type"), entryType == type,
        let entryId = getInt64("track-list/\(index)/id")
      else { continue }
      if String(entryId) == id { return true }
    }
    return false
  }

  // MARK: - Session, lifecycle, transport

  private func registerLifecycleObservers() {
    guard notificationTokens.isEmpty else { return }
    let center = NotificationCenter.default
    notificationTokens.append(
      center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { [weak self] _ in
        guard let self = self else { return }
        // GPU work in the background gets the app killed; dropping video also
        // avoids the MPVKit black-screen-on-return bug.
        self.resumeOnForeground = self.fileLoaded && !self.cachedPaused
        self.doPause()
        self.setString("vid", "no")
      })
    notificationTokens.append(
      center.addObserver(
        forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
      ) { [weak self] _ in
        guard let self = self else { return }
        self.setString("vid", "auto")
        if self.resumeOnForeground { self.doPlay() }
      })
    // mpv's iOS audio outputs configure the AVAudioSession category themselves
    // but never watch it; interruptions and route changes are the host's job.
    notificationTokens.append(
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        self?.handleAudioInterruption(note)
      })
    notificationTokens.append(
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] note in
        self?.handleRouteChange(note)
      })
  }

  private func handleAudioInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw)
    else { return }
    switch type {
    case .began:
      resumeAfterInterruption = fileLoaded && !cachedPaused
      doPause()
    case .ended:
      let rawOptions = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)
      if options.contains(.shouldResume) && resumeAfterInterruption { doPlay() }
    @unknown default:
      break
    }
  }

  private func handleRouteChange(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    else { return }
    // Headphones out must never blast the speaker.
    if reason == .oldDeviceUnavailable { doPause() }
  }

  private func registerRemoteCommands() {
    nowPlaying.register(
      play: { [weak self] in
        guard let self = self, self.mpv != nil, !self.shuttingDown else { return false }
        self.doPlay()
        return true
      },
      pause: { [weak self] in
        guard let self = self, self.mpv != nil, !self.shuttingDown else { return false }
        self.doPause()
        return true
      },
      toggle: { [weak self] in
        guard let self = self, self.mpv != nil, !self.shuttingDown else { return false }
        if self.cachedPaused { self.doPlay() } else { self.doPause() }
        return true
      },
      seek: { [weak self] position in
        guard let self = self, self.mpv != nil, !self.shuttingDown else { return false }
        self.doSeek(position)
        return true
      })
  }

  private func updateNowPlaying() {
    nowPlaying.update(
      title: currentTitle,
      positionSec: cachedPosition,
      durationSec: cachedDuration > 0 ? cachedDuration : nil,
      playing: isPlayingNow)
  }

  private func setupCloseButton() {
    // AVKit gives the other engine a Done button; this surface needs its own
    // exit. Everything else rides the lock-screen transport and the JS bridge.
    closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
    closeButton.tintColor = .white
    closeButton.backgroundColor = UIColor(white: 0, alpha: 0.4)
    closeButton.layer.cornerRadius = 20
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    view.addSubview(closeButton)
    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      closeButton.leadingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
      closeButton.widthAnchor.constraint(equalToConstant: 40),
      closeButton.heightAnchor.constraint(equalToConstant: 40),
    ])
  }

  @objc private func closeTapped() {
    doStop()
  }

  @objc private func surfaceTapped(_ recognizer: UITapGestureRecognizer) {
    let location = recognizer.location(in: view)
    guard !closeButton.frame.contains(location), fileLoaded else { return }
    if cachedPaused { doPlay() } else { doPause() }
  }

  // MARK: - Client API helpers (main queue)

  private func withCommandArgv(
    _ name: String, _ args: [String],
    _ body: (UnsafeMutablePointer<UnsafePointer<CChar>?>) -> Int32
  ) -> Int32 {
    // strdup/free pairs own every C string for exactly this call; mpv copies
    // what it keeps.
    let owned: [UnsafeMutablePointer<CChar>?] = ([name] + args).map { strdup($0) }
    defer {
      for pointer in owned { free(pointer) }
    }
    var argv: [UnsafePointer<CChar>?] = owned.map { pointer in pointer.map { UnsafePointer($0) } }
    argv.append(nil)
    // Explicit buffer scope: the implicit &array-to-pointer conversion does not
    // apply when the callee is a closure value.
    return argv.withUnsafeMutableBufferPointer { buffer in
      body(buffer.baseAddress!)
    }
  }

  @discardableResult
  private func runCommand(_ name: String, _ args: [String] = []) -> Int32 {
    guard let handle = mpv, !shuttingDown else { return -1 }
    let status = withCommandArgv(name, args) { argv in mpv_command(handle, argv) }
    if status < 0 {
      NSLog("%@", "[harbor-player] mpv \(name) failed: \(String(cString: mpv_error_string(status)))")
    }
    return status
  }

  private func runCommandAsync(_ name: String, _ args: [String]) {
    guard let handle = mpv, !shuttingDown else { return }
    // mpv copies the argv before returning (client.h); replies arrive as
    // COMMAND_REPLY events, which the drain ignores.
    let status = withCommandArgv(name, args) { argv in mpv_command_async(handle, 0, argv) }
    if status < 0 {
      NSLog("%@", "[harbor-player] mpv \(name) failed: \(String(cString: mpv_error_string(status)))")
    }
  }

  private func setString(_ name: String, _ value: String) {
    guard let handle = mpv, !shuttingDown else { return }
    mpv_set_property_string(handle, name, value)
  }

  private func setFlag(_ name: String, _ value: Bool) {
    guard let handle = mpv, !shuttingDown else { return }
    var flag: CInt = value ? 1 : 0
    mpv_set_property(handle, name, MPV_FORMAT_FLAG, &flag)
  }

  private func getString(_ name: String) -> String? {
    guard let handle = mpv, !shuttingDown else { return nil }
    guard let cString = mpv_get_property_string(handle, name) else { return nil }
    defer { mpv_free(cString) }
    return String(cString: cString)
  }

  private func getInt64(_ name: String) -> Int64? {
    guard let handle = mpv, !shuttingDown else { return nil }
    var value = Int64(0)
    guard mpv_get_property(handle, name, MPV_FORMAT_INT64, &value) >= 0 else { return nil }
    return value
  }

  private func getFlag(_ name: String) -> Bool? {
    guard let handle = mpv, !shuttingDown else { return nil }
    var value = CInt(0)
    guard mpv_get_property(handle, name, MPV_FORMAT_FLAG, &value) >= 0 else { return nil }
    return value != 0
  }
}
