package io.github.ddpdantespixel.moyritm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class StretchReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val controller = StretchController.get(context)
        if (intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) {
            controller.timeChanged(); return
        }
        val id = intent.getStringExtra("session") ?: return
        if (!controller.matches(id)) return
        try {
            when (intent.action) {
                StretchController.ACTION_BOUNDARY -> controller.alarm(id)
                StretchController.ACTION_PAUSE -> controller.pause()
                StretchController.ACTION_RESUME -> controller.resume() // Explicit notification action grants user intent/WIU.
                StretchController.ACTION_STOP -> controller.stop()
            }
        } catch (e: RuntimeException) { Log.e(StretchAudio.TAG, "Notification action failed: ${e.javaClass.simpleName}"); controller.pause() }
    }
}
