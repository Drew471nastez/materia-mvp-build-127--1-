import { NewListingForm } from "@/components/sell/new-listing-form"
import { InterceptedOnly } from "@/components/sell/intercepted-only"
import { loadOwnedListing } from "@/lib/marketplace/owned-listing"

/**
 * EDITING A LISTING, AS A SHEET OVER THE SCREEN YOU WERE ON.
 *
 * The twin of `(.)products/new`, and everything that file says about why an
 * intercepting route is needed applies here without change: a sheet has to have
 * something to slide over, and Next unmounts the previous route the instant it
 * navigates, so without the interception the sheet rises over bare page
 * background. You reach this from the ⋯ on your own card, which means the screen
 * behind it is your profile and you are going straight back to it.
 *
 * ---------------------------------------------------------------------------
 * THE ID COMES FROM `params`, AND THAT IS THE ENTIRE POINT OF THIS FILE
 * ---------------------------------------------------------------------------
 * The form used to be told which listing to load by reading `?edit=` off
 * `window.location.search` inside a `useState` initialiser. On a client
 * navigation the browser's URL has not been updated yet when that runs — the App
 * Router commits the new tree first and calls `history.pushState` in an effect
 * afterwards — so it read the search string of the page you came from, got
 * nothing, and rendered a blank "Vinde un articol". It only worked if you
 * reloaded, which is the one thing nobody does.
 *
 * A route parameter has no such problem. It is part of the tree being rendered,
 * it is resolved on the server, and it arrives as a prop before the component's
 * first render rather than one effect later.
 *
 * ---------------------------------------------------------------------------
 * AND THERE IS DELIBERATELY NO loading.tsx BESIDE THIS FILE
 * ---------------------------------------------------------------------------
 * There was one, and adding the server read below is what made it wrong.
 *
 * A `loading.tsx` is a Suspense boundary, and a Suspense boundary means Next
 * shows the fallback IMMEDIATELY and swaps the real thing in when it resolves.
 * While this page was synchronous that fallback almost never appeared. The
 * moment it started awaiting a database read it appeared every time — so the tap
 * produced a sheet-shaped skeleton sliding up, and then the real sheet replacing
 * it a moment later. Two arrivals for one tap, which is the exact fault the
 * server read was added to remove, reintroduced one layer out.
 *
 * With no boundary here — and the layout does not wrap `{modal}` in one either —
 * the navigation simply waits. The screen you are on stays put and stays
 * interactive, and then the sheet mounts once, already carrying its title, its
 * price and its photographs, and slides up. One arrival.
 *
 * What pays for the wait is the prefetch: components/product/manage-listing-sheet
 * warms this route while its own sheet is still open, and SmartLink warms it for
 * the archived and draft cards on the profile grid. By the time the push happens
 * the payload — including this server read — is usually already in the client
 * cache, so "waiting" is a frame.
 *
 * The non-intercepted route KEEPS its loading.tsx, and the difference is not an
 * inconsistency: a cold load has no previous screen to hold, so there the choice
 * is a shell or a blank document.
 */
export default async function InterceptedEditListing({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  /**
   * READ HERE, SO THE FORM ARRIVES FILLED IN.
   *
   * The form used to fetch this itself: the sheet mounted empty, slid up, and
   * the row landed a few hundred milliseconds later — so every field, every chip
   * and eight photographs appeared at once, AFTER the slide had finished. Two
   * arrivals for one tap, and the second one cannot be part of the transition
   * because the transition is already over.
   *
   * A route that knows which listing it is can read the row while it renders.
   * Null when it is not yours or not there, which renders an empty form rather
   * than an error page — the same thing the client path always did.
   */
  const listing = await loadOwnedListing(id)
  // Same guard as the twin route, and this is the side that was being SHOWN
  // when it should not have been: the slot kept this modal after the edit was
  // over, so the next push of /products/new drew this listing's form.
  return (
    <InterceptedOnly path={`/products/edit/${id}`}>
      <NewListingForm editId={id} initialListing={listing} />
    </InterceptedOnly>
  )
}
