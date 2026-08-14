import { redirect } from "next/navigation"

import { NewListingForm } from "@/components/sell/new-listing-form"
import { InterceptedOnly } from "@/components/sell/intercepted-only"
import { createClient } from "@/lib/supabase/server"

/**
 * The sell sheet, OVER the screen you were on.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists: a slide has to have something to slide over
 * ---------------------------------------------------------------------------
 * The sheet already came up from the bottom and went back down. What it moved
 * over was nothing — Next unmounts the previous route the instant it navigates,
 * so behind the sheet was the bare layout, and every pixel the sheet had not
 * yet covered on the way up, or had just uncovered on the way down, was empty
 * white. That is not a transition with a blemish in it; it is a transition
 * showing you that there is nothing there.
 *
 * This is the same rule app/globals.css states for a listing — "no travel that
 * moves an edge past the frame… anything sliding in from off-screen exposes the
 * bare page background" — and a bottom sheet is nothing BUT travel past the
 * frame. So the answer was never to tune the animation. It was to give it
 * something underneath.
 *
 * An intercepting route does exactly that. `(.)products/new` catches the
 * client-side push from the + in the tab bar and renders here, in the layout's
 * `@modal` slot, while `children` goes on rendering whatever you were looking
 * at. The feed, or a profile, is still mounted and still on screen; the sheet
 * rises over it and drops back off it, and `router.back()` closes the modal and
 * leaves that screen exactly where it was — same scroll position, no refetch.
 *
 * ---------------------------------------------------------------------------
 * The other route is not dead code
 * ---------------------------------------------------------------------------
 * app/(marketing)/products/new/page.tsx still exists and still has to. An
 * interception only happens on a client navigation from inside this layout: a
 * shared link, a reload, a cold app launch straight into /products/new, or a
 * push from outside the group all render THAT one, full-page. Both must work,
 * and both render the same component so they cannot drift.
 *
 * It is also the failure mode. If an interception does not fire for any reason,
 * what happens is the full-page route — which is precisely how this behaved
 * before this file was added, rather than anything broken.
 */
export default async function InterceptedNewListing({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  // `?draft=` is read HERE rather than off `window.location` inside the form.
  // On a client navigation the browser's URL is still the previous page's when
  // the form first renders — the router commits the tree and calls pushState in
  // an effect afterwards — so a draft opened from the drafts list arrived at a
  // blank form. Same fault, same fix, as the edit route beside this one.
  const { draft } = await searchParams
  // `overlay` — the whole reason this file and the page route beside it can no
  // longer render the same thing unqualified. A parallel slot is a SIBLING of
  // <main>, so an element that goes `static` above md joins the document flow
  // and the form is appended under whatever page you were looking at. See the
  // note on the prop in components/sell/new-listing-form.tsx.
  // Guarded, because a parallel slot does not clear itself on a soft
  // navigation — see components/sell/intercepted-only. Without this the slot
  // goes on drawing whatever it last matched, which is how opening "add a
  // listing" could show the edit form for another product.
  /**
   * THE SAME GUARD AS THE FULL-PAGE ROUTE, and it has to be here too.
   *
   * An interception catches the CLIENT navigation — the + in the tab bar, Vinde
   * in the header — which is how almost everybody reaches this form. Guarding
   * only products/new/page.tsx would leave the sheet opening over the feed for
   * a signed-out visitor and failing at Publică, which is the ten minutes of
   * work this guard exists to protect.
   */
  let signedIn = false
  try {
    const { data } = await (await createClient()).auth.getUser()
    signedIn = !!data.user
  } catch {
    /* An unreadable session is not a session — see the note on the page. */
  }
  if (!signedIn) {
    const back = draft ? `/products/new?draft=${encodeURIComponent(draft)}` : "/products/new"
    redirect(`/login?redirect=${encodeURIComponent(back)}`)
  }

  return (
    <InterceptedOnly path="/products/new">
      <NewListingForm draftId={draft ?? null} overlay />
    </InterceptedOnly>
  )
}
