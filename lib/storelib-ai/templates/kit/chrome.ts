/**
 * ===========================================================================
 *  A TEMPLATE'S OWN FRAME: HEADER (MENU DRAWER, MEGA PANELS, SEARCH, CART,
 *  LANGUAGE AND CURRENCY) AND FOOTER
 * ===========================================================================
 * A free site draws its whole frame itself (round N); Storelib only fills
 * the hooks (lib/ai-builder/runtime-contract.ts HEADLESS_HOOK_GUIDE). These
 * builders make a template's header and footer from one well tested
 * structure, each template giving them its own layout, drawer, words and
 * CSS skin, so six templates do not share one look:
 *
 *   header   layouts split | center | stack | pill | minimal; scroll
 *            behaviour static | sticky | shrink | hide (slides away going
 *            down, back going up), see-through over the hero and solid once
 *            scrolled (round Q1's data-scrolled / data-scroll-dir /
 *            data-over-hero, a CSS scroll timeline until the host writes
 *            them); icon buttons (search, account, bag with its count) from
 *            the host's icon set with an inline fallback (./chrome-parts.ts);
 *            a running notice line (blocks); mega panels for menu links with
 *            sub links, holding collection cards (blocks) and product cards;
 *            a menu drawer (full screen with big type and a picture that
 *            follows the pointer, side, or bottom sheet) through the popover
 *            API, links arriving one after another; a bottom bar on phones;
 *            language and currency as ONE compact chip ("EN / EUR") opening
 *            a small panel, shown only when the site has more than one
 *   footer   layouts wordmark (the name running as a marquee) | newsletter |
 *            columns; menu columns where a menu has two links or more (a
 *            thinner one joins the bottom line instead of standing as a one
 *            link column); a text column (blocks); social icons; a subscribe
 *            form with placeholder, inline error and success line; card marks
 *            on a store that sells; back to top; the compact chip
 *
 * No column label is set in mono capitals: headings read as words.
 *
 * Pure. Browser safe.
 */
import { BOX, INNER, s, rootAttrs, type ComponentDef, type PresetBlock, type Setting } from "./schema"
import { footerBitsCss, icon, iconButtonCss, localeChip, localeChipCss, newsletterCss, newsletterForm, paymentMarks, scrollCss, socialIcon } from "./chrome-parts"

export type HeaderLayout = "split" | "center" | "stack" | "pill" | "minimal"
export type HeaderScroll = "static" | "sticky" | "shrink" | "hide"

export interface HeaderOptions {
  type: string
  name?: string
  layout: HeaderLayout
  drawer: "full" | "side" | "sheet"
  cart: "side" | "sheet"
  overlay?: boolean
  /** Old name for scroll "sticky" (true) or "static" (false). */
  sticky?: boolean
  scroll?: HeaderScroll
  /** A bar of icon buttons along the bottom of a phone screen. */
  phoneBar?: boolean
  /** An action button at the end of the bar (empty: none). */
  cta?: { label: string; url: string }
  scheme?: string
  /** Words, as the template speaks. */
  words?: Partial<Record<"brand" | "menu" | "close" | "search" | "searchHint" | "account" | "cart" | "empty" | "checkout" | "subtotal" | "region" | "noResults" | "loading", string>>
  notices: string[]
  features: { title: string; text: string; url: string; image?: string }[]
  /** CSS appended after the structure: the template's skin. */
  skin?: string
}

const PREVIEWS = 6

