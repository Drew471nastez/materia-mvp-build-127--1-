package com.storelib.app;

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
 *    navigation to the public homepage and neutralises the Storelib
 *    logo link on auth pages.
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

        // ── Navigate to the URL chosen by WelcomeActivity ───────────
        String targetUrl = getIntent().getStringExtra(EXTRA_TARGET_URL);
        if (targetUrl != null) {
            WebView wv = getBridge().getWebView();
            // post() guarantees the load happens after the bridge's own
            // initial loadUrl() so it cleanly replaces it.
            wv.post(() -> wv.loadUrl(targetUrl));
        }
    }
}
