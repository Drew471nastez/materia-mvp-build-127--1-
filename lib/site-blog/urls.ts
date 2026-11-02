import type { BlogTemplateKeys } from "./types"

const seg = (s: string) => encodeURIComponent(s)

export const blogPath = (handle: string) => `/blogs/${seg(handle)}`
export const postPath = (handle: string, slug: string) => `${blogPath(handle)}/${seg(slug)}`
export const tagPath = (handle: string, tag: string) => `${blogPath(handle)}/tagged/${seg(tag)}`
export const categoryPath = (handle: string, slug: string) => `${blogPath(handle)}/category/${seg(slug)}`
export const postPreviewPath = (handle: string, token: string) => `${blogPath(handle)}/~preview/${seg(token)}`

/** Page n of a list: native sites put it in the path, imported themes paginate with ?page= as Shopify does. Page 1 is the base. */
export function pagedPath(base: string, page: number, compat: boolean): string {
  if (!Number.isFinite(page) || page <= 1) return base
  return compat ? `${base}?page=${Math.floor(page)}` : `${base}/page/${Math.floor(page)}`
}

export function blogTemplateKeys(compat: boolean): BlogTemplateKeys {
  return { listing: compat ? "blog" : "blogs", post: "article" }
}
