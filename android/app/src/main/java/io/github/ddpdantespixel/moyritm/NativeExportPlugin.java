package io.github.ddpdantespixel.moyritm;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "NativeExport")
public class NativeExportPlugin extends Plugin {
    private WebView printView;

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null || call.getString("data") == null) {
            call.reject("File name and data are required");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "writeSelectedFile");
    }

    @ActivityCallback
    private void writeSelectedFile(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No document selected"); return; }
        new Thread(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("Cannot open document");
                output.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
                call.resolve(new JSObject());
            } catch (Exception exception) {
                call.reject("Cannot save document", exception);
            }
        }).start();
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null) { call.reject("HTML is required"); return; }
        getActivity().runOnUiThread(() -> {
            if (printView != null) printView.destroy();
            printView = new WebView(getContext());
            printView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    if (manager == null) { call.reject("Printing is unavailable"); return; }
                    manager.print("Moy Ritm report", view.createPrintDocumentAdapter("Moy Ritm"), null);
                    call.resolve();
                }
            });
            printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (printView != null) printView.destroy();
    }
}
