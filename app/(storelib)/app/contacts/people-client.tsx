"use client"

/**
 * ===========================================================================
 *  CONTACTS › PEOPLE
 * ===========================================================================
 * One row per person the store knows (lib/contacts/identity.ts decides who
 * is one person). The five pills choose the group, the search and the sort
 * sit under them, and everything else is behind Filters so the list stays
 * the first thing on the page. The address is the state: every change
 * replaces it and the server reads the page again (./page.tsx), so the
 * filters survive a reload and a shared link.
 *
 * Picking people opens a bar with what can be done to them: a tag, an
 * export, an email (the composer, with them chosen; only people on the
 * marketing list get it), and deleting what the creator added. Deleting
 * never touches an order, a membership, a community member, a form answer
 * or the list (lib/contacts/write-server).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { FilterPills } from "@/components/app/filter-pills"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import {
  LEAD_STATUSES,
  MEMBER_STATUSES,
  ORIGINS,
  PAGE_SIZE,
  advancedCount,
  peopleQueryString,
  type AdvancedFilters,
  type ContactFilter,
  type ContactSort,
  type PeopleQuery,
  type PersonRow,
} from "@/lib/contacts/identity"
import type { PeoplePage } from "@/lib/contacts/people-server"
import { GUTTER, LIST_WIDTH, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { ContactsHeader } from "./contacts-header"
import { contactsRequest, dayOf, labelsOf, leadStatusLabel, memberStatusLabel, originLabel, subscriptionLabel, whoOf } from "./contact-words"

export interface CommunityOption {
  id: string
  name: string
  tiers: { id: string; name: string }[]
}

const EMAIL_MAX = 200
const field = "h-9 w-full rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10"
const fieldLabel = "mb-1 block text-[12px] font-medium text-[#4b5563]"

export function PeopleClient({ query, page, communities, marketing, notice }: { query: PeopleQuery; page: PeoplePage | null; communities: CommunityOption[]; marketing: boolean; notice: "not_found" | "no_person" | null }) {
  const router = useRouter()
  const phone = usePhoneWidth()
  const [pending, startTransition] = React.useTransition()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = React.useState(() => advancedCount(query.adv) > 0)
  const [adding, setAdding] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; failed?: boolean } | null>(null)

  const go = React.useCallback(
    (change: Partial<PeopleQuery>) => {
      const qs = peopleQueryString(query, { page: 1, ...change })
      setSelected(new Set())
      startTransition(() => router.replace(qs ? `/app/contacts?${qs}` : "/app/contacts", { scroll: false }))
    },
    [query, router],
  )
  const refresh = React.useCallback(() => startTransition(() => router.refresh()), [router])

  /* The search box: what is typed, sent a moment after the last key. */
  const [text, setText] = React.useState(query.q)
  React.useEffect(() => setText(query.q), [query.q])
  React.useEffect(() => {
    if (text.trim() === query.q) return
    const t = window.setTimeout(() => go({ q: text.trim() }), 350)
    return () => window.clearTimeout(t)
  }, [text, query.q, go])

  const rows = page?.rows ?? []
  const counts = page?.counts ?? { all: 0, leads: 0, customers: 0, subscribers: 0, members: 0 }
  const total = page?.total ?? 0
  const filtered = !!query.q || advancedCount(query.adv) > 0
  const nothingAtAll = !!page && counts.all === 0 && !filtered

  const exportHref = (ids?: string[]) => {
    const qs = peopleQueryString({ ...query, page: 1 })
    const p = new URLSearchParams(qs)
    if (ids) p.set("ids", ids.join(","))
    return `/api/contacts/export${p.toString() ? `?${p}` : ""}`
  }

  const headerMenu: ActionMenuItem[] = [
    { label: tt("Import from a CSV file"), onClick: () => setImporting(true) },
    { label: tt("Export these people"), href: exportHref() },
  ]

  return (
    <>
      <ContactsHeader
        tab="people"
        actions={
          <>
            <ResponsiveActionMenu
              title={tt("Contacts")}
              align="end"
              trigger={
                <button type="button" className={cn(buttonSecondary, "w-8 px-0 sm:w-auto sm:px-3")} aria-label={tt("Import and export")}>
                  <MoreHorizontal className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{tt("Import and export")}</span>
                </button>
              }
              items={headerMenu}
            />
            <button type="button" className={buttonAccent} onClick={() => setAdding(true)} data-add-contact="">
              <Plus className="h-4 w-4 shrink-0" />
              {tt("Add contact")}
            </button>
          </>
        }
      />

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)} data-contacts-people="" aria-busy={pending}>
        <div className="mt-3">
          <FilterPills<ContactFilter>
            label={tt("Show")}
            value={query.filter}
            onChange={(filter) => go({ filter })}
            options={[
              { value: "all", label: tt("All"), count: counts.all },
              { value: "leads", label: tt("Leads"), count: counts.leads },
              { value: "customers", label: tt("Customers"), count: counts.customers },
              { value: "subscribers", label: tt("Subscribers"), count: counts.subscribers },
              { value: "members", label: tt("Members"), count: counts.members },
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-[220px]">
            <span className="sr-only">{tt("Search by name or email")}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={tt("Search by name or email")} className={cn(field, "pl-8")} data-contacts-search="" />
          </label>
          <label className="shrink-0">
            <span className="sr-only">{tt("Sort")}</span>
            <select value={query.sort} onChange={(e) => go({ sort: e.target.value as ContactSort })} className={cn(field, "w-auto pr-7")}>
              <option value="recent">{tt("Last activity")}</option>
              <option value="newest">{tt("Newest first")}</option>
              <option value="oldest">{tt("Oldest first")}</option>
              <option value="name">{tt("Name")}</option>
            </select>
          </label>
          <button type="button" className={cn(buttonSecondary, "h-9")} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} data-contacts-filters="">
            <SlidersHorizontal className="h-4 w-4" />
            {tt("Filters")}
            {advancedCount(query.adv) > 0 ? <span className="tabular-nums text-[#6b7280]">{advancedCount(query.adv)}</span> : null}
          </button>
        </div>

        {filtersOpen ? <AdvancedPanel adv={query.adv} communities={communities} onChange={(adv) => go({ adv })} onClear={() => go({ adv: clearedAdv() })} /> : null}

        {notice ? (
          <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]" role="status">
            {notice === "not_found" ? tt("That person is not in this store's contacts.") : tt("That record has no email address or account, so it is not linked to a person.")}
          </p>
        ) : null}
        {page?.partial ? (
          <p className="mt-3 text-[13px] text-[#6b7280]" role="status">
            {tt("Showing people from your latest 2,000 records of each kind. Run the Contacts database update (SQL part 378) to see everyone.")}
          </p>
        ) : null}
        {message ? (
          <p className={cn("mt-3 text-[13px]", message.failed ? "text-[#b42318]" : "text-[#14532d]")} role="status">
            {message.text}
          </p>
        ) : null}

        {selected.size > 0 ? (
          <SelectionBar
            ids={[...selected]}
            people={rows.filter((r) => selected.has(r.id))}
            exportHref={exportHref([...selected])}
            onClear={() => setSelected(new Set())}
            onDone={(text, failed) => {
              setMessage({ text, failed })
              if (!failed) {
                setSelected(new Set())
                refresh()
              }
            }}
          />
        ) : null}

        <section className={cn(card, "mt-3 overflow-hidden transition-opacity duration-150", pending && "opacity-60")} aria-label={tt("People")}>
          {!page ? (
            <Empty title={tt("Your contacts could not be loaded.")} body={tt("Nothing was changed. Try again in a moment.")} action={<button type="button" className={buttonSecondary} onClick={refresh}>{tt("Try again")}</button>} />
          ) : nothingAtAll ? (
            <Empty
              title={tt("No people yet")}
              body={tt("People show up here when they buy from you, join your email list, answer one of your forms or join your community.")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" className={buttonAccent} onClick={() => setAdding(true)}>
                    {tt("Add contact")}
                  </button>
                  <button type="button" className={buttonSecondary} onClick={() => setImporting(true)}>
                    {tt("Import from a CSV file")}
                  </button>
                  <Link href="/app/contacts/forms" className={buttonSecondary}>
                    {tt("Make a form")}
                  </Link>
                </div>
              }
            />
          ) : rows.length === 0 ? (
            <Empty
              title={tt("No one matches")}
              body={filtered ? tt("Try other words, or clear the filters.") : tt("Nobody is in this group yet.")}
              action={filtered ? <button type="button" className={buttonSecondary} onClick={() => go({ q: "", adv: clearedAdv() })}>{tt("Clear search and filters")}</button> : null}
            />
          ) : phone ? (
            <PhoneList rows={rows} selected={selected} onToggle={(id) => setSelected((s) => toggled(s, id))} />
          ) : (
            <Table rows={rows} selected={selected} onToggle={(id) => setSelected((s) => toggled(s, id))} onToggleAll={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />
          )}
        </section>

        {page && total > PAGE_SIZE ? <Pager page={query.page} total={total} onPage={(p) => go({ page: p })} /> : null}
      </div>

      <AddContact open={adding} phone={phone} marketing={marketing} onClose={() => setAdding(false)} onAdded={(t) => { setAdding(false); setMessage({ text: t }); refresh() }} />
      <ImportPeople open={importing} phone={phone} marketing={marketing} onClose={() => setImporting(false)} onDone={(t) => { setMessage({ text: t }); refresh() }} />
    </>
  )
}

