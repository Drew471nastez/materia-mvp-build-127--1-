import type { Metadata } from "next"
import { AuthLogo } from "@/components/auth/auth-logo"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseReturnUrl, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { formProof, isState } from "@/lib/site-accounts/token"
import { siteBrandName } from "@/lib/site-accounts/brand"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sign in to a store",
  robots: { index: false, follow: false },
}

/**
 * ===========================================================================
 *  "CONTINUE TO <STORE>", ON STORELIB.COM
 * ===========================================================================
 * Where a visitor lands after pressing Sign in on a creator's website. The
 * account and its session are here; the website is on its own host and
 * cannot see either, on purpose. This page is the one place both are known,
 * and it asks the person before telling the website who they are.
 *
 * Asking is the point, not a formality. A website's own address could start
 * this without the visitor meaning to, and a signed-in visitor would then be
 * named to that website without a click. So the website learns who they are
 * only after they press Continue here, on storelib.com, in a page no other
 * site can frame (vercel.json sends X-Frame-Options: DENY everywhere).
 *
 * NOTHING HERE IS FOLLOWED UNCHECKED. The address to come back to must be a
 * page on a host where a creator's published website is actually served,
 * looked up in the database (lib/site-accounts/hosts.ts). Anything else gets
 * the refusal below and no link at all.
 *
 * Signed out: the login page, which comes back here afterwards (it honours a
 * `next` path on storelib.com). "Create account" goes to the sign up page
 * the same way.
 */
export default async function SiteSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)
  const target = parseReturnUrl(one(sp.return))
  const state = isState(one(sp.state)) ? (one(sp.state) as string) : null
  const signup = one(sp.mode) === "signup"

  const admin = createAdminClient()
  const owner = target && state ? await siteOwnerOfHost(admin, target.host) : null
  if (!target || !state || !owner) return <Refused />

  /*
    The session the way every other page reads it (lib/auth/page-user.ts):
    the login form only for somebody who is definitely signed out, never on a
    slow answer from Supabase, which would send a signed in buyer round the
    login page for nothing. Could not tell: the recovery reads the session in
    the browser and reloads this page.
  */
  const self = `/account/site?${new URLSearchParams({ return: target.href, state }).toString()}`
  const user = await pageUser(`${signup ? "/signup" : "/login"}?next=${encodeURIComponent(self)}`)
  if (!user) return <SessionRecovery />

  const store = await siteBrandName(admin, owner.creatorId)
  const proof = formProof({ userId: user.id, returnUrl: target.href, state })
  const siteHome = `${new URL(target.href).origin}/`

  return (
    <main className="flex min-h-svh w-full justify-center bg-white px-6 py-8 sm:py-12">
      <div className="w-full max-w-[400px]">
        <AuthLogo />
        <h1 className="mb-2 text-[28px] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[32px]">
          Sign in to {store}
        </h1>
        <p className="mb-8 text-[15px] leading-relaxed text-neutral-500">
          {store} will see your name, your email and what you have bought from them, so it can show your orders and saved items.
        </p>

        <div className="mb-6 border-y border-neutral-200 py-4">
          <p className="text-[13px] text-neutral-500">Signed in to Storelib as</p>
          <p className="mt-0.5 truncate text-[15px] font-medium text-neutral-900">{user.email || "your account"}</p>
        </div>

        {proof ? (
          <form method="post" action="/account/site/grant">
            <input type="hidden" name="return" value={target.href} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="proof" value={proof} />
            <button
              type="submit"
              className="h-12 w-full cursor-pointer rounded-full bg-neutral-900 text-[15px] font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              Continue to {store}
            </button>
          </form>
        ) : (
          <p className="text-[14px] text-red-600">Signing in to websites is not available right now. Try again later.</p>
        )}

        <a
          href={siteHome}
          className="mt-4 block text-center text-[14px] text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline"
        >
          Back to {target.host.replace(/^www\./, "")}
        </a>
      </div>
    </main>
  )
}

function Refused() {
  return (
    <main className="flex min-h-svh w-full justify-center bg-white px-6 py-8 sm:py-12">
      <div className="w-full max-w-[400px]">
        <AuthLogo />
        <h1 className="mb-2 text-[28px] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[32px]">
          This sign in link does not work
        </h1>
        <p className="mb-8 text-[15px] leading-relaxed text-neutral-500">
          It does not lead back to a store on Storelib. Go back to the store and press Sign in again.
        </p>
        <a
          href="/library"
          className="flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-[15px] font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          Open your Library
        </a>
      </div>
    </main>
  )
}
