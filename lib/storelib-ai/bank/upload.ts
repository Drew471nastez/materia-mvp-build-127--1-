/**
 * ===========================================================================
 *  A THEME UPLOADED STRAIGHT INTO THE AI SOURCE BANK (round BB)
 * ===========================================================================
 * The admin drops a zip, an HTML page, a stylesheet, a script, a Shopify or
 * Storelib theme folder at /admin/ai-bank. The browser unpacks a zip and
 * sends the text files (pictures and fonts are left behind: the AI never
 * copies them). This file turns what arrived into a bank entry of kind
 * "reference": its files are worked examples the agent reads before it
 * writes a site, best first, and how they move (keyframes, transitions,
 * scroll reveals, the scripts that drive them) is pulled out on its own so
 * the animations survive into the new site.
 *
 * Pure and browser safe: the admin page uses the same limits to choose what
 * to send.
 */
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types"
import type { BusinessKind } from "@/lib/storelib-ai/direction/brief"
import type { BankProfile } from "./snapshot"

/** The request body stays under the host's 4.5MB limit. */
export const UPLOAD_MAX_CHARS = 3_600_000
export const UPLOAD_MAX_FILES = 400
/** One file longer than this is cut (a minified bundle is not an example). */
export const UPLOAD_FILE_CHARS = 200_000

const TEXT_FILE = /\.(html?|css|scss|sass|less|js|mjs|jsx|ts|tsx|vue|svelte|astro|liquid|storelib|json|md|txt|svg|xml)$/i
const SKIP = /(^|\/)(node_modules|\.git|\.next|dist\/assets\/vendor|vendor|__MACOSX)\/|(^|\/)\.|\.min\.(js|css)$|(^|\/)(package-lock|pnpm-lock|yarn\.lock)|locales?\//i

export interface UploadedFile {
  path: string
  text: string
}

/** Whether a file is worth sending: text the agent can read, not a lockfile, a vendored library or a dotfile. */
export function isUploadable(path: string): boolean {
  const p = path.replace(/\\/g, "/")
  return TEXT_FILE.test(p) && !SKIP.test(p)
}

/** How much a file shows of how a site is built: pages and sections first, then how it moves, then the rest. */
export function uploadRank(path: string, text: string): number {
  const p = path.toLowerCase()
  let r = 50
  if (/(^|\/)index\.html?$/.test(p)) r = 0
  else if (/\.html?$/.test(p)) r = 5
  else if (/sections?\/.+\.(liquid|storelib)$/.test(p)) r = 8
  else if (/templates?\/.+\.(liquid|json)$/.test(p)) r = 20
  else if (/\.(jsx|tsx|vue|svelte|astro)$/.test(p)) r = 10
  else if (/\.(css|scss|sass|less)$/.test(p)) r = 15
  else if (/\.(m?js|ts)$/.test(p)) r = 18
  else if (/\.(md|txt)$/.test(p)) r = 30
  else if (/\.(svg|xml|json)$/.test(p)) r = 60
  if (/hero|banner|slideshow|main[-_]product|product|header|nav|menu|drawer|cart/.test(p)) r -= 3
  if (motionScore(text) > 0) r -= 4
  return r
}

/** How much a file moves: keyframes, transitions, scroll reveals, motion libraries. */
export function motionScore(text: string): number {
  const hits = [
    /@keyframes/gi, /\banimation(-name)?\s*:/gi, /\btransition\s*:/gi, /IntersectionObserver/g, /requestAnimationFrame/g,
    /\bgsap\b|ScrollTrigger|framer-motion|motion\.div|lenis|locomotive|swiper|splide|AOS\.init|data-aos/gi,
    /animation-timeline|view-timeline|scroll-timeline/gi, /\.animate\(/g, /prefers-reduced-motion/gi,
  ]
  return hits.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0)
}

/**
 * The files to send, best first, within the limits. `files` may be anything the browser read; what is not
 * uploadable is left out, and a file too long is cut.
 */
export function chooseUploadFiles(files: readonly UploadedFile[]): { files: UploadedFile[]; left: number } {
  const usable = files
    .map((f) => ({ path: f.path.replace(/\\/g, "/").replace(/^\/+/, ""), text: f.text }))
    .filter((f) => isUploadable(f.path) && f.text.trim())
    .map((f) => ({ ...f, text: f.text.length > UPLOAD_FILE_CHARS ? f.text.slice(0, UPLOAD_FILE_CHARS) : f.text }))
    .sort((a, b) => uploadRank(a.path, a.text) - uploadRank(b.path, b.text) || a.path.localeCompare(b.path))
  const out: UploadedFile[] = []
  let total = 0
  for (const f of usable) {
    if (out.length >= UPLOAD_MAX_FILES || total + f.text.length + f.path.length > UPLOAD_MAX_CHARS) continue
    out.push(f)
    total += f.text.length + f.path.length
  }
  return { files: out, left: usable.length - out.length }
}

/* ── how the theme moves, pulled out on its own ────────────────────────── */

function blocksAfter(text: string, start: RegExp, max: number): string[] {
  const out: string[] = []
  const re = new RegExp(start.source, start.flags.includes("g") ? start.flags : `${start.flags}g`)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && out.length < max) {
    const open = text.indexOf("{", m.index)
    if (open < 0) break
    let depth = 0
    let end = open
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++
      else if (text[end] === "}" && --depth === 0) break
    }
    out.push(text.slice(m.index, end + 1))
    re.lastIndex = end + 1
  }
  return out
}

