/**
 * ===========================================================================
 *  CHROME PARTS: ICONS, THE SCROLL STATES, THE LANGUAGE AND CURRENCY CHIP,
 *  FORM FIELDS, SOCIAL AND PAYMENT MARKS (round Q2)
 * ===========================================================================
 * Shared by both template kits (./chrome.ts, ../kit-b.ts) and mirrored by the
 * chrome kit examples (lib/storelib-ai/library/examples/chrome), so a header
 * is never "Search  Cart  Region  Sign in" written out as words again.
 *
 * ICONS. `icon("bag")` is a span the host knows (data-storelib-icon, round
 * Q1's trusted icon set) holding the same icon drawn inline: a 24px, 1.6px
 * stroke line icon. With the host's set the host's drawing is used; without
 * it (an older page, the visual critic's script-free render) the inline one
 * shows. Either way the button carries the words as its aria-label.
 *
 * SCROLL STATES. The host writes data-scrolled, data-scroll-dir (up, down)
 * and data-over-hero on the header or an element around it (round Q1). The
 * rules here match the attribute wherever it is, on the root itself or any
 * ancestor, since a section's CSS is scoped and can only look up through
 * :is(... *). Until the host writes any of them (no script, an older host),
 * a CSS scroll timeline does the same where the browser has one: solid
 * after the first 120px, shrunk, and nothing hidden (only a script knows the
 * direction, so hide on scroll down needs the host).
 *
 * Pure. Browser safe.
 */

export type IconName =
  | "bag" | "cart" | "search" | "user" | "menu" | "close" | "globe" | "heart" | "arrow-right" | "arrow-up" | "arrow-up-right"
  | "plus" | "minus" | "play" | "pause" | "chevron-down" | "check" | "mail" | "pin" | "phone"
  | "instagram" | "tiktok" | "youtube" | "x" | "facebook" | "pinterest" | "linkedin" | "github" | "spotify" | "link"

