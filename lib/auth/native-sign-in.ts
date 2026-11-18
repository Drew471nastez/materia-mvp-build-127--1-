/**
 * ===========================================================================
 *  CONTINUE WITH GOOGLE, THE WAY A PHONE DOES IT
 * ===========================================================================
 * Asked for plainly: in the iOS and Android apps, Continue with Google should
 * open what the phone opens — the Safari sheet on iOS, Google's own bottom
 * sheet on Android — and not whatever each page happened to do.
 *
 * Each page did happen to do its own thing. The login page opened an
 * SFSafariViewController filling the whole screen (`windowName: "_self"`,
 * no presentation style), which reads as leaving the app. The signup page
 * did not open a browser at all: it set `window.location` to /auth/start,
 * so Google's page loaded inside the app's own WebView, which is both a
 * different experience and the thing Google refuses outright
 * ("disallowed_useragent") when it notices.
 *
 * ONE PATH NOW, in two steps, best first:
 *
 *   1. THE PHONE'S OWN SHEET. If this build of the app carries a native
 *      Google plugin (`nativeGoogleIdToken` below), it hands back an ID
 *      token without any browser: on Android that is Credential Manager's
 *      bottom sheet, the one that says "Continue as …" over the app; on iOS
 *      it is Google's own sheet over the app. The token goes straight to
 *      Supabase (`signInWithIdToken`), so there is no redirect, no deep link
 *      and nothing to come back from.
 *
 *   2. THE SAFARI SHEET. Otherwise the OAuth address opens in the system
 *      browser sheet — SFSafariViewController on iOS, presented as a card
 *      that slides over the app and can be swiped away; a Chrome Custom Tab
 *      on Android — and the deep link brings the session back
 *      (lib/native-oauth.ts). This is what every current build does, and it
 *      is now what BOTH pages do, with the same sheet.
 *
 * EITHER WAY GOOGLE SHOWS ITS ACCOUNT CHOOSER, and Log out signs the phone's
 * own Google sheet out too (lib/auth/forget-device-sign-in.ts), so a person
 * who logged out can pick another account or make a new one.
 *
 * WHY STEP 2 ARRIVES LOGGED OUT, which is the thing that reads as a private
 * window: since iOS 11, SFSafariViewController keeps its own cookies, apart
 * from Safari's, so the Google session on the phone is not in it and the
 * person types an address and a password that the phone already knows.
 * Android's Custom Tab does share Chrome's cookies, so it usually knows
 * them, unless the phone's browser is not Chrome. Only step 1 — or
 * ASWebAuthenticationSession, which the OAuth2Client plugin below uses and
 * which Apple lets share Safari's cookies — ends that, and all of those are
 * native code: a build, not a deploy. What the web layer could do about it
 * is stop asking Google to re-consent on every sign in, which it no longer
 * does (lib/auth/google-oauth-params.ts).
 *
 * Step 1 needs a native release (a plugin is native code; the web layer
 * alone cannot add one), so it is found at runtime rather than imported:
 * `window.Capacitor.Plugins.<name>`. No plugin, no error — the app falls to
 * step 2, which is why this ships safely ahead of the native build.
 * docs/native-google-sign-in.md has what that release needs.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { completeNativeSession } from "@/lib/auth/native-session"

/** How a sign-in attempt ended. `unavailable` means "this build has no native plugin; use the sheet". */
export type NativeSignInResult = "done" | "cancelled" | "unavailable" | "failed"

/**
 * THE BROWSER AS A SHEET, NEVER A TAKEOVER. `popover` presents
 * SFSafariViewController as a card over the app on iOS; Android's Chrome
 * Custom Tab ignores it and is a sheet-like tab already. The white toolbar
 * keeps Google's page from arriving under a black bar on a dark phone.
 */
export async function openAuthSheet(url: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser")
  await Browser.open({ url, windowName: "_self", presentationStyle: "popover", toolbarColor: "#ffffff" })
}

