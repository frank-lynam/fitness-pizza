package com.fitnesspizza.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Set to true while a run is active so the WebView keeps executing JS
    // even when the screen is locked (power button). Without this Capacitor
    // pauses the WebView, queuing up GPS callbacks and TTS until unlock.
    static volatile boolean runActive = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setRunActive(boolean active) {
                runActive = active;
            }
        }, "AndroidBridge");
    }

    @Override
    public void onPause() {
        super.onPause();
        // If a run is in progress, immediately un-pause the WebView so GPS
        // callbacks and TTS continue firing while the screen is locked.
        if (runActive) {
            getBridge().getWebView().onResume();
        }
    }
}
