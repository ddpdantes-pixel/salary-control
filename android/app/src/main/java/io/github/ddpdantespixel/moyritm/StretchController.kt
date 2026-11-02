package io.github.ddpdantespixel.moyritm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.net.Uri
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

internal class StretchController private constructor(private val context: Context) {
    private val prefs = context.getSharedPreferences("moyritm_native_stretch_v1", Context.MODE_PRIVATE)
    private val alarm = context.getSystemService(AlarmManager::class.java)
    private val notifications = context.getSystemService(NotificationManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val audio = StretchAudio()
    private var service: StretchService? = null
    private var warning: String? = null
    private var state: StretchSession? = decode(prefs.getString("session", null))
    private var wake: PowerManager.WakeLock? = null
    private var lastCheckpoint = 0L
    private val tick = object : Runnable {
        override fun run() {
            advance()
            val s = state
            if (s?.status == "running" && service != null) {
                if (now() - lastCheckpoint >= 5_000) { checkpoint(); lastCheckpoint = now() }
                handler.postDelayed(this, 250)
            }
        }
    }

    init {
        state = state?.let { StretchClock.recover(it, now(), boot()) }
        persist()
        cancelAlarm()
        notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Таймер растяжки", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Управление запущенной вами растяжкой. Короткие сигналы используют громкость будильника."
            setSound(null, null); enableVibration(false); setShowBadge(false)
        })
    }

    @Synchronized fun snapshot(): JSONObject {
        val s = state
        val json = JSONObject().put("protocol", 1).put("backend", "android").put("status", s?.status ?: "stopped")
            .put("warning", warning ?: JSONObject.NULL).put("exactAlarmGranted", canSchedule())
        if (s != null) {
            val stage = s.stage(now())
            json.put("id", s.id).put("revision", s.revision).put("startedAt", s.startedAt)
                .put("stage", stage).put("remainingMs", s.remainingStage(now()))
                .put("totalRemainingMs", StretchSession.TOTAL - s.elapsed(now()))
                .put("timer", JSONObject().put("kind", "gym").put("gymPlanVersion", s.plan)
                    .put("status", s.status).put("startedAt", s.startedAt).put("dateId", s.dateId)
                    .put("stageIndex", stage).put("completedStages", if (s.status == "completed") 5 else stage)
                    .put("stageEndTimestamp", if (s.status == "running") System.currentTimeMillis() + s.remainingStage(now()) else JSONObject.NULL)
                    .put("pausedRemainingMs", if (s.status == "paused") s.remainingStage(now()) else JSONObject.NULL)
                    .put("completedAt", if (s.status == "completed") System.currentTimeMillis() else JSONObject.NULL))
        }
        return json
    }

    @Synchronized fun importLegacy(value: JSONObject?) {
        if (state != null || value == null || value.optString("kind") != "gym") return
        val stage = value.optInt("stageIndex", -1)
        val plan = value.optInt("gymPlanVersion", 1)
        val status = value.optString("status")
        val date = value.optString("dateId")
        if (stage !in 0..4 || value.optInt("completedStages", -1) != stage || plan !in 1..2 || status !in listOf("running", "paused")) return
        try { LocalDate.parse(date) } catch (_: Exception) { return }
        val bounds = StretchSession.bounds(plan)
        val previous = if (stage == 0) 0 else bounds[stage - 1]
        val duration = bounds[stage] - previous
        val remaining = if (status == "running") value.optLong("stageEndTimestamp", System.currentTimeMillis()) - System.currentTimeMillis()
            else value.optLong("pausedRemainingMs", -1)
        if (status == "paused" && remaining !in 0..duration) return
        val elapsed = (bounds[stage] - remaining).coerceIn(0, StretchSession.TOTAL)
        state = StretchSession(UUID.randomUUID().toString(), plan, if (elapsed == StretchSession.TOTAL) "completed" else "paused",
            elapsed, now(), value.optLong("startedAt", System.currentTimeMillis()).coerceAtLeast(0), date,
            bounds.count { elapsed >= it }, boot = boot())
        warning = if (status == "running") "Сохранённая растяжка приостановлена. Нажмите «Продолжить», чтобы запустить системный таймер." else null
        persist(); publish()
    }

    @Synchronized fun begin(sound: Boolean, vibration: Boolean) {
        check(canSchedule()) { "EXACT_ALARM_PERMISSION_REQUIRED" }
        check(state?.status != "running" && state?.status != "paused") { "SESSION_ALREADY_ACTIVE" }
        audio.cancel(); cancelAlarm()
        state = StretchSession(UUID.randomUUID().toString(), anchorMs = now(), startedAt = System.currentTimeMillis(),
            dateId = LocalDate.now().toString(), sound = sound, vibration = vibration, boot = boot())
        Log.i(StretchAudio.TAG, "START session=${state!!.id} elapsed=${state!!.anchorMs} wall=${state!!.startedAt}")
        warning = null; persist(); startService(); publish()
    }

    @Synchronized fun resume() {
        check(canSchedule()) { "EXACT_ALARM_PERMISSION_REQUIRED" }
        val s = state ?: return
        if (s.status != "paused") return
        state = StretchClock.resume(s, now()); warning = null; persist(); startService(); publish()
    }

    @Synchronized fun pause() {
        audio.cancel(); context.getSystemService(Vibrator::class.java).cancel(); cancelAlarm(); handler.removeCallbacks(tick)
        state = state?.let { StretchClock.pause(it, now()) }; persist()
        releaseWake(); service?.finishForeground(false); service = null
        if (state?.status == "paused") notifications.notify(NOTIFICATION, notification())
        publish()
    }

    @Synchronized fun stop() {
        audio.cancel(); context.getSystemService(Vibrator::class.java).cancel(); cancelAlarm(); handler.removeCallbacks(tick)
        state = state?.let { StretchClock.stop(it, now()) }; persist(); releaseWake()
        service?.finishForeground(true); service = null; notifications.cancel(NOTIFICATION); publish()
    }

    @Synchronized fun preferences(sound: Boolean, vibration: Boolean) {
        state = state?.copy(sound = sound, vibration = vibration)
        if (!sound) audio.cancel()
        persist(); publish()
    }

    @Synchronized fun attach(value: StretchService) {
        if (state?.status != "running") { value.stopSelf(); return }
        if (service === value) { value.beginForeground(notification()); return }
        service = value
        value.beginForeground(notification())
        wake = context.getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,
            "MoyRitm:stretch").apply { setReferenceCounted(false); acquire(15 * 60_000L) }
        schedule(); handler.removeCallbacks(tick); handler.post(tick)
    }

    @Synchronized fun detached(value: StretchService) {
        if (service !== value) return
        service = null; releaseWake(); audio.cancel(); cancelAlarm(); handler.removeCallbacks(tick)
        state = state?.let { StretchClock.pause(it, now()) }; persist(); publish()
    }

    @Synchronized fun alarm(id: String) {
        if (state?.id != id) return
        if (service == null) { // Never secretly restart an audio FGS after process death.
            state = state?.let { StretchClock.recover(it, now(), boot()) }; persist(); cancelAlarm(); publish(); return
        }
        advance()
    }

    @Synchronized fun timeChanged() { if (state?.status == "running" && service != null) { state = state?.let { it.copy(revision = it.revision + 1) }; persist(); schedule(); notifications.notify(NOTIFICATION, notification()); publish() } }

    @Synchronized private fun advance() {
        val s = state ?: return
        val event = StretchClock.advance(s, now())
        if (event.boundary == 0) return
        state = event.state; persist() // Commit before playback: duplicate delivery can never repeat a signal.
        Log.i(StretchAudio.TAG, "BOUNDARY session=${s.id} number=${event.boundary} elapsed=${s.position(now())} late=${event.late} sound=${event.audible}")
        if (event.late) warning = "Android задержал сигнал. Запоздалые сигналы не воспроизводятся."
        if (s.vibration && !event.late) {
            val vibrator = context.getSystemService(Vibrator::class.java)
            vibrator.vibrate(VibrationEffect.createWaveform(if (event.boundary == 5) longArrayOf(0, 100, 80, 100, 80, 100) else longArrayOf(0, 70, 60, 70), -1))
        }
        schedule(); notifications.notify(NOTIFICATION, notification()); publish()
        if (event.audible) audio.play(event.boundary == 5, { allowed(s.id) }) { played -> handler.post {
            synchronized(this) {
                if (state?.id != s.id) return@synchronized
                if (!played && state?.status != "stopped" && state?.status != "paused") { warning = "Android не подтвердил воспроизведение сигнала. Проверьте звук и режим «Не беспокоить»."; publish() }
                if (state?.status == "completed") finish()
            }
        } } else if (event.state.status == "completed") finish()
    }

    @Synchronized private fun allowed(id: String): Boolean = state?.let { it.id == id && it.sound && it.status in listOf("running", "completed") } == true

    @Synchronized fun testAudio(done: (Boolean) -> Unit) {
        if (state?.status == "running") { done(false); return }
        audio.play(false, { true }, done)
    }

    private fun startService() {
        try { context.startForegroundService(Intent(context, StretchService::class.java)) }
        catch (e: RuntimeException) { state = state?.let { StretchClock.pause(it, now()) }; persist(); throw e }
    }

    private fun schedule() {
        cancelAlarm()
        val s = state ?: return
        if (s.status != "running" || !canSchedule()) return
        val remaining = s.remainingStage(now()).coerceAtLeast(1)
        val operation = alarmIntent(s.id)
        val open = PendingIntent.getActivity(context, 40, Intent(context, MainActivity::class.java), FLAGS)
        // Alarm-clock semantics intentionally wake Doze. Not quota-limited allow-while-idle alarms.
        try { alarm.setAlarmClock(AlarmManager.AlarmClockInfo(System.currentTimeMillis() + remaining, open), operation) }
        catch (_: SecurityException) { warning = "Разрешение «Будильники и напоминания» отозвано. Таймер приостановлен."; pause() }
    }

    private fun cancelAlarm() { alarm.cancel(alarmIntent("")) }
    private fun alarmIntent(id: String): PendingIntent = PendingIntent.getBroadcast(context, 41,
        Intent(context, StretchReceiver::class.java).setAction(ACTION_BOUNDARY).putExtra("session", id), FLAGS)

    private fun action(name: String): PendingIntent = PendingIntent.getBroadcast(context, name.hashCode(),
        Intent(context, StretchReceiver::class.java).setAction(name)
            .setData(Uri.parse("moyritm-stretch:${state?.id}:$name")).putExtra("session", state?.id ?: ""), FLAGS)

    fun notification(): Notification {
        val s = state
        val title = if (s?.status == "paused") "Растяжка · пауза" else if (s?.status == "completed") "Растяжка завершена" else "Растяжка · 14 минут"
        val builder = Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title).setContentText(s?.let { StretchSession.names(it.plan)[it.stage(now())] } ?: "")
            .setContentIntent(PendingIntent.getActivity(context, 40, Intent(context, MainActivity::class.java), FLAGS))
            .setOnlyAlertOnce(true).setOngoing(s?.status == "running").setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_ALARM)
        if (s?.status == "running") builder.setWhen(System.currentTimeMillis() + StretchSession.TOTAL - s.elapsed(now()))
            .setUsesChronometer(true).setChronometerCountDown(true).addAction(Notification.Action.Builder(null, "Пауза", action(ACTION_PAUSE)).build())
        else if (s?.status == "paused") builder.addAction(Notification.Action.Builder(null, "Продолжить", action(ACTION_RESUME)).build())
        if (s?.status in listOf("running", "paused")) builder.addAction(Notification.Action.Builder(null, "Остановить", action(ACTION_STOP)).build())
        return builder.build()
    }

    fun canSchedule(): Boolean = Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()
    @Synchronized fun matches(id: String): Boolean = state?.id == id
    private fun finish() { handler.removeCallbacks(tick); cancelAlarm(); releaseWake(); service?.finishForeground(true); service = null; notifications.cancel(NOTIFICATION) }
    private fun releaseWake() { wake?.let { if (it.isHeld) it.release() }; wake = null }
    private fun now() = SystemClock.elapsedRealtime()
    private fun boot() = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 0)
    private fun checkpoint() { state = state?.let { if (it.status == "running") it.copy(elapsedMs = it.elapsed(now()), anchorMs = now()) else it }; persist() }
    private fun publish() { NativeStretchPlugin.changed(snapshot()) }
    private fun persist() { check(prefs.edit().putString("session", state?.let { encode(it).toString() }).commit()) { "TIMER_STATE_WRITE_FAILED" } }

    private fun encode(s: StretchSession) = JSONObject().put("id", s.id).put("plan", s.plan).put("status", s.status)
        .put("elapsedMs", s.elapsedMs).put("anchorMs", s.anchorMs).put("startedAt", s.startedAt).put("dateId", s.dateId)
        .put("delivered", s.delivered).put("sound", s.sound).put("vibration", s.vibration).put("boot", s.boot).put("revision", s.revision)
    private fun decode(raw: String?): StretchSession? = try {
        if (raw == null) null else JSONObject(raw).let { j ->
            val s = StretchSession(j.getString("id"), j.getInt("plan"), j.getString("status"), j.getLong("elapsedMs"),
                j.getLong("anchorMs"), j.getLong("startedAt"), j.getString("dateId"), j.getInt("delivered"), j.getBoolean("sound"), j.getBoolean("vibration"), j.getInt("boot"), j.optLong("revision"))
            require(s.plan in 1..2 && s.status in listOf("running", "paused", "completed", "stopped") && s.elapsedMs in 0..StretchSession.TOTAL && s.delivered in 0..5)
            LocalDate.parse(s.dateId); s
        }
    } catch (_: Exception) { warning = "Сеанс не удалось восстановить. Отметки здоровья не изменены."; null }

    companion object {
        const val CHANNEL = "moyritm-stretch"
        const val NOTIFICATION = 1400
        const val ACTION_BOUNDARY = "io.github.ddpdantespixel.moyritm.STRETCH_BOUNDARY"
        const val ACTION_PAUSE = "io.github.ddpdantespixel.moyritm.STRETCH_PAUSE"
        const val ACTION_RESUME = "io.github.ddpdantespixel.moyritm.STRETCH_RESUME"
        const val ACTION_STOP = "io.github.ddpdantespixel.moyritm.STRETCH_STOP"
        private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        @Volatile private var instance: StretchController? = null
        fun get(context: Context): StretchController = instance ?: synchronized(this) { instance ?: StretchController(context.applicationContext).also { instance = it } }
    }
}
