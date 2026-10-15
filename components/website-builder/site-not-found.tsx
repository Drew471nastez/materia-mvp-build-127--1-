"use client"

import { useEffect, useState, type ComponentType, type ReactNode } from "react"

import type { NotFoundPayload } from "@/components/website-builder/site-not-found-page"

/**
 * ===========================================================================
 *  A MISSING PAGE ON A CREATOR'S SITE, DRAWN AS THEIR OWN 404 PAGE
 * ===========================================================================
 * The root 404 decides on the visitor's side that it is on somebody's site
 * (components/platform/not-found-body.tsx). This asks that site for the 404
 * page its creator arranged, at `/not_found` on the same host, and draws it
 * with the site's own header, footer and colours. The response status is
 * the 404 it always was; only what is inside it changes.
 *
 * WHILE IT LOADS, NOTHING, BRIEFLY. The plain answer is rendered but not
 * shown for up to 1.2 seconds, so a visitor does not see one 404 page and
 * then another. If the site's page has not arrived by then, or cannot be
 * read, the plain answer shows and stays: a page that swaps itself after a
 * visitor has started reading it is worse than either page.
 */
const WAIT_MS = 1200

function isPayload(v: unknown): v is NotFoundPayload {
  if (!v || typeof v !== "object") return false
  const p = v as Record<string, unknown>
  return typeof p.template === "string" && Array.isArray(p.sections) && !!p.theme && typeof p.theme === "object"
    && !!p.prerendered && typeof p.prerendered === "object" && !!p.storefront && typeof p.storefront === "object"
}

export function SiteNotFound({ fallback }: { fallback: ReactNode }) {
  const [drawn, setDrawn] = useState<{ Page: ComponentType<{ page: NotFoundPayload }>; page: NotFoundPayload } | null>(null)
  const [plain, setPlain] = useState(false)

  useEffect(() => {
    let settled = false
    const giveUp = () => {
      if (settled) return
      settled = true
      setPlain(true)
    }
    const timer = window.setTimeout(giveUp, WAIT_MS)
    const ask = (path: string) => fetch(path, { headers: { accept: "application/json" }, credentials: "omit" }).then((r) => (r.ok ? r.json() : null))
    /* At /fr/…, the page in French (/fr/not_found); an address that only looks like a language answers nothing there, and the website's own is asked. */
    const lang = window.location.pathname.match(/^\/([a-z]{2,3}(?:-[a-z0-9]{2,8})*)(?:\/|$)/i)?.[1]
    Promise.all([
      (lang ? ask(`/${lang}/not_found`).catch(() => null) : Promise.resolve(null)).then((d) => (isPayload(d) ? d : ask("/not_found"))),
      import("@/components/website-builder/site-not-found-page"),
    ])
      .then(([data, mod]) => {
        if (settled) return
        if (!isPayload(data)) return giveUp()
        settled = true
        window.clearTimeout(timer)
        setDrawn({ Page: mod.SiteNotFoundPage, page: data })
      })
      .catch(giveUp)
    return () => {
      settled = true
      window.clearTimeout(timer)
    }
  }, [])

  if (drawn) return <drawn.Page page={drawn.page} />
  return <div style={plain ? undefined : { visibility: "hidden" }} className="flex flex-1 flex-col">{fallback}</div>
}
