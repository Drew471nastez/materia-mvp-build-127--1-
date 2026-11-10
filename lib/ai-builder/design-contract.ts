/**
 * ===========================================================================
 *  THE DESIGN CONTRACT: DESIGN.md <-> THEME SETTINGS, AND WHOSE VALUE IS WHOSE
 * ===========================================================================
 * Round O (O2), spec 7.5 and 7.6, prompt section D.
 *
 * Every AI-built website has one design contract, `DESIGN.md` at the root
 * of its theme files (store_theme_custom_files, draft and live halves,
 * versioned like every file, so it shows in the code editor and publishes
 * with the site). Its YAML front matter is the site's tokens in Google's
 * DESIGN.md format; its Markdown is why and how to use them.
 *
 * THE TOKENS ARE THE THEME SETTINGS. They are not a second copy:
 *
 *   contract -> settings   `settingsPatchFromDesignMd`: what the front
 *                          matter says, as the Theme settings the editor
 *                          already has (colour scheme, fonts, text styles,
 *                          radii, spacing), only the groups that changed.
 *   settings -> contract   `designMdFromSettings`: the front matter written
 *                          again from Theme settings, every line of the
 *                          Markdown kept, and any token detail the settings
 *                          do not hold (a display weight, letter spacing)
 *                          kept from the file.
 *
 * WHOSE VALUE IS WHOSE. `design_contract` (a Theme setting, typed here,
 * never a YAML field) remembers the value of each token the AI last set
 * (`ai`). A token whose current value differs from it was changed by the
 * creator, in Theme settings or in the file: a user override. A later AI
 * job keeps it (`protectOverrides`) unless the request asks for that kind of
 * change ("make the accent blue" may change the colours; "add an FAQ" may
 * not). An edit job reads the contract (`contractForPrompt`) and keeps the
 * brand tokens unless asked.
 *
 * Motion has no field in the DESIGN.md schema: it is described in the
 * file's Motion section and stays in Theme settings › Animations.
 *
 * Pure, no React, browser safe.
 */
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { contrastRatio, type VisualConcept } from "@/lib/storelib-ai/library/concept"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
import { DESIGN_MD_VERSION, parseDesignMd, px, renderDesignMd, replaceFrontMatter, resolveRef, type DesignMdDoc, type DesignMdError, type DesignMdSection, type DesignMdTokens, type TypographyToken } from "@/lib/storelib-ai/direction/design-md"
import { themeSettingsToTokens } from "./tokens"
import { tokensToThemeSettings as mapTokens } from "./agent/tokens"
import type { DesignTokens } from "./types"

export { DESIGN_MD_PATH } from "@/lib/storelib-ai/direction/design-md"

/** The Theme setting the contract's own typed metadata lives in. */
export const DESIGN_CONTRACT_SETTING = "design_contract"

/** Implementation metadata, kept out of the YAML on purpose. */
export interface DesignContractMeta {
  v: 1
  /** The art direction the site was planned with. */
  direction?: { primary: string; secondary: string | null }
  /** Token path -> the value the AI last set. */
  ai: Record<string, string | number>
}

/** The typed contract: the DESIGN.md document and its metadata. */
export interface DesignContract {
  doc: DesignMdDoc
  meta: DesignContractMeta
}

/* ── tokens <-> DESIGN.md tokens ───────────────────────────────────────── */

const r = (n: number) => Math.round(n)
const pxs = (n: number) => `${r(n)}px`

/** The type steps the Theme settings hold (lib/ai-builder/tokens.ts typeScaleStyles): h1 = r^5, h2 = r^4, h3 = r^2, h4 = r^1. */
function steps(base: number, ratio: number) {
  return { display: base * ratio ** 6, h1: base * ratio ** 5, h2: base * ratio ** 4, h3: base * ratio ** 2, h4: base * ratio, bodyLg: base * 1.125, label: Math.max(12, base * 0.875) }
}

