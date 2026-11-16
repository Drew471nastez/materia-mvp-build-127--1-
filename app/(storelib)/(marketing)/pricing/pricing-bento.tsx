"use client"

/*
  WHAT COMES WITH YOUR STORE (landing round 13, the owner's picture 6): the
  first sheet that rises over the plan cards. Two wide tiles on top, three
  below, each a picture with a bold line and one more under it.

  Four of the pictures are the home page's own (its "Sell what you make. Get
  paid worldwide." section, components/marketing/home/everything-in-one-place):
  the product slides, the drifting stores, the globe and the support threads,
  drawn by the same components with the same stylesheet, so they stay the
  same cards. Only the layout is this page's. The fifth, the domain reel, is
  new (./domain-reel).

  The section is an .ev root like the home one, so usePlatformSection pauses
  every loop off screen; under a covering sheet (useSheetCovered) the loops
  pause too (CSS, from the sheet's data-pz-covered), and the globe and the
  store strip stop.
*/

import { useMemo, useRef } from "react"
import { EVERYTHING_CARDS, EVERYTHING_STYLES, ProductSlides, Storefronts, Support } from "@/components/marketing/home/everything-in-one-place"
import { EverythingGlobe } from "@/components/marketing/home/everything-globe"
import { usePartsLive, usePlatformSection } from "@/components/marketing/home/platform-motion"
import { siteLimits } from "@/lib/sites/plan"
import { planDisplayName, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID } from "@/lib/billing/plans"
import { DomainReel, DOMAIN_CSS, DOMAIN_NAME } from "./domain-reel"
import { useSheetCovered } from "./pricing-sheets"

export const BENTO_HEADING = "What comes with your store."

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

/** The pictures that take nothing from the section. */
const STILL = { sell: <ProductSlides />, support: <Support />, domain: <DomainReel /> }

export function PricingBento() {
  const ref = useRef<HTMLElement>(null)
  const covered = useSheetCovered(ref)
  const { live, reduced } = usePlatformSection(ref)
  usePartsLive(ref, ".ev-card")
  const on = live && !covered
  /*
    A sheet covering this one, or the section coming into range, re-renders
    it: only the store strip and the globe take that, so the other pictures
    are made once (STILL) and React passes over them.
  */
  const store = useMemo(() => <Storefronts live={on} />, [on])
  const world = useMemo(
    () => (
      <div className="ev-vis ev-g">
        <EverythingGlobe live={on} reduced={reduced} />
      </div>
    ),
    [on, reduced],
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
  The layout, on the near black sheet. One column on a phone; two a row from
  768px (the domain tile then takes the row); two wide over three from
  1024px, as in the reference. The pictures keep the home section's heights
  on the wide tiles and stand a little lower on the three.
*/
export const BENTO_CSS = `
.ev.pz-bento{background:transparent;color:#fff;padding:clamp(72px,8vw,128px) 0 clamp(72px,8vw,120px)}
.pz-h{margin:0 0 clamp(32px,4vw,56px);padding-inline-start:var(--home-head-inset,0px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#fff;text-wrap:balance}
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
.pz-bento .ev-cap{color:#9d9ba6}
.pz-bento .ev-cap-lead{color:#fff}
.pz-bento .ev-g{box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
/* Under the next sheet, everything stands still. */
[data-pz-covered] > .pz-bento .ev-loop,[data-pz-covered] > .pz-bento .ev-tab[data-on] .ev-tab-fill,[data-pz-covered] > .pz-bento .ev-p-bg[data-on]{animation-play-state:paused}
${DOMAIN_CSS}
`
