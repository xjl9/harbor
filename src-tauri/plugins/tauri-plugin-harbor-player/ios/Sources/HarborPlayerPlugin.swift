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

  private enum CodingKeys: String, CodingKey {
    case url, headers, subtitles, startAtSec, title
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

// Shared with the AppDelegate orientation override injected at iOS build time
// (see .github/workflows/ios-build.yml "Inject orientation AppDelegate"). The
// plugin compiles into the Rust staticlib, a separate Swift module from the app
// target that owns the AppDelegate, so the forced mask travels through
// UserDefaults rather than a shared symbol. Absent/zero means free rotation.
let harborOrientationDefaultsKey = "harbor.player.orientationMask"

// One engine at a time behind the single wire contract. The plugin picks the
// engine per URL in routesToMpv; everything downstream is engine-agnostic.
protocol HarborPlayerEngine: AnyObject {
  var onTick: ((Double, Double, Double, Bool) -> Void)? { get set }
  var onState: ((String, String?) -> Void)? { get set }
  var onClosed: ((Double, Double) -> Void)? { get set }
  var onTracks: (([NativeTrackEntry], [NativeTrackEntry]) -> Void)? { get set }
  func configure(_ args: LoadArgs)
  func doPlay()
  func doPause()
  func doSeek(_ sec: Double)
  func doStop()
  func doSetAudioTrack(_ id: String?)
  func doSetSubtitleTrack(_ id: String?)
  func enterPip()
}

class HarborPlayerPlugin: Plugin {
  private var controller: (UIViewController & HarborPlayerEngine)?

  // AVPlayer keeps the containers it is genuinely good at; mpv takes everything
  // else, including extensionless URLs. Reasoning in ios/README.md.
  private static let avPlayerExtensions: Set<String> = ["m3u8", "mp4", "m4v", "mov"]

  // Plain string inspection, not Foundation URL parsing: Foundation rejects
  // strings Android happily plays (unencoded spaces, some IPv6/userinfo
  // shapes), and routing must never be the reason a stream fails. mpv does its
  // own URL handling, so the default engine needs no parseable URL at all.
  private static func routesToMpv(_ url: String) -> Bool {
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
      let wantsMpv = HarborPlayerPlugin.routesToMpv(args.url)
      if let existing = self.controller, (existing is HarborMpvViewController) != wantsMpv {
        // Cross-engine source switch: replace the surface with no closed event,
        // the same contract as the in-place swap. Silencing every callback keeps
        // the outgoing engine's dismissal-driven teardown from popping the JS
        // view and its last ticks from interleaving with the new engine's.
        existing.onTick = nil
        existing.onState = nil
        existing.onTracks = nil
        existing.onClosed = nil
        self.controller = nil
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
        self.controller = vc
        vc.onTick = { [weak self] pos, dur, buf, playing in
          self?.sendTick(pos, dur, buf, playing)
        }
        vc.onState = { [weak self] status, code in self?.sendState(status, code) }
        vc.onTracks = { [weak self] audio, subtitle in self?.sendTracks(audio, subtitle) }
        // weak vc: the closure is stored on vc itself, a strong capture would leak it.
        vc.onClosed = { [weak self, weak vc] pos, dur in
          guard let self = self else { return }
          self.sendClosed(pos, dur)
          if let vc = vc, self.controller === vc { self.controller = nil }
        }
      }
      if vc.presentingViewController == nil {
        // Reject rather than leave the JS await hanging when there is nothing to
        // present on (webview not created yet, or torn down).
        guard let root = self.manager.viewController else {
          if self.controller === vc { self.controller = nil }
          invoke.reject("Cannot present the native player: no root view controller")
          return
        }
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

  @objc public func enterPip(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.controller?.enterPip()
      invoke.resolve(JsonObject())
    }
  }

  // Forces the whole app (webview connecting screen + presented native player) to
  // landscape during playback and restores free rotation on exit. requestGeometryUpdate
  // rotates immediately; the mask written to UserDefaults is what the injected
  // AppDelegate returns from supportedInterfaceOrientationsFor, which is what keeps
  // iOS from rotating back when the plist still permits portrait.
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
      UserDefaults.standard.set(Int(mask.rawValue), forKey: harborOrientationDefaultsKey)
      if #available(iOS 16.0, *) {
        // Re-query the AppDelegate now that the mask changed. Walk to the topmost
        // presented controller so a fullscreen native player VC is included.
        var top = self.manager.viewController
        while let presented = top?.presentedViewController { top = presented }
        top?.setNeedsUpdateOfSupportedInterfaceOrientations()
        let scene = UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .first { $0.activationState == .foregroundActive }
          ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        if let scene = scene {
          scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
        }
      } else if preferred != .unknown {
        // Pre-16 devices honor the KVC device-orientation nudge; the old
        // attemptRotationToDeviceIfNeeded() companion is gone from the iOS 26 SDK.
        UIDevice.current.setValue(preferred.rawValue, forKey: "orientation")
      }
      invoke.resolve(JsonObject())
    }
  }

  private func sendTick(_ pos: Double, _ dur: Double, _ buf: Double, _ playing: Bool) {
    let payload: JSObject = [
      "positionSec": pos, "durationSec": dur, "bufferedSec": buf, "playing": playing,
    ]
    trigger("tick", data: payload)
  }

  private func sendState(_ status: String, _ errorCode: String?) {
    var payload: JSObject = ["status": status]
    if let code = errorCode { payload["errorCode"] = code }
    trigger("state", data: payload)
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
  return HarborPlayerPlugin()
}