/** DesignTokens as the DESIGN.md token tree; `keep` supplies details the settings do not hold (weights, tracking, leading). */
export function designMdTokensFrom(t: DesignTokens, head: { name: string; description?: string }, keep?: DesignMdTokens | null): DesignMdTokens {
  const c = t.colors
  const base = t.typeScale?.base ?? 16
  const ratio = t.typeScale?.ratio ?? 1.25
  const s = steps(base, ratio)
  const old = keep?.typography ?? {}
  const type = (id: string, family: string, size: number, fallback: Omit<TypographyToken, "fontFamily" | "fontSize">): TypographyToken => {
    const o = old[id] ?? {}
    return { fontFamily: family, fontSize: pxs(size), fontWeight: o.fontWeight ?? fallback.fontWeight, lineHeight: o.lineHeight ?? fallback.lineHeight, ...(o.letterSpacing ?? fallback.letterSpacing ? { letterSpacing: o.letterSpacing ?? fallback.letterSpacing } : {}), ...(o.fontFeature ? { fontFeature: o.fontFeature } : {}), ...(o.fontVariation ? { fontVariation: o.fontVariation } : {}) }
  }
  const label = t.fonts.accent || t.fonts.body
  const colors: Record<string, string> = {
    ...(keep?.colors ?? {}),
    primary: c.accent,
    "on-primary": c.accentText,
    neutral: c.background,
    surface: c.surface,
    "on-surface": c.text,
    "on-surface-muted": c.muted,
    outline: c.border,
  }
  if (c.inverse) Object.assign(colors, { "inverse-surface": c.inverse.background, "inverse-on-surface": c.inverse.text, "inverse-primary": c.inverse.accent })
  return {
    version: DESIGN_MD_VERSION,
    name: head.name,
    ...(head.description ? { description: head.description } : keep?.description ? { description: keep.description } : {}),
    colors,
    typography: {
      ...(keep?.typography ?? {}),
      "headline-display": type("headline-display", t.fonts.heading, s.display, { fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }),
      "headline-lg": type("headline-lg", t.fonts.heading, s.h1, { fontWeight: 700, lineHeight: 1 }),
      "headline-md": type("headline-md", t.fonts.heading, s.h2, { fontWeight: 700, lineHeight: 1.05 }),
      "headline-sm": type("headline-sm", t.fonts.heading, s.h3, { fontWeight: 600, lineHeight: 1.15 }),
      "title-md": type("title-md", t.fonts.heading, s.h4, { fontWeight: 600, lineHeight: 1.2 }),
      "body-lg": type("body-lg", t.fonts.body, s.bodyLg, { fontWeight: 400, lineHeight: 1.6 }),
      "body-md": type("body-md", t.fonts.body, base, { fontWeight: 400, lineHeight: 1.6 }),
      "label-md": type("label-md", label, s.label, { fontWeight: 500, lineHeight: 1.2 }),
    },
    rounded: { ...(keep?.rounded ?? {}), sm: pxs(t.radius.small), md: pxs(t.radius.medium), lg: pxs(t.radius.large) },
    spacing: { ...(keep?.spacing ?? {}), gutter: pxs(t.spacing.gutter), section: pxs(t.spacing.sectionY), "page-width": pxs(t.spacing.pageWidth), scale: t.spacing.scale },
    components: {
      "button-primary": { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.sm}", typography: "{typography.label-md}" },
      "button-secondary": { backgroundColor: "{colors.neutral}", textColor: "{colors.on-surface}", rounded: "{rounded.sm}" },
      card: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", rounded: "{rounded.md}" },
      input: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", rounded: "{rounded.sm}" },
      ...(keep?.components ?? {}),
    },
  }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * What a DESIGN.md's tokens say, as DesignTokens over `current` (the site's
 * tokens now). A value Storelib cannot apply (a colour that is not hex, a
 * font that does not load, a size that is not a dimension) is left as it
 * was, with a note saying so.
 */
