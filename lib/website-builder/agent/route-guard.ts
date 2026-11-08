import "server-only"

import { NextResponse } from "next/server"
import { AUTH_UNAVAILABLE_HEADER } from "@/lib/auth/recovery-backoff"
import { classifyServiceError } from "@/lib/net/service-error"

/**
 * ===========================================================================
 *  A SLOW READ BEFORE THE RUN IS A RETRY, NOT "ONLY CREATORS CAN EDIT THEMES"
 * ===========================================================================
 * The agent and decide routes read the creator and the install before they
 * do anything. A read that timed out (DeadlineExceeded) came back as no row,
 * and a signed in creator was told they were not one (403) or that their
 * theme did not exist (404). Now a read that failed for a slow or unreachable
 * database answers the same retryable 503 a slow sign in check does
 * (lib/auth/route-user authUnavailableResponse): refused before anything was
 * done, so the chat asks again by itself (lib/website-builder/ask-client.ts
 * streamPost). A query that is simply wrong still answers as it did.
 */
export const DATA_UNAVAILABLE_MESSAGE = "Storelib could not reach your site's saved data just now. Try again in a moment."

/** Whether a Supabase read's error is the database being slow or unreachable, not an answer. */
export function transientReadError(error: unknown, status?: number | null): boolean {
  if (!error) return false
  return classifyServiceError(error, status) !== "query"
}

export function dataUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: DATA_UNAVAILABLE_MESSAGE, retry: true },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2", [AUTH_UNAVAILABLE_HEADER]: "unavailable" } },
  )
}
