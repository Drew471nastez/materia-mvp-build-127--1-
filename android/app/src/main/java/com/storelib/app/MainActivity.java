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
import android.widget.ImageView;
import android.widget.LinearLayout;
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
 *
 * 4. Shows a white native loading overlay (logo + spinner) from first
 *    frame until the web app calls StorelibNative.appReady(), eliminating
 *    any blank or black gap between the splash screen and real content.
 */
public class MainActivity extends BridgeActivity {

    /** Intent extra key used by {@link WelcomeActivity}. */
    public static final String EXTRA_TARGET_URL = "TARGET_URL";

    /** Full-screen white overlay shown until the web app signals it is ready. */
    private View loadingOverlay;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable safetyTimeout;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the splash image visible behind the WebView until the web app
        // signals it is ready.  Without this the window background defaults to
        // the theme colour (white) which could cause a brief blank frame.
        getWindow().setBackgroundDrawableResource(R.drawable.splash);

        if (getBridge() == null) return;  // safety (no WebView installed)

        // ── Replace the default WebViewClient with ours ─────────────
        getBridge().setWebViewClient(new StorelibWebViewClient(getBridge()));

        // ── Loading overlay: white + logo + spinner ───────────────────
        setupLoadingOverlay();

        // Show immediately so there is never an empty frame between the
        // OS splash and the first WebView paint.
        showOverlay();

        // Make the WebView background transparent so the splash / overlay is
        // visible behind it while the page is loading.
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);

        // ── JS bridge: window.StorelibNative ─────────────────────────
        getBridge().getWebView().addJavascriptInterface(new Object() {

            /** Called by OAuth flow start — keep overlay visible. */
            @JavascriptInterface
            public void authStart() {
                mainHandler.post(() -> showOverlay());
            }

            /** Legacy: called by native-oauth.ts after code exchange completes. */
            @JavascriptInterface
            public void authDone() {
                // Overlay is now dismissed by appReady() once the destination
                // page renders.  This method is kept for back-compat but is a
                // no-op so the overlay doesn't vanish before the new page loads.
            }

            /** Called by the web app once the first meaningful UI is visible. */
            @JavascriptInterface
            public void appReady() {
                mainHandler.post(() -> hideOverlay());
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
            // Custom-scheme callback: storelib://auth/callback
            // Handles both OAuth (code=…) and recovery (type=recovery&access_token=…)
            if ("storelib".equals(scheme)) {
                // Show loading overlay instantly so the user never sees the
                // login/signup page while the code exchange / recovery runs in JS.
                showOverlay();
                // Let Capacitor's appUrlOpen event handle it — native-oauth.ts
                // detects recovery vs OAuth and routes accordingly.
                return;
            }
            // HTTPS App Link OAuth callback: https://storelib.com/app/auth/callback?code=…
            String path = data.getPath();
            if (path != null && path.startsWith("/app/auth/callback")) {
                showOverlay();
                return;
            }

            // HTTPS App Link: password-reset recovery link.
            // Supabase redirects here with #access_token=…&type=recovery in the
            // hash fragment, but Android's intent system may strip the fragment.
            //
            // Strategy: show loading overlay and let Capacitor fire appUrlOpen.
            // The JS handler in native-oauth.ts extracts tokens from the URL's
            // hash fragment (if preserved), stores them in sessionStorage, and
            // navigates to /reset-password. The page reads from sessionStorage.
            //
            // This approach works reliably on both Android and iOS, and avoids
            // the hash-fragment-stripping problem that loadInWebView() has.
            if (path != null && path.startsWith("/reset-password")) {
                showOverlay();
                return;
            }

            // HTTPS App Link: Stripe checkout success/cancel redirect.
            // After completing payment in the browser, Stripe redirects to
            // storelib.com/app/settings/billing?success=1 — load it in the
            // WebView so the user lands back in the app on the billing page.
            if (path != null && path.startsWith("/app/settings/billing")) {
                String query = data.getQuery();
                String inAppUrl = path + (query != null ? "?" + query : "");
                loadInWebView(inAppUrl);
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
    //  Loading overlay
    // ────────────────────────────────────────────────────────────────

    /**
     * Builds a full-screen white overlay containing the app icon and a
     * purple spinner, then attaches it to the root content view.
     *
     * Layout:
     *   FrameLayout (white, MATCH_PARENT)
     *     └─ LinearLayout (vertical, centred)
     *          ├─ ImageView  — ic_launcher  (72 dp)
     *          └─ ProgressBar              (32 dp, 20 dp top margin)
     */
    private void setupLoadingOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.WHITE);
        overlay.setVisibility(View.GONE);
        overlay.setClickable(true);  // absorb touches while loading

        // Vertical stack centred on screen
        LinearLayout stack = new LinearLayout(this);
        stack.setOrientation(LinearLayout.VERTICAL);
        stack.setGravity(Gravity.CENTER_HORIZONTAL);

        // App logo
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        LinearLayout.LayoutParams logoLp =
                new LinearLayout.LayoutParams(dpToPx(72), dpToPx(72));
        stack.addView(logo, logoLp);

        // Spinner
        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.getIndeterminateDrawable()
                .setColorFilter(0xFF7c3aed, PorterDuff.Mode.SRC_IN);
        LinearLayout.LayoutParams spinnerLp =
                new LinearLayout.LayoutParams(dpToPx(32), dpToPx(32));
        spinnerLp.topMargin = dpToPx(20);
        stack.addView(spinner, spinnerLp);

        FrameLayout.LayoutParams stackLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        overlay.addView(stack, stackLp);

        ViewGroup root = findViewById(android.R.id.content);
        root.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        loadingOverlay = overlay;
    }

    /** Show the white overlay + spinner instantly. */
    public void showOverlay() {
        if (loadingOverlay == null) return;
        // Cancel any in-progress fade-out animation
        loadingOverlay.animate().cancel();
        loadingOverlay.setAlpha(1f);
        loadingOverlay.setVisibility(View.VISIBLE);

        // Safety timeout: auto-hide after 12 s in case the web app never calls
        // appReady() (e.g., a JavaScript error on first load).
        if (safetyTimeout != null) mainHandler.removeCallbacks(safetyTimeout);
        safetyTimeout = this::hideOverlay;
        mainHandler.postDelayed(safetyTimeout, 12_000);
    }

    /** Fade out the overlay (300 ms). No-op if already hidden. */
    public void hideOverlay() {
        if (loadingOverlay == null
                || loadingOverlay.getVisibility() != View.VISIBLE) return;
        if (safetyTimeout != null) {
            mainHandler.removeCallbacks(safetyTimeout);
            safetyTimeout = null;
        }
        loadingOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction(() -> {
                    loadingOverlay.setVisibility(View.GONE);
                    loadingOverlay.setAlpha(1f);
                })
                .start();
    }

    // ── Back-compat aliases used by StorelibWebViewClient ────────────
    /** @deprecated Use {@link #showOverlay()} */
    public void showAuthLoading() { showOverlay(); }
    /** @deprecated Use {@link #hideOverlay()} */
    public void hideAuthLoading() { hideOverlay(); }

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
