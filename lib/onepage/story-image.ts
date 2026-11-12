/**
 * ===========================================================================
 *  A OnePage AS AN INSTAGRAM STORY (round 3)
 * ===========================================================================
 * The owner: "replace Facebook with Share to Instagram Story: generate a
 * story image of the OnePage card (avatar, name, handle, theme look) with the
 * link shown".
 *
 * A 1080 x 1920 PNG drawn on a canvas in the visitor's browser: the page's
 * own ground (its colour or gradient, as the share sheet's band), the
 * creator's photo in a ring, their name, their handle, and the address on a
 * pill. Nothing is uploaded anywhere.
 *
 * How it reaches Instagram (shareStoryImage):
 *   a phone that can share files (navigator.canShare with a file): the
 *       system share sheet with the picture, where Instagram's Stories is one
 *       of the targets when the app is installed
 *   anything else: the picture is downloaded, the address is copied, and the
 *       caller shows one line on adding it with a link sticker
 *
 * Instagram has no web address that opens its story composer with a picture
 * from a website (its "instagram-stories://share" scheme is for an app
 * registered with a Meta app id), so the share sheet is the official way in.
 *
 * The layout and the colour parsing are pure (storyLayout, parseCssPaint) and
 * tested in tests/onepage-social-r3.test.ts; the drawing needs a canvas.
 */

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920

export interface StoryInput {
  name: string
  /** "@slug", or empty. */
  handle: string
  /** The address as it reads, without https:// ("storelib.com/satori"). */
  address: string
  avatarSrc?: string | null
  /** The page's ground as CSS: a colour or a linear or radial gradient (components/onepage/share-sheet shareBandBackground). */
  ground: string
  /** The words on the ground: light on a dark ground, dark on a light one. */
  ink: "light" | "dark"
  /** The page's typeface, when it is loaded in the document. */
  fontFamily?: string | null
}

/* ─── The ground, from CSS ────────────────────────────────────────────── */

export type CssPaint =
  | { kind: "solid"; color: string }
  | { kind: "linear"; angle: number; stops: { color: string; at: number }[] }
  | { kind: "radial"; stops: { color: string; at: number }[] }

const COLOR = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|transparent)\b)/i

