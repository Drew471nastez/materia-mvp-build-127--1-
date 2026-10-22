/**
 * ===========================================================================
 *  A PICTURE THAT IS NOT THERE ANY MORE: A GREY BOX WITH A CAMERA
 * ===========================================================================
 * Round 39, the owner, with a screenshot of a product row in a mini cart: a
 * broken image icon and the alt text "Black Sleeves" spilling out of a small
 * thumbnail. "Make sure they are grey with a camera thumbnail, such as no
 * image available, but not like right now, badly."
 *
 * One answer for every picture Storelib draws, wherever it is drawn:
 *
 *   FAILED     an <img> whose address answers with nothing (deleted, moved,
 *              a host that is down, src=""). The guard below hears the error
 *              (capture phase, so every image on the page, whoever drew it)
 *              and points the same element at FALLBACK_SRC: a camera on a
 *              transparent square. The element keeps its box, so nothing
 *              moves; data-sl-missing gives it the grey (MISSING_IMAGE_CSS),
 *              and since the element now has a picture, no alt text and no
 *              broken icon are ever drawn.
 *   NO SOURCE  an <img> with no address at all (a theme's `src` for a
 *              product without a photo): the same, found when it is added.
 *   NOTHING    a product with no photo, in Storelib's own rows (the cart,
 *              checkout): <MissingImage> (components/media/missing-image.tsx),
 *              the same grey and the same camera as a box of its own.
 *
 * Where the guard runs:
 *   - every page of the app, the live websites drawn by Storelib's own
 *     themes, the website builder and checkout: components/media/
 *     missing-image.tsx MissingImageGuard, in the root layout
 *   - an imported theme's pages, live and on the builder's canvas, which are
 *     whole documents of their own: MISSING_IMAGE_HEAD, written into the
 *     head by lib/storelib-theme/compat/theme.ts renderDocument, before any
 *     image in the body can fail
 *
 * WHAT IT LEAVES ALONE. A picture inside [data-keep-broken-images] (Files,
 * which shows a file that will not draw with its type, on purpose); a
 * lazy picture that has not loaded yet (it has not failed); an <img> waiting
 * for a script to give it its address (data-src, data-srcset). A picture
 * that later gets a working address (a variant picked) loses the grey as it
 * loads.
 *
 * The camera is sized to the box (object-fit: contain on a square with the
 * camera in its middle third), so a 48px cart thumbnail and a product card
 * both read as "no picture" at their own scale.
 */

/** The grey of the box, and its dark counterpart on Storelib's dark buyer pages (html[data-sl-dark]). */
export const MISSING_BG = "#f3f4f6"
export const MISSING_BG_DARK = "#26282c"
/** The camera's grey: readable on both. */
export const MISSING_INK = "#9ca3af"

/** The camera (lucide's), in the middle third of a 100 by 100 square, transparent around it. */
export const CAMERA_PATHS = `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>`
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><g transform="translate(34 34) scale(1.3333)" fill="none" stroke="${MISSING_INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CAMERA_PATHS}</g></svg>`

/** What a failed picture is pointed at. A data address: nothing to fetch, nothing that can fail again. */
export const FALLBACK_SRC = `data:image/svg+xml,${encodeURIComponent(FALLBACK_SVG)}`

/** The attribute a failed picture carries, and the one that keeps a part of a page out of it. */
export const MISSING_ATTR = "data-sl-missing"
export const KEEP_ATTR = "data-keep-broken-images"

/**
 * The grey box. Important, because a theme's own rules for its pictures
 * (object-fit: cover, a background) are written for a photo; only the
 * picture's own box, colour and fit change, never its size or its opacity
 * (a card's second picture, shown on hover, stays hidden until then).
 */
export const MISSING_IMAGE_CSS =
  `img[${MISSING_ATTR}]{background-color:${MISSING_BG}!important;background-image:none!important;object-fit:contain!important;object-position:50% 50%!important;color:transparent!important}` +
  `html[data-sl-dark] img[${MISSING_ATTR}],[data-community-theme="dark"] img[${MISSING_ATTR}]{background-color:${MISSING_BG_DARK}!important}`

/**
 * Listens on `doc` for pictures that fail and points each at `fallback`.
 * Self-contained on purpose (no imports, nothing from outside but its
 * arguments): an imported theme's page runs this very function as text
 * (MISSING_IMAGE_HEAD). Returns the way to stop listening.
 */
