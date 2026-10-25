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
  hookEdge,
  hooksIn,
  menuDrawerItems,
  menuHandleOf,
  type HookEdge,
  type HookNavItem,
} from "@/lib/website-builder/storefront-hooks"
import { useSiteCart, lineKey } from "../site-cart"
import { drawerCheckout } from "@/lib/website-builder/cart-checkout"
import { useCartMoney, useStorefront } from "../theme/storefront-context"
import { storeCentsFromShown } from "@/lib/markets/pricing"
import { useDrawerHost } from "../site-drawer-host"
import { buttonRadiusStyle, sectionColors } from "./_shared"
import { HeaderCartDrawer, HeaderMobileNavDrawer } from "./renderers/HeaderSection"
import { SearchModal } from "../header-search-modal"

const TRIGGERS = `[${H.cart}],[${H.search}],[${H.menu}]`
/* A cart of the section's own: its buttons (lib/website-builder/storefront-hooks.ts, A CART OF THE SECTION'S OWN). */
const CART_ACTIONS = `[${H.addToCart}],[${H.checkout}],[${H.cartClose}],[data-line-inc],[data-line-dec],[data-line-remove]`
/** A line copied from the pattern, so the next draw can take it out again. */
const LINE_ITEM = "data-storelib-cart-line-item"

/** Whether a section's markup asks for any of the page's drawers. Most do not, and pay nothing for this. */
export function asksForDrawers(html: string): boolean {
  const f = hooksIn(html)
  return f.cart || f.cartCount || f.search || f.menu || f.addToCart || f.cartPanel
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
  /* The market's currency the page shows, if any: a button's printed price is in it (storeCentsFromShown). */
  const display = useStorefront().display
  /* A section with a cart panel of its own draws that, never the built-in drawer as well. */
  const hostsCart = useDrawerHost(cart.setOpen, section.id, flags.cart && !flags.cartPanel)
  const [panelOpen, setPanelOpen] = useState(false)
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
      const open = el.hasAttribute(H.menu) ? menu.open : el.hasAttribute(H.search) ? searchOpen : flags.cartPanel ? panelOpen : cart.open
      if (el.getAttribute("aria-expanded") !== String(open)) el.setAttribute("aria-expanded", String(open))
      if (el.tagName === "A" && !el.hasAttribute("data-self-nav")) el.setAttribute("data-self-nav", "")
    })
  }, [scriptRoot, html, flags.cartCount, flags.cartPanel, panelOpen, cart.count, cart.ready, cart.open, menu.open, searchOpen])

  /*
    THE SECTION'S OWN CART PANEL, drawn from the site's one cart: open or shut (data-open, aria-hidden, inert), its lines
    copied from the section's own element marked data-storelib-cart-line, the subtotal, and what shows when it is empty. Every
    value is written as text or a checked address, never as markup.
  */
  useLayoutEffect(() => {
    if (!scriptRoot || !flags.cartPanel) return
    scriptRoot.querySelectorAll<HTMLElement>(`[${H.cartPanel}]`).forEach((panel) => {
      const open = String(panelOpen)
      if (panel.getAttribute("data-open") !== open) panel.setAttribute("data-open", open)
      panel.setAttribute("aria-hidden", String(!panelOpen))
      if (panelOpen) panel.removeAttribute("inert")
      else panel.setAttribute("inert", "")
    })
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
  }, [panelOpen])

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

  /** Called from the section's click capture. True when the press was a trigger, and was handled. */
  const onTrigger = (e: MouseEvent<HTMLElement>): boolean => {
    if (onCartAction(e)) return true
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
      setPlaceholder((el.getAttribute(H.search) ?? "").trim() || "Search")
      closeMenu()
      cart.setOpen(false)
      setSearchOpen(true)
      return true
    }
    closeMenu()
    setSearchOpen(false)
    /* The section's own panel, when it has one; the site's drawer when it does not. */
    if (flags.cartPanel) setPanelOpen((o) => !o)
    else cart.setOpen(true)
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
      {flags.search && (
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
