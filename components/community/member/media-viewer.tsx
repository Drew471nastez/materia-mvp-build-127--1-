"use client"

/**
 * ===========================================================================
 *  PICTURES AND VIDEOS OPEN IN THE APP, NEVER AS A BARE FILE IN A TAB
 * ===========================================================================
 * Before round 8 a picture linked in a comment, a chat, a message, the about
 * page or a lesson's notes opened its raw storage address (supabase.co) in
 * a new tab: a white page with a picture on it, and in the iOS and Android
 * apps a browser sheet over the app. Now every such press opens the
 * community's own viewer (lightbox.tsx) over the page, with Escape, Back
 * and a swipe down to close and the other pictures of the same text a swipe
 * away.
 *
 *   openMediaViewer   opens the viewer from anywhere, with no state of its
 *                     own to keep (a lesson's file, a post's picture file)
 *   MediaLinks        drawn once by the community's frame (shell.tsx): one
 *                     listener on the page that turns a press on a link to
 *                     a picture or a video file, or on a picture in written
 *                     text (the about page, an event, a lesson), into the
 *                     viewer. A press with a modifier key, a middle press, a
 *                     link marked `download` or `data-no-viewer`, and
 *                     anything a component already handled are left alone.
 */
import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { viewerItemForUrl, type ViewerItem } from "@/lib/communities/post-media"
import { Lightbox } from "./lightbox"

let current: { root: Root; host: HTMLElement } | null = null

function closeCurrent(): void {
  const was = current
  current = null
  if (!was) return
  /* Taken off after the frame that asked, never inside React's own render. */
  window.setTimeout(() => {
    was.root.unmount()
    was.host.remove()
  }, 0)
}

/** Opens the viewer at `start` over whatever is on screen. */
export function openMediaViewer(items: ViewerItem[], start = 0, opts: { communityId?: string; autoplay?: boolean } = {}): void {
  if (typeof document === "undefined" || !items.length) return
  closeCurrent()
  const host = document.createElement("div")
  host.setAttribute("data-media-viewer-host", "")
  document.body.appendChild(host)
  const root = createRoot(host)
  const mine = { root, host }
  current = mine
  root.render(
    <Lightbox
      items={items}
      start={Math.max(0, Math.min(start, items.length - 1))}
      communityId={opts.communityId ?? ""}
      autoplay={opts.autoplay}
      onClose={() => {
        if (current === mine) closeCurrent()
      }}
    />,
  )
}

/** The written text a press came from: the pictures and media links in it make one set to swipe through. */
const TEXT_SCOPE = ".storelib-prose, [data-media-scope], [data-comment], [data-chat-message], [data-thread-list] li, [data-post]"

function sameOrigin(url: URL): boolean {
  return url.origin === window.location.origin
}

/** What a link or a picture in text would show, or null. */
function itemOf(el: Element): ViewerItem | null {
  if (el instanceof HTMLAnchorElement) {
    if (el.hasAttribute("download") || el.closest("[data-no-viewer]")) return null
    const href = el.getAttribute("href")
    if (!href) return null
    let url: URL
    try {
      url = new URL(href, window.location.href)
    } catch {
      return null
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    /* A route of our own (a member only file) is shown as it is, never through the optimizer. */
    return viewerItemForUrl(url.toString(), sameOrigin(url))
  }
  if (el instanceof HTMLImageElement) {
    const src = el.currentSrc || el.src
    if (!src || src.startsWith("data:")) return null
    /* The picture as it was written, not the optimizer's copy of it. */
    let original = src
    try {
      const u = new URL(src, window.location.href)
      if (u.pathname === "/_next/image" && u.searchParams.get("url")) original = new URL(u.searchParams.get("url")!, window.location.href).toString()
    } catch {
      /* kept */
    }
    return { kind: "image", url: original, w: el.naturalWidth || undefined, h: el.naturalHeight || undefined }
  }
  return null
}

/** The pictures and media links of one written text, in reading order, and where the pressed one sits. */
function setFrom(scope: Element | null, pressed: Element): { items: ViewerItem[]; start: number } | null {
  const own = itemOf(pressed)
  if (!own) return null
  if (!scope) return { items: [own], start: 0 }
  const items: ViewerItem[] = []
  let start = 0
  for (const el of scope.querySelectorAll("a[href], img")) {
    if (el instanceof HTMLImageElement && el.closest("a[href], button")) continue
    if (el instanceof HTMLImageElement && !el.closest(".storelib-prose")) continue
    if (el.closest("[data-lightbox], [data-no-viewer]")) continue
    const item = el === pressed ? own : itemOf(el)
    if (!item) continue
    if (el === pressed) start = items.length
    items.push(item)
  }
  return items.length ? { items, start } : { items: [own], start: 0 }
}

export function MediaLinks({ communityId }: { communityId: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as Element | null
      if (!target || target.closest("[data-lightbox], [data-media-viewer-host]")) return
      const link = target.closest("a[href]")
      let pressed: Element | null = null
      if (link) pressed = itemOf(link) ? link : null
      else if (target instanceof HTMLImageElement && target.closest(".storelib-prose") && !target.closest("button")) pressed = target
      if (!pressed) return
      const set = setFrom(pressed.closest(TEXT_SCOPE), pressed)
      if (!set) return
      e.preventDefault()
      openMediaViewer(set.items, set.start, { communityId, autoplay: set.items[set.start]?.kind === "clip" })
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [communityId])
  return null
}
