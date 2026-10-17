"use client"

/**
 * ===========================================================================
 *  THE LIVE WEBSITE'S LINKS, FOLLOWED IN PLACE AND FETCHED AHEAD
 * ===========================================================================
 * Which links: lib/website-builder/site-navigation.ts. This is the half that
 * listens. A section is markup drawn by the server, so its links are plain
 * <a> tags rather than next/link; one listener on the window takes a plain
 * press on any of them and hands it to Next's router, which is what a Link
 * would have done, and fetches the page ahead the way a Link does:
 *
 *   on screen     a few of the links in view, once the page is idle
 *                 (viewportPrefetchBudget: none on Data Saver or 2G)
 *   intent        the link under the pointer, focused, or touched
 *
 * The window, not the document, and the bubble phase: the section links'
 * own listener (section-motion.ts, on the document) and the new tab links'
 * (capture) have already had their say, so a #section still scrolls with
 * its curve and a link marked for a new tab still opens one.
 *
 * The first sign of interest also fetches the section renderers a page may
 * draw (sections/lazy-section.tsx), so the next page never waits for one.
 */
import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { inPlaceTarget, plainPress, setSiteNavigator, viewportPrefetchBudget } from "@/lib/website-builder/site-navigation"
import { preloadSectionRenderers } from "@/components/website-builder/sections/lazy-section"

/** The website's languages, from the hreflang links its pages carry (lib/markets/live.ts). */
function siteLanguages(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]').forEach((l) => {
    const code = l.getAttribute("hreflang")
    if (code && code !== "x-default") out.push(code)
  })
  return out
}

/* Through the event's path, so a link drawn inside a section's shadow root is found too (as NewTabLinks does). */
function linkOf(e: Event): HTMLAnchorElement | null {
  for (const n of e.composedPath()) if (n instanceof HTMLAnchorElement && n.hasAttribute("href")) return n
  return null
}

function targetOf(a: HTMLAnchorElement): string | null {
  return inPlaceTarget(
    { href: a.getAttribute("href"), target: a.getAttribute("target"), download: a.hasAttribute("download"), reload: a.hasAttribute("data-sl-reload") },
    window.location.href,
    siteLanguages(),
  )
}

/** How long the page being left may stay on screen waiting for the next one, at most. */
export const ARRIVAL_HOLD_MS = 1200

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => unknown }

export function SiteLinks() {
  const router = useRouter()
  /* Again on every page: its links are the ones on screen now. */
  const pathname = usePathname()
  /* The view transition waiting for the next page to be drawn. */
  const arrived = useRef<(() => void) | null>(null)

  /*
    THE PAGE HAS CHANGED: the transition that was waiting for it plays. This
    runs after React has put the new page in the document.
  */
  useEffect(() => {
    const finish = arrived.current
    arrived.current = null
    finish?.()
  }, [pathname])

  useEffect(() => {
    /*
      THE CREATOR'S PAGE TRANSITION, KEPT. Theme settings › Animations' fade,
      slide or rise (theme/site-intro.tsx) and the live site's one-frame cut
      (lib/website-builder/live-navigation.ts) are view transitions between
      documents, which an in-place change never starts. The same pseudo
      elements play for a transition started here: the page being left stays
      on screen until the next one is drawn (never longer than
      ARRIVAL_HOLD_MS), then the creator's animation runs. Not where the head
      script turned transitions off (an app's web view, a slow phone), not
      with reduced motion asked for, and not for a change of query alone,
      which keeps the same page.
    */
    const go = (to: string) => {
      const doc = document as ViewTransitionDocument
      const samePath = to.split(/[?#]/)[0] === window.location.pathname
      const off =
        typeof doc.startViewTransition !== "function" ||
        samePath ||
        !!document.querySelector("style[data-storelib-navigation-off]") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (off) {
        router.push(to)
        return
      }
      doc.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            let done = false
            const finish = () => {
              if (done) return
              done = true
              resolve()
            }
            arrived.current = finish
            window.setTimeout(finish, ARRIVAL_HOLD_MS)
            router.push(to)
          }),
      )
    }

    const fetched = new Set<string>()
    let renderersAsked = false
    const ahead = (path: string) => {
      if (!renderersAsked) {
        renderersAsked = true
        void preloadSectionRenderers()
      }
      const key = path.split("#")[0]
      if (fetched.has(key)) return
      fetched.add(key)
      try {
        router.prefetch(key)
      } catch {
        /* A prefetch is a nicety; the press still works without it. */
      }
    }

    const onClick = (e: MouseEvent) => {
      if (!plainPress(e)) return
      const a = linkOf(e)
      if (!a) return
      const to = targetOf(a)
      if (!to) return
      e.preventDefault()
      go(to)
    }
    const onIntent = (e: Event) => {
      const a = linkOf(e)
      if (!a) return
      const to = targetOf(a)
      if (to) ahead(to)
    }

    window.addEventListener("click", onClick)
    document.addEventListener("pointerover", onIntent, { passive: true })
    document.addEventListener("focusin", onIntent)
    document.addEventListener("touchstart", onIntent, { passive: true })
    /* The header's menu drawer follows its links once it has closed: in place too (HeaderSection, followSitePage). */
    setSiteNavigator(go, siteLanguages)

    /* A few of the links on screen, when the page has nothing else to do. */
    let budget = viewportPrefetchBudget(navigator as never)
    let io: IntersectionObserver | null = null
    const watchScreen = () => {
      if (budget <= 0 || typeof IntersectionObserver === "undefined") return
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io?.unobserve(entry.target)
          const to = targetOf(entry.target as HTMLAnchorElement)
          if (!to || fetched.has(to.split("#")[0])) continue
          if (budget-- <= 0) {
            io?.disconnect()
            return
          }
          ahead(to)
        }
      }, { rootMargin: "0px" })
      document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => io?.observe(a))
    }
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const handle = idle ? idle.call(window, watchScreen, { timeout: 2500 }) : window.setTimeout(watchScreen, 1200)

    return () => {
      window.removeEventListener("click", onClick)
      document.removeEventListener("pointerover", onIntent)
      document.removeEventListener("focusin", onIntent)
      document.removeEventListener("touchstart", onIntent)
      setSiteNavigator(null)
      io?.disconnect()
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
      if (idle && cancel) cancel.call(window, handle)
      else window.clearTimeout(handle)
      budget = 0
    }
  }, [router, pathname])

  return null
}
