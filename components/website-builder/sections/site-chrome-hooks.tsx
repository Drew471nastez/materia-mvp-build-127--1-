"use client"

/**
 * ===========================================================================
 *  THE SITE'S DRAWERS, FOR A HEADER OF THE CREATOR'S OWN
 * ===========================================================================
 * A section written as a .storelib file asks for the cart drawer, its count,
 * the search window and the menu drawer with the attributes in
 * lib/website-builder/storefront-hooks.ts. This is the page's half: it
 * writes the count in, takes the press on a trigger, and draws the same
 * drawers the built-in header draws, from the same components, so a header
 * of one's own opens the same cart, the same search and the same menu, with
 * the same motion, on the live site and in the builder's canvas.
 *
 * Only what the markup asks for is mounted. The cart drawer is drawn once a
 * cart, whoever asks for it (../site-drawer-host.ts).
 *
 * PANELS OF THE SITE'S OWN (round N). A section's own cart panel, search
 * window, language list and currency list (storefront-hooks.ts) are drawn
 * here from the site's one cart, its own search (this creator's products,
 * pages and posts) and its real languages and markets. A panel in one section
 * is opened by the buttons of every other (./own-panels.ts), and while the
 * page has one, the built-in drawer or window of that kind is not drawn.
 */
import { buyerProperties } from "@/lib/physical/cart-link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"

import { cleanMenus } from "@/lib/storelib-theme/values"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import {
  STOREFRONT_HOOKS as H,
  addToCartLine,
  safeHref,
  cartCountText,
  cleanSearchHit,
  currencyOptions,
  currentLabel,
  hookEdge,
  hooksIn,
  localeOptions,
  menuDrawerItems,
  menuHandleOf,
  priceCentsFrom,
  searchPageHref,
  searchTerm,
  type HookEdge,
  type HookNavItem,
  type HookOption,
  type SearchResultHit,
} from "@/lib/website-builder/storefront-hooks"
import { useSiteCart, lineKey } from "../site-cart"
import { drawerCheckout } from "@/lib/website-builder/cart-checkout"
import { useCartMoney, useMoney, useStorefront } from "../theme/storefront-context"
import { storeCentsFromShown } from "@/lib/markets/pricing"
import { useDrawerHost } from "../site-drawer-host"
import { useFocusTrap } from "../drawer-frame"
import { buttonRadiusStyle, sectionColors } from "./_shared"
import { HeaderCartDrawer, HeaderMobileNavDrawer } from "./renderers/HeaderSection"
import { SearchModal } from "../header-search-modal"
import { localizedHref, switchCurrency, switchLanguage } from "../theme/language-switch"
import { closeOwnPanel, openOwnPanel, usePageHooks } from "./own-panels"

const TRIGGERS = `[${H.cart}],[${H.search}],[${H.menu}]`
/* A cart of the section's own: its buttons (lib/website-builder/storefront-hooks.ts, A CART OF THE SECTION'S OWN). */
const CART_ACTIONS = `[${H.addToCart}],[${H.checkout}],[${H.cartClose}],[data-line-inc],[data-line-dec],[data-line-remove]`
/** A line copied from the pattern, so the next draw can take it out again. */
const LINE_ITEM = "data-storelib-cart-line-item"
/** A search result, a language or a currency copied from its pattern, likewise. */
const RESULT_ITEM = "data-storelib-search-result-item"
const OPTION_ITEM = "data-storelib-option-item"

/** Whether a section's markup asks for any of the page's drawers. Most do not, and pay nothing for this. */
export function asksForDrawers(html: string): boolean {
  const f = hooksIn(html)
  return f.cart || f.cartCount || f.search || f.menu || f.addToCart || f.cartPanel || f.searchPanel || f.locale || f.currency
}

/** Every element under `root` matching `sel`, `root` itself first when it matches. */
function within<T extends HTMLElement>(root: HTMLElement, sel: string): T[] {
  return [...(root.matches(sel) ? [root as T] : []), ...Array.from(root.querySelectorAll<T>(sel))]
}

