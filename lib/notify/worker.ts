import "server-only"

/**
 * ===========================================================================
 *  THE ENGINE, WIRED TO THE REAL THINGS
 * ===========================================================================
 * lib/notify/engine.ts is the logic; this hands it the service role store,
 * Mailgun, the templates and the unsubscribe links. Callers:
 *
 *   /api/cron/notify         every 5 minutes, about 45 seconds of work
 *   /api/cron/notifications  hourly, a short run at the end of its own
 *   processSoon()            straight after emit(), in after(), a few seconds
 *
 * Whatever one run does not finish, the next does: the work is in the
 * tables, never in this process.
 */
import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { emailChannel } from "./channels/email"
import { inAppChannel } from "./channels/in-app"
import { runWork, type WorkSummary } from "./engine"
import { notifyLog } from "./log"
import { emailProvider, mailgunDomain } from "./providers/mailgun"
import { supabaseNotifyStore } from "./store"
import { renderEmail, renderInApp } from "./templates"
import { reviewUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe"
import { baseUrl, preferencesUrl } from "./urls"

export type { WorkSummary }

export async function runNotificationWork(budgetMs: number): Promise<WorkSummary> {
  const db = createAdminClient()
  const store = supabaseNotifyStore(db)
  const provider = emailProvider()
  const summary = await runWork(
    {
      store,
      providerName: provider.name,
      worker: `n_${randomUUID()}`,
      email: emailChannel({
        provider,
        render: renderEmail,
        baseUrl,
        unsubscribeUrl,
        /* A review request names its order; the link turns review requests off for that order's address. */
        customerUnsubscribeUrl: (job) => (job.entity_type === "order" && job.entity_id ? reviewUnsubscribeUrl(job.entity_id) : null),
        preferencesUrl,
        messageDomain: mailgunDomain(),
      }),
      inApp: inAppChannel(store, { render: renderInApp, baseUrl }),
    },
    budgetMs,
  )
  if (summary.events || summary.jobs || !summary.available) {
    notifyLog("info", "run", { ...summary })
  }
  return summary
}

/**
 * A short run after the response has gone. Outside a request (a script, a
 * test) there is no after(), and the cron picks the work up.
 */
export function processSoon(budgetMs = 5_000): void {
  try {
    after(async () => {
      try {
        await runNotificationWork(budgetMs)
      } catch {
        notifyLog("warn", "soon run failed")
      }
    })
  } catch {
    /* no request scope: the cron does it */
  }
}
