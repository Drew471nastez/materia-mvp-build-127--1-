"use client"

import { createClient } from "@/lib/supabase/client"

/**
 * ===========================================================================
 *  SWITCHING BUSINESS, IN THE BROWSER
 * ===========================================================================
 * The server checks the link and makes a session for the other business
 * (app/api/businesses/switch). This puts that session where this browser
 * keeps its own, through the same client that signed in: cookies on the web,
 * the device store and its cookie mirror in the app (lib/supabase/client).
 * Then the page is loaded again from scratch, so nothing drawn for one
 * business is ever shown for the other.
 *
 * The app sends its token as well as its cookie, because the web view's
 * cookie can trail the device store by a request.
 */

export interface BusinessSession {
  access_token: string
  refresh_token: string
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/* Onboarding progress is kept on the device; one business's half finished steps must not open in the other. */
const PER_ACCOUNT_KEYS = ["storelib_onboarding_state", "onepage_onboarding_progress"]

export async function applyBusinessSession(session: BusinessSession, next: string): Promise<void> {
  const { error } = await createClient().auth.setSession(session)
  if (error) throw new Error("That business could not be opened. Try again.")
  try {
    for (const key of PER_ACCOUNT_KEYS) localStorage.removeItem(key)
  } catch {
    /* private mode: nothing kept anyway */
  }
  window.location.replace(next)
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

/** Open the other business. Resolves only if it fails; on success the page reloads. */
export async function switchBusiness(to: string, next = "/app"): Promise<void> {
  const { ok, data } = await post("/api/businesses/switch", { to })
  if (!ok || !data.session) throw new Error(typeof data.error === "string" ? data.error : "That business could not be opened. Try again.")
  await applyBusinessSession(data.session as BusinessSession, next)
}

/** Make the second business and open its onboarding. */
export async function createBusiness(): Promise<void> {
  const { ok, status, data } = await post("/api/businesses", {})
  if (status === 202) {
    window.location.replace("/app")
    return
  }
  if (!ok || !data.session) throw new Error(typeof data.error === "string" ? data.error : "The business could not be created. Try again.")
  await applyBusinessSession(data.session as BusinessSession, "/signup/success?action=become-creator&business=new")
}
