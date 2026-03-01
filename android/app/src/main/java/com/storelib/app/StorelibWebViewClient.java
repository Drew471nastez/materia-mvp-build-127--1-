package com.storelib.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
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
 * 1. Intercept OAuth navigations and open them in a Chrome Custom Tab.
 *    Two interception points cover the full redirect chain:
 *
 *    a) Supabase auth URLs (*.supabase.co/auth/*) — this is the FIRST
 *       hop: when the user taps "Continue with Google" the Next.js login
 *       page navigates the WebView to Supabase's OAuth endpoint, which
 *       then redirects onward to Google. We catch it here before Google
 *       even sees the request.
 *
 *    b) Google sign-in URLs (accounts.google.com, oauth2.googleapis.com)
 *       — safety net for any flow that bypasses Supabase or arrives via
 *       a direct link. Google's policy forbids OAuth in embedded WebViews.
 *
 *    The Custom Tab shares Chrome's cookie jar, so signed-in users often
 *    get one-tap consent. After auth the backend redirects to
 *    https://storelib.com/app/auth/callback, which the App Link in
 *    AndroidManifest.xml intercepts and routes to MainActivity.
 *
 * 2. Block any top-level navigation to the public homepage ("/").
 *    The app must never show storelib.com's marketing page.
 *
 * 3. After auth pages finish loading, inject a small JS snippet that
 *    neutralises clicks on the Storelib logo (which normally links to "/").
 */
public class StorelibWebViewClient extends BridgeWebViewClient {

    // ── Google OAuth host patterns ──────────────────────────────────
    // accounts.google.com   — interactive sign-in / consent screen
    // oauth2.googleapis.com — token endpoints (rarely navigated, but safe)
    private static final String[] GOOGLE_OAUTH_HOSTS = {
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

        // 0. Logout deep link → clear cookies and return to WelcomeActivity.
        //    Called from JS via window.location.assign("storelib://logout")
        //    after supabase.auth.signOut() completes.
        if ("storelib".equals(uri.getScheme()) && "logout".equals(uri.getHost())) {
            // Wipe auth cookies so WelcomeActivity.checkSession() sees no session
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();

            // CLEAR_TASK removes MainActivity from the back stack;
            // WelcomeActivity becomes the new task root.
            Context ctx = view.getContext();
            Intent intent = new Intent(ctx, WelcomeActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            ctx.startActivity(intent);
            return true;
        }

        // 1. OAuth URL → Chrome Custom Tab
        //    Two-layer catch covering the full redirect chain:
        //    • Supabase auth (first hop from the login page)
        //    • Google sign-in (second hop, and safety net for direct links)
        //    After consent, the backend redirects to
        //    https://storelib.com/app/auth/callback which the App Link
        //    intercepts and routes back to MainActivity.
        if (isOAuthUrl(uri)) {
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

        if (url != null) {
            if (isAuthPage(url)) {
                view.evaluateJavascript(BLOCK_HOMEPAGE_LINKS_JS, null);
            }

            // Dismiss the auth loading overlay once any page finishes loading.
            // The overlay is only visible during OAuth callback processing, so
            // hideAuthLoading() is a no-op when it's already hidden.
            if (view.getContext() instanceof MainActivity) {
                ((MainActivity) view.getContext()).hideAuthLoading();
            }
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
     * Returns true if this URL should be opened in a Custom Tab rather
     * than the WebView — covers the auth/start entry point plus all OAuth hops.
     *
     * storelib.com/auth/start  — MUST be first so Chrome (not WebView) receives
     *   the PKCE code-verifier Set-Cookie, keeping it in Chrome's jar for the
     *   subsequent /auth/callback code exchange.
     * *.supabase.co/auth/*     — first OAuth hop from Supabase's authorize URL.
     * accounts.google.com / oauth2.googleapis.com — Google consent screen.
     */
    private static boolean isOAuthUrl(Uri uri) {
        return isAuthStartUrl(uri) || isSupabaseOAuthUrl(uri) || isGoogleOAuthUrl(uri);
    }

    /**
     * Matches https://storelib.com/auth/start?*
     *
     * Opening this in a Custom Tab (rather than the WebView) is the key fix for
     * the PKCE cookie-jar isolation problem: Chrome receives the 302 response
     * from /auth/start that carries Set-Cookie for the PKCE code verifier, so
     * the verifier ends up in Chrome's cookie jar. When Chrome later navigates
     * to /auth/callback the verifier is present and exchangeCodeForSession
     * succeeds.
     */
    private static boolean isAuthStartUrl(Uri uri) {
        String host = uri.getHost();
        if (host == null || !host.equals("storelib.com")) return false;
        String path = uri.getPath();
        return path != null && path.startsWith("/auth/start");
    }

    /**
     * Matches any Supabase auth endpoint: *.supabase.co/auth/*
     *
     * This catches the navigation triggered when the login page calls
     * supabase.auth.signInWithOAuth({ provider: 'google' }), which
     * sends the WebView to https://PROJECT.supabase.co/auth/v1/authorize.
     * Intercepting here means Google never sees the request inside a WebView.
     */
    private static boolean isSupabaseOAuthUrl(Uri uri) {
        String host = uri.getHost();
        if (host == null || !host.endsWith(".supabase.co")) return false;
        String path = uri.getPath();
        return path != null && path.startsWith("/auth/");
    }

    /**
     * Matches Google sign-in and token hosts.
     * Also catches subdomains (e.g. sso.accounts.google.com) via endsWith.
     */
    private static boolean isGoogleOAuthUrl(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        for (String oauthHost : GOOGLE_OAUTH_HOSTS) {
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
