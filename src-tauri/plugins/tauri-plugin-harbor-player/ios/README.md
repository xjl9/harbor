# tauri-plugin-harbor-player, iOS leg

Two playback engines behind one wire contract. The Android leg (media3/ExoPlayer)
is the contract's ground truth; every command name, event name, and payload key
here is byte-identical to `android/.../PlayerPlugin.kt` so the shared JS bridge
(`src/lib/player/android-native.ts`) drives all platforms unchanged.

- `HarborPlayerViewController` (AVPlayer + AVKit): system transport UI, Picture
  in Picture, background audio, best battery.
- `HarborMpvViewController` (libmpv via MPVKit): MKV, AC3/DTS, sidecar SRT/ASS,
  everything AVFoundation cannot open.

Both implement the `HarborPlayerEngine` protocol (in `HarborPlayerPlugin.swift`);
the plugin holds exactly one live engine at a time.

Verification model is CI-first: the dev box is Windows, so this Swift is never
compiled locally. The macOS CI lane (`tauri ios build`) is where it compiles and
the sideloaded build is where it runs.

## Engine routing

One function, `HarborPlayerPlugin.routesToMpv`, decides per `load`: AVPlayer
for extensions `.m3u8`, `.mp4`, `.m4v`, `.mov`; mpv for everything else,
including extensionless URLs. The rule is plain string inspection: lowercase
the part before any `?` or `#`, then take what follows the last `.` of the
last `/`-segment. Reasoning:

- Misrouting an MKV to AVPlayer is a hard failure (the container will not open).
  Misrouting an MP4 to mpv still plays; it only loses PiP and the system UI. So
  mpv is the default and AVPlayer is a small allowlist of what it is
  unambiguously good at.
- Extensionless URLs (most debrid and torrent stream links) are overwhelmingly
  MKV-family, so they go to mpv.
- String inspection, not Foundation URL parsing: Foundation rejects strings
  Android happily plays (unencoded spaces, some IPv6/userinfo shapes), and no
  stream may fail purely because Foundation is stricter than Android. mpv gets
  the raw string and does its own loading. The AVPlayer leg still needs a
  Foundation `URL`, so it retries `URL(string:)` once with percent-encoding
  (`.urlQueryAllowed`) and only then rejects with `SOURCE_URL_INVALID`.
- Cutting at `?`/`#` keeps query strings out of the extension, so signed URLs
  route correctly.
- A `load` that lands on the other engine while a player is presented swaps
  surfaces with no `closed` event (the old controller's `onClosed` is silenced,
  it is dismissed without animation, and the new engine presents from the
  dismissal completion). This is the cross-engine analogue of the in-place
  stream swap.

## Wire contract (both engines)

Commands (all resolve `{}` immediately, like Android):

| JS invoke `plugin:harbor-player\|…` | Swift | notes |
|---|---|---|
| `load` | `load` | presents fullscreen, applies `startAtSec` before playback, rejects if no root view controller (never hangs the JS await); a load while presented swaps the stream in place with NO `closed` (Android onNewIntent semantics) |
| `play` / `pause` / `stop` | same | `stop` emits `closed` then dismisses |
| `seek` | `seek` | mpv: `seek <sec> absolute` (exact by default for absolute seeks) |
| `set_audio_track` | `setAudioTrack` | unknown/malformed id is a silent no-op on both engines |
| `set_subtitle_track` | `setSubtitleTrack` | `trackId: null` disables subtitles (mpv: `sid=no`) |
| `enter_pip` | `enterPip` | AVPlayer engine: best-effort; mpv engine: logged no-op. See divergences |

Events (via the base class `trigger`, listened to with
`addPluginListener("harbor-player", …)`):

- `tick` `{positionSec, durationSec, bufferedSec, playing}`: 500 ms wall-clock
  `Timer` on the main RunLoop in `.common` mode on both engines. `durationSec`
  is 0 until known. mpv feeds the tick from cached property observations
  (`time-pos`, `duration`, `demuxer-cache-time`, `pause`, `paused-for-cache`,
  `eof-reached`); mpv coalesces observation events, so the cache is always
  current without polling the core. On the keep-open end screen `positionSec`
  clamps to `durationSec` (media3 reports position == duration at ENDED).
- `state` `{status, errorCode?}`: `loading|ready|ended|error`. Error codes are
  media3-style names on both engines, never raw NSError domains or mpv error
  strings: the JS `mapError` substring-matches and would misclassify raw values.
- `closed` `{positionSec, durationSec}`: exactly once per genuine teardown, on
  user dismissal and on JS `stop`. Not on stream swap (either kind), not on PiP
  entry.
