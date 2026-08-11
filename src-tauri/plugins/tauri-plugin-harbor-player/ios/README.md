# tauri-plugin-harbor-player, iOS leg

Full implementation of the harbor-player wire contract on the AVPlayer engine
(`AVPlayerViewController` for transport UI plus PiP). The Android leg
(media3/ExoPlayer) is the contract's ground truth; every command name, event name,
and payload key here is byte-identical to `android/.../PlayerPlugin.kt` so the shared
JS bridge (`src/lib/player/android-native.ts`) drives both platforms unchanged.

Verification model is CI-first: the dev box is Windows, so this Swift is never
compiled locally. The macOS CI lane (`tauri ios build`) is where it compiles and the
sideloaded build is where it runs. Prefer boring AVFoundation/MediaPlayer APIs here.

## Implemented

Commands (all resolve `{}` immediately, like Android):

| JS invoke `plugin:harbor-player\|…` | Swift | notes |
|---|---|---|
| `load` | `load` | presents fullscreen, applies `startAtSec` before playback, headers via `AVURLAssetHTTPHeaderFieldsKey`, rejects if no root view controller (never hangs the JS await); a load while presented swaps the item in place with NO `closed` (Android onNewIntent semantics) |
| `play` / `pause` / `stop` | same | `stop` emits `closed` then dismisses |
| `seek` | `seek` | |
| `set_audio_track` | `setAudioTrack` | AVMediaSelectionGroup `.audible`; unknown/malformed id is a silent no-op |
| `set_subtitle_track` | `setSubtitleTrack` | `.legible`; `trackId: null` selects nil (subtitles off) |
| `enter_pip` | `enterPip` | best-effort no-op, see divergences |

Events (via the base class `trigger`, listened to with
`addPluginListener("harbor-player", …)`):

- `tick` `{positionSec, durationSec, bufferedSec, playing}`: 500 ms wall-clock
  `Timer` on the main RunLoop in `.common` mode, firing even while paused or
  buffering (`addPeriodicTimeObserver` starves when time is not advancing, which
  would freeze the JS snapshot in "playing"). `durationSec` is 0 until known;
  `playing` derives from `timeControlStatus == .playing`.
- `state` `{status, errorCode?}`: `loading|ready|ended|error` mapped from
  `AVPlayerItem.status`, `timeControlStatus` (stall = loading, recovery = ready),
  and `AVPlayerItemDidPlayToEndTime`. Error codes are media3-style names
  (`ERROR_CODE_IO_NETWORK_CONNECTION_FAILED`, `ERROR_CODE_DECODING_FAILED`,
  `ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED`), never raw NSError domains: the JS
  `mapError` substring-matches and "AVFoundationErrorDomain" contains "IO", which
  would misclassify everything as a network failure.
- `closed` `{positionSec, durationSec}`: exactly once per genuine teardown
  (released-flag guarded), on user dismissal and on JS `stop`. Not on stream swap,
  not on PiP entry, not while in PiP.
- `tracks` `{audio: [{id, lang, label, selected}], subtitle: […]}`: built from
  AVMediaSelectionGroup, emitted on item ready and after each `set_*_track`. Ids are
  opaque (`a/0`, `s/1`, index into the group's options); label falls back
  displayName, then lang, then `Track N`; lang falls back to `""`.

Also implemented: Now Playing parity with Android's MediaSession.
`MPNowPlayingInfoCenter` carries the `load` payload's optional `title` plus live
position/duration/rate; `MPRemoteCommandCenter` wires play/pause/togglePlayPause and
`changePlaybackPositionCommand` (lock-screen transport and scrubbing). The audio
session (`.playback`, `.moviePlayback`) activates on load and deactivates on
teardown.

## Codec ceiling (MPVKit swap still pending)

AVFoundation only decodes MP4/MOV/HLS with H.264/HEVC/AAC (plus AV1 on A17+). MKV
containers, AC3/DTS audio, and sidecar SRT/ASS subs, i.e. most torrent releases, need
the MPVKit engine swap, which is a separate task. The engine surface in
`HarborPlayerViewController` is confined to
`configure/doPlay/doPause/doSeek/doStop/doSetAudioTrack/doSetSubtitleTrack/enterPip/teardown`
so that swap stays surgical. Until then:

- Sidecar subtitles in the `load` payload are parsed and accepted for wire parity but
  unused; AVPlayer cannot attach them to a progressive asset.
- In-container audio/subtitle tracks work through the `tracks` event and the AVKit
  transport menus.

## Documented divergences from Android

- **`enter_pip` is best-effort.** `AVPlayerViewController` has no public programmatic
  PiP start. The command logs and resolves. PiP itself works: the transport PiP
  button, plus automatic fullscreen-to-PiP on background
  (`allowsPictureInPicturePlayback`, and
  `canStartPictureInPictureAutomaticallyFromInline` behind an iOS 14.2 guard).
- **Backgrounding does not tear down.** Android releases the player on `onStop`
  (emitting `closed`) unless in PiP; iOS keeps playing in the background with
  lock-screen control (`UIBackgroundModes` audio plus the `.playback` session) and
  emits `closed` only on dismissal. The JS bridge tolerates this: no `closed`, no
  view pop.
- **`channelCount` is omitted** from audio track rows. `AVMediaSelectionOption` does
  not expose a channel count without loading asset tracks; the key is optional in the
  contract and the JS handles its absence.
- **Track selections made in AVKit's own menus do not re-emit `tracks`.** There is no
  reliable KVO hook for `currentMediaSelection`; JS-driven selections re-emit, and the
  next item-ready does too.

## Info.plist

iOS-only keys live in `src-tauri/Info.ios.plist` (background audio,
`NSAllowsLocalNetworking` for librqbit's `http://127.0.0.1`, landscape orientations).
`tauri ios build` merges that file into the generated
`gen/apple/harbor_iOS/Info.plist` on every build, so it needs no manual step. The old
`Info.plist.additions` merge-by-hand fragment is deleted.

## Header injection note

`AVURLAssetHTTPHeaderFieldsKey` is undocumented but long-stable and applies the
debrid headers to every HTTP request the asset makes. Fine for the sideloaded
(AltStore) build this app ships as; App Store review would need an
`AVAssetResourceLoaderDelegate` instead.
