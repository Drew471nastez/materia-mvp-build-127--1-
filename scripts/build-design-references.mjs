#!/usr/bin/env node
/**
 * Builds lib/storelib-ai/references/vendored.generated.ts from local clones
 * of the open-source design references Storelib learns from. Compact records
 * only: nothing of a repository is copied whole, and no brand asset (logo,
 * image, font file) is read at all, only text.
 *
 *   node scripts/build-design-references.mjs <dir>
 *
 * <dir> holds shallow clones (any folder names ending in the repo name):
 *   voltagent/awesome-design-md            MIT          DESIGN.md token analyses of public sites
 *   nextlevelbuilder/ui-ux-pro-max-skill   MIT          data/styles.csv style vocabulary
 *
 * Each licence was read from the repository's own LICENSE file on the day
 * the generated file records; the commit each record came from is kept on
 * it. Re-run after pulling newer clones; tests/ai-references-o1.test.ts holds
 * every generated record valid. The hand-curated principle records from
 * taste-skill and impeccable live in lib/storelib-ai/references/principles.ts.
 *
 * The clones are untrusted data: this reads text and CSV, runs nothing from
 * them, and keeps every extracted string short.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.argv[2]
if (!root || !existsSync(root)) {
  console.error("usage: node scripts/build-design-references.mjs <dir with the clones>")
  process.exit(1)
}
const OUT = new URL("../lib/storelib-ai/references/vendored.generated.ts", import.meta.url)
const TODAY = new Date().toISOString().slice(0, 10)

function find(name) {
  const hit = readdirSync(root).find((d) => d === name || d.endsWith(`_${name}`) || d.endsWith(`-${name}`))
  if (!hit) throw new Error(`no clone of ${name} under ${root}`)
  return join(root, hit)
}
function commitOf(dir) {
  return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
}
function licenceOf(dir) {
  const text = readFileSync(join(dir, "LICENSE"), "utf8")
  if (/^\s*MIT License/m.test(text)) return { spdx: "MIT", holder: (text.match(/Copyright \(c\) ([^\n]+)/i) ?? [])[1]?.trim() ?? null }
  if (/Apache License\s+Version 2\.0/m.test(text)) return { spdx: "Apache-2.0", holder: null }
  throw new Error(`unrecognised licence in ${dir}`)
}

/* ── text helpers ─────────────────────────────────────────────────────── */
const clean = (s) =>
  String(s ?? "")
    .replace(/—|–/g, ", ")
    .replace(/\{[a-z-]+\.([a-z0-9-]+)\}/gi, "$1")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ,/g, ",")
    .trim()
