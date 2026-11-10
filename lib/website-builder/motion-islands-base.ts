/**
 * The motion islands' names and structural CSS (round P, P3), apart from the
 * full contract in ./motion-islands.ts so the published page's main bundle
 * (StorelibSection, the section sandbox) carries a few constants and one
 * stylesheet, not the islands' descriptions and param tables. The runtime
 * that reads params is loaded only on a page that has an island.
 */

/** The attribute that asks for an island. */
export const MOTION_ATTR = "data-storelib-motion"
/** Its params: `data-motion-<name>`. (`data-motion` alone is O5's per-section "site" / "off" switch.) */
export const MOTION_PARAM_PREFIX = "data-motion-"
/**
 * Every element the runtime adds to a section (a canvas, a marquee's copy,
 * a cursor follower) carries this, so the section sandbox's numbering skips
 * it (components/website-builder/sections/section-sandbox.tsx) and the page
 * numbers the same elements the guest does.
 */
export const MOTION_NODE_ATTR = "data-storelib-motion-node"
/** Set by the runtime on an island once it is running, for a section's own CSS: `[data-motion-ready]`. */
export const MOTION_READY_ATTR = "data-motion-ready"
/** Set on a scroll-linked island: how far through it the visitor is, 0 to 1, as `--motion-progress`. */
export const MOTION_PROGRESS_VAR = "--motion-progress"

/* ── the structural CSS every island needs ────────────────────────────── */

const LENGTHS = Array.from({ length: 11 }, (_, i) => 1 + i * 0.5)

/**
 * The CSS the islands' layout needs, printed by the page with a section that
 * has one (components/website-builder/sections/StorelibSection.tsx), on the
 * server as on the canvas, so a pinned or scrubbed island has its full
 * height from the first paint and nothing below it moves when the runtime
 * arrives. Everything that moves is inside prefers-reduced-motion:
 * no-preference; the still state is the default.
 */
export function motionBaseCss(): string {
  const S = '[data-storelib-motion="scroll-scrub"]'
  const P = '[data-storelib-motion="pin-horizontal"]'
  /* O5's per-section switch: data-motion="off" on the island or around it keeps it still. */
  const on = ':not([data-motion="off"]):not([data-motion="off"] *)'
  const lens = LENGTHS.map((l) => `${S}[data-motion-length="${l}"]{--motion-len:${l}}`).join("")
  return [
    `[${MOTION_NODE_ATTR}]{pointer-events:none}`,
    /* scroll-scrub: frames stacked, the first (or the still one the runtime marks) shown. */
    `${S} [data-motion-stage]{position:relative;overflow:hidden}`,
    `${S} [data-motion-frame],${S} [data-motion-video]{display:block;width:100%;height:100%;object-fit:cover}`,
    `${S} [data-motion-frame]~[data-motion-frame]{position:absolute;inset:0;opacity:0}`,
    `${S} [data-motion-stage]:has([data-motion-active]) [data-motion-frame]{opacity:0}`,
    `${S} [data-motion-stage] [data-motion-frame][data-motion-active]{opacity:1}`,
    `@media (prefers-reduced-motion:no-preference) and (update:fast){`,
    lens,
    `${S}${on}{height:calc(var(--motion-len,3) * 100svh);position:relative}`,
    `${S}${on} [data-motion-stage]{position:sticky;top:0;height:100svh}`,
    `${S}${on} [data-motion-frame]{position:absolute;inset:0}`,
    /* pin-horizontal: the stage sticks once the runtime has set the island's height to the track's run. */
    `${P}[${MOTION_READY_ATTR}] [data-motion-stage]{position:sticky;top:0;height:100svh;overflow:hidden;display:flex;align-items:center}`,
    `${P}[${MOTION_READY_ATTR}] [data-motion-track]{flex-wrap:nowrap;overflow:visible}`,
    /* reveal-stagger hides an item only once the runtime has seen it is below the fold. */
    `[data-motion-pending]{opacity:0}`,
    `}`,
    `@media (prefers-reduced-motion:no-preference) and (update:fast) and (max-width:600px){`,
    `${S}${on}{height:calc(var(--motion-len,3) * 70svh)}`,
    `${S}[data-motion-mobile="still"]{height:auto}${S}[data-motion-mobile="still"] [data-motion-stage]{position:relative;height:auto}`,
    `}`,
    /* The still and phone states of the sideways run: a native swipe with snap points. */
    `${P}:not([${MOTION_READY_ATTR}]) [data-motion-track]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain}`,
    `${P}:not([${MOTION_READY_ATTR}]) [data-motion-track]>*{scroll-snap-align:start;flex:none}`,
    `@media (max-width:600px){${P}[data-motion-mobile="stack"]:not([${MOTION_READY_ATTR}]) [data-motion-track]{flex-direction:column;overflow:visible}}`,
    /* image-trail: on a mouse the pictures are the trail's, waiting out of sight from the first paint (nothing moves when the runtime arrives); on touch and with reduced motion they are the section's own row. */
    `@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference){[data-storelib-motion="image-trail"]${on}{position:relative}[data-storelib-motion="image-trail"]${on} [data-motion-images]{position:absolute;inset:0;margin:0;padding:0;list-style:none;pointer-events:none;z-index:2}[data-storelib-motion="image-trail"]${on} [data-motion-images] img{position:absolute;left:0;top:0;margin:0;opacity:0;object-fit:cover}}`,
  ].join("\n")
}

