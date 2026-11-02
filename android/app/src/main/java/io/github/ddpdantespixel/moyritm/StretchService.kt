package io.github.ddpdantespixel.moyritm

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class StretchService : Service() {
    private var latestStartId = 0
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        latestStartId = startId
        StretchController.get(this).attach(this)
        return START_NOT_STICKY
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { StretchController.get(this).detached(this); super.onDestroy() }

    internal fun beginForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= 29) startForeground(StretchController.NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(StretchController.NOTIFICATION, notification)
    }
    internal fun finishForeground(remove: Boolean) {
        stopForeground(if (remove) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH)
        stopSelf(latestStartId)
    }
}