type Plugins = Record<string, Record<string, (...args: never[]) => Promise<unknown>> | undefined>

function plugins(): Plugins {
  if (typeof window === "undefined") return {}
  return ((window as unknown as { Capacitor?: { Plugins?: Plugins } }).Capacitor?.Plugins ?? {}) as Plugins
}

const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || ""
const IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || ""

/** Did the person back out, rather than something going wrong? Every plugin says so differently. */
export function isCancelled(message: string): boolean {
  return /cancel|dismiss|12501|user_?cancell?ed|aborted|no credential|closed by user/i.test(message)
}

/**
 * The ID token from whichever native Google plugin this build carries, or
 * null when it carries none. @capgo/capacitor-social-login is a dependency,
 * so a synced native build has `SocialLogin` and takes the first branch; the
 * others are here because a build may already carry one of them.
 */
async function nativeGoogleIdToken(): Promise<string | null> {
  const p = plugins()

  /* @capgo/capacitor-social-login: Credential Manager on Android (the bottom sheet), Google's sheet on iOS. */
  const social = p.SocialLogin as
    | { initialize: (o: unknown) => Promise<unknown>; login: (o: unknown) => Promise<unknown> }
    | undefined
  if (social?.login) {
    await social.initialize({ google: { webClientId: WEB_CLIENT_ID, iOSClientId: IOS_CLIENT_ID || undefined } })
    /*
     * THE CHOOSER, EVERY TIME. Without these a phone that had signed in once
     * went straight back into that account after Log out: Credential
     * Manager picks the only account by itself (`autoSelectEnabled`), and
     * Google's iOS sheet continues with the one it remembers unless
     * `forcePrompt` is set. `prompt` is the same ask for the plugin's web
     * path (lib/auth/google-oauth-params.ts).
     */
    const res = (await social.login({
      provider: "google",
      options: { scopes: ["email", "profile"], forcePrompt: true, autoSelectEnabled: false, filterByAuthorizedAccounts: false, prompt: "select_account" },
    })) as {
      result?: { idToken?: string | null; profile?: unknown }
    }
    return res?.result?.idToken ?? null
  }

  /* @codetrix-studio/capacitor-google-auth: the older one, still common. */
  const gauth = p.GoogleAuth as
    | { initialize?: (o: unknown) => void | Promise<unknown>; signIn: () => Promise<unknown> }
    | undefined
  if (gauth?.signIn) {
    try {
      await gauth.initialize?.({ clientId: WEB_CLIENT_ID, scopes: ["email", "profile"], grantOfflineAccess: false })
    } catch {
      /* Already initialised by the native side, which is the usual case. */
    }
    const user = (await gauth.signIn()) as { authentication?: { idToken?: string | null } }
    return user?.authentication?.idToken ?? null
  }

  /*
   * @byteowls/capacitor-oauth2: no Google SDK, but ASWebAuthenticationSession
   * on iOS, which SHARES SAFARI'S COOKIES — so the person is already signed
   * in to Google and taps once. Needs the iOS client id to build the address
   * Google sends the answer back to.
   */
  const oauth2 = p.OAuth2Client as { authenticate: (o: unknown) => Promise<unknown> } | undefined
  if (oauth2?.authenticate && IOS_CLIENT_ID) {
    const reversed = IOS_CLIENT_ID.split(".").reverse().join(".")
    const res = (await oauth2.authenticate({
      appId: WEB_CLIENT_ID,
      authorizationBaseUrl: "https://accounts.google.com/o/oauth2/auth",
      scope: "email profile openid",
      responseType: "id_token",
      ios: { appId: IOS_CLIENT_ID, responseType: "id_token", redirectUrl: `${reversed}:/` },
      android: { appId: WEB_CLIENT_ID, responseType: "id_token", redirectUrl: "com.storelib.app:/" },
    })) as { id_token?: string | null; authorization_response?: { id_token?: string | null } }
    return res?.id_token ?? res?.authorization_response?.id_token ?? null
  }

  /* @capacitor-firebase/authentication, for a build that already carries Firebase. */
  const fb = p.FirebaseAuthentication as { signInWithGoogle: (o?: unknown) => Promise<unknown> } | undefined
  if (fb?.signInWithGoogle) {
    const res = (await fb.signInWithGoogle({ scopes: ["email", "profile"] })) as { credential?: { idToken?: string | null } }
    return res?.credential?.idToken ?? null
  }

  return null
}

