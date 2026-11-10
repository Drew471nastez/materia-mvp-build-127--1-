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
import { APP_URL, automationEmail, brandOfIdentity } from "@/lib/email-automation"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { mailgunDomain } from "@/lib/mailgun"
import { verifiedSender } from "@/lib/emails/sending-domain-server"
import { ownFrom } from "@/lib/emails/sending-domain"
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
 * The step arrives filled (engine prepareEmail: every field in, the
 * buttons in the creator's colour) and is drawn as it is. The store's name,
 * logo and colour are the engine's own reading of them (identity.brand), so
 * the layout and the buttons prepareEmail coloured agree. The footer says
 * why the reader gets it: they joined the list, or they bought.
 *
 * The postal address for the footer is read when the email is sent, so a
 * new one is in the next email. `compose` is synchronous in the engine's
 * contract, so it draws the email without it and notes what it drew; `send`,
 * which may wait, reads it (once per creator per run) and draws the same
 * email again with it. If the two ever stop meeting (the engine sends
 * something compose did not draw), the email without the address is what
 * goes, which is still the whole layout.
 */
export function mailerFor(db: ReturnType<typeof createAdminClient>): Mailer {
  type Parts = Parameters<typeof automationEmail>[0]
  const drawn = new Map<string, { creatorId: string; parts: Parts }>()
  const addresses = new Map<string, Promise<string | null>>()
  const addressFor = (creatorId: string) => {
    let a = addresses.get(creatorId)
    if (!a) {
      a = loadBrand(db, creatorId).then(
        (b) => b.address,
        () => null,
      )
      addresses.set(creatorId, a)
    }
    return a
  }
  return {
    compose({ step, run, identity, standing, token }) {
      /* Already filled by the engine (prepareEmail); a subject is one line. */
      const subject = step.config.subject.replace(/[\r\n]+/g, " ").slice(0, 300)
      const parts: Parts = {
        subject,
        previewText: step.config.preview_text ? step.config.preview_text.replace(/[\r\n]+/g, " ") : null,
        body: trackLinks(step.config.body, token),
        fromName: identity.fromName,
        brand: brandOfIdentity(identity),
        /* The creator's photo as their profile has it now (supabase-store readIdentity, read each run). */
        avatarUrl: identity.avatarUrl ?? null,
        unsubscribeToken: standing.unsubscribeToken,
        because: standing.status ?? null,
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
      /* The store's own verified domain (Emails › Platforms): From its address, sent through that domain. */
      const own = pending ? await verifiedSender(db, pending.creatorId) : null
      if (pending) {
        drawn.delete(mail.html)
        const address = await addressFor(pending.creatorId)
        if (address && pending.parts.brand) {
          const addressed = automationEmail({ ...pending.parts, brand: { ...pending.parts.brand, address } })
          html = addressed.html
          text = addressed.text
        }
      }
      return sendEmail({
        from: own ? ownFrom(mail.fromName || "Storelib", own.address) : buildFromHeader(mail.fromName),
        ...(own ? { sendingDomain: own.domain } : {}),
        /* The store's email: a reply reaches the store, never Storelib's support inbox. */
        store: mail.store ?? pending?.creatorId ?? null,
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
