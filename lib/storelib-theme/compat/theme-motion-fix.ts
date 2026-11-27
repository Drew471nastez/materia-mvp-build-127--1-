/**
 * ===========================================================================
 *  ROUND 67'S THEME FIXES, FOR THE THEMES STORES ALREADY HAVE
 * ===========================================================================
 * A website keeps the theme files it was installed with, so round 67's fixes
 * to theme-packages/materia reach a store only on a theme release. This is
 * written into the head of every page an installed theme draws (theme.ts
 * renderDocument), live and on the builder's canvas, as ./shop-calm.ts is.
 * Each part is a no-op on the new theme files, so nothing happens twice.
 *
 *  1. THE HEADER'S MENU IS NEVER HELD UNSEEN. Old header-menu-fit put
 *     data-hs-wait on the desktop menu (opacity 0 until its web font had
 *     loaded, up to 1.5s, then a fade): on every landing, reload and page
 *     change the links vanished and came back. The attribute is overruled
 *     here; the fit itself still runs and still folds what does not fit
 *     into More, and fits again when the font arrives. New files never set
 *     the attribute.
 *
 *  2. THE VERIFIED BADGE'S CHECK STANDS OUT FROM ITS FILL. Old
 *     guarantee-icon drew a white check on a badge filled with the icon
 *     colour: white on white on a light icon colour. The check takes black
 *     or white by the fill's lightness. New files carry the same rule inline;
 *     a browser without relative colours keeps the white check.
 *
 *  3. A POPUP FADES TO ITS OWN OPACITY. Old materia-popups.js faded a
 *     popup's shade to opacity 1 when its section draws it at about 0.5: the
 *     shade went near black and jumped back lighter as the motion ended (and
 *     the other way on close). Only an opacity 0 to 1 (or 1 to 0) animation
 *     started on an element inside a popup that is moving ([data-mp-motion],
 *     set by materia-popups.js just before) is changed, and only when the
 *     element rests between 0.05 and 1: it then fades to (or from) that.
 *     New files already pass the resting opacity, which this leaves as is.
 *
 * ROUND 68 (scripts/check-overlay-flash-r68.ts, scripts/check-reveal-r68.ts)
 *
 *  4. ONE POPUP AFTER ANOTHER, NO LIGHT FRAMES BETWEEN. Old materia-popups.js
 *     (version 1) cut the shown popup away at once when another was picked
 *     in the builder's overlay group, and the next one's shade faded in from
 *     nothing: dark, light, dark. Picking another one now closes the shown
 *     one with its own motion first, and a shade that fades in while another
 *     popup is closing starts as dark as that one is drawn while that one's
 *     dark goes (its colour and its ::before/::after). New files (version 2)
 *     hand the shade over themselves; this stands aside for them.
 *
 *  5. REVEALS ON A FINE LINE. Old animation.css slid cards in from 56px to
 *     the side, zoomed, blurred and clipped them over up to 1.7s, moved whole
 *     sections (their colour arriving late over a band of the page) and the
 *     footer. Old files now play the round 68 reveal: a card rises 10px in
 *     300 to 450ms, 40ms at most after the one before; a section's box and
 *     the footer never move; a section's parts rise 12px at most. New files
 *     (data-mt-reveal="2" on <html>, set by animation.js) are left to their
 *     own, identical rules.
 *
 * ROUND 69 (scripts/check-faq-band-r69.ts)
 *
 *  7. FAQ 1, 2 AND 3 ARE NEVER A WHITE BAND. Their own reveal (Reveal on
 *     scroll, on by default) faded the section's root, which carries its
 *     colour, from opacity 0 in the first screen too, until 12% of it was on
 *     screen and for 0.8s after: the page's background showed where the
 *     section is, up to 635px tall. The root is always drawn now; new files
 *     reveal what is inside it, armed only below the first screen
 *     (data-faq-armed), and the theme's own reveal plays on old files.
 *     XP shop's windows faded in on load in the first screen too: only one
 *     below it waits now (data-xp-armed), 12px in 450ms.
 *
 *  6. A SHADE FOLLOWS ITS PANEL. A phone's full-width menu darkened the page
 *     before its panel covered it (and stayed dark as it left): the backdrop
 *     now eases the other way round from the panel. Promotion popup (Code)'s
 *     ::backdrop fades in and out with its card instead of appearing at full.
 */