export function tokensFromDesignMd(md: DesignMdTokens, current: DesignTokens): { tokens: DesignTokens; notes: string[] } {
  const notes: string[] = []
  const color = (key: string, now: string): string => {
    const raw = md.colors[key]
    if (raw === undefined) return now
    const v = resolveRef(md, raw).trim().toLowerCase()
    if (HEX.test(v)) return v
    notes.push(`colors.${key}: "${raw}" was not applied; Theme settings take hex colours (#rrggbb)`)
    return now
  }
  const c = current.colors
  const colors: DesignTokens["colors"] = {
    background: color("neutral", c.background),
    surface: color("surface", c.surface),
    text: color("on-surface", c.text),
    muted: color("on-surface-muted", c.muted),
    accent: color("primary", c.accent),
    accentText: color("on-primary", c.accentText),
    border: color("outline", c.border),
  }
  if (md.colors["inverse-surface"] || c.inverse) {
    const inv = c.inverse ?? { background: colors.text, text: colors.background, accent: colors.accent }
    colors.inverse = { background: color("inverse-surface", inv.background), text: color("inverse-on-surface", inv.text), accent: color("inverse-primary", inv.accent) }
  }
  const family = (id: string, now: string): string => {
    const f = md.typography[id]?.fontFamily
    if (!f) return now
    const clean = f.replace(/["']/g, "").split(",")[0].trim()
    if (OFFERED_FAMILIES.has(clean)) return clean
    notes.push(`typography.${id}.fontFamily: "${f}" cannot load on a Storelib website; pick one from Theme settings › Typography`)
    return now
  }
  const heading = family("headline-display", family("headline-lg", current.fonts.heading))
  const body = family("body-md", current.fonts.body)
  const labelFamily = md.typography["label-md"]?.fontFamily ? family("label-md", current.fonts.accent ?? body) : current.fonts.accent
  const fonts: DesignTokens["fonts"] = { heading, body, ...(labelFamily && labelFamily !== body ? { accent: labelFamily } : {}) }
  const basePx = px(md.typography["body-md"]?.fontSize)
  const h4 = px(md.typography["title-md"]?.fontSize)
  const h1 = px(md.typography["headline-lg"]?.fontSize)
  let typeScale = current.typeScale
  const sameScale = !!current.typeScale && basePx === current.typeScale.base && (h4 === null || h4 === r(current.typeScale.base * current.typeScale.ratio))
  if (sameScale) typeScale = current.typeScale
  else if (basePx && basePx >= 12 && basePx <= 22) {
    const ratio = h4 ? h4 / basePx : h1 ? (h1 / basePx) ** (1 / 5) : (current.typeScale?.ratio ?? 1.25)
    typeScale = { base: r(basePx), ratio: Math.min(1.6, Math.max(1.05, Math.round(ratio * 100) / 100)) }
  } else if (md.typography["body-md"]?.fontSize) notes.push(`typography.body-md.fontSize: "${md.typography["body-md"].fontSize}" is not a size between 12px and 22px`)
  const dim = (group: "rounded" | "spacing", key: string, now: number): number => {
    const raw = (md[group] as Record<string, unknown>)[key]
    if (raw === undefined) return now
    const v = px(typeof raw === "string" ? resolveRef(md, raw) : raw)
    if (v === null || v < 0) {
      notes.push(`${group}.${key}: "${String(raw)}" is not a dimension (px or rem)`)
      return now
    }
    return v
  }
  const scaleRaw = md.spacing.scale
  const scale = typeof scaleRaw === "number" ? scaleRaw : typeof scaleRaw === "string" && /^\d+(\.\d+)?$/.test(scaleRaw) ? Number(scaleRaw) : current.spacing.scale
  return {
    tokens: {
      ...current,
      colors,
      fonts,
      ...(typeScale ? { typeScale } : {}),
      radius: { small: dim("rounded", "sm", current.radius.small), medium: dim("rounded", "md", current.radius.medium), large: dim("rounded", "lg", current.radius.large) },
      spacing: { scale, sectionY: dim("spacing", "section", current.spacing.sectionY), pageWidth: dim("spacing", "page-width", current.spacing.pageWidth), gutter: dim("spacing", "gutter", current.spacing.gutter) },
    },
    notes,
  }
}

/* ── token paths, for overrides ────────────────────────────────────────── */

/** The token values a contract governs, flat: `colors.accent` -> "#e1251b". */
export function flatTokens(t: DesignTokens): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(t.colors)) if (typeof v === "string") out[`colors.${k}`] = v.toLowerCase()
  out["fonts.heading"] = t.fonts.heading
  out["fonts.body"] = t.fonts.body
  if (t.fonts.accent) out["fonts.accent"] = t.fonts.accent
  if (t.typeScale) {
    out["typeScale.base"] = t.typeScale.base
    out["typeScale.ratio"] = t.typeScale.ratio
  }
  out["radius.small"] = t.radius.small
  out["radius.medium"] = t.radius.medium
  out["radius.large"] = t.radius.large
  out["spacing.scale"] = t.spacing.scale
  out["spacing.sectionY"] = t.spacing.sectionY
  out["spacing.pageWidth"] = t.spacing.pageWidth
  out["spacing.gutter"] = t.spacing.gutter
  return out
}

