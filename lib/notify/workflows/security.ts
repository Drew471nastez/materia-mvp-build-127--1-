/**
 * ===========================================================================
 *  SECURITY AND ACCOUNT STANDING
 * ===========================================================================
 *   user.password_changed   PASSWORD_CHANGED to the account's address
 *   user.email_changed      EMAIL_CHANGED to the new address (the account's
 *                           own, read at send time) and a second job to
 *                           payload.previousEmail, so whoever held the old
 *                           address hears of it too. The new address is
 *                           only ever shown masked.
 *   account.restricted      ACCOUNT_RESTRICTED, critical
 *
 * All required service: always sent, whatever the preferences, unless the
 * address hard bounced.
 */
import { maskEmail } from "@/lib/privacy/mask-email"
import { job, plan, str, type Workflow } from "./common"

export const security: Workflow = (event, ctx) => {
  const on = { entityType: "user" as const, entityId: ctx.userId }
  switch (event.name) {
    case "user.password_changed":
      return plan([job("PASSWORD_CHANGED", event, ctx, on)])
    case "user.email_changed": {
      const previous = str(event.payload.previousEmail)
      const next = str(event.payload.newEmail)
      const data = { newEmailMasked: next ? maskEmail(next) : null, previousEmail: null, newEmail: null }
      const toNew = job("EMAIL_CHANGED", event, ctx, { ...on, data })
      const toOld =
        previous && previous.toLowerCase() !== (next ?? "").toLowerCase()
          ? job("EMAIL_CHANGED", event, ctx, { ...on, recipientEmail: previous, step: `previous_address:${event.key}`, data })
          : null
      return plan([toNew, toOld])
    }
    case "account.restricted":
      return plan([job("ACCOUNT_RESTRICTED", event, ctx, { entityType: "creator", entityId: ctx.creatorId })])
    default:
      return null
  }
}