/** Split a gradient's arguments at the top level commas (rgb() has commas of its own). */
function splitArgs(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of inner) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** A colour, a linear-gradient() or a radial-gradient() as a canvas can paint it. Anything else is its first colour, or ink. */
export function parseCssPaint(css: string | null | undefined): CssPaint {
  const s = (css || "").trim()
  const m = /^(linear|radial)-gradient\((.*)\)\s*$/is.exec(s)
  if (m) {
    const args = splitArgs(m[2])
    let angle = 180
    if (m[1] === "linear" && args.length) {
      const a = /^(-?[\d.]+)deg$/i.exec(args[0])
      const to = /^to\s+(.+)$/i.exec(args[0])
      if (a) angle = Number(a[1])
      if (to) angle = ({ top: 0, right: 90, bottom: 180, left: 270, "top right": 45, "right top": 45, "bottom right": 135, "right bottom": 135, "bottom left": 225, "left bottom": 225, "top left": 315, "left top": 315 } as Record<string, number>)[to[1].toLowerCase()] ?? 180
      if (a || to) args.shift()
    }
    const colored = args.filter((x) => COLOR.test(x))
    const stops = colored.map((x, i) => {
      const color = COLOR.exec(x)![1]
      const pct = /(-?[\d.]+)%\s*$/.exec(x.replace(color, ""))
      return { color, at: pct ? Math.min(1, Math.max(0, Number(pct[1]) / 100)) : colored.length === 1 ? 0 : i / (colored.length - 1) }
    })
    if (stops.length >= 2) return m[1] === "linear" ? { kind: "linear", angle, stops } : { kind: "radial", stops }
    if (stops.length === 1) return { kind: "solid", color: stops[0].color }
  }
  const c = COLOR.exec(s)
  return { kind: "solid", color: c ? c[1] : s && !/gradient|url\(/i.test(s) ? s : "#1a1a2e" }
}

/* ─── The layout ──────────────────────────────────────────────────────── */

export interface StoryLayout {
  avatar: { cx: number; cy: number; r: number; ring: number }
  name: { y: number; size: number; maxWidth: number }
  handle: { y: number; size: number }
  pill: { x: number; y: number; w: number; h: number; text: number }
}

/**
 * Where everything sits. The block is centred a little above the middle, so
 * Instagram's own top bar and its reply field leave it clear, and the pill is
 * as wide as its address (at least 520px, at most the card's 900px).
 */
export function storyLayout(addressWidth: number): StoryLayout {
  const r = 170
  const cy = 700
  const pillText = 40
  const w = Math.max(520, Math.min(900, Math.round(addressWidth + 2 * 64 + 56)))
  return {
    avatar: { cx: STORY_WIDTH / 2, cy, r, ring: 14 },
    name: { y: cy + r + 140, size: 84, maxWidth: 900 },
    handle: { y: cy + r + 214, size: 44 },
    pill: { x: Math.round((STORY_WIDTH - w) / 2), y: cy + r + 300, w, h: 116, text: pillText },
  }
}

/** `text` cut with an ellipsis to fit `max` px. */
export function fitText(measure: (t: string) => number, text: string, max: number): string {
  if (measure(text) <= max) return text
  let t = text
  while (t.length > 1 && measure(`${t}…`) > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/* ─── Drawing ─────────────────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    const t = window.setTimeout(() => resolve(null), 6000)
    img.onload = () => (window.clearTimeout(t), resolve(img))
    img.onerror = () => (window.clearTimeout(t), resolve(null))
    img.src = src
  })
}

function paintGround(ctx: CanvasRenderingContext2D, paint: CssPaint) {
  const W = STORY_WIDTH
  const H = STORY_HEIGHT
  if (paint.kind === "solid") {
    ctx.fillStyle = paint.color
  } else if (paint.kind === "linear") {
    /* CSS angles: 0deg points up, clockwise. The line runs through the centre, long enough to reach the corners. */
    const a = (paint.angle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2
    const g = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half)
    for (const s of paint.stops) g.addColorStop(s.at, s.color)
    ctx.fillStyle = g
  } else {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2)
    for (const s of paint.stops) g.addColorStop(s.at, s.color)
    ctx.fillStyle = g
  }
  ctx.fillRect(0, 0, W, H)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The story picture as a PNG. Needs a document (a canvas and the page's fonts). */
export async function renderStoryImage(input: StoryInput): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = STORY_WIDTH
  canvas.height = STORY_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  const face = `${input.fontFamily ? `${input.fontFamily}, ` : ""}Inter, system-ui, -apple-system, "Segoe UI", sans-serif`
  try {
    await Promise.all([document.fonts?.load(`700 84px ${face}`), document.fonts?.load(`500 44px ${face}`)])
  } catch {
    /* The system face draws it. */
  }
  const img = input.avatarSrc ? await loadImage(input.avatarSrc) : null
  paintStory(ctx, input, face, img)
  /* A photo from a host that does not allow it taints the canvas, and a tainted canvas gives no PNG: then it is drawn again with the initial. */
  try {
    ctx.getImageData(0, 0, 1, 1)
  } catch {
    paintStory(ctx, input, face, null)
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"))
}

function paintStory(ctx: CanvasRenderingContext2D, input: StoryInput, face: string, img: HTMLImageElement | null) {
  const light = input.ink === "light"
  const words = light ? "#ffffff" : "#111113"
  const quiet = light ? "rgba(255,255,255,0.78)" : "rgba(17,17,19,0.66)"
  paintGround(ctx, parseCssPaint(input.ground))

  ctx.font = `600 40px ${face}`
  const L = storyLayout(ctx.measureText(input.address).width)

  /* The photo in its ring, with a soft shadow under it. */
  const { cx, cy, r, ring } = L.avatar
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.22)"
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.beginPath()
  ctx.arc(cx, cy, r + ring, 0, Math.PI * 2)
  ctx.fillStyle = light ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)"
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img && img.naturalWidth) {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = light ? "rgba(255,255,255,0.22)" : "rgba(17,17,19,0.08)"
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = words
    ctx.font = `700 150px ${face}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText((input.name.trim()[0] || "S").toUpperCase(), cx, cy + 6)
  }
  ctx.restore()

  /* The name and the handle. */
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = words
  ctx.font = `700 ${L.name.size}px ${face}`
  ctx.fillText(fitText((t) => ctx.measureText(t).width, input.name.trim() || input.address, L.name.maxWidth), STORY_WIDTH / 2, L.name.y)
  if (input.handle) {
    ctx.fillStyle = quiet
    ctx.font = `500 ${L.handle.size}px ${face}`
    ctx.fillText(fitText((t) => ctx.measureText(t).width, input.handle, L.name.maxWidth), STORY_WIDTH / 2, L.handle.y)
  }

  /* The address on its pill: white with ink on a dark ground, ink with white on a light one. */
  const p = L.pill
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.16)"
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  roundRect(ctx, p.x, p.y, p.w, p.h, p.h / 2)
  ctx.fillStyle = light ? "#ffffff" : "#111113"
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = light ? "#111113" : "#ffffff"
  ctx.font = `600 ${p.text}px ${face}`
  ctx.textBaseline = "middle"
  /* A small chain link before the address. */
  const label = fitText((t) => ctx.measureText(t).width, input.address, p.w - 2 * 64 - 56)
  const tw = ctx.measureText(label).width
  const start = STORY_WIDTH / 2 - (tw + 56) / 2
  drawLinkGlyph(ctx, start + 18, p.y + p.h / 2, light ? "#111113" : "#ffffff")
  ctx.textAlign = "left"
  ctx.fillText(label, start + 56, p.y + p.h / 2 + 2)
}

/** Lucide's link glyph, 40px, centred on (x, y). */
function drawLinkGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x - 20, y - 20)
  ctx.scale(40 / 24, 40 / 24)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.stroke(new Path2D("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"))
  ctx.stroke(new Path2D("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"))
  ctx.restore()
}

/* ─── Sending it ──────────────────────────────────────────────────────── */

/** A phone or a tablet, where the share sheet is how a picture reaches Instagram. A computer downloads it. */
export function prefersShareSheet(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(pointer: coarse)").matches === true && window.matchMedia?.("(hover: none)").matches === true
}

export type StoryOutcome = "shared" | "saved" | "cancelled"

/**
 * The picture to Instagram: through the share sheet where a phone can share
 * a file, else downloaded with the address copied for the link sticker.
 */
export async function shareStoryImage(image: Blob, { fileName, address }: { fileName: string; address: string }): Promise<StoryOutcome> {
  const file = new File([image], fileName, { type: "image/png" })
  if (prefersShareSheet() && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return "shared"
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled"
      /* NotAllowedError (the tap's permission ran out) and the rest: the download below. */
    }
  }
  const href = URL.createObjectURL(image)
  const a = document.createElement("a")
  a.href = href
  a.download = fileName
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000)
  try {
    await navigator.clipboard?.writeText(address.startsWith("http") ? address : `https://${address}`)
  } catch {
    /* The address is on the picture as well. */
  }
  return "saved"
}