const PATHS: Record<IconName, string> = {
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9.5" cy="19.5" r="1.2"/><circle cx="16.5" cy="19.5" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>',
  menu: '<path d="M4 8h16M4 16h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  "arrow-right": '<path d="M4 12h15M13 6l6 6-6 6"/>',
  "arrow-up": '<path d="M12 20V5M6 11l6-6 6 6"/>',
  "arrow-up-right": '<path d="M7 17 17 7M8 7h9v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  "chevron-down": '<path d="m7 10 5 5 5-5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6"/>',
  tiktok: '<path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8"/><path d="M14 3.5c.4 2.6 2.2 4.4 5 4.6"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
  x: '<path d="M4.5 4h4.2l10.8 16h-4.2L4.5 4Z"/><path d="M19.2 4 13.4 10.6M10.6 13.4 4.8 20"/>',
  facebook: '<path d="M14.5 21v-8h2.7l.4-3.2h-3.1V8c0-.9.3-1.6 1.6-1.6h1.7V3.6a22 22 0 0 0-2.5-.1c-2.4 0-4 1.5-4 4.2v2.1H8.6V13h2.7v8"/>',
  pinterest: '<circle cx="12" cy="12" r="8.5"/><path d="M11 9.5c0-1.6 1.2-2.5 2.5-2.5 1.6 0 2.6 1.2 2.6 2.8 0 2.2-1.4 3.9-3.2 3.9-1 0-1.6-.7-1.4-1.6M12 11.5l-2 9"/>',
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6V16"/>',
  github: '<path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.2c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.5 11.5 0 0 0-6 0C6.3 3.1 5.3 3.4 5.3 3.4a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.8c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  spotify: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c2-.5 3.9-.3 5.6.6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[]

/** The icon's inline drawing alone (24px box, 1.6px line). */
export function iconSvg(name: IconName, size = 20): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${PATHS[name]}</svg>`
}

/** An icon the host may draw from its own set (round Q1), drawn inline until it does. Decorative: the button around it says the words. */
export function icon(name: IconName, cls = "", size = 20): string {
  return `<span${cls ? ` class="${cls}"` : ""} data-storelib-icon="${name}" aria-hidden="true">${iconSvg(name, size)}</span>`
}

/**
 * A social link's icon picked from its address (instagram.com draws the
 * camera, and so on), in the template language, so a creator who pastes a
 * new link gets the right mark. `urlExpr` is the expression that holds it.
 */
export function socialIcon(urlExpr: string, cls = ""): string {
  const order: [string, IconName][] = [["instagram", "instagram"], ["tiktok", "tiktok"], ["youtu", "youtube"], ["x.com", "x"], ["twitter", "x"], ["facebook", "facebook"], ["pinterest", "pinterest"], ["linkedin", "linkedin"], ["github", "github"], ["spotify", "spotify"], ["mailto", "mail"], ["maps", "pin"]]
  return order.map(([needle, name], i) => `{% ${i === 0 ? "if" : "elsif"} ${urlExpr} contains "${needle}" %}${icon(name, cls)}`).join("") + `{% else %}${icon("link", cls)}{% endif %}`
}

/* ── state selectors ──────────────────────────────────────────────────── */

const ON = (attr: string, value?: string) => {
  const a = value ? `[${attr}="${value}"]` : `[${attr}]:not([${attr}="false"]):not([${attr}="0"])`
  return `:is(${a}, ${a} *)`
}
/** The root is scrolled past the top (host state). */
export const SCROLLED = ON("data-scrolled")
/** The visitor is scrolling down (host state). */
export const GOING_DOWN = ON("data-scroll-dir", "down")
/** The header sits over the first section (host state). */
export const OVER_HERO = ON("data-over-hero", "true")
/** No host scroll state at all: the CSS fallback may run. */
export const NO_HOST_STATE = ":not(:is([data-scrolled], [data-scrolled] *))"

/**
 * The header's scroll behaviours on root class `root` (the element the
 * modifier classes sit on):
 *   .<root>--sticky   stays at the top
 *   .<root>--shrink   stays, and its bar gets shorter once scrolled
 *   .<root>--hide     stays, slides away going down and back going up
 *   .<root>--overlay  see-through over the first section, solid once scrolled
 * The bar is `bar`, the logo `logo`. The solid colour is var(--s-bg).
 */
export function scrollCss(root: string, bar: string, logo: string, opts: { height?: string; shrunk?: string } = {}): string {
  const h = opts.height ?? "var(--hd-h, 72px)"
  const small = opts.shrunk ?? "56px"
  const r = `.${root}`
  return `
${r}--sticky, ${r}--shrink, ${r}--hide { position: sticky; top: 0; }
${r} { transition: background-color var(--t-motion-hover, 220ms) ease, box-shadow var(--t-motion-hover, 220ms) ease, transform calc(var(--t-motion-duration, 450ms) * 0.8) var(--t-motion-ease, cubic-bezier(0.2, 0.7, 0.1, 1)); }
${r} .${bar} { transition: min-height calc(var(--t-motion-duration, 450ms) * 0.6) var(--t-motion-ease, ease); }
${r} .${logo} { transition: transform calc(var(--t-motion-duration, 450ms) * 0.6) var(--t-motion-ease, ease); transform-origin: left center; }
${r}--overlay { background: transparent; }
${r}--overlay:is(${SCROLLED}), ${r}--overlay:is(${ON("data-over-hero", "false")}) { background: var(--s-bg); box-shadow: 0 1px 0 var(--s-border); }
${r}--overlay:is(${OVER_HERO}):not(:is(${SCROLLED})) { background: transparent; box-shadow: none; }
${r}:is(${SCROLLED}):not(${r}--overlay) { box-shadow: 0 1px 0 var(--s-border), 0 10px 30px -18px rgb(0 0 0 / 0.35); }
${r}--shrink:is(${SCROLLED}) .${bar} { min-height: ${small}; }
${r}--shrink:is(${SCROLLED}) .${logo} { transform: scale(0.86); }
${r}--hide:is(${SCROLLED}):is(${GOING_DOWN}):not(:focus-within):not(:has(:popover-open)) { transform: translateY(-100%); }
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    ${r}--overlay${NO_HOST_STATE} { animation: hd-solid linear both; animation-timeline: scroll(root); animation-range: 0 120px; }
    ${r}--shrink${NO_HOST_STATE} .${bar} { animation: hd-shrink linear both; animation-timeline: scroll(root); animation-range: 0 160px; }
  }
}
@keyframes hd-solid { from { background-color: transparent; } to { background-color: var(--s-bg); color: var(--s-text); box-shadow: 0 1px 0 var(--s-border); } }
@keyframes hd-shrink { from { min-height: ${h}; } to { min-height: ${small}; } }
@media (prefers-reduced-motion: reduce) { ${r}, ${r} .${bar}, ${r} .${logo} { transition: none; } ${r}--hide { transform: none !important; } }`
}

/* ── language and currency: one chip, one small panel ─────────────────── */

/**
 * "EN / EUR" as one quiet chip that opens a small panel with both lists
 * (never two rows of outlined buttons). Hidden by the page when the site has
 * one language and one currency. `p` is the class prefix, `id` a unique id
 * expression for the popover. The panel opens down by default; `up` for a
 * footer.
 */
export function localeChip(p: string, id: string, opts: { up?: boolean } = {}): string {
  return `<div class="${p}-loc${opts.up ? ` ${p}-loc--up` : ""}">
      <button class="${p}-loc__chip" type="button" popovertarget="${id}" aria-label="{{ settings.language_label }}, {{ settings.currency_label }}">${icon("globe", `${p}-loc__globe`, 16)}<span class="${p}-loc__now" data-storelib-locale-current="code"></span><span class="${p}-loc__sep" aria-hidden="true">/</span><span class="${p}-loc__now" data-storelib-currency-current="code"></span>${icon("chevron-down", `${p}-loc__caret`, 14)}</button>
      <div class="${p}-loc__panel" id="${id}" popover>
        <div class="${p}-loc__col" data-storelib-locale-list><p class="${p}-loc__h">{{ settings.language_label }}</p><button class="${p}-loc__opt" type="button" data-storelib-locale-option hidden><span data-option-label></span>${icon("check", `${p}-loc__tick`, 16)}</button></div>
        <div class="${p}-loc__col" data-storelib-currency-list><p class="${p}-loc__h">{{ settings.currency_label }}</p><button class="${p}-loc__opt" type="button" data-storelib-currency-option hidden><span data-option-label></span>${icon("check", `${p}-loc__tick`, 16)}</button></div>
      </div>
    </div>`
}

/** The chip's look: quiet text with a hairline on hover, a small two column panel. */
export function localeChipCss(p: string): string {
  const has = `:has([data-storelib-locale-list]:not([hidden]) [data-storelib-locale-option]:not([hidden]), [data-storelib-currency-list]:not([hidden]) [data-storelib-currency-option]:not([hidden]))`
  return `
