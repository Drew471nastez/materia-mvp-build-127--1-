"use client"

/**
 * ===========================================================================
 *  THE WEBSITE'S LANGUAGES, FOR A VISITOR
 * ===========================================================================
 * Drawn under the footer of every page of a website with more than one
 * published language (Settings › Markets and languages): each language named
 * in its own words ("Français", "Deutsch"), and choosing one opens the same
 * page in it (/fr/products/mug). The choice is the visitor's: nothing is
 * redirected by the browser's language, and the address keeps it. The one
 * thing remembered (sl_lang) is that they chose, so a market's own language
 * (proxy.ts marketLanguageStart) greets a visitor only before they do.
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
  /**
   * The currencies prices can be shown in (Settings › Markets and
   * languages): the store's own and each market's. Choosing one keeps the
   * visitor's country (the sl_country cookie, read by the proxy); `note`
   * says what checkout charges when prices are converted.
   */
  currency?: { options: { id: string; label: string; country: string }[]; current: string; note: string | null }
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
      /* A search box that goes to a page (GET), in the language too: /search becomes /fr/search. A form that posts somewhere is left alone. */
      root.querySelectorAll?.("form[action]").forEach((f) => {
        if ((f.getAttribute("method") || "get").toLowerCase() !== "get") return
        const next = localizedHref(f.getAttribute("action") ?? "", choice.code, choice.defaultLanguage, codes, origin)
        if (next) f.setAttribute("action", next)
      })
    }
    fix(document)
    const seen = new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === "attributes" && (c.target instanceof HTMLAnchorElement || c.target instanceof HTMLFormElement)) fix(c.target.parentNode ?? document)
        c.addedNodes.forEach((n) => {
          if (n instanceof HTMLAnchorElement || n instanceof HTMLFormElement) fix(n.parentNode ?? document)
          else if (n instanceof Element) fix(n)
        })
      }
    })
    seen.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "action"] })
    return () => seen.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.code, choice.defaultLanguage, codes.join(",")])

  const hasLanguages = choice.languages.length > 1
  const currency = choice.currency
  if (!hasLanguages && !currency) return null
  const go = (code: string) => {
    if (code === choice.code) return
    /* The visitor's language from now on: a market's own no longer greets them (proxy.ts marketLanguageStart). */
    try {
      document.cookie = `sl_lang=${encodeURIComponent(code.toLowerCase())}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      /* Cookies off: the address still carries the language. */
    }
    const { pathname, search, hash } = window.location
    window.location.assign(`${localizedPath(bare(pathname, codes), code, choice.defaultLanguage)}${search}${hash}`)
  }
  /* A currency is the visitor's country (the proxy picks the market it is in): remembered for a year, then the page again. */
  const pickCurrency = (id: string) => {
    const option = currency?.options.find((o) => o.id === id)
    if (!option || id === currency?.current) return
    try {
      document.cookie = `sl_country=${encodeURIComponent(option.country)}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      return
    }
    window.location.reload()
  }

  const pill =
    "h-9 max-w-[60vw] cursor-pointer appearance-none truncate rounded-full border border-current/20 bg-transparent pl-8 pr-8 text-[13px] text-current outline-none transition-colors hover:border-current/40 focus-visible:border-current/60"
  const chevron = (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="m5.5 8 4.5 4.5L14.5 8" />
    </svg>
  )

  return (
    <div data-language-switch="" className="flex flex-col items-center gap-2 px-4 py-4" style={{ background: "var(--theme-bg, transparent)", color: "var(--theme-text, inherit)" }}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasLanguages ? (
          <div className="relative inline-flex items-center">
            <label htmlFor={id} className="sr-only">
              Language
            </label>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="7.25" />
              <path d="M2.75 10h14.5M10 2.75c2 2.2 2.9 4.6 2.9 7.25S12 15.05 10 17.25M10 2.75C8 4.95 7.1 7.35 7.1 10s.9 5.05 2.9 7.25" />
            </svg>
            <select id={id} value={choice.code} onChange={(e) => go(e.target.value)} className={pill} style={{ color: "inherit" }}>
              {choice.languages.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
            {chevron}
          </div>
        ) : null}
        {currency ? (
          <div className="relative inline-flex items-center" data-currency-switch="">
            <label htmlFor={`${id}-currency`} className="sr-only">
              Currency
            </label>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2.75" y="5" width="14.5" height="10" rx="2" />
              <circle cx="10" cy="10" r="2.25" />
            </svg>
            <select id={`${id}-currency`} value={currency.current} onChange={(e) => pickCurrency(e.target.value)} className={pill} style={{ color: "inherit" }}>
              {currency.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {chevron}
          </div>
        ) : null}
      </div>
      {currency?.note ? (
        <p className="max-w-[46ch] text-center text-[12px] leading-[17px] opacity-70" data-currency-note="">
          {currency.note}
        </p>
      ) : null}
    </div>
  )
}
