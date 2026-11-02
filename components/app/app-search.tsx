"use client"

/**
 * ===========================================================================
 *  THE /app SEARCH
 * ===========================================================================
 * One box that finds a page, an order, a customer, a product, an email or an
 * automation. Pages are matched here as the person types; everything else
 * comes from /api/app/search (lib/search/app-search.ts), which reads only
 * their own rows.
 *
 * ONE PANEL, TWO SHAPES. On a computer it drops from the search bar in the
 * header, as it did. On a phone it is the whole screen, with the field at the
 * top in 16px text (so iOS does not zoom) and its foot on the keyboard
 * (--kb-inset, lib/ui/keyboard-safe-sheet), so the last results can be
 * scrolled above the keys. The same field, the same list, the same keys.
 *
 * ASKING THE SERVER. A pause of 200ms after the last key, and the request
 * before it is cancelled, so an answer for "ja" can never land on top of the
 * answer for "jane". The last answer stays on screen while the next is on
 * its way, with a spinner in the field, so the list does not blink empty on
 * every letter.
 *
 * KEYS. Up and down move through every result in the order drawn, Enter opens
 * the one lit, Escape closes. Enter pressed with nothing lit yet, before the
 * answer has arrived, opens the first result when it does, which is what
 * somebody typing an order number and pressing Enter at once meant.
 *
 * ALWAYS THE STORE AS IT IS NOW (round 42). An answer is kept a few seconds
 * so backspacing draws it at once, and an answer older than ANSWER_FRESH_MS
 * is drawn and asked for again behind it. Anything saved anywhere in the app
 * (lib/search/search-freshness: a write through fetch) forgets every kept
 * answer, and the next search asks the server for fresh rows.
 *
 * RECENT. An empty field offers what was opened last (lib/search/
 * recent-searches, this browser only), then the places people go most.
 *
 * OPENED BY REFERENCE, like the notifications (components/app/sidebar.tsx):
 * its open state lives here, so opening it does not render the whole sidebar
 * again. On a phone the field is focused in the tap itself, which is the only
 * moment iOS will raise the keyboard for it.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal, flushSync } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { Search, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNativePlatform } from "@/lib/supabase/client"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { useLockAppScroll } from "@/components/app/sidebar-mobile-nav"
import { APP_PAGES, GO_TO, matchPages } from "@/lib/search/app-pages"
import { useCommunitiesEnabled } from "@/lib/platform/use-flags"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { onSearchStale, takeSearchStale, watchWrites } from "@/lib/search/search-freshness"
import { readRecent, withRecent, writeRecent, type RecentItem } from "@/lib/search/recent-searches"
import { GROUP_LABELS, SEARCH_GROUPS, isSearchable, normalizeQuery, type SearchResult } from "@/lib/search/app-search"
import { useNewProductChooser } from "@/app/app/products/new/kind-chooser"
import { NEW_PRODUCT_HREF } from "@/app/app/products/new/product-kinds"
import { tt } from "@/lib/i18n/text"

const MAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
const EXTERNAL: Record<string, string> = {
  "/explore": `https://${MAIN}/explore`,
  /* Help is not here: it is /app/help, a page in the app (lib/search/app-pages), opened by the router like any other. */
}

/** How long a pause in typing before the server is asked. */
export const SEARCH_DEBOUNCE_MS = 200
/** How long one search is waited for before it says so and offers Try again. */
export const SEARCH_WAIT_MS = 10_000
/** How long an answer is drawn again for the same words. */
export const ANSWER_KEEP_MS = 30_000
/** An answer older than this is drawn and asked for again behind it, so a change made since shows up a moment later. */
export const ANSWER_FRESH_MS = 2_000

export type AppSearchHandle = { open: () => void }

interface Item {
  key: string
  title: string
  detail?: string
  href: string
}

interface Section {
  id: string
  label: string
  items: Item[]
}