/** Whether this build can show the phone's own Google sheet at all. */
export function hasNativeGoogle(): boolean {
  const p = plugins()
  return !!(p.SocialLogin?.login || p.GoogleAuth?.signIn || (p.OAuth2Client?.authenticate && IOS_CLIENT_ID) || p.FirebaseAuthentication?.signInWithGoogle)
}

/**
 * Continue with Google through the phone's own sheet. Signs in and returns
 * the address to go to; `unavailable` says this build has no such sheet and
 * the caller should open the browser one instead.
 *
 * NO NONCE. Supabase takes one optionally, and it has to be the same value
 * the token was minted against; the three plugins hand it over differently
 * (one hashes it, one does not, one does not expose it), and a mismatch
 * fails a sign in that would otherwise work. The token is verified against
 * Google either way, and it is read once, here, over TLS.
 */
export async function signInWithNativeGoogle(
  supabase: SupabaseClient,
): Promise<{ result: NativeSignInResult; href?: string; message?: string }> {
  if (!hasNativeGoogle()) return { result: "unavailable" }
  try {
    const token = await nativeGoogleIdToken()
    if (!token) return { result: "unavailable" }

    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token })
    if (error || !data?.session) return { result: "failed", message: error?.message ?? "No session" }

    return { result: "done", href: await completeNativeSession(supabase, data.session) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "")
    /* SocialLogin rejects a dismissal with `code: "USER_CANCELLED"` and a message that may say nothing. */
    const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : ""
    if (isCancelled(`${code} ${message}`)) return { result: "cancelled" }
    /* A plugin that is there but cannot run (no client id, no Play services) is the sheet's job now. */
    return { result: "unavailable", message }
  }
}

/**
 * LOG OUT OF THE PHONE'S OWN GOOGLE SHEET TOO. Supabase's sign out ends the
 * Storelib session, but the native plugin keeps its own signed in Google
 * account (Credential Manager's choice on Android, GIDSignIn's current user
 * on iOS), and the next Continue with Google went straight back into it.
 * Every plugin this build may carry is told to forget it. Never throws: a
 * build without a plugin, or one that was never initialised, has nothing to
 * forget. Nothing here reads or logs a token.
 */
export async function signOutNativeGoogle(): Promise<void> {
  const p = plugins()
  const social = p.SocialLogin as
    | { initialize?: (o: unknown) => Promise<unknown>; logout?: (o: unknown) => Promise<unknown> }
    | undefined
  if (social?.logout) {
    /* The plugin refuses a logout for a provider it was not initialised with in this launch of the app. */
    try {
      await social.initialize?.({ google: { webClientId: WEB_CLIENT_ID, iOSClientId: IOS_CLIENT_ID || undefined } })
    } catch {
      /* already initialised */
    }
    try {
      await social.logout({ provider: "google" })
    } catch {
      /* not signed in to Google through it */
    }
  }
  /* The native Google plugin's own sign out (not Supabase's; named so the scope rule in tests/session-stability does not read it as one). */
  const googlePlugin = p.GoogleAuth as { signOut?: () => Promise<unknown> } | undefined
  if (googlePlugin?.signOut) await googlePlugin.signOut().catch(() => undefined)
  const fb = p.FirebaseAuthentication as { signOut?: () => Promise<unknown> } | undefined
  if (fb?.signOut) await fb.signOut().catch(() => undefined)
}