/** The contract metadata stored on a site, or null. */
export function readContractMeta(settings: Record<string, unknown> | null | undefined): DesignContractMeta | null {
  const raw = settings?.[DESIGN_CONTRACT_SETTING]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const m = raw as Partial<DesignContractMeta>
  const ai: Record<string, string | number> = {}
  if (m.ai && typeof m.ai === "object") for (const [k, v] of Object.entries(m.ai)) if (typeof v === "string" || typeof v === "number") ai[k.slice(0, 60)] = typeof v === "string" ? v.slice(0, 120) : v
  const d = m.direction && typeof m.direction === "object" ? m.direction : undefined
  return { v: 1, ai, ...(d && typeof d.primary === "string" ? { direction: { primary: d.primary.slice(0, 60), secondary: typeof d.secondary === "string" ? d.secondary.slice(0, 60) : null } } : {}) }
}

/** Token paths the creator changed since the AI last set them: the user overrides. */
export function userOverrides(settings: Record<string, unknown> | null | undefined, meta: DesignContractMeta | null = readContractMeta(settings)): string[] {
  if (!meta) return []
  const now = flatTokens(themeSettingsToTokens(settings))
  return Object.keys(meta.ai).filter((k) => k in now && String(now[k]).toLowerCase() !== String(meta.ai[k]).toLowerCase()).sort()
}

/** The metadata after the AI set these settings: every governed token's value now counts as the AI's. */
export function recordAiTokens(settings: Record<string, unknown>, meta: DesignContractMeta | null, direction?: DesignContractMeta["direction"]): DesignContractMeta {
  const now = flatTokens(themeSettingsToTokens(settings))
  const keepOverrides = new Set(userOverrides(settings, meta))
  const ai: Record<string, string | number> = { ...(meta?.ai ?? {}) }
  for (const [k, v] of Object.entries(now)) if (!keepOverrides.has(k)) ai[k] = v
  return { v: 1, ai, ...(direction ? { direction } : meta?.direction ? { direction: meta.direction } : {}) }
}

/** The words that ask for each group of tokens to change. */
const ASKS: [string, RegExp][] = [
  ["colors", /\b(colou?rs?|palette|accent|background|dark mode|light mode|black|white|red|blue|green|yellow|orange|pink|purple|navy|gold|brand colou?r|rebrand|new look|redesign)\b/i],
  ["fonts", /\b(fonts?|typefaces?|typography|serif|sans|headline font|heading font|rebrand|new look|redesign)\b/i],
  ["typeScale", /\b(text size|font size|type scale|bigger text|smaller text|typography|headline size)\b/i],
  ["radius", /\b(corners?|rounded|radius|sharp|square|pill)\b/i],
  ["spacing", /\b(spacing|whitespace|white space|padding|tighter|denser|airier|page width|wider|narrower|gutter)\b/i],
]

/** Token groups a request asks to change. */
export function askedGroups(prompt: string): Set<string> {
  return new Set(ASKS.filter(([, re]) => re.test(prompt)).map(([g]) => g))
}

/**
 * The tokens an AI job may set, with the creator's overrides kept: for each
 * overridden path the creator's current value replaces the AI's, unless the
 * request asks for that group of tokens. `kept` lists what was protected.
 */
export function protectOverrides(tokens: Partial<DesignTokens>, settings: Record<string, unknown>, prompt: string): { tokens: Partial<DesignTokens>; kept: string[] } {
  const overrides = userOverrides(settings)
  if (!overrides.length) return { tokens, kept: [] }
  const asked = askedGroups(prompt)
  const now = themeSettingsToTokens(settings)
  const out = JSON.parse(JSON.stringify(tokens ?? {})) as Partial<DesignTokens> & Record<string, Record<string, unknown>>
  const kept: string[] = []
  for (const path of overrides) {
    const [group, key] = path.split(".")
    if (asked.has(group)) continue
    const target = out[group] as Record<string, unknown> | undefined
    if (!target || !(key in target)) continue
    const value = (now as unknown as Record<string, Record<string, unknown>>)[group]?.[key]
    if (value === undefined) continue
    if (JSON.stringify(target[key]).toLowerCase() === JSON.stringify(value).toLowerCase()) continue
    target[key] = value
    kept.push(path)
  }
  return { tokens: out, kept }
}

/* ── the file and the settings ─────────────────────────────────────────── */

