"use client"

/**
 * ===========================================================================
 *  WHAT THE ONEPAGE IS CONNECTED TO, SAID IN ITS SETTINGS
 * ===========================================================================
 * The owner: "Add more important settings in the OnePage editor if needed
 * only, such as integrations connected with the backend of Storelib." Three
 * things a creator expects to see from here, each one read from the place
 * Storelib already keeps it, and changed there (one place to change it):
 *
 *   ANALYTICS AND PIXELS   the store's Google Analytics, Tag Manager, Google
 *                          Ads, Meta, TikTok, Pinterest and Clarity IDs
 *                          (Settings › Integrations, store_settings.tracking)
 *                          are loaded on the live OnePage too
 *                          (app/(marketing)/l/[slug]/page.tsx StoreTracking).
 *                          GET /api/store/integrations.
 *   EMAIL TOOLS            Klaviyo and Omnisend, connected with a key, get
 *                          every signup from the page's forms: a signup
 *                          starts their sync at once (round 41). GET /api/store/integrations/marketing.
 *   YOUR OWN DOMAIN        the creator page's own domain (Settings › Domains,
 *                          purpose creator_page), which the page is served on
 *                          and its share links use. GET /api/domains.
 *
 * Those three only read. Nothing here is a second copy of a setting.
 *
 *   SENT AS THEY SIGN UP   round 40: Mailchimp, Kit, beehiiv, Zapier, Make,
 *                          Google Sheets and a webhook (round 41: MailerLite,
 *                          Brevo and Flodesk too) belong to the page
 *                          (its signups, as they happen), so they are
 *                          connected here (./page-integrations,
 *                          GET/POST /api/onepage/integrations, SQL part 315).
 */

