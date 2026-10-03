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
 * OPENED BY REFERENCE, like the notifications (components/app/sidebar.tsx):
 * its open state lives here, so opening it does not render the whole sidebar
 * again. On a phone the field is focused in the tap itself, which is the only
 * moment iOS will raise the keyboard for it.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
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
import { GROUP_LABELS, SEARCH_GROUPS, isSearchable, normalizeQuery, type SearchResult } from "@/lib/search/app-search"
import { useNewProductChooser } from "@/app/app/products/new/kind-chooser"
import { NEW_PRODUCT_HREF } from "@/app/app/products/new/product-kinds"

const MAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
const EXTERNAL: Record<string, string> = {
  "/explore": `https://${MAIN}/explore`,
  "/help": `https://${MAIN}/help`,
}

/** How long a pause in typing before the server is asked. */
export const SEARCH_DEBOUNCE_MS = 200

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
  forwardRef<AppSearchHandle, { className?: string }>(function AppSearch({ className }, ref) {
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

    useLockAppScroll(open && phone)

    const show = useCallback(() => {
      returnFocus.current = document.activeElement as HTMLElement | null
      /* Drawn before the focus, in the same tap: a field that is still
         hidden cannot take focus, and iOS raises the keyboard only for a
         focus made inside the gesture. */
      flushSync(() => {
        setPhone(isPhone())
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
    useEffect(() => {
      if (!open) return
      if (!searchable) {
        setRemote({ status: "idle" })
        return
      }
      const controller = new AbortController()
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
            body: JSON.stringify({ q }),
            signal: controller.signal,
            cache: "no-store",
          })
          const data = await res.json().catch(() => null)
          if (controller.signal.aborted) return
          if (!res.ok || !data?.groups) {
            const message =
              res.status === 429 && typeof data?.error === "string"
                ? data.error
                : res.status === 401
                  ? "Sign in again to search your store."
                  : "Search is not working right now."
            setRemote({ status: "error", q, message })
            return
          }
          setRemote({ status: "done", q, result: data as SearchResult })
        } catch {
          if (controller.signal.aborted) return
          setRemote({ status: "error", q, message: "Could not reach Storelib. Check your connection." })
        }
      }, SEARCH_DEBOUNCE_MS)
      return () => {
        window.clearTimeout(timer)
        controller.abort()
      }
    }, [open, q, searchable, retry])

    /* ── What is drawn ─────────────────────────────────────────────────── */
    /* Community is offered only while the platform switch is on (lib/search/app-pages.ts flag). */
    const communities = useCommunitiesEnabled()
    const sections = useMemo<Section[]>(() => {
      if (!q) {
        const items = GO_TO.map((href) => APP_PAGES.find((p) => p.href === href)!).map((p) => ({ key: `go:${p.href}`, title: p.label, href: p.href }))
        return [{ id: "go", label: "Go to", items }]
      }
      /* Pages first: they are matched here at once, so they are on screen
         before the server answers, and what it answers is added below them
         rather than pushing them down under the pointer. */
      const out: Section[] = []
      const pages = matchPages(q, 5, { communities })
      const nav = pages.filter((p) => p.group === "Pages")
      const settings = pages.filter((p) => p.group === "Settings")
      if (nav.length) out.push({ id: "pages", label: "Pages", items: nav.map((p) => ({ key: `page:${p.href}:${p.label}`, title: p.label, href: p.href })) })
      if (settings.length) out.push({ id: "settings", label: "Settings", items: settings.map((p) => ({ key: `page:${p.href}:${p.label}`, title: p.label, href: p.href })) })
      const result = remote.status === "done" ? remote.result : remote.status === "loading" ? remote.last : null
      if (searchable && result) {
        for (const id of SEARCH_GROUPS) {
          const hits = result.groups?.[id] ?? []
          if (hits.length) out.push({ id, label: GROUP_LABELS[id], items: hits.map((h) => ({ key: `${id}:${h.id}`, title: h.title, detail: h.detail, href: h.href })) })
        }
      }
      return out
    }, [q, searchable, remote, communities])

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
      if (flat[0]) go(flat[0].href)
    }, [remote, flat, go])

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        if (!flat.length) return
        const step = e.key === "ArrowDown" ? 1 : -1
        movedByKeys.current = true
        setActiveKey(flat[(activeIndex + step + flat.length) % flat.length].key)
      } else if (e.key === "Enter") {
        if (e.nativeEvent.isComposing) return
        e.preventDefault()
        if (active) go(active.href)
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
          aria-label="Search"
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
                aria-label="Search orders, customers, products, emails and pages"
                placeholder="Search orders, customers, products"
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
              Cancel
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="hidden h-7 shrink-0 items-center gap-1 rounded-md border border-[#e5e7eb] px-1.5 text-[11px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] md:inline-flex"
            >
              Esc
            </button>
          </div>

          <div
            ref={listRef}
            id="app-search-list"
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(12px,env(safe-area-inset-bottom,0px))] md:max-h-[min(460px,calc(100vh-140px))] md:flex-none md:pb-2"
          >
            {sections.map((section) => (
              <div key={section.id} role="group" aria-labelledby={`app-search-h-${section.id}`} className="pt-2">
                <p id={`app-search-h-${section.id}`} className="px-5 pb-1 pt-1 text-[12px] font-semibold text-[#6b7280]">
                  {section.label}
                </p>
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
                      onClick={() => go(item.href)}
                      className={cn(
                        "mx-2 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2 md:min-h-[44px]",
                        lit ? "bg-[#f3f4f6]" : "",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-[#1a1a2e] md:text-[14px]">{item.title}</p>
                        {item.detail ? <p className="truncate text-[13px] text-[#6b7280]">{item.detail}</p> : null}
                      </div>
                      {lit ? (
                        <span className="hidden shrink-0 text-[12px] text-[#6b7280] md:inline" aria-hidden="true">
                          Enter
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
                  Try again
                </button>
              </div>
            ) : nothing ? (
              <div className="px-5 py-8 text-center" data-search-empty="">
                <p className="text-[15px] font-medium text-[#1a1a2e]">No results for &ldquo;{q}&rdquo;</p>
                <p className="mt-1 text-[14px] text-[#6b7280]">Try an order number, a name, an email or a product.</p>
              </div>
            ) : searchable && flat.length === 0 && loading ? (
              <p className="px-5 py-6 text-[14px] text-[#6b7280]">Searching</p>
            ) : q && !searchable && flat.length === 0 ? (
              <p className="px-5 py-6 text-[14px] text-[#6b7280]">Keep typing to search orders and customers.</p>
            ) : null}
          </div>
        </div>
      </>
    )

    return (
      <>
        <button
          type="button"
          onClick={show}
          aria-label="Search"
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
          <span className="flex-1 text-left text-[13px] text-white/60">Search orders, customers, products</span>
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
