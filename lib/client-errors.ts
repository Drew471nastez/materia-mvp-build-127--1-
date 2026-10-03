/**
 * ===========================================================================
 *  A COMPONENT THAT THROWS MUST NOT TAKE THE WHOLE SITE WITH IT
 * ===========================================================================
 * "Application error: a client-side exception has occurred" is what Next.js
 * paints when a client component throws and NOTHING CATCHES IT. It is not a
 * message; it is the absence of one. The page is gone, the navigation is
 * gone, there is no way back except the address bar, and the person reading
 * it cannot tell anybody what happened because the sentence is the same
 * sentence for every possible cause.
 *
 * It is the default because this app had no root error boundary: not
 * app/error.tsx, not app/global-error.tsx. Two files existed, for /explore
 * and one auth callback, so exactly two routes degraded gracefully and every
 * other route in the product went blank.
 *
 * ---------------------------------------------------------------------------
 *  THE ONE CAUSE THAT IS NOT A BUG
 * ---------------------------------------------------------------------------
 * A deploy renames every JavaScript chunk. A tab that was opened before the
 * deploy still holds the old names, so the next lazy import asks for a file
 * that no longer exists, and a failed import throws exactly like any other
 * error: the site goes blank for somebody who did nothing wrong, on a version
 * of the code that was fine a minute ago. Three deploys in an afternoon makes
 * this likely rather than rare.
 *
 * That one heals itself by loading the page again, so it does, ONCE. The
 * one-shot matters: a reload loop on a page that cannot load is worse than
 * the error, so the attempt is recorded before it happens and a second
 * failure shows the message instead.
 *
 * PURE, and it takes its storage and its reloader as arguments, so the whole
 * decision is driven in tests/client-errors.test.ts rather than believed.
 */

/** Where the one-shot reload records itself. Per tab, not per browser. */
export const RELOAD_KEY = "storelib:chunk-reload"

/**
 * Whether this is the browser failing to fetch code, rather than the code
 * failing.
 *
 * Matched on several spellings because every engine words it differently and
 * webpack, Turbopack and the native loader all have their own. A false
 * positive costs one page load; a false negative costs a blank screen.
 */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null | undefined
  const name = typeof e?.name === "string" ? e.name : ""
  const message = typeof e?.message === "string" ? e.message : ""
  const text = `${name} ${message}`
  return (
    /ChunkLoadError/i.test(name) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Loading CSS chunk/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(text) ||
    /*
      TURBOPACK'S OWN WORDS. Next 16 builds with Turbopack, whose runtime
      throws a plain Error("Failed to load chunk /_next/static/chunks/….js
      from module …"), no ChunkLoadError name and none of the wordings
      above. So every stale tab since the switch was reported as a fault
      ("[client-error] … Failed to load chunk … ?dpl=…" on /explore,
      /checkout, creator pages and the blog) and never reloaded.
    */
    /Failed to load chunk /i.test(text)
  )
}

/**
 * "Load failed" is Safari's whole message for a fetch that never finished. A
 * script that could not load can end that way, and so can a dropped
 * connection, a phone that slept mid request, or a page being left. On its
 * own it is too vague to act on (it used to count anywhere inside /app, which
 * reloaded the dashboard for a dropped connection), so it counts only once
 * this tab knows a newer deploy is live (lib/ui/new-deploy.ts): the one case
 * where loading the page again is what fixes it.
 */
export function isLoadFailed(error: unknown): boolean {
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : ""
  return message.trim() === "Load failed"
}

/** A failure a reload fixes: code a deploy removed, or "Load failed" once a newer deploy is known. */
export function isStaleCodeError(error: unknown, newDeploy: boolean = false): boolean {
  return isChunkLoadError(error) || (newDeploy && isLoadFailed(error))
}

export interface ReloadStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Whether to quietly load the page again instead of showing an error.
 *
 * Only for a stale chunk, only once per tab, and never when the storage
 * cannot be read: a browser with storage blocked would otherwise reload for
 * ever, because "have I already tried" would always answer no.
 */
export function shouldReloadForStaleCode(
  error: unknown,
  store: ReloadStore | null | undefined,
  /** A newer deploy is known to be live (lib/ui/new-deploy.ts). */
  newDeploy: boolean = false,
  now: number = Date.now(),
): boolean {
  if (!isStaleCodeError(error, newDeploy)) return false
  if (!store) return false
  try {
    /*
      ONCE PER DEPLOY, NOT ONCE PER TAB FOREVER. A tab that reloaded for this
      morning's deploy must be able to reload for this afternoon's, so a
      record older than RELOAD_AGAIN_MS no longer counts. A page that fails
      again straight after its reload finds the record and shows the error.
    */
    const last = Number(store.getItem(RELOAD_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_AGAIN_MS) return false
    store.setItem(RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/** How long one reload counts for: longer than any page takes to fail again, shorter than the gap between deploys. */
export const RELOAD_AGAIN_MS = 10 * 60_000

/**
 * What to tell the person looking at it.
 *
 * Never the exception's own message. It is written for whoever wrote the
 * code, it can carry an id or a fragment of a query in it, and "undefined is
 * not an object" tells a creator nothing they can act on. What they get is
 * what happened, what to do, and the digest, which is the one string that
 * makes the next report findable in the logs.
 */
export function describeForUser(error: unknown): { title: string; detail: string; digest: string | null } {
  const digest = typeof (error as { digest?: unknown })?.digest === "string" ? (error as { digest: string }).digest : null
  if (isChunkLoadError(error)) {
    return {
      title: "This page is out of date",
      detail: "Storelib updated while this tab was open. Loading it again picks up the new version.",
      digest,
    }
  }
  return {
    title: "Something went wrong on this page",
    detail: "The rest of Storelib is still working, and your saved work is not affected.",
    digest,
  }
}

/**
 * What is sent to the server when a boundary catches something.
 *
 * DELIBERATELY NARROW. No cookies, no headers, no form values, no local
 * storage, no user record: a crash report is not a reason to collect any of
 * that, and a report that carries a session is a report that must never be
 * logged. The message can carry whatever the throwing code put in it, so it
 * is truncated and the query string is dropped from the path.
 */
export interface ClientErrorReport {
  message: string
  digest: string | null
  path: string
  /** True when this was a stale chunk rather than a fault in the code. */
  stale: boolean
}

export function buildReport(error: unknown, href: string, newDeploy: boolean = false): ClientErrorReport {
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "Unknown error"
  let path = "/"
  try {
    path = new URL(href, "https://storelib.com").pathname
  } catch {
    path = "/"
  }
  return {
    message: message.slice(0, 300),
    digest: typeof (error as { digest?: unknown })?.digest === "string" ? (error as { digest: string }).digest : null,
    path: path.slice(0, 200),
    stale: isStaleCodeError(error, newDeploy),
  }
}
