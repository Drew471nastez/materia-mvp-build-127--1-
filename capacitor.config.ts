import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Storelib iOS + Android.
 *
 * server.url
 *   Capacitor loads the web layer from the live production deployment instead
 *   of from bundled static files. This means:
 *   - Web code updates ship the moment Vercel deploys — no App Store release needed.
 *   - Server Actions, API routes, and SSR all work as normal.
 *   - The native Capacitor bridge (Preferences, Browser, etc.) is still injected
 *     by the native wrapper, so all native plugins work from the hosted app.
 *
 * webDir (out/)
 *   Still required by Capacitor CLI. out/index.html acts as an offline fallback:
 *   it performs a synchronous localStorage auth check and navigates to the correct
 *   production URL route when the server cannot be reached on first load.
 *
 * Development
 *   To test against a local dev server, temporarily set:
 *     server: { url: 'http://YOUR_LOCAL_IP:3000', cleartext: true }
 *   then run: npx cap sync && open ios/App/App.xcworkspace
 */
const config: CapacitorConfig = {
  appId: 'com.storelib.app',
  appName: 'Storelib',
  webDir: 'out',
  server: {
    url: 'https://storelib.com/native-start',
    cleartext: false,
    // Append "Capacitor" to the WKWebView User-Agent header so the
    // server (proxy.ts) can detect native requests and redirect "/" → "/native-start"
    // as a safety net. Without this, the default WKWebView UA is a plain
    // Safari-like string with no way to distinguish native from browser.
    appendUserAgent: 'Capacitor',
    // The last line of defence, and only that.
    //
    // A host listed here is one WKWebView will navigate to IN PLACE instead of
    // handing to the system browser. It does not stop a navigation — it stops
    // the navigation from ejecting the buyer out of the app mid-purchase.
    //
    // The actual fix for Stripe lives in the web layer, where it can ship
    // without an App Store release: advancedFraudSignals is switched off in
    // lib/stripe-client.ts so the frame that triggers the page-level handoff is
    // never requested, and proxy.ts serves a frame-src that ALLOWS Stripe's
    // frames — an earlier version blocked them, which is what made Stripe.js
    // reach for the handoff in the first place.
    //
    //   js.stripe.com    Elements, the controller, Link, 3DS challenge frames
    //   hooks.stripe.com 3DS bank-auth redirect-return host
    //   m.stripe.network the fraud host; listed so that if it is ever reached
    //                    it stays in-app rather than opening Safari
    //
    // NOTE: changes here need `npx cap sync` and a native rebuild to take
    // effect. The web-layer fixes do not.
    allowNavigation: ['js.stripe.com', 'hooks.stripe.com', 'm.stripe.network'],
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
    allowsLinkPreview: false,
    backgroundColor: '#f2f2f2',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f2f2f2',
  },
  plugins: {
    SplashScreen: {
      // Do NOT auto-hide the splash — we call SplashScreen.hide() manually
      // from the final destination page (/app, /library, /welcome) after
      // the first stable paint, so the user never sees a loading flash.
      launchAutoHide: false,
    },
    Camera: {
      // Present the photo picker correctly on iPad (popover, not crash)
      // saveToGallery is off by default — only save when user requests it
    },
  },
};

export default config;