type Remote =
  | { status: "idle" }
  | { status: "loading"; q: string; last: SearchResult | null }
  | { status: "done"; q: string; result: SearchResult }
  | { status: "error"; q: string; message: string }

const optionId = (key: string) => `app-search-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`

function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
}

export const AppSearch = memo(
  /* `communitiesEnabled` is the layout's own read (app/app/layout.tsx), handed down by the sidebar, so the
     search does not ask GET /api/platform/flags for it again on every load of /app (round 48). Left out, it asks. */
  forwardRef<AppSearchHandle, { className?: string; communitiesEnabled?: boolean }>(function AppSearch({ className, communitiesEnabled }, ref) {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [phone, setPhone] = useState(false)
    const [query, setQuery] = useState("")
    const [remote, setRemote] = useState<Remote>({ status: "idle" })
    const [activeKey, setActiveKey] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const returnFocus = useRef<HTMLElement | null>(null)
    const pendingEnter = useRef<string | null>(null)
    const movedByKeys = useRef(false)
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const [recent, setRecent] = useState<RecentItem[]>([])

    useLockAppScroll(open && phone)

    const show = useCallback(() => {
      returnFocus.current = document.activeElement as HTMLElement | null
      /* Drawn before the focus, in the same tap: a field that is still
         hidden cannot take focus, and iOS raises the keyboard only for a
         focus made inside the gesture. */
      flushSync(() => {
        setPhone(isPhone())
        setRecent(readRecent())
        setOpen(true)
      })
      inputRef.current?.focus({ preventScroll: true })
    }, [])

    useImperativeHandle(ref, () => ({ open: show }), [show])

    const close = useCallback(() => {
      setOpen(false)
      setQuery("")
      setRemote({ status: "idle" })
      setActiveKey(null)
      pendingEnter.current = null
      const back = returnFocus.current
      returnFocus.current = null
      if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true })
    }, [])

    /* A new page closes it. */
    const lastPath = useRef(pathname)
    useEffect(() => {
      if (lastPath.current !== pathname) {
        lastPath.current = pathname
        setOpen(false)
        setQuery("")
        setRemote({ status: "idle" })
      }
    }, [pathname])

    /* Cmd+K or Ctrl+K from anywhere in /app. */
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
          e.preventDefault()
          if (open) inputRef.current?.select()
          else show()
        }
      }
      document.addEventListener("keydown", onKey)
      return () => document.removeEventListener("keydown", onKey)
    }, [open, show])

    /* ── Asking the server ─────────────────────────────────────────────── */
    const q = normalizeQuery(query)
    const searchable = isSearchable(q)
    /*
      ANSWERS ALREADY HAD, for ANSWER_KEEP_MS: backspacing from "john" to
      "jo" draws "jo" again at once instead of asking again. Kept for this
      page only, and a Try again always asks.
    */
    const answers = useRef(new Map<string, { at: number; result: SearchResult }>())
    /* Something saved since the last search: the server is asked to read everything again, once. */
    const askFresh = useRef(false)
    const [saved, setSaved] = useState(0)
    useEffect(() => {
      watchWrites()
      return onSearchStale(() => {
        answers.current.clear()
        askFresh.current = true
        /* An open search with words in it asks again at once. */
        setSaved((n) => n + 1)
      })
    }, [])
    useEffect(() => {
      if (!open) return
      if (takeSearchStale()) {
        answers.current.clear()
        askFresh.current = true
      }
      if (!searchable) {
        setRemote({ status: "idle" })
        return
      }
      const kept = answers.current.get(q)
      /* Only answers are kept, and Try again only follows a failure, so it always asks. */
      if (kept && Date.now() - kept.at < ANSWER_KEEP_MS) {
        setRemote({ status: "done", q, result: kept.result })
        /* Still fresh: nothing to ask. Older: it stays on screen while the same words are asked again behind it. */
        if (Date.now() - kept.at < ANSWER_FRESH_MS) return
      }
      const controller = new AbortController()
      /* Never a spinner for good: a search with no answer in SEARCH_WAIT_MS says so and offers Try again. */
      let timedOut = false
      const deadline = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, SEARCH_DEBOUNCE_MS + SEARCH_WAIT_MS)
      const timer = window.setTimeout(async () => {
        setRemote((prev) => ({
          status: "loading",
          q,
          last: prev.status === "done" ? prev.result : prev.status === "loading" ? prev.last : null,
        }))
        try {
          const res = await fetch("/api/app/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(askFresh.current ? { q, fresh: true } : { q }),
            signal: controller.signal,
            cache: "no-store",
          })
          const data = await res.json().catch(() => null)
          if (timedOut) {
            setRemote({ status: "error", q, message: tt("Search took too long. Try again.") })
            return
          }
          if (controller.signal.aborted) return
          if (!res.ok || !data?.groups) {
            const message =
              res.status === 429 && typeof data?.error === "string"
                ? data.error
                : res.status === 401
                  ? tt("Sign in again to search your store.")
                  : tt("Search is not working right now.")
            setRemote({ status: "error", q, message })
            return
          }
          askFresh.current = false
          answers.current.set(q, { at: Date.now(), result: data as SearchResult })
          setRemote({ status: "done", q, result: data as SearchResult })
        } catch {
          if (timedOut) {
            setRemote({ status: "error", q, message: tt("Search took too long. Try again.") })
            return
          }
          if (controller.signal.aborted) return
          setRemote({ status: "error", q, message: tt("Could not reach Storelib. Check your connection.") })
        } finally {
          window.clearTimeout(deadline)
        }
      }, SEARCH_DEBOUNCE_MS)
      return () => {
        window.clearTimeout(timer)
        window.clearTimeout(deadline)
        controller.abort()
      }
    }, [open, q, searchable, retry, saved])

    /* ── What is drawn ─────────────────────────────────────────────────── */
    /* Community is offered only while the platform switch is on (lib/search/app-pages.ts flag). */
    const communities = useCommunitiesEnabled(communitiesEnabled)
    const physical = usePhysicalCommerceEnabled()
    const sections = useMemo<Section[]>(() => {
      if (!q) {
        const items = GO_TO.map((href) => APP_PAGES.find((p) => p.href === href)!).map((p) => ({ key: `go:${p.href}`, title: p.label, href: p.href }))
        const out: Section[] = []
        if (recent.length) out.push({ id: "recent", label: tt("Recent"), items: recent.map((r) => ({ key: `recent:${r.href}`, title: r.title, detail: r.detail, href: r.href })) })
        out.push({ id: "go", label: tt("Go to"), items })
        return out
      }
      /* Pages first: they are matched here at once, so they are on screen
         before the server answers, and what it answers is added below them
         rather than pushing them down under the pointer. */
      const out: Section[] = []
      const pages = matchPages(q, 6, { communities, physical })
      const nav = pages.filter((p) => p.group === "Pages")
      const settings = pages.filter((p) => p.group === "Settings")
      if (nav.length) out.push({ id: "pages", label: tt("Pages"), items: nav.map((p) => ({ key: `page:${p.href}:${p.label}`, title: p.label, detail: p.under, href: p.href })) })
      if (settings.length) out.push({ id: "settings", label: tt("Settings"), items: settings.map((p) => ({ key: `page:${p.href}:${p.label}`, title: p.label, href: p.href })) })
      const result = remote.status === "done" ? remote.result : remote.status === "loading" ? remote.last : null
      if (searchable && result) {
        for (const id of SEARCH_GROUPS) {
          const hits = result.groups?.[id] ?? []
          if (hits.length) out.push({ id, label: GROUP_LABELS[id], items: hits.map((h) => ({ key: `${id}:${h.id}`, title: h.title, detail: h.detail, href: h.href })) })
        }
      }
      return out
    }, [q, searchable, remote, communities, physical, recent])

    const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
    const activeIndex = Math.max(0, activeKey ? flat.findIndex((i) => i.key === activeKey) : 0)
    const active = flat[activeIndex] ?? null
    const loading = remote.status === "loading" || (open && searchable && remote.status === "idle")

    /* The lit row stays in view when the keys move it. */
    useEffect(() => {
      if (!movedByKeys.current || !active) return
      movedByKeys.current = false
      document.getElementById(optionId(active.key))?.scrollIntoView({ block: "nearest" })
    }, [active])

    /* New product asks what is being sold, over the page it was searched from (app/app/products/new/kind-chooser). */
    const newProduct = useNewProductChooser()
    const askNew = newProduct.open
    /* What was opened, kept first for next time (lib/search/recent-searches): only from a search, never the Go to list itself. */
    const remember = useCallback((item: Item | null) => {
      if (!item || item.key.startsWith("go:")) return
      const next = withRecent(readRecent(), { title: item.title, detail: item.detail, href: item.href })
      writeRecent(next)
    }, [])
    const forgetRecent = useCallback(() => {
      writeRecent([])
      setRecent([])
      inputRef.current?.focus({ preventScroll: true })
    }, [])
    const go = useCallback(
      (href: string) => {
        close()
        if (href === NEW_PRODUCT_HREF) {
          askNew()
          return
        }
        const external = EXTERNAL[href]
        if (external && isNativeApp()) {
          openExternal(external)
          return
        }
        /* The creator page leaves the /app router tree; in the app a full
           load would lose the session, which lives in Preferences, not a
           cookie. The Website page and the OnePage editor are not like it:
           they are pages in the shell, and go by the router like the rail. */
        if (!isNativePlatform() && href.startsWith("/creator-page")) {
          startNavigationLoading(href)
          window.location.href = href
          return
        }
        if (href.startsWith("/app")) startNavigationLoading(href)
        router.push(href)
      },
      [close, router, askNew],
    )

    /* An Enter that arrived before its answer did. */
    useEffect(() => {
      if (remote.status !== "done" || pendingEnter.current !== remote.q) return
      pendingEnter.current = null
      if (flat[0]) {
        remember(flat[0])
        go(flat[0].href)
      }
    }, [remote, flat, go, remember])

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        if (!flat.length) return
        const step = e.key === "ArrowDown" ? 1 : -1
        movedByKeys.current = true
        setActiveKey(flat[(activeIndex + step + flat.length) % flat.length].key)
      } else if ((e.key === "PageDown" || e.key === "PageUp") && flat.length) {
        /* A section at a time: the first result of the next one, or of this one and then the one before. */
        e.preventDefault()
        const starts = sections.reduce<number[]>((acc, sec, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sections[i - 1].items.length], [])
        const here = starts.filter((st) => st <= activeIndex).length - 1
        const to = e.key === "PageDown" ? starts[Math.min(here + 1, starts.length - 1)] : starts[activeIndex > starts[here] ? here : Math.max(0, here - 1)]
        movedByKeys.current = true
        setActiveKey(flat[to].key)
      } else if (e.key === "Enter") {
        if (e.nativeEvent.isComposing) return
        e.preventDefault()
        if (active) {
          remember(active)
          go(active.href)
        }
        else if (searchable && remote.status !== "done" && remote.status !== "error") pendingEnter.current = q
      }
    }

    /* Tab stays inside while it is open. */
    const panelRef = useRef<HTMLDivElement>(null)
    const onPanelKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== "Tab" || !panelRef.current) return
      const stops = [...panelRef.current.querySelectorAll<HTMLElement>("input, button:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null)
      if (!stops.length) return
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const nothing = searchable && remote.status === "done" && flat.length === 0
    const failedMessage = remote.status === "error" && remote.q === q ? remote.message : null

    const panel = (
      <>
        {/* The page behind, dimmed on a computer. A phone's panel covers it. */}
        <div
          aria-hidden="true"
          onClick={close}
          className={cn(
            "fixed inset-0 z-[119] hidden bg-black/20 transition-opacity duration-200 md:block",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
        <div
          ref={panelRef}
          role="dialog"
          /* A modal only while it is open. It stays in the page when closed,
             invisible, and a closed panel that still said aria-modal="true"
             told the phone's pill a modal was up (app/globals.css), which
             turned the pill's buttons off: every tap on Home, Orders,
             Products or Analytics went through to the page under it. */
          aria-modal={open ? "true" : undefined}
          aria-hidden={open ? undefined : "true"}
          inert={!open}
          aria-label={tt("Search")}
          data-app-search=""
          data-open={open ? "" : undefined}
          onKeyDown={onPanelKeyDown}
          className={cn(
            "fixed z-[120] flex flex-col bg-white",
            /* A phone: the whole screen, its foot on the keyboard. */
            "inset-x-0 top-0 bottom-[var(--kb-inset,0px)] pt-[env(safe-area-inset-top,0px)]",
            /* A computer: dropped from the header's search bar. */
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[10px] md:w-[min(600px,calc(100vw-48px))] md:-translate-x-1/2 md:rounded-2xl md:border md:border-[#e5e7eb] md:pt-0 md:shadow-[0_24px_64px_-12px_rgba(16,24,40,0.28),0_2px_6px_rgba(16,24,40,0.06)]",
            open ? "visible opacity-100" : "pointer-events-none invisible opacity-0",
            open ? "translate-y-0 md:scale-100" : "translate-y-2 md:-translate-y-1 md:scale-[0.98]",
          )}
          style={{
            /* Tailwind's translate and scale are properties of their own, not transform. */
            transitionProperty: "opacity, translate, scale, visibility",
            transitionDuration: open ? "200ms, 240ms, 240ms, 0s" : "140ms, 140ms, 140ms, 0s",
            transitionDelay: open ? "0s, 0s, 0s, 0s" : "0s, 0s, 0s, 140ms",
            transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#eef0f2] px-4 md:h-[58px] md:gap-3 md:px-5">
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#6b7280] md:left-0 md:h-[18px] md:w-[18px]" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls="app-search-list"
                aria-activedescendant={active && flat.length ? optionId(active.key) : undefined}
                aria-autocomplete="list"
                aria-label={tt("Search orders, customers, products, offers, emails, integrations, help and pages")}
                placeholder={tt("Search orders, customers, products")}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveKey(null)
                }}
                onKeyDown={onKeyDown}
                className="h-11 w-full min-w-0 rounded-xl bg-[#f3f4f6] pl-9 pr-9 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#6b7280] focus-visible:shadow-[inset_0_0_0_1px_#c9ccd3,0_0_0_3px_rgba(17,17,19,0.06)] md:h-10 md:rounded-none md:bg-transparent md:pl-8 md:pr-8 md:text-[15px] md:focus-visible:shadow-none [&::-webkit-search-cancel-button]:hidden"
              />
              <span className="pointer-events-none absolute right-3 flex h-4 w-4 items-center justify-center md:right-1" aria-hidden="true">
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" data-search-spinner="" /> : null}
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              className="h-11 shrink-0 px-1 text-[15px] font-medium text-[#1a1a2e] md:hidden"
            >
              {tt("Cancel")}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label={tt("Close search")}
              className="hidden h-7 shrink-0 items-center gap-1 rounded-md border border-[#e5e7eb] px-1.5 text-[11px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] md:inline-flex"
            >
              {tt("Esc")}
            </button>
          </div>

          <div
            ref={listRef}
            id="app-search-list"
            role="listbox"
            aria-label={tt("Results")}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(12px,env(safe-area-inset-bottom,0px))] md:max-h-[min(460px,calc(100vh-140px))] md:flex-none md:pb-2"
          >
            {sections.map((section) => (
              <div key={section.id} role="group" aria-labelledby={`app-search-h-${section.id}`} className="relative pt-2">
                <p id={`app-search-h-${section.id}`} className="px-5 pb-1 pt-1 text-[12px] font-semibold text-[#6b7280]">
                  {section.label}
                </p>
                {section.id === "recent" ? (
                  <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={forgetRecent} className="absolute right-3 top-2 h-7 rounded-md px-2 text-[12px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]" data-search-recent-clear="">
                    {tt("Clear")}
                  </button>
                ) : null}
                {section.items.map((item) => {
                  const lit = active?.key === item.key
                  return (
                    <div
                      key={item.key}
                      id={optionId(item.key)}
                      role="option"
                      aria-selected={lit}
                      data-search-item={section.id}
                      onMouseMove={() => {
                        if (!lit) setActiveKey(item.key)
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        remember(item)
                        go(item.href)
                      }}
                      className={cn(
                        "mx-2 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-100 active:bg-[#eceef1] md:min-h-[44px] [-webkit-tap-highlight-color:transparent]",
                        lit ? "bg-[#f3f4f6]" : "",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-[#1a1a2e] md:text-[14px]">{item.title}</p>
                        {item.detail ? <p className="truncate text-[13px] text-[#6b7280]">{item.detail}</p> : null}
                      </div>
                      {lit ? (
                        <span className="hidden shrink-0 text-[12px] text-[#6b7280] md:inline" aria-hidden="true">
                          {tt("Enter")}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}

            {failedMessage ? (
              <div role="alert" className="flex items-center justify-between gap-3 px-5 py-4">
                <p className="text-[14px] text-[#1a1a2e]">{failedMessage}</p>
                <button
                  type="button"
                  onClick={() => setRetry((n) => n + 1)}
                  className="h-9 shrink-0 rounded-lg px-3 text-[14px] font-medium text-[#1a1a2e] ring-1 ring-[#e5e7eb] transition-colors hover:bg-[#f3f4f6]"
                >
                  {tt("Try again")}
                </button>
              </div>
            ) : nothing ? (
              <div className="px-5 py-8 text-center" data-search-empty="">
                <p className="text-[15px] font-medium text-[#1a1a2e]">{tt("No results for “{q}”", { q })}</p>
                <p className="mt-1 text-[14px] text-[#6b7280]">{tt("Try an order number, a name, an email or a product.")}</p>
              </div>
            ) : searchable && flat.length === 0 && loading ? (
              <p className="px-5 py-6 text-[14px] text-[#6b7280]">{tt("Searching")}</p>
            ) : q && !searchable && flat.length === 0 ? (
              <p className="px-5 py-6 text-[14px] text-[#6b7280]">{tt("Keep typing to search orders and customers.")}</p>
            ) : null}
          </div>
          {/* The keys, once, at the foot on a computer: a phone has no keys to name. */}
          <div className="hidden shrink-0 items-center gap-4 border-t border-[#eef0f2] px-5 py-2 text-[12px] text-[#6b7280] md:flex" aria-hidden="true" data-search-keys="">
            <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> {tt("to move")}</span>
            <span><Kbd>{tt("Enter")}</Kbd> {tt("to open")}</span>
            <span className="ml-auto">
              <Kbd>Esc</Kbd>{" "}{/* i18n-ignore: the key's name, as the keyboard prints it */}
              {tt("to close")}
            </span>
          </div>
        </div>
      </>
    )

    return (
      <>
        <button
          type="button"
          onClick={show}
          aria-label={tt("Search")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            "flex h-[36px] w-full max-w-[480px] cursor-text items-center gap-2.5 rounded-full border border-white/10 bg-white/10 px-4 transition-all hover:bg-white/15",
            open && "pointer-events-none opacity-0",
            className,
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
          <span className="flex-1 text-left text-[13px] text-white/60">{tt("Search orders, customers, products")}</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50 lg:flex">
            <span className="text-[10px]">&#8984;</span>K
          </kbd>
        </button>
        {mounted ? createPortal(panel, document.body) : null}
        {newProduct.chooser}
      </>
    )
  }),
)

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9fafb] px-1 font-sans text-[11px] text-[#4b5563]">{children}</kbd>
}
