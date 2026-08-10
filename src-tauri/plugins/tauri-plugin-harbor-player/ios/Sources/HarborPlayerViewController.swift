// UNVERIFIED SCAFFOLDING — never built on the Windows dev box; verify + iterate on the Mac.
//
/// Fullscreen player surface — the iOS analogue of Android's PlayerActivity.
/// Uses AVPlayerViewController for built-in transport UI + Picture in Picture.
///
/// CODEC-PARITY WARNING: AVFoundation only decodes MP4/MOV/HLS with H.264/HEVC/AAC
/// (+ AV1 on A17+). Most torrent releases are MKV/HEVC/AC3 with sidecar SRT/ASS,
/// which AVPlayer cannot open. For true parity with the Android media3 path and the
/// desktop libmpv path, replace this engine with MPVKit (libmpv,
/// github.com/mpvkit/MPVKit) or MobileVLCKit behind the same on*/do* interface.
/// This AVPlayer version proves the bridge + PiP + background-audio plumbing.
import AVFoundation
import AVKit
import UIKit

final class HarborPlayerViewController: AVPlayerViewController {
  var onTick: ((Double, Double, Double, Bool) -> Void)?
  var onState: ((String, String?) -> Void)?
  var onClosed: ((Double, Double) -> Void)?

  private var timeObserver: Any?
  private var itemStatusObs: NSKeyValueObservation?
  private var timeControlObs: NSKeyValueObservation?
  private var closedReported = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    allowsPictureInPicturePlayback = true
    if #available(iOS 14.2, *) {
      canStartPictureInPictureAutomaticallyFromInline = true
    }
    configureAudioSession()
  }

  private func configureAudioSession() {
    do {
      // .playback keeps audio alive with the screen locked / app backgrounded and
      // is required for PiP; needs UIBackgroundModes -> audio in Info.plist.
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      NSLog("[harbor-player] audio session error: \(error)")
    }
  }

  func configure(_ args: LoadArgs) {
    closedReported = false
    teardownObservers()

    guard let url = URL(string: args.url) else {
      onState?("error", "SOURCE_URL_INVALID")
      return
    }

    // HTTP header injection (debrid tokens). AVURLAssetHTTPHeaderFieldsKey is
    // undocumented; for App Store review replace with an
    // AVAssetResourceLoaderDelegate. Fine for the sideloaded/AltStore build.
    var options: [String: Any] = [:]
    if !args.headers.isEmpty {
      options["AVURLAssetHTTPHeaderFieldsKey"] = args.headers
    }
    let asset = AVURLAsset(url: url, options: options)

    // Sidecar subtitles (args.subtitles): AVFoundation cannot merge external
    // SRT/ASS into a progressive asset. TODO real support via HLS wrap or the
    // MPVKit engine; in-container tracks are exposed through the AVKit UI.
    let item = AVPlayerItem(asset: asset)
    let p = AVPlayer(playerItem: item)
    p.automaticallyWaitsToMinimizeStalling = true
    player = p

    if args.startAtSec > 0 {
      p.seek(to: CMTime(seconds: args.startAtSec, preferredTimescale: 1000))
    }

    observe(item: item, player: p)
    p.play()
    startTicking(p)
  }

  private func observe(item: AVPlayerItem, player p: AVPlayer) {
    itemStatusObs = item.observe(\.status, options: [.new]) { [weak self] it, _ in
      switch it.status {
      case .readyToPlay: self?.onState?("ready", nil)
      case .failed:
        let code = (it.error as NSError?).map { "\($0.domain):\($0.code)" } ?? "UNKNOWN"
        self?.onState?("error", code)
      default: self?.onState?("loading", nil)
      }
    }
    timeControlObs = p.observe(\.timeControlStatus, options: [.new]) { [weak self] pl, _ in
      if pl.timeControlStatus == .waitingToPlayAtSpecifiedRate {
        self?.onState?("loading", nil)
      }
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(didEnd),
      name: .AVPlayerItemDidPlayToEndTime, object: item)
  }

  @objc private func didEnd() { onState?("ended", nil) }

  private func startTicking(_ p: AVPlayer) {
    timeObserver = p.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 1000), queue: .main
    ) { [weak self, weak p] _ in
      guard let self = self, let p = p, let it = p.currentItem else { return }
      let pos = it.currentTime().seconds
      let dur = it.duration.isNumeric ? it.duration.seconds : 0
      let buf = it.loadedTimeRanges.first.map { CMTimeRangeGetEnd($0.timeRangeValue).seconds } ?? 0
      let playing = p.timeControlStatus == .playing
      self.onTick?(pos.isFinite ? pos : 0, dur.isFinite ? dur : 0, buf.isFinite ? buf : 0, playing)
    }
  }

  func doPlay() { player?.play() }
  func doPause() { player?.pause() }
  func doSeek(_ sec: Double) { player?.seek(to: CMTime(seconds: sec, preferredTimescale: 1000)) }
  func doStop() { reportClosed(); dismiss(animated: true) }

  // AVPlayerViewController PiP is normally user/auto initiated (PiP button +
  // canStartPictureInPictureAutomaticallyFromInline). A truly programmatic enter needs a
  // custom AVPictureInPictureController over an AVPlayerLayer — wire that on the Mac if the
  // JS-triggered enter_pip must force PiP; the auto-from-inline path already covers the
  // "leave app -> keep playing" case that Android's onUserLeaveHint handles.
  func enterPip() { /* see note above */ }

  private func reportClosed() {
    guard !closedReported, let it = player?.currentItem else { return }
    closedReported = true
    let pos = it.currentTime().seconds
    let dur = it.duration.isNumeric ? it.duration.seconds : 0
    onClosed?(pos.isFinite ? pos : 0, dur.isFinite ? dur : 0)
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if isBeingDismissed {
      reportClosed()
      teardownObservers()
      player?.pause()
      player = nil
    }
  }

  private func teardownObservers() {
    if let t = timeObserver { player?.removeTimeObserver(t); timeObserver = nil }
    itemStatusObs = nil
    timeControlObs = nil
    NotificationCenter.default.removeObserver(
      self, name: .AVPlayerItemDidPlayToEndTime, object: nil)
  }
}
