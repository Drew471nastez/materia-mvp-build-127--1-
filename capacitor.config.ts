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
    // StorelibWindows/1: this build opens Stripe's own windows (its sign in,
    // a bank's login) in a window inside the app (AppDelegate.swift
    // StorelibPopups, StorelibChromeClient.java), so the web layer keeps the
    // embedded payout setup rather than sending it to the in-app sheet
    // (lib/native-bridge.ts appHoldsStripeWindows).
    appendUserAgent: 'Capacitor StorelibWindows/1',
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
    // Storelib's own other hosts, so following one never opens Safari:
    //   www.storelib.com — redirects to storelib.com; listed so the hop
    //     happens in the app.
    //   *.storelib.com — a creator's website at <name>.storelib.com, and
    //     the platform's own subdomains.
    //   storelib.me, www.storelib.me — the OnePage's host.
    //   checkout.stripe.com — Stripe's hosted checkout for physical goods,
    //     which returns to storelib.com when the order is paid.
    // The web layer already turns every one of these it can into a
    // storelib.com path (lib/native-links.ts), so this list matters for the
    // rest: a creator's website, and Stripe's page. Read at build time: it
    // reaches phones with the next App Store and Play release. The list is
    // NATIVE_ALLOW_NAVIGATION in lib/native-links.ts, and
    // tests/native-app-links.test.ts fails if the two disagree.
    allowNavigation: [
      'js.stripe.com',
      'hooks.stripe.com',
      'connect-js.stripe.com',
      'www.storelib.com',
      '*.storelib.com',
      'storelib.me',
      'www.storelib.me',
      'checkout.stripe.com',
    ],
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
    // THE STATUS BAR'S FIRST FRAME. Every Storelib header is white now, so the
    // bar starts with dark text on a white strip; from the first page on, the
    // web layer sets both from the page's own top colour after every move
    // (lib/native-chrome.ts, --native-band in app/globals.css), which needs
    // no release. These two only decide the frames before the page has run,
    // and like everything in this file they reach phones with the next App
    // Store and Play release.
    //   SystemBars (in @capacitor/core 8): dark text, no fade when it
    //     changes, and on Android the real insets written into
    //     --safe-area-inset-* for WebViews whose env() reads 0.
    //   StatusBar: the same for a shell built before 8, and on Android the
    //     strip behind the bar painted white rather than the grey it was.
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      animation: 'NONE',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
    SplashScreen: {
      // Do NOT auto-hide the splash: the page the app lands on hides it after
      // its first steady frame. /app, the library and welcome time it
      // themselves; every other landing page (Explore, a community, a
      // creator's page, the account) through components/platform/
      // native-chrome.tsx, so a start that resumes anywhere is never left
      // waiting on the launch screen.
      launchAutoHide: false,
    },
    Camera: {
      // Present the photo picker correctly on iPad (popover, not crash)
      // saveToGallery is off by default — only save when user requests it
    },
    PushNotifications: {
      // A push that arrives while the app is open still shows its banner and
      // sound on iOS (Android shows it anyway). Read at build time, so it
      // reaches phones with the next App Store release.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
