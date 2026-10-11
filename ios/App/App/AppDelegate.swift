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
        // The page asks for the push token whenever it loads (lib/push/client.ts), and is answered from here.
        StorelibPush.shared.onAsk = { [weak self] in self?.dispatchFcmToken() }
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
        guard let fcmToken = fcmToken, !fcmToken.isEmpty else {
            print("[push] FCM token is nil — skipping dispatch")
            return
        }
        print("[push] FCM token received")
        latestFcmToken = fcmToken
        dispatchFcmToken()
    }

    /// The newest FCM registration token.
    ///
    /// KEPT, NOT ONLY SENT. Firebase hands the token over at launch, which is
    /// before the page has loaded and long before anybody signs in, so an
    /// event sent then reached no listener and the phone was never registered
    /// for pushes. It is kept here and given to the page as a value it can
    /// read (window.__storelibFcmToken), as the event a listening page hears,
    /// again whenever the page asks (StorelibPush), and whenever the app comes
    /// forward. client.ts sends it to /api/push/register once someone is
    /// signed in, and again for whoever signs in next.
    private var latestFcmToken: String?

    private func dispatchFcmToken() {
        guard let token = latestFcmToken else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let vc = self.window?.rootViewController as? CAPBridgeViewController, let webView = vc.bridge?.webView else {
                print("[push] WARNING: no web view yet: the page will ask for the token when it loads")
                return
            }
            // FCM tokens are letters, digits, ':', '-' and '_'; anything else is left out rather than escaped.
            let safe = String(token.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || ":-_".unicodeScalars.contains($0) })
            let script = "window.__storelibFcmToken='\(safe)';window.dispatchEvent(new CustomEvent('fcmTokenReady',{detail:'\(safe)'}));"
            webView.evaluateJavaScript(script, completionHandler: { _, jsError in
                if let jsError = jsError { print("[push] evaluateJavaScript error dispatching fcmTokenReady: \(jsError)") }
            })
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
            StorelibPopups.shared.attach(to: webView)
            StorelibPush.shared.attach(to: webView)
        }
        // A token that arrived while the page was not there yet, or that the page lost by navigating.
        dispatchFcmToken()
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

// MARK: - Stripe's own windows, inside the app

/// Stripe's embedded payout setup opens windows of its own from inside its
/// frame: the sign in to Stripe, a bank's login while linking the payout
/// account. Capacitor answers every new window by handing its address to
/// Safari, so the creator was thrown out of Storelib the moment setup
/// opened, and whatever they did there never reached the form. A window
/// opened by a Stripe page (or to one) is drawn here instead, in a sheet
/// over the app built from the configuration WebKit hands us, so it keeps
/// its opener and can answer the form that asked for it. It goes away when
/// Stripe closes it or the creator taps Done. Every other new window goes
/// on to Capacitor's own handling, as before.
///
/// Capacitor's UI delegate stays in charge of everything else: this
/// answers only for a new window and a window closing, and hands every
/// other call on (responds(to:) and forwardingTarget(for:)).
final class StorelibPopups: NSObject, WKUIDelegate, UIAdaptivePresentationControllerDelegate {
    static let shared = StorelibPopups()

    private weak var inner: WKUIDelegate?
    private weak var popup: WKWebView?
    private weak var sheet: UIViewController?

    func attach(to webView: WKWebView) {
        if webView.uiDelegate === self { return }
        inner = webView.uiDelegate
        webView.uiDelegate = self
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return inner?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let inner = inner, inner.responds(to: aSelector) { return inner }
        return super.forwardingTarget(for: aSelector)
    }

    static func isStripe(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return false }
        return host == "stripe.com" || host.hasSuffix(".stripe.com") || host == "stripe.network" || host.hasSuffix(".stripe.network")
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let target = navigationAction.request.url
        /// sourceFrame is declared non optional but WebKit can hand over none.
        let source = (navigationAction.sourceFrame as WKFrameInfo?)?.securityOrigin.host
        guard Self.isStripe(target?.host) || Self.isStripe(source) else {
            return inner?.webView?(webView, createWebViewWith: configuration, for: navigationAction, windowFeatures: windowFeatures)
        }
        guard var top = webView.window?.rootViewController else { return nil }
        while let next = top.presentedViewController { top = next }
        if let open = popup { open.evaluateJavaScript("window.close()", completionHandler: nil) }

        let web = WKWebView(frame: .zero, configuration: configuration)
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        let controller = StorelibPopupController(web: web)
        controller.modalPresentationStyle = .pageSheet
        controller.presentationController?.delegate = self
        popup = web
        sheet = controller
        top.present(controller, animated: true)
        return web
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup {
            popup = nil
            if let shown = sheet, !shown.isBeingDismissed, shown.presentingViewController != nil { shown.dismiss(animated: true) }
            sheet = nil
            return
        }
        inner?.webViewDidClose?(webView)
    }

    /// Swiped down: the window is closed for the page that opened it too.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        popup?.evaluateJavaScript("window.close()", completionHandler: nil)
        popup = nil
        sheet = nil
    }
}

/// The sheet a Stripe window is drawn in: Done at the top, the page under it.
final class StorelibPopupController: UIViewController {
    let web: WKWebView

    init(web: WKWebView) {
        self.web = web
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        let bar = UIView()
        bar.backgroundColor = .white
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        let line = UIView()
        line.backgroundColor = UIColor(red: 0.925, green: 0.933, blue: 0.945, alpha: 1)
        line.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(line)

        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        done.tintColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1)
        done.translatesAutoresizingMaskIntoConstraints = false
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        bar.addSubview(done)

        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 52),
            line.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
            line.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
            line.heightAnchor.constraint(equalToConstant: 1),
            done.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            done.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            web.topAnchor.constraint(equalTo: bar.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    /// Done closes the window the way a page would, so the form that opened it hears it close.
    @objc private func close() {
        web.evaluateJavaScript("window.close()", completionHandler: nil)
        dismiss(animated: true)
    }
}

// MARK: - The push token, asked for by the page

/// The page asks for the push token when it loads:
///
///     window.webkit.messageHandlers.storelibPush.postMessage({ action: "token" })
///
/// and AppDelegate answers with dispatchFcmToken. Attached once per web view,
/// like StorelibDownloads.
final class StorelibPush: NSObject, WKScriptMessageHandler {
    static let shared = StorelibPush()
    static let handlerName = "storelibPush"
    var onAsk: (() -> Void)?
    private weak var webView: WKWebView?

    func attach(to webView: WKWebView) {
        if self.webView === webView { return }
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: Self.handlerName)
        controller.add(self, name: Self.handlerName)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        onAsk?()
    }
}