const headerStyle = `
.hd { position: relative; z-index: 40; background: var(--s-bg); color: var(--s-text); container-type: inline-size; }
.hd--overlay { margin-bottom: calc(-1 * var(--hd-h, 72px)); }
.hd--overlay .hd__notes { background: var(--s-bg); }
.hd a { color: inherit; }
.hd__notes { overflow: hidden; border-bottom: 1px solid var(--s-border); font-size: 0.8125rem; }
.hd__track { display: flex; gap: 48px; width: max-content; padding: 9px var(--theme-padding-x, 20px); }
.hd__note { margin: 0; white-space: nowrap; }
.hd__note a { text-decoration: underline; text-underline-offset: 3px; }
.hd__bar { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: var(--hd-h, 72px); padding: 0 var(--theme-padding-x, 20px); max-width: var(--theme-page-width, 1440px); margin: 0 auto; }
.hd__lead { display: flex; align-items: center; gap: 4px; min-width: 0; }
.hd__logo { display: inline-flex; align-items: center; min-height: 44px; font-family: var(--theme-font-heading), sans-serif; font-size: 1.375rem; line-height: 1; letter-spacing: -0.02em; color: var(--s-heading); text-decoration: none; overflow-wrap: anywhere; }
.hd__bar > .hd__logo { justify-self: center; }
.hd__logo img { display: block; height: auto; max-height: 44px; width: auto; max-width: 100%; }
.hd__nav { display: none; }
.hd__links { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; margin: 0; padding: 0; list-style: none; }
.hd__top { position: relative; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 12px; border: 0; background: none; color: inherit; font: inherit; font-size: 0.9375rem; text-decoration: none; cursor: pointer; }
.hd__top::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 9px; height: 1px; background: currentColor; transform: scaleX(0); transform-origin: right; transition: transform 260ms cubic-bezier(0.2, 0.7, 0.1, 1); }
.hd__top:hover::after, .hd__top:focus-visible::after, .hd__top[aria-current="page"]::after { transform: scaleX(1); transform-origin: left; }
.hd__top [data-storelib-icon] { display: inline-flex; transition: transform 200ms ease; }
.hd__links li:has(:popover-open) .hd__top [data-storelib-icon] { transform: rotate(180deg); }
.hd__tools { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.hd__account { display: none; }
.hd__cta { display: none; align-items: center; gap: 8px; min-height: 44px; margin-left: 8px; padding: 0 18px; border-radius: var(--theme-button-radius, 999px); background: var(--s-btn); color: var(--s-btn-text); font-weight: 600; text-decoration: none; white-space: nowrap; transition: transform 160ms ease, background-color 160ms ease; }
.hd a.hd__cta { color: var(--s-btn-text); }
.hd__cta:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.hd__cta:active { transform: scale(0.97); }
.hd__mega { margin: 0; inset: var(--hd-h, 72px) 0 auto; width: 100%; max-width: none; max-height: calc(100svh - var(--hd-h, 72px)); overflow-y: auto; overscroll-behavior: contain; padding: 36px var(--theme-padding-x, 20px) 44px; border: 0; border-bottom: 1px solid var(--s-border); background: var(--s-bg); color: var(--s-text); box-shadow: 0 30px 60px -40px rgb(0 0 0 / 0.45); }
.hd__mega-in { display: grid; gap: 28px; ${INNER} }
.hd__mega-all { display: inline-flex; align-items: center; gap: 10px; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.75rem, 1rem + 2.4vw, 3rem); line-height: 1; letter-spacing: -0.02em; color: var(--s-heading); text-decoration: none; }
.hd__mega-all [data-storelib-icon] { display: inline-flex; transition: transform 200ms ease; }
.hd__mega-all:hover [data-storelib-icon] { transform: translateX(4px); }
.hd__mega-list { display: grid; gap: 2px; margin: 18px 0 0; padding: 0; list-style: none; }
.hd__mega-list a { display: inline-flex; align-items: center; min-height: 40px; font-size: 1.0625rem; text-decoration: none; transition: transform 200ms ease, color 200ms ease; }
.hd__mega-list a:hover { color: var(--s-accent); transform: translateX(4px); }
.hd__feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 16px; }
.hd__feat { display: grid; gap: 8px; align-content: start; text-decoration: none; }
.hd__feat-media { display: block; aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--sl-image-radius, 0); background: var(--s-surface); }
.hd__feat-media img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 700ms cubic-bezier(0.2, 0.7, 0.1, 1); }
.hd__feat-title { font-family: var(--theme-font-heading), sans-serif; font-size: 1.125rem; color: var(--s-heading); }
.hd__feat-text { font-size: 0.875rem; color: var(--s-muted); }
.hd__prods { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.hd__prod a { display: grid; gap: 6px; text-decoration: none; }
.hd__prod-media { display: block; aspect-ratio: 1; overflow: hidden; border-radius: var(--sl-image-radius, 0); background: var(--s-surface); }
.hd__prod-media img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 700ms cubic-bezier(0.2, 0.7, 0.1, 1); }
.hd__prod-name { font-size: 0.875rem; line-height: 1.3; }
.hd__prod-price { font-size: 0.8125rem; color: var(--s-muted); font-variant-numeric: tabular-nums; }
@media (hover: hover) and (pointer: fine) { .hd__feat:hover .hd__feat-media img, .hd__prod a:hover .hd__prod-media img { transform: scale(1.05); } }
.hd__drawer { margin: 0; padding: 16px var(--theme-padding-x, 20px) 32px; border: 0; background: var(--s-bg); color: var(--s-text); overflow-y: auto; overscroll-behavior: contain; max-width: none; max-height: none; }
.hd__drawer:popover-open { display: flex; flex-direction: column; }
.hd__drawer--full { inset: 0; width: 100%; height: 100%; }
.hd__drawer--side { inset: 0 auto 0 0; width: min(460px, 100%); height: 100%; border-right: 1px solid var(--s-border); }
.hd__drawer--sheet { inset: auto 0 0; width: 100%; max-height: 90svh; border-top: 1px solid var(--s-border); border-radius: 20px 20px 0 0; }
.hd__drawer::backdrop { background: rgb(0 0 0 / 0.45); }
.hd__drawer-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.hd__drawer-body { display: grid; gap: 24px; flex: 1; align-content: start; }
.hd__mlist { margin: 20px 0 0; padding: 0; list-style: none; counter-reset: hd; }
.hd__mlist > li { border-bottom: 1px solid var(--s-border); counter-increment: hd; }
.hd__mlink, .hd__msum { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; padding: 8px 0; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.75rem, 1rem + 5vw, 3.25rem); line-height: 1; letter-spacing: -0.025em; color: var(--s-heading); text-decoration: none; cursor: pointer; list-style: none; transition: transform 260ms cubic-bezier(0.2, 0.7, 0.1, 1), color 200ms ease; }
.hd__mlink:hover, .hd__msum:hover { transform: translateX(8px); }
.hd__mlink [data-storelib-icon], .hd__msum [data-storelib-icon] { display: inline-flex; opacity: 0.55; transition: transform 200ms ease; }
.hd__msum::-webkit-details-marker { display: none; }
details[open] > .hd__msum [data-storelib-icon] { transform: rotate(45deg); }
.hd__msub { margin: 0 0 16px; padding: 0; list-style: none; }
.hd__msub a { display: flex; align-items: center; min-height: 44px; font-size: 1.0625rem; text-decoration: none; }
.hd__prev { display: none; }
.hd__drawer-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-top: 16px; border-top: 1px solid var(--s-border); }
.hd__drawer-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: none; }
.hd__drawer-link [data-storelib-icon] { display: inline-flex; }
.hd__dock { display: none; }
.hd__search-panel, .hd__cart { position: fixed; z-index: 60; background: var(--s-bg); color: var(--s-text); visibility: hidden; opacity: 0; transition: opacity var(--t-motion-hover, 200ms) ease, transform var(--t-motion-duration, 450ms) var(--t-motion-ease, cubic-bezier(0.2, 0.7, 0.1, 1)), visibility 0s linear var(--t-motion-duration, 450ms); }
.hd__search-panel { inset: 0 0 auto; max-height: 100svh; overflow-y: auto; overscroll-behavior: contain; padding: 20px var(--theme-padding-x, 20px) 36px; border-bottom: 1px solid var(--s-border); transform: translateY(-24px); box-shadow: 0 30px 60px -40px rgb(0 0 0 / 0.5); }
.hd__search-in { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: center; ${INNER} }
.hd__field { position: relative; display: flex; align-items: center; gap: 12px; min-width: 0; border-bottom: 2px solid color-mix(in srgb, currentColor 35%, transparent); transition: border-color 200ms ease; }
.hd__field:focus-within { border-bottom-color: var(--s-accent); }
.hd__field [data-storelib-icon] { display: inline-flex; opacity: 0.6; }
.hd__input { flex: 1; min-width: 0; min-height: 60px; padding: 0 2px; border: 0; border-radius: 0; background: none; color: inherit; font: inherit; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.375rem, 1rem + 2vw, 2.5rem); }
.hd__input::placeholder { color: inherit; opacity: 0.4; }
.hd__input:focus { outline: none; }
.hd__state { grid-column: 1 / -1; margin: 0; color: var(--s-muted); }
.hd__results { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 4px 24px; margin: 0; padding: 0; list-style: none; }
.hd__result a { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 14px; min-height: 72px; padding: 8px; margin: 0 -8px; border-radius: 10px; text-decoration: none; transition: background-color 160ms ease; }
.hd__result a:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
.hd__result img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; background: var(--s-surface); }
.hd__result-price { font-variant-numeric: tabular-nums; color: var(--s-muted); }
.hd__cart { display: flex; flex-direction: column; padding: 18px 20px 20px; box-shadow: 0 0 60px -20px rgb(0 0 0 / 0.45); }
.hd__cart--side { inset: 0 0 0 auto; width: min(440px, 100%); border-left: 1px solid var(--s-border); transform: translateX(32px); }
.hd__cart--sheet { inset: auto 0 0; max-height: 86svh; border-top: 1px solid var(--s-border); border-radius: 20px 20px 0 0; transform: translateY(40px); }
.hd__cart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--s-border); }
.hd__cart-title { display: inline-flex; align-items: baseline; gap: 8px; margin: 0; font-family: var(--theme-font-heading), sans-serif; font-size: 1.5rem; color: var(--s-heading); }
.hd__lines-list { flex: 1; margin: 0; padding: 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; }
.hd__line { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--s-border); }
.hd__line img { width: 72px; height: 88px; object-fit: cover; border-radius: 6px; background: var(--s-surface); }
.hd__line-title { color: var(--s-heading); text-decoration: none; }
.hd__line-var { display: block; font-size: 0.8125rem; color: var(--s-muted); }
.hd__qty { display: inline-flex; align-items: center; gap: 2px; margin-top: 10px; border: 1px solid var(--s-border); border-radius: 999px; }
.hd__qty button { display: inline-grid; place-items: center; min-width: 40px; min-height: 40px; border: 0; border-radius: 999px; background: none; color: inherit; font: inherit; cursor: pointer; }
.hd__qty button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.hd__qty [data-line-qty] { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
.hd__remove { display: inline-flex; min-height: 40px; align-items: center; margin-left: 12px; padding: 0; border: 0; background: none; color: var(--s-muted); font: inherit; font-size: 0.8125rem; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.hd__line-price { font-variant-numeric: tabular-nums; }
.hd__cart-empty { display: grid; justify-items: start; gap: 14px; margin: 28px 0; color: var(--s-muted); }
.hd__cart-empty [data-storelib-icon] { display: inline-flex; opacity: 0.5; }
.hd__cart-foot { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--s-border); }
.hd__sub { display: flex; justify-content: space-between; margin: 0; font-variant-numeric: tabular-nums; }
.hd__checkout { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; border: 0; border-radius: var(--theme-button-radius, 0); background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; transition: transform 160ms ease; }
.hd__checkout:hover { background: var(--s-btn-hover); color: var(--s-btn-hover-text); }
.hd__checkout:active { transform: scale(0.98); }
.hd__checkout [data-storelib-icon] { display: inline-flex; transition: transform 200ms ease; }
.hd__checkout:hover [data-storelib-icon] { transform: translateX(4px); }
.hd__search-panel[data-open="true"], .hd__cart[data-open="true"] { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }
.hd :focus-visible { outline: 2px solid var(--s-accent); outline-offset: 2px; }
${iconButtonCss("hd")}
${localeChipCss("hd")}
${scrollCss("hd", "hd__bar", "hd__logo", { notes: "hd__notes" })}
@container (max-width: 599px) { .hd__tools > .hd-loc { display: none; } }
@container (max-width: 959px) {
  .hd--dock .hd__bar { grid-template-columns: minmax(0, 1fr) auto; }
  .hd--dock .hd__bar > .hd__logo { justify-self: start; }
  .hd--dock .hd__tools > :not(.hd-loc) { display: none; }
  .hd--dock .hd__lead > .hd__burger { display: none; }
  .hd--dock .hd__dock { position: fixed; z-index: 45; inset: auto 12px calc(12px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 6px; border: 1px solid var(--s-border); border-radius: 18px; background: color-mix(in srgb, var(--s-bg) 92%, transparent); backdrop-filter: blur(12px); box-shadow: 0 18px 40px -20px rgb(0 0 0 / 0.5); }
  .hd__dock-btn { position: relative; display: grid; justify-items: center; gap: 2px; min-height: 52px; padding: 6px 0 4px; border: 0; border-radius: 12px; background: none; color: inherit; font: inherit; font-size: 0.6875rem; text-decoration: none; cursor: pointer; }
  .hd__dock-btn:active { background: color-mix(in srgb, currentColor 9%, transparent); }
  .hd__dock-btn [data-storelib-icon] { display: inline-flex; }
  .hd__dock-btn .hd-badge { top: 2px; right: calc(50% - 22px); }
}
@container (min-width: 960px) {
  .hd__nav { display: block; }
  .hd__account { display: inline-grid; }
  .hd__cta { display: inline-flex; }
  .hd:not(.hd--minimal) .hd__lead { display: none; }
  .hd--split .hd__bar { grid-template-columns: auto minmax(0, 1fr) auto; }
  .hd--split .hd__nav { order: 0; }
  .hd--split .hd__lead { order: -1; }
  .hd--center .hd__nav { grid-column: 1; grid-row: 1; justify-self: start; }
  .hd--center .hd__links { justify-content: flex-start; }
  .hd--center .hd__bar > .hd__logo { grid-column: 2; grid-row: 1; }
  .hd--center .hd__tools { grid-column: 3; grid-row: 1; }
  .hd--stack .hd__bar { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); row-gap: 0; padding-top: 10px; }
  .hd--stack .hd__bar > .hd__logo { grid-column: 2; grid-row: 1; font-size: 2rem; }
  .hd--stack .hd__tools { grid-column: 3; grid-row: 1; }
  .hd--stack .hd__nav { grid-column: 1 / -1; grid-row: 2; padding: 6px 0 4px; border-top: 1px solid var(--s-border); }
  .hd--pill .hd__bar { grid-template-columns: auto minmax(0, 1fr) auto; }
  .hd--pill .hd__lead { order: -1; }
  .hd--pill .hd__nav { justify-self: center; padding: 4px; border: 1px solid var(--s-border); border-radius: 999px; background: color-mix(in srgb, var(--s-bg) 88%, var(--s-text)); }
  .hd--pill .hd__top { min-height: 40px; padding: 0 16px; border-radius: 999px; transition: background-color 200ms ease; }
  .hd--pill .hd__top::after { display: none; }
  .hd--pill .hd__top:hover, .hd--pill .hd__links li:has(:popover-open) .hd__top { background: var(--s-bg); }
  .hd--minimal .hd__nav { display: none; }
  .hd--minimal .hd__bar { grid-template-columns: auto minmax(0, 1fr) auto; }
  .hd--minimal .hd__bar > .hd__logo { grid-column: 1; grid-row: 1; justify-self: start; }
  .hd--minimal .hd__lead { grid-column: 3; grid-row: 1; order: 2; }
  .hd--minimal .hd__tools { grid-column: 2; grid-row: 1; }
  .hd__mega-in { grid-template-columns: minmax(0, 3fr) minmax(0, 5fr) minmax(0, 4fr); align-items: start; }
  .hd__drawer--full .hd__drawer-body { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; gap: 48px; }
  .hd__drawer--full .hd__drawer-body > .hd__feats { display: none; }
  .hd__drawer--full .hd__prev { position: sticky; top: 0; display: block; aspect-ratio: 4 / 5; max-height: 70svh; margin-top: 20px; overflow: hidden; border-radius: var(--sl-image-radius, 0); background: var(--s-surface); }
  .hd__prev-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transform: scale(1.06); transition: opacity 420ms ease, transform 900ms cubic-bezier(0.2, 0.7, 0.1, 1); }
  .hd__prev-img:first-child { opacity: 1; transform: none; }
${Array.from({ length: PREVIEWS }, (_, i) => `  .hd__drawer:has(.hd__mlist > li:nth-child(${i + 1}):is(:hover, :focus-within)) .hd__prev-img:nth-child(${i + 1}) { opacity: 1; transform: none; }`).join("\n")}
${Array.from({ length: PREVIEWS - 1 }, (_, i) => `  .hd__drawer:has(.hd__mlist > li:nth-child(${i + 2}):is(:hover, :focus-within)) .hd__prev-img:first-child { opacity: 0; }`).join("\n")}
  .hd__mlist > li { position: relative; }
  .hd__drawer--full .hd__mlist > li::before { content: counter(hd, decimal-leading-zero); position: absolute; left: -36px; top: 26px; font-size: 0.75rem; font-variant-numeric: tabular-nums; opacity: 0.45; }
  .hd__drawer--full .hd__mlist { margin-left: 36px; }
  .hd__drawer--full .hd__mlist:hover > li:not(:hover) .hd__mlink, .hd__drawer--full .hd__mlist:hover > li:not(:hover) .hd__msum { color: color-mix(in srgb, var(--s-heading) 40%, transparent); }
}
@media (prefers-reduced-motion: no-preference) {
  .hd__notes[data-run="true"] .hd__track { animation: hd-run calc(var(--hd-speed, 40) * 1s) linear infinite; }
  .hd__notes:hover .hd__track, .hd__notes:focus-within .hd__track { animation-play-state: paused; }
  .hd__drawer { transition: opacity 260ms ease, transform 480ms cubic-bezier(0.2, 0.7, 0.1, 1), display 480ms allow-discrete, overlay 480ms allow-discrete; }
  .hd__drawer--full:popover-open { opacity: 1; transform: none; }
  @starting-style { .hd__drawer--full:popover-open { opacity: 0; transform: translateY(-16px); } }
  .hd__drawer--side:popover-open { transform: none; }
  @starting-style { .hd__drawer--side:popover-open { transform: translateX(-100%); } }
  .hd__drawer--sheet:popover-open { transform: none; }
  @starting-style { .hd__drawer--sheet:popover-open { transform: translateY(100%); } }
  .hd__drawer::backdrop { transition: background-color 300ms ease, display 300ms allow-discrete, overlay 300ms allow-discrete; }
  @starting-style { .hd__drawer:popover-open::backdrop { background-color: rgb(0 0 0 / 0); } }
  .hd__drawer .hd__mlist > li { transition: opacity 420ms ease, transform 560ms cubic-bezier(0.2, 0.7, 0.1, 1); transition-delay: calc(var(--i, 0) * 45ms + 120ms); }
${Array.from({ length: 8 }, (_, i) => `  .hd__mlist > li:nth-child(${i + 1}) { --i: ${i}; }`).join("\n")}
  @starting-style { .hd__drawer:popover-open .hd__mlist > li { opacity: 0; transform: translateY(18px); } }
  .hd__mega { transition: opacity 220ms ease, transform 320ms cubic-bezier(0.2, 0.7, 0.1, 1), display 320ms allow-discrete, overlay 320ms allow-discrete; }
  @starting-style { .hd__mega:popover-open { opacity: 0; transform: translateY(-10px); } }
  @keyframes hd-run { to { transform: translateX(-50%); } }
}
@media (prefers-reduced-motion: reduce) { .hd__search-panel, .hd__cart, .hd__top::after, .hd__mlink, .hd__msum, .hd__checkout { transition: none; } .hd__track { animation: none; } }
`

