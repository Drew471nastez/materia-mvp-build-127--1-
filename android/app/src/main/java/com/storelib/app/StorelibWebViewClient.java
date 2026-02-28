package com.storelib.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Custom WebViewClient that extends Capacitor's {@link BridgeWebViewClient}
 * so all Capacitor functionality (local server, JS injection, plugins) is
 * preserved — we only add two behaviours on top:
 *
 * 1. Block any top-level navigation to the public homepage ("/").
 *    The app must never show storelib.com's marketing page.
 *
 * 2. After auth pages finish loading, inject a small JS snippet that
 *    neutralises clicks on the Storelib logo (which normally links to "/").
 */
public class StorelibWebViewClient extends BridgeWebViewClient {

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
    //  Block top-level navigation to the homepage
    // ────────────────────────────────────────────────────────────────

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isHomepageUrl(uri)) {
            return true;   // swallow the navigation
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
    //  Helpers
    // ────────────────────────────────────────────────────────────────

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