function clearedAdv(): AdvancedFilters {
  return { origin: undefined, tag: undefined, subscription: undefined, community: undefined, tier: undefined, access: undefined, bought: undefined, forms: undefined, course: undefined, from: undefined, to: undefined, leadStatus: undefined }
}

function toggled(s: Set<string>, id: string): Set<string> {
  const next = new Set(s)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mx-auto mt-1 max-w-[440px] text-[14px] text-[#6b7280]">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/* ─── The filters behind Filters ───────────────────────────────────────── */

function AdvancedPanel({ adv, communities, onChange, onClear }: { adv: AdvancedFilters; communities: CommunityOption[]; onChange: (a: AdvancedFilters) => void; onClear: () => void }) {
  const set = (k: keyof AdvancedFilters, v: string) => onChange({ ...adv, [k]: v || undefined })
  const [tag, setTag] = React.useState(adv.tag ?? "")
  React.useEffect(() => setTag(adv.tag ?? ""), [adv.tag])
  const community = communities.find((c) => c.id === adv.community)
  const yesNo = (k: "bought" | "forms" | "course", label: string, yes: string, no: string) => (
    <label>
      <span className={fieldLabel}>{label}</span>
      <select className={field} value={adv[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{tt("Anyone")}</option>
        <option value="yes">{yes}</option>
        <option value="no">{no}</option>
      </select>
    </label>
  )
  return (
    <div className={cn(card, "mt-3 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4")} data-contacts-advanced="">
      <label>
        <span className={fieldLabel}>{tt("Came from")}</span>
        <select className={field} value={adv.origin ?? ""} onChange={(e) => set("origin", e.target.value)}>
          <option value="">{tt("Anywhere")}</option>
          {ORIGINS.map((o) => (
            <option key={o} value={o}>
              {originLabel(o)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={fieldLabel}>{tt("Tag")}</span>
        <input
          className={field}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onBlur={() => tag.trim() !== (adv.tag ?? "") && set("tag", tag.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") set("tag", tag.trim())
          }}
          placeholder={tt("Any tag")}
        />
      </label>
      <label>
        <span className={fieldLabel}>{tt("Marketing emails")}</span>
        <select className={field} value={adv.subscription ?? ""} onChange={(e) => set("subscription", e.target.value)}>
          <option value="">{tt("Anyone")}</option>
          {(["subscribed", "none", "unsubscribed", "blocked"] as const).map((s) => (
            <option key={s} value={s}>
              {subscriptionLabel(s)}
            </option>
          ))}
        </select>
      </label>
      {yesNo("bought", tt("Purchases"), tt("Bought something"), tt("Never bought"))}
      {communities.length ? (
        <>
          <label>
            <span className={fieldLabel}>{tt("Community")}</span>
            <select className={field} value={adv.community ?? ""} onChange={(e) => onChange({ ...adv, community: e.target.value || undefined, tier: undefined })}>
              <option value="">{tt("Any community")}</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || tt("Untitled community")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabel}>{tt("Tier")}</span>
            <select className={field} value={adv.tier ?? ""} disabled={!community || community.tiers.length === 0} onChange={(e) => set("tier", e.target.value)}>
              <option value="">{community ? tt("Any tier") : tt("Choose a community first")}</option>
              {(community?.tiers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabel}>{tt("Community access")}</span>
            <select className={field} value={adv.access ?? ""} onChange={(e) => set("access", e.target.value)}>
              <option value="">{tt("Any status")}</option>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {memberStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {yesNo("forms", tt("Form answers"), tt("Answered a form"), tt("No form answers"))}
      {yesNo("course", tt("Courses"), tt("Enrolled in a course"), tt("No course"))}
      <label>
        <span className={fieldLabel}>{tt("Lead status")}</span>
        <select className={field} value={adv.leadStatus ?? ""} onChange={(e) => set("leadStatus", e.target.value)}>
          <option value="">{tt("Any status")}</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {leadStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={fieldLabel}>{tt("First seen from")}</span>
        <input type="date" className={field} value={adv.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      </label>
      <label>
        <span className={fieldLabel}>{tt("First seen until")}</span>
        <input type="date" className={field} value={adv.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      </label>
      <div className="flex items-end">
        <button type="button" className={cn(buttonSecondary, "h-9")} onClick={onClear} disabled={advancedCount(adv) === 0}>
          {tt("Clear filters")}
        </button>
      </div>
    </div>
  )
}

/* ─── The rows ─────────────────────────────────────────────────────────── */

function Labels({ p }: { p: PersonRow }) {
  const labels = labelsOf(p)
  if (!labels.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="rounded-md bg-[#f1f2f4] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-[#4b5563]">
          {l}
        </span>
      ))}
    </span>
  )
}

function Check({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return <input type="checkbox" checked={on} onChange={onChange} onClick={(e) => e.stopPropagation()} aria-label={label} className="h-4 w-4 cursor-pointer rounded border-[#d1d5db] accent-[#1a1a2e]" />
}

const th = "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-[#4b5563]"
const td = "px-3 py-2.5 text-[13px] text-[#1a1a2e] align-middle"

function Table({ rows, selected, onToggle, onToggleAll }: { rows: PersonRow[]; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (on: boolean) => void }) {
  const router = useRouter()
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id))
  return (
    <div className="table-scroll">
      <table className="w-full">
        <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
          <tr>
            <th className={cn(th, "w-10")}>
              <Check on={all} label={tt("Pick everyone on this page")} onChange={() => onToggleAll(!all)} />
            </th>
            <th className={th}>{tt("Person")}</th>
            <th className={th}>{tt("Marketing emails")}</th>
            <th className={th}>{tt("Came from")}</th>
            <th className={cn(th, "text-right")}>{tt("Orders")}</th>
            <th className={th}>{tt("Last activity")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer border-b border-[#f1f2f4] last:border-0 hover:bg-[#fafbfb]"
              onClick={() => router.push(`/app/contacts/${p.id}`)}
              data-contact-row={p.id}
            >
              <td className={cn(td, "w-10")}>
                <Check on={selected.has(p.id)} label={tt("Pick {name}", { name: whoOf(p) })} onChange={() => onToggle(p.id)} />
              </td>
              <td className={cn(td, "max-w-[340px]")}>
                <Link href={`/app/contacts/${p.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                  {whoOf(p)}
                </Link>
                {p.name && p.email ? <span className="block truncate text-[12px] text-[#6b7280]">{p.email}</span> : null}
                <span className="mt-1 block">
                  <Labels p={p} />
                </span>
              </td>
              <td className={cn(td, "whitespace-nowrap", p.subscription === "subscribed" ? "" : "text-[#6b7280]")}>{subscriptionLabel(p.subscription)}</td>
              <td className={cn(td, "whitespace-nowrap text-[#6b7280]")}>{originLabel(p.origin)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{p.orders || ""}</td>
              <td className={cn(td, "whitespace-nowrap text-[#6b7280]")}>{dayOf(p.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PhoneList({ rows, selected, onToggle }: { rows: PersonRow[]; selected: Set<string>; onToggle: (id: string) => void }) {
  return (
    <ul className="divide-y divide-[#f1f2f4]">
      {rows.map((p) => (
        <li key={p.id} className="flex items-start gap-3 px-4 py-3" data-contact-row={p.id}>
          <span className="pt-0.5">
            <Check on={selected.has(p.id)} label={tt("Pick {name}", { name: whoOf(p) })} onChange={() => onToggle(p.id)} />
          </span>
          <Link href={`/app/contacts/${p.id}`} className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15px] font-medium text-[#1a1a2e]">{whoOf(p)}</span>
              <span className="shrink-0 text-[12px] text-[#9ca3af]">{dayOf(p.lastSeen)}</span>
            </span>
            {p.name && p.email ? <span className="block truncate text-[13px] text-[#6b7280]">{p.email}</span> : null}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Labels p={p} />
              {p.subscription !== "subscribed" && p.subscription !== "none" ? <span className="text-[12px] text-[#9ca3af]">{subscriptionLabel(p.subscription)}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  return (
    <nav className="mt-3 flex items-center justify-between gap-2 text-[13px] text-[#6b7280]" aria-label={tt("Pages")}>
      <span className="tabular-nums">{tt("{from} to {to} of {total}", { from, to, total })}</span>
      <span className="flex gap-1">
        <button type="button" className={iconButton} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={tt("Previous page")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className={iconButton} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label={tt("Next page")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </span>
    </nav>
  )
}

/* ─── What can be done to the people picked ───────────────────────────── */

function SelectionBar({ ids, people, exportHref, onClear, onDone }: { ids: string[]; people: PersonRow[]; exportHref: string; onClear: () => void; onDone: (text: string, failed?: boolean) => void }) {
  const [tagging, setTagging] = React.useState(false)
  const [tag, setTag] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const reachable = people.filter((p) => p.subscriber)
  const emailHref = `/app/emails/new?contacts=${encodeURIComponent(reachable.slice(0, EMAIL_MAX).map((p) => p.id).join(","))}`
  const send = async (action: "tag" | "untag" | "delete") => {
    setBusy(true)
    const r = await contactsRequest<{ changed?: number; deleted?: number; kept?: number }>("/api/contacts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids, tag }), fallback: tt("That did not finish. Try again.") })
    setBusy(false)
    if (!r.ok) return onDone(r.error, true)
    if (action === "delete") {
      const deleted = r.data.deleted ?? 0
      onDone(
        deleted === ids.length
          ? tt("{count, plural, one {Deleted # contact.} other {Deleted # contacts.}}", { count: deleted })
          : tt("Deleted what you added for {count, plural, one {# person} other {# people}}. People with orders, form answers, memberships or a list sign up stay, because those records are kept where they are.", { count: deleted }),
      )
    } else {
      setTagging(false)
      setTag("")
      onDone(action === "tag" ? tt("Tag added to {count, plural, one {# person} other {# people}}.", { count: r.data.changed ?? 0 }) : tt("Tag removed from {count, plural, one {# person} other {# people}}.", { count: r.data.changed ?? 0 }))
    }
  }
  return (
    <div className={cn(card, "mt-3 flex flex-wrap items-center gap-2 px-3 py-2")} data-contacts-selection="">
      <span className="mr-1 text-[13px] font-medium text-[#1a1a2e]">{tt("{count} picked", { count: ids.length })}</span>
      {tagging ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (tag.trim()) void send("tag")
          }}
        >
          <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tt("Tag")} maxLength={40} className={cn(field, "h-8 w-[150px]")} />
          <button type="submit" className={buttonSecondary} disabled={busy || !tag.trim()}>
            {tt("Add")}
          </button>
          <button type="button" className={buttonSecondary} disabled={busy || !tag.trim()} onClick={() => void send("untag")}>
            {tt("Remove")}
          </button>
        </form>
      ) : (
        <button type="button" className={buttonSecondary} onClick={() => setTagging(true)}>
          {tt("Tag")}
        </button>
      )}
      {reachable.length ? (
        <Link href={emailHref} className={buttonSecondary} title={tt("Only people subscribed to your emails get it.")}>
          {tt("Email {count}", { count: Math.min(reachable.length, EMAIL_MAX) })}
        </Link>
      ) : (
        <button type="button" className={buttonSecondary} disabled title={tt("None of them are subscribed to your emails.")}>
          {tt("Email")}
        </button>
      )}
      <a href={exportHref} className={buttonSecondary}>
        {tt("Export")}
      </a>
      <button
        type="button"
        className={cn(buttonSecondary, "text-[#b42318]")}
        disabled={busy}
        onClick={() => {
          if (window.confirm(tt("Delete what you added for these people (notes, tags, people you added or imported)? Their orders, memberships, community access, form answers and list sign ups are not deleted.")))
            void send("delete")
        }}
      >
        {tt("Delete")}
      </button>
      <button type="button" className={cn(iconButton, "ml-auto")} onClick={onClear} aria-label={tt("Clear the selection")}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ─── Adding and importing ────────────────────────────────────────────── */

function AddContact({ open, phone, marketing, onClose, onAdded }: { open: boolean; phone: boolean; marketing: boolean; onClose: () => void; onAdded: (text: string) => void }) {
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [agreed, setAgreed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setEmail("")
    setName("")
    setTags("")
    setAgreed(false)
    setError(null)
  }, [open])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await contactsRequest<{ subscribed?: number }>("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), subscribe: marketing && agreed }),
      fallback: tt("The person was not added. Try again."),
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onAdded(r.data.subscribed ? tt("Added, and subscribed to your emails.") : tt("Added to your contacts."))
  }
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Add contact")} className="p-0 sm:max-w-[460px]" dialog={{ "aria-describedby": undefined }}>
      <form onSubmit={submit} className="space-y-3 p-5">
        <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Add contact")}</SheetDialogTitle>
        <label className="block">
          <span className={fieldLabel}>{tt("Email")}</span>
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{tt("Name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={field} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{tt("Tags, separated by commas")}</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={field} />
        </label>
        {marketing ? (
          <label className="flex items-start gap-2 text-[13px] text-[#1a1a2e]">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1a1a2e]" />
            <span>{tt("They agreed to get my marketing emails. Add them to my email list.")}</span>
          </label>
        ) : null}
        {error ? <p className="text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={buttonAccent} disabled={busy}>
            {busy ? tt("Adding") : tt("Add contact")}
          </button>
        </div>
      </form>
    </SheetDialog>
  )
}

interface ImportAnswer {
  read: number
  invalid: number
  repeated: number
  truncated: boolean
  added: number
  updated: number
  subscribed: number
  alreadySubscribed: number
  keptOff: number
  contactsMissing: boolean
}

function ImportPeople({ open, phone, marketing, onClose, onDone }: { open: boolean; phone: boolean; marketing: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [tag, setTag] = React.useState("")
  const [agreed, setAgreed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ImportAnswer | null>(null)
  React.useEffect(() => {
    if (!open) return
    setFile(null)
    setTag("")
    setAgreed(false)
    setError(null)
    setResult(null)
  }, [open])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setError(tt("Choose a CSV file."))
    if (file.size > 2_000_000) return setError(tt("That file is too large. Split it into files under 2 MB."))
    setBusy(true)
    setError(null)
    const p = new URLSearchParams()
    if (marketing && agreed) p.set("subscribe", "1")
    if (tag.trim()) p.set("tag", tag.trim())
    const r = await contactsRequest<ImportAnswer>(`/api/contacts/import${p.toString() ? `?${p}` : ""}`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: await file.text(), fallback: tt("The import did not finish. Try again.") })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setResult(r.data)
    onDone(tt("Import finished."))
  }
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Import contacts")} className="p-0 sm:max-w-[500px]" dialog={{ "aria-describedby": undefined }}>
      <div className="space-y-3 p-5">
        <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Import contacts")}</SheetDialogTitle>
        {result ? (
          <div className="space-y-2 text-[14px] text-[#1a1a2e]">
            <p>{tt("{count, plural, one {# person read from the file.} other {# people read from the file.}}", { count: result.read })}</p>
            <ul className="space-y-1 text-[13px] text-[#4b5563]">
              {result.added ? <li>{tt("{count, plural, one {# new contact} other {# new contacts}}", { count: result.added })}</li> : null}
              {result.updated ? <li>{tt("{count, plural, one {# contact you already had was updated} other {# contacts you already had were updated}}", { count: result.updated })}</li> : null}
              {result.subscribed ? <li>{tt("{count, plural, one {# added to your email list} other {# added to your email list}}", { count: result.subscribed })}</li> : null}
              {result.alreadySubscribed ? <li>{tt("{count, plural, one {# was already on your email list} other {# were already on your email list}}", { count: result.alreadySubscribed })}</li> : null}
              {result.keptOff ? <li>{tt("{count, plural, one {# had unsubscribed, bounced or only bought from you, and was left off the list} other {# had unsubscribed, bounced or only bought from you, and were left off the list}}", { count: result.keptOff })}</li> : null}
              {result.invalid ? <li>{tt("{count, plural, one {# line had no valid email address} other {# lines had no valid email address}}", { count: result.invalid })}</li> : null}
              {result.truncated ? <li>{tt("Only the first 5,000 rows were read. Import the rest in another file.")}</li> : null}
              {result.contactsMissing ? <li>{tt("Names and tags were not kept: that needs the Contacts database update (SQL part 378).")}</li> : null}
            </ul>
            <div className="flex justify-end pt-1">
              <button type="button" className={buttonAccent} onClick={onClose}>
                {tt("Done")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-[13px] text-[#6b7280]">{tt("A CSV file with an Email column. Name, First name, Last name and Tags columns are read too. Up to 5,000 rows.")}</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px] text-[#1a1a2e] file:mr-3 file:h-8 file:rounded-lg file:border file:border-[#e3e4e8] file:bg-white file:px-3 file:text-[13px] file:font-medium" />
            <label className="block">
              <span className={fieldLabel}>{tt("Tag everyone in this file (optional)")}</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} className={field} />
            </label>
            {marketing ? (
              <label className="flex items-start gap-2 text-[13px] text-[#1a1a2e]">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1a1a2e]" />
                <span>{tt("Everyone in this file agreed to get my marketing emails. Add the new addresses to my email list.")}</span>
              </label>
            ) : null}
            <p className="text-[12px] text-[#6b7280]">{tt("Nobody who unsubscribed, bounced or complained is put back on your list, and no welcome email is sent.")}</p>
            {error ? <p className="text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={buttonSecondary} onClick={onClose}>
                {tt("Cancel")}
              </button>
              <button type="submit" className={buttonAccent} disabled={busy || !file}>
                {busy ? tt("Importing") : tt("Import")}
              </button>
            </div>
          </form>
        )}
      </div>
    </SheetDialog>
  )
}
