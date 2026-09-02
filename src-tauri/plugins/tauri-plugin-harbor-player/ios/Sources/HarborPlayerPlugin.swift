// Mirrors android/.../PlayerPlugin.kt: command names, event names, and payload keys
// match the Kotlin side exactly so the shared JS bridge (src/lib/player/android-native.ts)
// drives both platforms with one payload shape.
//
// Commands arrive on the Tauri ipc dispatch queue, so every touch of UIKit or the
// player hops to the main queue first (the Kotlin side does the same via runOnUiThread).
import Foundation
import Tauri
import UIKit

struct SubArg: Decodable {
  let url: String
  let lang: String?
  let label: String?
}

struct LoadArgs: Decodable {
  let url: String
  let headers: [String: String]
  let subtitles: [SubArg]
  let startAtSec: Double
  let title: String?
  let canNext: Bool
  /// True hosts the surface behind a transparent web view with no native chrome,
  /// leaving every control to the JS shell. False is the modal fullscreen player.
  let webChrome: Bool

  private enum CodingKeys: String, CodingKey {
    case url, headers, subtitles, startAtSec, title, canNext, webChrome
  }

  // decodeIfPresent plus defaults mirror the Kotlin @InvokeArg defaults. The Rust serde
  // layer happens to always send every key today, but the contract does not require it.
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    url = try c.decode(String.self, forKey: .url)
    headers = try c.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
    subtitles = try c.decodeIfPresent([SubArg].self, forKey: .subtitles) ?? []
    startAtSec = try c.decodeIfPresent(Double.self, forKey: .startAtSec) ?? 0
    title = try c.decodeIfPresent(String.self, forKey: .title)
    canNext = try c.decodeIfPresent(Bool.self, forKey: .canNext) ?? false
    webChrome = try c.decodeIfPresent(Bool.self, forKey: .webChrome) ?? false
  }
}

struct SeekArgs: Decodable {
  let positionSec: Double

  private enum CodingKeys: String, CodingKey {
    case positionSec
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    positionSec = try c.decodeIfPresent(Double.self, forKey: .positionSec) ?? 0
  }
}

struct TrackArgs: Decodable {
  let trackId: String?
}

struct OrientationArgs: Decodable {
  let mode: String
}

struct RateArgs: Decodable {
  let rate: Double
}

struct ZoomArgs: Decodable {
  let fill: Bool
}

struct VolumeArgs: Decodable {
  let volume: Double
}

struct DelayArgs: Decodable {
  let seconds: Double
}

struct HapticArgs: Decodable {
  let kind: String
}

// Shared with the AppDelegate orientation override injected at iOS build time
// (see .github/workflows/ios-build.yml "Inject orientation AppDelegate"). The
// plugin compiles into the Rust staticlib, a separate Swift module from the app
// target that owns the AppDelegate, so the forced mask travels through
// UserDefaults rather than a shared symbol. Absent/zero means free rotation.
let harborOrientationDefaultsKey = "harbor.player.orientationMask"

// One engine at a time behind the single wire contract. The plugin picks the
// engine per URL in routesToMpv; everything downstream is engine-agnostic.
protocol HarborPlayerEngine: AnyObject {
  /// position, duration, buffered, playing, configured playback rate.
  var onTick: ((Double, Double, Double, Bool, Double) -> Void)? { get set }
  var onState: ((String, String?) -> Void)? { get set }
  var onClosed: ((Double, Double) -> Void)? { get set }
  var onTracks: (([NativeTrackEntry], [NativeTrackEntry]) -> Void)? { get set }
  /// "mpv" or "av"; the JS shell gates engine-specific controls on it.
  var engineName: String { get }
  /// The DECODED picture size, which is the only honest source for a quality badge:
  /// a release named 2160p can decode at 1080p. Zero until the engine knows.
  var decodedSize: CGSize { get }
  /// Must be set before the first configure: viewDidLoad reads it to decide
  /// whether any native chrome is built at all.
  var webChrome: Bool { get set }
  func configure(_ args: LoadArgs)
  func doPlay()
  func doPause()
  func doSeek(_ sec: Double)
  func doStop()
  func doSetAudioTrack(_ id: String?)
  func doSetSubtitleTrack(_ id: String?)
  func doSetRate(_ rate: Double)
  func doSetZoom(_ fill: Bool)
  func doSetVolume(_ volume: Double)
  func doSetSubDelay(_ seconds: Double)
  func doSetAudioDelay(_ seconds: Double)
  func enterPip()
}

