import "server-only"

/**
 * ===========================================================================
 *  THE ENGINE, WIRED TO THE REAL THINGS
 * ===========================================================================
 * lib/automations/engine.ts is the logic; this gives it the database (the
 * service role store), Mailgun (lib/mail), and the email every automated
 * message is framed in (lib/email-automation). Three callers:
 *
 *   enrollInFlows   a trigger happened (triggerEmailFlows in lib/email.tsx)
 *   runDueJobs      the cron, every hour (app/api/cron/process-scheduled-emails)
 *   processSoon     straight after a trigger, in `after()`, so a welcome does
 *                   not wait for the hour. Best effort: whatever it does not
 *                   finish, the cron does, because the work is in the table.
 */

import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildFromHeader, sendEmail } from "@/lib/mail"
import { automationEmail, escapeHtml, personalize, personalizeText } from "@/lib/email-automation"
import { maskEmail } from "@/lib/privacy/mask-email"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { enroll, runDue, type DueResult, type EnrollResult, type Mailer, type TriggerInput } from "./engine"
import { supabaseStore } from "./supabase-store"
import { openPixel, trackLinks } from "./tracking"

export function mailerFor(db: ReturnType<typeof createAdminClient>): Mailer {
  return {
    compose({ step, run, identity, standing, token }) {
      const values = { name: run.name ?? undefined, product: run.context.product_title }
      const withStore = (s: string) => s.replace(/\{\{\s*store_url\s*\}\}/gi, identity.storeUrl)
      const subject = personalizeText(withStore(step.config.subject), values).replace(/[\r\n]+/g, " ").slice(0, 300)
      const preheader = step.config.preview_text
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(personalizeText(step.config.preview_text, values))}</div>`
        : ""
      const body = `${preheader}${trackLinks(personalize(withStore(step.config.body), values), token)}${openPixel(token)}`
      const mail = automationEmail({ body, fromName: identity.fromName, unsubscribeToken: standing.unsubscribeToken })
      return { subject, ...mail }
    },
    async send(mail) {
      return sendEmail({
        from: buildFromHeader(mail.fromName),
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: mail.headers,
      })
    },
    async counted(creatorId) {
      await ignoreError(db.rpc("increment_email_usage", { p_creator_id: creatorId, p_count: 1 }))
    },
  }
}

/** Enters every active flow for this trigger. `available: false` means the SQL has not run. */
export async function enrollInFlows(input: TriggerInput): Promise<EnrollResult> {
  const db = createAdminClient()
  const result = await enroll(supabaseStore(db), input, Date.now())
  if (result.enrolled > 0) {
    console.log("[automations] entered", result.enrolled, "flow(s) for", maskEmail(input.email))
    processSoon()
  }
  return result
}

/** Runs due work until nothing is due or the budget is spent. */
export async function runDueJobs(budgetMs: number): Promise<DueResult> {
  const db = createAdminClient()
  return runDue({ store: supabaseStore(db), mailer: mailerFor(db), worker: `w_${randomUUID()}`, budgetMs, batch: 10 })
}

/**
 * The first steps now, after the response is sent. Outside a request (a
 * script, a test) there is no `after`, and the cron picks the work up.
 */
export function processSoon(budgetMs = 15_000): void {
  try {
    after(async () => {
      try {
        const r = await runDueJobs(budgetMs)
        if (r.claimed > 0) console.log("[automations] ran", r.claimed, "step(s) after the trigger:", r.outcomes)
      } catch (error) {
        console.error("[automations] running steps after the trigger failed:", (error as Error)?.message)
      }
    })
  } catch {
    /* No request scope. */
  }
}
