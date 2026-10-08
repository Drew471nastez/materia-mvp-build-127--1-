import "server-only"

/**
 * ===========================================================================
 *  OPERATIONS: EVERY PART OF STORELIB, AND WHAT NEEDS SOMEBODY NOW
 * ===========================================================================
 * One read for the console's Operations view, refreshed every 30 seconds by
 * the page. Each module is judged from something real, never assumed:
 *
 *   Database           a timed read
 *   Payments           Stripe answering a balance read, the webhooks of the
 *                      last 24 hours that failed (lib/admin/payments/health)
 *   Email, AI, push,   whether what each needs is configured (values never
 *   GitHub, domains    leave the server), from ENV_CHECKS
 *   Scheduled jobs     the work each job leaves behind (views/system.ts)
 *   Errors             error_events seen in the last 24 hours
 *   Physical commerce  the admin switch, the commerce job queue (failed,
 *                      dead, stuck), and integrations in error
 *
 * A check that could not be made says "unknown", with why, rather than
 * passing. The alerts are the modules that are not fine, worst first, each
 * with the one thing to do and where to do it.
 */
import { buildPaymentsHealth } from "../payments/health"
import { Reader, isoMinutesAgo } from "../platform-metrics"
import { ENV_CHECKS } from "../schema-expectations"
import { cronChecks } from "./system"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

export type OpsState = "ok" | "degraded" | "down" | "off" | "unknown"

export interface OpsModule {
  id: string
  name: string
  group: "Core" | "Money" | "Messaging" | "Builder and AI" | "Commerce"
  state: OpsState
  /** One line: what was measured. */
  detail: string
  /** Where to look or fix it. */
  href?: string
}

export interface OpsAlert {
  severity: "critical" | "warning"
  module: string
  title: string
  action: string
  href?: string
}

export interface OpsPayload {
  checkedAt: string
  modules: OpsModule[]
  alerts: OpsAlert[]
  errors24h: { count: number | null; top: { message: string; where: string; count: number; lastSeen: string }[] }
}

const isSet = (name: string) => typeof process.env[name] === "string" && process.env[name]!.trim().length > 0

/** A module from configuration alone: all set is ok, a required one missing is down. */
function fromEnv(id: string, name: string, group: OpsModule["group"], envGroup: string, href = "/admin?view=system"): OpsModule {
  const checks = ENV_CHECKS.filter((e) => e.group === envGroup)
  const missing = checks.filter((e) => !e.optional && !isSet(e.name)).map((e) => e.name)
  if (checks.length === 0) return { id, name, group, state: "unknown", detail: "No configuration check is defined.", href }
  if (missing.length === 0) return { id, name, group, state: "ok", detail: `${checks.length} setting${checks.length === 1 ? "" : "s"} configured.`, href }
  if (missing.length === checks.filter((e) => !e.optional).length) return { id, name, group, state: "down", detail: `Not configured: ${missing.join(", ")}.`, href }
  return { id, name, group, state: "degraded", detail: `Missing ${missing.join(", ")}.`, href }
}