/** The theme's motion: its keyframes, the rules that run them, and the script lines that start them. */
export function motionOf(files: Record<string, string>, budget = 4_000): string {
  const parts: string[] = []
  const seen = new Set<string>()
  const add = (s: string) => {
    const t = s.trim().replace(/\s+\n/g, "\n")
    if (!t || seen.has(t) || t.length > 1_400) return
    seen.add(t)
    parts.push(t)
  }
  for (const text of Object.values(files)) {
    for (const k of blocksAfter(text, /@keyframes\s+[\w-]+/g, 8)) add(k)
    for (const r of text.match(/[^{}\n]{1,140}\{[^{}]*\b(animation|transition|animation-timeline)\s*:[^{}]*\}/g) ?? []) add(r)
    for (const r of blocksAfter(text, /@media\s*\(prefers-reduced-motion[^)]*\)/g, 1)) add(r)
    for (const line of text.split("\n")) if (/IntersectionObserver|ScrollTrigger|gsap\.(to|from|timeline)|\.animate\(|requestAnimationFrame/.test(line) && line.length < 240) add(line)
    if (parts.join("\n").length > budget) break
  }
  const out = parts.join("\n")
  return out.length > budget ? out.slice(0, budget) : out
}

/* ── the bank entry ────────────────────────────────────────────────────── */

const WORD = /[a-z][a-z-]{3,24}/g
const STOP = new Set(["this", "that", "with", "from", "your", "have", "will", "class", "div", "span", "section", "style", "script", "function", "return", "const", "true", "false", "null", "width", "height", "color", "display", "none", "flex", "grid", "block", "auto", "important", "button", "image", "content", "data", "href", "html", "head", "body", "main", "page", "text", "items", "item", "font", "size", "margin", "padding", "border", "background", "position", "absolute", "relative", "transform", "transition", "animation", "opacity", "settings", "type", "label", "default", "schema", "liquid", "endif", "endfor", "else", "assign", "render", "include"])

/** Words a theme's visible copy and names use, for matching it to a brief (the admin can add their own). */
function keywordsOf(name: string, files: Record<string, string>): string[] {
  const counts = new Map<string, number>()
  const visible = Object.entries(files)
    .filter(([p]) => /\.(html?|liquid|storelib|md|txt|jsx|tsx|vue|svelte|astro)$/i.test(p))
    .map(([, t]) => t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\{[%{][\s\S]*?[%}]\}/g, " "))
    .join(" ")
    .toLowerCase()
    .slice(0, 400_000)
  for (const w of `${name.toLowerCase()} ${visible}`.match(WORD) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w)
}

/** A short id from the upload's name and contents, in the bank's shape (bank-bk + up to 8). */
export function uploadPrefix(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return `bk${(h >>> 0).toString(36).slice(0, 7).padStart(7, "0").replace(/[^0-9a-z]/g, "0")}u`
}

/** The theme as a bank entry: a reference whose files are worked examples, its motion pulled out. */
export function uploadSnapshot(nameIn: string, uploaded: readonly UploadedFile[], seed = ""): { template: SiteTemplate; profile: BankProfile } | null {
  const chosen = chooseUploadFiles(uploaded).files
  if (!chosen.length) return null
  const name = nameIn.trim().slice(0, 60) || chosen[0].path.split("/")[0] || "Uploaded theme"
  const files: Record<string, string> = {}
  for (const f of chosen) files[f.path] = f.text
  const prefix = uploadPrefix(`${name}\n${seed}\n${chosen.map((f) => `${f.path}:${f.text.length}`).join("\n")}`)
  const examples = chosen.filter((f) => !/\.(json|svg|xml|md|txt)$/i.test(f.path)).slice(0, 8).map((f) => f.path)
  const motion = motionOf(files)
  if (motion) files["__motion.css"] = motion
  const keywords = keywordsOf(name, files)
  const template: SiteTemplate = {
    id: `bank-${prefix}`,
    name,
    summary: `${name}: a theme the Storelib admin uploaded as a design reference.`,
    industries: ["general"] as BusinessKind[],
    stories: [],
    styles: [],
    directionIds: [],
    keywords,
    motion: motion ? "expressive" : "balanced",
    prefix,
    files,
    pages: [],
    tokens: {} as SiteTemplate["tokens"],
    menus: {},
    imageSlots: [],
    bindings: [],
    design: {
      thesis: `${name}, uploaded by the admin: read for its composition, its components and how it moves.`,
      layout: [],
      imagery: "The business's own pictures, nothing of the theme's.",
      motion: motion ? "As the theme moves: its keyframes, transitions and reveals, rewritten in Storelib's syntax." : "Quiet.",
      signature: [],
      avoid: ["the theme's words, pictures or brand"],
    },
    source: { kind: "bank", installId: "", name },
  }
  return {
    template,
    profile: {
      kind: "reference",
      features: [],
      industries: ["general"] as BusinessKind[],
      keywords,
      sections: [],
      counts: { pages: 0, sections: 0, files: chosen.length, imageSlots: 0, bindings: 0, removed: 0 },
      examples: motion ? ["__motion.css", ...examples] : examples,
    },
  }
}
