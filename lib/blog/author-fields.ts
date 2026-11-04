import { slugify } from "./editor-model"
import { plainText, safeHref, safeMediaUrl } from "./sanitize"

/** An author profile's fields from a request, checked and capped. `creating` needs a name; an update changes only what it names. */
export function authorFields(body: unknown, creating: boolean): Record<string, unknown> | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (creating || "name" in b) {
    const name = plainText(b.name, 80).trim()
    if (!name) return { error: "An author needs a name." }
    out.name = name
  }
  if (creating || "slug" in b) {
    const slug = slugify(typeof b.slug === "string" && b.slug ? b.slug : String(out.name ?? ""))
    if (!slug) return { error: "An author needs an address." }
    out.slug = slug
  }
  if ("role" in b) out.role = plainText(b.role, 80).trim()
  if ("bio" in b) out.bio = plainText(b.bio, 1000).trim()
  if ("avatar_url" in b) out.avatar_url = safeMediaUrl(b.avatar_url as string) || null
  if ("links" in b) {
    out.links = (Array.isArray(b.links) ? b.links : [])
      .map((l) => ({ label: plainText((l as Record<string, unknown>)?.label, 40).trim(), url: safeHref((l as Record<string, unknown>)?.url as string) ?? "" }))
      .filter((l) => l.url && /^https?:|^mailto:/i.test(l.url))
      .slice(0, 8)
  }
  return out
}
