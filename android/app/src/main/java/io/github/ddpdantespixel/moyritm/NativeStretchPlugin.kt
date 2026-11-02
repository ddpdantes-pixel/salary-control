package io.github.ddpdantespixel.moyritm

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.lifecycle.Lifecycle
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.lang.ref.WeakReference

@CapacitorPlugin(name = "NativeStretchTimer", permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])])
class NativeStretchPlugin : Plugin() {
    override fun load() { instance = WeakReference(this) }
    override fun handleOnDestroy() { if (instance?.get() === this) instance = null; super.handleOnDestroy() }
    private fun visible() = activity?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) == true
    private fun controller() = StretchController.get(context)
    private fun result() = JSObject.fromJSONObject(controller().snapshot())

    @PluginMethod fun read(call: PluginCall) {
        activity.runOnUiThread {
            try { controller().importLegacy(call.getObject("legacy")); call.resolve(result()) }
            catch (e: RuntimeException) { call.reject("Состояние системного таймера недоступно", e) }
        }
    }

    @PluginMethod fun start(call: PluginCall) { prepare(call) }
    @PluginMethod fun resume(call: PluginCall) { prepare(call) }

    private fun prepare(call: PluginCall) {
        activity.runOnUiThread {
            if (!visible()) { call.reject("Таймер можно запустить только из открытого приложения", "VISIBLE_ACTIVITY_REQUIRED"); return@runOnUiThread }
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationPermission"); return@runOnUiThread
            }
            exact(call)
        }
    }

    @PermissionCallback private fun notificationPermission(call: PluginCall) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Разрешите уведомления, чтобы управлять растяжкой при блокировке экрана", "NOTIFICATION_PERMISSION_REQUIRED"); return
        }
        exact(call)
    }

    private fun exact(call: PluginCall) {
        if (!visible()) { call.reject("Вернитесь в приложение и нажмите «Продолжить»", "VISIBLE_ACTIVITY_REQUIRED"); return }
        if (!controller().canSchedule() && Build.VERSION.SDK_INT >= 31) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
            startActivityForResult(call, intent, "exactPermission"); return
        }
        begin(call)
    }

    @ActivityCallback private fun exactPermission(call: PluginCall?, ignored: ActivityResult) {
        if (call == null) return
        if (!controller().canSchedule()) {
            call.reject("Для сигналов 5/6/7/9/14 минут при выключенном экране разрешите «Будильники и напоминания»", "EXACT_ALARM_PERMISSION_REQUIRED"); return
        }
        activity.window.decorView.post { begin(call) }
    }

    private fun begin(call: PluginCall) {
        if (!visible()) { call.reject("Запустите таймер из открытого приложения", "VISIBLE_ACTIVITY_REQUIRED"); return }
        try {
            if (call.methodName == "resume") controller().resume()
            else controller().begin(call.getBoolean("soundEnabled", true) == true, call.getBoolean("vibrationEnabled", true) == true)
            call.resolve(result())
        } catch (e: RuntimeException) { call.reject(e.message ?: "Системный таймер не запущен", e) }
    }

    @PluginMethod fun pause(call: PluginCall) = command(call) { controller().pause() }
    @PluginMethod fun stop(call: PluginCall) = command(call) { controller().stop() }
    @PluginMethod fun preferences(call: PluginCall) = command(call) {
        controller().preferences(call.getBoolean("soundEnabled", true) == true, call.getBoolean("vibrationEnabled", true) == true)
    }
    @PluginMethod fun testSound(call: PluginCall) {
        if (!visible()) { call.reject("Проверяйте звук из открытого приложения"); return }
        controller().testAudio { played -> call.resolve(JSObject().put("played", played)) }
    }
    private fun command(call: PluginCall, action: () -> Unit) { activity.runOnUiThread {
        try { action(); call.resolve(result()) } catch (e: RuntimeException) { call.reject("Команда таймера не выполнена", e) }
    } }

    companion object {
        private var instance: WeakReference<NativeStretchPlugin>? = null
        internal fun changed(state: JSONObject) { instance?.get()?.let { plugin -> plugin.notifyListeners("state", JSObject.fromJSONObject(state)) } }
    }
}