function headerTemplate(): string {
  const feature = (cls: string) => `{% for block in section.blocks %}{% if block.type == "feature" %}<a class="hd__feat ${cls}" href="{{ block.settings.url | url }}" {{ block.shopify_attributes }}>{% if block.settings.image %}<span class="hd__feat-media"><img src="{{ block.settings.image | asset }}" alt="{{ block.settings.title }}" width="480" height="600" loading="lazy"></span>{% endif %}<span class="hd__feat-title">{{ block.settings.title }}</span>{% if block.settings.text %}<span class="hd__feat-text">{{ block.settings.text }}</span>{% endif %}</a>{% endif %}{% endfor %}`
  const prod = `<li class="hd__prod"><a href="{{ p.url | default: routes.products_url }}"><span class="hd__prod-media">{% if p.image %}<img src="{{ p.image | asset }}" alt="{{ p.title }}" width="300" height="300" loading="lazy">{% endif %}</span><span class="hd__prod-name">{{ p.title }}</span><span class="hd__prod-price">{{ p.price }}</span></a></li>`
  return `
<header class="hd hd--{{ settings.layout }} hd--{{ settings.scroll }}{% if settings.overlay %} hd--overlay{% endif %}{% if settings.phone_bar %} hd--dock{% endif %}" ${rootAttrs({ spacing: false })}>
  {% if settings.show_notices %}
  <div class="hd__notes" data-run="{{ settings.run_notices }}" data-storelib-motion="marquee" data-motion-speed="{{ settings.notice_speed }}" style="--hd-speed: {{ settings.notice_speed }};">
    <div class="hd__track">
      {% for block in section.blocks %}{% if block.type == "notice" %}<p class="hd__note" {{ block.shopify_attributes }}>{% if block.settings.url %}<a href="{{ block.settings.url | url }}">{{ block.settings.text }}</a>{% else %}{{ block.settings.text }}{% endif %}</p>{% endif %}{% endfor %}
      {% if settings.run_notices %}{% for block in section.blocks %}{% if block.type == "notice" %}<p class="hd__note" aria-hidden="true">{{ block.settings.text }}</p>{% endif %}{% endfor %}{% endif %}
    </div>
  </div>
  {% endif %}
  <div class="hd__bar">
    <div class="hd__lead">
      <button class="hd__burger hd-ib" type="button" popovertarget="hd-menu-{{ section.id }}" aria-label="{{ settings.menu_label }}">${icon("menu")}</button>
    </div>
    <a class="hd__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="{{ settings.logo_width }}" height="44">{% else %}{{ shop.name | default: settings.brand }}{% endif %}</a>
    <nav class="hd__nav" aria-label="{{ settings.nav_label }}">
      <ul class="hd__links">
        {% for link in settings.menu.links %}
        <li>
          {% if link.links.size > 0 %}
          <button class="hd__top" type="button" popovertarget="hd-mega-{{ section.id }}-{{ forloop.index }}">{{ link.title }}${icon("chevron-down", "", 14)}</button>
          <div class="hd__mega" id="hd-mega-{{ section.id }}-{{ forloop.index }}" popover>
            <div class="hd__mega-in">
              <div><a class="hd__mega-all" href="{{ link.url }}">{{ link.title }}${icon("arrow-right", "", 22)}</a>
              <ul class="hd__mega-list">{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul></div>
              <div class="hd__feats">${feature("")}</div>
              {% if settings.mega_products_show %}<ul class="hd__prods">{% for p in settings.mega_products limit: 3 %}${prod}{% else %}{% for p in products limit: 3 %}${prod}{% endfor %}{% endfor %}</ul>{% endif %}
            </div>
          </div>
          {% else %}
          <a class="hd__top" href="{{ link.url }}">{{ link.title }}</a>
          {% endif %}
        </li>
        {% endfor %}
      </ul>
    </nav>
    <div class="hd__tools">
      ${localeChip("hd", "hd-loc-{{ section.id }}")}
      <a class="hd-ib" href="{{ routes.search_url }}" data-storelib-search aria-label="{{ settings.search_label }}">${icon("search")}</a>
      <a class="hd-ib hd__account" href="{{ routes.account_url }}" aria-label="{{ settings.account_label }}">${icon("user")}</a>
      <a class="hd-ib" href="{{ routes.cart_url }}" data-storelib-cart aria-label="{{ settings.cart_label }}">${icon("bag")}<span class="hd-badge" data-storelib-cart-count></span></a>
      {% if settings.cta_label %}<a class="hd__cta s__btn" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>{% endif %}
    </div>
  </div>

  <div class="hd__drawer hd__drawer--{{ settings.drawer }}" id="hd-menu-{{ section.id }}" popover>
    <div class="hd__drawer-head">
      <a class="hd__logo" href="{{ routes.root_url }}">{{ shop.name | default: settings.brand }}</a>
      <button class="hd-ib" type="button" popovertarget="hd-menu-{{ section.id }}" popovertargetaction="hide" aria-label="{{ settings.close_label }}">${icon("close", "", 22)}</button>
    </div>
    <div class="hd__drawer-body">
      <nav aria-label="{{ settings.nav_label }}">
        <ul class="hd__mlist">
          {% for link in settings.menu.links %}
          <li>
            {% if link.links.size > 0 %}
            <details><summary class="hd__msum">{{ link.title }}${icon("plus", "", 22)}</summary>
              <ul class="hd__msub"><li><a href="{{ link.url }}">{{ link.title }}</a></li>{% for child in link.links %}<li><a href="{{ child.url }}">{{ child.title }}</a></li>{% endfor %}</ul>
            </details>
            {% else %}
            <a class="hd__mlink" href="{{ link.url }}">{{ link.title }}${icon("arrow-up-right", "", 22)}</a>
            {% endif %}
          </li>
          {% endfor %}
        </ul>
      </nav>
      <div class="hd__prev" aria-hidden="true">{% for block in section.blocks %}{% if block.type == "feature" and block.settings.image %}<img class="hd__prev-img" src="{{ block.settings.image | asset }}" alt="" width="600" height="750" loading="lazy">{% endif %}{% endfor %}</div>
      <div class="hd__feats">${feature("")}</div>
    </div>
    <div class="hd__drawer-foot">
      <a class="hd__drawer-link" href="{{ routes.account_url }}">${icon("user")}{{ settings.account_label }}</a>
      ${localeChip("hd", "hd-loc-d-{{ section.id }}", { up: true })}
    </div>
  </div>

  {% if settings.phone_bar %}
  <nav class="hd__dock" aria-label="{{ settings.nav_label }}">
    <button class="hd__dock-btn" type="button" popovertarget="hd-menu-{{ section.id }}">${icon("menu")}<span>{{ settings.menu_label }}</span></button>
    <a class="hd__dock-btn" href="{{ routes.search_url }}" data-storelib-search>${icon("search")}<span>{{ settings.search_label }}</span></a>
    <a class="hd__dock-btn" href="{{ routes.account_url }}">${icon("user")}<span>{{ settings.account_label }}</span></a>
    <a class="hd__dock-btn" href="{{ routes.cart_url }}" data-storelib-cart>${icon("bag")}<span class="hd-badge" data-storelib-cart-count></span><span>{{ settings.cart_label }}</span></a>
  </nav>
  {% endif %}

  <div class="hd__search-panel" data-storelib-search-panel role="dialog" aria-label="{{ settings.search_label }}">
    <div class="hd__search-in">
      <label class="hd__field">${icon("search", "", 24)}<input class="hd__input" type="search" data-storelib-search-input placeholder="{{ settings.search_placeholder }}" aria-label="{{ settings.search_label }}"></label>
      <button class="hd-ib" type="button" data-storelib-search-close aria-label="{{ settings.close_label }}">${icon("close", "", 22)}</button>
      <p class="hd__state" data-storelib-search-loading hidden>{{ settings.loading_text }}</p>
      <p class="hd__state" data-storelib-search-empty hidden>{{ settings.no_results_text }}</p>
      <ul class="hd__results" data-storelib-search-results>
        <li class="hd__result" data-storelib-search-result hidden><a data-result-url><img data-result-image alt="" width="56" height="56"><span data-result-title></span><span class="hd__result-price" data-result-price></span></a></li>
      </ul>
    </div>
  </div>

  <aside class="hd__cart hd__cart--{{ settings.cart_style }}" data-storelib-cart-panel aria-label="{{ settings.cart_label }}">
    <div class="hd__cart-head"><p class="hd__cart-title">{{ settings.cart_label }}</p><button class="hd-ib" type="button" data-storelib-cart-close aria-label="{{ settings.close_label }}">${icon("close", "", 22)}</button></div>
    <div class="hd__cart-empty" data-storelib-cart-empty>${icon("bag", "", 32)}<p>{{ settings.empty_text }}</p></div>
    <ul class="hd__lines-list" data-storelib-cart-lines>
      <li class="hd__line" data-storelib-cart-line hidden>
        <img data-line-image alt="" width="72" height="88">
        <div><a class="hd__line-title" data-line-url><span data-line-title></span></a><span class="hd__line-var" data-line-variant></span>
          <div><span class="hd__qty"><button type="button" data-line-dec aria-label="{{ settings.less_label }}">${icon("minus", "", 16)}</button><span data-line-qty></span><button type="button" data-line-inc aria-label="{{ settings.more_label }}">${icon("plus", "", 16)}</button></span><button class="hd__remove" type="button" data-line-remove>{{ settings.remove_label }}</button></div>
        </div>
        <span class="hd__line-price" data-line-price></span>
      </li>
    </ul>
    <div class="hd__cart-foot" data-storelib-cart-filled>
      <p class="hd__sub"><span>{{ settings.subtotal_label }}</span><span data-storelib-cart-subtotal></span></p>
      <button class="hd__checkout" type="button" data-storelib-checkout>{{ settings.checkout_label }}${icon("arrow-right", "", 18)}</button>
    </div>
  </aside>
</header>`
}

