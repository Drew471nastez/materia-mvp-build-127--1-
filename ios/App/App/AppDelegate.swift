import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    // ── OAuth / deep-link forwarding ──────────────────────────────────────────

    /// Handles custom-scheme URLs (e.g. storelib://auth/callback) returned by
    /// the OAuth flow or Supabase magic-link / recovery links.
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    /// Handles Universal Links (https://storelib.com/app/auth/callback) so the
    /// PKCE code-exchange completes inside the app rather than Safari.
    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }

    // ── APNs token forwarding → Capacitor PushNotifications plugin ───────────

    /// Called by iOS when APNs successfully issues a device token.
    /// Posting to `.capacitorDidRegisterForRemoteNotifications` is what triggers
    /// the Capacitor `PushNotifications` plugin's `registration` event — without
    /// this the JS callback never fires and push_tokens stays empty.
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    /// Called by iOS when APNs registration fails (e.g. running on Simulator,
    /// missing entitlement, or revoked certificate).
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}
