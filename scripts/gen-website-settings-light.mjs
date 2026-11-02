#!/usr/bin/env node
/**
 * ===========================================================================
 *  WEBSITE SETTINGS IN THE LIGHT LOOK
 * ===========================================================================
 * Website Settings is drawn for the dark (white words at an alpha, faint white
 * fills, white hairlines), because it stands over the builder and the builder
 * is dark. The person's light or dark choice (lib/appearance) now reaches it:
 * a person who chose light gets it light, the same choice Explore, the account
 * and the communities follow. A person who never chose keeps it dark.
 *
 * Rather than a second set of classes in every panel, this reads the colour
 * classes the panels already use and writes their light step, under
 * [data-ws-look="light"] (components/website-builder/project-settings.tsx puts
 * it on the screen's root). The same idea as scripts/gen-theme-dark.mjs, the
 * other way round. Unlayered, so it wins over Tailwind's utilities layer.
 *
 *   node scripts/gen-website-settings-light.mjs          writes the sheet
 *   node scripts/gen-website-settings-light.mjs --check  fails when it is stale
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const OUT = "app/website-settings-light.css"

const SETTINGS_DIR = "components/website-builder/website-settings"
export const SOURCES = [
  ...readdirSync(join(root, SETTINGS_DIR))
    .filter((f) => f.endsWith(".tsx"))
    .sort()
    .map((f) => `${SETTINGS_DIR}/${f}`),
  "components/website-builder/project-settings.tsx",
  "components/website-builder/agent-connections-panel.tsx",
  "components/website-builder/github-sync-panel.tsx",
]

/* ── The light palette (the /app table in CLAUDE.md) ────────────────────── */
const INK = "#1a1a2e"
const PAGE = "#f8f9fa"
const LINE = (a) => `rgba(16,24,40,${round(Math.max(0.08, a))})`
const TINT = (a) => `rgba(16,24,40,${round(a)})`
const round = (n) => Math.round(n * 1000) / 1000

/** White words at an alpha, as the light look's greys: each step keeps its rank, and body text keeps 4.5:1 on white. */
function ink(alpha) {
  if (alpha >= 0.85) return INK
  if (alpha >= 0.7) return "#374151"
  if (alpha >= 0.55) return "#4b5563"
  if (alpha >= 0.35) return "#6b7280"
  return "#9ca3af"
}

/** The dark page's own greys and what each one is, in the light. */
const HEX_BG = {
  "#0f0f0f": PAGE, // the page
  "#171717": "#ffffff", // a field
  "#1a1a1a": "#ffffff", // a dialog
  "#1c1c1e": "#ffffff",
  "#1f1f1f": "#ffffff",
  "#202020": "#ffffff", // the chart's tip
  "#1b1b1b": "#dee1e6", // a browser's tab strip, as a light browser draws it
  "#2b2b2b": "#ffffff", // the tab on it
}
const HEX_TEXT = {
  "#bdc1c6": "#4d5156", // a search result's address and words, as a light search page writes them
  "#8ab4f8": "#1a0dab", // its title
  "#f87171": "#b91c1c",
  "#f5a3a3": "#b91c1c",
}
const NAMED_TEXT = {
  "red-200": "#b91c1c",
  "red-300": "#b91c1c",
  "emerald-200": "#047857",
  "emerald-300": "#047857",
  "emerald-400": "#047857",
  "amber-200": "#b45309",
  "amber-300": "#b45309",
}