const GROUPS = ["colors", "fonts", "typeScale", "radius", "spacing"] as const

/**
 * The Theme settings a DESIGN.md asks for, as a patch over `settings`: only
 * the groups whose values differ. `errors` (with lines) mean the file could
 * not be read and nothing is applied.
 */
export function settingsPatchFromDesignMd(text: string, settings: Record<string, unknown>): { ok: true; patch: Record<string, unknown>; changed: string[]; notes: string[] } | { ok: false; errors: DesignMdError[] } {
  const read = parseDesignMd(text)
  if (read.ok === false) return { ok: false, errors: (read as { errors: DesignMdError[] }).errors }
  const current = themeSettingsToTokens(settings)
  const { tokens, notes } = tokensFromDesignMd(read.doc.tokens, current)
  const partial: Partial<DesignTokens> = {}
  for (const g of GROUPS) {
    if (JSON.stringify(tokens[g]) !== JSON.stringify(current[g])) (partial as Record<string, unknown>)[g] = tokens[g]
  }
  if (!Object.keys(partial).length) return { ok: true, patch: {}, changed: [], notes }
  const mapped = mapTokens(partial, settings)
  for (const i of mapped.issues) notes.push(i.message)
  return { ok: true, patch: mapped.settings, changed: mapped.changed, notes }
}

/**
 * The DESIGN.md for these Theme settings: the front matter written again
 * from them (keeping the file's name, description and the token details
 * settings do not hold), the Markdown below kept byte for byte. A file
 * that does not read is left as it is (null): the creator's broken edit is
 * theirs to fix, never overwritten.
 */
export function designMdFromSettings(text: string, settings: Record<string, unknown>): string | null {
  const read = parseDesignMd(text)
  if (read.ok === false) return null
  const doc = read.doc
  const next = designMdTokensFrom(themeSettingsToTokens(settings), { name: doc.tokens.name, ...(doc.tokens.description ? { description: doc.tokens.description } : {}) }, doc.tokens)
  const out = replaceFrontMatter(text, next)
  return out === text ? text : out
}

/* ── writing a contract from the plan ──────────────────────────────────── */

const clean = (s: string) => s.replace(/—/g, ",").replace(/\s+/g, " ").trim()

/** The tokens a concept and direction stand for, before any Theme setting exists. */
export function tokensFromPlan(concept: VisualConcept | null, choice: DirectionChoice): DesignTokens {
  const p = choice.palette
  const cp = concept?.palette
  const background = cp?.background ?? p.background
  const text = cp?.text ?? p.text
  const accent = cp?.accent ?? p.accent
  const radius = typeof concept?.layout?.radius === "number" ? Math.max(0, Math.min(40, concept.layout.radius)) : choice.radius
  const density = concept?.layout?.density ?? choice.matrix.density
  return {
    colors: {
      background,
      surface: cp?.surface ?? p.surface,
      text,
      muted: cp?.muted ?? p.muted,
      accent,
      accentText: accent.toLowerCase() === p.accent.toLowerCase() ? p.accentText : (contrastRatio("#ffffff", accent) ?? 0) >= (contrastRatio("#0b0b0b", accent) ?? 0) ? "#ffffff" : "#0b0b0b",
      border: p.border,
      ...(p.inverse ? { inverse: p.inverse } : {}),
    },
    fonts: { heading: concept?.typeSystem?.display?.replace(/["']/g, "").split(",")[0].trim() || choice.fonts.display, body: concept?.typeSystem?.body?.replace(/["']/g, "").split(",")[0].trim() || choice.fonts.body, ...(concept?.typeSystem?.mono || choice.fonts.mono ? { accent: (concept?.typeSystem?.mono ?? choice.fonts.mono)!.replace(/["']/g, "").split(",")[0].trim() } : {}) },
    typeScale: { base: 16, ratio: Math.min(1.6, Math.max(1.125, concept?.typeSystem?.scaleRatio ?? choice.typeSystem.ratio)) },
    radius: { small: radius, medium: radius, large: Math.min(40, radius === 999 ? 24 : radius * 2) },
    spacing: { scale: density === "airy" ? 1.25 : density === "dense" ? 0.85 : 1, sectionY: density === "airy" ? 128 : density === "dense" ? 72 : 96, pageWidth: 1320, gutter: 24 },
    motion: { level: choice.primary.motion === "quiet" ? "subtle" : choice.primary.motion === "expressive" ? "expressive" : "subtle" },
  }
}

