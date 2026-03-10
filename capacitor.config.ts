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
    // Allow Stripe domains inside the WebView so 3DS bank-auth redirects and
    // Stripe-hosted pages stay in-app instead of opening Safari.
    allowNavigation: ['*.stripe.com', 'hooks.stripe.com'],
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
    allowsLinkPreview: false,
    backgroundColor: '#000000',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  plugins: {
    SplashScreen: {
      // Do NOT auto-hide the splash — we call SplashScreen.hide() manually
      // from the final destination page (/app, /library, /welcome) after
      // the first stable paint, so the user never sees a loading flash.
      launchAutoHide: false,
    },
  },
};

export default config;
