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
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"

import { cleanMenus } from "@/lib/storelib-theme/values"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import {
  STOREFRONT_HOOKS as H,
  cartCountText,
  hookEdge,
  hooksIn,
  menuDrawerItems,
  menuHandleOf,
  type HookEdge,
  type HookNavItem,
} from "@/lib/website-builder/storefront-hooks"
import { useSiteCart } from "../site-cart"
import { useDrawerHost } from "../site-drawer-host"
import { buttonRadiusStyle, sectionColors } from "./_shared"
import { HeaderCartDrawer, HeaderMobileNavDrawer } from "./renderers/HeaderSection"
import { SearchModal } from "../header-search-modal"

const TRIGGERS = `[${H.cart}],[${H.search}],[${H.menu}]`

/** Whether a section's markup asks for any of the page's drawers. Most do not, and pay nothing for this. */
export function asksForDrawers(html: string): boolean {
  const f = hooksIn(html)
  return f.cart || f.cartCount || f.search || f.menu
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
  const hostsCart = useDrawerHost(cart.setOpen, section.id, flags.cart)
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
      const open = el.hasAttribute(H.menu) ? menu.open : el.hasAttribute(H.search) ? searchOpen : cart.open
      if (el.getAttribute("aria-expanded") !== String(open)) el.setAttribute("aria-expanded", String(open))
      if (el.tagName === "A" && !el.hasAttribute("data-self-nav")) el.setAttribute("data-self-nav", "")
    })
  }, [scriptRoot, html, flags.cartCount, cart.count, cart.ready, cart.open, menu.open, searchOpen])

  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  /** Called from the section's click capture. True when the press was a trigger, and was handled. */
  const onTrigger = (e: MouseEvent<HTMLElement>): boolean => {
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
    cart.setOpen(true)
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
