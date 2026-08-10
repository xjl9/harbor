// UNVERIFIED SCAFFOLDING — compiles only on macOS with the Tauri iOS Swift API present;
// never built/verified on the Windows dev box. Before building on the Mac, confirm the
// Tauri iOS Plugin API shapes flagged in README.md (Plugin base class, Invoke.parseArgs /
// invoke.resolve, trigger(_:data:), JSObject typealias, self.manager.viewController).
//
// Mirrors android/.../PlayerPlugin.kt: the arg classes and event payload keys match the
// Kotlin side exactly so the shared JS bridge (src/lib/player/android-native.ts) drives
// both platforms with one payload shape.
import AVFoundation
import SwiftRs
import Tauri
import UIKit
import WebKit

class SubArg: Decodable {
  let url: String
  var lang: String?
  var label: String?
}

class LoadArgs: Decodable {
  let url: String
  var headers: [String: String] = [:]
  var subtitles: [SubArg] = []
  var startAtSec: Double = 0
  var title: String?
}

class SeekArgs: Decodable {
  var positionSec: Double = 0
}

class TrackArgs: Decodable {
  var trackId: String?
}

class HarborPlayerPlugin: Plugin {
  private var controller: HarborPlayerViewController?

  @objc public func load(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(LoadArgs.self)
    DispatchQueue.main.async {
      let vc = self.controller ?? HarborPlayerViewController()
      self.controller = vc
      vc.onTick = { [weak self] pos, dur, buf, playing in
        self?.sendTick(pos, dur, buf, playing)
      }
      vc.onState = { [weak self] status, code in self?.sendState(status, code) }
      vc.onClosed = { [weak self] pos, dur in
        self?.sendClosed(pos, dur)
        self?.controller = nil
      }
      vc.configure(args)
      if vc.presentingViewController == nil {
        vc.modalPresentationStyle = .fullScreen
        // VERIFY: `self.manager.viewController` accessor for the app's root WKWebView
        // controller in the pinned Tauri iOS API version.
        self.manager.viewController?.present(vc, animated: true) { invoke.resolve() }
      } else {
        // singleTask-equivalent: reuse the live controller for a new stream.
        invoke.resolve()
      }
    }
  }

  @objc public func play(_ invoke: Invoke) {
    DispatchQueue.main.async { self.controller?.doPlay(); invoke.resolve() }
  }

  @objc public func pause(_ invoke: Invoke) {
    DispatchQueue.main.async { self.controller?.doPause(); invoke.resolve() }
  }

  @objc public func seek(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SeekArgs.self)
    DispatchQueue.main.async { self.controller?.doSeek(args.positionSec); invoke.resolve() }
  }

  @objc public func stop(_ invoke: Invoke) {
    DispatchQueue.main.async { self.controller?.doStop(); invoke.resolve() }
  }

  // TODO (parity with Android): setAudioTrack / setSubtitleTrack via AVMediaSelectionGroup
  // (audible / legible), and enterPip via AVPictureInPictureController. Stubbed so the ACL
  // command set already granted on iOS resolves without error.
  @objc public func setAudioTrack(_ invoke: Invoke) throws {
    _ = try invoke.parseArgs(TrackArgs.self)
    DispatchQueue.main.async { invoke.resolve() }
  }

  @objc public func setSubtitleTrack(_ invoke: Invoke) throws {
    _ = try invoke.parseArgs(TrackArgs.self)
    DispatchQueue.main.async { invoke.resolve() }
  }

  @objc public func enterPip(_ invoke: Invoke) {
    DispatchQueue.main.async { self.controller?.enterPip(); invoke.resolve() }
  }

  // Event names + keys mirror PlayerPlugin.kt so android-native.ts's
  // addPluginListener("harbor-player", "tick"|"state"|"closed", ...) work unchanged.
  private func sendTick(_ pos: Double, _ dur: Double, _ buf: Double, _ playing: Bool) {
    trigger("tick", data: [
      "positionSec": pos, "durationSec": dur, "bufferedSec": buf, "playing": playing,
    ])
  }

  private func sendState(_ status: String, _ errorCode: String?) {
    var payload: JSObject = ["status": status]
    if let code = errorCode { payload["errorCode"] = code }
    trigger("state", data: payload)
  }

  private func sendClosed(_ pos: Double, _ dur: Double) {
    trigger("closed", data: ["positionSec": pos, "durationSec": dur])
  }
}

@_cdecl("init_plugin_harbor_player")
func initPlugin() -> Plugin {
  return HarborPlayerPlugin()
}
