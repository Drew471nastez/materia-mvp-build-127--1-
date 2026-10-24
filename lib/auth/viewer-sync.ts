/**
 * The decision components/auth/viewer-sync.tsx acts on, as a pure function
 * so tests/guest-access-r39.test.ts can walk every case.
 *
 *   server   browser            move
 *   same     same               none
 *   any      could not tell     none (a blip is not a sign out, lib/auth/session-read.ts)
 *   out      in, the app        sync: /auth/sync-session writes the cookie, then back here
 *   out      in, the web        refresh the page's data
 *   in       out                refresh the page's data
 *
 * Never the same move twice in a row for the same page and answer (the key
 * is kept in sessionStorage): if the server still cannot see the session
 * after one go, looping would only make the page blink.
 */
export const VIEWER_SYNC_KEY = "storelib_viewer_sync"

export type ViewerSyncMove = { kind: "none" } | { kind: "refresh"; key: string } | { kind: "sync"; key: string; path: string }

export function viewerSyncMove(input: {
  serverSignedIn: boolean
  read: { signedIn: boolean; unsure: boolean }
  native: boolean
  lastMove: string | null
  path: string
}): ViewerSyncMove {
  if (input.read.unsure) return { kind: "none" }
  if (input.read.signedIn === input.serverSignedIn) return { kind: "none" }
  const kind = input.read.signedIn && input.native ? "sync" : "refresh"
  const key = `${kind}:${input.read.signedIn ? "in" : "out"}:${input.path}`
  if (input.lastMove === key) return { kind: "none" }
  return kind === "sync" ? { kind, key, path: input.path } : { kind, key }
}
