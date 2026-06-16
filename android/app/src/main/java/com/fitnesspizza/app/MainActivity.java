package com.fitnesspizza.app;

import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock wakeLock;
    private volatile AudioFocusRequest focusRequest;
    private TextToSpeech nativeTts;
    private AudioTrack silentTrack;
    private Thread silentFeedThread;
    private volatile boolean runAudioActive = false;

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
    private volatile boolean nativeRunActive = false;
    private volatile boolean nativeSilentMode = false;
    private volatile double nativeElevGainM = 0;
    private volatile double nativeElevLossM = 0;
    private volatile double nativePrevAltM = Double.NaN;
    private static final double NATIVE_ELEV_NOISE_M = 3.0;
    private volatile boolean nativePacingMode = false;
    private volatile double nativePacingWindowDistKm = 0;
    private volatile long nativePacingWindowTimeMs = 0;

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
                    @Override public void onDone(String id) {}
                    @Override public void onError(String id) {}
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
                nativeRunActive = true;
                nativeSilentMode = false;
                nativeElevGainM = 0;
                nativeElevLossM = 0;
                nativePrevAltM = Double.NaN;
                nativePacingMode = false;
                nativePacingWindowDistKm = 0;
                nativePacingWindowTimeMs = 0;
                if (!wakeLock.isHeld()) wakeLock.acquire();
                acquireRunAudio();
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
                nativeRunActive = false;
                stopLocationUpdates();
                releaseRunAudio();
                if (wakeLock.isHeld()) wakeLock.release();
            }

            @JavascriptInterface
            public void setSilentMode(boolean silent) {
                nativeSilentMode = silent;
            }

            @JavascriptInterface
            public void setPacingMode(boolean pacing) {
                nativePacingMode = pacing;
                // Reset window so the first interval starts from now
                nativePacingWindowDistKm = nativeTotalDistKm;
                nativePacingWindowTimeMs = System.currentTimeMillis();
            }

            @JavascriptInterface
            public String getNativeElevation() {
                return String.format(java.util.Locale.US,
                    "{\"gainM\":%.1f,\"lossM\":%.1f,\"distKm\":%.3f}",
                    nativeElevGainM, nativeElevLossM, nativeTotalDistKm);
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
                if (loc.hasAltitude()) {
                    double alt = loc.getAltitude();
                    if (Double.isNaN(nativePrevAltM)) {
                        nativePrevAltM = alt;
                    } else {
                        double delta = alt - nativePrevAltM;
                        if (Math.abs(delta) >= NATIVE_ELEV_NOISE_M) {
                            if (delta > 0) nativeElevGainM += delta;
                            else nativeElevLossM += Math.abs(delta);
                            nativePrevAltM = alt;
                        }
                    }
                }
                // Pacing mode: announce windowed speed every 30 s
                if (nativePacingMode && nativePacingWindowTimeMs > 0) {
                    long nowMs = System.currentTimeMillis();
                    if (nowMs - nativePacingWindowTimeMs >= 30000) {
                        double dKm = nativeTotalDistKm - nativePacingWindowDistKm;
                        double dMi = dKm / 1.60934;
                        double dtHours = (nowMs - nativePacingWindowTimeMs) / 3600000.0;
                        double speedMph = dtHours > 0 ? dMi / dtHours : 0;
                        nativePacingWindowDistKm = nativeTotalDistKm;
                        nativePacingWindowTimeMs = nowMs;
                        if (speedMph > 0.5) {
                            nativeSpeak(String.format(java.util.Locale.US,
                                "%.1f miles per hour.", speedMph));
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

    private void announceCurrentPosition() {
        long elapsed = nativeTotalElapsedMs
            + (nativeSegmentStartMs > 0 ? System.currentTimeMillis() - nativeSegmentStartMs : 0);
        double distMi = nativeTotalDistKm / 1.60934;
        double elapsedHr = elapsed / 3600000.0;
        double speedMph = elapsedHr > 0 ? distMi / elapsedHr : 0;
        String timeStr = spokenDuration(elapsed / 1000L);
        String text = String.format(java.util.Locale.US,
            "%.2f kilometers. %s. %.1f miles per hour.",
            nativeTotalDistKm, timeStr, speedMph);
        nativeSpeak(text);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (nativeRunActive
                && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            announceCurrentPosition();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void announceKmMilestone(int halfKms, long elapsedSec) {
        if (nativeSilentMode) return;
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
        // Audio focus is held for the entire run and the silent AudioTrack keeps the
        // hardware DAC warm, so we can speak immediately without the 500 ms pre-warm delay.
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        new android.os.Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (nativeTts != null) {
                nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params,
                    "run_" + System.currentTimeMillis());
            }
        }, 50);
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

    // Acquire audio focus and start a silent AudioTrack for the entire run duration.
    // Holding focus + keeping the DAC alive via the silent track eliminates the hardware
    // wake-up latency that clips the first syllable of TTS announcements.
    void acquireRunAudio() {
        runAudioActive = true;
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
        try {
            int sampleRate = 8000;
            int bufSize = Math.max(
                AudioTrack.getMinBufferSize(sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT),
                1600);
            silentTrack = new AudioTrack(AudioManager.STREAM_MUSIC, sampleRate,
                AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
                bufSize, AudioTrack.MODE_STREAM);
            silentTrack.setVolume(0.01f);
            silentTrack.play();
            final byte[] silence = new byte[bufSize];
            silentFeedThread = new Thread(() -> {
                while (runAudioActive && silentTrack != null) {
                    silentTrack.write(silence, 0, silence.length);
                }
            });
            silentFeedThread.setDaemon(true);
            silentFeedThread.start();
        } catch (Exception ignored) {}
    }

    void releaseRunAudio() {
        runAudioActive = false;
        if (silentFeedThread != null) {
            silentFeedThread.interrupt();
            silentFeedThread = null;
        }
        if (silentTrack != null) {
            try { silentTrack.stop(); silentTrack.release(); } catch (Exception ignored) {}
            silentTrack = null;
        }
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
        releaseRunAudio();
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