/** Open or shut, the same way for every panel of the site's own: data-open, aria-hidden, inert. */
function markPanel(panel: HTMLElement, open: boolean) {
  if (panel.getAttribute("data-open") !== String(open)) panel.setAttribute("data-open", String(open))
  panel.setAttribute("aria-hidden", String(!open))
  if (open) panel.removeAttribute("inert")
  else panel.setAttribute("inert", "")
}

/**
 * A language or currency list drawn from its one pattern: a copy per option,
 * its words as text (data-option-label, data-option-code), its code on
 * `data-option-code`, aria-current on the one in use. The list is hidden
 * when there is nothing to choose between.
 */
function fillOptions(root: HTMLElement, listSel: string, optionHook: string, kind: "locale" | "currency", options: HookOption[]) {
  root.querySelectorAll<HTMLElement>(listSel).forEach((list) => {
    list.hidden = options.length < 2
    const pattern = list.querySelector<HTMLElement>(`[${optionHook}]:not([${OPTION_ITEM}])`)
    list.querySelectorAll(`[${OPTION_ITEM}]`).forEach((n) => n.remove())
    if (!pattern) return
    pattern.hidden = true
    for (const o of options) {
      const item = pattern.cloneNode(true) as HTMLElement
      item.removeAttribute(optionHook)
      item.hidden = false
      item.setAttribute(OPTION_ITEM, kind)
      within(item, "[data-option-label]").forEach((el) => { el.textContent = o.label })
      within(item, "[data-option-code]").forEach((el) => { if (el !== item) el.textContent = o.code.toUpperCase() })
      item.setAttribute("data-option-code", o.code)
      if (kind === "locale") item.setAttribute("lang", o.code)
      if (o.current) item.setAttribute("aria-current", "true")
      else item.removeAttribute("aria-current")
      pattern.parentNode?.insertBefore(item, null)
    }
  })
}

/**
 * The hooks as a component, mounted by a section only when its markup asks
 * for them (asksForDrawers), so the cart's every change re-renders the
 * sections that show it and no others. The press handler is handed back
 * through `trigger` for the section's own click capture.
 */
export function StorefrontHooks(props: Parameters<typeof useStorefrontHooks>[0] & {
  trigger: { current: ((e: MouseEvent<HTMLElement>) => boolean) | null }
}) {
  const { trigger, ...rest } = props
  const { onTrigger, layers } = useStorefrontHooks(rest)
  trigger.current = onTrigger
  useLayoutEffect(() => () => { trigger.current = null }, [trigger])
  return <>{layers}</>
}

