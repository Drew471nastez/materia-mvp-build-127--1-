"use client"

/**
 * ===========================================================================
 *  THE COOKIE BANNER AND ITS PREFERENCES
 * ===========================================================================
 * Mounted once, in the root layout, for storelib.com and every creator's site.
 *
 *   THE BANNER    a card in the corner on a computer, across the bottom on a
 *                 phone. Accept all and Reject all, the same size and the same
 *                 weight: refusing must be as easy as agreeing. Manage opens
 *                 the preferences.
 *   PREFERENCES   each kind of cookie with what it is for and a switch, and
 *                 under each, the exact cookies. Reachable at any time from
 *                 "Cookie preferences" in a footer, so a choice can be changed
 *                 as easily as it was made.
 *
 * Until a choice is made nothing optional is stored and Vercel Analytics does
 * not load. What each choice allows is decided in lib/consent, and every
 * tracker asks it at the moment it would store something.
 *
 * Not shown in the native app, in the Sites editor or the website builder:
 * they are tools reached from a signed-in account, which has had the banner
 * on its own pages, and a card over their bottom bars is a card over the
 * buttons. The choice made elsewhere still applies there.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Analytics } from "@vercel/analytics/next"
import { ChevronDown } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { isNativeApp } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import {
  CATEGORY_TEXT,
  CONSENT_VERSION,
  OPTIONAL,
  STORED,
  everything,
  type Consent,
  type ConsentCategory,
  type OptionalCategory,
} from "@/lib/consent/consent"
import { OPEN_PREFERENCES_EVENT, onConsentChange, readConsent, writeConsent } from "@/lib/consent/client"
import { useSiteConsentTheme } from "@/lib/consent/site-theme"
import { onCreatorSite } from "@/lib/nav/creator-site"
import { SITES_HOST } from "@/lib/sites/public-host"

/** Kept for the footers that open the preferences with it. */
export const COOKIE_PREFS_EVENT = OPEN_PREFERENCES_EVENT

/**
 * A switch drawn so its thumb cannot leave its track: placed with `left`,
 * moved by exactly the track less the thumb and both gaps (40 - 20 - 2 - 2).
 * The old one had no `left`, so a button's centring put the thumb halfway
 * along before it moved, and "on" drew it outside the track.
 */
function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full p-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e] focus-visible:ring-offset-2",
        checked ? "bg-[#1a1a2e]" : "bg-[#d4d4d8]",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[2px] top-[2px] block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  )
}

