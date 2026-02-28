package com.storelib.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Custom WebViewClient that extends Capacitor's {@link BridgeWebViewClient}
 * so all Capacitor functionality (local server, JS injection, plugins) is
 * preserved — we add three behaviours on top:
 *
 * 1. Intercept Google OAuth navigations and open them in a Chrome Custom
 *    Tab instead. This is required because Google blocks OAuth flows inside
 *    embedded WebViews. The Custom Tab shares the system browser's cookie
 *    jar with Chrome, so the user is often already signed into Google.
 *    After auth, the backend redirects to
 *    https://storelib.com/app/auth/callback which the App Link defined in
 *    AndroidManifest.xml intercepts and hands back to MainActivity.
 *
 * 2. Block any top-level navigation to the public homepage ("/").
 *    The app must never show storelib.com's marketing page.
 *
 * 3. After auth pages finish loading, inject a small JS snippet that
 *    neutralises clicks on the Storelib logo (which normally links to "/").
 */
public class StorelibWebViewClient extends BridgeWebViewClient {

    // ── Google OAuth host patterns ──────────────────────────────────
    // accounts.google.com  — interactive sign-in / consent screen
    // oauth2.googleapis.com — token endpoints (rarely navigated, but safe)
    private static final String[] OAUTH_HOSTS = {
            "accounts.google.com",
            "oauth2.googleapis.com",
    };

    // Storelib brand violet (#7c3aed) for the Custom Tab toolbar colour.
    private static final int CUSTOM_TAB_COLOR = 0xFF7c3aed;

    /** JS snippet that disables every &lt;a&gt; pointing at the homepage. */
    private static final String BLOCK_HOMEPAGE_LINKS_JS =
            "(function(){"
            + "document.querySelectorAll('a').forEach(function(a){"
            +   "var h=a.getAttribute('href');"
            +   "if(h==='/'||h==='https://storelib.com/'||h==='https://storelib.com'){"
            +     "a.onclick=function(e){e.preventDefault();e.stopPropagation();return false};"
            +     "a.removeAttribute('href');"
            +     "a.style.cursor='default';"
            +   "}"
            + "});"
            // Also catch future SPA-injected links via MutationObserver
            + "if(!window.__slHomepageBlocker){"
            +   "window.__slHomepageBlocker=true;"
            +   "new MutationObserver(function(){"
            +     "document.querySelectorAll('a[href=\"/\"],a[href=\"https://storelib.com/\"],a[href=\"https://storelib.com\"]')"
            +       ".forEach(function(a){"
            +         "a.onclick=function(e){e.preventDefault();e.stopPropagation();return false};"
            +         "a.removeAttribute('href');"
            +         "a.style.cursor='default';"
            +       "});"
            +   "}).observe(document.body,{childList:true,subtree:true});"
            + "}"
            + "})();";

    /** Paths where we inject the homepage-link blocker. */
    private static final String[] AUTH_PATHS = {
            "/login", "/signup", "/verify", "/forgot-password",
            "/reset-password", "/confirm-email"
    };

    public StorelibWebViewClient(Bridge bridge) {
        super(bridge);
    }

    // ────────────────────────────────────────────────────────────────
    //  Navigation intercept — Google OAuth + homepage guard
    // ────────────────────────────────────────────────────────────────

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();

        // 1. Google OAuth → Chrome Custom Tab
        //    Catches the navigation triggered when the user taps
        //    "Continue with Google" on /login or /signup.
        //    Google's policy forbids OAuth inside embedded WebViews, so we
        //    redirect to the system browser. After the user consents, the
        //    backend redirects to https://storelib.com/app/auth/callback,
        //    which the App Link in AndroidManifest.xml intercepts and routes
        //    back to MainActivity.onNewIntent (or onCreate if cold-start).
        if (isGoogleOAuthUrl(uri)) {
            openInCustomTab(view.getContext(), uri);
            return true;   // cancel the WebView navigation
        }

        // 2. Storelib homepage → swallow
        if (isHomepageUrl(uri)) {
            return true;
        }

        return super.shouldOverrideUrlLoading(view, request);
    }

    // ────────────────────────────────────────────────────────────────
    //  Inject homepage-link blocker on auth pages
    // ────────────────────────────────────────────────────────────────

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);

        if (url != null && isAuthPage(url)) {
            view.evaluateJavascript(BLOCK_HOMEPAGE_LINKS_JS, null);
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  Chrome Custom Tab launcher
    // ────────────────────────────────────────────────────────────────

    /**
     * Opens {@code uri} in a Chrome Custom Tab with Storelib brand colours.
     * Custom Tabs share the user's existing Chrome session (cookies, saved
     * passwords) — if the user is already signed into Google in Chrome they
     * often get a one-tap consent screen with no password required.
     */
    private static void openInCustomTab(Context context, Uri uri) {
        CustomTabColorSchemeParams colorParams = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(CUSTOM_TAB_COLOR)
                .build();

        new CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(colorParams)
                .setShowTitle(true)
                .build()
                .launchUrl(context, uri);
    }

    // ────────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * Returns true for any Google sign-in or OAuth host.
     * Also catches subdomains (e.g. sso.accounts.google.com) via endsWith.
     */
    private static boolean isGoogleOAuthUrl(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        for (String oauthHost : OAUTH_HOSTS) {
            if (host.equals(oauthHost) || host.endsWith("." + oauthHost)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isHomepageUrl(Uri uri) {
        String host = uri.getHost();
        if (host == null || !host.contains("storelib.com")) return false;
        String path = uri.getPath();
        return path == null || path.isEmpty() || "/".equals(path);
    }

    private static boolean isAuthPage(String url) {
        for (String p : AUTH_PATHS) {
            if (url.contains(p)) return true;
        }
        return false;
    }
}
