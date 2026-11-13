"use client"

import { usePathname } from "next/navigation"

/**
 * The path the visitor is on, as the server and the browser both see it.
 *
 * Round 62: when Vercel regenerates the cached home page (ISR), Next renders
 * it as "/index", so usePathname() said "/index" on the server and "/" in the
 * browser. The header decided from that whether to draw itself: none in the
 * HTML, one in the browser, and React threw the whole server render away and
 * drew the page again (about 4,800 elements, every visit to storelib.com).
 */
export function normalizeRoutePath(path: string | null): string {
  if (!path) return "/"
  return path === "/index" ? "/" : path
}

export function useRoutePath(): string {
  return normalizeRoutePath(usePathname())
}
