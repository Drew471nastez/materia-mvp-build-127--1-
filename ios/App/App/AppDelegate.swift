import UIKit
import WebKit
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

    // ── Bought files ─────────────────────────────────────────────────────────

    /// Gives the page its downloader once the web view exists. Every time the
    /// app comes forward, because the bridge's web view is only there after
    /// the storyboard's view controller has loaded, which is after launch;
    /// attaching twice is a no-op (StorelibDownloads.attach).
    func applicationDidBecomeActive(_ application: UIApplication) {
        if let vc = window?.rootViewController as? CAPBridgeViewController, let webView = vc.bridge?.webView {
            StorelibDownloads.shared.attach(to: webView)
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

// MARK: - Bought files, saved to the iPhone

/// A buyer's Download, inside the app.
///
/// WKWebView ignores `Content-Disposition: attachment` and has nowhere to put
/// a blob, and Capacitor gives it no download delegate, so a file the page
/// asks for either does nothing or leaves for Safari. The page
/// (lib/downloads/download-file.ts) asks the server for a short lived signed
/// https address and posts it here:
///
///     window.webkit.messageHandlers.storelibDownload.postMessage(
///       { action: "start", id, url, fileName, mimeType })
///
/// URLSession writes it to disk as it arrives, so a file of hundreds of
/// megabytes never passes through the page, and reports back with a
/// `storelib-download` event on window ({ id, state, loaded, total }) for the
/// page's progress bar. When it is done the share sheet opens with the file,
/// where Save to Files, AirDrop and Books are. `{ action: "share", id }`
/// opens it again; `{ action: "cancel", id }` stops one.
///
/// An install without this handler is still served: the page reads small
/// files itself and hands the rest to Safari.
final class StorelibDownloads: NSObject, WKScriptMessageHandler, URLSessionDownloadDelegate {
    static let shared = StorelibDownloads()
    static let handlerName = "storelibDownload"

    private weak var webView: WKWebView?
    private lazy var session: URLSession = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
    /// The page's id and the name to save under, by URLSession task.
    private var jobs: [Int: (id: String, fileName: String)] = [:]
    private var tasks: [String: URLSessionDownloadTask] = [:]
    /// Finished files, for Save again. Kept in this app's temporary folder, which iOS clears.
    private var finished: [String: URL] = [:]
    private var lastReport: [String: TimeInterval] = [:]

    func attach(to webView: WKWebView) {
        if self.webView === webView { return }
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: Self.handlerName)
        controller.add(self, name: Self.handlerName)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let id = body["id"] as? String, !id.isEmpty else { return }
        switch body["action"] as? String ?? "start" {
        case "cancel":
            tasks[id]?.cancel()
        case "share":
            if let file = finished[id] { present(file) }
        default:
            guard let raw = body["url"] as? String, let url = URL(string: raw), url.scheme == "https" else {
                report(id, state: "failed")
                return
            }
            let name = Self.safeName(body["fileName"] as? String)
            let task = session.downloadTask(with: url)
            jobs[task.taskIdentifier] = (id, name)
            tasks[id] = task
            task.resume()
            report(id, state: "running", loaded: 0, total: -1)
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let job = jobs[downloadTask.taskIdentifier] else { return }
        /// Five reports a second is a smooth bar; one per packet would flood the page.
        let now = Date().timeIntervalSince1970
        if now - (lastReport[job.id] ?? 0) < 0.2 { return }
        lastReport[job.id] = now
        report(job.id, state: "running", loaded: totalBytesWritten, total: totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let job = jobs[downloadTask.taskIdentifier] else { return }
        if let http = downloadTask.response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            report(job.id, state: "failed")
            return
        }
        /// `location` is deleted as soon as this returns, so the file moves now.
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("StorelibDownloads", isDirectory: true)
            .appendingPathComponent(job.id, isDirectory: true)
        do {
            try? FileManager.default.removeItem(at: folder)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let target = folder.appendingPathComponent(job.fileName)
            try FileManager.default.moveItem(at: location, to: target)
            finished[job.id] = target
            let size = downloadTask.countOfBytesReceived
            report(job.id, state: "done", loaded: size, total: size)
            present(target)
        } catch {
            report(job.id, state: "failed")
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let job = jobs.removeValue(forKey: task.taskIdentifier) else { return }
        tasks[job.id] = nil
        lastReport[job.id] = nil
        guard let error = error as NSError? else { return }
        report(job.id, state: error.code == NSURLErrorCancelled ? "cancelled" : "failed")
    }

    /// The share sheet, over whatever is on screen, anchored for iPad.
    private func present(_ file: URL) {
        guard let webView = webView, var top = webView.window?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 96, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        top.present(sheet, animated: true)
    }

    private func report(_ id: String, state: String, loaded: Int64 = 0, total: Int64 = -1) {
        guard let webView = webView else { return }
        let detail: [String: Any] = ["id": id, "state": state, "loaded": loaded, "total": total]
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('storelib-download',{detail:\(json)}))", completionHandler: nil)
    }

    /// A name the file system takes: no folders, no control characters, not empty.
    static func safeName(_ raw: String?) -> String {
        let banned = CharacterSet(charactersIn: "/\\:").union(.controlCharacters)
        var name = (raw ?? "").components(separatedBy: banned).joined(separator: "_").trimmingCharacters(in: .whitespacesAndNewlines)
        while name.hasPrefix(".") { name.removeFirst() }
        if name.isEmpty { name = "download" }
        if name.count > 120 {
            let ext = (name as NSString).pathExtension
            let stem = (name as NSString).deletingPathExtension
            name = String(stem.prefix(max(1, 119 - ext.count))) + (ext.isEmpty ? "" : ".\(ext)")
        }
        return name
    }
}