/** The Markdown sections of a new contract, from the brief, the direction and the accepted concept. */
export function contractSections(brief: CreativeBrief, choice: DirectionChoice, concept: VisualConcept | null): DesignMdSection[] {
  const d = choice.primary
  const t = choice.typeSystem
  const m = choice.matrix
  const name = concept?.name ?? d.name
  const display = concept?.typeSystem?.display ?? choice.fonts.display
  const body = concept?.typeSystem?.body ?? choice.fonts.body
  const mono = concept?.typeSystem?.mono ?? choice.fonts.mono
  return [
    {
      heading: "Overview",
      body: [
        `${name}: ${clean(d.thesis)}`,
        "",
        `A ${brief.business.label} site${brief.audience ? ` for ${brief.audience}` : ""}. The visitor should ${brief.objective === "book" ? "book" : brief.objective === "buy" ? "buy" : brief.objective === "enquire" ? "get in touch" : brief.objective === "view-work" ? "look through the work and get in touch" : brief.objective}; the main action reads "${brief.cta}".`,
        `Direction: ${d.name} (${d.family})${choice.secondary ? `, with one idea borrowed from ${choice.secondary.name}` : ""}.${concept?.mood?.length ? ` Mood: ${concept.mood.join(", ")}.` : ""}`,
      ].join("\n"),
    },
    {
      heading: "Colors",
      body: [
        `A ${(concept?.palette?.mode ?? choice.palette.mode) === "dark" ? "dark" : "light"} palette with one accent.`,
        "",
        "- **Ground (`neutral`):** the page background.",
        "- **Ink (`on-surface`):** headlines and text, at least 4.5:1 on the ground.",
        "- **Muted (`on-surface-muted`):** captions and secondary text, also 4.5:1.",
        `- **Accent (\`primary\`):** ${clean(concept?.palette?.accentUse ?? "actions and one signature detail")}. Never a background for long text.`,
        "- **Surface (`surface`) and outline (`outline`):** panels, inputs, rules.",
        ...(choice.palette.inverse ? ["- **Contrast band (`inverse-surface`):** one or two full width sections that change the tempo."] : []),
      ].join("\n"),
    },
    {
      heading: "Typography",
      body: [
        `Display in **${display}**, text in **${body}**${mono ? `, labels and figures in **${mono}**` : ""}.`,
        "",
        `- **Headlines:** ${clean(t.notes)}`,
        `- **Scale:** ratio ${concept?.typeSystem?.scaleRatio ?? t.ratio}, fluid with clamp() between phone and desktop; display leading ${t.display.lineHeight}, tracking ${t.display.tracking}.`,
        `- **Body:** ${t.body.size} at ${t.body.lineHeight} line height, 45 to 75 characters a line.`,
        ...(concept?.typeSystem?.rule ? [`- **Rule:** ${clean(concept.typeSystem.rule)}.`] : []),
        "- Prices, times and numbers use tabular figures.",
      ].join("\n"),
    },
    {
      heading: "Layout",
      body: [
        `Hero: ${m.hero.replace(/-/g, " ")}. Grid: ${m.grid.replace(/-/g, " ")}. Dividers: ${m.dividers.replace(/-/g, " ")}. Density: ${concept?.layout?.density ?? m.density}.`,
        "",
        ...[...(concept?.layout?.principles ?? []), ...d.layout].slice(0, 5).map((l) => `- ${clean(l)}`),
        "- Mobile first: designed at 375px wide, nothing scrolls sideways, tap targets at least 44px.",
      ].join("\n"),
    },
    {
      heading: "Elevation & Depth",
      body: d.allow?.includes("glass") || d.allow?.includes("glow") ? "Depth from light: one soft highlight or glow where it holds an action, nowhere else. Text never sits on a blurred panel without its contrast checked." : "Flat. Hierarchy comes from scale, colour bands and rules, not shadows. A shadow appears only on something you can press or that floats over the page (the cart, a menu).",
    },
    {
      heading: "Shapes",
      body: `${m.shape === "square" ? "Square" : m.shape === "softened" ? "Softened" : m.shape === "organic" ? "Organic" : "Clipped"} shape language: ${choice.radius >= 999 ? "fully rounded buttons" : `${typeof concept?.layout?.radius === "number" ? concept.layout.radius : choice.radius}px corners on buttons and inputs`}, the same everywhere. Images keep one crop shape across the site.`,
    },
    {
      heading: "Components",
      body: [
        `- **Buttons:** the primary button is the accent with \`on-primary\` text; one primary action per screen, the words "${brief.cta}" or close to them. Secondary buttons are outlined in ink.`,
        "- **Cards and lists:** used only where items really repeat; never three identical cards as the second section.",
        "- **Forms:** real labels above inputs, visible focus, the site's own corners.",
        "- **Header and footer:** the site's own, holding the menu, search and cart where the store sells.",
      ].join("\n"),
    },
    { heading: "Imagery", body: clean(concept?.imagery?.direction ?? d.imagery) + (concept?.imagery?.avoid?.length ? `\n\nAvoid: ${concept.imagery.avoid.map(clean).join("; ")}.` : "") },
    { heading: "Motion", body: `${clean(d.motionSignature)}.${concept?.motion?.moves?.length ? ` Moves: ${concept.motion.moves.map(clean).join("; ")}.` : ""} Everything stands still under prefers-reduced-motion. The level is set in Theme settings › Animations.` },
    {
      heading: "Do's and Don'ts",
      body: [
        `- Do keep ${d.signature.charAt(0).toLowerCase()}${d.signature.slice(1)} as the site's signature.`,
        ...(concept?.signatureMoves ?? []).slice(0, 2).map((s) => `- Do ${clean(s).charAt(0).toLowerCase()}${clean(s).slice(1)}.`),
        "- Do maintain WCAG AA contrast (4.5:1 for text).",
        ...d.avoid.map((a) => `- Don't use ${clean(a)}.`),
        ...brief.mustNotFabricate.map((f) => `- Don't invent ${clean(f)}.`),
      ].join("\n"),
    },
  ]
}

