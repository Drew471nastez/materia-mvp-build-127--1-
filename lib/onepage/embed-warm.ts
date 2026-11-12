/**
 * ===========================================================================
 *  AN EMBED STARTS ARRIVING BEFORE THE TAP LANDS (round AS)
 * ===========================================================================
 * The owner: "Opening a sheet (the Spotify block) shows the sheet, but the
 * embed inside appears with a delay." The sheet rose at once; the player
 * inside only began to be asked for once the tap had landed, and every
 * service's player asks a second and third host for its script and
 * pictures, each a new connection on a phone.
 *
 * Three steps earlier than the tap, each cheaper than the next:
 *
 *   ON SCREEN     a button that opens an embed has been on screen for a
 *                 moment: its service's hosts are looked up and connected
 *                 to (preconnect), once per host, a handful at most.
 *   POINTED AT    a mouse resting on it or a finger coming down on it (focus
 *                 only connects): the same, at once, and the sheet's content is
 *                 started in a hidden sheet (components/onepage/block-sheet
 *                 prewarm), so the player is loading while the finger is
 *                 still down and is there when the sheet rises.
 *   OPENED BEFORE a sheet closed with an embed in it is kept, hidden, and
 *                 shown again on the next tap without asking again
 *                 (components/onepage/block-sheet, KEPT).
 *
 * A player that plays on its own (a video opened in the sheet) is never
 * started early: only its connections are.
 *
 * The connections are plain `preconnect` links with no crossorigin: a frame's
 * document is not a CORS request, and a connection opened as one is not
 * reused for it (the button's own warm-up asked with crossorigin before).
 */

/** The hosts a service's player draws from, by the address the creator gave (or the player's own). */
const HOSTS: Array<[RegExp, string[]]> = [
  [/(^|\.)spotify\.com$/, ["https://open.spotify.com", "https://open.spotifycdn.com", "https://i.scdn.co", "https://encore.scdn.co"]],
  [/(^|\.)soundcloud\.com$/, ["https://w.soundcloud.com", "https://api-widget.soundcloud.com", "https://i1.sndcdn.com"]],
  [/(^|\.)music\.apple\.com$/, ["https://embed.music.apple.com", "https://js-cdn.music.apple.com", "https://is1-ssl.mzstatic.com"]],
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://www.google.com"]],
  [/(^|\.)vimeo\.com$/, ["https://player.vimeo.com", "https://f.vimeocdn.com", "https://i.vimeocdn.com"]],
  [/(^|\.)tiktok\.com$/, ["https://www.tiktok.com", "https://sf16-website-login.neutral.ttwstatic.com"]],
  [/(^|\.)(x\.com|twitter\.com)$/, ["https://platform.twitter.com", "https://syndication.twitter.com", "https://pbs.twimg.com", "https://abs.twimg.com"]],
  [/(^|\.)instagram\.com$/, ["https://www.instagram.com", "https://static.cdninstagram.com"]],
  [/(^|\.)calendly\.com$/, ["https://calendly.com", "https://assets.calendly.com"]],
  [/(^|\.)google\.[a-z.]+$/, ["https://maps.google.com", "https://www.google.com", "https://maps.gstatic.com", "https://maps.googleapis.com"]],
  [/(^|\.)deezer\.com$/, ["https://widget.deezer.com", "https://e-cdns-images.dzcdn.net"]],
  [/(^|\.)tidal\.com$/, ["https://embed.tidal.com", "https://resources.tidal.com"]],
]

/** The hosts to connect to for an address: its service's, or its own. Pure, for the tests. */
export function embedOrigins(url: string | null | undefined, here?: string): string[] {
  const text = (url || "").trim()
  if (!text) return []
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return []
  }
  if (u.protocol !== "https:") return []
  const host = u.hostname.toLowerCase()
  for (const [match, origins] of HOSTS) if (match.test(host)) return origins
  if (here && u.origin === here) return []
  return [u.origin]
}

/* Once per host, and never more than this many for one page: each is a socket kept open. */
export const MAX_WARM = 16
const warmed = new Set<string>()

/** Connect to the hosts an address's player will need, now. Safe to call on every pointer move. */
export function warmConnections(url: string | null | undefined): void {
  if (typeof document === "undefined") return
  for (const origin of embedOrigins(url, window.location.origin)) {
    if (warmed.has(origin) || warmed.size >= MAX_WARM) continue
    warmed.add(origin)
    try {
      for (const rel of ["dns-prefetch", "preconnect"]) {
        const link = document.createElement("link")
        link.rel = rel
        link.href = origin
        link.dataset.embedWarm = ""
        document.head.appendChild(link)
      }
    } catch {
      /* no head to add to: the tap still loads it */
    }
  }
}

/* ── On screen: one observer for every button on the page. ── */

/** How long a button stays on screen before its hosts are warmed: a scroll past is not a look. */
export const WARM_ON_VIEW_MS = 600
/** How long a mouse rests on a button before its sheet is started: a sweep across the list is not a choice. */
export const HOVER_INTENT_MS = 90

