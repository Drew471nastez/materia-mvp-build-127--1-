package com.storelib.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

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

    /** Full-screen dark overlay shown during OAuth callback processing. */
    private View authLoadingOverlay;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable safetyTimeout;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() == null) return;  // safety (no WebView installed)

        // ── Replace the default WebViewClient with ours ─────────────
        getBridge().setWebViewClient(new StorelibWebViewClient(getBridge()));

        // ── Auth loading overlay (dark screen + spinner over the WebView) ──
        setupAuthLoadingOverlay();

        // ── JS bridge: window.StorelibNative.authDone() ─────────────
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void authDone() {
                mainHandler.post(() -> hideAuthLoading());
            }
        }, "StorelibNative");

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

    /**
     * Decides which URL to load based on what triggered this activity:
     *
     * • App Link (https://storelib.com/app/auth/callback?code=…)
     *   → do NOT navigate the WebView. Return immediately.
     *     Capacitor's BridgeActivity.onNewIntent (called via super above)
     *     has already queued the appUrlOpen event for the JavaScript layer.
     *     CapacitorAuthHandler in the WebView JS calls
     *     supabase.auth.exchangeCodeForSession(code) using the PKCE
     *     code-verifier that was stored by signInWithOAuth in this same
     *     WebView context — then navigates to /app or /library.
     *     Loading the URL here would navigate the WebView to the server
     *     route before JS can handle the code, so we must not do it.
     *
     * • Normal launch from WelcomeActivity (EXTRA_TARGET_URL extra)
     *   → load whatever URL WelcomeActivity chose (/app, /library,
     *     /signup, or /login).
     */
    private void handleIncomingIntent(Intent intent) {
        Uri data = intent.getData();
        if (data != null) {
            String scheme = data.getScheme();
            // Custom-scheme OAuth callback: storelib://auth/callback?code=…
            if ("storelib".equals(scheme)) {
                // Show loading overlay instantly so the user never sees the
                // login/signup page while the code exchange runs in JS.
                showAuthLoading();
                // Let Capacitor's appUrlOpen event handle the exchange.
                return;
            }
            // HTTPS App Link OAuth callback: https://storelib.com/app/auth/callback?code=…
            String path = data.getPath();
            if (path != null && path.startsWith("/app/auth/callback")) {
                showAuthLoading();
                return;
            }

            // HTTPS App Link: password-reset email link — load directly in WebView.
            // The reset-password page is a public Next.js page (no auth needed);
            // it validates the token and lets the user set a new password.
            if (path != null && path.startsWith("/reset-password")) {
                loadInWebView(data.toString());
                return;
            }
        }

        // Normal launch: WelcomeActivity put the target URL in extras.
        String targetUrl = intent.getStringExtra(EXTRA_TARGET_URL);
        if (targetUrl != null) {
            loadInWebView(targetUrl);
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  Auth loading overlay
    // ────────────────────────────────────────────────────────────────

    private void setupAuthLoadingOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.parseColor("#050505"));
        overlay.setVisibility(View.GONE);
        overlay.setClickable(true);  // absorb touches while loading

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.getIndeterminateDrawable()
                .setColorFilter(0xFF7c3aed, PorterDuff.Mode.SRC_IN);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                dpToPx(48), dpToPx(48), Gravity.CENTER);
        overlay.addView(spinner, lp);

        ViewGroup root = findViewById(android.R.id.content);
        root.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        authLoadingOverlay = overlay;
    }

    /** Show the dark overlay + spinner instantly. */
    public void showAuthLoading() {
        if (authLoadingOverlay == null) return;
        authLoadingOverlay.setAlpha(1f);
        authLoadingOverlay.setVisibility(View.VISIBLE);

        // Safety timeout: auto-hide after 15 s in case the flow stalls.
        if (safetyTimeout != null) mainHandler.removeCallbacks(safetyTimeout);
        safetyTimeout = this::hideAuthLoading;
        mainHandler.postDelayed(safetyTimeout, 15_000);
    }

    /** Fade out the overlay (300 ms). No-op if already hidden. */
    public void hideAuthLoading() {
        if (authLoadingOverlay == null
                || authLoadingOverlay.getVisibility() != View.VISIBLE) return;
        if (safetyTimeout != null) {
            mainHandler.removeCallbacks(safetyTimeout);
            safetyTimeout = null;
        }
        authLoadingOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction(() -> {
                    authLoadingOverlay.setVisibility(View.GONE);
                    authLoadingOverlay.setAlpha(1f);
                })
                .start();
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density + 0.5f);
    }

    // ────────────────────────────────────────────────────────────────

    /**
     * Posts a loadUrl call so it runs AFTER Capacitor's own initial
     * loadUrl(), cleanly replacing it.
     */
    private void loadInWebView(String url) {
        WebView wv = getBridge().getWebView();
        wv.post(() -> wv.loadUrl(url));
    }
}
