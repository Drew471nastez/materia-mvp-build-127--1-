/**
 * ===========================================================================
 *  A PICTURE ARRIVES, IT DOES NOT SNAP IN
 * ===========================================================================
 * The other half of ./media-pass.ts. Every picture and video a section draws
 * carries `data-sl-media`; this marks each one `data-sl-loaded` the moment it
 * has something to show, and the theme's stylesheet fades it from nothing to
 * itself (lib/website-builder/theme-css.ts). What was loading paints in one
 * smooth step instead of top to bottom or all at once with a jump.
 *
 * NEVER A HIDDEN PICTURE. Nothing is hidden until this has started (the root
 * carries `data-sl-fade` only then), so without JavaScript every picture
 * shows as it loads. A picture already loaded is marked at once with no fade,
 * and so is one whose mark something else took off while it stayed loaded.
 * One that fails is marked too, so the browser's own fallback shows. And
 * three seconds after a picture is on screen it is marked, whatever happened.
 *
 * Browser only, no React: use-site-motion.ts installs it on the page root.
 */

/** However slow the network, nothing stays faded out longer than this. */
export const MEDIA_FADE_GIVE_UP_MS = 3_000

function ready(el: HTMLElement): boolean {
  if (el instanceof HTMLImageElement) return el.complete
  if (el instanceof HTMLVideoElement) return el.readyState >= 2 || el.preload === "none" || !!el.poster
  return true
}

export function installMediaFade(root: HTMLElement): () => void {
  const pending = new Set<HTMLElement>()
  const mark = (el: HTMLElement) => {
    pending.delete(el)
    if (!el.hasAttribute("data-sl-loaded")) el.setAttribute("data-sl-loaded", "")
  }
  const onLoad = (e: Event) => {
    const el = e.target as HTMLElement | null
    if (el?.hasAttribute?.("data-sl-media")) mark(el)
  }
  const watch = (el: HTMLElement) => {
    if (el.hasAttribute("data-sl-loaded") || pending.has(el)) return
    if (ready(el)) {
      el.setAttribute("data-sl-loaded", "")
      return
    }
    pending.add(el)
  }
  const scan = (scope: ParentNode) => scope.querySelectorAll<HTMLElement>("[data-sl-media]").forEach(watch)

  /* load and error do not bubble: caught on the way down. */
  root.addEventListener("load", onLoad, true)
  root.addEventListener("loadeddata", onLoad, true)
  root.addEventListener("error", onLoad, true)
  scan(root)
  root.setAttribute("data-sl-fade", "")

  /* Sections drawn later (the canvas, a page opened in place) are watched as they arrive. */
  const mo =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver((records) => {
          for (const r of records) {
            r.addedNodes.forEach((n) => {
              if (!(n instanceof HTMLElement)) return
              if (n.hasAttribute("data-sl-media")) watch(n)
              scan(n)
            })
            if (r.type !== "attributes" || !(r.target instanceof HTMLElement) || !r.target.hasAttribute("data-sl-media")) continue
            if (r.attributeName === "data-sl-loaded") {
              /*
                The mark taken off by something else: a section's markup
                applied again, a script. Put back at once when the picture is
                still loaded, before the frame is painted, so it never blinks
                out; watched again when it is not.
              */
              if (!r.target.hasAttribute("data-sl-loaded")) watch(r.target)
              continue
            }
            /* A new address: it loads again, and is shown when it has. */
            r.target.removeAttribute("data-sl-loaded")
            watch(r.target)
          }
        })
      : null
  mo?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "data-sl-loaded"] })

  /*
    The safety net, counted from when a picture is ON SCREEN: one four
    screens down has not loaded because nobody has scrolled to it, and
    giving up on it early would only make it snap in later.
  */
  const seenAt = new Map<HTMLElement, number>()
  const giveUp = window.setInterval(() => {
    const now = performance.now()
    const height = window.innerHeight
    for (const el of [...pending]) {
      if (ready(el) || !el.isConnected) {
        mark(el)
        continue
      }
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > height) continue
      const first = seenAt.get(el) ?? now
      seenAt.set(el, first)
      if (now - first >= MEDIA_FADE_GIVE_UP_MS) mark(el)
    }
  }, 500)

  return () => {
    root.removeEventListener("load", onLoad, true)
    root.removeEventListener("loadeddata", onLoad, true)
    root.removeEventListener("error", onLoad, true)
    mo?.disconnect()
    window.clearInterval(giveUp)
    root.removeAttribute("data-sl-fade")
    for (const el of pending) el.setAttribute("data-sl-loaded", "")
    pending.clear()
  }
}
