"use client"

/**
 * ===========================================================================
 *  THE WEBSITE'S LANGUAGES, FOR A VISITOR
 * ===========================================================================
 * Drawn under the footer of every page of a website with more than one
 * published language (Settings › Markets and languages): each language named
 * in its own words ("Français", "Deutsch"), and choosing one opens the same
 * page in it (/fr/products/mug). The choice is the visitor's: nothing is
 * redirected by the browser's language, and the address keeps it.
 *
 * On a page in another language than the website's own, every link to
 * another page of the website keeps the language: /about becomes /fr/about.
 * Links to the cart, checkout, account and files are left as they are (those
 * pages are not translated by address), and so is every link elsewhere.
 */
import { useEffect, useId } from "react"
import { localeFromPath, localizedPath } from "@/lib/markets/locales"

export interface SiteLanguageChoice {
  /** The language this page is drawn in. */
  code: string
  /** The website's own language: its addresses carry no prefix. */
  defaultLanguage: string
  /** Every published language, the website's own first, each named in its own words. */
  languages: { code: string; name: string }[]
}

/** Addresses never given a language prefix: what is the visitor's own or not a page. */
const KEEP = /^\/(?:checkout|cart|account|api|receipt|review|wishlist|password|_next|media|files)(?:[/?#]|$)/

/** The address without the language it is in, among the website's languages. */
function bare(pathname: string, codes: readonly string[]): string {
  return localeFromPath(pathname, codes)?.rest ?? pathname
}

/** A link's address in `code`, or null when the link is not one to change. */
export function localizedHref(href: string, code: string, defaultLanguage: string, codes: readonly string[], origin: string): string | null {
  if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(href)) return null
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  if (KEEP.test(url.pathname) || /\.[a-z0-9]{1,8}$/i.test(url.pathname)) return null
  const path = localizedPath(bare(url.pathname, codes), code, defaultLanguage)
  if (path === url.pathname) return null
  return `${path}${url.search}${url.hash}`
}

export function LanguageSwitch({ choice }: { choice: SiteLanguageChoice }) {
  const id = useId()
  const codes = choice.languages.map((l) => l.code)

  /* Every link to another page of the website, in this page's language. */
  useEffect(() => {
    if (choice.code === choice.defaultLanguage) return
    const origin = window.location.origin
    const fix = (root: ParentNode) => {
      root.querySelectorAll?.("a[href]").forEach((a) => {
        const next = localizedHref(a.getAttribute("href") ?? "", choice.code, choice.defaultLanguage, codes, origin)
        if (next) a.setAttribute("href", next)
      })
    }
    fix(document)
    const seen = new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === "attributes" && c.target instanceof HTMLAnchorElement) fix(c.target.parentNode ?? document)
        c.addedNodes.forEach((n) => {
          if (n instanceof HTMLAnchorElement) fix(n.parentNode ?? document)
          else if (n instanceof Element) fix(n)
        })
      }
    })
    seen.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] })
    return () => seen.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.code, choice.defaultLanguage, codes.join(",")])

  if (choice.languages.length < 2) return null
  const go = (code: string) => {
    if (code === choice.code) return
    try {
      document.cookie = `sl_lang=${encodeURIComponent(code)}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      /* the choice still opens the page */
    }
    const { pathname, search, hash } = window.location
    window.location.assign(`${localizedPath(bare(pathname, codes), code, choice.defaultLanguage)}${search}${hash}`)
  }

  return (
    <div data-language-switch="" className="flex justify-center px-4 py-4" style={{ background: "var(--theme-bg, transparent)", color: "var(--theme-text, inherit)" }}>
      <label htmlFor={id} className="sr-only">
        Language
      </label>
      <div className="relative inline-flex items-center">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M2.75 10h14.5M10 2.75c2 2.2 2.9 4.6 2.9 7.25S12 15.05 10 17.25M10 2.75C8 4.95 7.1 7.35 7.1 10s.9 5.05 2.9 7.25" />
        </svg>
        <select
          id={id}
          value={choice.code}
          onChange={(e) => go(e.target.value)}
          className="h-9 cursor-pointer appearance-none rounded-full border border-current/20 bg-transparent pl-8 pr-8 text-[13px] text-current outline-none transition-colors hover:border-current/40 focus-visible:border-current/60"
          style={{ color: "inherit" }}
        >
          {choice.languages.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m5.5 8 4.5 4.5L14.5 8" />
        </svg>
      </div>
    </div>
  )
}
