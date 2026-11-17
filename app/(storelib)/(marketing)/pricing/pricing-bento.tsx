"use client"

/*
  WHAT YOU GET (landing round 13, the owner's picture 6; round 14 below):
  two wide tiles on top, three below, each a picture with a bold line and
  one more under it.

  Four of the pictures are the home page's own (its "Sell what you make. Get
  paid worldwide." section, components/marketing/home/everything-in-one-place):
  the product slides, the drifting stores, the globe and the support threads,
  drawn by the same components with the same stylesheet, so they stay the
  same cards (the stores tile is the home page's Storefronts, whatever that
  section shows). Only the layout is this page's. The fifth, the domain reel,
  is ./domain-reel.

  LANDING ROUND 14, THE OWNER: not a sheet that rises; a plain section in the
  page's flow, after "Compare all features" (pricing-client.tsx has the
  order and why). Its heading is not about "your store". On white now, the
  ground the home section's pictures and captions were drawn for.

  The section is an .ev root like the home one, so usePlatformSection pauses
  every loop off screen, and the globe and the store strip stop.
*/

import { useMemo, useRef } from "react"
import { EVERYTHING_CARDS, EVERYTHING_STYLES, ProductSlides, Storefronts, Support } from "@/components/marketing/home/everything-in-one-place"
import { EverythingGlobe } from "@/components/marketing/home/everything-globe"
import { usePartsLive, usePlatformSection } from "@/components/marketing/home/platform-motion"
import { siteLimits } from "@/lib/sites/plan"
import { planDisplayName, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID } from "@/lib/billing/plans"
import { DomainReel, DOMAIN_NAME } from "./domain-reel"

export const BENTO_HEADING = "What you get with Storelib."

/** The plans a custom domain comes with, read from the site limits: "Grow and Pro". */
function domainPlans(): string {
  const names = (["free", PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID] as const).filter((id) => siteLimits(id).customDomain).map((id) => planDisplayName(id))
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? ""
}

const card = (key: (typeof EVERYTHING_CARDS)[number]["key"]) => EVERYTHING_CARDS.find((c) => c.key === key)!

/** The five tiles, in the owner's order: two wide, then three. */
export const BENTO_CARDS = [
  { key: "sell", size: "wide", lead: card("sell").lead, rest: card("sell").rest },
  { key: "store", size: "wide", lead: card("store").lead, rest: card("store").rest },
  { key: "world", size: "third", lead: card("world").lead, rest: card("world").rest },
  { key: "support", size: "third", lead: card("support").lead, rest: card("support").rest },
  { key: "domain", size: "third", lead: "Connect your own domain.", rest: `Your store at an address you already own, like ${DOMAIN_NAME}.com, on ${domainPlans()}.` },
] as const

/**
 * The pictures that take nothing from the section. Landing round 15, the owner: the products tile here shows the
 * product card and its tabs only, without the home page's "sending a download link" notice over the Digital slide.
 */
const STILL = { sell: <ProductSlides delivery={false} />, support: <Support />, domain: <DomainReel /> }

export function PricingBento() {
  const ref = useRef<HTMLElement>(null)
  const { live, reduced } = usePlatformSection(ref)
  usePartsLive(ref, ".ev-card")
  /*
    The section coming into range re-renders it: only the store strip and the
    globe take that, so the other pictures are made once (STILL) and React
    passes over them.
  */
  const store = useMemo(() => <Storefronts live={live} />, [live])
  const world = useMemo(
    () => (
      <div className="ev-vis ev-g">
        <EverythingGlobe live={live} reduced={reduced} />
      </div>
    ),
    [live, reduced],
  )
  const visuals = { ...STILL, store, world }
  return (
    <section ref={ref} id="included" aria-labelledby="pz-bento-title" className="ev pz-bento" data-pz-bento="">
      <style href={EVERYTHING_STYLES[0].href} precedence={EVERYTHING_STYLES[0].precedence}>
        {EVERYTHING_STYLES[0].css}
      </style>
      <style href="pz-bento" precedence="w13-home">
        {BENTO_CSS}
      </style>
      <div className="home-wrap pz-bento-in">
        <h2 id="pz-bento-title" className="pz-h">
          {BENTO_HEADING}
        </h2>
        <div className="pz-grid">
          {BENTO_CARDS.map((c) => (
            <article key={c.key} data-in="" data-pz-card={c.key} className={`ev-card pz-${c.size}`}>
              {visuals[c.key]}
              <p className="ev-cap">
                <b className="ev-cap-lead">{c.lead}</b> {c.rest}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/*
  The layout, on white. One column on a phone; two a row from 768px (the
  domain tile then takes the row); two wide over three from 1024px, as in
  the reference. The pictures keep the home section's heights on the wide
  tiles and stand a little lower on the three. The heading is the compare
  table's size, so the page's section headings are one size.
*/
export const BENTO_CSS = `
.ev.pz-bento{background:#fff;color:#18181b;padding:clamp(48px,6vw,96px) 0 clamp(64px,7vw,112px)}
.pz-h{margin:0 0 clamp(28px,3.4vw,48px);padding-inline-start:var(--home-head-inset,0px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.pz-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:44px}
@media(min-width:768px){
  .pz-grid{grid-template-columns:repeat(6,minmax(0,1fr));column-gap:clamp(14px,1.6vw,24px);row-gap:clamp(44px,4.4vw,64px)}
  .pz-wide,.pz-third{grid-column:span 3}
  .pz-third:last-child{grid-column:span 6}
}
@media(min-width:1024px){
  .pz-third,.pz-third:last-child{grid-column:span 2}
  .pz-bento .pz-third .ev-vis{height:clamp(280px,min(25vw,46svh),480px)}
}
.pz-bento .ev-card{opacity:1;transform:none}
/* Landing round 15: with no download notice to make room for under the card, the phone's card stands where it does on a computer. */
@media(max-width:479px){.pz-bento [data-no-delivery] .ev-p-stage{top:44%}}
`
