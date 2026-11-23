"use client"

/*
  COMPARE ALL FEATURES (landing round 13, the owner's picture 8), the second
  sheet. The plans' names, prices and buttons in a row that stays at the top
  of the screen while the table scrolls under it, then the rows in groups,
  a black round check for what a plan has.

  EVERY CELL IS THE CODE'S. The rows are planComparison() (lib/billing/plans),
  the table the upgrade page already shows, written from the fee, site and
  storage tables; the prices are OFFERED_PLANS. Nothing here is typed by hand.

  ON A PHONE the label takes its own line over the three values, so the three
  plan columns stay as wide as the plan row above them and nothing scrolls
  sideways at 390px.
*/

import Link from "next/link"
import type { MouseEvent } from "react"
import { OFFERED_PLANS, planComparison, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type ComparisonValue, type OfferedPlanId } from "@/lib/billing/plans"
import type { PlanCardAction } from "@/components/billing/plan-cards"
import { tt } from "@/lib/i18n/text"

export const COMPARE_HEADING = "Compare all features"

/** planComparison() names the Grow column `pro` and the Pro column `scale`. */
const COLUMN: Record<OfferedPlanId, "free" | "pro" | "scale"> = { free: "free", [PRO_CHECKOUT_PLAN_ID]: "pro", [SCALE_CHECKOUT_PLAN_ID]: "scale" }

function Check({ on }: { on: boolean }) {
  return on ? (
    <span className="pz-cmp-yes" role="img" aria-label={tt("Included")}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 10.4 8.7 13 14 7.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="pz-cmp-no" role="img" aria-label={tt("Not included")} />
  )
}

function Value({ v }: { v: ComparisonValue }) {
  return typeof v === "boolean" ? <Check on={v} /> : <span className="pz-cmp-text">{v}</span>
}

