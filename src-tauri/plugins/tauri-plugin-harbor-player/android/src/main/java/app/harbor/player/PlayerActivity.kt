package app.harbor.player

import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView

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

    companion object {
        @Volatile
        var instance: PlayerActivity? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player_view)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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

        val subConfigs = (intent.getStringArrayExtra("subs") ?: emptyArray()).mapNotNull { spec ->
            val p = spec.split("|")
            if (p.isEmpty() || p[0].isBlank()) return@mapNotNull null
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(p[0]))
                .setMimeType(mimeFor(p.getOrNull(3)))
                .setLanguage(p.getOrNull(1) ?: "und")
                .setLabel(p.getOrNull(2))
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
        }
        val item = MediaItem.Builder().setUri(url).setSubtitleConfigurations(subConfigs).build()

        exo.setMediaItem(item, startMs)
        exo.playWhenReady = true
        exo.addListener(object : Player.Listener {
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

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) releasePlayer()
    }

    override fun onDestroy() {
        super.onDestroy()
        releasePlayer()
        if (instance === this) instance = null
    }

    private fun releasePlayer() {
        if (released) return
        released = true
        ticker.removeCallbacksAndMessages(null)
        val p = player
        if (p != null) {
            PlayerPlugin.sendClosed(
                p.currentPosition / 1000.0,
                if (p.duration > 0) p.duration / 1000.0 else 0.0,
            )
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
