package com.fitnesspizza.app;

import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock wakeLock;
    private volatile AudioFocusRequest focusRequest;
    private TextToSpeech nativeTts;

    // Native GPS tracking — runs independently of WebView so TTS fires
    // even when the screen is locked and JS is frozen.
    private LocationManager locationManager;
    private LocationListener nativeLocListener;
    private volatile double nativePrevLat = Double.NaN;
    private volatile double nativePrevLon = Double.NaN;
    private volatile double nativeTotalDistKm = 0;
    private volatile int nativeHalfKmsAnnounced = 0;
    private volatile boolean nativeRunPaused = false;
    private volatile long nativeSegmentStartMs = 0;
    private volatile long nativeTotalElapsedMs = 0;

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

            // Called by JS when the user taps Start Run.
            // Starts native GPS listener for screen-off TTS announcements.
            @JavascriptInterface
            public void startNativeRun(double weightKg) {
                nativePrevLat = Double.NaN;
                nativePrevLon = Double.NaN;
                nativeTotalDistKm = 0;
                nativeHalfKmsAnnounced = 0;
                nativeRunPaused = false;
                nativeSegmentStartMs = System.currentTimeMillis();
                nativeTotalElapsedMs = 0;
                if (!wakeLock.isHeld()) wakeLock.acquire();
                startLocationUpdates();
            }

            @JavascriptInterface
            public void pauseNativeRun() {
                if (!nativeRunPaused) {
                    nativeTotalElapsedMs += System.currentTimeMillis() - nativeSegmentStartMs;
                    nativeSegmentStartMs = 0;
                    nativeRunPaused = true;
                    nativePrevLat = Double.NaN; // prevent distance jump on resume
                }
            }

            @JavascriptInterface
            public void resumeNativeRun() {
                if (nativeRunPaused) {
                    nativeSegmentStartMs = System.currentTimeMillis();
                    nativeRunPaused = false;
                }
            }

            @JavascriptInterface
            public void stopNativeRun() {
                stopLocationUpdates();
                if (wakeLock.isHeld()) wakeLock.release();
            }

            // Called by JS for event TTS (start, pause, resume, finish) when
            // the screen is on. The native GPS listener handles km milestones.
            @JavascriptInterface
            public void speak(String text) {
                nativeSpeak(text);
            }

        }, "AndroidBridge");
    }

    private void startLocationUpdates() {
        if (locationManager == null) {
            locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        }
        if (nativeLocListener != null) {
            try { locationManager.removeUpdates(nativeLocListener); } catch (Exception ignored) {}
        }
        nativeLocListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location loc) {
                if (nativeRunPaused) return;
                double lat = loc.getLatitude();
                double lon = loc.getLongitude();
                if (!Double.isNaN(nativePrevLat)) {
                    double d = haversineKm(nativePrevLat, nativePrevLon, lat, lon);
                    if (d < 0.5) {
                        nativeTotalDistKm += d;
                        int halfKms = (int) (nativeTotalDistKm * 2);
                        if (halfKms > nativeHalfKmsAnnounced && halfKms > 0) {
                            nativeHalfKmsAnnounced = halfKms;
                            long elapsed = nativeTotalElapsedMs
                                + (nativeSegmentStartMs > 0
                                    ? System.currentTimeMillis() - nativeSegmentStartMs : 0);
                            announceKmMilestone(halfKms, elapsed / 1000L);
                        }
                    }
                }
                nativePrevLat = lat;
                nativePrevLon = lon;
            }
        };
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, 0L, 1.0f,
                    nativeLocListener, Looper.getMainLooper());
            }
        } catch (Exception ignored) {}
    }

    private void stopLocationUpdates() {
        if (locationManager != null && nativeLocListener != null) {
            try { locationManager.removeUpdates(nativeLocListener); } catch (Exception ignored) {}
            nativeLocListener = null;
        }
    }

    private void announceKmMilestone(int halfKms, long elapsedSec) {
        double distMi = (halfKms * 0.5) / 1.60934;
        double elapsedHr = elapsedSec / 3600.0;
        double speedMph = elapsedHr > 0 ? distMi / elapsedHr : 0;
        String distStr = (halfKms % 2 == 0)
            ? String.valueOf(halfKms / 2)
            : String.format(java.util.Locale.US, "%.1f", halfKms * 0.5);
        String plural = (halfKms == 2) ? "" : "s";
        String timeStr = spokenDuration(elapsedSec);
        String text = String.format(java.util.Locale.US,
            "%s kilometer%s. %s. %.1f miles per hour.",
            distStr, plural, timeStr, speedMph);
        nativeSpeak(text);
    }

    void nativeSpeak(String text) {
        if (nativeTts == null) return;
        requestAudioDuck();
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params,
            "run_" + System.currentTimeMillis());
    }

    private static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dPhi = Math.toRadians(lat2 - lat1);
        double dLam = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                 + Math.cos(phi1) * Math.cos(phi2)
                 * Math.sin(dLam / 2) * Math.sin(dLam / 2);
        return 6371.0 * 2.0 * Math.asin(Math.sqrt(a));
    }

    private static String spokenDuration(long totalSec) {
        long h = totalSec / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        StringBuilder sb = new StringBuilder();
        if (h > 0) sb.append(h).append(h == 1 ? " hour" : " hours").append(" ");
        if (m > 0) sb.append(m).append(m == 1 ? " minute" : " minutes");
        if (h == 0 && s > 0) {
            if (m > 0) sb.append(" ");
            sb.append(s).append(s == 1 ? " second" : " seconds");
        }
        String result = sb.toString().trim();
        return result.isEmpty() ? "0 seconds" : result;
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

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        if (nativeTts != null) {
            nativeTts.stop();
            nativeTts.shutdown();
            nativeTts = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public void onPause() {
        super.onPause();
        if (wakeLock != null && wakeLock.isHeld()) {
            getBridge().getWebView().onResume();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (wakeLock != null && wakeLock.isHeld()) {
            getBridge().getWebView().onResume();
        }
    }
}
