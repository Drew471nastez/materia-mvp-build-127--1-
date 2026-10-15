/**
 * ===========================================================================
 *  THE DARK LOOK, WRITTEN FROM THE CLASSES THE PAGES ACTUALLY USE
 * ===========================================================================
 * Round 27, the owner: a premium, ultra dark interface of deep charcoal and
 * near black (never pure black), layers told apart by small steps of
 * lightness, faint low contrast outlines, soft ambient shadows, no white
 * hovers, no white pills, no white borders. Every hover, pressed and open
 * state adapted.
 *
 * Storelib's buyer pages are written with Tailwind colour classes
 * (bg-white, bg-[#f3f4f6], text-[#6b7280], border-[#e5e7eb]/60,
 * hover:bg-[#f6f7f8], data-[highlighted]:bg-[#f1f2f4] ...). Remapping a
 * handful by hand left everything else white, which is what the owner saw.
 * So this reads every colour class in the buyer facing sources, works out
 * what it is for from its property and its colour (a white surface, a grey
 * well, a hairline, ink, muted text, a tinted notice, a dark button), and
 * writes the dark answer for each, with its variants (hover inside the
 * mouse only media query the app uses, active, focus, open, highlighted,
 * selected, and the screen widths). Coloured accents keep their hue.
 *
 * It only applies under html[data-sl-dark] (lib/appearance), which is only
 * ever set on Storelib's own buyer pages, or inside a community frame set
 * dark ([data-community-theme="dark"]). The dashboard never gets it.
 *
 *   node scripts/gen-theme-dark.mjs          writes app/theme-dark.css
 *   node scripts/gen-theme-dark.mjs --check  fails when the file is stale
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const OUT = join(root, "app/theme-dark.css")

/*
  Where Storelib's buyer pages are drawn (round 28: every component folder and route that is not the dashboard, a
  builder or the admin, and lib/ for the class strings kept there, so nothing on a buyer page is left out). A rule for a
  class that only the dashboard uses costs nothing: the dark attribute is never on <html> there.
*/
const SKIP = new Set([
  "components/app", "components/admin", "components/website-builder", "components/store-builder", "components/onepage",
  "components/dashboard", "components/developers", "components/sites", "components/domains", "components/analytics",
  "app/app", "app/admin", "app/website-builder", "app/store-builder", "app/onepage-preview", "app/api", "app/(sites)",
  "lib/website-builder", "lib/store-builder", "lib/sites", "lib/onepage",
])
const SOURCES = ["components", "app", "lib"].flatMap((top) =>
  readdirSync(join(root, top))
    .map((n) => `${top}/${n}`)
    .filter((d) => !SKIP.has(d)),
)

/* ── The palette: charcoal steps, never pure black ──────────────────────── */
const P = {
  page: "#111113",
  surface: "#18181b",
  raised: "#1f1f23",
  raised2: "#26262b",
  hover: "#25252a",
  press: "#2b2b31",
  selected: "#2d2d33",
  selectedHover: "#35353c",
  thumb: "#3a3a41",
  ink: "#ececee",
  text: "#c9cacf",
  muted: "#9c9da4",
  faint: "#6f7077",
  line: [255, 255, 255, 0.07],
  line2: [255, 255, 255, 0.11],
  lineStrong: [255, 255, 255, 0.24],
}

