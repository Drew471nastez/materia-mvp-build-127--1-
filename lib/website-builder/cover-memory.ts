"use client"

/**
 * ===========================================================================
 *  THE LAST COVER EACH WEBSITE SHOWED, KEPT FOR THE WAY BACK
 * ===========================================================================
 * "Sometimes when I go back from the website builder editor to the website
 * builder page, the cover is gray, and then it shows the cover, but it takes
 * so long and glitches."
 *
 * The cover is a 1440px screenshot. Coming back from the editor the page is
 * drawn again, and its <img> started from nothing: a picture the tab had
 * already shown was decoded again, off the main thread, so the first frames
 * were the frame's grey. And when the editor had just taken a new picture,
 * the page was handed that new address at once, and drew grey until a file it
 * had never fetched arrived, then faded it in: grey, then a fade.
 *
 * So each website's last whole cover is remembered here, the address of a
 * picture this tab has seen load: in memory for the tab, and in
 * sessionStorage for a reload (the file is still in the browser's cache
 * then). The page draws that picture first, on its first frame, inside the
 * box it already reserves. A newer address is fetched and decoded aside
 * (decodeCover) and only then put on screen, in one crossfade. A picture
 * that cannot be fetched never replaces one that could.
 *
 * Nothing here decides which cover is current: the page and cover-refresh do
 * that. This only makes sure what goes on screen is ready to be drawn.
 */

const STORE = "storelib.website.covers.v1"
/** A handful of websites per library; a few more for a tab that switched accounts. */
const MAX_KEPT = 24

type Shown = { url: string; at: number }

let memory: Map<string, Shown> | null = null
/** Pictures this tab has fetched and decoded: drawn with decoding="sync", on the frame they are put on screen. */
const decoded = new Set<string>()
const decoding = new Map<string, Promise<boolean>>()

function all(): Map<string, Shown> {
  if (memory) return memory
  memory = new Map()
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "[]") as Array<[string, Shown]>
    for (const [id, s] of saved) if (id && s && typeof s.url === "string") memory.set(id, s)
  } catch {
    /* nothing kept, or storage closed: the page draws what the server says, as before */
  }
  return memory
}

function save() {
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...all().entries()]))
  } catch {
    /* full or closed: memory still has it for this visit */
  }
}

/** The last cover this website showed whole in this tab (or before a reload), or null. */
export function shownCover(installId: string): string | null {
  return all().get(installId)?.url ?? null
}

/** This website's cover has been drawn whole: the next visit starts from it. */
export function rememberCover(installId: string, url: string) {
  if (!installId || !url) return
  decoded.add(url)
  const map = all()
  if (map.get(installId)?.url === url) return
  map.delete(installId)
  map.set(installId, { url, at: Date.now() })
  while (map.size > MAX_KEPT) map.delete(map.keys().next().value as string)
  save()
}

/** Whether this tab has decoded this picture already, so it can be drawn on the frame it is put on screen. */
export function isDecoded(url: string | null | undefined): boolean {
  return !!url && decoded.has(url)
}

/**
 * Fetch and decode a picture before it is shown. Resolves true once it can
 * be drawn at once, false if it failed or took longer than `within`: a slow
 * picture never holds up what waits on it past that, the page keeps the
 * picture it has.
 */
export function decodeCover(url: string, within = 10_000): Promise<boolean> {
  if (decoded.has(url)) return Promise.resolve(true)
  let going = decoding.get(url)
  if (!going) {
    going = new Promise<boolean>((resolve) => {
      if (typeof Image === "undefined") return resolve(false)
      const img = new Image()
      img.decoding = "async"
      img.src = url
      img.decode().then(
        () => {
          decoded.add(url)
          resolve(true)
        },
        () => resolve(false),
      )
    }).finally(() => decoding.delete(url))
    decoding.set(url, going)
  }
  let timer: number | undefined
  return Promise.race([
    going,
    new Promise<boolean>((resolve) => {
      timer = window.setTimeout(() => resolve(false), within)
    }),
  ]).finally(() => window.clearTimeout(timer))
}

/**
 * The covers the Website page will draw first, fetched ahead: called when the
 * pointer or the finger comes near the Website row (lib/ui/app-navigation
 * prefetchAppPage), so the picture is in the browser's memory by the time
 * the page is. Only what this tab has shown before; nothing is asked of the
 * server here.
 */
export function warmCovers() {
  try {
    /* A library is five websites; the six last shown are all a visit draws first. */
    for (const { url } of [...all().values()].slice(-6)) void decodeCover(url, 8000)
  } catch {
    /* a warm that fails is a picture that loads with the page, nothing worse */
  }
}