export function useStorefrontHooks({
  section,
  theme,
  html,
  scriptRoot,
  inCanvas,
  onEditorNavigate,
}: {
  section: SectionInstance
  theme: ThemeSettingsValues
  html: string
  scriptRoot: HTMLElement | null
  inCanvas: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
}): { onTrigger: (e: MouseEvent<HTMLElement>) => boolean; layers: ReactNode } {
  const flags = useMemo(() => hooksIn(html), [html])
  const cart = useSiteCart()
  /* The cart's amounts as the product cards show them and checkout adds them up (the visitor's market's currency, or the store's: lib/markets/cart-money). */
  const cartMoney = useCartMoney()
  const money = useMoney()
  /* The market's currency the page shows, if any: a button's printed price is in it (storeCentsFromShown). */
  const storefront = useStorefront()
  const display = storefront.display
  /*
    THE PAGE'S OWN PANELS (./own-panels.ts), keyed by the cart as the drawer
    host is: which sections have a cart panel or a search window of their own,
    and which one is open. A panel anywhere on the page wins over the built-in
    drawer and window for every button on it.
  */
  const page = usePageHooks(cart.setOpen, section.id, { cart: flags.cartPanel, search: flags.searchPanel })
  const ownCartOnPage = page.own.cart.length > 0
  const ownSearchOnPage = page.own.search.length > 0
  const panelOpen = page.cart === section.id
  const ownSearchOpen = page.search === section.id
  const firstOwnCart = page.own.cart[0] === section.id
  /*
    The built-in drawer, only while no section on the page has a panel of its own. A plain bag, or an add button
    with nowhere else to show what it added, still opens it: on a free site that is the one fallback, so nothing is dead.
  */
  const hostsCart = useDrawerHost(cart.setOpen, section.id, (flags.cart || flags.addToCart) && !ownCartOnPage)
  const setPanelOpen = useCallback((open: boolean) => {
    if (open) openOwnPanel(cart.setOpen, "cart", section.id)
    else closeOwnPanel(cart.setOpen, "cart")
  }, [cart.setOpen, section.id])
  const [checkingOut, setCheckingOut] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState("Search")
  const [menu, setMenu] = useState<{ open: boolean; edge: HookEdge; items: HookNavItem[] }>({ open: false, edge: "left", items: [] })
  const rootRef = useRef<HTMLElement | null>(null)
  rootRef.current = scriptRoot

  /*
    THE COUNT, AND WHICH DRAWER IS OPEN, ARE WRITTEN ONTO THE MARKUP. The
    count as text, and as `data-count` so a zero can be hidden in CSS; each
    trigger's `aria-expanded`, so its icon can turn into a close. A trigger
    that is a link is also marked as following itself, so the builder's
    canvas leaves it to this rather than opening the page it points at.
  */
  useLayoutEffect(() => {
    if (!scriptRoot) return
    if (flags.cartCount) {
      const text = cartCountText(cart.count, cart.ready)
      scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartCount}]`).forEach((el) => {
        const n = cart.ready ? String(cart.count) : "0"
        if (el.getAttribute("data-count") !== n) el.setAttribute("data-count", n)
        if (el.childElementCount === 0 && el.textContent !== text) el.textContent = text
      })
    }
    scriptRoot.querySelectorAll<HTMLElement>(TRIGGERS).forEach((el) => {
      const open = el.hasAttribute(H.menu) ? menu.open : el.hasAttribute(H.search) ? (ownSearchOnPage ? page.search !== null : searchOpen) : ownCartOnPage ? page.cart !== null : cart.open
      if (el.getAttribute("aria-expanded") !== String(open)) el.setAttribute("aria-expanded", String(open))
      if (el.tagName === "A" && !el.hasAttribute("data-self-nav")) el.setAttribute("data-self-nav", "")
    })
  }, [scriptRoot, html, flags.cartCount, ownCartOnPage, ownSearchOnPage, page.cart, page.search, cart.count, cart.ready, cart.open, menu.open, searchOpen])

  /*
    A BUTTON ELSEWHERE OPENED THE CART (an add in a product grid, a native Add to cart): the site's
    own panel opens instead of the built-in drawer. The first section with a panel answers, once.
  */
  useEffect(() => {
    if (!firstOwnCart || !cart.open) return
    cart.setOpen(false)
    if (page.cart === null) openOwnPanel(cart.setOpen, "cart", section.id)
  }, [firstOwnCart, cart.open, cart, page.cart, section.id])

  /*
    THE SECTION'S OWN CART PANEL, drawn from the site's one cart: open or shut (data-open, aria-hidden, inert), its lines
    copied from the section's own element marked data-storelib-cart-line, the subtotal, and what shows when it is empty. Every
    value is written as text or a checked address, never as markup.
  */
  useLayoutEffect(() => {
    if (!scriptRoot || !flags.cartPanel) return
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartPanel}]`).forEach((panel) => markPanel(panel, panelOpen))
    const empty = cart.ready ? cart.lines.length === 0 : true
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartEmpty}]`).forEach((el) => { el.hidden = !empty })
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartFilled}]`).forEach((el) => { el.hidden = empty })
    const amounts = cartMoney(cart.lines)
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartSubtotal}]`).forEach((el) => { el.textContent = amounts.subtotal })
    scriptRoot.querySelectorAll<HTMLButtonElement>(`[${H.checkout}]`).forEach((el) => {
      el.toggleAttribute("disabled", empty || checkingOut)
      el.setAttribute("aria-busy", String(checkingOut))
    })
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartLines}]`).forEach((list) => {
      /* The pattern is the section's own element marked data-storelib-cart-line: kept hidden, copied once per line. */
      const pattern = list.querySelector<HTMLElement>(`[${H.cartLine}]:not([${LINE_ITEM}])`)
      list.querySelectorAll(`[${LINE_ITEM}]`).forEach((n) => n.remove())
      if (!pattern) return
      pattern.hidden = true
      if (!cart.ready) return
      cart.lines.forEach((line, i) => {
        const root = pattern.cloneNode(true) as HTMLElement
        root.removeAttribute(H.cartLine)
        root.hidden = false
        root.setAttribute(LINE_ITEM, "")
        root.setAttribute("data-line-key", lineKey(line))
        const all = <T extends HTMLElement>(sel: string) => [...(root.matches(sel) ? [root as T] : []), ...Array.from(root.querySelectorAll<T>(sel))]
        const text = (sel: string, value: string) => all(sel).forEach((el) => { el.textContent = value })
        text("[data-line-title]", line.title)
        text("[data-line-variant]", line.variantName ?? "")
        /* The buyer's personalization answers, as text: "Name: Ana · Photo: pet.jpg" (a picture by its file name, lib/physical/cart-link buyerProperties). */
        text("[data-line-properties]", buyerProperties(line.properties).map(([k, v]) => `${k}: ${v}`).join(" · "))
        text("[data-line-price]", (line.priceCents * line.quantity > 0 ? amounts.lines[i] : "Free"))
        text("[data-line-qty]", String(line.quantity))
        all<HTMLImageElement>("img[data-line-image]").forEach((img) => {
          const src = safeHref(line.thumbnailUrl)
          if (src) img.src = src
          else img.removeAttribute("src")
          img.alt = line.title
        })
        all<HTMLAnchorElement>("a[data-line-url]").forEach((el) => { el.href = line.slug ? `/products/${encodeURIComponent(line.slug)}` : "#" })
        all<HTMLElement>("[data-line-inc]").forEach((b) => b.toggleAttribute("disabled", line.digital))
        list.appendChild(root)
      })
    })
  }, [scriptRoot, html, flags.cartPanel, panelOpen, cart.lines, cart.ready, checkingOut, cartMoney])

  /* Escape closes the section's own panel, as it closes the built-in drawer. */
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panelOpen, setPanelOpen])

  /* ── A SEARCH WINDOW OF THE SITE'S OWN ─────────────────────────────────── */

  /* The words typed, and what this creator's search answered for them. Asked by creator on the live site, by install in the canvas, as the built-in window asks. */
  const askAs = storefront.creatorId ? `creator=${encodeURIComponent(storefront.creatorId)}` : storefront.installId ? `install=${encodeURIComponent(storefront.installId)}` : ""
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<SearchResultHit[]>([])
  const [asked, setAsked] = useState("")
  const [searching, setSearching] = useState(false)
  const searchPanelRef = useRef<HTMLElement | null>(null)
  searchPanelRef.current = flags.searchPanel && scriptRoot ? scriptRoot.querySelector<HTMLElement>(`[${H.searchPanel}]`) : null

  /* Shut, it forgets the words: the next visit starts empty, as the built-in window does. */
  useEffect(() => {
    if (ownSearchOpen) return
    setTerm("")
    setHits([])
    setAsked("")
    setSearching(false)
  }, [ownSearchOpen])

  /* Debounced, and the last answer aborted by the next keystroke, so "te" never replaces the answer to "tech". */
  useEffect(() => {
    const q = searchTerm(term)
    if (!ownSearchOpen || !askAs || !q) { setHits([]); setAsked(""); setSearching(false); return }
    const ctrl = new AbortController()
    setSearching(true)
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/website-builder/search?${askAs}&kinds=all&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!res.ok) { setHits([]); setAsked(q); return }
        const data = (await res.json()) as { items?: unknown[] }
        /* Every value checked before it reaches the markup: text, a kind of three, addresses that are the site's own or http(s). */
        setHits((Array.isArray(data.items) ? data.items : []).map(cleanSearchHit).filter((h): h is SearchResultHit => h !== null))
        setAsked(q)
      } catch {
        /* Aborted, or offline: the list stays as it was. */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 180)
    return () => { window.clearTimeout(id); ctrl.abort() }
  }, [term, askAs, ownSearchOpen])

  /* The input's words, read as they are typed; Enter opens the search page for them. */
  useEffect(() => {
    if (!scriptRoot || !flags.searchPanel) return
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el instanceof HTMLInputElement && el.hasAttribute(H.searchInput)) setTerm(el.value)
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== "Enter" || !(el instanceof HTMLInputElement) || !el.hasAttribute(H.searchInput)) return
      const q = searchTerm(el.value)
      if (!q) return
      e.preventDefault()
      closeOwnPanel(cart.setOpen, "search")
      const href = searchPageHref(q)
      if (inCanvas) { onEditorNavigate?.(href, true); return }
      const choice = storefront.language
      const to = choice ? localizedHref(href, choice.code, choice.defaultLanguage, choice.languages.map((l) => l.code), window.location.origin) ?? href : href
      window.location.assign(to)
    }
    scriptRoot.addEventListener("input", onInput)
    scriptRoot.addEventListener("keydown", onKey)
    return () => {
      scriptRoot.removeEventListener("input", onInput)
      scriptRoot.removeEventListener("keydown", onKey)
    }
  }, [scriptRoot, flags.searchPanel, inCanvas, onEditorNavigate, cart.setOpen, storefront.language])

  /* Open or shut, its states, and its results, each copied from the section's own pattern and written as text or checked addresses. */
  useLayoutEffect(() => {
    if (!scriptRoot || !flags.searchPanel) return
    const q = searchTerm(term)
    const answered = asked !== "" && asked === q
    const state = !q ? "idle" : searching && !answered ? "loading" : hits.length ? "results" : answered ? "empty" : "loading"
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.searchPanel}]`).forEach((panel) => {
      markPanel(panel, ownSearchOpen)
      if (!panel.hasAttribute("role")) panel.setAttribute("role", "dialog")
      if (ownSearchOpen) panel.setAttribute("aria-modal", "true")
      else panel.removeAttribute("aria-modal")
      panel.setAttribute("data-state", state)
    })
    scriptRoot.querySelectorAll<HTMLInputElement>(`input[${H.searchInput}]`).forEach((input) => {
      /* The first focus when it opens (drawer-frame useFocusTrap), and emptied when it shuts. */
      input.setAttribute("data-drawer-focus", "")
      if (!ownSearchOpen && input.value) input.value = ""
    })
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.searchLoading}]`).forEach((el) => { el.hidden = state !== "loading" })
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.searchEmpty}]`).forEach((el) => { el.hidden = state !== "empty" })
    const converting = !!display
    const shownPrice = (text: string) => (converting && priceCentsFrom(text) > 0 ? `${money(priceCentsFrom(text))}${/\/month$/.test(text) ? "/month" : ""}` : text)
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.searchResults}]`).forEach((list) => {
      const pattern = list.querySelector<HTMLElement>(`[${H.searchResult}]:not([${RESULT_ITEM}])`)
      list.querySelectorAll(`[${RESULT_ITEM}]`).forEach((n) => n.remove())
      if (!pattern) return
      pattern.hidden = true
      if (state !== "results") return
      for (const hit of hits) {
        const item = pattern.cloneNode(true) as HTMLElement
        item.removeAttribute(H.searchResult)
        item.hidden = false
        item.setAttribute(RESULT_ITEM, "")
        item.setAttribute("data-kind", hit.kind)
        within(item, "[data-result-title]").forEach((el) => { el.textContent = hit.title })
        within(item, "[data-result-price]").forEach((el) => { el.textContent = hit.price ? shownPrice(hit.price) : "" })
        within(item, "[data-result-kind]").forEach((el) => { el.textContent = hit.kind === "product" ? "Product" : hit.kind === "post" ? "Post" : "Page" })
        within<HTMLImageElement>(item, "img[data-result-image]").forEach((img) => {
          if (hit.image) { img.src = hit.image; img.hidden = false }
          else { img.removeAttribute("src"); img.hidden = true }
          img.alt = hit.title
        })
        within<HTMLAnchorElement>(item, "a[data-result-url]").forEach((a) => { a.href = hit.url })
        list.appendChild(item)
      }
    })
  }, [scriptRoot, html, flags.searchPanel, ownSearchOpen, term, asked, searching, hits, display, money])

  /* The keyboard stays in the open window on the live page, as in the built-in one; Escape shuts it; focus goes back to the button that opened it. */
  useFocusTrap(ownSearchOpen, searchPanelRef, !inCanvas)
  useEffect(() => {
    if (!ownSearchOpen) return
    const opener = page.opener
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeOwnPanel(cart.setOpen, "search") }
    window.addEventListener("keydown", onKey)
    /* The canvas does not trap the keyboard (the editor's own controls are beside it) but the input still takes it. */
    const id = inCanvas ? window.setTimeout(() => searchPanelRef.current?.querySelector<HTMLInputElement>(`input[${H.searchInput}]`)?.focus({ preventScroll: true }), 60) : 0
    return () => {
      window.removeEventListener("keydown", onKey)
      window.clearTimeout(id)
      const active = document.activeElement
      const lost = !active || active === document.body || !!searchPanelRef.current?.contains(active)
      if (lost && opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [ownSearchOpen, page.opener, cart.setOpen, inCanvas])

  /* ── LANGUAGES AND CURRENCIES OF THE SITE'S OWN ────────────────────────── */

  const choice = storefront.language
  const locales = useMemo(() => localeOptions(choice), [choice])
  const currencies = useMemo(() => currencyOptions(choice), [choice])
  useLayoutEffect(() => {
    if (!scriptRoot || !(flags.locale || flags.currency)) return
    if (flags.locale) {
      fillOptions(scriptRoot, `[${H.localeList}]`, H.localeOption, "locale", locales)
      const label = currentLabel(locales)
      if (label) scriptRoot.querySelectorAll<HTMLElement>(`[${H.localeCurrent}]`).forEach((el) => { el.textContent = label })
    }
    if (flags.currency) {
      fillOptions(scriptRoot, `[${H.currencyList}]`, H.currencyOption, "currency", currencies)
      const label = currentLabel(currencies)
      if (label) scriptRoot.querySelectorAll<HTMLElement>(`[${H.currencyCurrent}]`).forEach((el) => { el.textContent = label })
    }
  }, [scriptRoot, html, flags.locale, flags.currency, locales, currencies])

  /** The cart's own buttons: add, a line's plus, minus and remove, check out, close. True when the press was one. */
  const onCartAction = (e: MouseEvent<HTMLElement>): boolean => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>(CART_ACTIONS)
    if (!el || !e.currentTarget.contains(el)) return false
    e.preventDefault()
    e.stopPropagation()
    if (el.hasAttribute(H.addToCart)) {
      const line = addToCartLine((name) => el.getAttribute(name))
      if (!line) return true
      /* Printed in the market's currency on this page: kept in the store's, as every other line is, so the cart does not convert it twice. */
      const own = storeCentsFromShown(line.priceCents, display)
      cart.add(own === null ? line : { ...line, priceCents: own })
      if (flags.cartPanel) {
        /* Its own panel opens, not the built-in drawer the add would open. */
        cart.setOpen(false)
        setPanelOpen(true)
      }
      return true
    }
    if (el.hasAttribute(H.cartClose)) {
      setPanelOpen(false)
      return true
    }
    if (el.hasAttribute(H.checkout)) {
      if (checkingOut || cart.lines.length === 0) return true
      if (inCanvas || !cart.live) {
        onEditorNavigate?.("/cart")
        return true
      }
      setCheckingOut(true)
      void drawerCheckout(cart.lines, cart.shopId).then((r) => {
        window.location.assign(r.go ?? "/cart")
      }).finally(() => setCheckingOut(false))
      return true
    }
    const key = el.closest<HTMLElement>("[data-line-key]")?.getAttribute("data-line-key")
    const line = key ? cart.lines.find((l) => lineKey(l) === key) : undefined
    if (!line || !key) return true
    if (el.hasAttribute("data-line-remove")) cart.remove(key)
    else if (el.hasAttribute("data-line-inc")) cart.setQty(key, line.quantity + 1)
    else if (el.hasAttribute("data-line-dec")) {
      if (line.quantity <= 1) cart.remove(key)
      else cart.setQty(key, line.quantity - 1)
    }
    return true
  }

  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  /** A language or a currency of the section's own list: the same page in it, or the canvas's preview in it. */
  const onOption = (e: MouseEvent<HTMLElement>): boolean => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>(`[${OPTION_ITEM}]`)
    if (!el || !e.currentTarget.contains(el)) return false
    e.preventDefault()
    e.stopPropagation()
    const code = el.getAttribute("data-option-code") ?? ""
    if (!choice || !code) return true
    const preview = inCanvas ? storefront.preview : undefined
    if (inCanvas && !preview) return true
    if (el.getAttribute(OPTION_ITEM) === "locale") switchLanguage(choice, code, preview)
    else switchCurrency(choice, code, preview)
    return true
  }

  /** Called from the section's click capture. True when the press was a trigger, and was handled. */
  const onTrigger = (e: MouseEvent<HTMLElement>): boolean => {
    if (onCartAction(e)) return true
    if (onOption(e)) return true
    const target = e.target as HTMLElement
    if (target.closest?.(`[${H.searchClose}]`) && e.currentTarget.contains(target)) {
      e.preventDefault()
      e.stopPropagation()
      closeOwnPanel(cart.setOpen, "search")
      return true
    }
    /* A result is a link: followed as any link is (the canvas opens it there), with the window shut behind it. */
    if (target.closest?.(`[${RESULT_ITEM}] a`) && page.search !== null) {
      closeOwnPanel(cart.setOpen, "search")
      return false
    }
    const el = (e.target as HTMLElement).closest?.<HTMLElement>(TRIGGERS)
    if (!el || !e.currentTarget.contains(el)) return false
    /* A link opened somewhere else, with a modifier, stays a link. */
    if (!inCanvas && el.tagName === "A" && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return false
    e.preventDefault()
    e.stopPropagation()
    if (el.hasAttribute(H.menu)) {
      if (menu.open) { closeMenu(); return true }
      const handle = menuHandleOf(el.getAttribute(H.menu))
      let items = menuDrawerItems(cleanMenus((theme as Record<string, unknown>).menus)[handle], handle)
      /* No menu by that name: the links the section drew itself, so the button still opens something true. */
      if (items.length === 0 && scriptRoot) {
        items = Array.from(scriptRoot.querySelectorAll<HTMLAnchorElement>("nav a[href]")).map((a, i) => ({
          id: `own-${i}`,
          label: (a.textContent ?? "").trim(),
          href: a.getAttribute("href") ?? "#",
          openInNew: a.target === "_blank",
        }))
      }
      setSearchOpen(false)
      cart.setOpen(false)
      setMenu({ open: true, edge: hookEdge(el.getAttribute(H.menuFrom)), items })
      return true
    }
    if (el.hasAttribute(H.search)) {
      closeMenu()
      cart.setOpen(false)
      closeOwnPanel(cart.setOpen, "cart")
      /* The site's own window, in this section or another; the built-in one only when the page has none. */
      if (ownSearchOnPage) {
        if (page.search !== null) closeOwnPanel(cart.setOpen, "search")
        else openOwnPanel(cart.setOpen, "search", section.id, el)
        return true
      }
      setPlaceholder((el.getAttribute(H.search) ?? "").trim() || "Search")
      setSearchOpen(true)
      return true
    }
    closeMenu()
    setSearchOpen(false)
    closeOwnPanel(cart.setOpen, "search")
    /* The site's own panel (this section's, or the page's first), when there is one; the built-in drawer when not. */
    if (ownCartOnPage) {
      if (page.cart !== null) setPanelOpen(false)
      else openOwnPanel(cart.setOpen, "cart", section.id)
    } else cart.setOpen(true)
    return true
  }

  const scheme = sectionColors(section, theme)
  const layers = (
    <>
      {flags.menu && (
        <HeaderMobileNavDrawer
          open={menu.open}
          onClose={closeMenu}
          items={menu.items}
          scheme={scheme}
          menuStyle={menu.edge}
          below={rootRef}
          scopedToPreview={inCanvas}
          onEditorNavigate={inCanvas ? onEditorNavigate : undefined}
        />
      )}
      {flags.cart && hostsCart && (
        <HeaderCartDrawer scheme={scheme} scopedToPreview={inCanvas} onEditorNavigate={inCanvas ? onEditorNavigate : undefined} />
      )}
      {flags.search && !ownSearchOnPage && (
        <SearchModal
          open={searchOpen}
          onClose={closeSearch}
          scheme={scheme}
          radius={buttonRadiusStyle(theme)}
          placeholder={placeholder}
          scopedToPreview={inCanvas}
          onEditorNavigate={inCanvas ? onEditorNavigate : undefined}
        />
      )}
    </>
  )
  return { onTrigger, layers }
}
