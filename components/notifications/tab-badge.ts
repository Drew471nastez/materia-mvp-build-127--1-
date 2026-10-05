"use client"

/**
 * ===========================================================================
 *  THE BROWSER TAB SAYS WHEN SOMETHING IS WAITING
 * ===========================================================================
 * Round 13, ask 28: "the community tab title shows the unread count
 * '(3) Club name' and the favicon gets a small red dot when there are unread
 * notifications; clears when read". The count is the bell's own (the one
 * shared by every bell on the page, notification-bell.tsx), so the tab, the
 * bell's badge and the list never disagree.
 *
 * THE TITLE: "(3) " in front of whatever the page's title is, "(99+) " past
 * 99, nothing at 0. Next writes the title again on every move between
 * pages, so the head is watched and the count put back in front of the new
 * title (only when it is missing, so the watch never feeds itself).
 *
 * THE ICON: every rel="icon" link (a community's own tab-icon.png, or
 * Storelib's) is drawn once into a 64px canvas with a red dot at its top
 * right, ringed in white so it reads on a dark tab bar too, and the link
 * points at that picture until the count is 0, when it gets its own address
 * back. Drawn once per address and kept. A picture the canvas may not read
 * (another origin without CORS) keeps its icon as it is: the title still
 * says it.
 */
import { useEffect } from "react"

const PREFIX = /^\(\d+\+?\)\s/

/** "(3) Clay Studio" for 3, the title alone for 0. */
export function badgedTitle(title: string, count: number): string {
  const plain = title.replace(PREFIX, "")
  if (!(count > 0)) return plain
  return `(${count > 99 ? "99+" : Math.floor(count)}) ${plain}`
}

/** The same red as the bell's bubble (badge-tone.ts NOTIFICATION_BADGE). */
export const DOT_COLOUR = "#ef4444"

const dotted = new Map<string, Promise<string | null>>()

/** The icon at `href` with the red dot drawn on it, as a data address, or null when it cannot be drawn. */
export function iconWithDot(href: string): Promise<string | null> {
  const known = dotted.get(href)
  if (known) return known
  const made = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => {
      try {
        const size = 64
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        /* A dot a third of the icon wide at its top right, in a white ring that keeps it apart from the picture. */
        const r = 12
        const cx = size - r - 3
        const cy = r + 3
        ctx.beginPath()
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
        ctx.fillStyle = "#ffffff"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = DOT_COLOUR
        ctx.fill()
        resolve(canvas.toDataURL("image/png"))
      } catch {
        /* A picture from another origin taints the canvas: no dot rather than a broken icon. */
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = href
  })
  dotted.set(href, made)
  return made
}

type IconLink = HTMLLinkElement & { dataset: DOMStringMap & { tabBadgeFrom?: string; tabBadgeTo?: string } }

function iconLinks(): IconLink[] {
  return [...document.head.querySelectorAll<IconLink>('link[rel~="icon"]')]
}

/** Every icon link back to its own address. */
function restoreIcons() {
  for (const link of iconLinks()) {
    const from = link.dataset.tabBadgeFrom
    if (from && link.dataset.tabBadgeTo && link.getAttribute("href") === link.dataset.tabBadgeTo) link.setAttribute("href", from)
    delete link.dataset.tabBadgeFrom
    delete link.dataset.tabBadgeTo
  }
}

/**
 * Puts the count in the tab's title and the dot on its icon while `count`
 * is above 0, and takes both away at 0 or when the caller goes. `enabled`
 * false does nothing at all (a bell that does not own the tab).
 */
export function useTabBadge(count: number, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return
    let live = true
    const apply = () => {
      if (!live) return
      const want = badgedTitle(document.title, count)
      if (document.title !== want) document.title = want
      if (count <= 0) return restoreIcons()
      for (const link of iconLinks()) {
        /* A new address from the page (another community's icon) is the one to dot now. */
        if (link.dataset.tabBadgeTo && link.getAttribute("href") === link.dataset.tabBadgeTo) continue
        /* The address as the page wrote it, so it is put back exactly. */
        const from = link.getAttribute("href")
        if (!from || from.startsWith("data:")) continue
        void iconWithDot(from).then((to) => {
          if (!live || !to || link.getAttribute("href") !== from) return
          link.dataset.tabBadgeFrom = from
          link.dataset.tabBadgeTo = to
          link.setAttribute("href", to)
        })
      }
    }
    apply()
    /* Next writes the head again on every page: the count goes back in front of the new title, the dot on the new icon. */
    const watch = new MutationObserver(apply)
    watch.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] })
    return () => {
      live = false
      watch.disconnect()
      const plain = badgedTitle(document.title, 0)
      if (document.title !== plain) document.title = plain
      restoreIcons()
    }
  }, [count, enabled])
}
