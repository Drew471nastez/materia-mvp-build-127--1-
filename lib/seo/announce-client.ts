"use client"

/**
 * After a product or a profile has been SAVED, tell the server so it can
 * tell the search engines (app/api/seo/indexnow). Fire and forget: nothing
 * is awaited, a failure is swallowed, and it is only ever called after the
 * save itself succeeded, so it can never fail one.
 */
export function announceChange(what: { product: string } | { profile: true }): void {
  try {
    void fetch("/api/seo/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(what),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* Nothing to do: the save is what mattered. */
  }
}
