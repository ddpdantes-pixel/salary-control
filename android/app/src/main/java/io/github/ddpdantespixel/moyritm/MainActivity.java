package io.github.ddpdantespixel.moyritm;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
