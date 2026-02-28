package com.storelib.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor's main WebView activity, customised for Storelib:
 *
 * 1. Reads a TARGET_URL from the launching intent and loads it
 *    instead of the default server URL (so logged-in creators land
 *    on /app and buyers on /library).
 *
 * 2. Installs {@link StorelibWebViewClient} which blocks any
 *    navigation to the public homepage and opens Google/Supabase OAuth
 *    URLs in a Chrome Custom Tab instead of the WebView.
 *
 * 3. Handles HTTPS App Links from https://storelib.com/app/auth/callback
 *    — the URL Android intercepts after OAuth completes in the Custom Tab.
 *    On return we navigate directly to /app; the session was established
 *    in the Custom Tab and the server validates it on the /app request.
 */
public class MainActivity extends BridgeActivity {

    /** Intent extra key used by {@link WelcomeActivity}. */
    public static final String EXTRA_TARGET_URL = "TARGET_URL";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() == null) return;  // safety (no WebView installed)

        // ── Replace the default WebViewClient with ours ─────────────
        getBridge().setWebViewClient(new StorelibWebViewClient(getBridge()));

        // ── Route to the correct URL ─────────────────────────────────
        handleIncomingIntent(getIntent());
    }

    /**
     * Called when the activity is already running (singleTask) and a new
     * intent arrives — specifically when the App Link fires while the user
     * is already inside the app.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (getBridge() != null) {
            handleIncomingIntent(intent);
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  Intent routing
    // ────────────────────────────────────────────────────────────────

    /** The app destination after a successful OAuth round-trip. */
    private static final String URL_APP = "https://storelib.com/app";

    /**
     * Decides which URL to load based on what triggered this activity:
     *
     * • App Link (https://storelib.com/app/auth/callback)
     *   → load https://storelib.com/app directly.
     *     OAuth completed in the Custom Tab; the server-side session is
     *     already established via the callback, so hitting /app will
     *     succeed. We do NOT pass the raw callback URL into the WebView
     *     because the code/token in the URL is single-use and was
     *     already consumed by the browser before the App Link fired.
     *
     * • Normal launch from WelcomeActivity (EXTRA_TARGET_URL extra)
     *   → load whatever URL WelcomeActivity chose (/app, /library,
     *     /signup, or /login).
     */
    private void handleIncomingIntent(Intent intent) {
        Uri data = intent.getData();
        if (data != null) {
            String path = data.getPath();
            if (path != null && path.startsWith("/app/auth/callback")) {
                // App Link return from OAuth — go straight to /app.
                loadInWebView(URL_APP);
                return;
            }
        }

        // Normal launch: WelcomeActivity put the target URL in extras.
        String targetUrl = intent.getStringExtra(EXTRA_TARGET_URL);
        if (targetUrl != null) {
            loadInWebView(targetUrl);
        }
    }

    /**
     * Posts a loadUrl call so it runs AFTER Capacitor's own initial
     * loadUrl(), cleanly replacing it.
     */
    private void loadInWebView(String url) {
        WebView wv = getBridge().getWebView();
        wv.post(() -> wv.loadUrl(url));
    }
}
