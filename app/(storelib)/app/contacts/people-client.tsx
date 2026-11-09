"use client"

/**
 * ===========================================================================
 *  CONTACTS › PEOPLE
 * ===========================================================================
 * One row per person the store knows (lib/contacts/identity.ts decides who
 * is one person), drawn as Orders draws its list (wave 5, the owner: "make
 * it more Storelib UI"): the title and Add contact in the list bar, Forms,
 * Import and Export under one ⋯; one card holding the views, search and
 * sort on its top row, the filters as chips under it while searching, the
 * table (name and email, where they came from, tags, last activity) and the
 * count and pages at its foot. A phone shows each person as one stacked row.
 *
 * The address is the state: every change replaces it and the server reads
 * the page again (./page.tsx), so the filters survive a reload and a shared
 * link, and every older link (?filter=leads, ?tag=VIP, ?sub=…) still opens
 * the same list.
 *
 * Picking people puts what can be done to them in the table's head, as on
 * Orders: a tag, an email (the composer, with them chosen; only people on
 * the marketing list get it), an export, and deleting what the creator
 * added. Deleting never touches an order, a membership, a community member,
 * a form answer or the list (lib/contacts/write-server).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, FileText, ListFilter, MoreHorizontal, Plus, Search, Upload, X } from "lucide-react"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import {
  CONTACT_FILTERS,
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
import { Checkbox, GUTTER, LIST_WIDTH, MenuOption, MenuSurface, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { ContactsHeader } from "./contacts-header"
import { FilterChip } from "./filter-chip"
import { contactsRequest, dayOf, leadStatusLabel, memberStatusLabel, originLabel, subscriptionLabel, whoOf } from "./contact-words"

export interface CommunityOption {
  id: string
  name: string
  tiers: { id: string; name: string }[]
}

const EMAIL_MAX = 200
const field = "h-9 w-full rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10"
const fieldLabel = "mb-1 block text-[12px] font-medium text-[#4b5563]"

function viewLabel(f: ContactFilter): string {
  switch (f) {
    case "leads":
      return tt("Leads")
    case "customers":
      return tt("Customers")
    case "subscribers":
      return tt("Subscribers")
    case "members":
      return tt("Members")
    default:
      return tt("All")
  }
}

function sortLabel(s: ContactSort): string {
  switch (s) {
    case "newest":
      return tt("Newest first")
    case "oldest":
      return tt("Oldest first")
    case "name":
      return tt("Name")
    default:
      return tt("Last activity")
  }
}

export function PeopleClient({ query, page, communities, marketing, notice }: { query: PeopleQuery; page: PeoplePage | null; communities: CommunityOption[]; marketing: boolean; notice: "not_found" | "no_person" | null }) {
  const router = useRouter()
  const phone = usePhoneWidth()
  const [pending, startTransition] = React.useTransition()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
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
  const [searching, setSearching] = React.useState(filtered)
  const nothingAtAll = !!page && counts.all === 0 && !filtered

  const exportHref = (ids?: string[]) => {
    const qs = peopleQueryString({ ...query, page: 1 })
    const p = new URLSearchParams(qs)
    if (ids) p.set("ids", ids.join(","))
    return `/api/contacts/export${p.toString() ? `?${p}` : ""}`
  }

  const moreMenu: ActionMenuItem[] = [
    ...(phone ? [{ label: tt("Forms"), icon: <FileText className="h-4 w-4" />, href: "/app/contacts/forms", id: "contacts-forms" }] : []),
    { label: tt("Import from a CSV file"), icon: <Upload className="h-4 w-4" />, onClick: () => setImporting(true), separatorBefore: phone, id: "contacts-import" },
    { label: tt("Export these people"), icon: <Download className="h-4 w-4" />, href: exportHref(), id: "contacts-export" },
  ]
  const pageIds = rows.map((r) => r.id)
  const pickedOnPage = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pickedOnPage === pageIds.length
  const pick = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const clearAll = () => {
    setText("")
    setSearching(false)
    go({ q: "", adv: clearedAdv() })
  }

  return (
    <>
      <ContactsHeader
        title={tt("Contacts")}
        actions={
          <>
            {phone ? null : (
              <Link href="/app/contacts/forms" className={buttonSecondary} data-contacts-forms-link="">
                <FileText className="h-4 w-4" />
                {tt("Forms")}
              </Link>
            )}
            <ResponsiveActionMenu
              title={tt("Contacts")}
              align="end"
              trigger={
                <button type="button" className={cn(buttonSecondary, "w-8 px-0 max-sm:h-9 max-sm:w-9")} aria-label={tt("More actions")} data-contacts-more="">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={moreMenu}
            />
            <button type="button" className={cn(buttonAccent, "max-sm:h-9")} onClick={() => setAdding(true)} data-add-contact="">
              <Plus className="h-4 w-4 shrink-0" />
              {tt("Add contact")}
            </button>
          </>
        }
      />

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)} data-contacts-people="" aria-busy={pending}>
        {notice ? (
          <p className="mt-1 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]" role="status">
            {notice === "not_found" ? tt("That person is not in this store's contacts.") : tt("That record has no email address or account, so it is not linked to a person.")}
          </p>
        ) : null}
        {page?.partial ? (
          <p className="mt-1 text-[13px] text-[#6b7280]" role="status">
            {tt("Showing people from your latest 2,000 records of each kind. Run the Contacts database update (SQL part 378) to see everyone.")}
          </p>
        ) : null}
        {message ? (
          <p className={cn("mt-1 text-[13px]", message.failed ? "text-[#b42318]" : "text-[#14532d]")} role="status">
            {message.text}
          </p>
        ) : null}

        <section aria-label={tt("People")} className={cn(card, "mt-3 overflow-hidden transition-opacity duration-150", pending && "opacity-60")}>
          {nothingAtAll ? null : (
            <>
              {/* The top row: the views, or the search while searching; Sort at its end. One height either way. */}
              <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2 max-sm:h-14">
                {searching ? (
                  <>
                    <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] max-sm:h-10">
                      <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
                      <input
                        autoFocus={!query.q && advancedCount(query.adv) === 0}
                        type="search"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={phone ? tt("Search") : tt("Search by name or email")}
                        aria-label={tt("Search by name or email")}
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] max-sm:text-[16px] [&::-webkit-search-cancel-button]:hidden"
                        data-contacts-search=""
                      />
                      {text ? (
                        <button type="button" aria-label={tt("Clear search")} className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => setText("")}>
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </label>
                    <button type="button" className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4] max-sm:h-10 max-sm:text-[15px]" onClick={clearAll}>
                      {tt("Cancel")}
                    </button>
                  </>
                ) : (
                  <>
                    {/* On a phone the views scroll on their own and fade at the edge; the icons keep a fixed place beside them and never sit over a word. */}
                    <div role="tablist" aria-label={tt("Views")} className="orders-strip -my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2 max-sm:pr-10 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-44px),transparent)]" data-contacts-views="">
                      {CONTACT_FILTERS.map((f) => {
                        const active = f === query.filter
                        return (
                          <button
                            key={f}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => go({ filter: f })}
                            className={cn(
                              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100 max-sm:h-9 max-sm:text-[15px]",
                              active ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
                            )}
                          >
                            {viewLabel(f)}
                            {/* Round 52: how many are in each view, quiet beside its name, on a computer (a phone's strip stays short). */}
                            {page ? <span className="ml-1.5 tabular-nums text-[#9ca3af] max-sm:hidden">{counts[f].toLocaleString(appLocale())}</span> : null}
                          </button>
                        )
                      })}
                    </div>
                    <span aria-hidden className="h-5 w-px shrink-0 bg-[#e5e7eb] sm:hidden" />
                    <button
                      type="button"
                      className={cn(iconButton, "w-auto shrink-0 gap-1 px-2 max-sm:h-10")}
                      aria-label={tt("Search and filter")}
                      title={tt("Search and filter")}
                      onClick={() => setSearching(true)}
                      data-contacts-filters=""
                    >
                      <Search className="h-4 w-4" />
                      <ListFilter className="h-4 w-4 max-sm:hidden" />
                    </button>
                  </>
                )}
                <SortMenu value={query.sort} onChange={(sort) => go({ sort })} />
              </div>
              {searching ? <FilterRow adv={query.adv} communities={communities} onChange={(adv) => go({ adv })} /> : null}
            </>
          )}

          {!page ? (
            <Empty title={tt("Your contacts could not be loaded.")} body={tt("Nothing was changed. Try again in a moment.")} action={<button type="button" className={buttonSecondary} onClick={refresh}>{tt("Try again")}</button>} />
          ) : nothingAtAll ? (
            <Empty
              title={tt("No people yet")}
              body={tt("People show up here when they buy from you, join your email list, answer one of your forms or join your community.")}
              action={
                <>
                  <button type="button" className={buttonAccent} onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4 shrink-0" />
                    {tt("Add contact")}
                  </button>
                  <button type="button" className={buttonSecondary} onClick={() => setImporting(true)}>
                    {tt("Import from a CSV file")}
                  </button>
                </>
              }
            />
          ) : rows.length === 0 ? (
            <Empty
              title={tt("No one matches")}
              body={filtered ? tt("Try other words, or clear the filters.") : tt("Nobody is in this group yet.")}
              action={filtered ? <button type="button" className={buttonSecondary} onClick={clearAll}>{tt("Clear search and filters")}</button> : null}
            />
          ) : (
            <table className="w-full border-separate border-spacing-0 text-[13px] sm:table-fixed">
              {/* Fixed on a computer, so picking people (the head turns into the actions) moves no column. */}
              <colgroup>
                <col className="sm:w-10" />
                <col />
                <col className="sm:w-[18%]" />
                <col className="sm:w-[26%]" />
                <col className="sm:w-[132px]" />
                <col className="sm:w-0" />
              </colgroup>
              <thead className="max-sm:hidden">
                <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
                  <th scope="col" className="w-10 bg-[#f7f7f8] p-0">
                    <label className="flex h-9 w-10 cursor-pointer items-center pl-3">
                      <Checkbox
                        label={allOnPage ? tt("Deselect all on this page") : tt("Select all on this page")}
                        checked={allOnPage}
                        indeterminate={pickedOnPage > 0 && !allOnPage}
                        onChange={(on) => pick(pageIds, on)}
                      />
                    </label>
                  </th>
                  {selected.size > 0 ? (
                    <th scope="col" colSpan={4} className="bg-[#f7f7f8] px-2 font-normal">
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
                    </th>
                  ) : (
                    <>
                      <th scope="col" className="bg-[#f7f7f8] pl-2 pr-3">
                        {tt("Name")}
                      </th>
                      <th scope="col" className="bg-[#f7f7f8] px-3">
                        {tt("Came from")}
                      </th>
                      <th scope="col" className="bg-[#f7f7f8] px-3">
                        {tt("Tags")}
                      </th>
                      <th scope="col" className="bg-[#f7f7f8] px-3 pr-4">
                        {tt("Last activity")}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <PersonLine key={p.id} p={p} picked={selected.has(p.id)} onPick={(on) => pick([p.id], on)} />
                ))}
              </tbody>
            </table>
          )}

          {page && total > 0 && rows.length > 0 ? <Footer page={query.page} total={total} onPage={(p) => go({ page: p })} /> : null}
        </section>
      </div>

      <AddContact open={adding} phone={phone} marketing={marketing} onClose={() => setAdding(false)} onAdded={(t) => { setAdding(false); setMessage({ text: t }); refresh() }} />
      <ImportPeople open={importing} phone={phone} marketing={marketing} onClose={() => setImporting(false)} onDone={(t) => { setMessage({ text: t }); refresh() }} />
    </>
  )
}

