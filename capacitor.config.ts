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
    // js.stripe.com  — must be listed so that IF the controller somehow escapes
    //   the three-layer guard (advancedFraudSignals: false + CSP frame-src +
    //   stripe-nav-guard.ts), any navigation stays INSIDE the WKWebView rather
    //   than ejecting to the system Safari browser.  The primary fix is the CSP
    //   middleware (middleware.ts) which blocks the controller iframe at the
    //   browser-engine level before any JS runs.
    // hooks.stripe.com — needed for 3DS bank-auth redirect pages so they stay
    //   in-app rather than opening the system Safari browser.
    // connect-js.stripe.com — Stripe's embedded Connect forms (the three steps
    //   of Set up payments). They draw in frames from this host, which
    //   proxy.ts now allows in the app's frame-src; listed here so that if one
    //   of those frames ever navigates the shell, it stays in the app rather
    //   than ejecting a half finished identity check into Safari.
    allowNavigation: ['js.stripe.com', 'hooks.stripe.com', 'connect-js.stripe.com'],
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
