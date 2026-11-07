import sanitizeHtml from "sanitize-html"
import { decodeEntities } from "@/lib/storelib-theme/values"
import { publicUrlProblem } from "@/lib/api/public-fetch"
export interface LinkMetadata {
  title: string
  description: string
  image: string | null
  /** The site's own icon, for a card with no picture. */
  favicon: string | null
  url: string
}
const clean = (value: string, max: number) =>
  decodeEntities(
    sanitizeHtml(decodeEntities(value), {
      allowedTags: [],
      allowedAttributes: {},
    }),
  )
    .replace(/[\u0000-\u001f]+/g, " ")
    .trim()
    .slice(0, max)
/** A picture address a visitor's browser may load: absolute, public in shape, http or https, upgraded to https on a https page. */
function pictureUrl(raw: string | undefined, base: string): string | null {
  if (!raw) return null
  try {
    const candidate = new URL(decodeEntities(raw).trim(), base)
    if (candidate.protocol === "http:" && new URL(base).protocol === "https:") candidate.protocol = "https:"
    if (candidate.href.length > 2048 || publicUrlProblem(candidate.href)) return null
    return candidate.href
  } catch {
    return null
  }
}
/** HTML is parsed as data. No scripts, iframe HTML or remote markup reaches a page. */
export function parseLinkMetadata(html: string, address: string): LinkMetadata {
  const meta = new Map<string, string>()
  const icons: { rel: string; href: string }[] = []
  /* The head is where these live; a page's body is not read past it. */
  const head = html.length > 262_144 ? html.slice(0, 262_144) : html
  sanitizeHtml(head, {
    allowedTags: [],
    allowedAttributes: {},
    transformTags: {
      meta: (tag, attrs) => {
        const key = (attrs.property || attrs.name || "").toLowerCase()
        if (key && !meta.has(key)) meta.set(key, attrs.content || "")
        return { tagName: tag, attribs: {} }
      },
      link: (tag, attrs) => {
        const rel = (attrs.rel || "").toLowerCase()
        if (attrs.href && /(^|\s)(icon|apple-touch-icon)(\s|$)/.test(rel)) icons.push({ rel, href: attrs.href })
        return { tagName: tag, attribs: {} }
      },
    },
  })
  const title = clean(
    meta.get("og:title") ||
      meta.get("twitter:title") ||
      head.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ||
      new URL(address).hostname,
    200,
  )
  const description = clean(
    meta.get("og:description") ||
      meta.get("twitter:description") ||
      meta.get("description") ||
      "",
    600,
  )
  const image = pictureUrl(meta.get("og:image:secure_url") || meta.get("og:image") || meta.get("twitter:image"), address)
  const icon = icons.find((i) => i.rel.includes("apple-touch-icon")) || icons[0]
  const favicon = pictureUrl(icon?.href, address) || pictureUrl("/favicon.ico", address)
  return { title, description, image, favicon, url: address }
}
