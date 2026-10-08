package com.storelib.app;

import android.app.Dialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Message;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * STRIPE'S OWN WINDOWS, INSIDE THE APP.
 *
 * Stripe's embedded payout setup opens windows of its own from inside its
 * frame: the sign in to Stripe, a bank's login while linking the payout
 * account. With one window only, the WebView loaded such a window over the
 * app itself, or Capacitor handed it to Chrome, and the form that asked for
 * it never heard back. Multiple windows are on now, and this decides each
 * new one by the first address it loads:
 *
 *   a Stripe page   drawn in a full screen window over the app, with Done,
 *                   keeping its opener so it can answer the form
 *   anything else   handed to Capacitor exactly as before (the browser for
 *                   another site, the app itself for one of ours)
 *
 * Every other part of Capacitor's chrome client (file pickers, camera and
 * microphone permission, console) is inherited unchanged.
 */
public class StorelibChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;
    private Dialog shown;
    private WebView shownWeb;

    public StorelibChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    static boolean isStripe(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase();
        return h.equals("stripe.com") || h.endsWith(".stripe.com") || h.equals("stripe.network") || h.endsWith(".stripe.network");
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        final WebView popup = new WebView(view.getContext());
        WebSettings settings = popup.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(view.getSettings().getUserAgentString());
        CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);

        popup.setWebViewClient(new WebViewClient() {
            /** Decided on the first real address; about:blank is a window its opener is still filling in. */
            private boolean decided = false;

            private boolean decide(WebView w, String url) {
                if (decided || url == null || url.isEmpty() || url.startsWith("about:")) return false;
                decided = true;
                Uri uri = Uri.parse(url);
                if (isStripe(uri.getHost())) {
                    show(w);
                    return false;
                }
                /* Not Stripe: what one window used to do with it. */
                w.stopLoading();
                w.post(w::destroy);
                if (!bridge.launchIntent(uri)) bridge.getWebView().loadUrl(url);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest request) {
                return decide(w, request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView w, String url, Bitmap favicon) {
                decide(w, url);
                super.onPageStarted(w, url, favicon);
            }
        });
        popup.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                close(window);
            }
        });

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
    }

    @Override
    public void onCloseWindow(WebView window) {
        close(window);
        super.onCloseWindow(window);
    }

    /** A full screen window over the app: a white bar with Done, the page under it. */
    private void show(WebView popup) {
        if (shown != null && shownWeb == popup) return;
        if (shown != null) close(shownWeb);

        Dialog dialog = new Dialog(bridge.getActivity(), android.R.style.Theme_Material_Light_NoActionBar);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout column = new LinearLayout(bridge.getActivity());
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(Color.WHITE);

        FrameLayout bar = new FrameLayout(bridge.getActivity());
        bar.setBackgroundColor(Color.WHITE);
        float density = bridge.getActivity().getResources().getDisplayMetrics().density;
        TextView done = new TextView(bridge.getActivity());
        done.setText("Done");
        done.setTextSize(17);
        done.setTextColor(0xFF1A1A2E);
        done.setTypeface(done.getTypeface(), android.graphics.Typeface.BOLD);
        int pad = (int) (16 * density);
        done.setPadding(pad, pad / 2, pad, pad / 2);
        done.setOnClickListener(v -> {
            popup.evaluateJavascript("window.close()", null);
            close(popup);
        });
        FrameLayout.LayoutParams doneAt = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL);
        bar.addView(done, doneAt);
        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (52 * density)));

        android.view.View line = new android.view.View(bridge.getActivity());
        line.setBackgroundColor(0xFFECEEF1);
        column.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, (int) density)));

        if (popup.getParent() instanceof ViewGroup) ((ViewGroup) popup.getParent()).removeView(popup);
        column.addView(popup, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        dialog.setContentView(column);
        dialog.setOnCancelListener(d -> {
            popup.evaluateJavascript("window.close()", null);
            close(popup);
        });
        shown = dialog;
        shownWeb = popup;
        dialog.show();
    }

    private void close(WebView window) {
        if (window != null && window == shownWeb && shown != null) {
            Dialog dialog = shown;
            shown = null;
            shownWeb = null;
            if (dialog.isShowing()) dialog.dismiss();
            /* Not inside the WebView's own callback that is closing it. */
            window.post(window::destroy);
        }
    }
}