- `tracks` `{audio: [{id, lang, label, selected, channelCount?}], subtitle: […]}`:
  ids are opaque (`a/<n>`, `s/<n>`). AVPlayer indexes into the media selection
  group; mpv uses the container track id from `track-list`. Label falls back
  title, then lang, then `Track N` (Android's chain). `channelCount` comes from
  mpv's `demux-channel-count` when the container reports it; the AVPlayer engine
  omits it (AVMediaSelectionOption does not expose one).

Shared: `HarborNowPlaying` wires MPRemoteCommandCenter
(play/pause/toggle/scrub) and MPNowPlayingInfoCenter for both engines, the
parity target being Android's MediaSession.

## The mpv engine

MPVKit's iOS stack, mirrored from its demo: `vo=gpu-next`, `gpu-api=vulkan`,
`gpu-context=moltenvk` (an MPVKit patch, not upstream mpv), `hwdec=videotoolbox`,
log level `warn`, plus `keep-open=yes` (see the state machine). The render
target is a `CAMetalLayer` sublayer whose object pointer is passed as the
`wid` option (`MPV_FORMAT_INT64`) before `mpv_initialize`. `ao=avfoundation,audiounit` because audiounit goes silent on
multichannel HDMI/AirPlay routes (MPVKit #67). The layer subclass rejects
MoltenVK's forced 1x1 drawableSize (mpv PR #13651).

### Event loop and teardown doctrine

The order here is load-bearing; deviations crash in mpv's shutdown path.

1. `mpv_set_wakeup_callback` fires on mpv's internal threads and only enqueues a
   drain on a serial DispatchQueue. No client API inside the callback, ever.
2. The drain loops `mpv_wait_event(0)` until `MPV_EVENT_NONE`, copies event data
   out (it dies at the next `mpv_wait_event`), and hops to main for anything
   JS- or UIKit-visible.
3. Teardown: emit `closed` from cached values, then `mpv_unobserve_property(0)`
   BEFORE the `quit` command (mpv emits property changes during shutdown and
   handlers must not touch the dying core), then `quit`.
4. The event queue receives `MPV_EVENT_SHUTDOWN`, stops draining, and calls
   `mpv_terminate_destroy` there. A `shuttingDown` flag fences every main-queue
   entry point from the moment `quit` is issued; no client API call can race the
   destroy.
5. The wakeup context holds a retain on the controller until after
   `mpv_terminate_destroy`, so the C callback can never see a dangling pointer.
6. Every drain-to-main hop carries a load generation captured on the event
   queue; `configure` bumps the counter (and mirrors it onto the event queue),
   so stale hops from the previous stream drop themselves on arrival. This is
   the in-place-swap analogue of the teardown Android's onNewIntent path gets
   for free.

### Loading

- `loadfile <url> replace -1 start=+<sec>`: the mpv 0.38+ argument order (index
  `-1` before the options slot, input.rst 0.41). `start` in the options slot is
  a per-file option that auto-reverts at end of playback; `+` keeps it relative
  to the rebased start.
- Headers: `change-list http-header-fields clr` then one
  `change-list http-header-fields append "Key: value"` per header. Append takes
  the value as a single list item with no comma splitting or escape parsing
  (input.rst 0.41), so cookie and auth values survive verbatim. The list is
  cleared on every load so debrid headers never leak onto the next stream.
  `User-Agent` is split out into the `user-agent` option (avoids a duplicate UA
  header) and restored to mpv's default when a load stops sending one. Like the
  AVPlayer engine's `AVURLAssetHTTPHeaderFieldsKey`, headers apply to every HTTP
  request of the load, including sidecar subtitle fetches.
- Sidecar subtitles (the reason this engine exists): after
  `MPV_EVENT_FILE_LOADED`, each payload subtitle is `sub-add`-ed with its
  title/lang. If the container did not select a subtitle on its own, the first
  sidecar gets the `select` flag, mirroring Android's SELECTION_FLAG_DEFAULT
  behavior. Adds run sequentially on the event queue with synchronous
  `mpv_command` (the client API is thread-safe, client.h Multithreading), so
  tracks appear in payload order like Android and a slow subtitle host still
  never blocks the main thread; a failed add is logged by mpv and the track
  simply never appears. Payload mime hints are unnecessary here, mpv sniffs
  the format.

### State machine

```
load()                          -> loading
MPV_EVENT_FILE_LOADED           -> ready (+ sub-add batch + tracks)
paused-for-cache true/false     -> loading / ready (buffer stall + recovery)
eof-reached true                -> ended, EXCEPT: position more than 10 s short
                                   of a known duration reports
                                   ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
                                   (client.h: EOF also fires on truncated files
                                   and dropped connections), UNLESS the last
                                   user seek targeted the final 15 s, where a
                                   keyframe landing plus demuxer EOF is a
                                   legitimate finish
eof-reached false after ended   -> ready (a seek left the end screen)
MPV_EVENT_END_FILE  EOF         -> same classification as eof-reached; with
                                   keep-open this fires only in corner cases
                                   where mpv unloads the file anyway
MPV_EVENT_END_FILE  ERROR       -> error, mpv code mapped to media3 names
MPV_EVENT_END_FILE  STOP/QUIT   -> nothing (our own swap/teardown)
```

End-screen liveness: `keep-open=yes` (set before `mpv_initialize`) keeps the
file open and paused at EOF instead of unloading it (options.rst 0.41), and
`MPV_EVENT_END_FILE` only fires when a file is unloaded (client.h), so `ended`
comes from observing the `eof-reached` property. The end screen stays live:
position/duration keep ticking (position clamps to duration), seeking works,
and `play` revives playback by seeking to 0 before `pause=no` (unpausing alone
would immediately hit EOF again; seek back plus unpause is the documented
resume, options.rst keep-open/keep-open-pause).

mpv error mapping: `MPV_ERROR_LOADING_FAILED` ->
`ERROR_CODE_IO_NETWORK_CONNECTION_FAILED`; `MPV_ERROR_UNKNOWN_FORMAT` and
`MPV_ERROR_NOTHING_TO_PLAY` -> `ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED`;
`MPV_ERROR_UNSUPPORTED` -> `ERROR_CODE_DECODING_FAILED`; everything else ->
`ERROR_CODE_UNSPECIFIED`.

### Tracks

Read from `track-list/N/...` sub-properties (id, type, title, lang, selected,
demux-channel-count), which avoids `MPV_FORMAT_NODE` parsing entirely.
`track-list` is observed with `MPV_FORMAT_NONE`, so selection changes and
late-appearing tracks re-emit the `tracks` event no matter where the change came
from. `set_audio_track`/`set_subtitle_track` parse `a/<id>`/`s/<id>` back to
`aid`/`sid` and validate the id against the current track list first (unknown id
= silent no-op, per contract).

### Audio session, background, interruptions

mpv's iOS audio outputs configure the AVAudioSession category themselves, so
this engine does not touch category or activation (unlike the AVPlayer engine,
which owns its session). What mpv does NOT do is watch the session: the engine
registers interruption observers (pause on interruption, resume on
`.shouldResume`) and route-change observers (pause on `.oldDeviceUnavailable`,
so unplugging headphones never blasts the speaker).

Backgrounding follows the MPVKit demo dance: `didEnterBackground` pauses and
sets `vid=no` (GPU work in the background is an app kill, and dropping video
avoids MPVKit's black-screen-on-return bug); `willEnterForeground` sets
`vid=auto` and resumes only if playback was running.

## Documented divergences from Android

- **`enter_pip`**: AVPlayer engine is best-effort (no public programmatic PiP
  start on AVPlayerViewController; the transport button and auto-PiP on
  background work). The mpv engine cannot do PiP at all: gpu-next has no
  frame-export path on iOS (MPVKit #41), so there is no buffer to hand an
  AVPictureInPictureController. The command logs and resolves. PiP is therefore
  an AVPlayer-engine feature, one more reason HLS/MP4 stay on AVPlayer.
- **Backgrounding**: the AVPlayer engine keeps playing audio in the background
  with lock-screen control. The mpv engine pauses on background (above) and
  resumes on return. Neither emits `closed` on background, and the JS bridge
  tolerates the difference.
- **On-screen transport**: AVKit supplies the AVPlayer engine's UI. The mpv
  engine currently has a close button and tap-to-toggle-pause on the video
  surface; everything else (seek, precise scrubbing) rides the lock-screen /
  Control Center transport and the JS bridge. A native transport overlay is
  future work.
- **Track selections made in AVKit's own menus do not re-emit `tracks`** (no
  reliable KVO hook). The mpv engine does not have this gap: `track-list`
  observation re-emits on every selection change.

## Codec parity status

Honest status: the mpv engine closes the MKV/AC3/DTS/sidecar-subs gap on paper.
MPVKit 1.0.0 pins mpv 0.41.0 + FFmpeg n8.1.2 + libass, with VideoToolbox hwdec.
None of it has executed on a device yet: the dev box cannot compile Swift, so
correctness comes from primary sources (the client.h shipped inside MPVKit
1.0.0's Libmpv.xcframework, input.rst/options.rst at the v0.41.0 tag, the MPVKit
demo, IINA's teardown ordering) plus review. First compile is the CI lane; first
playback proof is a sideloaded device build.

Known device-test watchpoints, in likely order of pain:

- Rotation/resize: MoltenVK does not track layer resizes (MPVKit #3, open).
  `contentsGravity = .resizeAspect` keeps the picture scaled, but subtitle
  render resolution can lag a rotation.
- HDR content crashes Metal API validation in debug schemes (MoltenVK #2226);
  release/sideload builds are unaffected.
- TLS: mpv 0.41 does not verify TLS peers by default (same posture as other
  libmpv iOS apps). Revisit if mpv flips the default.

MPVKit linking (Package.swift changes, framework search paths, the Xcode project
template) is the builder lane's job; this directory only assumes `import Libmpv`
resolves.

## Info.plist

iOS-only keys live in `src-tauri/Info.ios.plist` (background audio,
`NSAllowsLocalNetworking` for librqbit's `http://127.0.0.1`, landscape
orientations). `tauri ios build` merges that file into the generated
`gen/apple/harbor_iOS/Info.plist` on every build, so it needs no manual step.

## Header injection note

`AVURLAssetHTTPHeaderFieldsKey` (AVPlayer engine) is undocumented but
long-stable and applies the debrid headers to every HTTP request the asset
makes. Fine for the sideloaded (AltStore) build this app ships as; App Store
review would need an `AVAssetResourceLoaderDelegate` instead. The mpv engine
needs no such trick; `http-header-fields` is a first-class option.
