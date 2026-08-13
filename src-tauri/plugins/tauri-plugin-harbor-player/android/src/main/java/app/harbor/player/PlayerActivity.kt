package app.harbor.player

import android.app.PictureInPictureParams
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.annotation.RequiresApi
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.ui.PlayerView
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject

/**
 * Fullscreen media3/ExoPlayer surface. Launched by PlayerPlugin with a stream URL,
 * optional HTTP headers (debrid), external subtitles, and a resume position; it
 * reports position/state/errors back through PlayerPlugin's active channel so the
 * frontend's resume + scrobble keep working.
 */
@UnstableApi
class PlayerActivity : ComponentActivity() {

    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private val ticker = Handler(Looper.getMainLooper())
    private var released = false
    private var mediaSession: MediaSession? = null
    private var currentTracks: Tracks? = null
    private var videoWidth = 16
    private var videoHeight = 9

    companion object {
        @Volatile
        var instance: PlayerActivity? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        // Fullscreen video is landscape-first (Netflix/YouTube pattern). The manifest
        // declares configChanges=orientation|screenSize so this does not recreate the
        // Activity or restart playback.
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player_view)
        // Back must always exit the player. On targetSdk 33+ predictive back routes through the
        // dispatcher (not key events); this callback finishes the Activity, which drives
        // onDestroy -> releasePlayer(notify=true) -> the 'closed' event -> the React view pops.
        // dispatchKeyEvent below covers the legacy (non-predictive) path as a fallback.
        onBackPressedDispatcher.addCallback(
            this,
            object : androidx.activity.OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    Log.i("HarborPlayer", "onBackPressedDispatcher fired inPip=$isInPictureInPictureMode")
                    if (!isInPictureInPictureMode) finish()
                }
            },
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enterImmersive()
        setup()
    }

    // singleTask: a new load() reuses this instance — swap in the new stream.
    override fun onNewIntent(newIntent: android.content.Intent) {
        super.onNewIntent(newIntent)
        setIntent(newIntent)
        releasePlayer(notify = false)
        released = false
        enterImmersive()
        setup()
    }

    private fun enterImmersive() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun setup() {
        val url = intent.getStringExtra("url") ?: run { finish(); return }
        val startMs = intent.getLongExtra("startMs", 0L)

        val headers = HashMap<String, String>()
        intent.getStringArrayExtra("headerKeys")?.let { keys ->
            val vals = intent.getStringArrayExtra("headerVals") ?: emptyArray()
            for (i in keys.indices) if (i < vals.size) headers[keys[i]] = vals[i]
        }

        val httpFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(30_000)
            .setReadTimeoutMs(30_000)
        if (headers.isNotEmpty()) httpFactory.setDefaultRequestProperties(headers)
        val dataSource = DefaultDataSource.Factory(this, httpFactory)

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .build()
        player = exo
        playerView.player = exo
        // Lock-screen / notification transport + hardware media-button (headset, bluetooth,
        // media keys) handling. A unique session id keeps onNewIntent reloads from colliding.
        mediaSession = MediaSession.Builder(this, exo)
            .setId("harbor-${System.identityHashCode(exo)}")
            .build()

        val subConfigs = (intent.getStringArrayExtra("subs") ?: emptyArray()).mapNotNull { spec ->
            val p = spec.split("|")
            if (p.isEmpty() || p[0].isBlank()) return@mapNotNull null
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(p[0]))
                .setMimeType(mimeFor(p.getOrNull(3)?.takeIf { it.isNotBlank() }
                    ?: p[0].substringBefore('?').substringAfterLast('.', "")))
                .setLanguage(p.getOrNull(1) ?: "und")
                .setLabel(p.getOrNull(2))
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
        }
        val item = MediaItem.Builder().setUri(url).setSubtitleConfigurations(subConfigs).build()

        exo.setMediaItem(item, startMs)
        exo.playWhenReady = true
        exo.addListener(object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                currentTracks = tracks
                val audio = JSArray()
                val subs = JSArray()
                tracks.groups.forEachIndexed { gi, group ->
                    for (ti in 0 until group.length) {
                        val fmt = group.getTrackFormat(ti)
                        val o = JSObject()
                        o.put("id", "$gi/$ti")
                        o.put("lang", fmt.language ?: "")
                        o.put("label", fmt.label ?: fmt.language ?: "Track ${gi + 1}")
                        o.put("selected", group.isTrackSelected(ti))
                        when (group.type) {
                            C.TRACK_TYPE_AUDIO -> {
                                if (fmt.channelCount != Format.NO_VALUE) {
                                    o.put("channelCount", fmt.channelCount)
                                }
                                audio.put(o)
                            }
                            C.TRACK_TYPE_TEXT -> subs.put(o)
                            else -> {}
                        }
                    }
                }
                PlayerPlugin.sendTracks(audio, subs)
            }

            override fun onPlaybackStateChanged(state: Int) {
                val status = when (state) {
                    Player.STATE_BUFFERING -> "loading"
                    Player.STATE_READY -> "ready"
                    Player.STATE_ENDED -> "ended"
                    else -> "loading"
                }
                PlayerPlugin.sendState(status, null)
            }

            override fun onPlayerError(error: PlaybackException) {
                PlayerPlugin.sendState("error", error.errorCodeName)
            }

            override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    videoWidth = videoSize.width
                    videoHeight = videoSize.height
                    updatePipParams()
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updatePipParams()
            }
        })
        exo.prepare()
        startTicking()
    }

    private fun startTicking() {
        ticker.post(object : Runnable {
            override fun run() {
                val p = player ?: return
                PlayerPlugin.sendTick(
                    p.currentPosition / 1000.0,
                    if (p.duration > 0) p.duration / 1000.0 else 0.0,
                    p.bufferedPosition / 1000.0,
                    p.isPlaying,
                )
                ticker.postDelayed(this, 500)
            }
        })
    }

    fun doPlay() { player?.play() }
    fun doPause() { player?.pause() }
    fun doSeek(positionSec: Double) { player?.seekTo((positionSec * 1000).toLong()) }
    fun doStop() { finish() }

    fun doSetAudioTrack(id: String?) {
        val p = player ?: return
        val ov = overrideFor(id)
        Log.i("HarborPlayer", "doSetAudioTrack id=$id currentTracks=${currentTracks != null} override=${ov != null}")
        if (ov == null) return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setOverrideForType(ov)
            .build()
    }

    fun doSetSubtitleTrack(id: String?) {
        val p = player ?: return
        val b = p.trackSelectionParameters.buildUpon()
        if (id == null) {
            b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        } else {
            b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            val ov = overrideFor(id) ?: return
            b.setOverrideForType(ov)
        }
        p.trackSelectionParameters = b.build()
    }

    private fun overrideFor(id: String?): TrackSelectionOverride? {
        if (id == null) return null
        val tracks = currentTracks ?: return null
        val parts = id.split("/")
        if (parts.size != 2) return null
        val gi = parts[0].toIntOrNull() ?: return null
        val ti = parts[1].toIntOrNull() ?: return null
        val groups = tracks.groups
        if (gi < 0 || gi >= groups.size) return null
        val group = groups[gi]
        if (ti < 0 || ti >= group.length) return null
        return TrackSelectionOverride(group.mediaTrackGroup, ti)
    }

    fun enterPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
        if (isInPictureInPictureMode) return
        try {
            enterPictureInPictureMode(buildPipParams())
        } catch (e: IllegalStateException) {
            // Activity not in a valid state for PiP (for example finishing); ignore.
        } catch (e: IllegalArgumentException) {
            // Rejected aspect ratio; never crash playback over PiP.
        }
    }

    // Exact video aspect when inside Android's allowed PiP range (about 0.42..2.39),
    // otherwise clamped to the nearest legal ratio so setAspectRatio never throws.
    private fun pipAspect(): Rational {
        val w = if (videoWidth > 0) videoWidth else 16
        val h = if (videoHeight > 0) videoHeight else 9
        val ratio = w.toFloat() / h.toFloat()
        return when {
            ratio < 0.42f -> Rational(42, 100)
            ratio > 2.39f -> Rational(239, 100)
            else -> Rational(w, h)
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPipParams(): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder().setAspectRatio(pipAspect())
        val rect = Rect()
        if (playerView.getGlobalVisibleRect(rect)) builder.setSourceRectHint(rect)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(player?.isPlaying == true)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    // Keep the system's PiP params current so auto-enter and the aspect ratio
    // are correct the moment the user leaves the app.
    private fun updatePipParams() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || released) return
        try {
            setPictureInPictureParams(buildPipParams())
        } catch (e: IllegalArgumentException) {
            // Aspect still settling; the next update corrects it.
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (player?.isPlaying == true) enterPip()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        if (isInPictureInPictureMode) {
            playerView.useController = false
            playerView.hideController()
        } else {
            playerView.useController = true
            if (!isFinishing) enterImmersive()
        }
    }

    // Predictive back is disabled for this Activity (manifest enableOnBackInvokedCallback=false),
    // so BACK arrives as a key event. Intercept it here — before the media3 PlayerView in the
    // view tree can consume it to toggle its controls — so BACK always exits the player, which
    // drives onDestroy -> releasePlayer(notify=true) -> the 'closed' event -> the React view pops.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK &&
            event.action == KeyEvent.ACTION_UP &&
            !isInPictureInPictureMode
        ) {
            Log.i("HarborPlayer", "dispatchKeyEvent BACK up -> finish")
            finish()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations && !isInPictureInPictureMode) releasePlayer()
    }

    override fun onDestroy() {
        super.onDestroy()
        releasePlayer()
        if (instance === this) instance = null
    }

    private fun releasePlayer(notify: Boolean = true) {
        Log.i("HarborPlayer", "releasePlayer notify=$notify released=$released")
        if (released) return
        released = true
        ticker.removeCallbacksAndMessages(null)
        currentTracks = null
        mediaSession?.release()
        mediaSession = null
        val p = player
        if (p != null) {
            if (notify) {
                PlayerPlugin.sendClosed(
                    p.currentPosition / 1000.0,
                    if (p.duration > 0) p.duration / 1000.0 else 0.0,
                )
            }
            p.release()
        }
        player = null
    }

    private fun mimeFor(ext: String?): String = when (ext?.lowercase()) {
        "vtt", "text/vtt" -> MimeTypes.TEXT_VTT
        "ass", "ssa" -> MimeTypes.TEXT_SSA
        "ttml", "xml" -> MimeTypes.APPLICATION_TTML
        else -> MimeTypes.APPLICATION_SUBRIP
    }
}