export function header(o: HeaderOptions): ComponentDef {
  const w = { brand: "Studio", menu: "Menu", close: "Close", search: "Search", searchHint: "Search the shop", account: "Account", cart: "Bag", empty: "Nothing in your bag yet.", checkout: "Check out", subtotal: "Subtotal", region: "Region", noResults: "Nothing matches that. Try another word.", loading: "Looking...", ...o.words }
  const scroll: HeaderScroll = o.scroll ?? (o.sticky === false ? "static" : "sticky")
  const settings: Setting[] = [
    s.menu("menu", "Menu", "main-menu"),
    s.text("brand", "Name when there is no logo or shop name", w.brand),
    s.range("logo_width", "Logo width", 60, 260, 4, "px", 132),
    s.select("layout", "Layout", o.layout, [
      ["split", "Logo left, menu in the middle"],
      ["center", "Menu left, logo in the middle"],
      ["stack", "Logo in the middle, menu under it"],
      ["pill", "Menu in a pill"],
      ["minimal", "Logo and a menu button"],
    ]),
    s.select("scroll", "While scrolling", scroll, [
      ["static", "Scrolls away"],
      ["sticky", "Stays at the top"],
      ["shrink", "Stays, and gets slimmer"],
      ["hide", "Hides going down, back going up"],
    ]),
    s.check("overlay", "See-through over the first section, solid once scrolled", !!o.overlay),
    s.select("drawer", "Menu drawer", o.drawer, [
      ["full", "Full screen, big type"],
      ["side", "From the side"],
      ["sheet", "From the bottom"],
    ]),
    s.select("cart_style", "Cart drawer", o.cart, [
      ["side", "From the side"],
      ["sheet", "From the bottom"],
    ]),
    s.check("phone_bar", "Buttons along the bottom on phones", !!o.phoneBar),
    s.text("cta_label", "Button at the end (empty hides it)", o.cta?.label ?? ""),
    s.url("cta_url", "Button goes to", o.cta?.url ?? "/products"),
    s.header("hdr_mega", "Menu panels"),
    s.check("mega_products_show", "Show products in menu panels", true),
    s.products("mega_products", "Products in menu panels (empty shows the newest)", 3),
    s.header("hdr_notices", "Notice line"),
    s.check("show_notices", "Show the notice line", o.notices.length > 0),
    s.check("run_notices", "Notices run sideways", o.notices.length > 1),
    s.range("notice_speed", "Seconds per loop", 10, 90, 5, "s", 40),
    s.header("hdr_words", "Words"),
    s.text("nav_label", "Menu name (read aloud)", "Main"),
    s.text("menu_label", "Menu button", w.menu),
    s.text("close_label", "Close button", w.close),
    s.text("search_label", "Search", w.search),
    s.text("search_placeholder", "Search hint", w.searchHint),
    s.text("loading_text", "While searching", w.loading),
    s.text("no_results_text", "No results", w.noResults),
    s.text("account_label", "Account", w.account),
    s.text("cart_label", "Cart", w.cart),
    s.text("empty_text", "Empty cart", w.empty),
    s.text("subtotal_label", "Subtotal", w.subtotal),
    s.text("checkout_label", "Checkout button", w.checkout),
    s.text("remove_label", "Remove", "Remove"),
    s.text("less_label", "One less (read aloud)", "One less"),
    s.text("more_label", "One more (read aloud)", "One more"),
    s.text("language_label", "Language", "Language"),
    s.text("currency_label", "Currency", "Currency"),
    s.scheme(o.scheme ?? "site"),
  ]
  const preset: PresetBlock[] = [
    ...o.notices.map((text) => ({ type: "notice", settings: { text, url: "" } })),
    ...o.features.map((f) => ({ type: "feature", settings: { title: f.title, text: f.text, url: f.url, image: f.image ?? "" } })),
  ]
  return {
    type: o.type,
    name: o.name ?? "Site header",
    kind: "header",
    template: headerTemplate(),
    style: headerStyle + (o.skin ?? ""),
    settings,
    blocks: [
      { type: "notice", name: "Notice", limit: 4, settings: [s.text("text", "Text", "Orders packed every weekday"), s.url("url", "Link", "")] },
      { type: "feature", name: "Collection card", limit: 3, settings: [s.text("title", "Title", "New this month"), s.text("text", "Line under it", "See what just arrived"), s.url("url", "Link", "/products"), s.image("image", "Picture")] },
    ],
    maxBlocks: 7,
    preset,
  }
}