function clearedAdv(): AdvancedFilters {
  return { origin: undefined, tag: undefined, subscription: undefined, community: undefined, tier: undefined, access: undefined, bought: undefined, forms: undefined, course: undefined, from: undefined, to: undefined, leadStatus: undefined }
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" data-contacts-empty="">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[380px] text-[13px] text-[#6b7280] max-sm:text-[14px]">{body}</p>
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}

/* ─── Sort ─────────────────────────────────────────────────────────────── */

function SortMenu({ value, onChange }: { value: ContactSort; onChange: (s: ContactSort) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(iconButton, "shrink-0 max-sm:h-10 max-sm:w-10", value !== "recent" && "bg-[#eceef1] text-[#1a1a2e]")} aria-label={tt("Sort")} title={tt("Sort")} data-contacts-sort="">
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <MenuSurface align="end" className="w-[200px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]">{tt("Sort by")}</p>
        <div role="menu" aria-label={tt("Sort")}>
          {(["recent", "newest", "oldest", "name"] as const).map((s) => (
            <MenuOption
              key={s}
              selected={s === value}
              onSelect={() => {
                onChange(s)
                setOpen(false)
              }}
            >
              {sortLabel(s)}
            </MenuOption>
          ))}
        </div>
      </MenuSurface>
    </Popover>
  )
}

