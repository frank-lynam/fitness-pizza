package com.fitnesspizza.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Held during an active run to keep the CPU awake (screen off but JS
    // still executing) so GPS callbacks and TTS announcements continue.
    private PowerManager.WakeLock wakeLock;

    // Held during TTS announcements to duck media audio (navigation-style).
    private volatile AudioFocusRequest focusRequest;

    // Native TTS engine — runs independently of WebView lifecycle.
    private TextToSpeech nativeTts;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FitnessPizza:RunTracker");

        nativeTts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                nativeTts.setLanguage(java.util.Locale.US);
                nativeTts.setSpeechRate(1.0f);
                nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { releaseAudioDuck(); }
                    @Override public void onError(String id) { releaseAudioDuck(); }
                });
            }
        });

        getBridge().getWebView().addJavascriptInterface(new Object() {

            @JavascriptInterface
            public void setRunActive(boolean active) {
                if (active) {
                    if (!wakeLock.isHeld()) wakeLock.acquire();
                } else {
                    if (wakeLock.isHeld()) wakeLock.release();
                }
            }

            @JavascriptInterface
            public void speak(String text) {
                if (nativeTts == null) return;
                requestAudioDuck();
                Bundle params = new Bundle();
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
                nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params,
                    "run_" + System.currentTimeMillis());
            }

        }, "AndroidBridge");
    }

    @Override
    public void onDestroy() {
        if (nativeTts != null) {
            nativeTts.stop();
            nativeTts.shutdown();
            nativeTts = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    void requestAudioDuck() {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
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

    void releaseAudioDuck() {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            am.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        } else {
            am.abandonAudioFocus(null);
        }
    }

    // Android 5–8: screen lock triggers onPause only.
    @Override
    public void onPause() {
        super.onPause();
        if (wakeLock.isHeld()) {
            getBridge().getWebView().onResume();
        }
    }

    // Android 9+: screen lock also triggers onStop — handle it the same way.
    @Override
    public void onStop() {
        super.onStop();
        if (wakeLock.isHeld()) {
            getBridge().getWebView().onResume();
        }
    }
}
