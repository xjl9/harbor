# tauri-plugin-harbor-player — iOS leg (bring-up blueprint)

**STATUS: UNVERIFIED SCAFFOLDING.** None of this was built or run — the dev box is
Windows; iOS needs a Mac. The Android leg (media3/ExoPlayer) is complete and verified.
This directory stages the iOS native player so a Mac session executes instead of starting
cold. Everything here is a draft to compile-fix on the Mac, not working code.

The JS/bridge/ACL layers are already iOS-ready: `src/lib/player/android-native.ts` (despite
the name) is the shared `PlayerBridge`, `capabilities/mobile.json` already grants
`harbor-player:default` on iOS, and `pickBridge` routes `isMobileNative()` to it. The gap is
entirely the Rust wiring + the native Swift player.

## Engine decision

- **This skeleton uses `AVPlayerViewController`** — built-in transport UI + PiP + background
  audio, minimal code. It proves the bridge/PiP/audio-session plumbing and plays the common
  case (MP4/HLS, H.264/HEVC/AAC).
- **AVPlayer CANNOT do the mission's core case**: MKV containers, AC3/DTS audio, sidecar
  SRT/ASS subs — i.e. most torrent releases. Android decodes these via media3; desktop via
  libmpv. **For real iOS parity, swap the engine to MPVKit (libmpv) or MobileVLCKit** behind
  the same `configure/doPlay/doPause/doSeek/doStop` interface in `HarborPlayerViewController`.
  Recommended default: **MPVKit** (matches the desktop libmpv codebase; VLCKit 4 is the
  fallback and has official iOS PiP). Keep AVPlayer as an MP4/HLS fast path if desired.
- MPVKit/VLCKit are SwiftPM/xcframework deps added on the Mac (they don't build on Windows),
  which is why this stays AVPlayer for now.

## Step 1 — apply the Rust wiring (3 edits, currently NOT applied to keep Android green)

These are intentionally left out of the crate so the verified Android/desktop build is
untouched. Apply them on the Mac (they are `cfg`-gated and won't affect Android):

**`src/mobile.rs`** — add at module scope (the file already calls
`register_ios_plugin(init_plugin_harbor_player)` but never declares the symbol):
```rust
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_harbor_player);
```

**`build.rs`** — tell the plugin builder where the SwiftPM package is:
```rust
tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")   // <-- add
    .build();
```

**`src-tauri/src/lib.rs`** — the plugin is registered only under `cfg(target_os = "android")`;
widen to `cfg(mobile)` so iOS gets the plugin + its `commands::load/play/...`:
```rust
#[cfg(mobile)]
let app_builder = app_builder.plugin(tauri_plugin_harbor_player::init());
```
(Also update the stale `// Native media3/ExoPlayer player - Android only` comment above it.)

## Step 2 — `tauri ios init` on the Mac

Generates `src-tauri/gen/apple/` (Xcode project, Info.plist, entitlements) and the
`.tauri/tauri-api` Swift package that `Package.swift` depends on. After it runs:

- Confirm `Package.swift`'s `.package(name: "Tauri", path: "../.tauri/tauri-api")` matches the
  actual generated path.
- Merge the keys in `Info.plist.additions` into `gen/apple/<App>_iOS/Info.plist` (background
  audio + `NSAllowsLocalNetworking` for librqbit's `http://127.0.0.1`). Do NOT replace the
  generated plist.

## Step 3 — verify the Tauri 2 iOS Swift API (skeleton assumed the standard template)

Confirm against the pinned Tauri version's iOS Swift API — the skeleton assumes:
- `class HarborPlayerPlugin: Plugin` base class
- `invoke.parseArgs(T.self)` for decoding, `invoke.resolve()` / `invoke.resolve(JSObject)` for return
- `trigger("event", data: JSObject)` for events (must match `addPluginListener` on the JS side)
- `JSObject` typealias, `@_cdecl("init_plugin_harbor_player")` entry
- `self.manager.viewController` to reach the app's root WKWebView controller for presentation

## Step 4 — build, sign, sideload

Per the mission plan: **sideloadable IPA (AltStore/free 7-day cert)**, NOT App Store.
`AVURLAssetHTTPHeaderFieldsKey` (debrid header injection) is fine for sideload; for App Store
review, switch to an `AVAssetResourceLoaderDelegate`.

## Command + event contract (matches the Android plugin exactly)

| JS invoke `plugin:harbor-player\|…` | payload | Swift | status |
|---|---|---|---|
| `load` | `{payload:{url,headers,subtitles[],startAtSec}}` | `load` | drafted |
| `play` / `pause` / `stop` | — | same | drafted |
| `seek` | `{payload:{positionSec}}` | `seek` | drafted |
| `set_audio_track` / `set_subtitle_track` | `{payload:{trackId}}` | `setAudioTrack`/`setSubtitleTrack` | **stub** → AVMediaSelectionGroup |
| `enter_pip` | — | `enterPip` | **stub** → AVPictureInPictureController |
| `registerListener` / `removeListener` | (Tauri built-in) | base class | needs the iOS Plugin base to provide it (Android's did) |

Events emitted to `addPluginListener("harbor-player", …)`: `tick`
`{positionSec,durationSec,bufferedSec,playing}`, `state` `{status,errorCode?}`, `closed`
`{positionSec,durationSec}` — keys identical to `PlayerPlugin.kt`. The `tracks` event
(audio/subtitle enumeration) is Android-only so far; add it when wiring AVMediaSelectionGroup.

## Not yet done on iOS (parity gaps vs Android)

- Real codec parity (MKV/HEVC/AC3/sidecar-subs) — needs MPVKit/VLCKit.
- Audio/subtitle track enumeration + switching (`tracks` event + the two set commands).
- Programmatic `enter_pip` (AVPlayerViewController only auto/user-initiates PiP).
- `registerListener` support on the iOS Plugin base class (verify Tauri provides it like Kotlin).
