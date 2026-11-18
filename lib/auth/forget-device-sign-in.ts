/**
 * ===========================================================================
 *  LOG OUT LEAVES NOTHING OF THE ACCOUNT ON THIS DEVICE
 * ===========================================================================
 * The owner: after Log out, Continue with Google or Continue with Apple put
 * them straight back into the account they had left. Two things outlived a
 * Log out:
 *
 *   1  the phone's own Google sheet kept its signed in account, and Google
 *      was asked for nothing, so it continued with it quietly (the chooser
 *      is now asked for: lib/auth/google-oauth-params.ts, and the plugin is
 *      signed out here: signOutNativeGoogle);
 *   2  the app's own copies of the session. supabase-js removes its key
 *      only when its sign out request succeeded (auth-js keeps the session
 *      on a dropped connection or a 5xx), and the app keeps that key in
 *      Capacitor Preferences as well as localStorage, where the cold start
 *      reads it back (app/(storelib)/native-start). The cached home, the
 *      OAuth carry of an unfinished sign in and the flags of a native sign
 *      in in progress were this account's too.
 *
 * So every Log out (lib/auth/log-out.ts, lib/native-bridge.ts) ends here.
 * Apple keeps nothing of ours: its sheet is Apple's, and with our copies
 * gone it asks which Apple ID afresh. Browser only; a no-op on the server.
 * Nothing here reads, logs or sends a token.
 */
import { NATIVE_CARRY_KEY } from "@/lib/auth/continue"
import { signOutNativeGoogle } from "@/lib/auth/native-sign-in"
import { forgetLastPlace } from "@/lib/native-resume"

/** The cached home route the app opens on (lib/native-bridge.ts). */
export const NATIVE_HOME_KEY = "sb-native-home"

/** Session storage flags of a native sign in that was under way. */
export const SIGN_IN_FLAGS = ["nativeAuthInProgress", "nativeRecoveryUrl"] as const

/**
 * Is this storage key one of the signed in account's own? The Supabase
 * session (`sb-<ref>-auth-token`, whole or chunked), its PKCE verifier and
 * user copy, the cached home and the OAuth carry. Nothing else: a person's
 * language, theme or drafts are the device's, not the account's.
 */
export function isAccountKey(key: string): boolean {
  return (
    /^sb-[^=;\s]+-auth-token(?:\.\d+)?$/.test(key) ||
    /^sb-[^=;\s]+-auth-token-(?:code-verifier|user)$/.test(key) ||
    key === NATIVE_HOME_KEY ||
    key === NATIVE_CARRY_KEY
  )
}

const settle = <T>(p: Promise<T>, ms: number) => Promise.race([p.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))])

function storageKeys(store: Storage): string[] {
  const out: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k) out.push(k)
  }
  return out
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
}

/** Forget this device's copy of the account. Never throws, never waits more than about two seconds. */
export async function forgetDeviceSignIn(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    for (const k of storageKeys(localStorage)) if (isAccountKey(k)) localStorage.removeItem(k)
  } catch {
    /* storage refused */
  }
  try {
    for (const k of SIGN_IN_FLAGS) sessionStorage.removeItem(k)
  } catch {
    /* storage refused */
  }
  forgetLastPlace()
  if (!isNative()) return
  const preferences = (async () => {
    const { Preferences } = await import("@capacitor/preferences")
    const { keys } = await Preferences.keys()
    await Promise.all(keys.filter(isAccountKey).map((key) => Preferences.remove({ key })))
  })()
  await Promise.all([settle(preferences, 2000), settle(signOutNativeGoogle(), 2000)])
}