/* ── Colour helpers ─────────────────────────────────────────────────────── */
const NAMED = {
  white: "#ffffff", black: "#000000",
  "gray-50": "#f9fafb", "gray-100": "#f3f4f6", "gray-200": "#e5e7eb", "gray-300": "#d1d5db", "gray-400": "#9ca3af", "gray-500": "#6b7280", "gray-600": "#4b5563", "gray-700": "#374151", "gray-800": "#1f2937", "gray-900": "#111827", "gray-950": "#030712",
  "neutral-50": "#fafafa", "neutral-100": "#f5f5f5", "neutral-200": "#e5e5e5", "neutral-300": "#d4d4d4", "neutral-400": "#a3a3a3", "neutral-500": "#737373", "neutral-600": "#525252", "neutral-700": "#404040", "neutral-800": "#262626", "neutral-900": "#171717", "neutral-950": "#0a0a0a",
  "slate-50": "#f8fafc", "slate-100": "#f1f5f9", "slate-200": "#e2e8f0", "slate-300": "#cbd5e1", "slate-400": "#94a3b8", "slate-500": "#64748b", "slate-600": "#475569", "slate-700": "#334155", "slate-800": "#1e293b", "slate-900": "#0f172a",
  "zinc-50": "#fafafa", "zinc-100": "#f4f4f5", "zinc-200": "#e4e4e7", "zinc-300": "#d4d4d8", "zinc-400": "#a1a1aa", "zinc-500": "#71717a", "zinc-600": "#52525b", "zinc-700": "#3f3f46", "zinc-800": "#27272a", "zinc-900": "#18181b",
  "stone-50": "#fafaf9", "stone-100": "#f5f5f4", "stone-200": "#e7e5e4", "stone-300": "#d6d3d1",
  /* The tinted notices and their words: a pale ground becomes a faint tint of its hue, dark words lighten. */
  "red-50": "#fef2f2", "red-100": "#fee2e2", "red-200": "#fecaca", "red-600": "#dc2626", "red-700": "#b91c1c", "red-800": "#991b1b",
  "violet-50": "#f5f3ff", "violet-100": "#ede9fe", "violet-200": "#ddd6fe", "violet-700": "#6d28d9", "violet-800": "#5b21b6",
  "emerald-50": "#ecfdf5", "emerald-100": "#d1fae5", "emerald-700": "#047857", "emerald-800": "#065f46",
  "green-50": "#f0fdf4", "green-100": "#dcfce7", "green-700": "#15803d", "green-800": "#166534",
  "amber-50": "#fffbeb", "amber-100": "#fef3c7", "amber-200": "#fde68a", "amber-700": "#b45309", "amber-800": "#92400e",
  "blue-50": "#eff6ff", "blue-100": "#dbeafe", "blue-700": "#1d4ed8", "sky-50": "#f0f9ff", "sky-100": "#e0f2fe", "sky-700": "#0369a1",
  "orange-50": "#fff7ed", "orange-100": "#ffedd5", "orange-700": "#c2410c", "rose-50": "#fff1f2", "rose-700": "#be123c",
}
function hex(h) {
  let s = h.replace("#", "")
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("")
  const n = parseInt(s.slice(0, 6), 16)
  const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}
function hsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  let h = 0, s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l, spread: (max - min) * 255 }
}
/* A grey: channels within a few steps of each other. A dark ink may lean a little blue (#1a1a2e) and is still ink; a pale tint (#fff4ec, #f5f3ff) is a colour. */
const neutral = (c) => {
  const { spread, l } = hsl(c)
  return spread <= 10 || (l < 0.3 && spread <= 24)
}
const rgba = (c, a = 1) => (Array.isArray(c) ? `rgba(${c[0]},${c[1]},${c[2]},${+(c[3] * a).toFixed(3)})` : a >= 1 ? c : `rgba(${hex(c).slice(0, 3).join(",")},${+a.toFixed(3)})`)
const hsla = (h, s, l, a = 1) => `hsla(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${+a.toFixed(3)})`

/** The dark answer for one colour in one role, or null to leave it as it is. */
function mapColour(prop, c, alpha, interactive) {
  const { h, s, l } = hsl(c)
  const a = alpha * c[3]
  const isNeutral = neutral(c)
  if (prop === "bg") {
    if (isNeutral) {
      if (l >= 0.85) {
        if (interactive) return rgba(l >= 0.93 ? P.hover : P.press, a)
        if (l >= 0.995) return rgba(P.surface, a)
        if (l >= 0.965) return rgba(P.page, a)
        if (l >= 0.93) return rgba(P.raised, a)
        return rgba(P.raised2, a)
      }
      if (l >= 0.7) return rgba(P.thumb, a)
      if (l >= 0.35) return null
      /* A near black fill (a primary button, a chosen pill, a tooltip): graphite, not a white slab. */
      return rgba(interactive ? P.selectedHover : P.selected, a)
    }
    if (l >= 0.85) return hsla(h, Math.min(s, 0.6), 0.5, Math.max(0.1, 0.16 * a))
    return null
  }
  if (prop === "text" || prop === "placeholder" || prop === "caret" || prop === "fill-ink") {
    if (isNeutral) {
      if (l < 0.3) return rgba(P.ink, a)
      if (l < 0.5) return rgba(P.text, a)
      if (l < 0.62) return rgba(P.muted, a)
      if (l < 0.86) return rgba(P.faint, a)
      return null
    }
    if (l < 0.55) return hsla(h, Math.min(s, 0.75), 0.72, a)
    return null
  }
  if (prop === "border" || prop === "divide" || prop === "ring" || prop === "outline" || prop === "decoration") {
    if (isNeutral) {
      if (l >= 0.8) return rgba(P.line, a > 0.99 ? 1 : Math.max(0.5, a))
      if (l >= 0.6) return rgba(P.line2)
      if (l < 0.3) return rgba(P.lineStrong, a)
      return null
    }
    if (l >= 0.8) return hsla(h, Math.min(s, 0.5), 0.4, 0.45)
    return null
  }
  if (prop === "from" || prop === "via" || prop === "to") {
    if (isNeutral && l >= 0.85) return rgba(l >= 0.995 ? P.surface : l >= 0.965 ? P.page : P.raised, a)
    return null
  }
  if (prop === "fill" || prop === "stroke") {
    /* A white or pale fill is an icon drawn light on purpose (a play glyph on a dark disc): it stays. Only near black ink turns light. */
    if (isNeutral && l < 0.3) return rgba(P.ink, a)
    return null
  }
  return null
}