function Category({
  category,
  checked,
  onChange,
}: {
  category: ConsentCategory
  checked: boolean
  onChange?: (v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const items = STORED.filter((s) => s.category === category)
  const text = CATEGORY_TEXT[category]
  return (
    <div className="border-b border-[#eef0f2] py-4 last:border-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#1a1a2e]">{text.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">{text.body}</p>
        </div>
        {category === "necessary" ? (
          <span className="mt-0.5 shrink-0 text-[12px] font-medium text-[#6b7280]">Always on</span>
        ) : (
          <Switch checked={checked} onChange={onChange} label={text.title} />
        )}
      </div>
      {items.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded text-[12px] font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e] focus-visible:ring-offset-2"
          >
            {open ? "Hide" : "Show"} {items.length === 1 ? "the cookie" : `${items.length} cookies`}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ul className="mt-2 divide-y divide-[#f1f2f4] overflow-hidden rounded-lg border border-[#eef0f2]">
              {items.map((it) => (
                <li key={it.name} className="grid gap-0.5 px-3 py-2 text-[12px] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                  <span className="min-w-0">
                    <code className="font-mono text-[11.5px] text-[#1a1a2e]">{it.name}</code>
                    <span className="block text-[#6b7280]">{it.purpose}</span>
                  </span>
                  <span className="text-[#9ca3af] sm:text-right">{it.lasts}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Black or white, whichever reads on this colour (WCAG relative luminance). */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return "#ffffff"
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const lin = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return L > 0.4 ? "#111111" : "#ffffff"
}

export function CookieConsentBanner() {
  const pathname = usePathname()
  const site = useSiteConsentTheme()
  const [ready, setReady] = useState(false)
  const [consent, setConsent] = useState<Consent | null>(null)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [draft, setDraft] = useState<Record<OptionalCategory, boolean>>({ preferences: false, analytics: false, marketing: false })

  /* A page shown inside another (the Website page's preview, the builder's
     canvas) is a picture of a site, not a visit to it: it asks nothing. */
  const [embedded, setEmbedded] = useState(false)

  useEffect(() => {
    const c = readConsent()
    setConsent(c)
    setBannerOpen(c === null)
    try {
      setEmbedded(window.self !== window.top)
    } catch {
      /* A cross-origin parent throws on reading top: embedded all the same. */
      setEmbedded(true)
    }
    setReady(true)
    return onConsentChange((next) => {
      setConsent(next)
      if (next) setBannerOpen(false)
    })
  }, [])

  const openPrefs = useCallback(() => {
    const c = readConsent()
    /* Everything off until turned on: a preference is a choice, not a default. */
    setDraft({ preferences: c?.preferences ?? false, analytics: c?.analytics ?? false, marketing: c?.marketing ?? false })
    setPrefsOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPrefs)
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openPrefs)
  }, [openPrefs])

  const decide = (c: Consent) => {
    writeConsent(c)
    setConsent(c)
    setBannerOpen(false)
    setPrefsOpen(false)
  }
  const acceptAll = () => decide(everything(true, Date.now()))
  const rejectAll = () => decide(everything(false, Date.now()))
  const save = () => decide({ version: CONSENT_VERSION, ...draft, at: Math.floor(Date.now() / 1000) })

  if (!ready || isNativeApp()) return null

  /*
    TOOLS, NOT PAGES. The dashboard (/app), the builders and the admin are
    where a signed-in creator works; the banner belongs to the pages visitors
    land on (storelib.com, a creator's page, a built site). Nothing optional
    loads in the tools either way, because nothing optional loads without a
    yes: the choice made anywhere still applies here.
  */
  const inSitesEditor = pathname?.startsWith("/sites/") ?? false
  const inBuilder = pathname?.startsWith("/website-builder/") ?? false
  const inApp = pathname === "/app" || (pathname?.startsWith("/app/") ?? false) || (pathname?.startsWith("/admin") ?? false)
  /* A creator can switch the banner off for their site; then it asks nothing
     and, with no yes, nothing optional loads for their visitors. */
  const quiet = inSitesEditor || inBuilder || inApp || embedded || site?.hidden === true

  /* Storelib's own look unless the site set its banner colours itself. */
  const bg = site?.background || "#ffffff"
  const fg = site?.color || "#1a1a2e"
  const branded = Boolean(site?.background)
  const accent = site?.accent || "#1a1a2e"
  const onAccent = readableOn(accent)

  return (
    <>
      {consent?.analytics === true && !inSitesEditor && !embedded && <Analytics />}

      {bannerOpen && !quiet && !prefsOpen && (
        /* Positions the card; the card itself takes the clicks. */
        <div data-cookie-banner="" className="pointer-events-none fixed bottom-0 left-0 right-0 z-[9999] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:justify-start sm:px-5 sm:pb-5">
          <section
            role="region"
            aria-label="Cookies"
            className="cookie-card pointer-events-auto w-full max-w-[400px] rounded-2xl border border-[#e5e7eb]/80 p-5 shadow-[0_12px_32px_-12px_rgba(17,24,39,0.18),0_1px_3px_rgba(0,0,0,0.04)]"
            style={{ background: bg, color: fg }}
          >
            <p className="text-[15px] font-semibold">Cookies</p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: branded ? fg : "#6b7280", opacity: branded ? 0.8 : 1 }}>
              {site?.text ||
                "Necessary cookies keep this site working. With your OK we also count returning visitors, so creators can see what works."}{" "}
              {/* Storelib's cookie policy: on a creator's website /privacy is not a page of theirs, so it is the full address there, and a plain link that nothing reads ahead. */}
              {typeof window !== "undefined" && onCreatorSite(window.location.hostname) ? (
                <a href={`https://${SITES_HOST}/privacy#cookies`} target="_blank" rel="noopener" className="underline underline-offset-2">
                  Cookie policy
                </a>
              ) : (
                <Link href="/privacy#cookies" className="underline underline-offset-2">
                  Cookie policy
                </Link>
              )}
            </p>
            {/* Equal buttons: saying no is as easy as saying yes. */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={rejectAll}
                className="h-10 rounded-xl border text-[13px] font-semibold transition-[opacity,background-color] hover:opacity-85 active:scale-[0.98]"
                style={{ borderColor: branded ? "currentColor" : "#e5e7eb", background: branded ? "transparent" : "#ffffff", color: fg }}
              >
                {site?.declineText || "Reject all"}
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="h-10 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: accent, color: onAccent }}
              >
                {site?.acceptText || "Accept all"}
              </button>
            </div>
            <button type="button" onClick={openPrefs} className="mt-3 text-[12px] font-medium opacity-60 transition-opacity hover:opacity-100">
              Manage preferences
            </button>
          </section>
        </div>
      )}

      <Dialog open={prefsOpen} onOpenChange={(o) => (o ? undefined : setPrefsOpen(false))}>
        <DialogContent
          showCloseButton={false}
          /* Focus the panel itself, not its first link, so opening it does not
             draw a focus ring on "Show 9 cookies". Tab still starts there. */
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.focus()
          }}
          tabIndex={-1}
          className="flex max-h-[min(88vh,720px)] outline-none w-[calc(100%-24px)] max-w-[520px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]"
        >
          <div className="border-b border-[#eef0f2] px-5 pb-4 pt-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">Cookie preferences</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">
              Choose what this site may store on this device. You can change this at any time from Cookie preferences at the
              bottom of the page.
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            <Category category="necessary" checked />
            {OPTIONAL.map((c) => (
              <Category key={c} category={c} checked={draft[c]} onChange={(v) => setDraft((d) => ({ ...d, [c]: v }))} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0f2] bg-[#fafafb] px-5 py-3">
            <button type="button" onClick={rejectAll} className="h-9 rounded-lg px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#ececef]">
              Reject all
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                className="h-9 rounded-lg border border-[#d5d7dd] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] hover:bg-[#f7f7f8]"
              >
                Save choices
              </button>
              <button type="button" onClick={acceptAll} className="h-9 rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white hover:bg-[#2a2a40]">
                Accept all
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