export function installMissingImageGuard(doc: Document, fallback: string, mark = "data-sl-missing", keep = "data-keep-broken-images"): () => void {
  const isImg = (n: unknown): n is HTMLImageElement => !!n && (n as Element).nodeType === 1 && (n as Element).tagName === "IMG"
  const kept = (img: HTMLImageElement) => !!(img.closest && img.closest(`[${keep}]`))
  const swap = (img: HTMLImageElement) => {
    if (kept(img) || img.getAttribute("src") === fallback) return
    img.setAttribute(mark, "")
    /* A srcset (or a <picture>'s sources) would be chosen over src: set aside, so the fallback is what draws. */
    const set = img.getAttribute("srcset")
    if (set !== null) {
      img.setAttribute("data-sl-srcset", set)
      img.removeAttribute("srcset")
    }
    const pic = img.parentElement
    if (pic && pic.tagName === "PICTURE") {
      const sources = pic.querySelectorAll("source[srcset]")
      for (let i = 0; i < sources.length; i++) {
        sources[i].setAttribute("data-sl-srcset", sources[i].getAttribute("srcset") || "")
        sources[i].removeAttribute("srcset")
      }
    }
    img.setAttribute("src", fallback)
  }
  /* No address at all, and none coming from a script. */
  const empty = (img: HTMLImageElement) => {
    const src = img.getAttribute("src")
    if (src !== null && src.trim() !== "") return false
    if (img.getAttribute("srcset") || img.hasAttribute("data-src") || img.hasAttribute("data-srcset") || img.hasAttribute("data-lazy-src")) return false
    return !(img.parentElement && img.parentElement.tagName === "PICTURE" && img.parentElement.querySelector("source[srcset]"))
  }
  /* Failed before the guard was there (a page whose script runs after its pictures): finished, and nothing drawn. */
  const failedAlready = (img: HTMLImageElement) => {
    if (!img.complete || img.naturalWidth > 0) return false
    const at = img.currentSrc || img.getAttribute("src") || ""
    if (!at || at === fallback) return false
    /* A drawing without a size of its own can read 0 wide and still be fine. */
    return !/^data:image\/svg|\.svg(?:[?#]|$)/i.test(at)
  }
  const check = (img: HTMLImageElement) => {
    if (img.hasAttribute(mark) || kept(img)) return
    if (empty(img) || failedAlready(img)) swap(img)
  }
  const scan = (root: ParentNode) => {
    const list = root.querySelectorAll("img")
    for (let i = 0; i < list.length; i++) check(list[i])
  }
  const onError = (e: Event) => {
    if (isImg(e.target)) swap(e.target)
  }
  /* A new, working address (a variant chosen, a lazy picture filled in): a photo again. */
  const onLoad = (e: Event) => {
    const img = e.target
    if (isImg(img) && img.hasAttribute(mark) && img.getAttribute("src") !== fallback) img.removeAttribute(mark)
  }
  doc.addEventListener("error", onError, true)
  doc.addEventListener("load", onLoad, true)
  let observer: MutationObserver | null = null
  const start = () => {
    if (doc.body) scan(doc.body)
    const MO = doc.defaultView && (doc.defaultView as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver
    if (!MO || !doc.body) return
    observer = new MO((records) => {
      for (let r = 0; r < records.length; r++) {
        const rec = records[r]
        if (rec.type === "attributes") {
          if (isImg(rec.target)) check(rec.target)
          continue
        }
        const added = rec.addedNodes
        for (let i = 0; i < added.length; i++) {
          const n = added[i]
          if (isImg(n)) check(n)
          else if (n.nodeType === 1 && (n as Element).querySelector) scan(n as Element)
        }
      }
    })
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] })
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true })
  else start()
  return () => {
    doc.removeEventListener("error", onError, true)
    doc.removeEventListener("load", onLoad, true)
    doc.removeEventListener("DOMContentLoaded", start)
    if (observer) observer.disconnect()
  }
}

/**
 * The same, for a page that is a document of its own (an imported theme's,
 * live and on the canvas): the grey and the guard, for its head. The guard
 * runs before the body is read, so no picture can fail unheard.
 */
export const MISSING_IMAGE_HEAD =
  `<style data-sl-missing-image>${MISSING_IMAGE_CSS}</style>` +
  `<script data-sl-missing-image>(${installMissingImageGuard.toString()})(document,${JSON.stringify(FALLBACK_SRC)});</script>`