.${p}-loc { position: relative; display: inline-flex; }
.${p}-loc:not(${has}) { display: none; }
.${p}-loc__chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 10px; border: 1px solid transparent; border-radius: 999px; background: none; color: inherit; font: inherit; font-size: 0.8125rem; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; white-space: nowrap; cursor: pointer; transition: border-color 160ms ease, background-color 160ms ease; }
.${p}-loc__chip:hover, .${p}-loc__chip:focus-visible, .${p}-loc:has(:popover-open) .${p}-loc__chip { border-color: color-mix(in srgb, currentColor 28%, transparent); }
.${p}-loc__now:empty { display: none; }
.${p}-loc__now:empty + .${p}-loc__sep, .${p}-loc__sep:has(+ .${p}-loc__now:empty) { display: none; }
.${p}-loc__sep { opacity: 0.45; }
.${p}-loc__caret svg { transition: transform 200ms ease; }
.${p}-loc:has(:popover-open) .${p}-loc__caret svg { transform: rotate(180deg); }
.${p}-loc__globe, .${p}-loc__caret, .${p}-loc__tick { display: inline-flex; }
.${p}-loc__panel { position: fixed; inset: auto; margin: 0; padding: 14px; width: min(340px, calc(100vw - 24px)); border: 1px solid var(--s-border); border-radius: 14px; background: var(--s-bg); color: var(--s-text); box-shadow: 0 24px 48px -24px rgb(0 0 0 / 0.35); }
.${p}-loc__panel:popover-open { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 4px 14px; }
@supports (position-area: bottom) {
  .${p}-loc__panel { position-area: bottom span-left; margin-top: 6px; }
  .${p}-loc--up .${p}-loc__panel { position-area: top span-right; margin: 0 0 6px; }
}
@supports not (position-area: bottom) { .${p}-loc__panel { top: 72px; right: 12px; } .${p}-loc--up .${p}-loc__panel { top: auto; bottom: 64px; right: auto; left: 12px; } }
.${p}-loc__col { display: grid; align-content: start; gap: 2px; }
.${p}-loc__col[hidden] { display: none; }
.${p}-loc__h { margin: 0 0 4px; padding: 0 10px; font-size: 0.8125rem; opacity: 0.6; }
.${p}-loc__opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; font-size: 0.9375rem; text-align: left; cursor: pointer; }
.${p}-loc__opt:hover, .${p}-loc__opt:focus-visible { background: color-mix(in srgb, currentColor 8%, transparent); }
.${p}-loc__opt[hidden] { display: none; }
.${p}-loc__tick { visibility: hidden; color: var(--s-accent); }
.${p}-loc__opt[aria-current="true"] { font-weight: 600; }
.${p}-loc__opt[aria-current="true"] .${p}-loc__tick { visibility: visible; }
@media (prefers-reduced-motion: no-preference) {
  .${p}-loc__panel { transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.7, 0.1, 1), display 220ms allow-discrete, overlay 220ms allow-discrete; }
  .${p}-loc__panel:popover-open { opacity: 1; transform: none; }
  @starting-style { .${p}-loc__panel:popover-open { opacity: 0; transform: translateY(-6px); } }
}`
}

/* ── icon buttons ─────────────────────────────────────────────────────── */

/** Round icon buttons with a press, and a count badge on the bag. */
export function iconButtonCss(p: string): string {
  return `
