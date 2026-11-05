import type { Metadata } from "next"
import { androidIntentFor, appLinkFor } from "@/lib/connect/app-return"
import { safeReturnPath } from "@/lib/native-connect"
import { ConnectReturnGo } from "./go"

/**
 * WHERE THE IN-APP BROWSER SHEET HANDS A SIGN IN BACK TO THE APP (round 39,
 * lib/native-connect.ts says the whole way). GitHub or Supabase sent the
 * sheet back to Storelib's callback; the callback, seeing the sign in began
 * in the app, sent it here with its own address. This page passes that
 * address to the app through the app's scheme, at once and on a tap, and
 * the app closes the sheet and finishes there, signed in.
 *
 * Nothing here is secret or finishes anything: the address only works in
 * the web view of the person who started it. Only the two callbacks are
 * ever handed on (safeReturnPath).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Back to Storelib",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function ConnectReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const to = safeReturnPath(typeof q.to === "string" ? q.to : null)
  const platform = q.app === "android" ? "android" : "ios"
  const provider = to?.startsWith("/api/github/") ? "GitHub" : to ? "Supabase" : null
  const href = to ? (platform === "android" ? androidIntentFor(to) : appLinkFor("ios", to)) : null
  const auto = to ? appLinkFor(platform, to) : null
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-8 text-center" data-connect-return="">
      {href && auto ? (
        <>
          <ConnectReturnGo href={auto} />
          <h1 className="text-[20px] font-semibold text-[#1a1a2e]">Back to Storelib</h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-6 text-[#6b7280]">You're signed in to {provider}. Open Storelib to finish connecting it.</p>
          <a href={href} className="mt-6 inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl bg-[#1a1a2e] px-6 text-[15px] font-semibold text-white" data-connect-return-go="">
            Open Storelib
          </a>
        </>
      ) : (
        <>
          <h1 className="text-[20px] font-semibold text-[#1a1a2e]">This link has expired</h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-6 text-[#6b7280]">Close this and connect again from your website settings.</p>
        </>
      )}
    </main>
  )
}
