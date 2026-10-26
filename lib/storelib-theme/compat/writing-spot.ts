/**
 * ===========================================================================
 *  THE SECTION STORELIB AI IS WRITING, IN AN IMPORTED THEME'S CANVAS
 * ===========================================================================
 * The owner, round 18: as soon as the prompt is sent, "smoothly close the
 * modal, take me to the section that's coding, and show the animation states
 * with the coding fades", on every kind of theme. A Storelib theme's canvas
 * draws the spot with React (components/website-builder/editor/
 * writing-section.tsx). An imported theme's canvas is a frame drawn from
 * markup, and the spot's type is no section of the theme's: it drew nothing,
 * so there was nothing to be taken to.
 *
 * So it is drawn here as markup with its own styles: the same card in the
 * page's own colours (currentColor over the theme's background), a lane of
 * code whose lines come in one after another and fade toward the top, a
 * caret, and a slow band of light. CSS only, opacity and transform, so it
 * runs on the compositor and costs the frame nothing while the page is
 * scrolled; still under reduced motion. Under the section id the editor
 * glides to (canvas-bridge.ts revealSection).
 */
import { escapeHtml } from "./filters"

/** lib/website-builder/ai-placement.ts WRITING_SECTION_TYPE: the editor's placeholder, never saved. */
export const WRITING_SPOT_TYPE = "__storelib_writing__"

const LINES = [
  `<template>`,
  `<section class="s" data-scheme="{{ settings.color_scheme }}">`,
  `  <div class="s__in">`,
  `    <h2 class="s__h">{{ settings.heading }}</h2>`,
  `    {% for block in blocks %}`,
  `      <div class="s__item" data-block-id="{{ block.id }}">`,
  `        <h3>{{ block.settings.title }}</h3>`,
  `        <p>{{ block.settings.text }}</p>`,
  `      </div>`,
  `    {% endfor %}`,
  `  </div>`,
  `</section>`,
  `</template>`,
  ``,
  `<style scoped>`,
  `.s { container-type: inline-size; background: var(--scheme-bg); }`,
  `.s__in { max-width: 1080px; margin: 0 auto; padding: 72px 24px; }`,
  `.s__h { font-size: clamp(28px, 5cqi, 44px); }`,
  `</style>`,
]
/** Each line's turn, and the whole lane's loop. */
const STEP_MS = 420
const LOOP_MS = LINES.length * STEP_MS + 2400
/* The lane moves up a line at each step until every line is in, then rests: the first line is at the foot from the first frame. */
const ROLLED = Math.round(((LINES.length - 1) * STEP_MS / LOOP_MS) * 1000) / 10

const CSS = `
.slw{position:relative;isolation:isolate;margin:12px;border-radius:16px;overflow:hidden;color:inherit;background:color-mix(in srgb,currentColor 3%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 9%,transparent);animation:slw-open 420ms cubic-bezier(.32,.72,0,1) backwards}
.slw__in{position:relative;max-width:1080px;margin:0 auto;padding:clamp(24px,5vw,48px) clamp(20px,5vw,48px)}
.slw__lane{position:relative;height:calc(12 * 1.75em);overflow:hidden;contain:strict;font:12.5px/1.75 ui-monospace,"SF Mono",Menlo,Consolas,monospace;-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 62%);mask-image:linear-gradient(to bottom,transparent 0%,#000 62%)}
.slw__roll{position:absolute;left:0;right:0;bottom:0;animation:slw-roll ${LOOP_MS}ms infinite}
.slw__line{white-space:pre;overflow:hidden;opacity:.5;animation:slw-line ${LOOP_MS}ms ease-out infinite backwards}
.slw__caret{display:inline-block;width:.55em;height:1.15em;margin-left:1px;vertical-align:-.2em;border-radius:1px;background:currentColor;opacity:.45;animation:slw-caret 1100ms ease-in-out infinite}
.slw__in::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 20%,color-mix(in srgb,currentColor 5%,transparent) 50%,transparent 80%);transform:translateX(-100%);animation:slw-sweep 5.2s cubic-bezier(.37,0,.63,1) infinite}
@keyframes slw-open{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
@keyframes slw-roll{0%{transform:translateY(${(LINES.length - 1) * 1.75}em);animation-timing-function:steps(${LINES.length - 1},end)}${ROLLED}%,100%{transform:translateY(0)}}
@keyframes slw-line{0%{opacity:0;transform:translateX(-4px)}6%{opacity:.5;transform:none}100%{opacity:.5}}
@keyframes slw-caret{0%,100%{opacity:.45}50%{opacity:.08}}
@keyframes slw-sweep{0%{transform:translateX(-100%)}70%,100%{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.slw,.slw__roll,.slw__line,.slw__caret,.slw__in::after{animation:none}.slw__in::after{display:none}.slw__roll{transform:none}}
`

/** The spot, as a section of the page: its wrapper under the given id, so the editor can select it and glide to it. */
export function writingSpotHtml(id: string, prompt: string): string {
  const lines = LINES.map((l, i) => `<div class="slw__line" style="animation-delay:${i * STEP_MS}ms">${escapeHtml(l) || "&nbsp;"}${i === LINES.length - 1 ? `<span class="slw__caret"></span>` : ""}</div>`).join("")
  const said = prompt ? `Writing a section: ${prompt}` : "Writing a section"
  return `<div id="shopify-section-${escapeHtml(id)}" class="shopify-section" data-section-id="${escapeHtml(id)}" data-section-type="${WRITING_SPOT_TYPE}" data-writing-section=""><style>${CSS}</style><div class="slw"><p role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${escapeHtml(said)}</p><div class="slw__in" aria-hidden="true"><div class="slw__lane"><div class="slw__roll">${lines}</div></div></div></div></div>`
}
