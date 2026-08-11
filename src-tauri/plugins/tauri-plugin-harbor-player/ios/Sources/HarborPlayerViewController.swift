/// Fullscreen player surface, the iOS analogue of Android's PlayerActivity.
/// AVPlayerViewController supplies the transport UI and Picture in Picture.
///
/// CODEC-PARITY WARNING: AVFoundation only decodes MP4/MOV/HLS with H.264/HEVC/AAC
/// (plus AV1 on A17+). Most torrent releases are MKV/HEVC/AC3 with sidecar SRT/ASS,
/// which AVPlayer cannot open. True parity with the Android media3 path and the
/// desktop libmpv path needs an MPVKit engine swap. The engine surface is deliberately
/// confined to configure/doPlay/doPause/doSeek/doStop/doSetAudioTrack/
/// doSetSubtitleTrack/enterPip/teardown so that swap stays surgical.
import AVFoundation
import AVKit
import MediaPlayer
import UIKit

struct NativeTrackEntry {
  let id: String
  let lang: String
  let label: String
  let selected: Bool
}

final class HarborPlayerViewController: AVPlayerViewController, AVPlayerViewControllerDelegate {
  var onTick: ((Double, Double, Double, Bool) -> Void)?
  var onState: ((String, String?) -> Void)?
  var onClosed: ((Double, Double) -> Void)?
  var onTracks: (([NativeTrackEntry], [NativeTrackEntry]) -> Void)?