/* ── footer ────────────────────────────────────────────────────────────── */

export interface FooterOptions {
  type: string
  name?: string
  layout: "wordmark" | "newsletter" | "columns"
  scheme?: string
  words: { brand: string; newsHeading: string; newsText: string; legal: string; subscribe?: string; email?: string; emailHint?: string; thanks?: string; emailError?: string }
  columns: { heading: string; menu: string }[]
  notes: { heading: string; text: string }[]
  /** Social links (blocks): label and address; the icon follows the address. */
  social?: { label: string; url: string }[]
  skin?: string
}

const footerStyle = `
.ft { ${BOX} overflow: hidden; }
.ft a { color: inherit; }
.ft__in { display: grid; gap: clamp(36px, 6vw, 72px); ${INNER} }
.ft__lead { display: grid; gap: 18px; align-content: start; max-width: 40rem; }
.ft__h { margin: 0; font-family: var(--theme-font-heading), sans-serif; font-size: clamp(1.75rem, 1.1rem + 3vw, 3.5rem); line-height: 0.98; letter-spacing: -0.02em; color: var(--s-heading); }
.ft__text { margin: 0; color: var(--s-muted); line-height: 1.6; }
.ft__text p { margin: 0; }
.ft__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 28px 24px; align-content: start; }
.ft__col-h { margin: 0 0 10px; font-size: 1rem; font-weight: 600; color: var(--s-heading); }
.ft__col ul { margin: 0; padding: 0; list-style: none; }
.ft__col li a { display: inline-flex; align-items: center; min-height: 36px; text-decoration: none; color: var(--s-muted); transition: color 180ms ease, transform 200ms ease; }
.ft__col li a:hover { color: var(--s-text); transform: translateX(3px); }
.ft__col-text { margin: 0; color: var(--s-muted); line-height: 1.6; }
.ft__col-text p { margin: 0 0 8px; }
.ft__mark { margin: clamp(48px, 9vw, 112px) 0 0; font-family: var(--theme-font-heading), sans-serif; font-size: min(18cqi, 280px); line-height: 0.82; letter-spacing: -0.04em; color: var(--s-heading); }
.ft__mark .ft-run__word::after { content: "\\2009\\2022\\2009"; opacity: 0.35; }
.ft__base { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px 24px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--s-border); font-size: 0.8125rem; color: var(--s-muted); ${INNER} }
.ft__base p { margin: 0; }
.ft__base-links { display: flex; flex-wrap: wrap; gap: 0 18px; margin: 0; padding: 0; list-style: none; }
.ft__base-links a { display: inline-flex; min-height: 40px; align-items: center; text-decoration: none; }
.ft__base-links a:hover { color: var(--s-text); }
.ft-social:empty, .ft__base-links:empty { display: none; }
.ft__base-end { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.ft-news { margin-top: 4px; }
.ft-news__row { border-radius: var(--theme-input-radius, 10px); }
${newsletterCss("ft")}
${footerBitsCss("ft")}
${localeChipCss("ft")}
@container (min-width: 900px) {
  .ft--newsletter .ft__in, .ft--wordmark .ft__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: start; }
  .ft--columns .ft__lead { max-width: none; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
}
`