const MOTION_FIX_CSS = [
  ".header__menu .horizontal-list[data-hs-wait]{opacity:1!important;animation:none!important}",
  "@supports (color: oklch(from red l c h)){svg:has(>path[fill='currentColor'][d^='M3.85 8.62'])>path[d='m9 12 2 2 4-4']{stroke:oklch(from currentColor clamp(0, (0.7 - l) * 1000, 1) 0 0)}}",
].join("")

/** Runs in the page, in the head, before the theme's scripts. */
function installPopupRestOpacity(win: Window & typeof globalThis): void {
  const proto = win.Element && win.Element.prototype
  if (!proto || typeof proto.animate !== "function" || (proto.animate as { __slRest?: boolean }).__slRest) return
  const animate = proto.animate
  const bare = (k: unknown, v: number) => !!k && typeof k === "object" && Object.keys(k as object).length === 1 && (k as { opacity?: unknown }).opacity === v
  const patched = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    try {
      if (Array.isArray(keyframes) && keyframes.length === 2 && this.closest && this.closest("[data-mp-motion]")) {
        const inward = bare(keyframes[0], 0) && bare(keyframes[1], 1)
        const outward = bare(keyframes[0], 1) && bare(keyframes[1], 0)
        if (inward || outward) {
          const rest = parseFloat(win.getComputedStyle(this).opacity)
          if (rest > 0.05 && rest < 0.999) keyframes = inward ? [{ opacity: 0 }, { opacity: rest }] : [{ opacity: rest }, { opacity: 0 }]
        }
      }
    } catch {
      /* the theme's own call, as it was */
    }
    return animate.call(this, keyframes, options)
  }
  ;(patched as { __slRest?: boolean }).__slRest = true
  proto.animate = patched as typeof proto.animate
}

/** Runs in the page, in the head, after installPopupRestOpacity (it wraps that). */
function installPopupHandoff(win: Window & typeof globalThis): void {
  const doc = win.document
  const w = win as unknown as { __slHandoff?: boolean; MateriaPopups?: { version?: number; design?: boolean; current(): string | null; close(id?: string): void } }
  if (!doc || w.__slHandoff || !win.Element || typeof win.Element.prototype.animate !== "function") return
  w.__slHandoff = true
  const old = () => !!w.MateriaPopups && !((w.MateriaPopups.version ?? 1) >= 2)
  /* The builder: picking another popup closes the shown one with its own motion first, never a cut. */
  const pick = (e: Event) => {
    try {
      const P = w.MateriaPopups
      if (!P || !old() || !P.design) return
      const d = (e as CustomEvent<{ sectionId?: unknown }>).detail
      const id = d && d.sectionId != null ? String(d.sectionId) : ""
      const cur = P.current()
      if (!cur || !id || cur === id || !doc.querySelector('[data-popup-id="' + win.CSS.escape(id) + '"]')) return
      P.close(cur)
    } catch {
      /* the theme's own handler, as it was */
    }
  }
  doc.addEventListener("shopify:section:select", pick, true)
  doc.addEventListener("shopify:block:select", pick, true)
  const alphaIn = (c: string) => {
    const m = String(c || "").match(/rgba?\(([^)]+)\)/)
    if (!m) return 0
    const n = m[1].split(/[\s,/]+/).filter(Boolean)
    const a = n.length > 3 ? parseFloat(n[3]) * (/%$/.test(n[3]) ? 0.01 : 1) : 1
    return isFinite(a) ? Math.max(0, Math.min(1, a)) : 0
  }
  /* How dark an element draws over the whole screen: its colour, and a ::before/::after it draws its dark with. */
  const darkOf = (el: Element) => {
    let clear = 1 - alphaIn(win.getComputedStyle(el).backgroundColor)
    for (const pe of ["::before", "::after"]) {
      const cs = win.getComputedStyle(el, pe)
      if (!cs || cs.content === "none" || cs.content === "normal" || cs.display === "none") continue
      if (!(parseFloat(cs.width) >= win.innerWidth * 0.9)) continue
      clear *= 1 - alphaIn(cs.backgroundColor) * (parseFloat(cs.opacity) || 0)
    }
    return 1 - clear
  }
  const full = (el: Element) => {
    if (win.getComputedStyle(el).position !== "fixed") return false
    const r = el.getBoundingClientRect()
    return r.width >= win.innerWidth * 0.9 && r.height >= win.innerHeight * 0.85
  }
  const drawn = (el: Element) => {
    let o = 1
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(win.getComputedStyle(e).opacity) || 0
    return o
  }
  const proto = win.Element.prototype
  const animate = proto.animate
  const patched = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    try {
      const k = keyframes as Keyframe[]
      if (old() && Array.isArray(k) && k.length === 2 && k[0] && Object.keys(k[0]).length === 1 && Number(k[0].opacity) === 0 && this.closest && this.closest('[data-mp-motion="in"]') && full(this)) {
        const mine = darkOf(this)
        let carry = 0
        const gone: Element[] = []
        for (const root of doc.querySelectorAll('[data-mp-motion="out"]')) {
          for (const el of [root, ...root.querySelectorAll("*")]) {
            if (!full(el)) continue
            const l = drawn(el) * darkOf(el)
            if (l > 0.01) { carry = 1 - (1 - carry) * (1 - l); gone.push(el) }
          }
        }
        if (carry > 0 && mine > 0) {
          const rest = parseFloat(win.getComputedStyle(this).opacity)
          const to = rest > 0.05 && rest < 0.999 ? rest : Number(k[1].opacity) || 1
          keyframes = [{ opacity: Math.min(to, carry / mine) }, { opacity: to }]
          for (const el of gone) el.setAttribute("data-sl-noshade", "")
          win.setTimeout(() => { for (const el of gone) el.removeAttribute("data-sl-noshade") }, 700)
        }
      }
    } catch {
      /* the theme's own call, as it was */
    }
    return animate.call(this, keyframes, options)
  }
  proto.animate = patched as typeof proto.animate
}

