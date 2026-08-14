import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { NewListingForm } from "@/components/sell/new-listing-form"
import { createClient } from "@/lib/supabase/server"

// Deliberately at /products/new, NOT under /app. The old flow lived in the
// seller dashboard and was built for digital products; selling a jumper isn't a
// dashboard task, it's part of the marketplace. This route sits in the marketing
// group so it inherits the site header — and the footer is suppressed for it
// (see ConditionalFooter), because a long form shouldn't end in a sitemap.
export const metadata: Metadata = {
  title: "Listează un articol | Storelib",
  robots: { index: false, follow: false },
}

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const { draft } = await searchParams

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  YOU CANNOT PUBLISH WITHOUT AN ACCOUNT, SO YOU CANNOT OPEN THE FORM
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Signed out, this drew the whole listing form: eight photographs, a category
   * picker, a price, a size, a condition — and then failed at the end, because
   * a listing needs a creator row and there is nobody to hang one on. Ten
   * minutes of work thrown away at the last step, which is the worst place a
   * marketplace can put a login wall.
   *
   * ONE GUARD, HERE, RATHER THAN AT EVERY DOOR. "Vinde" is in the desktop
   * header, the phone's tab bar, the account drawer, the hero, the empty
   * orders screen, the drafts list and the profile — seven entry points, on
   * five platforms, and the native shells reach this route through their own
   * navigation as well. Guarding the callers means seven checks that have to
   * agree; guarding the ROUTE means the answer is the same however you arrived,
   * including by typing the address.
   *
   * `getUser`, not `getSession`: this decides whether a page renders at all, and
   * a session read from a cookie the server has not verified is not something to
   * make that decision on.
   *
   * `?redirect=` is the parameter the login page already honours — see
   * app/(auth)/login/page.tsx — so signing in lands back on the form rather
   * than on the home page, and the draft id survives with it.
   */
  let signedIn = false
  try {
    const { data } = await (await createClient()).auth.getUser()
    signedIn = !!data.user
  } catch {
    /* An unreadable session is not a session. The login page is the safe side:
       it sends a signed-in visitor straight back here on its own. */
  }
  if (!signedIn) {
    const back = draft ? `/products/new?draft=${encodeURIComponent(draft)}` : "/products/new"
    redirect(`/login?redirect=${encodeURIComponent(back)}`)
  }
  // The canvas colour and the minimum height are for DESKTOP only now. On a
  // phone the form is a `fixed inset-0` sheet, so it owns the whole screen and
  // a box behind it can only be one of two things: invisible, or — if the
  // numbers ever disagree — a strip of grey showing past the sheet's edge.
  // `md:` on both, so there is nothing behind the sheet at all.
  return (
    <div className="md:min-h-[calc(100svh-56px)] md:bg-[#f6f6f7]">
      <NewListingForm draftId={draft ?? null} />
    </div>
  )
}