function clip(s, max) {
  const t = clean(s)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  /* End on a whole sentence when one ends in the last 40% of the room, else on a whole word. */
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).replace(/[,;:.\s]+$/, "")}.`
}
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Parent companies and people a description names beside the brand: provenance, never prompt text. */
const OWNERS = [
  [/\b(Anthropic|Elon Musk|Google|Microsoft|Amazon|Alphabet|OpenAI)('s)?\b/g, (_m, _n, poss) => (poss ? "its owner's" : "its owner")],
  [/\bCarbon Design System\b/g, "a corporate design system"],
]

/* ── awesome-design-md ────────────────────────────────────────────────── */

/** Business context per analysed site, written here (the corpus does not tag it). */
const CONTEXT = {
  "1win": ["betting", "gaming"], airbnb: ["travel", "marketplace", "hospitality"], airtable: ["saas", "productivity"], aljazeera: ["news", "media"], apple: ["consumer electronics", "product"],
  binance: ["crypto", "fintech"], bmw: ["automotive", "luxury"], "bmw-m": ["automotive", "performance"], bugatti: ["automotive", "luxury"], cal: ["saas", "scheduling", "booking"],
  claude: ["ai", "software"], clay: ["saas", "sales"], clickhouse: ["developer tools", "database"], cohere: ["ai", "developer tools"], coinbase: ["crypto", "fintech"],
  composio: ["developer tools", "ai"], cursor: ["developer tools", "ai"], "dell-1996": ["retro", "computing"], dji: ["consumer electronics", "drones", "photography"], elevenlabs: ["ai", "audio", "voice"],
  expo: ["developer tools", "mobile"], ferrari: ["automotive", "luxury", "sport"], figma: ["design tools", "saas"], framer: ["design tools", "website builder"], hashicorp: ["developer tools", "infrastructure"],
  hp: ["consumer electronics", "computing"], ibm: ["enterprise", "technology"], intercom: ["saas", "customer support"], jobright: ["jobs", "ai"], kraken: ["crypto", "fintech"],
  lamborghini: ["automotive", "luxury"], "linear.app": ["saas", "developer tools", "productivity"], lovable: ["ai", "website builder"], mastercard: ["fintech", "payments"], mercury: ["fintech", "banking"],
  meta: ["technology", "social"], minimax: ["ai"], mintlify: ["developer tools", "documentation"], miro: ["saas", "collaboration"], "mistral.ai": ["ai"],
  mongodb: ["developer tools", "database"], mydealz: ["deals", "community", "e-commerce"], nerdwallet: ["fintech", "personal finance"], nike: ["sport", "fashion", "fitness", "e-commerce"], "nintendo-2001": ["gaming", "retro"],
  notion: ["saas", "productivity"], nvidia: ["technology", "gaming", "ai"], ollama: ["developer tools", "ai"], "opencode.ai": ["developer tools", "ai"], oracle: ["enterprise", "technology"],
  oura: ["wellness", "health", "wearables"], pinterest: ["social", "inspiration"], playstation: ["gaming", "entertainment"], posthog: ["developer tools", "analytics"], raycast: ["developer tools", "productivity"],
  renault: ["automotive"], replicate: ["ai", "developer tools"], resend: ["developer tools", "email"], revolut: ["fintech", "banking"], runwayml: ["ai", "video", "creative tools"],
  sanity: ["developer tools", "cms"], sap: ["enterprise", "software"], sentry: ["developer tools", "monitoring"], shopify: ["e-commerce", "commerce platform"], slack: ["saas", "collaboration"],
  spacex: ["aerospace", "technology"], spotify: ["music", "audio", "streaming"], starbucks: ["coffee", "food", "retail"], stripe: ["fintech", "payments", "developer tools"], supabase: ["developer tools", "database"],
  superhuman: ["saas", "email", "productivity"], tesla: ["automotive", "energy"], theverge: ["news", "media", "technology"], "together.ai": ["ai", "developer tools"], uber: ["mobility", "marketplace"],
  vercel: ["developer tools", "hosting"], vodafone: ["telecom"], voltagent: ["developer tools", "ai"], warp: ["developer tools", "terminal"], webflow: ["website builder", "design tools"],
  wired: ["news", "media", "magazine"], wise: ["fintech", "payments"], "x.ai": ["ai"], zapier: ["saas", "automation"],
}

/** Style words found in an analysis' own description, mapped to the library's vocabulary. */
const STYLE_WORDS = [
  [/editorial/i, "modern editorial"], [/swiss|grid-?based|rational/i, "swiss neo-modernist"], [/brutal/i, "contemporary brutalism"], [/luxur|premium|prestige/i, "quiet luxury"],
  [/cinema|cinematic|film/i, "cinematic narrative"], [/monochrom|black[- ]and[- ]white/i, "art-directed monochrome"], [/dark|black canvas|night/i, "dark immersive"], [/warm|paper|cream|earth/i, "warm minimal"],
  [/photograph/i, "photography-led"], [/technical|engineer|developer|terminal|code/i, "technical industrial"], [/playful|friendly|whimsical|fun/i, "playful modernism"], [/bento/i, "contemporary bento"],
  [/retro|nostalg|y2k|1990s|2001|1996/i, "subtle retro-futurism"], [/serif/i, "serif display"], [/grotesk|grotesque|sans/i, "grotesk"], [/gradient/i, "gradient"], [/minimal|restrain|quiet|calm/i, "minimal"],
  [/bold|loud|high-contrast|high contrast/i, "bold-type"], [/magazine|news/i, "digital magazine"], [/data|dashboard|metric/i, "data-as-design"], [/sport|athlet|performance/i, "high-performance sports"],
]

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  return m ? m[1] : ""
}
function yamlScalar(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  if (!m) return ""
  const v = m[1].trim()
  /* A block scalar ("|" or ">"): the indented lines under the key. */
  if (/^[|>][-+]?$/.test(v)) return yamlBlock(fm, key).map((l) => l.trim()).join(" ").trim()
  return v.replace(/^["']|["']$/g, "")
}
function yamlBlock(fm, key) {
  const lines = fm.split("\n")
  const start = lines.findIndex((l) => l === `${key}:` || new RegExp(`^${key}:\\s*[|>][-+]?\\s*$`).test(l))
  if (start < 0) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break
    out.push(lines[i])
  }
  return out
}
function colorsOf(fm) {
  const out = []
  for (const l of yamlBlock(fm, "colors")) {
    const m = l.match(/^\s{2}([a-z0-9-]+):\s*["']?(#[0-9a-fA-F]{6})["']?/)
    if (m) out.push({ role: m[1], hex: m[2].toLowerCase() })
  }
  return out
}
function familyOf(fm, names) {
  const block = yamlBlock(fm, "typography")
  for (const n of names) {
    const i = block.findIndex((l) => l.trim() === `${n}:`)
    if (i < 0) continue
    for (let j = i + 1; j < Math.min(block.length, i + 8); j++) {
      const m = block[j].match(/fontFamily:\s*["']?([^"'\n]+)["']?/)
      if (m) return m[1].trim()
    }
  }
  return ""
}
function section(body, heading) {
  const re = new RegExp(`^#{2,4}\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=^#{2,4}\\s|$(?![\\s\\S]))`, "mi")
  const m = body.match(re)
  return m ? m[1].trim() : ""
}
function bullets(text, n) {
  return text
    .split("\n")
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => clip(l.replace(/^\s*[-*]\s+/, ""), 220))
    .filter((l) => l.length > 12)
    .slice(0, n)
}
function firstParagraph(text) {
  return (text.split(/\n\s*\n/).find((p) => p.trim() && !/^[#|>-]/.test(p.trim())) ?? "").trim()
}

function designMdRecords() {
  const dir = find("awesome-design-md")
  const commit = commitOf(dir)
  const lic = licenceOf(dir)
  const base = join(dir, "design-md")
  const out = []
  for (const slug of readdirSync(base).sort()) {
    const file = join(base, slug, "DESIGN.md")
    if (!existsSync(file)) continue
    const text = readFileSync(file, "utf8").slice(0, 200_000)
    const fm = frontMatter(text)
    const body = text.slice(fm.length + 8)
    const rawName = yamlScalar(fm, "name")
      .replace(/[-\s]*(design[-\s]*)?analysis$/i, "")
      .replace(/[-\s]*inspired$/i, "")
      .replace(/\s*\(\d{4}\)/, "")
      .replace(/-/g, " ")
      .trim()
    const subject = rawName || slug
    const desc = clean(yamlScalar(fm, "description"))
    const colors = colorsOf(fm)
    if (!desc || !colors.length) continue
    /* The brand's name never reaches the summary the agent reads: "the source" stands in for it. */
    /* Every way the corpus writes the name: "Nintendo 2001", "Nintendo", "Nintendo.com", "Linear". */
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    /* The full name in any case; its parts and the folder name only Capitalised, so "Wise" goes and "wise" stays. */
    const cap = (a) => a.charAt(0).toUpperCase() + a.slice(1)
    const exact = [...new Set([subject, slug, slug.replace(/[-.]/g, " ")])].filter((a) => a.length >= 2).sort((a, b) => b.length - a.length)
    const parts = [...new Set([...subject.split(/\s+/), ...slug.split(/[-.]/)].filter((a) => a.length >= 2 && !/^\d+$/.test(a) && !/^(ai|app|com|m)$/i.test(a)).map(cap))]
    const suffix = "(?:\\.(?:com|ai|app|io|dev|co))?('s)?\\b"
    const fullRe = new RegExp(`\\b(?:${exact.map(esc).join("|")})${suffix}`, "gi")
    const partRe = parts.length ? new RegExp(`\\b(?:${parts.map(esc).join("|")})${suffix}`, "g") : null
    const swap = (_m, poss) => (poss ? "the source's" : "the source")
    const anon = (s) => {
      let t = s.replace(fullRe, swap)
      if (partRe) t = t.replace(partRe, swap)
      for (const [re, to] of OWNERS) t = t.replace(re, to)
      return t
        .replace(/\bthe the source/gi, "the source")
        .replace(/the source(?:'s)? (?:the source)/gi, "the source")
        .replace(/(^|[.!?]\s+)the source/g, (_m, p) => `${p}The source`)
    }
    /* A face named after the brand ("Acme Sans") is the brand's own: say so without the name. */
    const face = (f) => (anon(f) !== f ? "a proprietary brand face" : f)
    const describe = anon(desc).replace(/^An? (analysis|study) of the source's [^,:]*?design language[,:]?\s*/i, "").replace(/^An? inspired interpretation of [^,:]*?(design language|visual (language|system)|design system)[,:]?\s*/i, "").replace(/^./, (c) => c.toUpperCase())
    const pick = (re) => colors.find((c) => re.test(c.role))
    const bg = pick(/^(canvas|background|bg|surface|page|base)$/) ?? pick(/canvas|background|surface/)
    const ink = pick(/^(ink|text|foreground|on-canvas|body)$/) ?? pick(/ink|text|foreground/)
    const primary = pick(/^(primary|brand|accent)$/) ?? pick(/primary|brand|accent/)
    const palette = [bg && { role: "background", hex: bg.hex }, ink && { role: "text", hex: ink.hex }, primary && { role: "accent", hex: primary.hex }, ...colors.filter((c) => c !== bg && c !== ink && c !== primary).slice(0, 3)].filter(Boolean)
    const mode = bg ? (luminance(bg.hex) < 0.2 ? "dark" : "light") : "unknown"
    const display = familyOf(fm, ["display", "display-1", "display-xl", "hero", "heading-1", "h1", "headline"])
    const bodyFace = familyOf(fm, ["body", "body-md", "body-1", "paragraph", "text"])
    const overview = anon(firstParagraph(section(body, "Overview")))
    const principles = bullets(anon(section(body, "Principles")), 3)
    const dos = bullets(anon(section(body, "Do(?!n)")), 4)
    const donts = bullets(anon(section(body, "Don")), 4)
    const whitespace = anon(firstParagraph(section(body, "Whitespace Philosophy")))
    const hay = `${desc} ${overview}`
    const styleTags = [...new Set(STYLE_WORDS.filter(([re]) => re.test(hay)).map(([, t]) => t))].slice(0, 8)
    let title = clip(describe.split(/[,.;:]/)[0] || describe, 110).replace(/\.$/, "")
    if ((title.match(/\(/g) ?? []).length > (title.match(/\)/g) ?? []).length) title = title.slice(0, title.lastIndexOf("(")).trim()
    if (title.length < 24 || /^(the source|an? inspired)/i.test(title) || /"$/.test(title)) {
      const ctx = (CONTEXT[slug] ?? []).slice(0, 2).join(" and ")
      title = `Design system for ${ctx || "a brand"}${styleTags.length ? `: ${styleTags.slice(0, 2).join(", ")}` : ""}`
    }
    out.push({
      id: `ref_dmd-${kebab(slug)}`,
      version: 1,
      kind: "system",
      title: title.length >= 12 ? title : `Design system analysis ${slug}`,
      summary: clip(`${describe} ${overview}`, 600),
      styleTags: styleTags.length ? styleTags : ["design system"],
      industries: CONTEXT[slug] ?? [],
      tone: [],
      density: "unknown",
      palette: { mode, colors: palette.slice(0, 6), strategy: clip(dos.find((d) => /colou?r|primary|accent|background/i.test(d)) ?? "", 300) },
      type: {
        display: display ? `${face(display)} (the source's face; choose a licensed face with the same character)` : "",
        body: bodyFace ? `${face(bodyFace)} (choose a licensed equivalent)` : "",
        strategy: clip(principles[0] ?? "", 300),
      },
      layout: { topology: "", hero: "", grid: "", rhythm: clip(whitespace, 280) },
      imagery: "",
      motion: { character: "", evidence: "unknown", ideas: [] },
      details: principles.slice(1, 3),
      borrow: dos.length ? dos : principles.slice(0, 3).length ? principles.slice(0, 3) : [clip(describe, 220)],
      avoid: [
        "Never reproduce this brand: no logo, wordmark, imagery, exact palette with its type pairing, or page layout. Take principles only.",
        "Its fonts may be proprietary: pick a face that loads on Storelib with a similar character.",
        ...donts.slice(0, 4),
      ].slice(0, 8),
      fitsPoorly: [],
      roles: ["identity"],
      source: { origin: "vendored", url: `https://github.com/voltagent/awesome-design-md/tree/${commit}/design-md/${slug}`, subject, creator: "VoltAgent awesome-design-md contributors", capturedAt: null },
      rights: {
        usage: "analysis_only",
        licence: lic.spdx,
        mayRedistribute: true,
        notice: `Text from awesome-design-md, MIT License, Copyright (c) ${lic.holder ?? "VoltAgent"}. A token analysis of a public website; the brand, its name and identity belong to its owner.`,
        permissionEvidence: null,
      },
      provenance: { addedBy: "build-script", addedAt: TODAY, repo: "voltagent/awesome-design-md", commit, path: `design-md/${slug}/DESIGN.md`, analysisModel: null, verifiedByHuman: false },
      quality: dos.length >= 3 ? 3 : 2,
      image: null,
      enabled: true,
    })
  }
  return out
}

/* ── ui-ux-pro-max styles.csv ─────────────────────────────────────────── */

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  const [head, ...rest] = rows
  return rest.filter((r) => r.length >= head.length - 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])))
}

/** App-only, dashboard-only and other companies' named design systems are not website directions. */
const SKIP_STYLE = /dashboard|analytics|monitoring|mobile|polaris|spectrum|fluent|apple|material|heat ?map|visionos|voice|zero interface|predictive/i

function uiuxRecords() {
  const dir = find("ui-ux-pro-max-skill")
  const commit = commitOf(dir)
  const lic = licenceOf(dir)
  const rel = "src/ui-ux-pro-max/data/styles.csv"
  const rows = parseCsv(readFileSync(join(dir, rel), "utf8"))
  const split = (s, n) => clean(s).split(/\s*,\s*/).map((x) => x.toLowerCase().replace(/[^a-z0-9&/ +-]/g, "").trim()).filter((x) => x && x.length <= 50).slice(0, n)
  return rows
    .filter((r) => r.Status === "active" && !SKIP_STYLE.test(r["Style Category"]))
    .map((r) => {
      const name = clean(r["Style Category"]).replace(/\s*\([^)]*\)/g, "")
      const risk = /risk:high/.test(r.Accessibility) ? "high" : /risk:medium/.test(r.Accessibility) ? "medium" : "low"
      return {
        id: `ref_uiux-${kebab(name)}`,
        version: 1,
        kind: "style",
        title: `${name} (style vocabulary)`,
        summary: clip(`${name}: ${r.Keywords}. Best for ${r["Best For"]}. Origin: ${r["Era/Origin"] || "contemporary"}.`, 500),
        styleTags: [kebab(name).replace(/-/g, " "), ...split(r.Keywords, 7)].slice(0, 8),
        industries: split(r["Best For"], 8),
        tone: [],
        density: "unknown",
        palette: { mode: /dark/i.test(name) ? "dark" : "unknown", colors: [], strategy: clip(`${r["Primary Colors"]}. ${r["Secondary Colors"]}`, 300) },
        type: { display: "", body: "", strategy: "" },
        layout: { topology: "", hero: "", grid: "", rhythm: "" },
        imagery: "",
        motion: { character: clip(r["Effects & Animation"], 300), evidence: "suggested", ideas: [] },
        details: [],
        borrow: [clip(`Use for: ${r["Best For"]}`, 300)],
        avoid: [
          clip(`Do not use for: ${r["Do Not Use For"] || "contexts it does not suit"}`, 300),
          `Accessibility risk ${risk}: keep text contrast at 4.5:1, visible focus and a reduced motion version.`,
          "Do not paste its example hex values: build the palette from the brand and the slop rules.",
        ],
        fitsPoorly: split(r["Do Not Use For"], 8),
        roles: ["identity"],
        source: { origin: "vendored", url: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/${commit}/${rel}`, subject: null, creator: "Next Level Builder", capturedAt: null },
        rights: { usage: "reusable", licence: lic.spdx, mayRedistribute: true, notice: `From ui-ux-pro-max-skill, MIT License, Copyright (c) ${lic.holder ?? "Next Level Builder"}.`, permissionEvidence: null },
        provenance: { addedBy: "build-script", addedAt: TODAY, repo: "nextlevelbuilder/ui-ux-pro-max-skill", commit, path: `${rel}#${kebab(name)}`, analysisModel: null, verifiedByHuman: false },
        quality: 2,
        image: null,
        enabled: true,
      }
    })
}

const records = [...designMdRecords(), ...uiuxRecords()]
const ids = new Set()
for (const r of records) {
  if (ids.has(r.id)) throw new Error(`duplicate id ${r.id}`)
  ids.add(r.id)
}
const header = `/* Generated by scripts/build-design-references.mjs on ${TODAY} from local clones of voltagent/awesome-design-md and nextlevelbuilder/ui-ux-pro-max-skill (both MIT; notices in ./vendor/NOTICE.md). Do not edit by hand. */\nimport type { DesignReference } from "./types"\n\n`
writeFileSync(OUT, `${header}export const VENDORED_REFERENCES: DesignReference[] = ${JSON.stringify(records, null, 1)}\n`)
console.log(`wrote ${records.length} records (${records.filter((r) => r.kind === "system").length} systems, ${records.filter((r) => r.kind === "style").length} styles)`)
