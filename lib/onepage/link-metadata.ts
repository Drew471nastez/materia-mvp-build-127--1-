import sanitizeHtml from "sanitize-html"
import { decodeEntities } from "@/lib/storelib-theme/values"
import { publicUrlProblem } from "@/lib/api/public-fetch"
export interface LinkMetadata {
  title: string
  description: string
  image: string | null
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
/** HTML is parsed as data. No scripts, iframe HTML or remote markup reaches a page. */
export function parseLinkMetadata(html: string, address: string): LinkMetadata {
  const meta = new Map<string, string>()
  sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    transformTags: {
      meta: (tag, attrs) => {
        const key = (attrs.property || attrs.name || "").toLowerCase()
        if (key && !meta.has(key)) meta.set(key, attrs.content || "")
        return { tagName: tag, attribs: {} }
      },
    },
  })
  const title = clean(
    meta.get("og:title") ||
      meta.get("twitter:title") ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ||
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
  let image: string | null = null
  try {
    const candidate = new URL(
      decodeEntities(
        meta.get("og:image:secure_url") ||
          meta.get("og:image") ||
          meta.get("twitter:image") ||
          "",
      ),
      address,
    )
    if (
      (meta.get("og:image:secure_url") ||
        meta.get("og:image") ||
        meta.get("twitter:image")) &&
      !publicUrlProblem(candidate.href)
    )
      image = candidate.href
  } catch {}
  return { title, description, image, url: address }
}
