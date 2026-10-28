/**
 * ===========================================================================
 *  A SESSION HANDED TO THE SERVER IN A FORM BODY, NEVER IN AN ADDRESS
 * ===========================================================================
 * /auth/sync-session writes a session the browser or the app holds into the
 * cookies the server reads. It used to be reached as
 * /auth/sync-session?access_token=…&refresh_token=…, and a request's address
 * is written to Vercel's request log, so every native sign in, every
 * recovery and every viewer sync put a working refresh token in the logs.
 *
 * Now every way there is a same origin form post (app/auth/sync-session
 * POST, which refuses another origin). The sign in flows still build their
 * destination as one string (lib/auth/native-session.ts syncSessionHref,
 * lib/auth/continue-client.ts afterAuthUrl), because that is what they hand
 * each other; `goToAuthHref` is what navigates to it, and it turns a
 * sync-session string into the post. The string never leaves the page.
 *
 * Capacitor: the app's pages are storelib.com itself (server.url), so the
 * post is same origin there too, and a deep link return (lib/native-oauth.ts)
 * lands on a storelib.com page before it navigates.
 */
const SYNC_PATH = "/auth/sync-session"

export function postSessionSync(session: { access_token: string; refresh_token: string }, nextPath: string): void {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = SYNC_PATH
  form.style.display = "none"
  for (const [name, value] of [
    ["access_token", session.access_token],
    ["refresh_token", session.refresh_token],
    ["next", nextPath],
  ] as const) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

/** The tokens and the next path, when `href` is a sync-session address that carries them. */
export function syncTargetOf(href: string): { access_token: string; refresh_token: string; next: string } | null {
  if (!href.startsWith(`${SYNC_PATH}?`)) return null
  const q = new URLSearchParams(href.slice(SYNC_PATH.length + 1))
  const access_token = q.get("access_token")
  const refresh_token = q.get("refresh_token")
  if (!access_token || !refresh_token) return null
  return { access_token, refresh_token, next: q.get("next") ?? "" }
}

/** For a log line: a sync-session address without its tokens. */
export function hrefForLog(href: string): string {
  const t = syncTargetOf(href)
  return t ? `${SYNC_PATH} (post) -> ${t.next}` : href.split("?")[0]
}

/**
 * Go to where a sign in flow decided. A sync-session address is posted; any
 * other is navigated to as before (`replace` keeps it out of history).
 */
export function goToAuthHref(href: string, { replace = false }: { replace?: boolean } = {}): void {
  const t = syncTargetOf(href)
  if (t) return postSessionSync(t, t.next)
  if (replace) window.location.replace(href)
  else window.location.assign(href)
}
