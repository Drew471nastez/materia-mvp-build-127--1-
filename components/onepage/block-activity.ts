"use client"

/**
 * ===========================================================================
 *  EVERY BLOCK IS COUNTED, NOT ONLY THE LINKS (round AL)
 * ===========================================================================
 * The owner: "for each block I want to be able to see analytics and make
 * sure that they are very well tracked". A link, a product, a document, a
 * menu, a booking and a picture's link each called trackClick themselves
 * (components/onepage/public-onepage); a video, a map, a FAQ, a form, a code
 * and the rest were never counted, so their stats were always empty.
 *
 * One listener on the page counts what the blocks do not count themselves,
 * against the block it happened in (each block on the page carries
 * `data-op-block`, its id):
 *
 *   A PRESS     a link, a button, a summary or a submit inside the block
 *   A SUBMIT    a form inside it sent
 *   A PLAY      a video or audio inside it started
 *   AN EMBED    a press inside its frame (a map, a player, a post): the page
 *               sees that as its window losing focus to that frame
 *
 * A block that counted its own press (trackClick, noteTracked) is not
 * counted again: whatever counted in the same moment wins. The server also
 * keeps one count per visit and block (app/api/onepage/track), so a second
 * press in a visit adds nothing either way. Never in the editor's preview.
 */

const DEDUPE_MS = 700
let lastTracked = 0

/** A block counted itself just now (public-onepage trackClick). */
export function noteTracked(): void {
  lastTracked = Date.now()
}

const PRESSABLE = "a[href], button, [role=button], summary, input[type=submit], input[type=button], [data-op-track]"

type Send = (blockId: string, url: string) => void

function blockOf(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>("[data-op-block]") ?? null
}

/** Starts the page's one listener; returns what stops it. */
export function watchBlockActivity(send: Send): () => void {
  if (typeof document === "undefined") return () => {}
  const count = (host: HTMLElement, url: string) => {
    const id = host.getAttribute("data-op-block")
    if (!id) return
    /* After the block's own handlers: a block that counted itself has said so by now. */
    window.setTimeout(() => {
      if (Date.now() - lastTracked < DEDUPE_MS) return
      lastTracked = Date.now()
      send(id, url)
    }, 0)
  }
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null
    const host = blockOf(target)
    if (!host) return
    const pressed = target?.closest(PRESSABLE)
    if (!pressed || !host.contains(pressed) || pressed.closest("[data-no-track]")) return
    count(host, (pressed as HTMLAnchorElement).href || window.location.href)
  }
  const onSubmit = (e: Event) => {
    const host = blockOf(e.target instanceof Element ? e.target : null)
    if (host) count(host, window.location.href)
  }
  const onPlay = (e: Event) => {
    const media = e.target instanceof HTMLMediaElement ? e.target : null
    const host = blockOf(media)
    if (host && media) count(host, media.currentSrc || window.location.href)
  }
  const onBlur = () => {
    /* The frame has focus only once the blur has finished. */
    window.setTimeout(() => {
      const frame = document.activeElement
      if (!(frame instanceof HTMLIFrameElement)) return
      const host = blockOf(frame)
      if (host) count(host, frame.src || window.location.href)
    }, 0)
  }
  document.addEventListener("click", onClick)
  document.addEventListener("submit", onSubmit, true)
  document.addEventListener("play", onPlay, true)
  window.addEventListener("blur", onBlur)
  return () => {
    document.removeEventListener("click", onClick)
    document.removeEventListener("submit", onSubmit, true)
    document.removeEventListener("play", onPlay, true)
    window.removeEventListener("blur", onBlur)
  }
}

/** The same request trackClick sends (app/api/onepage/track), for a block counted here. */
export function postBlockClick(onepageId: string, blockId: string, url: string, ids: { session?: string | null; visitor?: string | null }): void {
  try {
    void fetch("/api/onepage/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        onepage_id: onepageId,
        block_id: blockId,
        event_type: "click",
        url,
        href: window.location.href,
        session_id: ids.session || undefined,
        visitor_id: ids.visitor || undefined,
      }),
    }).catch(() => {})
  } catch {
    /* A count is never worth an error on the page. */
  }
}
