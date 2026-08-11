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

class HarborPlayerPlugin: Plugin {
  private var controller: HarborPlayerViewController?

  @objc public func load(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(LoadArgs.self)
    DispatchQueue.main.async {
      let vc: HarborPlayerViewController
      if let existing = self.controller {
        vc = existing
      } else {
        vc = HarborPlayerViewController()
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
        root.present(vc, animated: true)
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
        let row: JSObject = [
          "id": entry.id, "lang": entry.lang, "label": entry.label, "selected": entry.selected,
        ]
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
