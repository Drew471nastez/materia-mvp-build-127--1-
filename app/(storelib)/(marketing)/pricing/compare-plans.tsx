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
*/
function PlanButton({ action, featured }: { action: PlanCardAction; featured: boolean }) {
  const cls = `pz-cmp-btn${featured ? " pz-cmp-btn-on" : ""}`
  const inner = (
    <>
      <span className="pz-cmp-btn-t">{action.loading ? tt("Processing") : action.label}</span>
      <svg className="pz-cmp-btn-a" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8h8.5M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  )
  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} onClick={action.onClick} disabled={action.disabled || action.loading} aria-busy={action.loading || undefined}>
      {inner}
    </button>
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
.pz-cmp-title{margin:0 0 clamp(20px,3vw,8px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;text-wrap:balance}
.pz-cmp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:10px}
.pz-cmp-head{position:sticky;top:var(--pz-head,0px);z-index:2;background:#fff;box-shadow:0 1px 0 #ececef}
.pz-cmp-plans{padding:10px 0}
.pz-cmp-corner{display:none}
/* One row (landing round 14): the name and price on one line, the button beside them. */
.pz-cmp-plan{display:flex;min-width:0;align-items:center;gap:8px}
.pz-cmp-id{display:flex;min-width:0;align-items:baseline;gap:6px;white-space:nowrap}
.pz-cmp-name{font-size:15px;font-weight:600;letter-spacing:-.02em}
.pz-cmp-price{font-size:13px;color:#6b6874;font-variant-numeric:tabular-nums}
.pz-cmp-per{display:none;margin-left:1px}
.pz-cmp-btn{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;gap:6px;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:#0f0e13;color:#fff;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;cursor:pointer;transition:background-color .2s ease}
.pz-cmp-btn-t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pz-cmp-btn-a{width:14px;height:14px;flex:none;transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.pz-cmp-btn:hover .pz-cmp-btn-a{transform:translate3d(2px,0,0)}
.pz-cmp-btn:hover{background:#2a2833}
.pz-cmp-btn-on{background:#7c3aed}
.pz-cmp-btn-on:hover{background:#6d28d9}
.pz-cmp-btn:focus-visible{outline:2px solid #18181b;outline-offset:3px}
.pz-cmp-btn:disabled{opacity:.7;cursor:not-allowed}
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
  .pz-cmp-btn{width:32px;height:32px}
  .pz-cmp-gtitle{padding:52px 0 12px}
  .pz-cmp-line{padding:17px 0}
  .pz-cmp-label{grid-column:auto;font-size:15.5px;color:#18181b}
  .pz-cmp-cell{font-size:15.5px}
  .pz-cmp-yes{width:22px;height:22px}
  .pz-cmp-yes svg{width:22px;height:22px}
}
/* Wide enough for the button's words beside the name and price. */
@media(min-width:1280px){
  .pz-cmp-plan{gap:14px}
  .pz-cmp-btn{width:auto;height:34px;padding:0 15px}
  .pz-cmp-btn-t{position:static;width:auto;height:auto;overflow:visible;clip:auto}
  .pz-cmp-btn-a{display:none}
}
`
