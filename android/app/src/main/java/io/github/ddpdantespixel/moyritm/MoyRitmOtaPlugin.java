package io.github.ddpdantespixel.moyritm;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "MoyRitmOta")
public class MoyRitmOtaPlugin extends Plugin {
    private SharedPreferences state;
    private boolean startupClaimed;

    @Override public void load() {
        state = getContext().getSharedPreferences("moyritm_ota_control_v1", Context.MODE_PRIVATE);
    }

    @PluginMethod public void readState(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("nativeVersion", info.versionName);
            result.put("nativeCode", PackageInfoCompat.getLongVersionCode(info));
            result.put("channel", getConfig().getString("channel", "stable"));
            result.put("manifestUrl", getConfig().getString("manifestUrl", ""));
            result.put("lastCheck", state.getString("lastCheck", ""));
            result.put("pending", state.getString("pending", ""));
            result.put("attemptedBuild", state.getString("attemptedBuild", ""));
            call.resolve(result);
        } catch (Exception error) { call.reject("Cannot read update state"); }
    }

    @PluginMethod public void verifyManifest(PluginCall call) {
        new Thread(() -> {
            try {
                PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
                JSONObject verified;
                // Signature checks and sequence persistence form one anti-replay transaction.
                synchronized (state) {
                    verified = OtaManifestPolicy.verify(call.getString("payload"), call.getString("signature"),
                        getConfig().getString("publicKey", ""), getConfig().getString("channel", "stable"),
                        getContext().getPackageName(), PackageInfoCompat.getLongVersionCode(info),
                        state.getLong("sequence", 0), System.currentTimeMillis(), getContext().getFilesDir().getUsableSpace(),
                        getConfig().getString("contractFingerprint", ""));
                    if (!state.edit().putLong("sequence", verified.getLong("sequence"))
                            .putString("lastCheck", java.time.Instant.now().toString()).commit()) throw new IllegalStateException("STATE_WRITE_FAILED");
                }
                call.resolve(JSObject.fromJSONObject(verified));
            } catch (Exception error) {
                String message = error instanceof SecurityException ? error.getMessage() : "INVALID_MANIFEST";
                call.reject(message, error.getClass().getSimpleName());
            }
        }, "moyritm-ota-verification").start();
    }

    @PluginMethod public void recordAttempt(PluginCall call) {
        String id = call.getString("buildId", "");
        if (!id.matches("[A-Za-z0-9._-]{1,100}")) { call.reject("INVALID_BUILD_ID"); return; }
        if (state.edit().putString("attemptedBuild", id).commit()) call.resolve(); else call.reject("STATE_WRITE_FAILED");
    }

    @PluginMethod public void queue(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.matches("[A-Za-z0-9_-]{1,100}")) { call.reject("INVALID_BUNDLE_ID"); return; }
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            if (state.edit().putString("pending", id).putLong("pendingNativeCode", PackageInfoCompat.getLongVersionCode(info)).commit()) call.resolve();
            else call.reject("STATE_WRITE_FAILED");
        } catch (Exception error) { call.reject("INVALID_NATIVE_VERSION"); }
    }

    // A cold Activity launch gets one claim. A foreground/resume never reloads the page.
    @PluginMethod public synchronized void takePending(PluginCall call) {
        if (startupClaimed) { JSObject empty = new JSObject(); empty.put("id", ""); call.resolve(empty); return; }
        String id = state.getString("pending", "");
        startupClaimed = true;
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            if (state.getLong("pendingNativeCode", -1) != PackageInfoCompat.getLongVersionCode(info)) id = "";
        } catch (Exception error) { call.reject("INVALID_NATIVE_VERSION"); return; }
        if (!state.edit().remove("pending").remove("pendingNativeCode").commit()) { call.reject("STATE_WRITE_FAILED"); return; }
        JSObject response = new JSObject();
        response.put("id", id);
        call.resolve(response);
    }
}
