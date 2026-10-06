"use client"

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"

/** Sign-in and sign-up hops from the join button: smooth cover + prefetch. */
export function isJoinAuthHref(href: string): boolean {
  return href.startsWith("/login") || href.startsWith("/signup") || href.startsWith("/request")
}

export function prefetchJoinAuth(router: AppRouterInstance, href: string | null | undefined) {
  if (!href || !isJoinAuthHref(href)) return
  try {
    router.prefetch(href)
  } catch {
    /* prefetch is best-effort */
  }
}

export function goJoinAuth(router: AppRouterInstance, href: string) {
  router.push(href)
}
