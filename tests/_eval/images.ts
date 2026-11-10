/**
 * Round R (R4): pictures for the scripted runs.
 *
 * No image provider has a key here, so the agent's picture service (P1's
 * ImageService port) and the native engine's photo search answer from this
 * file: every picture asked for gets a stable https address on an eval host,
 * and the browser checks are answered for that host with a picture drawn
 * here (an abstract composition in the scenario's own palette, sized to the
 * aspect asked for). SAID PLAINLY in the report: these are stand-ins, so the
 * screenshots show where and how big the pictures are, not what a real
 * photograph would look like.
 */
import sharp from "sharp"
import type { ImageService } from "@/lib/ai-builder/agent/ports"
import type { OpenverseImage } from "@/lib/website-builder/ai-site/images"

export const EVAL_MEDIA_HOST = "media.eval.storelib.test"

const SIZES: Record<string, [number, number]> = { landscape: [1800, 1200], portrait: [1200, 1800], square: [1400, 1400] }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)

/** What a picture address carries: scenario, shape, a number and what it shows. */
export function evalImageUrl(scenario: string, aspect: string, n: number, what: string): string {
  const [w, h] = SIZES[aspect] ?? SIZES.landscape
  return `https://${EVAL_MEDIA_HOST}/${scenario}/${n}-${slug(what)}-${w}x${h}.jpg`
}

/** The agent's picture service: stock "found" for every query, nothing spent. */
export function evalImageService(scenario: string): ImageService & { made: { url: string; query: string }[] } {
  const made: { url: string; query: string }[] = []
  const answer = (query: string, aspect: string | undefined, alt: string | undefined) => {
    const url = evalImageUrl(scenario, aspect ?? "landscape", made.length + 1, query)
    made.push({ url, query })
    const [width, height] = SIZES[aspect ?? "landscape"] ?? SIZES.landscape
    return { ok: true as const, url, width, height, alt: alt ?? query.slice(0, 120), mediaId: `eval-${scenario}-${made.length}`, path: url, usd: 0, provider: "pexels" as const, source: "stock" as const }
  }
  return {
    made,
    available: async () => ({ generate: null, stock: true }),
    generate: async (input) => answer(input.prompt, input.aspect, input.alt) as never,
    find: async (input) => answer(input.query, input.aspect, input.alt) as never,
    ceiling: () => 0,
  }
}

/** The native engine's photo search (Openverse's shape), answering on the eval host. */
export function evalOpenverse(scenario: string): (query: string) => Promise<OpenverseImage[]> {
  let n = 0
  return async (query) =>
    ["landscape", "portrait", "square", "landscape", "portrait", "square"].map((aspect) => {
      const [width, height] = SIZES[aspect]
      const url = evalImageUrl(scenario, aspect, ++n, query)
      return { id: `${scenario}-${n}`, title: query, url, width, height, creator: "Eval stand-in", license: "cc0", license_version: "1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", foreign_landing_url: `https://${EVAL_MEDIA_HOST}/credits/${n}`, filetype: "jpg" }
    })
}

const PALETTES: Record<string, string[]> = {}
/** The colours a scenario's stand-in pictures are drawn in. */
export function setPicturePalette(scenario: string, colours: string[]): void {
  PALETTES[scenario] = colours
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A stand-in picture for an eval address: soft shapes in the scenario's palette. Null for any other address. */
export async function evalImageBytes(url: string): Promise<Buffer | null> {
  const m = new RegExp(`^https://${EVAL_MEDIA_HOST.replace(/\./g, "\\.")}/([a-z]+)/[^?#]*?-(\\d+)x(\\d+)\\.jpg`).exec(url)
  if (!m) return null
  const [, scenario, ws, hs] = m
  const w = Math.min(Number(ws), 2400)
  const h = Math.min(Number(hs), 2400)
  const colours = PALETTES[scenario] ?? ["#cfcfcf", "#8a8a8a", "#3a3a3a"]
  const seed = hash(url)
  const pick = (i: number) => colours[(seed >> (i * 3)) % colours.length]
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const r = ((seed >> (i * 5)) % 40) / 100 + 0.25
    const cx = ((seed >> (i * 7)) % 100) / 100
    const cy = ((seed >> (i * 4 + 2)) % 100) / 100
    return `<circle cx="${Math.round(cx * w)}" cy="${Math.round(cy * h)}" r="${Math.round(r * Math.max(w, h))}" fill="${pick(i + 1)}" fill-opacity="0.55"/>`
  }).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pick(0)}"/><stop offset="1" stop-color="${pick(4)}"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="${Math.round(Math.max(w, h) / 14)}"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${shapes}</g></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 72 }).toBuffer()
}
