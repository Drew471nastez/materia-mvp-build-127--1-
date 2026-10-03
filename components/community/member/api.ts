/**
 * The member screens' one way to talk to /api/community/<id>/...: JSON in,
 * JSON out, and an error a person can read. Browser safe.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

const CODES: Record<string, string> = {
  sign_in: "Sign in to do that.",
  not_member: "Join the community to do that.",
  pending: "Your request to join is waiting for approval.",
  banned: "You can no longer take part in this community.",
  muted: "You are muted here for now.",
  archived: "This community is archived. You can read, but not post.",
  forbidden: "You cannot do that here.",
  suspended: "This community is not available right now.",
  not_found: "That is gone.",
  communities_off: "Communities are not available right now.",
  directory_off: "The member list is turned off in this community.",
  leaderboard_off: "The leaderboard is turned off in this community.",
}

export function apiBase(communityId: string): string {
  return `/api/community/${communityId}`
}

export async function api<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init?.signal,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const raw = typeof json.error === "string" ? json.error : ""
      return { ok: false, status: res.status, error: CODES[raw] ?? (raw && !/^[a-z_]+$/.test(raw) ? raw : "Something went wrong. Try again.") }
    }
    return { ok: true, data: json as T }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { ok: false, status: 0, error: "" }
    return { ok: false, status: 0, error: "No connection. Check it and try again." }
  }
}
