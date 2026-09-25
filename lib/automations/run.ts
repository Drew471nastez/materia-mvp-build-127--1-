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
import { APP_URL, automationEmail, personalize, personalizeText } from "@/lib/email-automation"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { mailgunDomain } from "@/lib/mailgun"
import { maskEmail } from "@/lib/privacy/mask-email"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { enroll, runDue, type DueResult, type EnrollResult, type Mailer, type TriggerInput } from "./engine"
import { supabaseStore } from "./supabase-store"
import { trackLinks } from "./tracking"

/**
 * THE AUTOMATED EMAIL, IN THE SAME LAYOUT AS A CAMPAIGN.
 *
 * lib/email-automation automationEmail draws it: the body written again as
 * email HTML, the creator's name, logo, colour and address, the footer with
 * the way out, the text part, and the one-click unsubscribe headers. The
 * open pixel goes in as the layout's own, and each message carries a
 * Message-Id made from its send row's token, so the id is unique and the
 * same one if the provider is ever asked twice.
 *
 * The brand is read when the email is sent, so a new logo or colour is in
 * the next email. `compose` is synchronous in the engine's contract, so it
 * draws the email with the name alone and notes what it drew; `send`, which
 * may wait, reads the brand (once per creator per run) and draws the same
 * email again in it. If the two ever stop meeting (the engine sends
 * something compose did not draw), the name-only email is what goes, which
 * is still the whole layout.
 */
export function mailerFor(db: ReturnType<typeof createAdminClient>): Mailer {
  type Parts = Parameters<typeof automationEmail>[0]
  const drawn = new Map<string, { creatorId: string; parts: Parts }>()
  const brands = new Map<string, Promise<Awaited<ReturnType<typeof loadBrand>> | null>>()
  const brandFor = (creatorId: string) => {
    let b = brands.get(creatorId)
    if (!b) {
      b = loadBrand(db, creatorId).catch(() => null)
      brands.set(creatorId, b)
    }
    return b
  }
  return {
    compose({ step, run, identity, standing, token }) {
      const values = { name: run.name ?? undefined, product: run.context.product_title }
      const withStore = (s: string) => s.replace(/\{\{\s*store_url\s*\}\}/gi, identity.storeUrl)
      const subject = personalizeText(withStore(step.config.subject), values).replace(/[\r\n]+/g, " ").slice(0, 300)
      const parts: Parts = {
        subject,
        previewText: step.config.preview_text ? personalizeText(withStore(step.config.preview_text), values) : null,
        body: trackLinks(personalize(withStore(step.config.body), values), token),
        fromName: identity.fromName,
        unsubscribeToken: standing.unsubscribeToken,
        /* The same address openPixel (./tracking) writes, as the layout's own pixel. */
        openPixelUrl: `${APP_URL}/api/automations/t/o?k=${encodeURIComponent(token)}`,
      }
      const mail = automationEmail(parts)
      drawn.set(mail.html, { creatorId: run.creator_id, parts })
      if (drawn.size > 64) drawn.delete(drawn.keys().next().value as string)
      return { subject, html: mail.html, text: mail.text, headers: { ...(mail.headers ?? {}), "Message-Id": `<a${token}@${mailgunDomain()}>` } }
    },
    async send(mail) {
      let { html, text } = mail
      const pending = drawn.get(mail.html)
      if (pending) {
        drawn.delete(mail.html)
        const brand = await brandFor(pending.creatorId)
        if (brand) {
          const branded = automationEmail({ ...pending.parts, brand, avatarUrl: brand.avatarUrl })
          html = branded.html
          text = branded.text
        }
      }
      return sendEmail({
        from: buildFromHeader(mail.fromName),
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html,
        text,
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
export async function runDueJobs(budgetMs: number, batch = 10): Promise<DueResult> {
  const db = createAdminClient()
  return runDue({ store: supabaseStore(db), mailer: mailerFor(db), worker: `w_${randomUUID()}`, budgetMs, batch })
}

/**
 * The first steps now, after the response is sent. Outside a request (a
 * script, a test) there is no `after`, and the cron picks the work up.
 */
export function processSoon(budgetMs = 6_000): void {
  try {
    after(async () => {
      try {
        /* Small batches and a short budget: this runs on the tail of a
           sign-up or a payment, whose function can be stopped at its time
           limit. A job cut off before its send is claimed again by the cron;
           one cut off during its send is never sent twice (see engine.ts). */
        const r = await runDueJobs(budgetMs, 3)
        if (r.claimed > 0) console.log("[automations] ran", r.claimed, "step(s) after the trigger:", r.outcomes)
      } catch (error) {
        console.error("[automations] running steps after the trigger failed:", (error as Error)?.message)
      }
    })
  } catch {
    /* No request scope. */
  }
}