/** A dark shadow, for the light page: the black kept far fainter, the white highlights left out. */
function lightShadow(v) {
  const parts = v.split(/,(?![^(]*\))/)
  const kept = parts
    .filter((p) => !/rgba\(255,\s*255,\s*255/.test(p))
    .map((p) => p.replace(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/g, (_, a) => `rgba(16,24,40,${round(Math.min(0.28, Number(a) * 0.3))})`))
  return kept.length ? kept.join(", ") : "0 0 #0000"
}

function alphaOf(s) {
  if (!s) return 1
  const m = /^\[([\d.]+)\]$/.exec(s)
  if (m) return Number(m[1])
  if (/^\d+$/.test(s)) return Number(s) / 100
  return null
}

/** One utility (no variants) and whether it sits under a state variant: the property and its light value, or null to leave it. */
function resolve(util, state) {
  let m
  if ((m = /^(text|fill)-white(?:\/(.+))?$/.exec(util))) {
    const a = alphaOf(m[2])
    return a === null ? null : { prop: m[1] === "fill" ? "fill" : "color", value: state === "hover" && a >= 0.8 ? INK : ink(a) }
  }
  if ((m = /^text-\[(#[0-9a-fA-F]{6})\](?:\/(\d+))?$/.exec(util))) {
    const v = HEX_TEXT[m[1].toLowerCase()]
    return v ? { prop: "color", value: v } : null
  }
  if ((m = /^text-((?:red|emerald|amber)-\d+)(?:\/\d+)?$/.exec(util))) {
    const v = NAMED_TEXT[m[1]]
    return v ? { prop: "color", value: state === "hover" ? "#991b1b" : v } : null
  }
  if ((m = /^bg-white\/(.+)$/.exec(util))) {
    const a = alphaOf(m[1])
    if (a === null) return null
    if (state) return { prop: "background-color", value: TINT(a * 0.6) }
    return { prop: "background-color", value: a <= 0.035 ? "#ffffff" : TINT(a * 0.7) }
  }
  if ((m = /^bg-\[(#[0-9a-fA-F]{6})\]$/.exec(util))) {
    const v = HEX_BG[m[1].toLowerCase()]
    return v ? { prop: "background-color", value: v } : null
  }
  if ((m = /^(border|divide)-white\/(.+)$/.exec(util))) {
    const a = alphaOf(m[2])
    return a === null ? null : { prop: "border-color", value: LINE(a), divide: m[1] === "divide" }
  }
  if ((m = /^ring-white\/(.+)$/.exec(util))) {
    const a = alphaOf(m[1])
    return a === null ? null : { prop: "--tw-ring-color", value: TINT(Math.min(0.3, a)) }
  }
  if ((m = /^outline-white\/(.+)$/.exec(util))) {
    const a = alphaOf(m[1])
    return a === null ? null : { prop: "outline-color", value: TINT(Math.min(0.45, a)) }
  }
  if ((m = /^shadow-\[(.+)\]$/.exec(util))) {
    const v = m[1].replace(/_/g, " ")
    if (!/rgba\((0|255),/.test(v)) return null
    return { prop: "--tw-shadow", value: lightShadow(v) }
  }
  return null
}

const MEDIA = { md: "(width >= 48rem)", "max-md": "(width < 48rem)", sm: "(width >= 40rem)" }
const HOVER_MEDIA = "(hover: hover) and (pointer: fine)"
const PSEUDO = { active: ":active", focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within", disabled: ":disabled" }
/** Order of the states, so a later one wins at equal weight, as Tailwind orders them. */
const STATE_RANK = { "": 0, "group-hover": 1, hover: 2, focus: 3, "focus-within": 3, "focus-visible": 4, "peer-focus-visible": 4, active: 5, disabled: 6, placeholder: 7 }

const esc = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
const SCOPE = ':is([data-ws-look="light"], [data-ws-look="light"] *)'

/** Every class-like word in the sources that names a colour. */
export function collect(sources = SOURCES) {
  const found = new Set()
  const solidUnderWhiteText = new Set()
  for (const file of sources) {
    const src = readFileSync(join(root, file), "utf8")
    for (const lit of src.matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
      const words = (lit[1] ?? lit[2] ?? "").split(/\s+/).filter(Boolean)
      for (const w of words) if (/^[a-z0-9:\-[\]/#.()_,!>]+$/.test(w)) found.add(w)
      /* White words on a solid colour (a red Delete, a green dot's button) stay white in the light too. */
      if (words.includes("text-white")) for (const w of words) if (/^bg-(?:(?:red|emerald|green|amber|blue)-\d+(?:\/\d+)?|\[#(?!0f0f0f|171717|1a1a1a|1b1b1b|1c1c1e|1f1f1f|202020|2b2b2b)[0-9a-fA-F]{6}\])$/.test(w)) solidUnderWhiteText.add(w)
    }
  }
  return { found: [...found].sort(), solidUnderWhiteText: [...solidUnderWhiteText].sort() }
}

export function build() {
  const { found, solidUnderWhiteText } = collect()
  const rules = []
  for (const token of found) {
    const parts = token.split(":")
    const util = parts.pop()
    if (util.startsWith("!")) continue
    let media = null
    let state = ""
    let ok = true
    for (const v of parts) {
      if (MEDIA[v] && !media) media = MEDIA[v]
      else if (v in STATE_RANK && !state) state = v
      else ok = false
    }
    if (!ok) continue
    const r = resolve(util, state === "placeholder" ? "" : state ? (state.includes("hover") ? "hover" : state) : "")
    if (!r) continue
    const cls = `.${esc(token)}`
    let el = `${cls}${SCOPE}`
    if (util === "text-white" && !state) el += `:not(${solidUnderWhiteText.map((c) => `.${esc(c)}`).join(", ")})`
    if (PSEUDO[state]) el += PSEUDO[state]
    if (state === "hover") el += ":hover"
    let sel = el
    if (state === "group-hover") sel = `.group:hover ${el}`
    if (state === "peer-focus-visible") sel = `.peer:focus-visible ~ ${el}`
    if (r.divide) sel = `${sel} > :not(:last-child)`
    if (state === "placeholder") sel = `${sel}::placeholder`
    const hoverish = state === "hover" || state === "group-hover"
    rules.push({ media, hoverish, rank: STATE_RANK[state] ?? 0, text: `${sel} { ${r.prop}: ${r.value}; }` })
  }
  rules.sort((a, b) => (a.media ? 1 : 0) - (b.media ? 1 : 0) || a.rank - b.rank || (a.text < b.text ? -1 : 1))
  const out = []
  out.push(`/**
 * GENERATED by scripts/gen-website-settings-light.mjs from the colour classes
 * Website Settings already uses. Do not edit by hand: change the mapping in
 * the script and run it again (tests/ui-polish-x.test.ts checks it is current).
 *
 * Applies only under [data-ws-look="light"]: Website Settings for a person
 * whose light or dark choice (lib/appearance) is light.
 */
`)
  out.push(`/* The screen itself, its page and its bars. */
[data-ws-look="light"] { color-scheme: light; color: ${INK}; }
[data-ws-look="dark"] { color-scheme: dark; }
`)
  const base = rules.filter((r) => !r.media && !r.hoverish && r.rank === 0)
  const states = rules.filter((r) => !r.media && !r.hoverish && r.rank > 0)
  const hover = rules.filter((r) => !r.media && r.hoverish)
  const byMedia = new Map()
  for (const r of rules.filter((x) => x.media)) {
    const key = r.hoverish ? `${r.media} and ${HOVER_MEDIA}` : r.media
    if (!byMedia.has(key)) byMedia.set(key, [])
    byMedia.get(key).push(r)
  }
  out.push(base.map((r) => r.text).join("\n"))
  /* Before the states, so a hover or a press still shows on these. */
  out.push(`
/*
  BY HAND, where one class is not the whole story:
  a secondary button's faint fill is white with its hairline in the light, as /app draws one;
  the primary button (white with near black words in the dark) turns over to near black with white words;
  the chart's lines are drawn as SVG attributes, so they are matched by those.
*/
.bg-white\\/\\[0\\.06\\].border-white\\/\\[0\\.13\\]${SCOPE} { background-color: #ffffff; }
.bg-white.text-\\[\\#0f0f0f\\]${SCOPE} { background-color: ${INK}; color: #ffffff; }
${SCOPE} line[stroke="rgba(255,255,255,0.07)"] { stroke: rgba(16,24,40,0.08); }
${SCOPE} line[stroke="rgba(255,255,255,0.3)"] { stroke: rgba(16,24,40,0.3); }
${SCOPE} circle[stroke="#161616"] { stroke: #ffffff; }
/* Round 48: [data-ws-look="light"] ::selection, the same elements as the scoped :is() form (a descendant of the root or of any descendant of it is a descendant of the root) and the same specificity, but written so the browser can rule it out from the ancestors' attribute names: ::selection rules are tried on every element, and the :is() form walked every element's ancestors twice. Measured with Chromium's selector stats on storelib.com: the costliest rule of the 1,141 on the home page. */
[data-ws-look="light"] ::selection { background-color: rgba(139,92,246,0.18); }
`)
  out.push(states.map((r) => r.text).join("\n"))
  out.push(`\n@media ${HOVER_MEDIA} {\n${hover.map((r) => `  ${r.text}`).join("\n")}\n}`)
  /* Each width's own classes, then its hovers, so a hover shows over a width's own fill. */
  const order = (k) => (k.includes("hover") ? 1 : 0)
  for (const [m, list] of [...byMedia.entries()].sort((a, b) => order(a[0]) - order(b[0]) || (a[0] < b[0] ? -1 : 1))) out.push(`\n@media ${m} {\n${list.map((r) => `  ${r.text}`).join("\n")}\n}`)
  out.push("")
  return out.join("\n")
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const css = build()
  if (process.argv.includes("--check")) {
    let now = ""
    try {
      now = readFileSync(join(root, OUT), "utf8")
    } catch {}
    if (now !== css) {
      console.error(`${OUT} is stale: run node scripts/gen-website-settings-light.mjs`)
      process.exit(1)
    }
    console.log(`${OUT} is current`)
  } else {
    writeFileSync(join(root, OUT), css)
    console.log(`wrote ${OUT} (${css.split("\n").length} lines)`)
  }
}