/** A new contract from the plan: the document, and its metadata. Settings come from `tokensFromPlan`. */
export function contractFromPlan(brief: CreativeBrief, choice: DirectionChoice, concept: VisualConcept | null): DesignContract {
  const tokens = tokensFromPlan(concept, choice)
  const name = concept?.name ?? choice.primary.name
  const description = clean(`${choice.primary.name} for a ${brief.business.label}${brief.business.name ? `, ${brief.business.name}` : ""}.`)
  const mdTokens = designMdTokensFrom(tokens, { name, description })
  /* The display face's real weight, leading and tracking from the type system, since settings hold only the family. */
  const t = choice.typeSystem
  if (mdTokens.typography["headline-display"] && mdTokens.typography["headline-display"].fontFamily === t.display.family) {
    Object.assign(mdTokens.typography["headline-display"], { fontWeight: t.display.weight, lineHeight: t.display.lineHeight, letterSpacing: t.display.tracking })
  }
  return {
    doc: { tokens: mdTokens, title: `${name} design contract`, sections: contractSections(brief, choice, concept) },
    meta: { v: 1, direction: { primary: choice.primary.id, secondary: choice.secondary?.id ?? null }, ai: flatTokens(tokens) },
  }
}

export function renderContract(c: DesignContract): string {
  return renderDesignMd(c.doc)
}

/** An existing site's contract for an edit job's prompt: the tokens, its rules, and what the creator set themselves. */
export function contractForPrompt(text: string, settings: Record<string, unknown>): string {
  const read = parseDesignMd(text)
  const overrides = userOverrides(settings)
  const head = "DESIGN CONTRACT (DESIGN.md, the site's design system; it is synced with Theme settings): keep these brand tokens unless the request asks to change them. Change one section without restyling the site."
  if (read.ok === false) return `${head}\nThe file does not read right now; keep the Theme settings as they are.`
  const doc = read.doc
  const tk = doc.tokens
  const fonts = [tk.typography["headline-display"]?.fontFamily, tk.typography["body-md"]?.fontFamily].filter(Boolean).join(" / ")
  const dos = doc.sections.find((s) => /do'?s/i.test(s.heading))?.body ?? ""
  return [
    head,
    `- ${tk.name}${tk.description ? `: ${tk.description}` : ""}`,
    `- Colours: ${Object.entries(tk.colors).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    fonts ? `- Type: ${fonts}` : "",
    `- Corners: ${Object.entries(tk.rounded).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    overrides.length ? `- Set by the creator (never change these unless the request names them): ${overrides.join(", ")}` : "",
    dos ? `RULES:\n${dos.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