// Delay offsets only exist on the mpv engine; AVFoundation has no equivalent.
extension HarborPlayerEngine {
  func doSetSubDelay(_ seconds: Double) {}
  func doSetAudioDelay(_ seconds: Double) {}
}

class HarborPlayerPlugin: Plugin {
  private var controller: (UIViewController & HarborPlayerEngine)?
  private let chromeHost = HarborWebChromeHost()
  private let routePicker = HarborRoutePicker()

  // AVPlayer keeps the containers it is genuinely good at; mpv takes everything
  // else, including extensionless URLs. Reasoning in ios/README.md.
  private static let avPlayerExtensions: Set<String> = ["m3u8", "mp4", "m4v", "mov"]

  // Plain string inspection, not Foundation URL parsing: Foundation rejects
  // strings Android happily plays (unencoded spaces, some IPv6/userinfo
  // shapes), and routing must never be the reason a stream fails. mpv does its
  // own URL handling, so the default engine needs no parseable URL at all.
  private static func routesToMpv(_ url: String, hasExternalSubtitles: Bool) -> Bool {
    // Sidecar subtitles decide before the container does. AVFoundation cannot
    // attach an external subtitle file to a remote asset, so HarborPlayerViewController
    // accepts the tracks and drops them: the viewer picks subtitles, gets none, and
    // nothing reports why. mpv plays these containers just as well, so routing a
    // subtitled source there costs only PiP and hardware HLS on the sources that
    // carry subs, which is cheaper than losing the subtitles.
    if hasExternalSubtitles { return true }
    var base = url
    if let cut = base.firstIndex(where: { $0 == "?" || $0 == "#" }) {
      base = String(base[..<cut])
    }
    base = base.lowercased()
    let segment = base.components(separatedBy: "/").last ?? base
    guard let dot = segment.lastIndex(of: ".") else { return true }
    return !avPlayerExtensions.contains(String(segment[segment.index(after: dot)...]))
  }

  @objc public func load(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(LoadArgs.self)
    DispatchQueue.main.async {
      let wantsMpv = HarborPlayerPlugin.routesToMpv(
        args.url, hasExternalSubtitles: !args.subtitles.isEmpty)
      // A chrome-mode flip is retired the same way as an engine flip: the
      // hosting shape is fixed at viewDidLoad and cannot be changed in place.
      var outgoing: (UIViewController & HarborPlayerEngine)?
      if let existing = self.controller,
        (existing is HarborMpvViewController) != wantsMpv || existing.webChrome != args.webChrome
      {
        // Cross-engine source switch: replace the surface with no closed event,
        // the same contract as the in-place swap. Silencing every callback keeps
        // the outgoing engine's dismissal-driven teardown from popping the JS
        // view and its last ticks from interleaving with the new engine's.
        existing.onTick = nil
        existing.onState = nil
        existing.onTracks = nil
        existing.onClosed = nil
        self.controller = nil
        outgoing = existing
      }
      let vc: UIViewController & HarborPlayerEngine
      if let existing = self.controller {
        vc = existing
      } else {
        if wantsMpv {
          vc = HarborMpvViewController()
        } else {
          vc = HarborPlayerViewController()
        }
        vc.webChrome = args.webChrome
        self.controller = vc
        let engine = vc.engineName
        vc.onTick = { [weak self] pos, dur, buf, playing, rate in
          self?.sendTick(pos, dur, buf, playing, rate)
        }
        vc.onState = { [weak self] status, code in self?.sendState(status, code, engine: engine) }
        vc.onTracks = { [weak self] audio, subtitle in self?.sendTracks(audio, subtitle) }
        // weak vc: the closure is stored on vc itself, a strong capture would leak it.
        vc.onClosed = { [weak self, weak vc] pos, dur in
          guard let self = self else { return }
          self.sendClosed(pos, dur)
          guard let vc = vc else { return }
          if self.controller === vc { self.controller = nil }
          // A child-hosted surface has no dismissal to unwind it; the modal
          // path leaves this a no-op apart from the (idempotent) restore.
          self.chromeHost.detach(vc, restoreWebView: self.controller == nil)
        }
      }
      // Set on every load, not just when the controller is created: advancing to
      // the next episode reuses the presented player, and the last episode of a
      // season has to be able to turn the button back off.
      if let mpv = vc as? HarborMpvViewController {
        mpv.canNext = args.canNext
        if mpv.onNextEpisode == nil {
          mpv.onNextEpisode = { [weak self] in self?.sendAction("next") }
        }
      }
      if vc.presentingViewController == nil && vc.parent == nil {
        // Reject rather than leave the JS await hanging when there is nothing to
        // present on (webview not created yet, or torn down).
        guard let root = self.manager.viewController else {
          if self.controller === vc { self.controller = nil }
          invoke.reject("Cannot present the native player: no root view controller")
          return
        }
        if let outgoing = outgoing, outgoing.parent != nil {
          // Callbacks are already silent, so this tears the old engine down
          // without a closed event; a child has no dismissal to do it for us.
          outgoing.doStop()
          self.chromeHost.detach(outgoing, restoreWebView: !args.webChrome)
        }
        if args.webChrome {
          let attach = { self.chromeHost.embed(vc, in: root) }
          if let replaced = root.presentedViewController {
            replaced.dismiss(animated: false, completion: attach)
          } else {
            attach()
          }
        } else {
          vc.modalPresentationStyle = .fullScreen
          if let replaced = root.presentedViewController {
            // Cross-engine swap: the outgoing engine is still on screen. Presenting
            // during its dismissal fails, so present from the completion; the
            // dismissal itself drives the old controller's teardown.
            replaced.dismiss(animated: false) {
              root.present(vc, animated: true)
            }
          } else {
            root.present(vc, animated: true)
          }
        }
      }
      // A live controller swaps the stream in place with no closed event, mirroring
      // the Android singleTask onNewIntent path.
      vc.configure(args)
      // Resolve with an empty object, not bare resolve(): a nil payload reaches the
      // Rust layer as JSON null, which EmptyResponse cannot deserialize, so every
      // command would return Err. Matches the Kotlin side's invoke.resolve(JSObject()).
      invoke.resolve(JsonObject())
    }
  }

