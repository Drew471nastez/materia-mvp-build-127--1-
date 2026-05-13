import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Configure Firebase before anything else
        // Requires GoogleService-Info.plist to be added to the Xcode project target
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        requestPushPermission(application)
        return true
    }

    private func requestPushPermission(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("[push] permission error: \(error.localizedDescription)")
                return
            }
            print("[push] permission granted: \(granted)")
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        print("[push] APNs token received: \(token)")

        // Hand the APNs token to Firebase Messaging so it can exchange it for an FCM token.
        // FirebaseAppDelegateProxyEnabled is set to NO in Info.plist so we do this manually.
        Messaging.messaging().apnsToken = deviceToken

        // Still notify Capacitor so the @capacitor/push-notifications plugin stays functional
        // (foreground notification display, permission state, etc.)
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] failed to register: \(error.localizedDescription)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: - MessagingDelegate

    /// Called by Firebase Messaging whenever a fresh FCM registration token is available.
    /// This is the token that must be stored in push_tokens and used with firebase-admin.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken else {
            print("[push] FCM token is nil — skipping dispatch")
            return
        }
        print("[push] FCM token received: \(fcmToken)")

        // Dispatch the FCM token to the JavaScript layer via the Capacitor web view.
        // client.ts listens for the 'fcmTokenReady' CustomEvent on window and sends the
        // token to /api/push/register in place of the raw APNs hex string.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Escape the token (FCM tokens are alphanumeric + dashes/underscores, but be safe)
            let escaped = fcmToken.replacingOccurrences(of: "'", with: "\\'")
            let script = "window.dispatchEvent(new CustomEvent('fcmTokenReady', { detail: '\(escaped)' }));"

            if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                vc.bridge?.webView?.evaluateJavaScript(script, completionHandler: { _, jsError in
                    if let jsError = jsError {
                        print("[push] evaluateJavaScript error dispatching fcmTokenReady: \(jsError)")
                    } else {
                        print("[push] fcmTokenReady event dispatched to JS layer")
                    }
                })
            } else {
                print("[push] WARNING: rootViewController is not CAPBridgeViewController — fcmTokenReady not dispatched")
            }
        }
    }

    // ── OAuth / deep-link forwarding ──────────────────────────────────────────

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

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
}