import * as React from "react"
import { useOnePageTeam } from "@/lib/onepage/team-context"
import { ChevronRight, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { PageIntegrationsSection, UnreadNote } from "@/components/onepage/page-integrations"

type Tracking = Partial<Record<string, string | null>>
type MarketingRow = { provider: "klaviyo" | "omnisend"; connected: boolean; listName?: string | null }

/** The pixels and analytics tags a page can carry, in the Integrations page's order. */
const PAGE_TAGS = INTEGRATIONS.filter((i) => i.kind === "tracker" && i.trackerId && i.trackerId !== "klaviyo" && i.trackerId !== "omnisend")
/** Shown as "not set up" when the store has none: the three most asked for. */
const SUGGESTED = new Set(["ga4", "meta_pixel", "tiktok_pixel"])

function useJsonRetry<T>(url: string | null): [T | null | undefined, () => Promise<void>] {
  /* undefined while reading, null when it could not be read. A null address reads nothing. */
  const [value, setValue] = React.useState<T | null | undefined>(undefined)
  const liveRef = React.useRef(true)
  const read = React.useCallback(async () => {
    if (!url) return
    try {
      const r = await fetch(url, { cache: "no-store" })
      const d = r.ok ? ((await r.json().catch(() => null)) as T | null) : null
      if (liveRef.current) setValue(d)
    } catch {
      if (liveRef.current) setValue(null)
    }
  }, [url])
  React.useEffect(() => {
    liveRef.current = true
    void read()
    return () => {
      liveRef.current = false
    }
  }, [read])
  return [value, read]
}

function useJson<T>(url: string | null): T | null | undefined {
  return useJsonRetry<T>(url)[0]
}

function Row({ href, logo, name, status, on, data }: { href: string; logo: string | null; name: string; status: string; on: boolean; data?: string }) {
  return (
    <a
      href={href}
      data-settings-integration={data}
      data-on={on ? "" : undefined}
      className="flex min-h-[56px] items-center gap-3 px-3.5 py-2.5 transition-colors [@media(hover:hover)]:hover:bg-[#fafafb]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
        {logo ? <img src={logo} alt="" className="h-5 w-5 object-contain" /> : <span className="text-[13px] font-semibold text-[#1a1a2e]">{name.slice(0, 1)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} />
          <span className="truncate">{status}</span>
        </span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
    </a>
  )
}

const listBox = "divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#e8e8ec] bg-white"

/** Settings › Integrations, as it reaches this page: the tags it loads and the email tools its signups go to. */
export function OnePageIntegrations() {
  const [tags, retryTags] = useJsonRetry<{ tracking?: Tracking }>("/api/store/integrations")
  const [tools, retryTools] = useJsonRetry<{ marketing?: MarketingRow[] }>("/api/store/integrations/marketing")
  const tracking = tags?.tracking ?? {}
  const set = PAGE_TAGS.filter((i) => typeof tracking[i.trackerId!] === "string" && tracking[i.trackerId!])
  const shown = set.length ? set : PAGE_TAGS.filter((i) => SUGGESTED.has(i.trackerId!))
  const marketing = tools?.marketing ?? []
  const emailTools = (["klaviyo", "omnisend"] as const).map((p) => {
    const row = marketing.find((m) => m.provider === p)
    const listing = INTEGRATIONS.find((i) => i.trackerId === p)
    return { provider: p, name: listing?.name ?? p, logo: listing?.logo ?? null, slug: listing?.id ?? p, connected: !!row?.connected, listName: row?.listName ?? null }
  })
  const loading = tags === undefined || tools === undefined

  return (
    <div className="space-y-5" data-settings-integrations="">
      {/* Round 41, the owner: "only what's necessary". Headings and rows; what each one does is on its own sheet or page. */}
      <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Integrations")}</h3>

      <section className="space-y-2" aria-label={tt("Analytics and ads")}>
        <p className="text-[13px] font-medium text-[#374151]">{tt("Analytics and ads")}</p>
        {loading ? (
          <div aria-hidden className="h-[168px] animate-pulse rounded-xl bg-[#f4f4f6]" />
        ) : tags === null ? (
          /* The read failed: never "Not set up" about tags that may well be on the live page. */
          <UnreadNote onRetry={retryTags} />
        ) : (
          <div className={listBox}>
            {shown.map((i) => {
              const id = tracking[i.trackerId!]
              return (
                <Row
                  key={i.id}
                  data={i.trackerId}
                  href={`/app/integrations?integration=${i.id}`}
                  logo={i.logo}
                  name={i.name}
                  on={!!id}
                  status={id ? tt("On, {id}", { id }) : tt("Not set up")}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-label={tt("Email tools")}>
        <p className="text-[13px] font-medium text-[#374151]">{tt("Email tools")}</p>
        {loading ? (
          <div aria-hidden className="h-[112px] animate-pulse rounded-xl bg-[#f4f4f6]" />
        ) : tools === null ? (
          /* The read failed: never "Not connected" about a Klaviyo that is getting every signup. */
          <UnreadNote onRetry={retryTools} />
        ) : (
          <div className={listBox}>
            {emailTools.map((t) => (
              <Row
                key={t.provider}
                data={t.provider}
                href={`/app/integrations?integration=${t.slug}`}
                logo={t.logo}
                name={t.name}
                on={t.connected}
                status={t.connected ? (t.listName ? tt("Connected, list {name}", { name: t.listName }) : tt("Connected")) : tt("Not connected")}
              />
            ))}
          </div>
        )}
      </section>

      {/* Round 40: Mailchimp, Kit, beehiiv, Zapier, Make, Sheets and a webhook, connected here, each sent every signup as it happens (./page-integrations). */}
      <PageIntegrationsSection />

      <a
        href="/app/integrations"
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#e5e7eb] px-4 py-3 text-[14px] text-[#1a1a2e] transition-colors [@media(hover:hover)]:hover:bg-[#f9fafb]"
      >
        {tt("All integrations")}
        <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
      </a>
    </div>
  )
}

type DomainsAnswer = { primary?: { creator_page?: string | null }; purposes?: string[] }

/** The page's own domain, under its address in Basic info: the one it is served on, or how to connect one. */
export function OnePageDomainRow() {
  /* Round 41: a team member is told the store's domain with the page (lib/onepage/team-context); the domains list is the owner's (Settings). */
  const team = useOnePageTeam()
  const fetched = useJson<DomainsAnswer>(team ? null : "/api/domains")
  const answer: DomainsAnswer | null | undefined = team ? { primary: { creator_page: team.domain } } : fetched
  if (answer === undefined) return <div aria-hidden className="h-[60px] animate-pulse rounded-xl bg-[#f4f4f6]" />
  /* A store whose domains table cannot tell a page's domain from a website's has nowhere to connect one yet. */
  if (answer && Array.isArray(answer.purposes) && !answer.purposes.includes("creator_page")) return null
  const host = answer?.primary?.creator_page || null
  return (
    <a
      href="/app/settings?tab=domains"
      data-settings-domain={host ? "on" : "off"}
      className="flex min-h-[60px] items-center gap-3 rounded-xl border border-[#e5e7eb] py-3 pl-3 pr-4 transition-colors [@media(hover:hover)]:hover:bg-[#f9fafb]"
    >
      {/* A small globe on a quiet tile, as the Help Center marks its topics (components/help/help-hero TopicIcon), so the row reads as a place to go. */}
      <span aria-hidden data-settings-domain-icon="" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e8eaed] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        <Globe className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{tt("Your own domain")}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
          {host ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#16a34a]" /> : null}
          <span className="truncate">{host ? tt("Your page is on {host}", { host }) : tt("Use a domain you own, like links.yourname.com")}</span>
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-medium text-[#1a1a2e]">{host ? tt("Manage") : tt("Connect")}</span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
    </a>
  )
}