  @objc public func play(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.controller?.doPlay()
      invoke.resolve(JsonObject())
    }
  }

  @objc public func pause(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.controller?.doPause()
      invoke.resolve(JsonObject())
    }
  }

  @objc public func seek(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SeekArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSeek(args.positionSec)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func stop(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.controller?.doStop()
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setAudioTrack(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(TrackArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetAudioTrack(args.trackId)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setSubtitleTrack(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(TrackArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetSubtitleTrack(args.trackId)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setZoom(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ZoomArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetZoom(args.fill)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setRate(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(RateArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetRate(args.rate)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setVolume(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(VolumeArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetVolume(args.volume)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setSubDelay(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(DelayArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetSubDelay(args.seconds)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func setAudioDelay(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(DelayArgs.self)
    DispatchQueue.main.async {
      self.controller?.doSetAudioDelay(args.seconds)
      invoke.resolve(JsonObject())
    }
  }

  // AirPlay is an AVPlayer-engine feature; mpv renders its own frames and has
  // nothing to hand a route, so the picker is only raised for the AV engine.
  @objc public func showRoutePicker(_ invoke: Invoke) {
    DispatchQueue.main.async {
      if self.controller?.engineName == "av", let host = self.topmostView() {
        self.routePicker.present(in: host)
      }
      invoke.resolve(JsonObject())
    }
  }

  // WKWebView has no navigator.vibrate, so the JS shell's haptics come through here.
  @objc public func haptic(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(HapticArgs.self)
    DispatchQueue.main.async {
      HarborHaptics.play(args.kind)
      invoke.resolve(JsonObject())
    }
  }

  @objc public func enterPip(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.controller?.enterPip()
      invoke.resolve(JsonObject())
    }
  }

  // Forces the whole app (webview connecting screen + presented native player) to
  // landscape during playback and restores free rotation on exit. requestGeometryUpdate
  // rotates immediately, but it is CONSTRAINED by the orientations the app reports as
  // supported, so the rotation only holds because HarborOrientationSupport answers
  // supportedInterfaceOrientationsFor with this mask. Without that the plist's portrait
  // entry stays valid and iOS rotates straight back.
  @objc public func setOrientation(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OrientationArgs.self)
    DispatchQueue.main.async {
      let mask: UIInterfaceOrientationMask
      let preferred: UIInterfaceOrientation
      switch args.mode {
      case "landscape":
        mask = .landscape
        preferred = .landscapeRight
      case "portrait":
        mask = .portrait
        preferred = .portrait
      default:
        mask = .allButUpsideDown
        preferred = .unknown
      }
      HarborOrientationSupport.installIfNeeded()
      UserDefaults.standard.set(Int(mask.rawValue), forKey: harborOrientationDefaultsKey)
      if #available(iOS 16.0, *) {
        // Re-query the delegate now that the mask changed. Walk to the topmost
        // presented controller so a fullscreen native player VC is included.
        self.topmostViewController()?.setNeedsUpdateOfSupportedInterfaceOrientations()
        let scene = UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .first { $0.activationState == .foregroundActive }
          ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        if let scene = scene {
          // Restoring has to name ONE orientation, not just widen the mask. A
          // permissive mask only tells iOS what is allowed; it does not ask it to
          // leave the orientation it is already in, so exiting the play flow left
          // the whole app stuck sideways on the browse screens. Aim at however the
          // device is actually being held, falling back to portrait when the sensor
          // says flat/unknown.
          let target: UIInterfaceOrientationMask
          if args.mode == "auto" {
            switch UIDevice.current.orientation {
            case .landscapeLeft: target = .landscapeRight
            case .landscapeRight: target = .landscapeLeft
            default: target = .portrait
            }
          } else {
            target = mask
          }
          scene.requestGeometryUpdate(.iOS(interfaceOrientations: target)) { _ in }
          // Then relax to the full mask so the viewer can turn the phone freely again.
          if args.mode == "auto" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
              scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
            }
          }
        }
      } else if preferred != .unknown {
        // Pre-16 devices honor the KVC device-orientation nudge; the old
        // attemptRotationToDeviceIfNeeded() companion is gone from the iOS 26 SDK.
        UIDevice.current.setValue(preferred.rawValue, forKey: "orientation")
      }
      invoke.resolve(JsonObject())
    }
  }

  private func topmostViewController() -> UIViewController? {
    var top = manager.viewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }

  private func topmostView() -> UIView? {
    topmostViewController()?.view
  }

  private func sendTick(_ pos: Double, _ dur: Double, _ buf: Double, _ playing: Bool, _ rate: Double) {
    var payload: JSObject = [
      "positionSec": pos, "durationSec": dur, "bufferedSec": buf, "playing": playing,
      "rate": rate,
    ]
    // Carried on the tick, not just on state changes. The decoded size is not known
    // when "ready" fires - AVPlayer reports presentationSize as zero until the item
    // has actually loaded - and no further state event follows, so a badge fed only
    // by state could never appear. Two integers on a once-a-second payload.
    if let size = controller?.decodedSize, size.width > 0, size.height > 0 {
      payload["videoWidth"] = Int(size.width)
      payload["videoHeight"] = Int(size.height)
    }
    trigger("tick", data: payload)
  }

  private func sendState(_ status: String, _ errorCode: String?, engine: String) {
    var payload: JSObject = ["status": status, "engine": engine]
    if let code = errorCode { payload["errorCode"] = code }
    // Additive, and only once the engine actually knows: Android sends neither key
    // and the shell treats both as absent, so nothing downstream changes shape.
    if let size = controller?.decodedSize, size.width > 0, size.height > 0 {
      payload["videoWidth"] = Int(size.width)
      payload["videoHeight"] = Int(size.height)
    }
    trigger("state", data: payload)
  }

  /// A request from the native overlay that only the JS side can carry out.
  /// Kept as one event with a kind so later controls do not each need their own.
  private func sendAction(_ kind: String) {
    trigger("action", data: ["kind": kind] as JSObject)
  }

  private func sendClosed(_ pos: Double, _ dur: Double) {
    let payload: JSObject = ["positionSec": pos, "durationSec": dur]
    trigger("closed", data: payload)
  }

  private func sendTracks(_ audio: [NativeTrackEntry], _ subtitle: [NativeTrackEntry]) {
    func rows(_ entries: [NativeTrackEntry]) -> JSArray {
      entries.map { entry -> JSValue in
        var row: JSObject = [
          "id": entry.id, "lang": entry.lang, "label": entry.label, "selected": entry.selected,
        ]
        if let channelCount = entry.channelCount { row["channelCount"] = channelCount }
        return row
      }
    }
    let payload: JSObject = ["audio": rows(audio), "subtitle": rows(subtitle)]
    trigger("tracks", data: payload)
  }
}

@_cdecl("init_plugin_harbor_player")
func initPlugin() -> Plugin {
  // The mask persists in UserDefaults and would survive a crash mid-playback,
  // launching the app locked to landscape with no player to unlock it.
  // The mask is cleared, but the delegate hook is NOT installed at launch any more.
  // Nothing forces an orientation now that the player follows the device, so the
  // only thing overriding supportedInterfaceOrientationsFor would be us - and an
  // app that answers that question is an app that can refuse to turn. Left to the
  // plist, iOS rotates freely, which is the behaviour we actually want. The hook
  // still installs lazily inside set_orientation if a caller ever asks for a lock.
  HarborOrientationSupport.clearStaleMask()
  return HarborPlayerPlugin()
}
