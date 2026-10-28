/**
 * ===========================================================================
 *  WHAT A TEAM MEMBER MAY DO WITH THE ONEPAGE'S INTEGRATIONS (round 41)
 * ===========================================================================
 * A member with OnePage sees the store's integrations (each key as its last
 * four characters, a webhook as its host) and works with what the owner
 * connected: tests it, and picks its list or tag with the key already saved.
 * A key or a webhook address is the owner's: adding one, replacing one or
 * disconnecting stays with them. Pure, so the route and the suite ask the
 * same function.
 */
import { isPageIntegration, isWebhookIntegration } from "./catalog"

/* Said in English as the route's other answers are (the panel shows what the server says). i18n-ignore-start */
export const OWNER_KEEPS_KEYS = "Only the store's owner can add, change or remove a key."
/* i18n-ignore-end */

/** Whether a member may send this step (POST /api/onepage/integrations). */
export function memberMayStep(body: Record<string, unknown>): boolean {
  if (!isPageIntegration(body.provider)) return true
  if (body.disconnect === true) return false
  if (typeof body.apiKey === "string" && body.apiKey.trim() !== "") return false
  if (isWebhookIntegration(body.provider)) return body.step === "test"
  return body.step === "test" || body.step === "lists" || body.step === "connect"
}
