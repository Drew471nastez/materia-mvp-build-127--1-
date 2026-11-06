/**
 * ===========================================================================
 *  "ONE MOMENT": A PAGE THAT TRIES AGAIN BY ITSELF, A FEW TIMES
 * ===========================================================================
 * A website page whose database read failed, with no copy kept to serve,
 * answers 503 with a page that reloads itself. It reloaded every 5 seconds
 * for as long as the tab stayed open: a tab left on it redrew the whole
 * site twelve times a minute, all day (round 55). Now each wait doubles,
 * from 5 seconds, the count rides in the address (ONE_MOMENT_PARAM) and
 * after ONE_MOMENT_TRIES the page stops and says to reload. The address
 * keeps its own query, so the page that comes back is the one asked for.
 *
 * No script: a meta refresh works under any content security policy.
 */

/** How many times the page reloads itself before it stops. */
export const ONE_MOMENT_TRIES = 6

/** The address's count of reloads. */
export const ONE_MOMENT_PARAM = "sl_try"

/** Seconds before reload number `tries` (0 for the first), or null once it should stop. */
export function oneMomentDelay(tries: number): number | null {
  if (!Number.isFinite(tries) || tries < 0) tries = 0
  if (tries >= ONE_MOMENT_TRIES) return null
  return 5 * 2 ** Math.floor(tries)
}

const STYLE = "body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif;color:#1a1a2e;background:#f8f9fa}p{margin:0;color:#6b7280}"

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The page, for the browser's own query `search` (with or without "?"):
 * a refresh to the same page with the next count, or none after the last.
 */
export function oneMomentHtml(search: string | URLSearchParams = ""): string {
  const params = new URLSearchParams(search)
  const tries = Number(params.get(ONE_MOMENT_PARAM)) || 0
  const wait = oneMomentDelay(tries)
  params.set(ONE_MOMENT_PARAM, String(tries + 1))
  const refresh = wait === null ? "" : `<meta http-equiv="refresh" content="${wait};url=${escapeAttr(`?${params.toString()}`)}">`
  const line = wait === null ? "Reload the page to try again." : "This page will load again by itself."
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}<title>One moment</title><style>${STYLE}</style></head><body><main><h1 style="font-size:20px;margin:0 0 6px">One moment</h1><p>${line}</p></main></body></html>`
}
