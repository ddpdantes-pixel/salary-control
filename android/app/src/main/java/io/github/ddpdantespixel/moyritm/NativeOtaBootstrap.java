package io.github.ddpdantespixel.moyritm;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.plugin.WebView;

/** Select the new APK's builtin before loading WebView; retain OTA files, records and anti-replay state. */
final class NativeOtaBootstrap {
    private static final String PREFS = "moyritm_native_bootstrap_v1";
    static boolean prepare(Context context) {
        try {
            long code = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
            return prepare(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
                context.getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE),
                context.getSharedPreferences("moyritm_ota_control_v1", Context.MODE_PRIVATE), code);
        } catch (android.content.pm.PackageManager.NameNotFoundException error) {
            throw new IllegalStateException("NATIVE_VERSION_UNAVAILABLE", error);
        }
    }

    static boolean prepare(SharedPreferences own, SharedPreferences updater, SharedPreferences control, long currentCode) {
        if (currentCode <= 0) throw new IllegalStateException("INVALID_NATIVE_VERSION");
        if (own.getLong("nativeCode", 0) == currentCode) return false;
        // Capgo resetWhenUpdate also deletes old bundles. That option is disabled in this APK.
        // These are selector pointers only; bundle *_info records and all files remain untouched.
        if (!updater.edit().putString(WebView.CAP_SERVER_PATH, "").putString("pastVersion", "builtin")
                .remove("nextVersion").remove("previewFallbackVersion").commit()) {
            throw new IllegalStateException("NATIVE_BUILTIN_SELECTION_FAILED");
        }
        if (!control.edit().remove("pending").remove("pendingNativeCode").commit()) {
            throw new IllegalStateException("NATIVE_OLD_QUEUE_CANCEL_FAILED");
        }
        // Commit this marker last; an interrupted transition is safely repeated on the next launch.
        if (!own.edit().putLong("nativeCode", currentCode).commit()) throw new IllegalStateException("NATIVE_BOOTSTRAP_MARKER_FAILED");
        return true;
    }
}