function footerTemplate(): string {
  const thin = `block.type == "column" and block.settings.menu.links.size < 2`
  return `
<footer class="ft ft--{{ settings.layout }}" ${rootAttrs()}>
  <div class="ft__in">
    <div class="ft__lead">
      {% if settings.show_newsletter %}
      <h2 class="ft__h">{{ settings.news_heading | raw }}</h2><div class="ft__text">{{ settings.news_text | raw }}</div>
      ${newsletterForm("ft", { label: "{{ settings.email_label }}", placeholder: "{{ settings.email_placeholder }}", button: "{{ settings.subscribe_label }}", error: "{{ settings.email_error }}", thanks: "{{ settings.thanks_text }}" })}
      {% endif %}
      <ul class="ft-social" aria-label="{{ settings.social_label }}">{% for block in section.blocks %}{% if block.type == "social" %}<li {{ block.shopify_attributes }}><a href="{{ block.settings.url | url }}" aria-label="{{ block.settings.label }}">${socialIcon("block.settings.url")}</a></li>{% endif %}{% endfor %}</ul>
    </div>
    <div class="ft__cols">
      {% for block in section.blocks %}
        {% if block.type == "column" and block.settings.menu.links.size > 1 %}
        <div class="ft__col" {{ block.shopify_attributes }}><h3 class="ft__col-h">{{ block.settings.heading }}</h3><ul>{% for link in block.settings.menu.links %}<li><a href="{{ link.url }}">{{ link.title }}</a></li>{% endfor %}</ul></div>
        {% elsif block.type == "note" %}
        <div class="ft__col" {{ block.shopify_attributes }}><h3 class="ft__col-h">{{ block.settings.heading }}</h3><div class="ft__col-text">{{ block.settings.text | raw }}</div></div>
        {% endif %}
      {% endfor %}
    </div>
  </div>
  {% if settings.layout == "wordmark" %}<div class="ft__mark ft-run" aria-hidden="true" data-storelib-motion="marquee" data-motion-speed="{{ settings.mark_speed }}" style="--ft-speed: {{ settings.mark_speed }};"><div class="ft-run__track"><p class="ft-run__word">{{ shop.name | default: settings.brand }}</p><p class="ft-run__word">{{ shop.name | default: settings.brand }}</p><p class="ft-run__word">{{ shop.name | default: settings.brand }}</p><p class="ft-run__word">{{ shop.name | default: settings.brand }}</p></div></div>{% endif %}
  <div class="ft__base">
    <p>&copy; {{ shop.name | default: settings.brand }} {{ settings.legal }}</p>
    <ul class="ft__base-links">{% for block in section.blocks %}{% if ${thin} %}{% for link in block.settings.menu.links %}<li><a href="{{ link.url }}">{{ link.title }}</a></li>{% endfor %}{% endif %}{% endfor %}</ul>
    <div class="ft__base-end">
      {% if settings.show_payments and products.size > 0 %}${paymentMarks("ft")}{% endif %}
      ${localeChip("ft", "ft-loc-{{ section.id }}", { up: true })}
      <a class="ft-top" href="#" data-storelib-scroll="top">{{ settings.top_label }}${icon("arrow-up", "", 18)}</a>
    </div>
  </div>
</footer>`
}

