# Apple App Review Notes — Storelib

Use this text when responding to Apple reviewers in App Store Connect.
Paste the relevant section into the "Review Notes" field or the reviewer message thread.

---

## Issue 1 — Camera Crash (iPad)

**Root cause fixed:**
The app previously used a raw `<input type="file" accept="image/*">` inside a WKWebView.
On iPad, iOS requires a `UIPopoverPresentationController` source anchor for the
`UIImagePickerController`; without it the OS terminates the presentation and the
app appears to crash.

**Fix applied:**
- Replaced all file-input–based photo flows with `@capacitor/camera` (v6).
- `@capacitor/camera` automatically provides the correct `sourceRect` / `sourceView`
  for the popover on iPad, preventing any crash.
- All three required `Info.plist` keys are present:
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryUsageDescription`
  - `NSPhotoLibraryAddUsageDescription`
- The camera utility handles: user cancellation, permission denied (shows a Settings
  redirect message), camera unavailable (simulator / restricted device), and all
  other failure modes — the app never crashes; errors are shown as friendly messages.

---

## Issue 2 — Account Deletion

**Implementation:**
Storelib provides a full, permanent account deletion flow accessible from inside the app:

1. Open the app → tap your avatar → **Settings**
2. Go to the **Security** tab
3. Scroll to **Delete your account** → tap **Delete Account**
4. A 6-digit verification code is emailed to confirm intent
5. Enter the code → account is permanently and immediately deleted

**What is deleted:**
- Auth credentials (Supabase Auth)
- User profile
- Creator profile (if seller)
- All products and digital assets
- All orders (buyer history)
- All library items (purchased content)
- All analytics data
- Push notification tokens
- OnePage link-in-bio
- All storage files (avatars, product images, onepage assets)
- All pending verification codes

This is a real, irreversible deletion — not a deactivation.

**Public instructions page:**
`https://storelib.com/account-deletion`

---

## Issue 3 — Business Model / Digital Purchases

**How purchases work:**
Storelib is a platform for independent sellers ("Creators") to sell **digital products**
(eBooks, templates, presets, courses, etc.) directly to buyers.

**Payment processor:** Stripe (external web checkout)
- Buyers are directed to a Stripe-hosted checkout page to complete payment.
- Storelib does NOT use Apple In-App Purchases (IAP) for any digital content.
- All transactions are processed on the web via Stripe before any content is delivered.
- The iOS app is used by **sellers** to manage their store and by **buyers** to access
  previously purchased content from their library.

**No IAP is required because:**
- Content is purchased on the web (storelib.com), not inside the iOS app.
- The app does not allow initiating a new purchase of digital content inside the native
  shell — purchases always route to the external Stripe checkout via SFSafariViewController.
- The app functions as a reader/library for already-purchased content, equivalent to
  a content consumption app (analogous to Kindle or Dropbox).

**Guideline reference:**
Per App Store Review Guideline 3.1.3(a), apps may read or display previously purchased
content without using IAP, provided the initial purchase occurred on the web.
Storelib complies with this guideline.

---

## Testing Credentials (for reviewer)

If the reviewer needs a test account, provide one here:
- **URL:** https://storelib.com
- **Test email:** [INSERT REVIEWER TEST EMAIL]
- **Test password:** [INSERT REVIEWER TEST PASSWORD]

Steps to test account deletion:
1. Log in with the test account
2. Settings → Security → Delete Account
3. Check the test email inbox for the verification code
4. Enter code → confirm deletion
5. App redirects to welcome screen; account is gone