let viewer: IntersectionObserver | null = null
const watched = new Map<Element, { url: string; timer: number }>()

function onView(entries: IntersectionObserverEntry[]) {
  for (const e of entries) {
    const w = watched.get(e.target)
    if (!w) continue
    window.clearTimeout(w.timer)
    if (!e.isIntersecting) continue
    w.timer = window.setTimeout(() => {
      warmConnections(w.url)
      viewer?.unobserve(e.target)
      watched.delete(e.target)
    }, WARM_ON_VIEW_MS)
  }
}

function watchView(el: Element, url: string): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {}
  viewer ??= new IntersectionObserver(onView)
  watched.set(el, { url, timer: 0 })
  viewer.observe(el)
  return () => {
    const w = watched.get(el)
    if (w) window.clearTimeout(w.timer)
    watched.delete(el)
    viewer?.unobserve(el)
  }
}

export interface WarmProps {
  ref: (el: HTMLElement | null) => void
  onPointerEnter: (e: { pointerType: string }) => void
  onPointerLeave: () => void
  onPointerDown: () => void
  onFocus: () => void
}

/**
 * What a button that opens an embed spreads on itself: its hosts warmed once
 * it has been on screen, and on a pointer or focus; `start`, when given,
 * starts the sheet's content hidden on a press or a resting mouse.
 */
export function warmEmbed(url: string | null | undefined, start?: (() => void) | null): WarmProps {
  let stop: (() => void) | null = null
  let intent = 0
  const now = () => {
    window.clearTimeout(intent)
    warmConnections(url)
    start?.()
  }
  return {
    ref: (el) => {
      stop?.()
      stop = el && url ? watchView(el, url) : null
    },
    onPointerEnter: (e) => {
      warmConnections(url)
      if (e.pointerType !== "mouse" || !start) return
      window.clearTimeout(intent)
      intent = window.setTimeout(start, HOVER_INTENT_MS)
    },
    onPointerLeave: () => window.clearTimeout(intent),
    onPointerDown: now,
    /* Focus only connects: focus also comes back to the button when its sheet closes, which is no reason to start it again. */
    onFocus: () => warmConnections(url),
  }
}

/*
 * ── Pausing a kept player (KEPT, components/onepage/block-sheet). ──
 * A sheet kept hidden must not go on playing. Each service's own player
 * takes a pause by message; a frame whose service takes none is not kept.
 */
const PAUSE: Array<{ match: RegExp; message: unknown }> = [
  { match: /^https:\/\/open\.spotify\.com$/, message: { command: "pause" } },
  { match: /^https:\/\/w\.soundcloud\.com$/, message: JSON.stringify({ method: "pause" }) },
  { match: /^https:\/\/www\.youtube(-nocookie)?\.com$/, message: JSON.stringify({ event: "command", func: "pauseVideo", args: "" }) },
  { match: /^https:\/\/player\.vimeo\.com$/, message: JSON.stringify({ method: "pause" }) },
  { match: /^https:\/\/www\.tiktok\.com$/, message: { type: "pause", "x-tiktok-player": true } },
]

/* Frames that never play anything: a map, a post, a booking page, a form. */
const SILENT = /^https:\/\/(maps\.google\.com|www\.google\.com|platform\.twitter\.com|www\.instagram\.com|calendly\.com|app\.cal\.com|cal\.com|tally\.so|form\.typeform\.com|[a-z0-9-]+\.typeform\.com|docs\.google\.com)$/

export type KeepAnswer = "silent" | "pausable" | "no"

/** Whether a frame at this address can be kept hidden: it plays nothing, or it can be told to pause. Pure. */
export function keepableFrame(src: string | null | undefined, here?: string): KeepAnswer {
  if (!src) return "no"
  let origin: string
  try {
    origin = new URL(src, here || "https://storelib.com").origin
  } catch {
    return "no"
  }
  if (here && origin === here) return "silent"
  if (SILENT.test(origin)) return "silent"
  if (PAUSE.some((p) => p.match.test(origin))) return "pausable"
  return "no"
}

/** Tell every player in `root` to pause. */
export function pauseFrames(root: ParentNode | null): void {
  if (!root) return
  for (const f of Array.from(root.querySelectorAll("iframe"))) {
    let origin = ""
    try {
      origin = new URL(f.src, window.location.href).origin
    } catch {
      continue
    }
    const p = PAUSE.find((x) => x.match.test(origin))
    if (!p) continue
    try {
      f.contentWindow?.postMessage(p.message, origin)
    } catch {
      /* gone already */
    }
  }
}

/** Whether a sheet's content can be kept hidden for the next tap: it holds a frame, and every frame in it can be. */
export function keepableSheet(root: ParentNode | null): boolean {
  if (!root || typeof window === "undefined") return false
  const frames = Array.from(root.querySelectorAll("iframe"))
  if (!frames.length) return false
  return frames.every((f) => keepableFrame(f.getAttribute("src"), window.location.origin) !== "no")
}