  private var tickTimer: Timer?
  private var itemStatusObs: NSKeyValueObservation?
  private var timeControlObs: NSKeyValueObservation?
  private var endToken: NSObjectProtocol?
  private var failToken: NSObjectProtocol?
  private var stallToken: NSObjectProtocol?
  private var remoteCommandTokens: [(MPRemoteCommand, Any)] = []
  private var closedReported = false
  private var lastStatus: String?
  private var currentTitle: String?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    allowsPictureInPicturePlayback = true
    delegate = self
    if #available(iOS 14.2, *) {
      canStartPictureInPictureAutomaticallyFromInline = true
    }
  }

  /// Loads a stream. Called for the first load and for every subsequent load while the
  /// controller is still presented; the latter swaps the AVPlayerItem in place with no
  /// "closed" event, mirroring the Android singleTask onNewIntent path.
  func configure(_ args: LoadArgs) {
    closedReported = false
    lastStatus = nil
    currentTitle = args.title
    activateAudioSession()
    detachObservers()

    guard let url = URL(string: args.url) else {
      onState?("error", "SOURCE_URL_INVALID")
      return
    }

    var options: [String: Any] = [:]
    if !args.headers.isEmpty {
      // Undocumented but long-stable key; applies the debrid headers to every HTTP
      // request the asset makes. Fine for the sideloaded build; App Store review
      // would need an AVAssetResourceLoaderDelegate instead.
      options["AVURLAssetHTTPHeaderFieldsKey"] = args.headers
    }
    let asset = AVURLAsset(url: url, options: options)

    // args.subtitles is accepted for wire parity but unused: AVFoundation cannot
    // attach sidecar SRT/ASS to a progressive asset. The MPVKit swap covers it.
    let item = AVPlayerItem(asset: asset)
    if args.startAtSec > 0 {
      // Resume position is part of the load itself, before playback starts.
      item.seek(to: CMTime(seconds: args.startAtSec, preferredTimescale: 1000), completionHandler: nil)
    }

    if let existing = player {
      existing.replaceCurrentItem(with: item)
    } else {
      let p = AVPlayer(playerItem: item)
      p.automaticallyWaitsToMinimizeStalling = true
      player = p
    }

    attachObservers(item: item)
    registerRemoteCommands()
    player?.play()
    startTicking()
    updateNowPlaying()
  }

  func doPlay() { player?.play() }
  func doPause() { player?.pause() }

  func doSeek(_ sec: Double) {
    player?.seek(to: CMTime(seconds: sec, preferredTimescale: 1000))
  }

  func doStop() {
    reportClosed()
    teardown()
    dismiss(animated: true)
  }

  func doSetAudioTrack(_ id: String?) {
    guard let id = id,
      let item = player?.currentItem,
      let group = item.asset.mediaSelectionGroup(forMediaCharacteristic: .audible),
      let option = option(for: id, prefix: "a", in: group)
    else { return }
    item.select(option, in: group)
    emitTracks()
  }

  func doSetSubtitleTrack(_ id: String?) {
    guard let item = player?.currentItem,
      let group = item.asset.mediaSelectionGroup(forMediaCharacteristic: .legible)
    else { return }
    if let id = id {
      guard let option = option(for: id, prefix: "s", in: group) else { return }
      item.select(option, in: group)
    } else {
      item.select(nil, in: group)
    }
    emitTracks()
  }

  // AVPlayerViewController has no public programmatic PiP start; the transport PiP
  // button and the automatic fullscreen-to-PiP on background cover Android's
  // enterPip use cases, so this is a documented best-effort no-op.
  func enterPip() {
    NSLog("[harbor-player] enterPip: no programmatic PiP start on the AVPlayer engine")
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    // User dismissal (AVKit's Done button, swipe down). Backgrounding does not land
    // here and entering PiP keeps the controller presented, so neither emits closed.
    if isBeingDismissed {
      reportClosed()
      teardown()
    }
  }

  private func reportClosed() {
    guard !closedReported, let item = player?.currentItem else { return }
    closedReported = true
    let rawPos = item.currentTime().seconds
    let rawDur = item.duration
    let dur = rawDur.isNumeric && rawDur.seconds > 0 ? rawDur.seconds : 0
    onClosed?(rawPos.isFinite ? rawPos : 0, dur)
  }

  private func teardown() {
    tickTimer?.invalidate()
    tickTimer = nil
    detachObservers()
    unregisterRemoteCommands()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    player?.pause()
    player = nil
    deactivateAudioSession()
  }

  private func activateAudioSession() {
    do {
      // .playback keeps audio alive with the screen locked or the app backgrounded
      // and is required for PiP; pairs with UIBackgroundModes audio in
      // src-tauri/Info.ios.plist.
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      NSLog("[harbor-player] audio session activation failed: \(error)")
    }
  }

  private func deactivateAudioSession() {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      NSLog("[harbor-player] audio session deactivation failed: \(error)")
    }
  }

  private func attachObservers(item: AVPlayerItem) {
    itemStatusObs = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
      DispatchQueue.main.async {
        guard let self = self else { return }
        switch observed.status {
        case .readyToPlay:
          self.emitState("ready")
          self.emitTracks()
          self.updateNowPlaying()
        case .failed:
          self.emitState("error", self.media3ErrorCode(observed.error))
        default:
          self.emitState("loading")
        }
      }
    }
    if let p = player {
      timeControlObs = p.observe(\.timeControlStatus, options: [.new]) { [weak self] observed, _ in
        DispatchQueue.main.async {
          guard let self = self else { return }
          switch observed.timeControlStatus {
          case .waitingToPlayAtSpecifiedRate:
            self.emitState("loading")
          case .playing:
            // Stall recovery: media3 goes back to STATE_READY when buffering ends.
            self.emitState("ready")
          default:
            break
          }
        }
      }
    }
    let nc = NotificationCenter.default
    endToken = nc.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
    ) { [weak self] _ in
      self?.emitState("ended")
    }
    failToken = nc.addObserver(
      forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main
    ) { [weak self] note in
      guard let self = self else { return }
      let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError
      self.emitState("error", self.media3ErrorCode(error))
    }
    stallToken = nc.addObserver(
      forName: .AVPlayerItemPlaybackStalled, object: item, queue: .main
    ) { [weak self] _ in
      self?.emitState("loading")
    }
  }

  private func detachObservers() {
    itemStatusObs?.invalidate()
    itemStatusObs = nil
    timeControlObs?.invalidate()
    timeControlObs = nil
    let nc = NotificationCenter.default
    if let t = endToken { nc.removeObserver(t); endToken = nil }
    if let t = failToken { nc.removeObserver(t); failToken = nil }
    if let t = stallToken { nc.removeObserver(t); stallToken = nil }
  }

  // Errors keep the exact status string; other statuses drop consecutive repeats,
  // matching media3's change-only onPlaybackStateChanged cadence.
  private func emitState(_ status: String, _ code: String? = nil) {
    if status != "error" && status == lastStatus { return }
    lastStatus = status
    onState?(status, code)
  }

  private func startTicking() {
    tickTimer?.invalidate()
    // Wall-clock timer in .common mode so it keeps firing while paused, buffering,
    // and during UI tracking; addPeriodicTimeObserver starves when playback time is
    // not advancing, which would freeze the JS snapshot in "playing".
    let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
    RunLoop.main.add(timer, forMode: .common)
    tickTimer = timer
  }

  private func tick() {
    guard let p = player else { return }
    var pos = 0.0
    var dur = 0.0
    var buf = 0.0
    if let item = p.currentItem {
      let rawPos = item.currentTime().seconds
      pos = rawPos.isFinite ? rawPos : 0
      let rawDur = item.duration
      if rawDur.isNumeric && rawDur.seconds > 0 { dur = rawDur.seconds }
      buf = bufferedEnd(of: item, position: pos)
    }
    onTick?(pos, dur, buf, p.timeControlStatus == .playing)
    updateNowPlaying()
  }

  // Contiguous buffered end ahead of the playhead, the AVFoundation analogue of
  // ExoPlayer's bufferedPosition.
  private func bufferedEnd(of item: AVPlayerItem, position: Double) -> Double {
    for value in item.loadedTimeRanges {
      let range = value.timeRangeValue
      let start = range.start.seconds
      let end = CMTimeRangeGetEnd(range).seconds
      guard start.isFinite && end.isFinite else { continue }
      if position >= start - 0.5 && position <= end { return end }
    }
    return position
  }

  private func emitTracks() {
    guard let item = player?.currentItem else { return }
    onTracks?(
      trackEntries(for: item, characteristic: .audible, prefix: "a"),
      trackEntries(for: item, characteristic: .legible, prefix: "s")
    )
  }

  private func trackEntries(
    for item: AVPlayerItem, characteristic: AVMediaCharacteristic, prefix: String
  ) -> [NativeTrackEntry] {
    guard let group = item.asset.mediaSelectionGroup(forMediaCharacteristic: characteristic)
    else { return [] }
    let selected = item.currentMediaSelection.selectedMediaOption(in: group)
    return group.options.enumerated().map { index, option in
      let lang = option.extendedLanguageTag ?? ""
      let display = option.displayName
      let label = !display.isEmpty ? display : (!lang.isEmpty ? lang : "Track \(index + 1)")
      return NativeTrackEntry(
        id: "\(prefix)/\(index)", lang: lang, label: label, selected: option == selected)
    }
  }

  private func option(
    for id: String, prefix: String, in group: AVMediaSelectionGroup
  ) -> AVMediaSelectionOption? {
    let parts = id.components(separatedBy: "/")
    guard parts.count == 2, parts[0] == prefix, let index = Int(parts[1]) else { return nil }
    guard index >= 0 && index < group.options.count else { return nil }
    return group.options[index]
  }

  private func registerRemoteCommands() {
    guard remoteCommandTokens.isEmpty else { return }
    let center = MPRemoteCommandCenter.shared()
    func add(
      _ command: MPRemoteCommand,
      _ handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
      remoteCommandTokens.append((command, command.addTarget(handler: handler)))
    }
    add(center.playCommand) { [weak self] _ in
      guard let self = self, self.player != nil else { return .commandFailed }
      self.doPlay()
      return .success
    }
    add(center.pauseCommand) { [weak self] _ in
      guard let self = self, self.player != nil else { return .commandFailed }
      self.doPause()
      return .success
    }
    add(center.togglePlayPauseCommand) { [weak self] _ in
      guard let self = self, let p = self.player else { return .commandFailed }
      if p.timeControlStatus == .playing { self.doPause() } else { self.doPlay() }
      return .success
    }
    add(center.changePlaybackPositionCommand) { [weak self] event in
      guard let self = self, self.player != nil,
        let e = event as? MPChangePlaybackPositionCommandEvent
      else { return .commandFailed }
      self.doSeek(e.positionTime)
      return .success
    }
  }

  private func unregisterRemoteCommands() {
    for (command, token) in remoteCommandTokens { command.removeTarget(token) }
    remoteCommandTokens.removeAll()
  }

  private func updateNowPlaying() {
    var info: [String: Any] = [:]
    if let title = currentTitle { info[MPMediaItemPropertyTitle] = title }
    if let item = player?.currentItem {
      let rawDur = item.duration
      if rawDur.isNumeric && rawDur.seconds > 0 {
        info[MPMediaItemPropertyPlaybackDuration] = rawDur.seconds
      }
      let pos = item.currentTime().seconds
      if pos.isFinite { info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = pos }
    }
    info[MPNowPlayingInfoPropertyPlaybackRate] =
      player?.timeControlStatus == .playing ? 1.0 : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  // AVKit's default dismisses a fullscreen-presented controller the moment PiP
  // starts; that dismissal would land in viewDidDisappear's isBeingDismissed branch,
  // emit closed, and tear down the very player the PiP window is rendering. Keeping
  // the controller presented also means AVKit restores playback into it in place
  // when PiP ends, so the restore delegate callback is intentionally unimplemented.
  func playerViewControllerShouldAutomaticallyDismissAtPictureInPictureStart(
    _ playerViewController: AVPlayerViewController
  ) -> Bool {
    return false
  }

  // The JS bridge substring-matches error codes (IO/DECOD/PARSING), so raw NSError
  // domain strings are never emitted: "AVFoundationErrorDomain" contains "IO" and
  // would misclassify every AVFoundation error as a network failure.
  private func media3ErrorCode(_ error: Error?) -> String {
    var err = error.map { $0 as NSError }
    while let e = err {
      if e.domain == NSURLErrorDomain {
        return "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED"
      }
      if e.domain == AVFoundationErrorDomain {
        switch AVError.Code(rawValue: e.code) {
        case .decoderNotFound, .decoderTemporarilyUnavailable, .decodeFailed:
          return "ERROR_CODE_DECODING_FAILED"
        case .fileFormatNotRecognized, .failedToParse:
          return "ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED"
        default:
          break
        }
      }
      err = e.userInfo[NSUnderlyingErrorKey] as? NSError
    }
    return "ERROR_CODE_UNSPECIFIED"
  }
}
