package com.fitnesspizza.app;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Set true while a run is active so the WebView keeps executing JS when
    // the screen is locked. Cleared when the run overlay is closed.
    static volatile boolean runActive = false;

    // Held during TTS announcements to duck media audio (navigation-style).
    private volatile AudioFocusRequest focusRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new Object() {

            @JavascriptInterface
            public void setRunActive(boolean active) {
                runActive = active;
            }

            // Call before TTS.speak() to lower competing audio (music, podcasts).
            @JavascriptInterface
            public void requestAudioDuck() {
                AudioManager am = (AudioManager) MainActivity.this.getSystemService(AUDIO_SERVICE);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                        .build();
                    am.requestAudioFocus(focusRequest);
                } else {
                    am.requestAudioFocus(null, AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
                }
            }

            // Call after TTS.speak() completes to restore audio levels.
            @JavascriptInterface
            public void releaseAudioDuck() {
                AudioManager am = (AudioManager) MainActivity.this.getSystemService(AUDIO_SERVICE);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                    am.abandonAudioFocusRequest(focusRequest);
                    focusRequest = null;
                } else {
                    am.abandonAudioFocus(null);
                }
            }

        }, "AndroidBridge");
    }

    // Android 5–8: screen lock triggers onPause only.
    @Override
    public void onPause() {
        super.onPause();
        if (runActive) {
            getBridge().getWebView().onResume();
        }
    }

    // Android 9+: screen lock also triggers onStop — handle it the same way.
    @Override
    public void onStop() {
        super.onStop();
        if (runActive) {
            getBridge().getWebView().onResume();
        }
    }
}
