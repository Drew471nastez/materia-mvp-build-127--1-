/**
 * What GET /api/me/push answered, as the Settings row reads it
 * (components/account/push-switch-row.tsx): the saved choice, "not_yet"
 * when the route is deployed but its table is not (503 not_set_up), or
 * null when there is no row to show (404, or anything unexpected). Pure,
 * so tests/account-center.test.ts asks it directly.
 */
export function pushStateFrom(status: number, body: unknown): boolean | "not_yet" | null {
  if (status === 503) return "not_yet"
  if (status !== 200 || !body || typeof body !== "object") return null
  const enabled = (body as { enabled?: unknown }).enabled
  return typeof enabled === "boolean" ? enabled : null
}