.${p}-ib { position: relative; display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 999px; background: none; color: inherit; font: inherit; text-decoration: none; cursor: pointer; transition: background-color 160ms ease, transform 160ms ease; }
.${p}-ib > [data-storelib-icon] { display: inline-flex; }
.${p}-ib:hover { background: color-mix(in srgb, currentColor 9%, transparent); }
.${p}-ib:active { transform: scale(0.92); }
.${p}-badge { position: absolute; top: 4px; right: 1px; display: inline-grid; place-items: center; min-width: 17px; height: 17px; padding: 0 4px; box-shadow: 0 0 0 2px var(--s-bg); border-radius: 999px; background: var(--s-btn, var(--s-accent)); color: var(--s-btn-text, var(--s-bg)); font-size: 0.6875rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none; }
.${p}-badge:empty, .${p}-badge[data-count="0"] { display: none; }
@media (prefers-reduced-motion: no-preference) { .${p}-badge:not(:empty) { animation: ib-pop 320ms cubic-bezier(0.3, 1.6, 0.5, 1); } }
@keyframes ib-pop { from { transform: scale(0.4); } }
@media (prefers-reduced-motion: reduce) { .${p}-ib { transition: none; } .${p}-ib:active { transform: none; } }`
}

/* ── form fields ──────────────────────────────────────────────────────── */

/**
 * A field: a visible label, a placeholder that shows the shape of an answer,
 * a clear focus ring, and an error that appears only after the visitor has
 * tried (:user-invalid), announced through the hint it is described by.
 * `p` is the prefix: .<p>-field, .<p>-field__label, __input, __hint, __error.
 */
export function fieldCss(p: string): string {
  return `