export function footer(o: FooterOptions): ComponentDef {
  const social = o.social ?? [{ label: "Instagram", url: "https://www.instagram.com/" }]
  return {
    type: o.type,
    name: o.name ?? "Site footer",
    kind: "footer",
    template: footerTemplate(),
    style: footerStyle + (o.skin ?? ""),
    settings: [
      s.select("layout", "Layout", o.layout, [
        ["wordmark", "Big name running along the bottom"],
        ["newsletter", "Newsletter first"],
        ["columns", "Columns"],
      ]),
      s.text("brand", "Name when there is no shop name", o.words.brand),
      s.range("mark_speed", "Seconds per loop of the big name", 10, 90, 2, "s", 36),
      s.header("hdr_news", "Newsletter"),
      s.check("show_newsletter", "Show the newsletter", true),
      s.inline("news_heading", "Heading", o.words.newsHeading),
      s.rich("news_text", "Text", o.words.newsText),
      s.text("email_label", "Email label", o.words.email ?? "Your email"),
      s.text("email_placeholder", "Email hint", o.words.emailHint ?? "Your email address"),
      s.text("email_error", "When the email is not right", o.words.emailError ?? "That email looks incomplete."),
      s.text("subscribe_label", "Button", o.words.subscribe ?? "Sign up"),
      s.text("thanks_text", "After signing up", o.words.thanks ?? "You are on the list. Thank you."),
      s.header("hdr_base", "Bottom line"),
      s.text("legal", "After the name", o.words.legal),
      s.check("show_payments", "Show card marks when the shop sells", true),
      s.text("payments_label", "Card marks (read aloud)", "Ways to pay"),
      s.text("social_label", "Social links (read aloud)", "Follow"),
      s.text("top_label", "Back to top", "Back to top"),
      s.text("language_label", "Language", "Language"),
      s.text("currency_label", "Currency", "Currency"),
      s.scheme(o.scheme ?? "site_inverse"),
      s.header("hdr_spacing", "Spacing"),
      s.range("padding_top", "Top padding", 0, 200, 8, "px", 96),
      s.range("padding_bottom", "Bottom padding", 0, 200, 8, "px", 32),
    ],
    blocks: [
      { type: "column", name: "Menu column", limit: 4, settings: [s.text("heading", "Heading", "Shop"), s.menu("menu", "Menu", "footer")] },
      { type: "note", name: "Text column", limit: 2, settings: [s.text("heading", "Heading", "Visit"), s.rich("text", "Text", "<p>Open every day.</p>")] },
      { type: "social", name: "Social link", limit: 6, settings: [s.text("label", "Name (read aloud)", "Instagram"), s.url("url", "Address", "https://www.instagram.com/")] },
    ],
    maxBlocks: 12,
    preset: [
      ...o.columns.map((c) => ({ type: "column", settings: { heading: c.heading, menu: c.menu } })),
      ...o.notes.map((n) => ({ type: "note", settings: { heading: n.heading, text: n.text } })),
      ...social.map((x) => ({ type: "social", settings: { label: x.label, url: x.url } })),
    ],
  }
}
