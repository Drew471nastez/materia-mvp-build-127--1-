/*
  WHAT A PUBLIC SUBMISSION MUST LOOK LIKE before anything is read from the
  database. Pure, so tests/forms-security.test.ts checks every rule.

  - A size cap on the body (the route reads at most MAX_SUBMIT_BYTES).
  - The honeypot: a field people never see. A bot that fills it is told
    "thanks" and nothing is kept, so it learns nothing.
  - A minimum time from the form being shown to it being sent, and a
    maximum, so a replayed old payload is asked to reload.
  - Two rate limits: one per address across every form, one per address on
    this form, so one form cannot be flooded from one place and a person
    filling several creators' forms is not blocked by one of them.
*/

export const MAX_SUBMIT_BYTES = 96 * 1024
export const MIN_FILL_MS = 1200
export const MAX_FORM_AGE_MS = 24 * 3_600_000

export const SUBMIT_LIMITS = {
  address: [
    { limit: 30, seconds: 600 },
    { limit: 200, seconds: 86_400 },
  ],
  addressForm: [
    { limit: 6, seconds: 600 },
    { limit: 30, seconds: 86_400 },
  ],
} as const

export const UPLOAD_LIMITS = [
  { limit: 10, seconds: 600 },
  { limit: 40, seconds: 86_400 },
] as const

/** The rate limit subject for one address on one form. */
export function formSubject(address: string | null, formId: string): string | null {
  return address ? `${address}|form:${formId.toLowerCase()}` : null
}

export type SpamVerdict = { kind: "ok" } | { kind: "trap" } | { kind: "refuse"; error: string }

export function spamVerdict(body: Record<string, unknown>, now = Date.now()): SpamVerdict {
  const trap = body.website
  if (typeof trap === "string" ? trap.trim() !== "" : trap !== undefined && trap !== null && trap !== false) return { kind: "trap" }
  const started = body.started_at
  if (typeof started !== "number" || !Number.isFinite(started)) return { kind: "refuse", error: "Reload the form and try again." }
  if (started > now + 5 * 60_000 || now - started > MAX_FORM_AGE_MS) return { kind: "refuse", error: "This form was open a long time. Reload it and try again." }
  if (now - started < MIN_FILL_MS) return { kind: "refuse", error: "Please wait a moment and try again." }
  return { kind: "ok" }
}