.${p}-field { display: grid; gap: 6px; min-width: 0; }
.${p}-field__label { font-size: 0.875rem; font-weight: 500; }
.${p}-field__input { width: 100%; min-width: 0; min-height: 52px; padding: 0 16px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: var(--theme-input-radius, 10px); background: color-mix(in srgb, var(--s-bg) 92%, currentColor); color: inherit; font: inherit; transition: border-color 160ms ease, box-shadow 160ms ease; }
.${p}-field__input::placeholder { color: inherit; opacity: 0.5; }
.${p}-field__input:hover { border-color: color-mix(in srgb, currentColor 55%, transparent); }
.${p}-field__input:focus-visible { outline: none; border-color: var(--s-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--s-accent) 30%, transparent); }
.${p}-field__input:user-invalid { border-color: var(--s-error, #c93b2e); }
.${p}-field__error { display: none; margin: 0; font-size: 0.8125rem; color: var(--s-error, #c93b2e); }
.${p}-field:has(.${p}-field__input:user-invalid) .${p}-field__error { display: block; }
.${p}-field__hint { margin: 0; font-size: 0.8125rem; opacity: 0.7; }`
}

/**
 * A one line email sign up with the label, a placeholder, the inline error
 * and the success line the host shows in place of the form
 * (data-storelib-success, components/website-builder/sections/StorelibSection.tsx).
 * Uses .<p>-news*, and the field classes above.
 */
export function newsletterForm(p: string, w: { label: string; placeholder: string; button: string; error: string; thanks: string }): string {
  return `<form class="${p}-news" data-storelib-form="subscribe">
        <div class="${p}-field">
          <label class="${p}-field__label" for="${p}-email-{{ section.id }}">${w.label}</label>
          <div class="${p}-news__row">
            <input class="${p}-field__input" id="${p}-email-{{ section.id }}" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="${w.placeholder}" aria-describedby="${p}-email-err-{{ section.id }}">
            <button class="${p}-news__go" type="submit"><span>${w.button}</span>${icon("arrow-right", `${p}-news__arrow`, 18)}</button>
          </div>
          <p class="${p}-field__error" id="${p}-email-err-{{ section.id }}">${w.error}</p>
        </div>
        <p class="${p}-news__done" data-storelib-success hidden role="status">${icon("check", `${p}-news__tick`, 18)}<span>${w.thanks}</span></p>
      </form>`
}

export function newsletterCss(p: string): string {
  return `${fieldCss(p)}
.${p}-news { display: grid; gap: 10px; max-width: 520px; }
.${p}-news__row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.${p}-news__go { display: inline-flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 20px; border: 0; border-radius: var(--theme-button-radius, 10px); background: var(--s-btn); color: var(--s-btn-text); font: inherit; font-weight: 600; cursor: pointer; transition: transform 160ms ease, background-color 160ms ease; }
.${p}-news__go:hover { background: var(--s-btn-hover, var(--s-btn)); color: var(--s-btn-hover-text, var(--s-btn-text)); }
.${p}-news__go:active { transform: scale(0.97); }
.${p}-news__arrow { display: inline-flex; transition: transform 200ms ease; }
.${p}-news__go:hover .${p}-news__arrow { transform: translateX(3px); }
.${p}-news[data-state="sending"] .${p}-news__go { opacity: 0.6; cursor: progress; }
.${p}-news__done { display: flex; align-items: center; gap: 10px; margin: 0; min-height: 52px; padding: 0 16px; border-radius: var(--theme-input-radius, 10px); background: color-mix(in srgb, var(--s-accent) 16%, transparent); font-weight: 500; }
.${p}-news__done[hidden] { display: none; }
.${p}-news__tick { display: inline-flex; color: var(--s-accent); }
@media (prefers-reduced-motion: reduce) { .${p}-news__go, .${p}-news__arrow { transition: none; } }`
}

/* ── footer bits ──────────────────────────────────────────────────────── */

/** Card marks for a store that sells: plain neutral badges, not brand artwork. */
export function paymentMarks(p: string): string {
  const mark = (label: string, inner: string) => `<li class="${p}-pay__mark" title="${label}"><svg viewBox="0 0 38 24" width="38" height="24" aria-hidden="true" focusable="false"><rect x=".5" y=".5" width="37" height="23" rx="4" fill="none" stroke="currentColor" stroke-opacity=".35"/>${inner}</svg><span class="${p}-sr">${label}</span></li>`
  return `<ul class="${p}-pay" aria-label="{{ settings.payments_label }}">
        ${mark("Visa", '<text x="19" y="15.5" text-anchor="middle" font-size="8.5" font-weight="700" font-style="italic" font-family="Arial, sans-serif" fill="currentColor">VISA</text>')}
        ${mark("Mastercard", '<circle cx="15.5" cy="12" r="5.5" fill="currentColor" fill-opacity=".55"/><circle cx="22.5" cy="12" r="5.5" fill="currentColor" fill-opacity=".85"/>')}
        ${mark("American Express", '<text x="19" y="15" text-anchor="middle" font-size="7" font-weight="700" font-family="Arial, sans-serif" fill="currentColor">AMEX</text>')}
        ${mark("Apple Pay", '<text x="19" y="15" text-anchor="middle" font-size="7.5" font-weight="600" font-family="Arial, sans-serif" fill="currentColor">Pay</text>')}
        ${mark("Google Pay", '<text x="19" y="15" text-anchor="middle" font-size="7.5" font-weight="600" font-family="Arial, sans-serif" fill="currentColor">G Pay</text>')}
      </ul>`
}

export function footerBitsCss(p: string): string {
  return `
.${p}-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.${p}-pay { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; opacity: 0.8; }
.${p}-pay__mark { display: inline-flex; }
.${p}-social { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.${p}-social a { display: inline-grid; place-items: center; width: 44px; height: 44px; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 999px; color: inherit; transition: background-color 180ms ease, color 180ms ease, transform 180ms ease; }
.${p}-social a > [data-storelib-icon] { display: inline-flex; }
.${p}-social a:hover { background: var(--s-text); color: var(--s-bg); transform: translateY(-2px); }
.${p}-top { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px; color: inherit; text-decoration: none; }
.${p}-top > [data-storelib-icon] { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 999px; transition: transform 220ms ease; }
.${p}-top:hover > [data-storelib-icon] { transform: translateY(-3px); }
.${p}-run { overflow: hidden; container-type: inline-size; }
.${p}-run__track { display: flex; width: max-content; }
.${p}-run__word { margin: 0; padding-right: 0.25em; white-space: nowrap; }
@media (prefers-reduced-motion: no-preference) {
  .${p}-run__track { animation: ft-run calc(var(--ft-speed, 28) * 1s) linear infinite; }
  .${p}-run:hover .${p}-run__track { animation-play-state: paused; }
}
@keyframes ft-run { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .${p}-social a, .${p}-top > [data-storelib-icon] { transition: none; } }`
}

/**
 * A form of a section's own, made to behave: a placeholder that reads as a
 * hint, a clear focus ring, a red edge and the message only after the
 * visitor has tried (:user-invalid), and the success line the host reveals
 * (data-storelib-success). `root` is the form's or the section's class.
 */
export function formPolishCss(root: string): string {
  return `
.${root} input::placeholder, .${root} textarea::placeholder { color: inherit; opacity: 0.5; }
.${root} input:not([type="checkbox"]):not([type="radio"]), .${root} textarea, .${root} select { transition: border-color 160ms ease, box-shadow 160ms ease; }
.${root} input:focus-visible, .${root} textarea:focus-visible, .${root} select:focus-visible { outline: 2px solid var(--s-accent); outline-offset: 2px; }
.${root} input:user-invalid, .${root} textarea:user-invalid { border-color: var(--s-error, #c93b2e); }
.${root} [data-field-error] { display: none; margin: 6px 0 0; font-size: 0.8125rem; color: var(--s-error, #c93b2e); }
.${root} form:has(input:user-invalid) [data-field-error], .${root}:has(input:user-invalid) > [data-field-error] { display: block; }
.${root} [data-storelib-success] { display: flex; align-items: center; gap: 10px; margin: 0; min-height: 48px; font-weight: 500; }
.${root} [data-storelib-success][hidden] { display: none; }
.${root} [data-storelib-success] [data-storelib-icon] { display: inline-flex; color: var(--s-accent); }
.${root} form[data-state="sending"] button[type="submit"] { opacity: 0.6; cursor: progress; }
.${root} button[type="submit"] { transition: transform 160ms ease; }
.${root} button[type="submit"]:active { transform: scale(0.97); }`
}

/** The success line and the error message for an email form of a section's own (settings thanks_text, email_error). */
export function formStates(errorId: string): string {
  return `<p data-field-error id="${errorId}">{{ settings.email_error }}</p><p data-storelib-success hidden role="status">${icon("check", "", 18)}<span>{{ settings.thanks_text }}</span></p>`
}
