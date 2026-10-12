"use client"

/**
 * ===========================================================================
 *  THE SPOT A SECTION IS BEING WRITTEN INTO
 * ===========================================================================
 * Drawn in the canvas, where the section will land, for as long as Ask AI is
 * writing and compiling it. The finished section replaces it in place.
 *
 * NO WORDS. It used to say "Writing a section" over grey bones; it now shows
 * what writing a section looks like: lines of a section file arriving at
 * typing speed, the oldest fading out at the top as new ones come in at the
 * bottom, with the Ask AI ring running round the edge and a sweep of light
 * across. A screen reader still hears what is happening, from a status line
 * that is not drawn.
 *
 * IT IS A PICTURE OF THE WORK, NOT THE WORK. The server does not stream the
 * file while it writes it, so the code here is a section-shaped sample and
 * not the section being written. It never claims otherwise: it has no
 * filename, no progress figure and no line numbers.
 *
 * Typed by requestAnimationFrame straight into the DOM: a React render per
 * character would be two hundred renders a second on the canvas. Stopped,
 * and drawn still, under reduced motion. It never is a section of the page:
 * see lib/website-builder/ai-placement.ts.
 */
import { useEffect, useRef } from "react"
import { tt } from "@/lib/i18n/text"

/** A section file, in the Storelib Builder Framework, to be typed. */
const SAMPLE = `<template>
<section class="s" data-scheme="{{ settings.color_scheme }}">
  <div class="s__in">
    <h2 class="s__h">{{ settings.heading }}</h2>
    {% for block in blocks %}
      <details class="s__item" name="{{ section.id }}-q" data-block-id="{{ block.id }}">
        <summary>{{ block.settings.question }}</summary>
        <div class="s__a">{{ block.settings.answer | raw }}</div>
      </details>
    {% endfor %}
  </div>
</section>
</template>

<style scoped>
.s { container-type: inline-size; background: var(--scheme-bg); }
.s__in { max-width: 760px; margin: 0 auto; padding: 72px 24px; }
.s__h { font-size: clamp(28px, 5cqi, 44px); color: var(--scheme-heading); }
.s__item { border-bottom: 1px solid var(--scheme-border); }
.s__item summary { cursor: pointer; padding: 20px 0; font-weight: 600; }
@media (prefers-reduced-motion: no-preference) {
  .s__a { animation: open 240ms ease-out; }
}
</style>

<schema>
{
  "name": "Questions",
  "settings": [
    { "type": "text", "id": "heading", "default": "Questions" },
    { "type": "color_scheme", "id": "color_scheme", "default": "light" }
  ],
  "blocks": [{ "type": "question", "settings": [
    { "type": "text", "id": "question", "default": "How long does it take?" },
    { "type": "richtext", "id": "answer" }
  ] }],
  "presets": [{ "name": "Questions", "blocks": [{ "type": "question" }] }]
}
</schema>
`

/** Characters a second. Fast enough to read as written, not pasted. */
export const TYPING_RATE = 200

/** The lines shown at once; older ones fade out above them. */
const VISIBLE_LINES = 14

/**
 * One line as markup, coloured by what it is. The input is SAMPLE above and
 * nothing else, so no visitor or model text ever reaches this.
 */
function tint(line: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  /**
   * ONE PASS over the raw line. Three replaces in a row coloured the markup
   * the one before had inserted, and `class="wb-writing-tag"` was drawn in the
   * lane as code.
   */
  const token = /(\{\{[^}]*\}\}|\{%[^%]*%\})|(<\/?[a-z][a-z0-9-]*)|("[^"]*")/g
  let out = ""
  let last = 0
  for (let m = token.exec(line); m; m = token.exec(line)) {
    out += esc(line.slice(last, m.index))
    const kind = m[1] ? "wb-writing-liquid" : m[2] ? "wb-writing-tag" : "wb-writing-str"
    out += `<span class="${kind}">${esc(m[0])}</span>`
    last = m.index + m[0].length
  }
  return out + esc(line.slice(last))
}

export function WritingSection({ prompt }: { prompt: string }) {
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = codeRef.current
    if (!el) return
    const lines = SAMPLE.split("\n")
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

    /* Still, for anyone who asked for less motion: the opening lines, drawn once. */
    if (reduced) {
      el.innerHTML = lines.slice(0, VISIBLE_LINES).map((l) => `<div class="wb-writing-line">${tint(l) || "&nbsp;"}</div>`).join("")
      return
    }

    let raf = 0
    let start = 0
    /* Begun ten lines in, so the lane is full from the first frame rather
       than filling from an empty box. */
    const headStart = lines.slice(0, 10).join("\n").length + 1
    const draw = (now: number) => {
      if (!start) start = now - (headStart / TYPING_RATE) * 1000
      /* The whole file, over and over, for as long as the writing lasts. */
      const total = SAMPLE.length
      const typed = Math.floor(((now - start) / 1000) * TYPING_RATE) % (total + 1)
      const upto = SAMPLE.slice(0, typed)
      /* How far it has got, for scripts/check-writing-section.mjs to time. */
      el.dataset.typed = String(Math.floor(((now - start) / 1000) * TYPING_RATE))
      const written = upto.split("\n")
      const current = written.pop() ?? ""
      const shown = written.slice(-(VISIBLE_LINES - 1))
      el.innerHTML =
        shown.map((l) => `<div class="wb-writing-line">${tint(l) || "&nbsp;"}</div>`).join("") +
        `<div class="wb-writing-line">${tint(current)}<span class="wb-writing-caret"></span></div>`
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="wb-writing" data-writing-section="">
      {/* For a screen reader: what is happening, which the picture shows. */}
      <p className="sr-only" role="status" aria-live="polite">
        {tt("Writing a section")}{prompt ? `: ${prompt}` : ""}
      </p>
      <div className="wb-writing-inner" aria-hidden="true">
        <div ref={codeRef} className="wb-writing-code" />
      </div>
    </div>
  )
}
