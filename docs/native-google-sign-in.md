# Continue with Google in the iOS and Android apps

What a person sees when they tap **Continue with Google** inside the Storelib
app, what ships today, and what the next native release has to carry for the
best of it to switch on.

## Two steps, best first

The web layer asks for the better one and falls to the other on its own
(`lib/auth/native-sign-in.ts`). Nothing has to be configured for the fallback,
and nothing breaks if the first is missing.

**1. The phone's own sheet.** If this build of the app carries a native Google
plugin, Storelib asks it for an ID token and hands that straight to Supabase
(`signInWithIdToken`). No browser opens, nothing redirects, no deep link comes
back.

- **Android** shows Credential Manager's bottom sheet, the one that reads
  "Continue as <name>" over the app. One tap for anyone signed into the phone.
- **iOS** shows Google's own sheet over the app.

**2. The Safari sheet.** Otherwise the OAuth address opens in the system
browser sheet and the deep link brings the session back
(`lib/native-oauth.ts`):

- **iOS**: `SFSafariViewController` presented as a card over the app
  (`presentationStyle: "popover"`), which can be swiped away, with a white
  toolbar.
- **Android**: a Chrome Custom Tab.

### Why step 2 arrives logged out

This is the "it opens like a private window, it never knows my account" part,
and it is a platform fact rather than a setting:

- **iOS**: since iOS 11, `SFSafariViewController` keeps its own cookies, apart
  from Safari's. The Google session on the phone is not in it, so Google asks
  for an address and a password the phone already knows.
- **Android**: a Chrome Custom Tab *does* share Chrome's cookies, so it
  usually knows the person — unless the phone's default browser is not Chrome.

Three things end it, and all three are native code, so all three need a build
rather than a deploy: Credential Manager and Google's SDK (step 1), or
`ASWebAuthenticationSession`, which Apple lets share Safari's cookies and
which the `OAuth2Client` plugin below uses.

What the web layer could do about it, it has done: Storelib no longer sends
`access_type=offline` and `prompt=consent` with a Google sign in
(`lib/auth/google-oauth-params.ts`). Those asked Google to show the "Storelib
wants access to your Google Account" screen on every single sign in and told
it not to continue quietly with a session it already had. Nothing here ever
used a Google token, so they bought nothing.

This is what every build before this change did on the login page. The signup
page did something else, and worse: it sent the app's own WebView to
`/auth/start`, so Google's page loaded inside the app. Google refuses that in
plenty of cases (`disallowed_useragent`). Both pages take the same path now.

## What the next native release needs for step 1

The plugin is already a dependency: `@capgo/capacitor-social-login`, which is
Credential Manager's bottom sheet on Android and Google's own sheet on iOS.
Three things are left, and only the first cannot be done from this repository,
because it is made in your Google Cloud project.

**1. Make the client ids.** Google Cloud → APIs & Services → Credentials, in
the same project the Supabase Google provider already uses:

| Kind | For |
| --- | --- |
| **Web** | the id the token is minted for, and the one Supabase checks |
| **iOS** | bundle `com.storelib.app` |
| **Android** | package `com.storelib.app`, with the release certificate's SHA-1 |

**2. Run one command**, with the iOS id:

```
node scripts/native-google-setup.mjs 123456-abcdef.apps.googleusercontent.com
```

It writes the one line of iOS configuration that cannot be guessed — Google
answers an iOS app by opening its client id backwards as a URL scheme, and
that scheme has to be in `Info.plist` or the sheet opens, the person picks
their account, and nothing comes back. It then prints the rest. Android needs
nothing here: the plugin is handed the web client id at runtime.

**3. Set two values in Vercel** (Production and Preview) and redeploy:

```
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=…apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=…apps.googleusercontent.com
```

Missing or wrong, the plugin cannot start, and the app falls back to the
browser sheet rather than failing.

**And in Supabase**: Authentication → Providers → Google → the Authorized Client IDs
box must list the web, iOS and Android ids, or `signInWithIdToken`
is refused.

Then `npx cap sync`, build in Xcode and Android Studio, and release. The web
layer needs no further change: it looks the plugin up at runtime and takes it
the moment it is there.

### Other plugins it also recognises

A build that already carries one of these is used instead, in this order:

| Plugin | Android | iOS |
| --- | --- | --- |
| `@capgo/capacitor-social-login` (`SocialLogin`) | Credential Manager, the bottom sheet | Google's sheet |
| `@codetrix-studio/capacitor-google-auth` (`GoogleAuth`) | Google Sign-In | Google Sign-In |
| `@byteowls/capacitor-oauth2` (`OAuth2Client`) | Custom Tab | ASWebAuthenticationSession, Safari's cookies shared |
| `@capacitor-firebase/authentication` (`FirebaseAuthentication`) | Firebase + Google | Firebase + Google |

## What stays true either way

- Supabase's **Redirect URLs** must keep both deep links, because step 2 uses
  them: `storelib://auth/callback` and `com.storelib.app://auth/callback`.
- Where somebody lands after signing in is decided in one place for both
  steps, `lib/auth/native-session.ts`: the home a cold start opens on, where
  they were going before they signed in, and the hop through
  `/auth/sync-session` that turns the session into cookies Next.js can read.
- Sign in with Apple is unchanged, and now opens in the same sheet.

## Checking it on a device

- **Step 2, today**: tap Continue with Google in the app. The browser should
  arrive as a card over the app, not fill the screen, and swiping it away
  should leave the form usable rather than stuck on a spinner.
- **Step 1, after the release**: the same tap should show the bottom sheet on
  Android with no browser at all. If a browser opens, the plugin is not in the
  build or the client IDs are not set; `hasNativeGoogle()` in the console says
  which.
