package app.harbor.player

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SubArg {
    lateinit var url: String
    var lang: String? = null
    var label: String? = null
}

@InvokeArg
class LoadArgs {
    lateinit var url: String
    var headers: Map<String, String> = emptyMap()
    var subtitles: List<SubArg> = emptyList()
    var startAtSec: Double = 0.0
    var title: String? = null
}

@InvokeArg
class SeekArgs {
    var positionSec: Double = 0.0
}

@InvokeArg
class TrackArgs {
    var trackId: String? = null
}

/**
 * Tauri plugin that launches the native media3 player and forwards its
 * position/state to the frontend via plugin events ("tick", "state", "closed").
 */
@TauriPlugin
class PlayerPlugin(private val activity: Activity) : Plugin(activity) {

    init {
        instance = this
    }

    companion object {
        @Volatile
        private var instance: PlayerPlugin? = null

        fun sendTick(pos: Double, dur: Double, buf: Double, playing: Boolean) {
            val o = JSObject()
            o.put("positionSec", pos)
            o.put("durationSec", dur)
            o.put("bufferedSec", buf)
            o.put("playing", playing)
            instance?.trigger("tick", o)
        }

        fun sendState(status: String, errorCode: String?) {
            val o = JSObject()
            o.put("status", status)
            if (errorCode != null) o.put("errorCode", errorCode)
            instance?.trigger("state", o)
        }

        fun sendClosed(pos: Double, dur: Double) {
            val o = JSObject()
            o.put("positionSec", pos)
            o.put("durationSec", dur)
            instance?.trigger("closed", o)
        }

        fun sendTracks(audio: JSArray, subtitle: JSArray) {
            val o = JSObject()
            o.put("audio", audio)
            o.put("subtitle", subtitle)
            instance?.trigger("tracks", o)
        }
    }

    @Command
    fun load(invoke: Invoke) {
        val args = invoke.parseArgs(LoadArgs::class.java)
        val intent = Intent(activity, PlayerActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        intent.putExtra("url", args.url)
        intent.putExtra("startMs", (args.startAtSec * 1000).toLong())
        intent.putExtra("headerKeys", args.headers.keys.toTypedArray())
        intent.putExtra("headerVals", args.headers.values.toTypedArray())
        intent.putExtra(
            "subs",
            args.subtitles.map { "${it.url}|${it.lang ?: ""}|${it.label ?: ""}|" }.toTypedArray(),
        )
        activity.startActivity(intent)
        invoke.resolve(JSObject())
    }

    @Command
    fun play(invoke: Invoke) {
        activity.runOnUiThread { PlayerActivity.instance?.doPlay() }
        invoke.resolve(JSObject())
    }

    @Command
    fun pause(invoke: Invoke) {
        activity.runOnUiThread { PlayerActivity.instance?.doPause() }
        invoke.resolve(JSObject())
    }

    @Command
    fun seek(invoke: Invoke) {
        val args = invoke.parseArgs(SeekArgs::class.java)
        activity.runOnUiThread { PlayerActivity.instance?.doSeek(args.positionSec) }
        invoke.resolve(JSObject())
    }

    @Command
    fun stop(invoke: Invoke) {
        activity.runOnUiThread { PlayerActivity.instance?.doStop() }
        invoke.resolve(JSObject())
    }

    @Command
    fun setAudioTrack(invoke: Invoke) {
        val args = invoke.parseArgs(TrackArgs::class.java)
        activity.runOnUiThread { PlayerActivity.instance?.doSetAudioTrack(args.trackId) }
        invoke.resolve(JSObject())
    }

    @Command
    fun setSubtitleTrack(invoke: Invoke) {
        val args = invoke.parseArgs(TrackArgs::class.java)
        activity.runOnUiThread { PlayerActivity.instance?.doSetSubtitleTrack(args.trackId) }
        invoke.resolve(JSObject())
    }

    @Command
    fun enterPip(invoke: Invoke) {
        activity.runOnUiThread { PlayerActivity.instance?.enterPip() }
        invoke.resolve(JSObject())
    }
}
