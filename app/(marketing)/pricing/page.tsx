import { PricingPageClient } from "./pricing-client"

/*
  THE SAME PAGE FOR EVERY VISITOR, SO IT IS BUILT ONCE AND SERVED FROM THE
  CDN (the owner: marketing pages served from the CDN). It read the session
  and the query string on the server, and either one alone made /pricing a
  function call for every visitor. Both are read in the browser now
  (pricing-client): who is signed in from the header's record of the
  session, and ?source=upgrade&returnTo from the address. Neither changes
  the first paint: the plan's button keeps its label either way, and the
  heading the upgrade mode renames is still hidden at that moment, waiting
  for its scroll-in.
*/
export default function PricingPage() {
  return <PricingPageClient />
}
