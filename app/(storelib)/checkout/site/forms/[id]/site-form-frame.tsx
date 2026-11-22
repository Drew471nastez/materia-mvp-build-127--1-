"use client"

/**
 * The form inside the website's frame (./page.tsx). The page around it
 * (lib/storelib-theme/compat/storelib-form.ts) dresses it in the theme's
 * colours and fonts and follows its height; this side keeps it see-through
 * and sends every link it opens to the website's own tab, never into the
 * frame: Pay to confirm a booking goes to Storelib's checkout with the page
 * the form is on to come back to (lib/checkout/return-url.ts checks it), a
 * booking's Change or cancel and a product link the same way. A link that
 * asks for a new tab keeps it.
 */
import { useEffect } from "react"
import { PublicFormRenderer } from "@/components/forms/public-form"
import type { PublicForm } from "@/lib/forms/definition"

/** The page this frame stands in, when it is this website's own; null otherwise. */
function parentPage(): string | null {
  try {
    if (window.parent === window) return null
    const at = window.parent.location
    return at.origin === window.location.origin ? at.href.split("#")[0] : null
  } catch {
    return null
  }
}

/** Storelib's checkout for a paid booking, from this website and back to it. Exported for its test. */
export function withWebsiteReturn(href: string, page: string | null, site: string): string {
  try {
    const u = new URL(href, window.location.href)
    if (u.pathname !== "/checkout" || !u.searchParams.has("productId") || !page) return u.toString()
    if (!u.searchParams.has("src")) u.searchParams.set("src", "website")
    u.searchParams.set("site", site)
    u.searchParams.set("return", page)
    u.searchParams.set("cancel", page)
    return u.toString()
  } catch {
    return href
  }
}

export function SiteFormFrame({ formId, initial, site, title }: { formId: string; initial: PublicForm; site: string; title: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const href = a.getAttribute("href") || ""
      if (!href || href.startsWith("#") || /^(?:mailto|tel|sms):/i.test(href)) return
      e.preventDefault()
      const to = withWebsiteReturn(a.href, parentPage(), site)
      try {
        ;(window.top ?? window).location.assign(to)
      } catch {
        window.location.assign(to)
      }
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [site])
  return (
    <>
      <style>{"html,body{background:transparent!important;margin:0}"}</style>
      <main data-site-form-root="" className="px-px py-1 text-[var(--sheet-ink,#1a1a2e)]">
        <PublicFormRenderer formId={formId} initial={initial} source="website" sourceBlock={title} pageUrl={parentPage} />
      </main>
    </>
  )
}
