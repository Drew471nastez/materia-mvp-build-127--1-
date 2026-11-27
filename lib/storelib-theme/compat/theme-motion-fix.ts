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

export const THEME_MOTION_FIX_HEAD = `<style data-sl-motion-fix>${MOTION_FIX_CSS}</style><script data-sl-popup-rest>try{(${installPopupRestOpacity.toString()})(window)}catch(e){}</script>`
