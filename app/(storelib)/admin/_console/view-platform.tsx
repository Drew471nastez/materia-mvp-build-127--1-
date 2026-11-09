"use client"

import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"

import type { AudiencePayload, AuditPayload, EmailPayload, PeoplePayload, SiteRow, SystemPayload, WebsitesPayload } from "@/lib/admin/types"

import { ago, date, money, num, short, statusWord } from "./format"
import type { Route } from "./nav-state"
import { WalletDomainsPanel } from "./panel-wallets"
import { getOnePageDomain } from "@/lib/onepage/address"
import { AI_VISITS_LABEL } from "@/lib/attribution/ai-visits"
import { BuyerHeaderThemePanel } from "./panel-buyer-header-theme"
import { ExploreMarketplacePanel } from "./panel-explore-marketplace"
import { ExploreDiscoverModeSwitcherPanel } from "./panel-explore-discover-switcher"
import { PhysicalCommercePanel } from "./panel-physical-commerce"
import { ViewHeader } from "./shell"
import { DataList, Figures, Filters, LinkText, Pager, Panel, ReadNotes, SearchField, Status, Toolbar, Button, Facts, reasonFor, type Column } from "./ui"
import type { PersonRow } from "@/lib/admin/types"
import type { Action } from "./actions"

type Go = (r: Partial<Route>) => void
type Common = { route: Route; go: Go; query: string; onQuery: (q: string) => void }

function Unread({ reason }: { reason: string | null }) {
  return <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Could not be read. {reason}</p>
}

const toCreator = (go: Go, c: { id: string; handle: string } | null) =>
  c ? <LinkText onClick={() => go({ view: "creator", id: c.id, q: "", filter: "", page: 1 })}>@{c.handle || short(c.id)}</LinkText> : ""

/* ── Websites ─────────────────────────────────────────────────────────── */

