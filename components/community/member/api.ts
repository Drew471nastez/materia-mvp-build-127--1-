/**
 * The member screens' one way to talk to /api/community/<id>/...: JSON in,
 * JSON out, and an error a person can read. Browser safe.
 */
import { FAIL_COPY, requestJson } from "@/lib/net/request"
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

export async function api<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number }): Promise<ApiResult<T>> {
  try {
    /* Bounded end to end (lib/net/request.ts): a post, a comment or a page of the feed that never answered left its spinner, or a "sending" comment, up for ever. */
    const r = await requestJson<Record<string, unknown>>(url, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      json: init?.body,
      credentials: "same-origin",
      cache: "no-store",
      signal: init?.signal,
      timeoutMs: init?.timeoutMs,
    })
    if (r.ok) return { ok: true, data: r.data as T }
    if (r.status === 0) return { ok: false, status: 0, error: r.kind === "timeout" ? FAIL_COPY.timeout : "No connection. Check it and try again." }
    const raw = typeof r.data.error === "string" ? r.data.error : ""
    return { ok: false, status: r.status, error: CODES[raw] ?? (raw && !/^[a-z_]+$/.test(raw) ? raw : "Something went wrong. Try again.") }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError" || init?.signal?.aborted) return { ok: false, status: 0, error: "" }
    return { ok: false, status: 0, error: "No connection. Check it and try again." }
  }
}