export async function ops(r: Reader): Promise<OpsPayload> {
  const t0 = Date.now()
  const dbProbe = await r.count("ops: database", "platform_settings")
  const dbMs = Date.now() - t0

  const [payments, crons, errorCount, errorTop, physical, jobsFailed, jobsDead, jobsStuck, integrationsError] = await Promise.all([
    buildPaymentsHealth(r.db).catch(() => null),
    cronChecks(r).catch(() => null),
    r.count("ops: errors 24h", "error_events", (q) => q.gte("last_seen", new Date(Date.now() - 24 * 3600_000).toISOString())),
    r.rows<{ message: string; location: string; count: number; last_seen: string }>("ops: top errors", "error_events", "message, location, count, last_seen", (q) =>
      q.gte("last_seen", new Date(Date.now() - 24 * 3600_000).toISOString()).order("count", { ascending: false }).limit(5),
    ),
    isPhysicalCommerceEnabled().catch(() => null),
    r.count("ops: commerce jobs failed", "commerce_jobs", (q) => q.eq("status", "failed")),
    r.count("ops: commerce jobs dead", "commerce_jobs", (q) => q.eq("status", "dead")),
    r.count("ops: commerce jobs stuck", "commerce_jobs", (q) => q.eq("status", "queued").lt("run_after", isoMinutesAgo(30))),
    r.count("ops: integrations in error", "commerce_integrations", (q) => q.eq("status", "error")),
  ])

  const modules: OpsModule[] = []

  modules.push(
    dbProbe === null
      ? { id: "database", name: "Database", group: "Core", state: "down", detail: "The database did not answer a read.", href: "/admin?view=system" }
      : { id: "database", name: "Database", group: "Core", state: dbMs > 1500 ? "degraded" : "ok", detail: `Answered in ${dbMs}ms.`, href: "/admin?view=system" },
  )

  if (!payments) {
    modules.push({ id: "payments", name: "Payments (Stripe)", group: "Money", state: "unknown", detail: "The payments check could not run.", href: "/admin/payments" })
  } else {
    const api = payments.stripeApi.status
    const state: OpsState = api === "operational" ? (payments.failedWebhookProcessing > 0 ? "degraded" : "ok") : api === "degraded" ? "degraded" : "down"
    const detail =
      api === "operational"
        ? `Stripe answered. ${payments.webhookEventsLast24h} webhook events in 24h${payments.failedWebhookProcessing ? `, ${payments.failedWebhookProcessing} failed` : ""}.`
        : payments.stripeApi.detail ?? "Stripe is not configured."
    modules.push({ id: "payments", name: "Payments (Stripe)", group: "Money", state, detail, href: "/admin/payments" })
    modules.push({
      id: "webhooks",
      name: "Payment webhooks",
      group: "Money",
      state: payments.platformWebhook !== "configured" || payments.connectWebhook !== "configured" ? "down" : payments.failedWebhookProcessing > 0 ? "degraded" : "ok",
      detail:
        payments.platformWebhook !== "configured" || payments.connectWebhook !== "configured"
          ? `Platform secret ${payments.platformWebhook}, Connect secret ${payments.connectWebhook}.`
          : payments.lastSuccessfulWebhookAt
            ? `Last processed ${payments.lastSuccessfulWebhookAt}.`
            : "No webhook processed yet.",
      href: "/admin/payments/webhooks",
    })
  }

  modules.push(fromEnv("email", "Email (Mailgun)", "Messaging", "Email"))
  modules.push(fromEnv("push", "Push notifications", "Messaging", "Push"))
  modules.push(fromEnv("ai", "Storelib AI", "Builder and AI", "Website agent"))
  modules.push(fromEnv("github", "GitHub sync", "Builder and AI", "GitHub sync"))
  modules.push(fromEnv("domains", "Custom domains", "Core", "Domains"))

  if (crons) {
    const late = crons.filter((c) => c.state === "late")
    const unknown = crons.filter((c) => c.state === "unknown").length
    modules.push({
      id: "jobs",
      name: "Scheduled jobs",
      group: "Core",
      state: late.length ? "degraded" : "ok",
      detail: late.length ? `Behind: ${late.map((c) => c.what).join(", ")}.` : `${crons.length - unknown} running${unknown ? `, ${unknown} leave no trace to read` : ""}.`,
      href: "/admin?view=system",
    })
  } else {
    modules.push({ id: "jobs", name: "Scheduled jobs", group: "Core", state: "unknown", detail: "The job checks could not run.", href: "/admin?view=system" })
  }

  modules.push({
    id: "errors",
    name: "Errors",
    group: "Core",
    state: errorCount === null ? "unknown" : errorCount === 0 ? "ok" : errorCount > 25 ? "degraded" : "ok",
    detail: errorCount === null ? "error_events could not be read." : `${errorCount} kind${errorCount === 1 ? "" : "s"} of error seen in 24h.`,
    href: "/admin?view=system",
  })

  if (physical === false) {
    modules.push({ id: "physical", name: "Physical commerce", group: "Commerce", state: "off", detail: "Switched off in Health.", href: "/admin?view=system" })
  } else {
    const failed = (jobsFailed ?? 0) + (jobsDead ?? 0)
    const state: OpsState = physical === null || jobsFailed === null ? "unknown" : (jobsDead ?? 0) > 0 ? "degraded" : failed > 0 || (jobsStuck ?? 0) > 0 ? "degraded" : "ok"
    modules.push({
      id: "physical",
      name: "Physical commerce",
      group: "Commerce",
      state,
      detail:
        jobsFailed === null
          ? "The commerce tables could not be read."
          : `Job queue: ${jobsFailed} failed, ${jobsDead ?? 0} given up, ${jobsStuck ?? 0} waiting over 30 minutes.`,
      href: "/admin?view=system",
    })
    modules.push({
      id: "integrations",
      name: "Commerce integrations",
      group: "Commerce",
      state: integrationsError === null ? "unknown" : integrationsError > 0 ? "degraded" : "ok",
      detail: integrationsError === null ? "commerce_integrations could not be read." : integrationsError > 0 ? `${integrationsError} creator integration${integrationsError === 1 ? "" : "s"} in error.` : "No integration in error.",
    })
  }

  const alerts: OpsAlert[] = []
  for (const m of modules) {
    if (m.state === "down") alerts.push({ severity: "critical", module: m.name, title: `${m.name} is down`, action: m.detail, href: m.href })
    else if (m.state === "degraded") alerts.push({ severity: "warning", module: m.name, title: `${m.name} needs a look`, action: m.detail, href: m.href })
  }

  return {
    checkedAt: new Date().toISOString(),
    modules,
    alerts,
    errors24h: {
      count: errorCount,
      top: (errorTop ?? []).map((e) => ({ message: e.message, where: e.location, count: Number(e.count), lastSeen: e.last_seen })),
    },
  }
}