export function WebsitesView({ data, route, go, query, onQuery }: Common & { data: WebsitesPayload }) {
  const d = data.domains
  const p = data.problems
  const columns: Column<SiteRow>[] = [
    { key: "name", label: "Website", width: "minmax(0,1.6fr)", phone: "primary", render: (s) => s.name },
    { key: "creator", label: "Creator", width: "minmax(0,1fr)", render: (s) => toCreator(go, s.creator) },
    { key: "status", label: "Status", width: "112px", render: (s) => <Status value={s.status} /> },
    { key: "published", label: "Published", width: "110px", align: "right", render: (s) => date(s.publishedAt) },
    { key: "updated", label: "Edited", width: "100px", align: "right", phone: "end", render: (s) => ago(s.updated) },
  ]
  return (
    <div className="space-y-4">
      <ViewHeader title="Websites" meta="Published sites, their domains, and whether publishing works." />
      <ReadNotes problems={p} notices={data.notices} />
      <Figures
        items={[
          { label: "Custom domains", value: num(d?.total ?? null), unreadable: d?.total === null ? reasonFor(p, "domains") : null },
          { label: "Serving", value: num(d?.active ?? null), sub: "active", unreadable: d?.active === null ? reasonFor(p, "active domains") : null },
          { label: "Waiting", value: num(d?.waiting ?? null), sub: "DNS or certificate", unreadable: d?.waiting === null ? reasonFor(p, "domains waiting") : null },
          { label: "Page speed, 7 days", value: data.vitals ? (data.vitals.samples ? `${Math.round((1 - data.vitals.poorLcp / data.vitals.samples) * 100)}%` : "No data") : "", sub: data.vitals ? `good load time, ${num(data.vitals.samples)} samples` : undefined, unreadable: data.vitals ? null : reasonFor(p, "page speed") },
        ]}
      />
      <Toolbar>
        <SearchField label="Search websites" value={query} onChange={onQuery} placeholder="Name, slug or id" />
        <Filters
          label="Filter websites"
          value={(data.filter || "all") as string}
          onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
          options={[
            { id: "all", label: "All" },
            { id: "published", label: "Published" },
            { id: "draft", label: "Draft" },
            { id: "unpublished", label: "Unpublished" },
          ]}
        />
      </Toolbar>
      <Panel>
        {data.list ? (
          <>
            <DataList label="Websites" columns={columns} rows={data.list.rows} rowKey={(s) => s.id} empty={route.q ? "No website matches that." : "No websites here."} onOpen={(s) => (s.creator ? go({ view: "creator", id: s.creator.id, q: "", filter: "", page: 1 }) : undefined)} />
            <Pager page={data.list.page} pages={data.list.pages} total={data.list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(p, "websites")} />
        )}
      </Panel>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Domains not serving" meta="Newest 20">
          {data.domainIssues ? (
            <DataList
              label="Domains not serving"
              rows={data.domainIssues}
              rowKey={(r) => r.id}
              empty="Every domain is serving."
              columns={[
                { key: "domain", label: "Domain", width: "minmax(0,1.6fr)", phone: "primary", render: (r) => r.domain },
                { key: "creator", label: "Creator", width: "minmax(0,1fr)", render: (r) => toCreator(go, r.creator) },
                { key: "status", label: "Status", width: "120px", phone: "end", render: (r) => <Status value={r.status} /> },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "domain issues")} />
          )}
        </Panel>
        <Panel title="Publishes that failed" meta="Last 7 days">
          {data.failedDeploys ? (
            <DataList
              label="Failed publishes"
              rows={data.failedDeploys}
              rowKey={(r) => r.id}
              empty="None failed this week."
              columns={[
                { key: "site", label: "Website", width: "minmax(0,1fr)", phone: "primary", render: (r) => r.site },
                { key: "error", label: "What went wrong", width: "minmax(0,1.6fr)", render: (r) => r.error ?? "" },
                { key: "at", label: "When", width: "90px", align: "right", phone: "end", render: (r) => ago(r.at) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "failed publishes")} />
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ── Email ────────────────────────────────────────────────────────────── */

export function EmailView({ data }: Common & { data: EmailPayload }) {
  const e = data.events
  const p = data.problems
  const rate = (part: number | null, whole: number | null) => (part !== null && whole ? `${((part / whole) * 100).toFixed(part / whole < 0.01 ? 2 : 1)}% of delivered` : undefined)
  return (
    <div className="space-y-4">
      <ViewHeader title="Email" meta="Everything Mailgun reported in the last 30 days, and what is waiting to go." />
      <ReadNotes problems={p} notices={data.notices} />
      <Figures
        items={[
          { label: "Delivered", value: num(e.delivered), sub: e.opened !== null ? `${num(e.opened)} opened, ${num(e.clicked)} clicked` : undefined, unreadable: e.delivered === null ? reasonFor(p, "email delivered") : null },
          { label: "Bounced", value: num(e.bounced), sub: rate(e.bounced, e.delivered), unreadable: e.bounced === null ? reasonFor(p, "email bounced") : null },
          { label: "Spam complaints", value: num(e.complained), sub: rate(e.complained, e.delivered), unreadable: e.complained === null ? reasonFor(p, "email complained") : null },
          { label: "Suppressed addresses", value: num(data.suppressed), sub: "never mailed again", unreadable: data.suppressed === null ? reasonFor(p, "suppressed addresses") : null },
          { label: "Unsubscribed", value: num(e.unsubscribed), unreadable: e.unsubscribed === null ? reasonFor(p, "email unsubscribed") : null },
          { label: "Campaigns sent", value: num(data.campaigns.sent30), sub: data.campaigns.failed ? `${num(data.campaigns.failed)} failed` : "none failed", unreadable: data.campaigns.sent30 === null ? reasonFor(p, "sent campaigns") : null },
          { label: "Flow emails waiting", value: num(data.flows.pending), sub: data.flows.overdue ? `${num(data.flows.overdue)} over 2 h late` : "none late", unreadable: data.flows.pending === null ? reasonFor(p, "flow emails waiting") : null },
          { label: "Order emails failed", value: num(data.transactionalFailed7), sub: "last 7 days", unreadable: data.transactionalFailed7 === null ? reasonFor(p, "order emails failed") : null },
        ]}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Campaign queue" meta={`${num(data.campaigns.scheduled ?? 0)} scheduled, ${num(data.campaigns.sending ?? 0)} sending`}>
          {data.queue ? (
            <DataList
              label="Campaign queue"
              rows={data.queue}
              rowKey={(r) => r.id}
              empty="Nothing scheduled, sending or failed."
              columns={[
                { key: "subject", label: "Subject", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.subject },
                { key: "status", label: "Status", width: "100px", render: (r) => <Status value={r.status} /> },
                { key: "audience", label: "To", width: "70px", align: "right", phone: "end", render: (r) => num(r.audience) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "campaign queue")} />
          )}
        </Panel>
        <Panel title="Recent bounces and complaints">
          {data.recentBounces ? (
            <DataList
              label="Recent bounces"
              rows={data.recentBounces}
              rowKey={(r) => `${r.at}-${r.address}`}
              empty="None."
              columns={[
                { key: "address", label: "Address", width: "minmax(0,1.3fr)", phone: "primary", render: (r) => r.address },
                { key: "kind", label: "Kind", width: "90px", render: (r) => r.kind },
                { key: "reason", label: "Reason", width: "minmax(0,1.5fr)", render: (r) => r.reason ?? "" },
                { key: "at", label: "When", width: "80px", align: "right", phone: "end", render: (r) => ago(r.at) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "recent bounces")} />
          )}
        </Panel>
      </div>
      <p className="text-[12px] text-[#6b6b76]">Storelib newsletter: {data.newsletter === null ? `could not be read. ${reasonFor(p, "newsletter") ?? ""}` : `${num(data.newsletter)} subscribed.`}</p>
    </div>
  )
}

/* ── Audience ─────────────────────────────────────────────────────────── */

export function AudienceView({ data }: Common & { data: AudiencePayload }) {
  const p = data.problems
  return (
    <div className="space-y-4">
      <ViewHeader title="Audience" meta="Page views across every storefront, last 30 days." />
      <ReadNotes problems={p} notices={data.notices} />
      <Figures
        items={[
          { label: "On Storelib now", value: num(data.liveNow), sub: data.viewsLastFive !== null ? `${num(data.viewsLastFive)} views in 5 min` : undefined, unreadable: data.liveNow === null ? reasonFor(p, "live now") : null },
          { label: "Views", value: num(data.views30), unreadable: data.views30 === null ? reasonFor(p, "views, 30 days") : null },
          { label: "Visitors", value: num(data.visitors30), unreadable: data.visitors30 === null ? reasonFor(p, "views, 30 days") : null },
          { label: "Views per visitor", value: data.views30 !== null && data.visitors30 ? (data.views30 / data.visitors30).toFixed(1) : "", unreadable: data.views30 === null ? reasonFor(p, "views, 30 days") : null },
        ]}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Where visitors come from">
          {data.sources ? (
            <DataList
              label="Sources"
              rows={data.sources}
              rowKey={(r) => r.name}
              empty="No views yet."
              columns={[
                { key: "name", label: "Source", width: "minmax(0,1fr)", phone: "primary", render: (r) => statusWord(r.name) },
                { key: "visitors", label: "Visitors", width: "90px", align: "right", render: (r) => `${num(r.visitors)} visitors` },
                { key: "views", label: "Views", width: "90px", align: "right", phone: "end", render: (r) => num(r.views) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "views, 30 days")} />
          )}
        </Panel>
        <Panel title="Countries" meta="By sales, then views">
          {data.countries ? (
            <DataList
              label="Countries"
              rows={data.countries}
              rowKey={(r) => r.code}
              empty="No views or orders yet."
              columns={[
                { key: "name", label: "Country", width: "minmax(0,1fr)", phone: "primary", render: (r) => r.name },
                { key: "views", label: "Views", width: "80px", align: "right", render: (r) => `${num(r.views)} views` },
                { key: "orders", label: "Orders", width: "70px", align: "right", render: (r) => `${num(r.orders)} orders` },
                { key: "gross", label: "Sales", width: "96px", align: "right", phone: "end", render: (r) => money(r.gross) },
              ]}
            />
          ) : (
            <Unread reason={reasonFor(p, "views, 30 days", "orders by country")} />
          )}
        </Panel>
        {/* Both columns wide, under the two panels above it. */}
        <AiAssistantsPanel ai={data.ai} problems={p} />
      </div>
    </div>
  )
}

/**
 * THE AI ASSISTANTS GROUP. Visits whose referrer or utm_source names an
 * assistant, Storelib accounts whose sign up visit did, and which of those
 * stores pay or sell (lib/attribution/ai-funnel). Most visits from an
 * assistant carry no referrer and are Direct above, so this is a floor,
 * never the whole of it, and the panel says so.
 *
 * Round 46: storelib.com visits, Storelib's own count of visits to its own
 * pages (part 350, lib/attribution/ai-visits), first in each row so a row
 * reads as the funnel it is: visits, then sign ups, then paid. Store views
 * stay apart, after it: they are creators' pages. Each assistant's top
 * landing pages under it. Before part 350 the column is left out and one
 * line says what to run.
 */
function AiAssistantsPanel({ ai, problems }: { ai: AudiencePayload["ai"]; problems: AudiencePayload["problems"] }) {
  const counted = ai?.siteVisits !== null && ai?.siteVisits !== undefined
  type Row = NonNullable<AudiencePayload["ai"]>["rows"][number]
  const columns: Column<Row>[] = [
    { key: "label", label: "Assistant", width: "minmax(0,1fr)", phone: "primary", render: (r) => r.label },
    ...(counted ? [{ key: "site", label: "storelib.com visits", width: "168px", align: "right" as const, render: (r: Row) => `${num(r.siteVisits)} storelib.com visits` }] : []),
    { key: "signups", label: "Sign ups", width: "84px", align: "right", phone: "end", render: (r) => `${num(r.signups)} sign ups` },
    { key: "paid", label: "Paid plan", width: "84px", align: "right", render: (r) => `${num(r.paidPlan)} paid` },
    { key: "sale", label: "Has a sale", width: "84px", align: "right", render: (r) => `${num(r.hasSale)} selling` },
    { key: "views", label: "Store views", width: "128px", align: "right", render: (r) => `${num(r.views)} store views` },
  ]
  return (
    <Panel title="AI assistants" meta="AI-referred (where the source is known)" className="lg:col-span-2">
      {ai ? (
        <div data-ai-assistants>
          {counted ? null : (
            <p className="border-b border-white/[0.06] px-4 py-2.5 text-[12px] text-[#9b9ba6]" data-ai-visits-missing>
              Run SQL part 350 to count visits to storelib.com.
            </p>
          )}
          <DataList label="AI assistants" rows={ai.rows} rowKey={(r) => r.key} empty="No visit or sign up in the last 30 days named an AI assistant." columns={columns} />
          {counted && ai.landings.length ? (
            <div className="border-t border-white/[0.06]" data-ai-landings>
              <h3 className="px-4 pb-1 pt-3 text-[12px] font-medium text-[#9b9ba6]">Top storelib.com pages per assistant</h3>
              <DataList
                label="Top storelib.com pages per assistant"
                rows={ai.landings}
                rowKey={(r) => `${r.key}|${r.path}`}
                empty=""
                columns={[
                  { key: "path", label: "Page", width: "minmax(0,1fr)", phone: "primary", render: (r) => <span title={r.path}>{r.path}</span> },
                  { key: "label", label: "Assistant", width: "140px", render: (r) => r.label },
                  { key: "visits", label: "Visits", width: "96px", align: "right", phone: "end", render: (r) => `${num(r.visits)} visits` },
                ]}
              />
            </div>
          ) : null}
          <div className="space-y-1.5 border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-[#9b9ba6]" data-ai-visits-source>
            <p className="text-[#c9c9d1]">
              Last 30 days: {counted ? `${num(ai.siteVisits)} storelib.com visits, then ` : ""}
              {num(ai.signups)} of {ai.signupsAll === null ? "the" : num(ai.signupsAll)} Storelib sign ups, then {num(ai.paidPlan)} on a paid plan and {num(ai.hasSale)} with a sale.
            </p>
            {counted ? (
              <p>
                <span className="text-[#c9c9d1]">storelib.com visits.</span> {AI_VISITS_LABEL} Once per tab session for each page.
              </p>
            ) : null}
            <p>
              <span className="text-[#c9c9d1]">Store views.</span> Page views on creators&apos; storefronts, {num(ai.views)} from {num(ai.visitors)} visitors.{" "}
              <span className="text-[#c9c9d1]">Sign ups.</span> Credited to the last visit that named an assistant.
            </p>
            <p>Most visits from an assistant arrive with no referrer and count as Direct, so these are the ones whose source is known, not all of them.</p>
          </div>
        </div>
      ) : (
        <Unread reason={reasonFor(problems, "views, 30 days", "AI sign ups", "storelib.com AI visits")} />
      )}
    </Panel>
  )
}

/* ── People ───────────────────────────────────────────────────────────── */

export function PeopleView({ data, go, query, onQuery, act }: Common & { data: PeoplePayload; act: (action: Action) => void }) {
  const p = data.problems
  const [person, setPerson] = React.useState<PersonRow | null>(null)
  React.useEffect(() => {
    if (!person || !data.list) return
    if (!data.list.rows.some((r) => r.id === person.id)) setPerson(null)
  }, [data.list, person])
  return (
    <div className="space-y-4">
      <ViewHeader title="People" meta="Every account, buyer or creator. Open one to delete it completely. Search by handle, name, id or whole email address." />
      <ReadNotes problems={p} notices={data.notices} />
      {data.reports?.length ? (
        <Panel title="Open message reports">
          <DataList
            label="Message reports"
            rows={data.reports}
            rowKey={(r) => r.id}
            empty=""
            columns={[
              { key: "reason", label: "Reason", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.reason },
              { key: "status", label: "Status", width: "100px", render: (r) => <Status value={r.status === "open" ? "pending" : r.status} label={statusWord(r.status)} /> },
              { key: "at", label: "When", width: "90px", align: "right", phone: "end", render: (r) => ago(r.at) },
            ]}
          />
        </Panel>
      ) : null}
      <Toolbar>
        <SearchField label="Search people" value={query} onChange={onQuery} placeholder="Handle, name, id or email" />
      </Toolbar>
      {person ? (
        <Panel
          title={person.name}
          meta={[person.handle ? `@${person.handle}` : null, displayEmail(person.email), person.role === "admin" ? "Admin" : person.creator ? "Creator" : "Buyer"].filter(Boolean).join(" · ")}
          action={
            <div className="flex flex-wrap gap-2">
              {person.creator ? (
                <Button variant="quiet" className="h-8" onClick={() => go({ view: "creators", q: person.handle || person.id, page: 1 })}>
                  Find creator
                </Button>
              ) : null}
              {person.role !== "admin" ? (
                <Button
                  variant="danger"
                  className="h-8"
                  onClick={() =>
                    act({
                      kind: "delete_account",
                      userId: person.id,
                      label: person.handle ? `@${person.handle}` : person.name,
                    })
                  }
                >
                  Delete account
                </Button>
              ) : null}
              <Button variant="quiet" className="h-8" onClick={() => setPerson(null)}>Close</Button>
            </div>
          }
        >
          <Facts
            items={[
              { label: "User id", value: person.id },
              { label: "Short id", value: short(person.id) },
              { label: "Joined", value: date(person.joined) },
              { label: "Spam review", value: person.spam ? statusWord(person.spam) : "Not reviewed" },
            ]}
          />
          <p className="border-t border-white/[0.08] px-4 py-3 text-[12px] text-[#6b6b76]">
            Deleting removes sign-in and personal details. Creators who have sold are retired instead of wiped; buyers keep access and records stay. This is not a ban.
          </p>
        </Panel>
      ) : null}
      <Panel>
        {data.list ? (
          <>
            <DataList
              label="People"
              rows={data.list.rows}
              rowKey={(r) => r.id}
              empty={data.q ? "No account matches that. Email search takes the whole address." : "No accounts."}
              onOpen={(r) => setPerson(r)}
              columns={[
                { key: "name", label: "Name", width: "minmax(0,1.4fr)", phone: "primary", render: (r) => r.name },
                { key: "handle", label: "Handle", width: "minmax(0,1fr)", render: (r) => (r.handle ? `@${r.handle}` : "No handle") },
                { key: "email", label: "Email", width: "minmax(0,1.2fr)", render: (r) => displayEmail(r.email) ?? "" },
                { key: "kind", label: "Kind", width: "84px", render: (r) => (r.role === "admin" ? "Admin" : r.creator ? "Creator" : "Buyer") },
                { key: "spam", label: "Spam review", width: "100px", render: (r) => (r.spam ? <Status value={r.spam === "clear" ? "ok" : "failed"} label={statusWord(r.spam)} /> : "") },
                { key: "joined", label: "Joined", width: "100px", align: "right", phone: "end", render: (r) => date(r.joined) },
              ]}
            />
            <Pager page={data.list.page} pages={data.list.pages} total={data.list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(p, "accounts")} />
        )}
      </Panel>
    </div>
  )
}

/* ── Audit ────────────────────────────────────────────────────────────── */

export function AuditView({ data, go, route }: Common & { data: AuditPayload }) {
  const p = data.problems
  return (
    <div className="space-y-4">
      <ViewHeader title="Audit log" meta="Every change made from the admin: bans, products taken down, refunds, deleted accounts." />
      <ReadNotes problems={p} notices={data.notices} />
      <Filters
        label="Filter the log"
        value={route.filter || "all"}
        onChange={(f) => go({ filter: f === "all" ? "" : f, page: 1 })}
        options={[
          { id: "all", label: "All" },
          { id: "creator", label: "Creators" },
          { id: "product", label: "Products" },
          { id: "order", label: "Orders" },
          { id: "account", label: "Accounts" },
        ]}
      />
      <Panel>
        {data.list ? (
          <>
            <DataList
              label="Audit log"
              rows={data.list.rows}
              rowKey={(r) => r.id}
              empty="Nothing has been changed from the admin yet."
              onOpen={(r) => (r.targetType === "creator" ? go({ view: "creator", id: r.targetId, q: "", filter: "", page: 1 }) : undefined)}
              columns={[
                { key: "action", label: "Action", width: "minmax(0,1fr)", phone: "primary", render: (r) => statusWord(r.action) },
                { key: "target", label: "On", width: "minmax(0,1.4fr)", render: (r) => r.label || `${r.targetType} ${short(r.targetId)}` },
                { key: "reason", label: "Reason", width: "minmax(0,1.6fr)", render: (r) => r.reason ?? "" },
                { key: "at", label: "When", width: "110px", align: "right", phone: "end", render: (r) => ago(r.at) },
              ]}
            />
            <Pager page={data.list.page} pages={data.list.pages} total={data.list.total} onPage={(page) => go({ page })} />
          </>
        ) : (
          <Unread reason={reasonFor(p, "audit")} />
        )}
      </Panel>
    </div>
  )
}

/* ── System ───────────────────────────────────────────────────────────── */

export function SystemView({ data }: Common & { data: SystemPayload }) {
  const missing = data.schema.filter((s) => s.present === false || s.missingColumns.length)
  const groups = [...new Set(data.env.map((e) => e.group))]
  return (
    <div className="space-y-4">
      <ViewHeader title="Health" meta="Scheduled jobs, configuration, the database and the checkout's wallet buttons, checked now." />
      <ReadNotes problems={data.problems} notices={data.notices} />
      {data.problems.some((p) => p.table === "error_events" || p.table === "storelib_applied_parts" || p.table === "platform_settings") ? (
        <p className="rounded-[10px] border border-[#d4a72c]/30 bg-[#d4a72c]/[0.06] px-4 py-3 text-[13px] text-[#ededf0]">
          Paste <code className="font-mono text-[12px] text-[#c9c9d1]">supabase/sql/RUN_ADMIN_HEALTH.sql</code> into the Supabase SQL editor and run it once, then refresh this page. (Or run the full{" "}
          <code className="font-mono text-[12px] text-[#c9c9d1]">RUN_ADMIN_CONSOLE.sql</code> if you have not run that yet.)
        </p>
      ) : null}

      <ExploreMarketplacePanel />
      <ExploreDiscoverModeSwitcherPanel />
      <PhysicalCommercePanel />
      <BuyerHeaderThemePanel />
      {/* The one panel here that changes something, and the last step for Apple Pay. */}
      <WalletDomainsPanel />
      {/* The OnePage host, where Instant checkout runs: Apple Pay asks for each domain on its own (round 11). */}
      <WalletDomainsPanel domain={getOnePageDomain()} />

      <Panel title="Scheduled jobs" meta="Judged by the work each one leaves behind">
        <DataList
          label="Scheduled jobs"
          rows={data.crons}
          rowKey={(r) => r.path}
          empty=""
          columns={[
            { key: "what", label: "Job", width: "minmax(0,1.4fr)", phone: "primary", render: (r) => r.what },
            { key: "state", label: "State", width: "100px", phone: "end", render: (r) => <Status value={r.state === "ok" ? "ok" : r.state === "late" ? "failed" : null} label={r.state === "ok" ? "Running" : r.state === "late" ? "Behind" : "Unknown"} /> },
            { key: "note", label: "What it shows", width: "minmax(0,2fr)", render: (r) => r.note },
            { key: "last", label: "Last sign", width: "100px", align: "right", render: (r) => (r.lastSign ? ago(r.lastSign) : "None") },
          ]}
        />
      </Panel>

      <Panel title="Database" meta={missing.length ? `${missing.length} need the SQL` : "Everything the admin reads is there"}>
        <DataList
          label="Database"
          rows={data.schema}
          rowKey={(r) => r.table}
          empty=""
          columns={[
            { key: "table", label: "Table or function", width: "minmax(0,1.2fr)", phone: "primary", render: (r) => r.table },
            {
              key: "state",
              label: "State",
              width: "110px",
              phone: "end",
              render: (r) => (r.present === true && !r.missingColumns.length ? <Status value="ok" label="Present" /> : r.present === null ? <Status value="late" label="Not checked" /> : <Status value="failed" label="Missing" />),
            },
            { key: "detail", label: "Detail", width: "minmax(0,2fr)", render: (r) => (r.missingColumns.length ? `No column ${r.missingColumns.join(", ")}` : r.reason ?? "") },
          ]}
        />
        {missing.length ? (
          <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] text-[#9b9ba6]">Run supabase/sql/RUN_ADMIN_CONSOLE.sql in the Supabase SQL editor, then open this page again.</p>
        ) : null}
      </Panel>

      <ErrorsPanel errors={data.errors} />

      <SqlPartsPanel parts={data.sqlParts} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Configuration" meta="Set or not set. Values never leave the server.">
          <div className="grid gap-x-6 px-4 py-2 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g} className="py-2">
                <p className="mb-1 text-[12px] text-[#6b6b76]">{g}</p>
                <ul className="space-y-1">
                  {data.env.filter((e) => e.group === g).map((e) => (
                    <li key={e.name} className="flex min-w-0 items-center justify-between gap-3">
                      <code className="min-w-0 truncate font-mono text-[12px] text-[#c9c9d1]">{e.name}</code>
                      {e.optional ? (
                        <Status value={e.set ? "ok" : null} label={e.set ? "Set" : "Off"} />
                      ) : (
                        <Status value={e.set ? "ok" : "failed"} label={e.set ? "Set" : "Not set"} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Rate limits">
          <div className="px-4 py-3">
            {data.rateLimit.rows === null ? (
              <p className="text-[13px] text-[#9b9ba6]">Could not be read. {reasonFor(data.problems, "rate limit rows")}</p>
            ) : (
              <>
                <p className="text-[22px] font-semibold tabular-nums">{num(data.rateLimit.rows)}</p>
                <p className="text-[12px] text-[#9b9ba6]">rows in rate_limit_hits{data.rateLimit.oldest ? `, oldest ${ago(data.rateLimit.oldest)}` : ""}</p>
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/**
 * Which SQL parts this database has run, from its own record (run-now part
 * 67). The parts that want attention first; a database that is up to date
 * shows one line.
 */
function SqlPartsPanel({ parts }: { parts: SystemPayload["sqlParts"] }) {
  const unknown = parts.every((p) => p.state === "unknown")
  const open = parts.filter((p) => p.state === "missing" || p.state === "changed")
  const applied = parts.filter((p) => p.state === "applied").length
  const meta = unknown ? "History unavailable" : open.length ? `${open.length} to review` : `${applied} recorded`
  return (
    <Panel title="Database updates" meta={meta} action={<a href="/admin/sql-updates" className="text-[12px] text-[#9b9ba6] underline">Review and copy SQL</a>}>
      {unknown ? (
        <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Execution history is unavailable. The ledger may be missing, or the database could not be read. Open SQL updates to review source files and tracking instructions. Nothing is assumed applied or pending.</p>
      ) : open.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Every part in this Health list has a matching execution record. Open SQL updates to also review standalone and owner-only files.</p>
      ) : (
        <>
          <DataList
            label="Database updates"
            rows={open}
            rowKey={(r) => r.part}
            empty=""
            columns={[
              { key: "file", label: "Part", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.file },
              { key: "state", label: "State", width: "120px", phone: "end", render: (r) => <Status value={r.state === "missing" ? "failed" : "late"} label={r.state === "missing" ? "Unrecorded" : "Changed since"} /> },
              { key: "when", label: "Ran", width: "100px", align: "right", render: (r) => (r.appliedAt ? ago(r.appliedAt) : "No record") },
            ]}
          />
          <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] text-[#9b9ba6]">Review files and dependencies in SQL updates before running anything. Older manual executions may not be recorded.</p>
        </>
      )}
    </Panel>
  )
}

/** What has been failing, one line per kind of error, counted (lib/observability/report). */
function ErrorsPanel({ errors }: { errors: SystemPayload["errors"] }) {
  const total = (errors ?? []).reduce((n, e) => n + e.count, 0)
  return (
    <Panel title="Errors" meta={errors === null ? "No record yet" : errors.length ? `${errors.length} kinds, ${total} times, last 7 days` : "None in the last 7 days"}>
      {errors === null ? (
        <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Errors are counted after supabase/sql/RUN_ADMIN_HEALTH.sql (or RUN_ADMIN_CONSOLE.sql) has run. Until then they are only in the Vercel log.</p>
      ) : errors.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Nothing has failed in the last 7 days.</p>
      ) : (
        <DataList
          label="Errors"
          rows={errors}
          rowKey={(r) => r.fingerprint}
          empty=""
          columns={[
            { key: "where", label: "Where", width: "minmax(0,1.2fr)", phone: "primary", render: (r) => r.where },
            { key: "message", label: "What", width: "minmax(0,2fr)", render: (r) => r.message },
            { key: "count", label: "Times", width: "70px", align: "right", phone: "end", render: (r) => String(r.count) },
            { key: "last", label: "Last", width: "90px", align: "right", render: (r) => ago(r.lastSeen) },
          ]}
        />
      )}
    </Panel>
  )
}