/* Round 68's reveal for old animation.css / animation.js / global.js (5 above). Names start with "reveal": old animation.js ends a reveal on its own animationend by that. */
const OLD = 'html:not([data-mt-reveal="2"])'
const REVEAL_FIX_CSS = [
  "@keyframes revealCardR68{from{opacity:var(--reveal-from-opacity,.2);transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}",
  "@keyframes revealPartR68{from{opacity:var(--reveal-from-opacity,.2);transform:translate3d(0,12px,0)}to{opacity:1;transform:none}}",
  "@keyframes revealUnmaskR68{from{opacity:.6;clip-path:inset(4% 3% 4% 3%)}to{opacity:1;clip-path:inset(0)}}",
  "@keyframes revealSettleR68{from{transform:scale(1.04)}to{transform:none}}",
  "@keyframes revealWordR68{from{opacity:var(--reveal-from-opacity,.2);transform:translate3d(0,min(.25em,10px),0)}to{opacity:1;transform:none}}",
  `${OLD} .shopify-section.scroll-trigger:not(.reveal-parts),${OLD} [id*="footer"].scroll-trigger,${OLD} .scroll-trigger:has(>footer),${OLD} .scroll-trigger:has(>.footer){animation:none!important;opacity:1!important}`,
  `${OLD} [id*="footer"].scroll-trigger :is([data-reveal-part],[data-reveal-zoom],.mt-word){animation:none!important}`,
  `${OLD} motion-element{--animation-duration:450ms}`,
  `${OLD} .scroll-trigger:not(.shopify-section) [data-reveal-zoom]{animation:none!important}`,
  "@media (prefers-reduced-motion:no-preference){" +
    `${OLD} .scroll-trigger.scroll-trigger--armed:not(.shopify-section):not(.reveal-parts){animation-name:revealCardR68!important}` +
    `${OLD} .scroll-trigger.scroll-trigger--armed:not(.scroll-trigger--offscreen):not(.shopify-section):not(.reveal-parts){animation-duration:clamp(300ms,calc(var(--animation-duration,700ms)*.6),450ms)!important;animation-timing-function:cubic-bezier(.25,.6,.3,1)!important;animation-delay:calc(var(--animation-delay-base,0ms) + min(var(--reveal-order,0),4)*min(var(--reveal-stagger,75ms),40ms))!important}` +
    `${OLD} .scroll-trigger--armed.reveal-parts [data-reveal-part]:not([data-reveal-part="media"]){animation-name:revealPartR68!important}` +
    `${OLD} .scroll-trigger--armed.reveal-parts.editorial [data-reveal-part="media"]{animation-name:revealPartR68!important}` +
    `${OLD} .scroll-trigger--armed.reveal-parts.mask_reveal [data-reveal-part="media"]{animation-name:revealUnmaskR68!important}` +
    `${OLD} .scroll-trigger--armed:not(.scroll-trigger--offscreen).reveal-parts [data-reveal-part]{animation-duration:clamp(350ms,calc(var(--animation-duration,700ms)*.7),600ms)!important;animation-timing-function:cubic-bezier(.25,.6,.3,1)!important;animation-delay:calc(var(--animation-delay-base,0ms) + min(var(--part,0),6)*min(var(--reveal-stagger,75ms),60ms))!important}` +
    `${OLD} .scroll-trigger--armed [data-reveal-zoom],${OLD} .scroll-trigger--armed.reveal-parts.mask_reveal [data-reveal-part="media"] :is(img,video){animation-name:revealSettleR68!important}` +
    `${OLD} .scroll-trigger--armed:not(.scroll-trigger--offscreen) [data-reveal-zoom],${OLD} .scroll-trigger--armed:not(.scroll-trigger--offscreen).reveal-parts.mask_reveal [data-reveal-part="media"] :is(img,video){animation-duration:clamp(500ms,var(--animation-duration,700ms),800ms)!important}` +
    `${OLD} .scroll-trigger--armed.reveal-parts.split_text .mt-word{animation-name:revealWordR68!important}` +
    `${OLD} .scroll-trigger--armed:not(.scroll-trigger--offscreen).reveal-parts.split_text .mt-word{animation-duration:clamp(350ms,calc(var(--animation-duration,700ms)*.7),550ms)!important;animation-delay:calc(var(--animation-delay-base,0ms) + min(var(--part,0),6)*min(var(--reveal-stagger,75ms),60ms) + var(--word,0)*25ms)!important}` +
    "}",
  /* Promotion popup (Code): its ::backdrop fades in and out with the card (section-promotion-popup.css, round 68). */
  ":is(.s-promotion-popup,#_) .pp__dialog{transition:opacity .22s ease,transform .22s ease,overlay .22s allow-discrete,display .22s allow-discrete}",
  ":is(.s-promotion-popup,#_) .pp__dialog::backdrop{transition:opacity .25s ease,overlay .25s allow-discrete,display .25s allow-discrete}",
  "@starting-style{:is(.s-promotion-popup,#_) .pp__dialog[open]::backdrop{opacity:0}:is(.s-promotion-popup,#_) .pp__dialog[open][open]{opacity:0;transform:translateY(12px)}}",
  ":is(.s-promotion-popup,#_) .pp__dialog[open][open]{animation:none}",
  ":is(.s-promotion-popup,#_) .pp__dialog:not([open]){opacity:0;transform:translateY(12px)}:is(.s-promotion-popup,#_) .pp__dialog:not([open])::backdrop{opacity:0}",
  "@media (prefers-reduced-motion:reduce){:is(.s-promotion-popup,#_) .pp__dialog,:is(.s-promotion-popup,#_) .pp__dialog::backdrop{transition:none!important}}",
  /* A drawer's backdrop follows its panel (theme.css, round 68): clears fast as the panel leaves, darkens after it comes. */
  ".overlay.overlay::after{transition-timing-function:var(--mt-panel-ease-in,cubic-bezier(.22,1,.36,1))}",
  ":is(.open-drawer,.nav-open,.open-sidebar) .open.overlay.overlay::after{transition-timing-function:var(--mt-panel-ease-out,cubic-bezier(.4,0,.7,.2))}",
  "[data-sl-noshade]{background-color:transparent!important}[data-sl-noshade]::before,[data-sl-noshade]::after{visibility:hidden!important}",
].join("")

/* 7 above: an old FAQ 1, 2 or 3 root is never faded, moved or clipped (a new one never is, so this changes nothing there). XP shop's windows: an old file faded the one in the first screen in on load; only an armed one (new files, below the first screen) waits. */
const FAQ_FIX_CSS = "[data-faq-root][data-faq-reveal]{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}html.xp-js .xp [data-motion]:not([data-xp-armed]){opacity:1!important;transform:none!important}"

export const THEME_MOTION_FIX_HEAD = `<style data-sl-motion-fix>${MOTION_FIX_CSS}${REVEAL_FIX_CSS}</style><style data-sl-faq-fix>${FAQ_FIX_CSS}</style><script data-sl-popup-rest>try{(${installPopupRestOpacity.toString()})(window)}catch(e){}</script><script data-sl-popup-handoff>try{(${installPopupHandoff.toString()})(window)}catch(e){}</script>`