/* ─── The filters, as chips under the search ──────────────────────────── */

function FilterRow({ adv, communities, onChange }: { adv: AdvancedFilters; communities: CommunityOption[]; onChange: (a: AdvancedFilters) => void }) {
  const set = (k: keyof AdvancedFilters, v: string) => onChange({ ...adv, [k]: v || undefined })
  const clear = (...ks: (keyof AdvancedFilters)[]) => onChange({ ...adv, ...Object.fromEntries(ks.map((k) => [k, undefined])) })
  const community = communities.find((c) => c.id === adv.community)
  const tier = community?.tiers.find((t) => t.id === adv.tier)
  const yesNo = (k: "bought" | "forms" | "course", label: string, yes: string, no: string) => (
    <FilterChip
      id={k}
      label={label}
      value={adv[k] === "yes" ? yes : adv[k] === "no" ? no : null}
      onClear={() => clear(k)}
      options={[
        { value: "", label: tt("Anyone") },
        { value: "yes", label: yes },
        { value: "no", label: no },
      ]}
      selected={adv[k] ?? ""}
      onSelect={(v) => set(k, v)}
    />
  )
  const dates = adv.from || adv.to ? [adv.from ? dayOf(adv.from) : "…", adv.to ? dayOf(adv.to) : "…"].join(" – ") : null
  return (
    <div className="orders-strip flex items-center gap-2 overflow-x-auto border-b border-[#eef0f2] px-3 py-2 max-sm:pr-10 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-44px),transparent)]" data-contacts-advanced="">
      <FilterChip
        id="origin"
        label={tt("Came from")}
        value={adv.origin ? originLabel(adv.origin) : null}
        onClear={() => clear("origin")}
        options={[{ value: "", label: tt("Anywhere") }, ...ORIGINS.map((o) => ({ value: o, label: originLabel(o) }))]}
        selected={adv.origin ?? ""}
        onSelect={(v) => set("origin", v)}
      />
      <FilterChip id="tag" label={tt("Tag")} value={adv.tag ?? null} onClear={() => clear("tag")}>
        {(close) => <TagField initial={adv.tag ?? ""} onApply={(t) => { set("tag", t); close() }} />}
      </FilterChip>
      <FilterChip
        id="subscription"
        label={tt("Marketing emails")}
        value={adv.subscription ? subscriptionLabel(adv.subscription) : null}
        onClear={() => clear("subscription")}
        options={[{ value: "", label: tt("Anyone") }, ...(["subscribed", "none", "unsubscribed", "blocked"] as const).map((s) => ({ value: s, label: subscriptionLabel(s) }))]}
        selected={adv.subscription ?? ""}
        onSelect={(v) => set("subscription", v)}
      />
      {yesNo("bought", tt("Purchases"), tt("Bought something"), tt("Never bought"))}
      {communities.length ? (
        <FilterChip
          id="community"
          label={tt("Community")}
          value={community ? community.name || tt("Untitled community") : null}
          onClear={() => clear("community", "tier")}
          options={[{ value: "", label: tt("Any community") }, ...communities.map((c) => ({ value: c.id, label: c.name || tt("Untitled community") }))]}
          selected={adv.community ?? ""}
          onSelect={(v) => onChange({ ...adv, community: v || undefined, tier: undefined })}
        />
      ) : null}
      {community && community.tiers.length ? (
        <FilterChip
          id="tier"
          label={tt("Tier")}
          value={tier ? tier.name : null}
          onClear={() => clear("tier")}
          options={[{ value: "", label: tt("Any tier") }, ...community.tiers.map((t) => ({ value: t.id, label: t.name }))]}
          selected={adv.tier ?? ""}
          onSelect={(v) => set("tier", v)}
        />
      ) : null}
      {communities.length ? (
        <FilterChip
          id="access"
          label={tt("Community access")}
          value={adv.access ? memberStatusLabel(adv.access) : null}
          onClear={() => clear("access")}
          options={[{ value: "", label: tt("Any status") }, ...MEMBER_STATUSES.map((s) => ({ value: s, label: memberStatusLabel(s) }))]}
          selected={adv.access ?? ""}
          onSelect={(v) => set("access", v)}
        />
      ) : null}
      {yesNo("forms", tt("Form answers"), tt("Answered a form"), tt("No form answers"))}
      {yesNo("course", tt("Courses"), tt("Enrolled in a course"), tt("No course"))}
      <FilterChip
        id="leadStatus"
        label={tt("Lead status")}
        value={adv.leadStatus ? leadStatusLabel(adv.leadStatus) : null}
        onClear={() => clear("leadStatus")}
        options={[{ value: "", label: tt("Any status") }, ...LEAD_STATUSES.map((s) => ({ value: s, label: leadStatusLabel(s) }))]}
        selected={adv.leadStatus ?? ""}
        onSelect={(v) => set("leadStatus", v)}
      />
      <FilterChip id="dates" label={tt("First seen")} value={dates} onClear={() => clear("from", "to")}>
        {(close) => <DatesField from={adv.from ?? ""} to={adv.to ?? ""} onApply={(from, to) => { onChange({ ...adv, from: from || undefined, to: to || undefined }); close() }} />}
      </FilterChip>
      {advancedCount(adv) > 1 ? (
        <button type="button" className="h-7 shrink-0 rounded-lg px-2 text-[12px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]" onClick={() => onChange(clearedAdv())}>
          {tt("Clear filters")}
        </button>
      ) : null}
    </div>
  )
}

