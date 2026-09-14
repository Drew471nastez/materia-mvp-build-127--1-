/**
 * The reveal itself, with an address and without one.
 *
 * It lives in the About block at the bottom of a creator page. It was on the
 * header's line under the bio for a day and it read oddly there, among the
 * follower count and the social links — that line says who somebody is and
 * where else they are, not how to email them.
 *
 * The control is what is measured rather than the block around it: About
 * renders it directly, and mounting the whole block drags in the section
 * machinery without telling us anything more about the button.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ContactReveal } from "@/components/storefront/contact-reveal"

createRoot(document.getElementById("app")!).render(
  <div style={{ background: "#fff", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
    {/* The @handle sits near it on the real page; it is here so a check
        looking for an address cannot mistake a username for one. */}
    <p data-case="handle">@andrewrullz</p>
    <div data-case="with">
      <ContactReveal email="hello@andrewrullz.com" />
    </div>
    <div data-case="without">
      <ContactReveal email="" />
    </div>
  </div>,
)