/* ── Reading the sources ────────────────────────────────────────────────── */
function* files(dir) {
  /* A source that is a file of its own (components/smart-link.tsx). */
  if (/\.(tsx|ts|jsx)$/.test(dir)) {
    try {
      if (statSync(dir).isFile()) yield dir
    } catch {
      /* gone */
    }
    return
  }
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const n of names) {
    const p = join(dir, n)
    if (SKIP.has(relative(root, p))) continue
    const st = statSync(p)
    if (st.isDirectory()) yield* files(p)
    else if (/\.(tsx|ts|jsx)$/.test(n)) yield p
  }
}
const COLOUR = String.raw`(?:\[#[0-9a-fA-F]{3,8}\]|white|black|(?:gray|neutral|slate|zinc|stone|red|violet|emerald|green|amber|blue|sky|orange|rose)-\d{2,3})`
const TOKEN = new RegExp(String.raw`(?<![\w\-:/\[])((?:\[@media[^\]\s]+\]:|\[&::?[\w-]+\]:|[a-z0-9-]+(?:-\[[^\]\s]+\])?(?:\/[\w-]+)?:)*)(bg|text|border(?:-[trblxyse])?|divide|ring|outline|from|via|to|fill|stroke|decoration|caret|accent)-(${COLOUR})(\/(?:\d{1,3}|\[[\d.]+\]))?(?![\w\-\[])`, "g")
const SHADOW = /(?<![\w\-:/\[])((?:\[@media[^\]\s]+\]:|\[&::?[\w-]+\]:|[a-z0-9-]+(?:-\[[^\]\s]+\])?(?:\/[\w-]+)?:)*)shadow-\[([^\]\s]+)\](?![\w\-\[])/g

const tokens = new Map()
const shadows = new Map()
for (const dir of SOURCES) {
  for (const f of files(join(root, dir))) {
    const src = readFileSync(f, "utf8")
    for (const m of src.matchAll(TOKEN)) tokens.set(m[0], m)
    for (const m of src.matchAll(SHADOW)) if (/#[0-9a-fA-F]{3,8}|rgba\(255,255,255/.test(m[2])) shadows.set(m[0], m)
  }
}

/* ── Variants, as Tailwind compiles them in this app ─────────────────────── */
const HOVER_MEDIA = "(hover: hover) and (pointer: fine)"
const WIDTH = { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" }
/** { pseudo, media[], interactive } for a chain of variants, or null when one is not understood. */
function variantsOf(chain) {
  /* Split on the colons between variants, not the ones inside an arbitrary one ([@media(hover:hover)]). */
  const parts = chain ? (chain.match(/(?:[^:\[]|\[[^\]]*\])+/g) ?? []).filter(Boolean) : []
  let pseudo = ""
  const media = []
  let interactive = false
  for (const v of parts) {
    if (v === "dark") return null
    /*
      Round 30: an arbitrary media variant ([@media(hover:hover)]:hover:bg-[#f8f9fa], the Members row) was not read at
      all, so its light hover stayed light in the dark look: a white row under the person card. Its query is kept as
      written (underscores are spaces), so the dark rule applies exactly where the light one does.
    */
    let am
    if ((am = /^\[@media(\(.+\))\]$/.exec(v))) { media.push(am[1].replace(/_/g, " ")); continue }
    if (v === "hover") { pseudo += ":hover"; media.push(HOVER_MEDIA); interactive = true; continue }
    if (v === "pointer-fine") { media.push(HOVER_MEDIA); continue }
    if (/^group-hover(\/[\w-]+)?$/.test(v)) { const n = v.split("/")[1]; pseudo += `:is(:where(.group${n ? `\\/${n}` : ""}):hover *)`; media.push(HOVER_MEDIA); interactive = true; continue }
    /* Round 30: a pressed or keyboard focused group (the post page's back button, the full screen post's close) and an enabled control. */
    if (/^group-(active|focus-visible)(\/[\w-]+)?$/.test(v)) { const [st, n] = v.slice(6).split("/"); pseudo += `:is(:where(.group${n ? `\\/${n}` : ""}):${st} *)`; interactive = true; continue }
    if (v === "enabled") { pseudo += ":enabled"; continue }
    if (/^group-data-\[/.test(v) || /^peer-/.test(v)) return null
    if (v === "focus") { pseudo += ":focus"; interactive = true; continue }
    if (v === "focus-visible") { pseudo += ":focus-visible"; interactive = true; continue }
    if (v === "focus-within") { pseudo += ":focus-within"; interactive = true; continue }
    if (v === "active") { pseudo += ":active"; interactive = true; continue }
    if (v === "disabled") { pseudo += ":disabled"; continue }
    if (v === "checked") { pseudo += ":checked"; continue }
    if (v === "first") { pseudo += ":first-child"; continue }
    if (v === "last") { pseudo += ":last-child"; continue }
    if (v === "odd") { pseudo += ":nth-child(odd)"; continue }
    if (v === "even") { pseudo += ":nth-child(even)"; continue }
    if (v === "placeholder") { pseudo += "::placeholder"; continue }
    if (v === "before") { pseudo += "::before"; continue }
    if (v === "after") { pseudo += "::after"; continue }
    let m
    /* Tailwind's bare data variant (md:data-open:bg-[#ececef], a menu trigger while its menu is open) is the attribute's presence. */
    if ((m = /^data-([a-z][\w-]*)$/.exec(v))) { pseudo += `[data-${m[1]}]`; interactive = true; continue }
    /* A scrollbar's own parts ([&::-webkit-scrollbar-thumb]:bg-[#d3d6db], the post overlay). */
    if ((m = /^\[&(::?[\w-]+)\]$/.exec(v))) { pseudo += m[1]; continue }
    if ((m = /^data-\[([\w-]+)(?:=([^\]]+))?\]$/.exec(v))) { pseudo += m[2] !== undefined ? `[data-${m[1]}="${m[2]}"]` : `[data-${m[1]}]`; interactive = true; continue }
    if ((m = /^aria-\[([\w-]+)=([^\]]+)\]$/.exec(v))) { pseudo += `[aria-${m[1]}="${m[2]}"]`; interactive = true; continue }
    if ((m = /^aria-(selected|checked|pressed|expanded|current|disabled)$/.exec(v))) { pseudo += `[aria-${m[1]}="true"]`; interactive = true; continue }
    if (WIDTH[v]) { media.push(`(width >= ${WIDTH[v]})`); continue }
    if ((m = /^max-(sm|md|lg|xl|2xl)$/.exec(v))) { media.push(`(width < ${WIDTH[m[1]]})`); continue }
    if ((m = /^min-\[(\d+px)\]$/.exec(v))) { media.push(`(width >= ${m[1]})`); continue }
    if ((m = /^max-\[(\d+px)\]$/.exec(v))) { media.push(`(width < ${m[1]})`); continue }
    if (v === "motion-safe" || v === "motion-reduce") return null
    return null
  }
  return { pseudo, media, interactive }
}
const esc = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
const SCOPE = `:is(html[data-sl-dark], [data-community-theme="dark"])`

function alphaOf(mod) {
  if (!mod) return 1
  const v = mod.slice(1)
  if (v.startsWith("[")) return parseFloat(v.slice(1, -1))
  return Number(v) / 100
}

/* ── Writing the rules ──────────────────────────────────────────────────── */
const rules = []
const PROP_CSS = {
  bg: (c) => `background-color: ${c}`,
  text: (c) => `color: ${c}`,
  placeholder: (c) => `color: ${c}`,
  caret: (c) => `caret-color: ${c}`,
  border: (c) => `border-color: ${c}`,
  "border-t": (c) => `border-top-color: ${c}`,
  "border-b": (c) => `border-bottom-color: ${c}`,
  "border-l": (c) => `border-left-color: ${c}`,
  "border-r": (c) => `border-right-color: ${c}`,
  "border-x": (c) => `border-left-color: ${c}; border-right-color: ${c}`,
  "border-y": (c) => `border-top-color: ${c}; border-bottom-color: ${c}`,
  "border-s": (c) => `border-inline-start-color: ${c}`,
  "border-e": (c) => `border-inline-end-color: ${c}`,
  divide: (c) => `border-color: ${c}`,
  ring: (c) => `--tw-ring-color: ${c}`,
  outline: (c) => `outline-color: ${c}`,
  decoration: (c) => `text-decoration-color: ${c}`,
  from: (c) => `--tw-gradient-from: ${c}`,
  via: (c) => `--tw-gradient-via: ${c}`,
  to: (c) => `--tw-gradient-to: ${c}`,
  fill: (c) => `fill: ${c}`,
  stroke: (c) => `stroke: ${c}`,
  accent: (c) => `accent-color: ${c}`,
}
for (const [cls, m] of [...tokens].sort(([a], [b]) => a.localeCompare(b))) {
  const [, chain, prop, colourName, mod] = m
  const v = variantsOf(chain.replace(/:$/, ""))
  if (!v) continue
  const colour = colourName.startsWith("[") ? hex(colourName.slice(1, -1)) : NAMED[colourName] ? hex(NAMED[colourName]) : null
  if (!colour) continue
  const role = prop.startsWith("border") ? "border" : v.pseudo.includes("::placeholder") ? "placeholder" : prop
  const mapped = mapColour(role, colour, alphaOf(mod), v.interactive)
  if (!mapped || !PROP_CSS[prop]) continue
  let sel = `${SCOPE} .${esc(cls)}${v.pseudo}`
  if (prop === "divide") sel = `${SCOPE} .${esc(cls)}${v.pseudo} > :not(:last-child)`
  rules.push({ media: v.media, css: `${sel} { ${PROP_CSS[prop](mapped)}; }` })
}
for (const [cls, m] of [...shadows].sort(([a], [b]) => a.localeCompare(b))) {
  const [, chain, raw] = m
  const v = variantsOf(chain.replace(/:$/, ""))
  if (!v) continue
  let value = raw.replace(/_/g, " ")
  value = value.replace(/#[0-9a-fA-F]{3,8}/g, (h) => {
    const c = hex(h)
    const { l } = hsl(c)
    if (!neutral(c)) return h
    if (l >= 0.6) return rgba(P.line2)
    if (l < 0.3) return rgba(P.lineStrong)
    return h
  })
  value = value.replace(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g, (_, a) => `rgba(255,255,255,${+(Number(a) * 0.08).toFixed(3)})`)
  rules.push({ media: v.media, css: `${SCOPE} .${esc(cls)}${v.pseudo} { box-shadow: ${value}; }` })
}

/* Grouped by media query, in a stable order, so the file diffs cleanly. */
const byMedia = new Map()
for (const r of rules) {
  const key = r.media.join(" and ")
  if (!byMedia.has(key)) byMedia.set(key, [])
  byMedia.get(key).push(r.css)
}
const L = (c) => rgba(c)
const head = `/**
 * GENERATED by scripts/gen-theme-dark.mjs from the colour classes in Storelib's
 * buyer facing sources. Do not edit by hand: change the palette or the
 * mapping in the script and run it again (tests/theme-dark.test.ts checks
 * this file is current).
 *
 * Applies only under html[data-sl-dark] (lib/appearance: Storelib's own buyer
 * pages, for a person who chose dark) or inside a community frame set dark.
 */

/* ── The ground, the shared tokens, the components built on CSS variables ── */
html[data-sl-dark] {
  color-scheme: dark;
  background-color: ${P.page};
  /* The strip under the clock, the browser's bar and the status bar's text all follow this one number (components/platform/native-chrome.tsx). */
  /* The header's own surface (bg-white becomes it), so the strip under the clock and the bar are one colour (round 29). */
  --native-band: ${P.surface};
  --bounce-ground: ${P.page};
  --sl-page: ${P.page};
  --sl-surface: ${P.surface};
  --sl-raised: ${P.raised};
  --sl-ink: ${P.ink};
  --sl-muted: ${P.muted};
  --sl-line: ${L(P.line)};
  --background: ${P.page};
  --foreground: ${P.ink};
  --card: ${P.surface};
  --card-foreground: ${P.ink};
  --popover: ${P.surface};
  --popover-foreground: ${P.ink};
  --muted: ${P.raised};
  --muted-foreground: ${P.muted};
  --accent: ${P.raised2};
  --accent-foreground: ${P.ink};
  --secondary: ${P.raised};
  --secondary-foreground: ${P.ink};
  --border: ${L(P.line)};
  --input: ${L(P.line2)};
  /* Colours some components set inline, as var(--name, today's colour) (round 28). */
  --sl-tab-on: ${P.ink};
  --sl-tab-rest: ${P.muted};
  /* The tab bar's glass (round 29, components/nav/buyer-tab-bar.tsx): a few per cent of white, light on its upper half, a hairline along the top, never a white highlight on the dark bar. */
  --sl-tab-lens: rgba(255,255,255,0.045);
  --sl-tab-lens-sheen: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 50%, rgba(255,255,255,0) 72%);
  --sl-tab-lens-edge: inset 0 0.5px 0 rgba(255,255,255,0.1), inset 0 0 0 0.5px rgba(255,255,255,0.035), 0 1px 6px -1px rgba(0,0,0,0.4);
  /* A tap shows no glass in the dark; a drag a faint whole (components/nav/buyer-tab-bar.tsx, round 30). */
  --sl-tab-lens-tap: 0;
  --sl-tab-lens-drag: 0.75;
  /* Under a dragging finger the glass's rim and its sheen (round 31): the same shapes as the light look, far fainter, and no cool shade, which on the dark bar would only read as a smudge. */
  --sl-tab-lens-rim: inset 0 1px 1.5px -0.5px rgba(255,255,255,0.12), inset 0 -1px 1.5px -0.5px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.035), 0 4px 12px -3px rgba(0,0,0,0.3);
  --sl-tab-lens-spec: radial-gradient(34% 26% at 36% 32%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%), radial-gradient(28% 18% at 66% 78%, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%);
  --sl-ink-strong: ${P.ink};
  --sl-arrive: rgba(253,248,236,0.07);
}
html[data-sl-dark] body {
  background-color: ${P.page};
  color: ${P.ink};
}
${SCOPE} {
  color-scheme: dark;
  /*
    A course's ink (round 29, components/courses): the ring, the progress bars and the current lesson's mark are near
    black in the light look and light ink here, on a faint track; a waiting lesson's ring is a faint line; the filter
    switch's raised pill is a graphite step.
    Set here and not only on <html>, so a community frame set dark has them too.
  */
  --sl-course-ink: ${P.ink};
  --sl-course-track: rgba(255,255,255,0.1);
  --sl-course-line: rgba(255,255,255,0.16);
  --sl-seg-on: ${P.selected};
  /* Round 29: the surface tokens inside a community frame set dark too (the comment pill, its typing ground: comments.tsx PILL_BOX). */
  --sl-surface: ${P.surface};
  --sl-raised: ${P.raised};
  --sl-line: ${L(P.line)};
  /* Round 30: a slim scrollbar's thumb (post-overlay.tsx SLIM_SCROLL), a graphite step, not the light grey. */
  --sl-scroll-thumb: ${P.thumb};
  /*
    Round 31, the owner: a library row's Download "too light, washed grey, especially in dark". The calm secondary
    (components/library/library-ui.ts CALM, ROW_ACTION): a graphite surface two steps above the card, a hairline that
    reads, a lit top edge and a shadow under it; lighter under a pointer, darker and pressed in under a finger.
  */
  --sl-btn2: #29292e;
  --sl-btn2-hover: #313137;
  --sl-btn2-press: #222226;
  --sl-btn2-line: rgba(255,255,255,0.13);
  --sl-btn2-line-hover: rgba(255,255,255,0.2);
  --sl-btn2-ink: ${P.ink};
  --sl-btn2-depth: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.45);
  --sl-btn2-press-depth: inset 0 1px 2px rgba(0,0,0,0.5);
  /* And a quiet destructive answer (the composer's Leave): a faint red ground, a red hairline, light red words. */
  --sl-danger-soft: rgba(240,68,56,0.14);
  --sl-danger-soft-hover: rgba(240,68,56,0.2);
  --sl-danger-soft-press: rgba(240,68,56,0.26);
  --sl-danger-line: rgba(249,112,102,0.38);
  --sl-danger-line-hover: rgba(249,112,102,0.55);
  --sl-danger-ink: #ffa198;
}
[data-community-theme="dark"] {
  background-color: ${P.page};
  color: ${P.ink};
}
${SCOPE} input,
${SCOPE} textarea,
${SCOPE} select {
  color: ${P.ink};
}
${SCOPE} input::placeholder,
${SCOPE} textarea::placeholder {
  color: ${P.faint};
}
/* A field whose hint is painted over it (Explore's search crossfades two) hides its own: the line above must not bring it back, or the two overlap. */
${SCOPE} .placeholder\\:text-transparent::placeholder {
  color: transparent;
}
${SCOPE} ::selection {
  background-color: rgba(255,255,255,0.16);
}

/*
  A MEMBER'S PROFILE (/u/<name>, components/profile/member-profile-page.tsx) is drawn with the storefront's chrome,
  which writes its colours and the design system's variables inline on its root. In the dark look those are the
  dark ones (round 28); a creator's own page keeps its creator's colours ([data-own-look], never darkened).
*/
html[data-sl-dark] [data-member-profile] {
  background: ${P.page} !important;
  color: ${P.ink} !important;
  --background: ${P.page} !important;
  --foreground: ${P.ink} !important;
  --card: ${P.surface} !important;
  --card-foreground: ${P.ink} !important;
  --popover: ${P.surface} !important;
  --popover-foreground: ${P.ink} !important;
  --muted: ${P.raised} !important;
  --muted-foreground: ${P.muted} !important;
  --secondary: ${P.raised} !important;
  --secondary-foreground: ${P.ink} !important;
  --accent: ${P.raised2} !important;
  --accent-foreground: ${P.ink} !important;
  --border: ${L(P.line)} !important;
  --input: ${L(P.line2)} !important;
  --sl-profile-text: ${P.ink};
  --sl-profile-muted: ${P.muted};
  --sl-profile-line: ${L(P.line)};
  --sl-profile-page: ${P.page};
  --sl-profile-badge: ${P.raised};
}
/*
  A SWITCH THAT IS ON LOOKS ON (round 29, the owner: "in dark the toggles feel like they are not clicked"). Mapped
  colour by colour, an on track (near black) became graphite and its white knob the card's charcoal: on and off were
  two dark greys. In the dark look a switch is the light one turned over, as Website Settings already draws it: on is
  a near white track with a near black knob, off a faint track with a grey knob. Read from what every switch already
  says (role="switch" or a checkbox row with aria-checked, or a Radix switch's data-state), so each drawing of one is
  covered without knowing its classes.
*/
${SCOPE} :is([role="switch"], [data-account-item="appearance"])[aria-checked="true"] :is(.bg-\\[\\#1a1a2e\\], .bg-\\[\\#111113\\], .bg-\\[\\#3a3a42\\], .bg-\\[\\#111827\\]),
${SCOPE} [data-slot="switch"][data-state="checked"] {
  background-color: ${P.ink} !important;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.25) !important;
}
${SCOPE} :is([role="switch"], [data-account-item="appearance"])[aria-checked="true"] :is(.bg-\\[\\#1a1a2e\\], .bg-\\[\\#111113\\], .bg-\\[\\#3a3a42\\], .bg-\\[\\#111827\\]) :is(.bg-white, .bg-\\[\\#ececee\\]),
${SCOPE} :is([role="switch"], [data-account-item="appearance"])[aria-checked="true"] :is(.bg-\\[\\#1a1a2e\\], .bg-\\[\\#111113\\], .bg-\\[\\#3a3a42\\], .bg-\\[\\#111827\\]) ~ .bg-white,
${SCOPE} [data-slot="switch"][data-state="checked"] [data-slot="switch-thumb"] {
  background-color: ${P.page} !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.4) !important;
}
${SCOPE} :is([role="switch"], [data-account-item="appearance"])[aria-checked="false"] :is(.bg-\\[\\#d9dce1\\], .bg-\\[\\#e4e5e9\\], .bg-\\[\\#e3e5e9\\], .bg-\\[\\#e5e7eb\\], .bg-\\[\\#d1d5db\\]),
${SCOPE} [data-slot="switch"][data-state="unchecked"] {
  background-color: rgba(255,255,255,0.14) !important;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.06) !important;
}
${SCOPE} :is([role="switch"], [data-account-item="appearance"])[aria-checked="false"] :is(.bg-\\[\\#d9dce1\\], .bg-\\[\\#e4e5e9\\], .bg-\\[\\#e3e5e9\\], .bg-\\[\\#e5e7eb\\], .bg-\\[\\#d1d5db\\]) :is(.bg-white),
${SCOPE} [data-slot="switch"][data-state="unchecked"] [data-slot="switch-thumb"] {
  background-color: ${P.text} !important;
}

/*
  THE GAP BETWEEN POSTS ON A PHONE IS THE PAGE (round 29, the owner: the strips in the dark feed). A post there is
  edge to edge with an 8px foot in the light page's grey, which the hairline mapping made a lit line 8px thick: a
  lighter band between two dark cards. In the dark it is the ground the cards sit on.
*/
@media (width < 40rem) {
  ${SCOPE} .max-sm\\:border-b-8.max-sm\\:border-b-8 {
    border-bottom-color: ${P.page};
  }
}

/*
  A MARK THAT SAYS "THIS ONE" STAYS INK (round 29: the selected tab's underline and an unread dot read as off). The
  near black fill becomes graphite for a pill or a button, where the words on it carry the meaning; an underline two
  pixels high or a dot six across is nothing but its colour, so in the dark it is the light ink.
*/
${SCOPE} .bg-\\[\\#1a1a2e\\]:is(.h-\\[2px\\], .h-\\[3px\\], .h-0\\.5, .h-1, .h-1\\.5, .h-2, .w-1\\.5, .w-2) {
  background-color: ${P.ink};
}

/* The header's Dashboard button: a raised graphite step on the dark bar, not the bar's own colour with a line round it. */
html[data-sl-dark] [data-header-dashboard] {
  background-color: ${P.raised2};
  border-color: rgba(255,255,255,0.08);
  color: ${P.ink};
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.4);
}
@media ${"(hover: hover) and (pointer: fine)"} {
  html[data-sl-dark] [data-header-dashboard]:hover {
    background-color: ${P.press};
    border-color: rgba(255,255,255,0.12);
  }
}
html[data-sl-dark] [data-header-dashboard]:active {
  background-color: ${P.selected};
}

html[data-sl-dark] [data-member-profile] [data-profile-top-bar] {
  background-color: ${P.surface} !important;
  color: ${P.ink} !important;
  border-color: ${L(P.line)} !important;
}

/*
  DEPTH, NOT OUTLINES. A card is a matte surface a step above the ground, with
  a faint lit top edge, a hairline that barely reads, and a soft shadow under
  it, so cards separate by light rather than by white borders.
*/
${SCOPE} .bg-white:is(.rounded-2xl, .rounded-xl, .rounded-\\[20px\\], .rounded-\\[18px\\], .rounded-\\[16px\\]) {
  /*
    Round 30, the owner: "very fine subtle lines in the gradual gradient". A 2.5% white wash over 140px is six steps
    of an 8 bit screen, each a visible band, and a 32px shadow at 70% black on a near black ground the same. The card
    is one flat surface now, its edge a hairline of light and a tight shadow, nothing that has to be drawn in steps.
  */
  background-image: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.35);
}
/* A menu or a sheet floats: a little more lift, the same matte surface. */
${SCOPE} :is([role="menu"], [role="listbox"], [role="dialog"], [data-account-menu]) {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 48px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06);
}
/* Pictures sit a touch below full brightness on the dark ground, never washed. */
${SCOPE} img:not([data-keep-bright]) {
  filter: brightness(0.96);
}

/*
  THE SWITCH ITSELF (round 28): one still of the page as it was fades away over the page as it is now, on the
  compositor, for SWITCH_MS (lib/appearance/client.ts swap). The still is on top; nothing else moves.
*/
html[data-theme-swap]::view-transition-group(root) {
  animation: none;
}
html[data-theme-swap]::view-transition-old(root) {
  z-index: 1;
  mix-blend-mode: normal;
  animation: sl-theme-out 220ms cubic-bezier(0.2, 0, 0, 1) both;
}
html[data-theme-swap]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: none;
}
@keyframes sl-theme-out {
  to {
    opacity: 0;
  }
}

/* ── Every colour class the buyer pages use, ${rules.length} of them ─────────────── */
`
let body = ""
for (const [media, list] of [...byMedia].sort(([a], [b]) => a.localeCompare(b))) {
  if (!media) body += list.join("\n") + "\n"
  else body += `@media ${media} {\n${list.map((l) => `  ${l}`).join("\n")}\n}\n`
}
const css = head + body

if (process.argv.includes("--check")) {
  const now = (() => {
    try {
      return readFileSync(OUT, "utf8")
    } catch {
      return ""
    }
  })()
  if (now !== css) {
    console.error(`${relative(root, OUT)} is stale: run node scripts/gen-theme-dark.mjs`)
    process.exit(1)
  }
  console.log(`${relative(root, OUT)} is current (${rules.length} rules)`)
} else {
  writeFileSync(OUT, css)
  console.log(`wrote ${relative(root, OUT)}: ${rules.length} rules, ${(css.length / 1024).toFixed(0)} KB`)
}
