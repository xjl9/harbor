/// Fullscreen libmpv engine, the codec-parity sibling of HarborPlayerViewController.
/// AVFoundation cannot open MKV containers, AC3/DTS audio, or sidecar SRT/ASS subs,
/// which is most torrent releases; MPVKit (libmpv + FFmpeg + libass, Metal via the
/// patched moltenvk gpu-context) decodes all of it. The plugin routes HLS/MP4-family
/// URLs to the AVPlayer engine (PiP, battery, system UI) and everything else here;
/// both engines speak the same wire contract through HarborPlayerEngine.
///
/// Threading doctrine (client.h): the client API is thread-safe, so commands run on
/// the main queue (sidecar sub-adds run sequentially on the event queue instead, so
/// a slow subtitle host never blocks main); events drain on a serial queue kicked by
/// mpv_set_wakeup_callback, which itself never calls the client API. Teardown is
/// unobserve, then the quit command, then MPV_EVENT_SHUTDOWN on the event queue
/// where mpv_terminate_destroy runs; shuttingDown fences every main-queue entry
/// point once quit is issued.
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
  var onTick: ((Double, Double, Double, Bool, Double) -> Void)?
  var onState: ((String, String?) -> Void)?
  var onClosed: ((Double, Double) -> Void)?
  var onTracks: (([NativeTrackEntry], [NativeTrackEntry]) -> Void)?
  /// Read once in viewDidLoad: true builds no native chrome at all.
  var webChrome = false
  /// Last speed handed to mpv; see HarborMpvViewController+Commands.swift.
  var currentRate = 1.0
  /// Raised when the viewer asks for the following episode from the overlay.
  /// Loading it is the JS side's job, the same path auto-advance already uses.
  var onNextEpisode: (() -> Void)?
  /// Only true when the JS side says a following episode exists, so the button
  /// never appears on a film or on the last episode of a season.
  var canNext: Bool = false {
    didSet { nextButton.isHidden = !canNext }
  }

  private let metalLayer = HarborMetalLayer()
  /// Side of the square render surface in points, fixed for the session.
  private var surfaceSidePt: CGFloat = 0
  /// Crop-to-fill rather than fit; see doSetZoom.
  var zoomFill = false
  private let closeButton = UIButton(type: .system)
  private let titleLabel = UILabel()
  // Native transport overlay (mpv engine only; the AVPlayer engine uses AVKit's
  // own chrome). The close button plus this bar form one "chrome" set that shows
  // and hides together on a surface tap.
  private let transportBar = UIView()
  private let playPauseButton = UIButton(type: .system)
  private let currentTimeLabel = UILabel()
  private let durationLabel = UILabel()
  private let seekSlider = UISlider()
  private let tracksButton = UIButton(type: .system)
  private let nextButton = UIButton(type: .system)
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
  // Bumped per configure; drain-to-main hops carry the generation they were
  // drained under and drop themselves once it moves on, standing in for the
  // full teardown Android's onNewIntent path gets for free.
  private var loadGeneration = 0
  // Last user seek target, for the EOF shortfall heuristic.
  private var lastSeekTargetSec: Double?

  // Latest observed values; the tick timer reads these instead of polling the core
  // (mpv coalesces observation events, so this matches the 500 ms cadence).
  private var cachedPosition = 0.0
  private var cachedDuration = 0.0
  private var cachedBuffered = 0.0
  private var cachedPaused = false
  private var cachedPausedForCache = false
  private var cachedEofReached = false

  // Last track lists handed to onTracks, cached so the overlay's track picker can
  // read them without re-walking mpv (there is no other stored track array).
  private var lastAudioTracks: [NativeTrackEntry] = []
  private var lastSubtitleTracks: [NativeTrackEntry] = []
  // Overlay state. isScrubbing fences tick from fighting the user's slider drag;
  // chromeVisible is the source of truth for the show/hide toggle; autoHideTimer
  // dismisses the chrome after a few idle seconds.
  private var isScrubbing = false
  private var chromeVisible = true
  private var autoHideTimer: Timer?

  // Only touched on eventQueue.
  private var eventLoopEnded = false
  private var drainGeneration = 0

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    // Filling scales the surface past the view bounds; without this the overflow
    // would draw over the rest of the screen instead of being cropped.
    view.clipsToBounds = true
    metalLayer.framebufferOnly = true
    metalLayer.backgroundColor = UIColor.black.cgColor
    // The render surface is created ONCE, square, and its bounds are never touched
    // again. Everything about this is load-bearing; see layoutSurface for why.
    //
    // The scale has to be seeded here too: a fast source can reach VO init before
    // the first in-window layout (configure loads and starts the core before
    // presentation settles), and by then the swapchain is permanent. No window
    // exists yet, so the scene's screen stands in for it (the MPVKit demo uses
    // UIScreen.main, deprecated since the iOS 16 SDK).
    let scenes = UIApplication.shared.connectedScenes
    if let screen = scenes.compactMap({ ($0 as? UIWindowScene)?.screen }).first {
      let scale = screen.nativeScale
      let side = max(screen.nativeBounds.width, screen.nativeBounds.height)
      metalLayer.contentsScale = scale
      // Assigning bounds sets drawableSize to bounds x contentsScale, so these two
      // agree by construction and must only ever be set together, here.
      metalLayer.bounds = CGRect(x: 0, y: 0, width: side / scale, height: side / scale)
      metalLayer.drawableSize = CGSize(width: side, height: side)
      surfaceSidePt = side / scale
    }
    view.layer.addSublayer(metalLayer)
    layoutSurface()
    // Web chrome: the JS shell draws every control, so no button, bar, or
    // recognizer is ever built on this surface.
    guard !webChrome else { return }
    setupCloseButton()
    setupTransportOverlay()
    let tap = UITapGestureRecognizer(target: self, action: #selector(surfaceTapped(_:)))
    // Without this the recognizer cancels the close button's own touch handling.
    tap.cancelsTouchesInView = false
    view.addGestureRecognizer(tap)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    layoutSurface()
  }

  /// Places the fixed-size render surface so the picture inside it lands exactly
  /// where it belongs, in any orientation.
  ///
  /// The swapchain is fixed at VO init and MoltenVK never resizes it (MPVKit issue
  /// #3), but a CAMetalLayer's drawableSize DOES follow its bounds. When the two
  /// disagree MoltenVK crops from the origin rather than scaling, and
  /// contentsGravity has no effect on a Metal layer, so it cannot rescue this.
  /// Measured on device: `metalLayer.frame = view.bounds` in layout left portrait
  /// showing the left 1179px of a 2556px-wide picture, and landscape showing the
  /// picture from the stale swapchain's 559px letterbox offset down. Both matched
  /// the crop prediction to the pixel.
  ///
  /// So bounds are set once, square, and only `position` and `transform` move -
  /// neither of which feeds back into drawableSize. Square makes the geometry
  /// aspect-independent: mpv letterboxes the picture inside the square, so scaling
  /// the square uniformly reproduces the picture at its true aspect at any size.
  /// Solving "the letterboxed picture exactly fills the view" for the square's
  /// on-screen side gives the scale below. The cost is the black letterbox padding
  /// inside the square being rendered and then clipped, against a black view.
  private func layoutSurface() {
    guard surfaceSidePt > 0 else { return }
    let w = view.bounds.width
    let h = view.bounds.height
    guard w > 0, h > 0 else { return }
    let decoded = decodedSize
    // 16:9 until the decoder reports otherwise; the dwidth/dheight observer runs
    // this again once it does.
    let aspect =
      decoded.width > 0 && decoded.height > 0 ? decoded.width / decoded.height : 16.0 / 9.0
    // Fit takes the smaller solution, fill the larger; the overflow is clipped by
    // the view, which is why it must clip.
    let bound = zoomFill ? max(w, aspect * h) : min(w, aspect * h)
    let side = bound / min(1.0, aspect)
    let k = side / surfaceSidePt
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    metalLayer.position = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
    metalLayer.transform = CATransform3DMakeScale(k, k, 1)
    CATransaction.commit()
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
    loadGeneration += 1
    let generation = loadGeneration
    // Mirror the generation onto the event queue: events drained before this
    // lands carry the previous value and their main hops drop themselves,
    // without any cross-thread read of main-queue state.
    eventQueue.async { [weak self] in self?.drainGeneration = generation }
    closedReported = false
    lastStatus = nil
    fileLoaded = false
    currentTitle = args.title
    // configure can run either side of viewDidLoad, and it runs again for every
    // episode on an auto-advance, so the overlay title is refreshed here rather
    // than only where the label is built.
    applyTitle()
    pendingSubtitles = args.subtitles
    lastSeekTargetSec = nil
    cachedPosition = 0
    cachedDuration = 0
    cachedBuffered = 0
    cachedPaused = false
    cachedPausedForCache = false
    cachedEofReached = false
    lastAudioTracks = []
    lastSubtitleTracks = []
    isScrubbing = false
    emitState("loading")

    ensureMpv()
    guard mpv != nil, !shuttingDown else {
      emitState("error", "ERROR_CODE_UNSPECIFIED")
      return
    }

    applyHeaders(args.headers)
    // The raw string goes to mpv, which does its own URL handling; Foundation's
    // stricter grammar must not reject what Android plays.
    var commandArgs = [args.url, "replace", "-1"]
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
    updateNowPlaying(force: true)
  }

  func doPlay() {
    // Revive from the keep-open end screen: the playhead is parked on the last
    // frame, so unpausing alone would hit EOF again immediately. Seeking back
    // plus pause=no is the documented resume (options.rst 0.41 keep-open and
    // keep-open-pause).
    if cachedEofReached { doSeek(0) }
    setFlag("pause", false)
  }

  func doPause() { setFlag("pause", true) }

  func doSeek(_ sec: Double) {
    lastSeekTargetSec = sec
    runCommand("seek", [String(format: "%.3f", sec), "absolute"])
    // time-pos lands asynchronously; the lock screen gets the target now
    // rather than the stale playhead for the next heartbeat.
    updateNowPlaying(force: true, position: sec)
  }

  func doStop() {
    reportClosed()
    teardown()
    // A child-hosted surface is unwound by the plugin; only a modal has a
    // presentation to dismiss.
    if presentingViewController != nil { dismiss(animated: true) }
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
    // keep-open holds the last file open and paused at EOF instead of
    // unloading it (options.rst 0.41), so the end screen stays seekable;
    // normal completion is then signaled by the eof-reached property, not
    // MPV_EVENT_END_FILE, which only fires when a file is unloaded (client.h).
    mpv_set_option_string(handle, "keep-open", "yes")
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
    mpv_observe_property(handle, 0, "eof-reached", MPV_FORMAT_FLAG)
    mpv_observe_property(handle, 0, "track-list", MPV_FORMAT_NONE)
    // Not for display: the surface geometry depends on the decoded aspect, which
    // is unknown until the first frame. See layoutSurface.
    mpv_observe_property(handle, 0, "dwidth", MPV_FORMAT_NONE)
    mpv_observe_property(handle, 0, "dheight", MPV_FORMAT_NONE)

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
    autoHideTimer?.invalidate()
    autoHideTimer = nil
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
      let generation = drainGeneration
      DispatchQueue.main.async { self.handleFileLoaded(generation: generation) }
    case MPV_EVENT_END_FILE:
      guard let data = event.data else { return }
      let end = data.assumingMemoryBound(to: mpv_event_end_file.self).pointee
      let reason = end.reason
      let mpvError = end.error
      let generation = drainGeneration
      DispatchQueue.main.async {
        self.handleEndFile(reason: reason, mpvError: mpvError, generation: generation)
      }
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
    if name == "dwidth" || name == "dheight" {
      DispatchQueue.main.async { self.view.setNeedsLayout() }
      return
    }
    // Values are copied here because the event data dies at the next
    // mpv_wait_event call; format is MPV_FORMAT_NONE when unavailable.
    var doubleValue: Double?
    var flagValue: Bool?
    if property.format == MPV_FORMAT_DOUBLE, let data = property.data {
      doubleValue = data.assumingMemoryBound(to: Double.self).pointee
    } else if property.format == MPV_FORMAT_FLAG, let data = property.data {
      flagValue = data.assumingMemoryBound(to: CInt.self).pointee != 0
    }
    let generation = drainGeneration
    DispatchQueue.main.async {
      self.applyPropertyChange(name, double: doubleValue, flag: flagValue, generation: generation)
    }
  }

  // MARK: - Event handling (main queue)

  private func applyPropertyChange(_ name: String, double: Double?, flag: Bool?, generation: Int) {
    guard !shuttingDown, generation == loadGeneration else { return }
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
    case "eof-reached":
      guard let value = flag else { return }
      let wasEof = cachedEofReached
      cachedEofReached = value
      guard fileLoaded else { return }
      if value {
        emitEofOutcome()
      } else if wasEof {
        // Seeking off the end screen resumes the session; media3 reports
        // READY again after a post-ended seek, and JS needs the flip to
        // leave the end screen.
        emitState("ready")
      }
    case "track-list":
      // Covers late-appearing tracks and selection changes from any source.
      if fileLoaded { emitTracks() }
    default:
      break
    }
  }

  private func handleFileLoaded(generation: Int) {
    guard !shuttingDown, mpv != nil, generation == loadGeneration else { return }
    fileLoaded = true
    addSidecarSubtitles()
    emitState("ready")
    emitTracks()
    updateNowPlaying(force: true)
    guard !webChrome else { return }
    // The overlay controls were inert until now; enable them and start the
    // idle-hide clock so the chrome fades once playback is underway.
    setTransportEnabled(true)
    armAutoHide()
  }

  private func handleEndFile(reason: mpv_end_file_reason, mpvError: Int32, generation: Int) {
    guard !shuttingDown, generation == loadGeneration else { return }
    fileLoaded = false
    switch reason {
    case MPV_END_FILE_REASON_EOF:
      // keep-open holds a normal finish open, so this reason survives only in
      // the corner cases where mpv unloads the file anyway (options.rst: "if
      // errors or unusual circumstances happen"); classify it like eof-reached.
      emitEofOutcome()
    case MPV_END_FILE_REASON_ERROR:
      emitState("error", media3ErrorCode(mpvError))
    default:
      // STOP and QUIT come from our own swap or teardown; REDIRECT is playlist
      // bookkeeping. None of them is a JS-visible state change.
      break
    }
  }

  // Shared by the eof-reached observer and the residual END_FILE EOF path.
  // client.h: EOF "may also happen on incomplete or corrupted files, or if the
  // network connection was interrupted", so a playhead well short of a known
  // duration reports an error. The exception is a user seek into the final
  // stretch, where a keyframe landing plus demuxer EOF is a legitimate finish.
  private func emitEofOutcome() {
    let shortfall = cachedDuration > 0 && cachedPosition < cachedDuration - 10
    let seekedNearEnd = lastSeekTargetSec.map { $0 >= cachedDuration - 15 } ?? false
    if shortfall && !seekedNearEnd {
      emitState("error", "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED")
    } else {
      emitState("ended")
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
    var selectFirst = !hasSelectedSubtitle()
    var batch: [[String]] = []
    for subtitle in pendingSubtitles {
      guard !subtitle.url.isEmpty else { continue }
      var args = [subtitle.url, selectFirst ? "select" : "auto"]
      if let title = subtitle.label ?? subtitle.lang {
        args.append(title)
        if let lang = subtitle.lang { args.append(lang) }
      }
      batch.append(args)
      selectFirst = false
    }
    runSubtitleBatch(batch)
  }

  // Sequential synchronous sub-adds on the event queue: tracks appear in
  // payload order like Android (an async batch completes in arbitrary order)
  // while a slow subtitle host still never blocks the main thread. Commands
  // off the main queue are fine, the client API serializes everything through
  // one lock (client.h Multithreading). A sync sub-add parks only its calling
  // thread: the caller blocks "even if the core continues playback" (input.rst
  // Synchronous vs. Asynchronous), and the command runs on an mpv worker that
  // unlocks the core around the network open (mp_add_external_file), so
  // main-queue client calls never wait out a slow fetch; the stall is confined
  // to event draining on this queue. A failed add is logged and the track
  // simply never appears. The handle can only die on this same serial queue
  // (SHUTDOWN), so it cannot be destroyed mid-batch.
  private func runSubtitleBatch(_ batch: [[String]]) {
    guard !batch.isEmpty else { return }
    let generation = loadGeneration
    eventQueue.async { [weak self] in
      guard let self = self, !self.eventLoopEnded, self.drainGeneration == generation,
        let handle = self.mpv
      else { return }
      for args in batch {
        let status = self.withCommandArgv("sub-add", args) { argv in mpv_command(handle, argv) }
        if status < 0 {
          NSLog(
            "%@",
            "[harbor-player] mpv sub-add failed: \(String(cString: mpv_error_string(status)))")
        }
      }
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
    // keep-open parks the playhead on the last frame, which can sit a hair off
    // the reported duration; media3 reports position == duration at ENDED, so
    // clamp for parity while the end screen is up.
    let position = cachedEofReached && cachedDuration > 0 ? cachedDuration : cachedPosition
    onTick?(position, cachedDuration, cachedBuffered, isPlayingNow, currentRate)
    updateNowPlaying()
    if !webChrome { updateTransport(position: position) }
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
    // Cache before emitting so the overlay's track picker reflects the same
    // lists (including selection) the JS bridge just received.
    lastAudioTracks = audio
    lastSubtitleTracks = subtitle
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

  private func updateNowPlaying(force: Bool = false, position: Double? = nil) {
    nowPlaying.update(
      title: currentTitle,
      positionSec: position ?? cachedPosition,
      durationSec: cachedDuration > 0 ? cachedDuration : nil,
      playing: isPlayingNow, rate: currentRate, force: force)
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

    // The title was already carried in the load args and stored, but nothing
    // ever drew it, so this surface showed a runtime and an X and nothing that
    // said what was playing. AVKit's Done bar names the title for the other
    // engine; this one has to name its own. Shadowed rather than plated so it
    // stays legible over a bright frame without another floating chip.
    titleLabel.textColor = .white
    titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    titleLabel.lineBreakMode = .byTruncatingTail
    titleLabel.layer.shadowColor = UIColor.black.cgColor
    titleLabel.layer.shadowOpacity = 0.6
    titleLabel.layer.shadowRadius = 8
    titleLabel.layer.shadowOffset = .zero
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(titleLabel)
    applyTitle()
    NSLayoutConstraint.activate([
      titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
      titleLabel.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 14),
      // Stop short of the trailing edge so a long name never collides with a
      // system indicator or reaches under the notch in landscape.
      titleLabel.trailingAnchor.constraint(
        lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
    ])
  }

  private func applyTitle() {
    let name = currentTitle ?? ""
    titleLabel.text = name
    titleLabel.isHidden = name.isEmpty
  }

  @objc private func closeTapped() {
    doStop()
  }

  // A bare-surface tap now toggles the chrome (close button + transport bar)
  // instead of toggling pause; the dedicated play/pause button owns pause. The
  // guards keep taps that land on a control from also flipping chrome, and let
  // any tap re-summon chrome once it has auto-hidden.
  @objc private func surfaceTapped(_ recognizer: UITapGestureRecognizer) {
    guard fileLoaded else { return }
    if chromeVisible {
      let location = recognizer.location(in: view)
      if closeButton.frame.contains(location) || transportBar.frame.contains(location) { return }
      setChromeVisible(false, animated: true)
    } else {
      setChromeVisible(true, animated: true)
    }
  }

  // MARK: - Transport overlay

  private func setupTransportOverlay() {
    // Matches the close button's translucent-black, white-symbol styling so the
    // two read as one chrome set.
    transportBar.backgroundColor = UIColor(white: 0, alpha: 0.4)
    transportBar.layer.cornerRadius = 16
    transportBar.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(transportBar)

    playPauseButton.setImage(UIImage(systemName: "play.fill"), for: .normal)
    playPauseButton.tintColor = .white
    playPauseButton.translatesAutoresizingMaskIntoConstraints = false
    playPauseButton.addTarget(self, action: #selector(playPauseTapped), for: .touchUpInside)

    currentTimeLabel.text = "0:00"
    currentTimeLabel.textColor = .white
    currentTimeLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .regular)
    currentTimeLabel.translatesAutoresizingMaskIntoConstraints = false

    durationLabel.text = "0:00"
    durationLabel.textColor = .white
    durationLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .regular)
    durationLabel.translatesAutoresizingMaskIntoConstraints = false

    seekSlider.minimumValue = 0
    seekSlider.maximumValue = 1
    seekSlider.value = 0
    seekSlider.minimumTrackTintColor = .white
    // Without this the unplayed side keeps iOS's default tint, which over a dark
    // frame is invisible: the scrubber reads as a stub ending at the thumb and
    // gives no sense of how far the film runs or where a drag can go. Matches the
    // 22% white the web shell uses for the same track.
    seekSlider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.22)
    // Continuous so valueChanged fires during the drag for live label feedback;
    // the actual seek waits for touch-up (see seekTouchUp).
    seekSlider.isContinuous = true
    seekSlider.translatesAutoresizingMaskIntoConstraints = false
    seekSlider.addTarget(self, action: #selector(seekTouchDown), for: .touchDown)
    seekSlider.addTarget(self, action: #selector(seekChanged), for: .valueChanged)
    seekSlider.addTarget(
      self, action: #selector(seekTouchUp), for: [.touchUpInside, .touchUpOutside])

    tracksButton.setImage(UIImage(systemName: "captions.bubble"), for: .normal)
    tracksButton.tintColor = .white
    tracksButton.translatesAutoresizingMaskIntoConstraints = false

    nextButton.setImage(UIImage(systemName: "forward.end.fill"), for: .normal)
    nextButton.tintColor = .white
    nextButton.translatesAutoresizingMaskIntoConstraints = false
    nextButton.isHidden = !canNext
    nextButton.accessibilityLabel = "Next episode"
    nextButton.addTarget(self, action: #selector(nextTapped), for: .touchUpInside)
    tracksButton.addTarget(self, action: #selector(tracksTapped), for: .touchUpInside)

    let stack = UIStackView(arrangedSubviews: [
      playPauseButton, currentTimeLabel, seekSlider, durationLabel, nextButton, tracksButton,
    ])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    transportBar.addSubview(stack)

    NSLayoutConstraint.activate([
      transportBar.leadingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
      transportBar.trailingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
      transportBar.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
      transportBar.heightAnchor.constraint(equalToConstant: 56),
      stack.leadingAnchor.constraint(equalTo: transportBar.leadingAnchor, constant: 14),
      stack.trailingAnchor.constraint(equalTo: transportBar.trailingAnchor, constant: -14),
      stack.centerYAnchor.constraint(equalTo: transportBar.centerYAnchor),
      playPauseButton.widthAnchor.constraint(equalToConstant: 32),
      tracksButton.widthAnchor.constraint(equalToConstant: 32),
      nextButton.widthAnchor.constraint(equalToConstant: 32),
    ])

    // The slider takes the slack; the time labels hug their text so digits never
    // get clipped or stretched.
    seekSlider.setContentHuggingPriority(.defaultLow, for: .horizontal)
    currentTimeLabel.setContentHuggingPriority(.required, for: .horizontal)
    durationLabel.setContentHuggingPriority(.required, for: .horizontal)
    currentTimeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
    durationLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

    // Inert until a file is loaded (handleFileLoaded flips this on).
    setTransportEnabled(false)
  }

  private func setTransportEnabled(_ enabled: Bool) {
    playPauseButton.isEnabled = enabled
    seekSlider.isEnabled = enabled
    tracksButton.isEnabled = enabled
  }

  // Alpha-fades the close button and transport bar together and keeps their hit
  // testing in step, so a hidden bar cannot swallow the tap meant to re-show it.
  private func setChromeVisible(_ visible: Bool, animated: Bool) {
    chromeVisible = visible
    closeButton.isUserInteractionEnabled = visible
    transportBar.isUserInteractionEnabled = visible
    let apply = {
      self.closeButton.alpha = visible ? 1 : 0
      self.titleLabel.alpha = visible ? 1 : 0
      self.transportBar.alpha = visible ? 1 : 0
    }
    if animated {
      UIView.animate(withDuration: 0.25, animations: apply)
    } else {
      apply()
    }
    if visible {
      armAutoHide()
    } else {
      autoHideTimer?.invalidate()
      autoHideTimer = nil
    }
  }

  // Re-arms the idle timer; scrubbing and open sheets invalidate it instead so
  // the chrome never vanishes mid-interaction.
  private func armAutoHide() {
    autoHideTimer?.invalidate()
    guard fileLoaded, chromeVisible, !webChrome else { return }
    let timer = Timer(timeInterval: 3.0, repeats: false) { [weak self] _ in
      self?.setChromeVisible(false, animated: true)
    }
    RunLoop.main.add(timer, forMode: .common)
    autoHideTimer = timer
  }

  // Driven by tick (500 ms) whenever the user is not scrubbing.
  private func updateTransport(position: Double) {
    guard !shuttingDown else { return }
    if !isScrubbing {
      if cachedDuration > 0 {
        seekSlider.maximumValue = Float(cachedDuration)
        seekSlider.value = Float(position)
      } else {
        seekSlider.maximumValue = 1
        seekSlider.value = 0
      }
      currentTimeLabel.text = formatTime(position)
    }
    durationLabel.text = formatTime(cachedDuration)
    playPauseButton.setImage(
      UIImage(systemName: isPlayingNow ? "pause.fill" : "play.fill"), for: .normal)
  }

  private func formatTime(_ seconds: Double) -> String {
    guard seconds.isFinite, seconds > 0 else { return "0:00" }
    let total = Int(seconds.rounded())
    let secs = total % 60
    let mins = (total / 60) % 60
    let hours = total / 3600
    if hours > 0 { return String(format: "%d:%02d:%02d", hours, mins, secs) }
    return String(format: "%d:%02d", mins, secs)
  }

  // Mirrors the old surface-tap pause toggle (cachedPaused ? play : pause).
  @objc private func playPauseTapped() {
    guard !shuttingDown, fileLoaded else { return }
    if cachedPaused { doPlay() } else { doPause() }
    armAutoHide()
  }

  @objc private func seekTouchDown() {
    isScrubbing = true
    // Keep chrome up for the whole drag.
    autoHideTimer?.invalidate()
    autoHideTimer = nil
  }

  @objc private func seekChanged() {
    // Live label feedback only; the seek itself is deferred to release so mpv is
    // not flooded with absolute seeks mid-drag.
    currentTimeLabel.text = formatTime(Double(seekSlider.value))
  }

  @objc private func seekTouchUp() {
    guard isScrubbing else { return }
    isScrubbing = false
    if !shuttingDown, fileLoaded { doSeek(Double(seekSlider.value)) }
    armAutoHide()
  }

  // A container that titles every audio stream the same way ("5.1 DD" on a MULTi
  // release) renders as several identical rows with nothing to choose between
  // them. The language is already on the entry, so append it whenever it adds
  // something the title does not already say.
  private func trackDisplayName(_ track: NativeTrackEntry) -> String {
    let lang = track.lang.trimmingCharacters(in: .whitespaces)
    guard !lang.isEmpty, !track.label.localizedCaseInsensitiveContains(lang) else {
      return track.label
    }
    return "\(track.label) \u{00B7} \(lang)"
  }

  @objc private func nextTapped() {
    guard !shuttingDown, fileLoaded else { return }
    armAutoHide()
    onNextEpisode?()
  }

  @objc private func tracksTapped() {
    guard !shuttingDown, fileLoaded else { return }
    // Hold the chrome open while the sheet is up; re-arm from each handler.
    autoHideTimer?.invalidate()
    autoHideTimer = nil
    let sheet = UIAlertController(title: "Tracks", message: nil, preferredStyle: .actionSheet)
    // The sheet sits on top of a playing film, so it takes the player's context
    // rather than the system's: on a phone set to light mode the default is a
    // white slab over the picture. Scoped to this sheet on purpose, since the
    // rest of the app should still follow whatever the user set.
    sheet.overrideUserInterfaceStyle = .dark
    for track in lastAudioTracks {
      let mark = track.selected ? "\u{2713} " : ""
      sheet.addAction(
        UIAlertAction(title: "\(mark)Audio: \(trackDisplayName(track))", style: .default) { [weak self] _ in
          self?.doSetAudioTrack(track.id)
          self?.armAutoHide()
        })
    }
    for track in lastSubtitleTracks {
      let mark = track.selected ? "\u{2713} " : ""
      sheet.addAction(
        UIAlertAction(title: "\(mark)Subtitle: \(trackDisplayName(track))", style: .default) { [weak self] _ in
          self?.doSetSubtitleTrack(track.id)
          self?.armAutoHide()
        })
    }
    // "Off" is checked when no subtitle track is selected; picking it passes nil,
    // which doSetSubtitleTrack maps to sid=no.
    let subsOff = !lastSubtitleTracks.contains { $0.selected }
    sheet.addAction(
      UIAlertAction(title: "\(subsOff ? "\u{2713} " : "")Subtitles Off", style: .default) {
        [weak self] _ in
        self?.doSetSubtitleTrack(nil)
        self?.armAutoHide()
      })
    sheet.addAction(
      UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in self?.armAutoHide() })
    // Required on iPad or .actionSheet presentation traps; anchor to the button.
    if let popover = sheet.popoverPresentationController {
      popover.sourceView = tracksButton
      popover.sourceRect = tracksButton.bounds
    }
    present(sheet, animated: true)
  }

  // MARK: - Client API helpers (main queue; withCommandArgv itself is queue-agnostic)

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

  // Internal, not private: the command extension in
  // HarborMpvViewController+Commands.swift drives mpv through these two.
  func setString(_ name: String, _ value: String) {
    guard let handle = mpv, !shuttingDown else { return }
    mpv_set_property_string(handle, name, value)
  }

  func setDouble(_ name: String, _ value: Double) {
    guard let handle = mpv, !shuttingDown else { return }
    var number = value
    mpv_set_property(handle, name, MPV_FORMAT_DOUBLE, &number)
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

  // dwidth/dheight rather than width/height: those are the dimensions AFTER decode
  // and any filters, which is what the viewer is actually being shown, and a quality
  // badge that reports anything else is repeating the release name back at them.
  // Zero before the first frame, which the shell reads as "do not claim a quality".
  //
  // Lives here rather than in the +Commands extension because getInt64 is private to
  // this file.
  var decodedSize: CGSize {
    guard let w = getInt64("dwidth"), let h = getInt64("dheight"), w > 0, h > 0 else {
      return .zero
    }
    return CGSize(width: Int(w), height: Int(h))
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
