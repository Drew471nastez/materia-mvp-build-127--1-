/**
 * The Add Section cards, rendered the way the modal renders them: one
 * provider holding this install's saved files, a preview box whose height is
 * a known ratio of the card, and the section scaled into it.
 *
 * Two things are being looked at. A section the creator wrote has to draw —
 * it only exists in their files, and the cards used to be given none. And a
 * section taller than the box has to be cropped by it rather than stretch
 * the card, because a grid of cards that are each as tall as their content
 * is a grid that resettles every time a preview arrives.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const CARD_WIDTH = 320
const RENDER_WIDTH = 800
const RATIO = 0.5
/** The card's 1px border each side, exactly as the modal accounts for it. */
const PREVIEW_WIDTH = CARD_WIDTH - 2
const HEIGHT = Math.round(PREVIEW_WIDTH * RATIO)

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/** A section somebody wrote themselves: it is in no build, only in their files. */
const MINE = `<template>
<section class="mine">
  <p class="mine__eyebrow">{{ section.settings.eyebrow }}</p>
  <h2 class="mine__h">{{ section.settings.heading }}</h2>
  {% for block in section.blocks %}
  <details class="mine__item"{% if forloop.first %} open{% endif %}>
    <summary class="mine__q">{{ block.settings.question }}</summary>
    <div class="mine__a">{{ block.settings.answer }}</div>
  </details>
  {% endfor %}
</section>
</template>

<style>
.mine { padding: 120px 32px; background: #10121a; color: #fff; }
.mine__h { font-size: 40px; margin: 0 0 24px; }
.mine__q { position: relative; padding: 28px 0; list-style: none; font-size: 24px; }
.mine__q::after { content: "+"; position: absolute; right: 0; }
.mine__item { border-bottom: 1px solid rgba(255,255,255,.2); }
@media (max-width: 749px) { .mine { padding: 32px 16px; } }
</style>

<schema>
{
  "type": "drewwww",
  "name": "Drewwww",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "FAQ" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Questions, answered." }
  ],
  "blocks": [{ "type": "item", "name": "Question", "settings": [
    { "type": "text", "id": "question", "label": "Q", "default": "What is Storelib?" },
    { "type": "textarea", "id": "answer", "label": "A", "default": "A website builder that you own." }
  ] }],
  "presets": [{ "name": "Drewwww", "blocks": [{ "type": "item" }, { "type": "item" }, { "type": "item" }] }]
}
</schema>
`

const sources = { "sections/drewwww.storelib": MINE }

function card(label: string, section: SectionInstance) {
  const inner = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources,
      children: createElement(StorelibSection, { section, theme, isEditing: false, isSelected: false } as never),
    } as never),
  )
  return `
  <button class="card" data-card="${label}" style="width:${CARD_WIDTH}px">
    <div class="card__title">${label}</div>
    <div class="card__box" data-box="${label}" style="height:${HEIGHT}px;overflow:hidden;position:relative;content-visibility:auto;contain-intrinsic-size:${PREVIEW_WIDTH}px ${HEIGHT}px">
      <div data-inner="${label}" style="position:absolute;left:0;top:0;width:${RENDER_WIDTH}px;transform:scale(${PREVIEW_WIDTH / RENDER_WIDTH});transform-origin:top left;pointer-events:none">
        ${inner}
      </div>
    </div>
  </button>`
}

const mine: SectionInstance = {
  id: "mine-1", type: "drewwww", name: "Drewwww",
  settings: { eyebrow: "FAQ", heading: "Questions, answered." },
  blocks: [0, 1, 2].map((i) => ({ id: `b${i}`, type: "item", settings: { question: "What is Storelib?", answer: "A website builder that you own." } })),
} as never
const missing: SectionInstance = { id: "gone-1", type: "not_written", name: "Not written", settings: {}, blocks: [] } as never

const vars = themeVars(theme) as CSSProperties
const style = Object.entries(vars).map(([k, v]) => `${k}:${String(v)}`).join(";")
writeFileSync(join(OUT, "cards.html"), `<div id="grid" style="${style};display:flex;flex-direction:column;gap:16px;width:${CARD_WIDTH}px;font-family:Inter,system-ui,sans-serif">
${card("mine", mine)}
${card("missing", missing)}
</div>`)