/*
  LANDING ROUND 14, THE OWNER (his picture 14): the row that sticks was three
  rows tall, the name, the price and a button under each other. Now it is one
  row: the name with the price beside it, and the plan's button beside that.
  Where a column is too narrow for the button's words (under 1280px) the
  button is a small round arrow, its words still read by a screen reader.

  LANDING ROUND 15, THE OWNER: in the row that sticks, each plan's button
  sits on a second line under its name and price, not beside them. With a
  line of its own the button has room for its words at every width, so it
  is no longer an arrow alone. Two lines whether stuck or not, so nothing
  moves when the row starts to stick.
*/
/*
  ROUND 58: the plans page in the app draws this same table with its own
  actions. The plan somebody is on (and a change already scheduled) is
  `settled`: the same filled button, quieter, a check in place of the arrow
  for the current plan, and no press. Never white, never outlined.
*/
function PlanButton({ action, featured }: { action: PlanCardAction; featured: boolean }) {
  const cls = `pz-cmp-btn${featured ? " pz-cmp-btn-on" : ""}${action.settled ? " pz-cmp-btn-settled" : ""}`
  const inner = (
    <>
      <span className="pz-cmp-btn-t">{action.loading ? tt("Processing") : action.label}</span>
      {action.settled ? (
        action.current ? (
          <svg className="pz-cmp-btn-a" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.4 6.6 11.4 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null
      ) : (
        <svg className="pz-cmp-btn-a" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h8.5M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )
  if (action.href && !action.disabled && !action.settled) {
    return (
      <Link href={action.href} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} onClick={action.onClick} disabled={action.disabled || action.settled || action.loading} aria-busy={action.loading || undefined} data-pz-current={action.current ? "" : undefined}>
      {inner}
    </button>
  )
}

/** Whether to move without animation (the visitor asked for less motion). */
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * "COMPARE ALL FEATURES" at the top right of the cards (landing round 14).
 * A real link to #compare (it works without script); with script the page
 * glides there, the table's heading coming to rest just under the bar that
 * stays at the top (--pz-head: the site's bar on /pricing, the plans page's
 * own bar in the app). Round 58: it scrolls whichever box the page scrolls
 * in, the window on /pricing and the layer's scroller in the app.
 */
export function CompareLink() {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    const title = document.getElementById("pz-cmp-title")
    if (!title) return
    e.preventDefault()
    const head = parseFloat(getComputedStyle(title).getPropertyValue("--pz-head")) || 0
    /* The table rises in along the scroll (.pz-cmp-in): where it will rest is where it is drawn less that lift. */
    const lift = title.parentElement ? getComputedStyle(title.parentElement).transform : "none"
    const dy = lift && lift !== "none" && typeof DOMMatrixReadOnly === "function" ? new DOMMatrixReadOnly(lift).m42 : 0
    const behavior: ScrollBehavior = reduceMotion() ? "auto" : "smooth"
    const box = title.closest<HTMLElement>("[data-page-layer-scroll]")
    if (box) {
      const top = Math.max(0, title.getBoundingClientRect().top - dy - box.getBoundingClientRect().top + box.scrollTop - head - 28)
      box.scrollTo({ top, behavior })
    } else {
      const top = Math.max(0, title.getBoundingClientRect().top - dy + window.scrollY - head - 28)
      window.scrollTo({ top, behavior })
      history.replaceState(null, "", "#compare")
    }
  }
  return (
    <a href="#compare" onClick={go} data-pricing-compare-link="" className="group inline-flex items-center gap-1.5 rounded-md text-[14.5px] font-medium text-[#18181b] underline decoration-[#d4d4d8] decoration-1 underline-offset-[5px] transition-colors duration-200 hover:decoration-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/25">
      {COMPARE_HEADING}
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-y-[2px] motion-reduce:transition-none">
        <path d="M8 3.5v8.5M4.5 8.5 8 12l3.5-3.5" />
      </svg>
    </a>
  )
}

export function ComparePlans({ actions }: { actions: Record<OfferedPlanId, PlanCardAction> }) {
  const groups = planComparison()
  return (
    <section id="compare" aria-labelledby="pz-cmp-title" className="pz-cmp" data-pz-compare="">
      <style href="pz-compare" precedence="default">
        {COMPARE_CSS}
      </style>
      <div className="pz-cmp-in">
        <h2 id="pz-cmp-title" className="pz-cmp-title">
          {COMPARE_HEADING}
        </h2>
        <div role="table" aria-labelledby="pz-cmp-title" className="pz-cmp-table">
          <div role="rowgroup" className="pz-cmp-head">
            <div role="row" className="pz-cmp-row pz-cmp-plans">
              <span role="columnheader" className="pz-cmp-corner">
                <span className="sr-only">{tt("Feature")}</span>
              </span>
              {OFFERED_PLANS.map((p) => (
                <div role="columnheader" key={p.id} className="pz-cmp-plan" data-pz-plan={p.id}>
                  <span className="pz-cmp-id">
                    <span className="pz-cmp-name">{p.name}</span>
                    <span className="pz-cmp-price">
                      {p.price}
                      <span className="pz-cmp-per">{tt("/month")}</span>
                    </span>
                  </span>
                  <PlanButton action={actions[p.id]} featured={p.id === PRO_CHECKOUT_PLAN_ID} />
                </div>
              ))}
            </div>
          </div>
          {groups.map((g) => (
            <div role="rowgroup" key={g.title} className="pz-cmp-group">
              <div role="row" className="pz-cmp-row pz-cmp-gtitle">
                <span role="rowheader" aria-colspan={4} className="pz-cmp-gname">
                  {g.title}
                </span>
              </div>
              {g.rows.map((r) => (
                <div role="row" key={r.label} className="pz-cmp-row pz-cmp-line">
                  <span role="rowheader" className="pz-cmp-label">
                    {r.label}
                  </span>
                  {OFFERED_PLANS.map((p) => (
                    <span role="cell" key={p.id} className="pz-cmp-cell">
                      <Value v={r[COLUMN[p.id]]} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/*
  Four columns from 768px: the label, then the three plans. Under it the
  label spans the row and the three plans share it below. The plan row is
  sticky inside this sheet (it leaves with the sheet), white, with a
  hairline under it once it sticks.
*/
export const COMPARE_CSS = `
.pz-cmp{padding:clamp(56px,7vw,112px) 0 clamp(64px,7vw,112px);color:#18181b}
.pz-cmp-in{box-sizing:border-box;width:100%;max-width:1240px;margin-inline:auto;padding-inline:clamp(16px,4vw,48px)}
.pz-cmp-title{margin:0 0 clamp(20px,3vw,8px);font-size:clamp(30px,3.9vw,54px);font-weight:500;line-height:1.05;letter-spacing:-.045em;text-wrap:balance}
.pz-cmp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:10px}
.pz-cmp-head{position:sticky;top:var(--pz-head,0px);z-index:2;background:#fff;box-shadow:0 1px 0 #ececef}
.pz-cmp-plans{padding:10px 0}
.pz-cmp-corner{display:none}
/* Landing round 15: the name and price on one line, the button on a second line under them. */
.pz-cmp-plan{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:8px}
.pz-cmp-id{display:flex;min-width:0;align-items:baseline;gap:6px;white-space:nowrap}
.pz-cmp-name{font-size:15px;font-weight:600;letter-spacing:-.02em}
.pz-cmp-price{font-size:13px;color:#6b6874;font-variant-numeric:tabular-nums}
.pz-cmp-per{display:none;margin-left:1px}
.pz-cmp-btn{position:relative;display:inline-flex;flex:none;max-width:100%;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:999px;background:#0f0e13;color:#fff;font:inherit;font-size:12.5px;font-weight:600;white-space:nowrap;text-decoration:none;cursor:pointer;transition:background-color .2s ease}
.pz-cmp-btn-t{min-width:0;overflow:hidden;text-overflow:ellipsis}
.pz-cmp-btn-a{display:none;width:14px;height:14px;flex:none;transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.pz-cmp-btn:hover .pz-cmp-btn-a{transform:translate3d(2px,0,0)}
.pz-cmp-btn:hover{background:#2a2833}
.pz-cmp-btn-on{background:#7c3aed}
.pz-cmp-btn-on:hover{background:#6d28d9}
.pz-cmp-btn:focus-visible{outline:2px solid #18181b;outline-offset:3px}
.pz-cmp-btn:disabled{opacity:.7;cursor:not-allowed}
.pz-cmp-btn-settled,.pz-cmp-btn-settled:disabled{opacity:.7;cursor:default}
.pz-cmp-btn-settled:hover{background:#0f0e13}
.pz-cmp-btn-on.pz-cmp-btn-settled:hover{background:#7c3aed}
.pz-cmp-btn-settled:hover .pz-cmp-btn-a{transform:none}
@media(prefers-reduced-motion:reduce){.pz-cmp-btn-a{transition:none}}
.pz-cmp-gtitle{padding:36px 0 10px}
.pz-cmp-gname{grid-column:1/-1;font-size:clamp(20px,2vw,26px);font-weight:500;letter-spacing:-.03em}
.pz-cmp-line{row-gap:8px;padding:14px 0;border-bottom:1px solid #ececef;align-items:center}
.pz-cmp-label{grid-column:1/-1;font-size:14px;line-height:1.4;color:#55535c}
.pz-cmp-cell{min-width:0;font-size:14px;line-height:1.35;color:#18181b;font-variant-numeric:tabular-nums}
.pz-cmp-yes{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#0f0e13;vertical-align:middle}
.pz-cmp-yes svg{width:20px;height:20px}
.pz-cmp-no{display:inline-block;width:12px;height:1.5px;border-radius:1px;background:#b9b7c0;vertical-align:middle}
@media(min-width:768px){
  .pz-cmp-row{grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,1fr));column-gap:20px}
  .pz-cmp-corner{display:block}
  .pz-cmp-plans{padding:12px 0}
  .pz-cmp-name{font-size:clamp(17px,1.4vw,20px)}
  .pz-cmp-price{font-size:14px}
  .pz-cmp-per{display:inline}
  .pz-cmp-btn{height:34px;padding:0 15px;font-size:13.5px}
  .pz-cmp-btn-a{display:block}
  .pz-cmp-gtitle{padding:52px 0 12px}
  .pz-cmp-line{padding:17px 0}
  .pz-cmp-label{grid-column:auto;font-size:15.5px;color:#18181b}
  .pz-cmp-cell{font-size:15.5px}
  .pz-cmp-yes{width:22px;height:22px}
  .pz-cmp-yes svg{width:22px;height:22px}
}
/*
  Landing round 15, the owner: the table comes in smoothly as its sheet rises.
  The title and the table rise a little and fade up along the scroll (a
  scroll driven animation the compositor runs, transform and opacity only),
  so following "Compare all features" down reads as one opening movement.
  Its state is the scroll position, so a visit straight to #compare finds it
  in place. Without scroll driven animations, or under reduced motion, it is
  simply there.
*/
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    .pz-cmp-in{animation:pz-cmp-open linear both;animation-timeline:view();animation-range:cover 0% cover 16%}
  }
}
@keyframes pz-cmp-open{from{opacity:.2;transform:translate3d(0,40px,0)}to{opacity:1;transform:none}}
`