function TagField({ initial, onApply }: { initial: string; onApply: (tag: string) => void }) {
  const [tag, setTag] = React.useState(initial)
  return (
    <form
      className="space-y-2 p-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(tag.trim())
      }}
    >
      <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tt("Any tag")} maxLength={40} aria-label={tt("Tag")} className={field} />
      <button type="submit" className={cn(buttonAccent, "w-full")}>
        {tt("Apply")}
      </button>
    </form>
  )
}

function DatesField({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [a, setA] = React.useState(from)
  const [b, setB] = React.useState(to)
  return (
    <form
      className="space-y-2 p-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(a, b)
      }}
    >
      <label className="block">
        <span className={fieldLabel}>{tt("First seen from")}</span>
        <input type="date" value={a} onChange={(e) => setA(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className={fieldLabel}>{tt("First seen until")}</span>
        <input type="date" value={b} onChange={(e) => setB(e.target.value)} className={field} />
      </label>
      <button type="submit" className={cn(buttonAccent, "w-full")}>
        {tt("Apply")}
      </button>
    </form>
  )
}

/* ─── A person's row ───────────────────────────────────────────────────── */

function Tags({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null
  return (
    /* One line, always (round 52): a long tag shortens, the rest are counted, and a row never grows to two. */
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {tags.slice(0, max).map((t) => (
        <span key={t} className="min-w-0 max-w-[140px] truncate rounded-md bg-[#f1f2f4] px-1.5 py-0.5 text-[12px] font-medium leading-4 text-[#1a1a2e]">
          {t}
        </span>
      ))}
      {tags.length > max ? <span className="shrink-0 px-0.5 py-0.5 text-[12px] leading-4 text-[#6b7280]">+{tags.length - max}</span> : null}
    </span>
  )
}

function PersonLine({ p, picked, onPick }: { p: PersonRow; picked: boolean; onPick: (on: boolean) => void }) {
  const router = useRouter()
  const href = `/app/contacts/${p.id}`
  const rowBg = picked ? "bg-[#f4f4f6]" : "bg-white group-hover:bg-[#fafafb]"
  const cell = cn("border-t border-[#f0f1f3] max-sm:hidden", rowBg)
  return (
    <tr
      className="orders-row group cursor-pointer"
      data-contact-row={p.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,label")) return
        router.push(href)
      }}
    >
      <td className={cn(cell, "w-10 p-0")}>
        <label className="flex h-[52px] w-10 cursor-pointer items-center pl-3">
          <Checkbox label={tt("Pick {name}", { name: whoOf(p) })} checked={picked} onChange={onPick} />
        </label>
      </td>
      <td className={cn(cell, "max-w-[360px] py-2 pl-2 pr-3")}>
        <Link href={href} className="block truncate font-semibold text-[#1a1a2e] hover:underline">
          {whoOf(p)}
        </Link>
        {p.name && p.email ? <span className="block truncate text-[12px] text-[#6b7280]">{p.email}</span> : null}
      </td>
      <td className={cn(cell, "whitespace-nowrap px-3 text-[#4b5563]")}>{originLabel(p.origin)}</td>
      <td className={cn(cell, "px-3")}>
        <Tags tags={p.tags} max={2} />
      </td>
      <td className={cn(cell, "whitespace-nowrap px-3 pr-4 text-[#4b5563]")}>{dayOf(p.lastSeen)}</td>
      {/* A phone: one stacked cell, as Orders' PhoneRow. */}
      <td data-phone-row="" className="relative w-full max-w-0 border-t border-[#f0f1f3] bg-white px-4 py-3 sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={href} className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e] outline-none after:absolute after:inset-0">
            {whoOf(p)}
          </Link>
          <span className="shrink-0 text-[14px] text-[#6b7280]">{dayOf(p.lastSeen)}</span>
        </div>
        {p.name && p.email ? <p className="mt-0.5 truncate text-[15px] text-[#303036]">{p.email}</p> : null}
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[14px] text-[#6b7280]">{originLabel(p.origin)}</span>
          <Tags tags={p.tags} max={2} />
        </div>
      </td>
    </tr>
  )
}

function Footer({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  return (
    <nav className="flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] px-3" aria-label={tt("Pages")} data-contacts-pages="">
      <span className="text-[12px] tabular-nums text-[#6b7280] max-sm:text-[14px]">{tt("{from}–{to} of {value}", { from, to, value: total.toLocaleString(appLocale()) })}</span>
      {last > 1 ? (
        <span className="flex items-center gap-1">
          <button type="button" className={cn(buttonSecondary, "h-7 w-8 px-0 max-sm:h-9 max-sm:w-10")} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={tt("Previous page")}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={cn(buttonSecondary, "h-7 w-8 px-0 max-sm:h-9 max-sm:w-10")} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label={tt("Next page")}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </span>
      ) : null}
    </nav>
  )
}

/* ─── What can be done to the people picked (in the table's head) ────── */

function SelectionBar({ ids, people, exportHref, onClear, onDone }: { ids: string[]; people: PersonRow[]; exportHref: string; onClear: () => void; onDone: (text: string, failed?: boolean) => void }) {
  const [tagging, setTagging] = React.useState(false)
  const [tag, setTag] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const reachable = people.filter((p) => p.subscriber)
  const emailHref = `/app/emails/new?contacts=${encodeURIComponent(reachable.slice(0, EMAIL_MAX).map((p) => p.id).join(","))}`
  const small = cn(buttonSecondary, "h-7 px-2.5 text-[12px]")
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
    <div className="flex items-center gap-2" data-contacts-selection="">
      <span className="mr-1 whitespace-nowrap font-medium text-[#1a1a2e]">{tt("{size} selected", { size: ids.length })}</span>
      {tagging ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (tag.trim()) void send("tag")
          }}
        >
          <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tt("Tag")} aria-label={tt("Tag")} maxLength={40} className={cn(field, "h-7 w-[140px] text-[12px]")} />
          <button type="submit" className={small} disabled={busy || !tag.trim()}>
            {tt("Add")}
          </button>
          <button type="button" className={small} disabled={busy || !tag.trim()} onClick={() => void send("untag")}>
            {tt("Remove")}
          </button>
        </form>
      ) : (
        <button type="button" className={small} onClick={() => setTagging(true)}>
          {tt("Tag")}
        </button>
      )}
      {reachable.length ? (
        <Link href={emailHref} className={small} title={tt("Only people subscribed to your emails get it.")}>
          {tt("Email {count}", { count: Math.min(reachable.length, EMAIL_MAX) })}
        </Link>
      ) : (
        <button type="button" className={small} disabled title={tt("None of them are subscribed to your emails.")}>
          {tt("Email")}
        </button>
      )}
      <a href={exportHref} className={small}>
        {tt("Export")}
      </a>
      <button
        type="button"
        className={cn(small, "text-[#b42318]")}
        disabled={busy}
        onClick={() => {
          if (window.confirm(tt("Delete what you added for these people (notes, tags, people you added or imported)? Their orders, memberships, community access, form answers and list sign ups are not deleted.")))
            void send("delete")
        }}
      >
        {tt("Delete")}
      </button>
      <button type="button" className="h-7 rounded-lg px-2 text-[12px] font-medium text-[#4b5563] hover:bg-[#ececef]" onClick={onClear}>
        {tt("Clear")}
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
