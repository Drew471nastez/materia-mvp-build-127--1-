package com.storelib.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Entry-gate activity shown before the Capacitor WebView.
 *
 * On launch:
 *   1. Show a dark background immediately (no white flash).
 *   2. Call GET /api/app/session to check login state.
 *   3. If logged in  → jump straight to MainActivity with the right URL.
 *   4. If logged out → load the local welcome HTML (hero collage + auth buttons).
 */
public class WelcomeActivity extends AppCompatActivity {

    private static final String SESSION_URL = "https://storelib.com/api/app/session";
    private static final String URL_APP     = "https://storelib.com/app";
    private static final String URL_LIBRARY = "https://storelib.com/library";
    private static final String URL_SIGNUP  = "https://storelib.com/signup";
    private static final String URL_LOGIN   = "https://storelib.com/login";

    private WebView heroWebView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Edge-to-edge light chrome (matches MainActivity #F3F4F6 splash) ──
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        WindowInsetsControllerCompat ctrl =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        ctrl.setAppearanceLightStatusBars(true);       // dark icons on light bg
        ctrl.setAppearanceLightNavigationBars(true);

        setContentView(R.layout.activity_welcome);

        // ── Prepare the hero WebView (hidden until needed) ──────────
        heroWebView = findViewById(R.id.heroWebView);
        heroWebView.setBackgroundColor(0xFFF2F2F2); // matches window background — no dark flash
        heroWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        heroWebView.getSettings().setJavaScriptEnabled(true);
        heroWebView.getSettings().setDomStorageEnabled(true);
        heroWebView.getSettings().setLoadWithOverviewMode(true);
        heroWebView.getSettings().setUseWideViewPort(true);

        // JS → native bridge for the sign-up / log-in buttons
        heroWebView.addJavascriptInterface(new ButtonBridge(), "Android");

        // Block any external navigation from this WebView
        heroWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return true;
            }
        });

        // Make sure the CookieManager is ready before we read cookies
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(heroWebView, true);
        }

        // ── Check session in background ─────────────────────────────
        checkSession();
    }

    // ────────────────────────────────────────────────────────────────
    //  Session check
    // ────────────────────────────────────────────────────────────────

    private void checkSession() {
        executor.execute(() -> {
            try {
                URL url = new URL(SESSION_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8_000);
                conn.setReadTimeout(8_000);
                conn.setInstanceFollowRedirects(true);

                // Forward existing auth cookies so the server sees the session
                String cookies = CookieManager.getInstance().getCookie("https://storelib.com");
                if (cookies != null && !cookies.isEmpty()) {
                    conn.setRequestProperty("Cookie", cookies);
                }

                int status = conn.getResponseCode();
                if (status == 200) {
                    BufferedReader reader =
                            new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    if (json.optBoolean("loggedIn", false)) {
                        String type = json.optString("type", "buyer");
                        String target = ("creator".equals(type) || "seller".equals(type))
                                ? URL_APP
                                : URL_LIBRARY;
                        runOnUiThread(() -> openMain(target));
                        return;
                    }
                }
                conn.disconnect();
            } catch (Exception ignored) {
                // Network error → fall through to welcome screen
            }

            // Not logged in (or error) → show the welcome screen
            runOnUiThread(this::showWelcome);
        });
    }

    // ────────────────────────────────────────────────────────────────
    //  Navigation helpers
    // ────────────────────────────────────────────────────────────────

    private void showWelcome() {
        heroWebView.loadUrl("file:///android_asset/welcome/index.html");
        heroWebView.setVisibility(View.VISIBLE);
    }

    private void openMain(String targetUrl) {
        Intent intent = new Intent(this, MainActivity.class);
        // A tap on a push opens the launcher (this activity) with the push's
        // data in the extras. Carried on, so MainActivity's push plugin sees
        // the tap and the page opens the sale (lib/push/tap.ts).
        Bundle tapped = getIntent() != null ? getIntent().getExtras() : null;
        if (tapped != null) intent.putExtras(tapped);
        intent.putExtra(MainActivity.EXTRA_TARGET_URL, targetUrl);
        startActivity(intent);
        finish();                       // remove from back stack
        overridePendingTransition(0, 0); // no animation flash
    }

    // ────────────────────────────────────────────────────────────────
    //  JS → native bridge (called by buttons in index.html)
    // ────────────────────────────────────────────────────────────────

    public class ButtonBridge {
        @JavascriptInterface
        public void onSignUp() {
            runOnUiThread(() -> openMain(URL_SIGNUP));
        }

        @JavascriptInterface
        public void onLogIn() {
            runOnUiThread(() -> openMain(URL_LOGIN));
        }
    }

    // ────────────────────────────────────────────────────────────────

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}
