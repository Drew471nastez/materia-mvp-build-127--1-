"use client"

/**
 * ===========================================================================
 *  EMAILS › CUSTOMER EMAILS, AND SETTINGS › CUSTOMER EMAILS
 * ===========================================================================
 * Every email a buyer or a member gets (lib/emails/customer-catalog.ts), in
 * three families that never mix, switched by one segmented control (All,
 * Digital products, Physical products, Communities): what each email is
 * for and when it goes, how many went out in the last 30 days and when the
 * last one did, which automations go with it and whether they are on, and a
 * preview of each drawn by the template that sends it. The same list, the
 * same editor and the same saved words in both places: Settings draws it in
 * a card, the Emails page inside its own table card (`bare`). The family is
 * in the address (?kind=digital|physical|communities), so a link opens it.
 *
 * OPENS AT ONCE. A store's email is drawn here, in the browser, by its
 * sending template, from what /api/store/emails already read (prefetched
 * with Settings' other tabs); a community's is drawn by the server with the
 * community's own name (./community-emails.tsx). What each has sent comes a
 * moment later (/api/store/emails/activity) and never holds the list up.
 *
 * AS IT IS SENT, WHERE IT WAS BOUGHT (lib/emails/buyer-channel.ts). A digital
 * email can be previewed as bought on the website (the shop's name and logo,
 * any published language) or on Storelib (the creator's name and photo, in
 * English); an order that ships in any of the website's languages.
 *
 * EDITABLE, LIKE SHOPIFY'S NOTIFICATION EDITOR WITHOUT THE CODE: the
 * subject, the heading, the opening text and the button's label, with
 * placeholders for the buyer's name, the order number, the store and the
 * items, put in where the cursor is. Saved per store
 * (store_settings.customer_emails) and used by the senders; Reset puts the
 * default words back. What is typed is plain text, escaped when drawn
 * (lib/emails/customer-custom.ts), so nothing here can put HTML in an email.
 *
 * THE PREVIEW FOLLOWS THE TYPING WITHOUT RELOADING. The email is written
 * into its frame's document in place (PreviewFrame), so a key never blanks
 * the frame or throws the preview back to its top, as a new srcDoc did.
 *
 * A dialog on a computer; on a phone the shared bottom sheet
 * (components/ui/sheet-dialog.tsx) at a fixed height, with Preview and Edit
 * as two panes side by side that slide, both kept, so switching moves
 * nothing else and each keeps its own scroll. The sheet sits on the
 * keyboard (aboveKeyboard), so the field being typed in and the Save bar
 * stay above it, and fields are 16px there so iOS does not zoom the page.
 */
import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_GHOST, Card, SaveButton, FIELD, Field, Notice, TextInput, api, peekGet } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { Switch } from "@/components/ui/switch"
import { SegmentedTabs } from "@/components/app/segmented-tabs"
import { SegmentedPills, type PillOption } from "@/components/app/segmented-pills"
import { CommunityEmails, type CommunityRef } from "@/components/app/emails/community-emails"
import { EmailRow, PHONE_SHEET_HEIGHT, PaneSwitch, PreviewFrame, languageName, sentLine } from "@/components/app/emails/email-parts"
import { FAMILY_NAMES, GROUP_NAMES, GROUP_ORDER, emailsOf, type CustomerEmail, type EmailFamily } from "@/lib/emails/customer-list"
import type { PreviewShop } from "@/lib/emails/customer-catalog"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { COPY_FIELDS, COPY_LIMITS, DEFAULT_COPY, pickCopy, placeholdersFor, readCopy, type CopyField, type CustomerEmailsCopy, type EmailCopy, type EmailWords } from "@/lib/emails/customer-custom"
import { ownWordsApply, type BuyerChannel } from "@/lib/emails/buyer-channel"
import { TRIGGERS, isTriggerType } from "@/lib/automations/flow-model"
import type { EmailActivity, FlowActivity } from "@/lib/emails/activity-server"
import { tt } from "@/lib/i18n/text"

export const CUSTOMER_EMAILS_PATH = "/api/store/emails"
const ACTIVITY_PATH = "/api/store/emails/activity"

export interface CustomerEmailsShop extends PreviewShop {
  name: string
  supportEmail: string | null
  storeUrl: string | null
  logoUrl: string | null
  phone: string | null
  currency: string
  /** The store's accent, for the button in each preview (lib/emails/layout.ts uses it when it reads on white). */
  accent?: string | null
}

/** The words of a buyer's email in one language (lib/emails/words-server.ts). */
export interface EmailWordsIn {
  lang: string
  words: Record<string, string>
  own: boolean
}

export interface CustomerEmailsData {
  shop: CustomerEmailsShop
  copy: CustomerEmailsCopy
  ready: boolean
  /** The creator, who signs a download bought on Storelib. */
  creator?: { name: string; photoUrl: string | null; logoUrl: string | null }
  /** The website's own language and its other published ones. */
  languages?: { defaultLanguage: string; others: string[] }
  /** The email words in the website's own language. */
  language?: EmailWordsIn
  /** Settings › Checkout › Send a checkout reminder; null when it could not be read. */
  reminder?: boolean | null
  communities?: CommunityRef[]
}

const FALLBACK_SHOP: CustomerEmailsShop = { name: "Your store", supportEmail: null, storeUrl: null, logoUrl: null, phone: null, currency: "USD" }


type View = EmailFamily | "all"

/** The family asked for in the address, so a link (and a community's old Member emails link) opens it. */
function viewFromAddress(): View {
  if (typeof window === "undefined") return "all"
  const k = new URLSearchParams(window.location.search).get("kind")
  return k === "digital" || k === "physical" || k === "communities" ? k : "all"
}

function writeView(v: View) {
  try {
    const url = new URL(window.location.href)
    if (v === "all") url.searchParams.delete("kind")
    else url.searchParams.set("kind", v)
    if (v !== "communities") url.searchParams.delete("community")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  } catch {
    /* The address is a convenience; the view still changes. */
  }
}

/*
  WHAT EACH EMAIL HAS SENT, KEPT FOR THE PAGE'S LIFE. The Emails page
  unmounts this list when another tab is opened; read again from nothing on
  every return, its "12 sent in 30 days" lines arrived a beat after the rows
  and the list moved under the eye. The last answer is drawn at once, and a
  fresh one replaces it when it comes.
*/
const activityKept = new Map<string, EmailActivity>()
/** This list has been drawn in this browser before: the address can be read on a first draw (below). */
let panelMounted = false
const activityPath = (communityKey: string) => `${ACTIVITY_PATH}${communityKey ? `?communities=${communityKey}` : ""}`

/** Read the activity for this list ahead (Emails reads it with the list, so the tab opens with it). */
export function prefetchCustomerActivity(data: CustomerEmailsData | null | undefined): void {
  if (!data) return
  const key = (data.communities ?? []).map((c) => c.id).join(",")
  if (activityKept.has(key)) return
  void api<EmailActivity>(activityPath(key)).then((r) => {
    if (r.ok) activityKept.set(key, r.data)
  })
}

export function CustomerEmailsPanel({
  bare = false,
  source,
}: {
  bare?: boolean
  /**
   * The Emails page's own read of this list (its tab cache), and where a
   * change goes so the next look has it. Without it, Settings: the panel
   * reads for itself.
   */
  source?: { data: CustomerEmailsData | null; onChange?: (data: CustomerEmailsData) => void }
}) {
  const physical = usePhysicalCommerceEnabled()
  /* Drawn at once from what Settings (or Emails) fetched while the person was elsewhere (prefetchGet). */
  const [ownData, setOwnData] = React.useState<CustomerEmailsData | null>(() => (source ? source.data : peekGet<CustomerEmailsData>(CUSTOMER_EMAILS_PATH)))
  const data = source?.data ?? ownData
  const sourceRef = React.useRef(source)
  sourceRef.current = source
  const setData = React.useCallback((update: (d: CustomerEmailsData | null) => CustomerEmailsData | null) => {
    setOwnData((d) => {
      const next = update(sourceRef.current?.data ?? d)
      if (next && sourceRef.current?.onChange) queueMicrotask(() => sourceRef.current?.onChange?.(next))
      return next
    })
  }, [])
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<CustomerEmail | null>(null)
  /*
    The family from the address. On the page's first draw it is All, as the
    server drew it, and the address is read just after (a hydration that
    disagreed with the server would throw the page's markup away); every
    later mount (Emails' tab opened again) reads it on its first draw, so
    the list does not draw All and then jump to the family.
  */
  const [view, setViewState] = React.useState<View>(() => (panelMounted ? viewFromAddress() : "all"))
  const communities = data?.communities ?? []
  const communityKey = communities.map((c) => c.id).join(",")
  const [activity, setActivity] = React.useState<EmailActivity | null>(() => (data ? activityKept.get(communityKey) ?? null : null))
  const [communityId, setCommunityId] = React.useState<string | null>(() => (panelMounted ? new URLSearchParams(window.location.search).get("community") : null))

  React.useEffect(() => {
    if (!panelMounted) {
      panelMounted = true
      setViewState(viewFromAddress())
      setCommunityId(new URLSearchParams(window.location.search).get("community"))
    }
    /* Emails reads the list itself (its tab cache); Settings asks here. */
    if (sourceRef.current) return
    void api<CustomerEmailsData>(CUSTOMER_EMAILS_PATH).then((r) => (r.ok ? setOwnData(r.data) : setError(r.error)))
  }, [])

  /* What each has sent, once the list knows the communities it covers. */
  const hasData = !!data
  React.useEffect(() => {
    if (!hasData) return
    let live = true
    const kept = activityKept.get(communityKey)
    if (kept) setActivity(kept)
    void api<EmailActivity>(activityPath(communityKey)).then((r) => {
      if (!r.ok) return
      activityKept.set(communityKey, r.data)
      if (live) setActivity(r.data)
    })
    return () => {
      live = false
    }
  }, [hasData, communityKey])

  const setView = (v: View) => {
    setViewState(v)
    writeView(v)
  }
  const tabs: PillOption<View>[] = [
    { value: "all", label: tt("All") },
    { value: "digital", label: FAMILY_NAMES.digital },
    ...(physical ? [{ value: "physical" as const, label: FAMILY_NAMES.physical }] : []),
    ...(communities.length ? [{ value: "communities" as const, label: FAMILY_NAMES.communities }] : []),
  ]
  /* A family that is not offered here (physical off, no community): All. */
  const shown: View = tabs.some((t) => t.value === view) ? view : "all"
  const families = (shown === "all" ? (["digital", "physical", "communities"] as EmailFamily[]) : [shown]).filter((f) => (f !== "physical" || physical) && (f !== "communities" || communities.length > 0))
  const community = communities.find((c) => c.id === communityId || c.slug === communityId) ?? communities[0] ?? null

  const toggleReminder = async (on: boolean) => {
    setData((d) => (d ? { ...d, reminder: on } : d))
    const r = await api("/api/store/settings", { method: "PUT", body: { checkout: { abandonedRecovery: on } } })
    if (!r.ok) {
      setData((d) => (d ? { ...d, reminder: !on } : d))
      setError(r.error)
    }
  }
  const toggleFlow = async (f: FlowActivity, on: boolean) => {
    if (!on && !window.confirm(tt("Turn off {value}?", { value: f.name }) + "\n" + tt("Everyone partway through it gets nothing more."))) return
    setActivity((a) => (a ? { ...a, flows: a.flows.map((x) => (x.id === f.id ? { ...x, status: on ? "active" : "paused" } : x)) } : a))
    const r = await api<{ error?: string }>(`/api/automations/flows/${f.id}/status`, { method: "POST", body: { on } })
    if (!r.ok) {
      setActivity((a) => (a ? { ...a, flows: a.flows.map((x) => (x.id === f.id ? { ...x, status: f.status } : x)) } : a))
      setError(r.error)
    }
  }

  const list = (
    <div className={cn(bare ? "pb-1" : "")} data-customer-email-list="">
      <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", bare ? "border-b border-[#f1f2f4] px-4 py-3 sm:px-5" : "mb-4")}>
        {/* Analytics' own family chips (SegmentedPills chips): quiet words, the chosen one a dark pill. It does not slide (the owner): the choice changes at once, nothing moves. No grey track. */}
        <SegmentedPills variant="chips" value={shown} slide={false} onChange={setView} options={tabs} label={tt("Email families")} className="-ml-1 max-w-full self-start sm:self-auto" />
        {shown === "communities" && communities.length > 1 && community ? (
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[13px] text-[#6b7280]">{tt("Community")}</span>
            <select
              value={community.id}
              onChange={(e) => {
                setCommunityId(e.target.value)
                const url = new URL(window.location.href)
                url.searchParams.set("community", e.target.value)
                window.history.replaceState(window.history.state, "", url.pathname + url.search)
              }}
              className="h-9 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[16px] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-8 sm:flex-none sm:text-[13px]"
              data-community-picker=""
            >
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || tt("Community")}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {/*
        NOT KEYED BY THE VIEW (round 28, the owner: "switching must not
        flash"). It was, so every switch threw the whole list away and drew
        it again from opacity 0: a white flash, the community's emails read
        again from the server. Now the list is filtered where it stands: each
        family's section is kept by its own key, so All to Digital keeps
        Digital's rows as they are and only takes the others away.
      */}
      <div id="customer-emails-view" role="tabpanel" aria-label={tabs.find((t) => t.value === shown)?.label as string} data-email-view={shown}>
        {shown === "digital" || shown === "physical" ? (
          <p className={cn("max-w-[70ch] text-[12.5px] leading-[18px] text-[#6b7280]", bare ? "px-4 pt-3 sm:px-5" : "mb-3")} data-language-rule="">
            {tt("Orders on your website get their emails in the language the buyer used there. Purchases on your creator page, Explore and in communities get them in English.")}
          </p>
        ) : null}
        {families.map((family) =>
          family === "communities" ? (
            community ? (
              <FamilySection key={family} title={shown === "all" ? FAMILY_NAMES.communities : null} bare={bare}>
                <CommunityEmails community={community} sent={activity?.communities[community.id] ?? null} days={activity?.days ?? 30} bare={bare} />
              </FamilySection>
            ) : null
          ) : (
            <FamilySection key={family} title={shown === "all" ? FAMILY_NAMES[family] : null} bare={bare}>
              {GROUP_ORDER.map((g) => {
                const rows = emailsOf(family, physical).filter((e) => e.group === g)
                if (rows.length === 0) return null
                return (
                  <section key={g} aria-labelledby={`emails-${family}-${g}`} data-email-group={g}>
                    <h4 id={`emails-${family}-${g}`} className={cn("text-[12.5px] font-medium text-[#6b7280]", bare ? "px-4 pb-1.5 pt-3 sm:px-5" : "mb-1.5 mt-3")}>
                      {GROUP_NAMES[g]}
                    </h4>
                    <ul className={cn("divide-y divide-[#f1f2f4]", bare ? "border-y border-[#f1f2f4]" : "overflow-hidden rounded-xl border border-[#eceef1]")}>
                      {rows.map((e) => (
                        <EmailRow
                          key={e.id}
                          email={e}
                          bare={bare}
                          edited={!!data?.copy[e.id]}
                          sent={e.id === "checkout_reminder" ? null : sentLine(activity?.emails[e.id] ?? (activity ? { sent: 0, lastAt: null } : null), activity?.days ?? 30)}
                          note={e.id === "checkout_reminder" && activity?.reminderReplacedBy && data?.reminder !== false ? tt("Your automation {name} sends instead while it is on.", { name: `“${activity.reminderReplacedBy.name}”` }) : null}
                          control={
                            e.id === "checkout_reminder" && typeof data?.reminder === "boolean" ? (
                              <Switch checked={data.reminder} onCheckedChange={(v) => void toggleReminder(v)} aria-label={tt("Send a checkout reminder")} data-reminder-switch="" />
                            ) : null
                          }
                          onOpen={() => setOpen(e)}
                          onIntent={() => void warmPreviews()}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
              <FlowRows flows={(activity?.flows ?? []).filter((f) => f.families.includes(family) && (shown !== "all" || f.families[0] === family))} days={activity?.days ?? 30} bare={bare} onToggle={toggleFlow} />
            </FamilySection>
          ),
        )}
      </div>
      {error ? <Notice className={cn("mt-3", bare && "mx-4 mb-3")}>{error}</Notice> : null}
    </div>
  )

  return (
    <div className={cn(!bare && "space-y-4 sm:space-y-6")} data-customer-emails="">
      {bare ? (
        list
      ) : (
        <Card title={tt("Customer emails")} description={tt("What your buyers and members get from you, and when: digital products, physical products and communities, each apart. Open one to see it as it is sent and change its words. A reply comes to your contact email.")}>
          {list}
        </Card>
      )}
      <EmailSheet
        email={open}
        shop={data?.shop ?? FALLBACK_SHOP}
        data={data}
        saved={open ? data?.copy[open.id] : undefined}
        ready={data?.ready !== false}
        onSaved={(copy) => setData((d) => (d ? { ...d, copy } : d))}
        onClose={() => setOpen(null)}
      />
    </div>
  )
}

/** One family's part of the list: under its own name in All, alone otherwise. */
function FamilySection({ title, bare, children }: { title: string | null; bare: boolean; children: React.ReactNode }) {
  return (
    <section className={cn(title && (bare ? "pt-2" : "mt-5 first:mt-0"))} data-email-family={title ?? undefined}>
      {title ? <h3 className={cn("text-[14px] font-semibold text-[#1a1a2e]", bare ? "px-4 pt-3 sm:px-5" : "")}>{title}</h3> : null}
      {children}
    </section>
  )
}

/** The automations that go out with this family's emails, each with its switch; the name opens it. */
function FlowRows({ flows, days, bare, onToggle }: { flows: FlowActivity[]; days: number; bare: boolean; onToggle: (f: FlowActivity, on: boolean) => void }) {
  if (flows.length === 0) return null
  return (
    <section aria-label={tt("Automations")} data-email-group="automations">
      <h4 className={cn("text-[12.5px] font-medium text-[#6b7280]", bare ? "px-4 pb-1.5 pt-3 sm:px-5" : "mb-1.5 mt-3")}>{tt("Automations")}</h4>
      <ul className={cn("divide-y divide-[#f1f2f4]", bare ? "border-y border-[#f1f2f4]" : "overflow-hidden rounded-xl border border-[#eceef1]")}>
        {flows.map((f) => {
          const on = f.status === "active"
          const starts = isTriggerType(f.trigger_type) ? TRIGGERS[f.trigger_type].sentence : tt("Not set")
          const scope = f.products ? tt("{count, plural, one {# product} other {# products}}", { count: f.products }) : f.trigger_type === "purchase" || f.trigger_type === "first_purchase" ? tt("Any product") : null
          const sent = sentLine({ sent: f.sent, lastAt: f.lastAt }, days)
          return (
            <li key={f.id} className={cn("flex min-h-[60px] items-center gap-3 py-3", bare ? "px-4 sm:px-5" : "px-3.5")} data-email-flow={f.id}>
              <span className="min-w-0 flex-1">
                <Link href={`/app/emails/flow/${f.id}`} className="block truncate text-[14px] font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline">
                  {f.name}
                </Link>
                <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{scope ? `${starts} · ${scope}` : starts}</span>
                {sent ? <span className="mt-0.5 block text-[12px] tabular-nums leading-4 text-[#9ca3af] md:hidden">{sent}</span> : null}
              </span>
              {sent ? <span className="hidden shrink-0 text-[12.5px] tabular-nums text-[#6b7280] md:block">{sent}</span> : null}
              <span className="flex h-11 shrink-0 items-center">
                <Switch checked={on} onCheckedChange={(v) => onToggle(f, v)} aria-label={tt("Send {name} automatically", { name: f.name })} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/*
  THE TEMPLATES LOAD WITH THE EDITOR (round 28, the owner: "opening the
  editor must be fast"). A preview is drawn by the very templates that send
  the email: the receipt, every order and shipping email, the notices. They
  are most of this panel's weight and the list needs none of them, so they
  are read the first time a row is pressed, hovered or focused (warmPreviews,
  from EmailRow's own intent) and kept; the editor opens at once with its
  fields, and a frame in the preview's own shape until they are in, which on
  a press is under one frame most of the time.
*/
type PreviewModule = typeof import("@/lib/emails/customer-catalog")
let previewModule: PreviewModule | null = null
let previewLoading: Promise<PreviewModule> | null = null
export function warmPreviews(): Promise<PreviewModule> {
  if (previewModule) return Promise.resolve(previewModule)
  previewLoading ??= import("@/lib/emails/customer-catalog").then((m) => (previewModule = m))
  return previewLoading
}
function usePreviewModule(want: boolean): PreviewModule | null {
  const [mod, setMod] = React.useState<PreviewModule | null>(previewModule)
  React.useEffect(() => {
    if (!want || mod) return
    let live = true
    void warmPreviews().then((m) => live && setMod(m))
    return () => {
      live = false
    }
  }, [want, mod])
  return mod
}

/** The preview's room while its templates load: the subject line and the email's page, in light gray, the height the frame opens at. */
function PreviewSkeleton() {
  return (
    <div aria-hidden className="space-y-2.5" data-preview-skeleton="">
      <ShimmerBlock className="h-4 w-2/3 rounded-full" />
      <div className="rounded-xl border border-[#eceef1] bg-white p-6" style={{ height: 640 }}>
        <ShimmerBlock className="h-9 w-9 rounded-lg" />
        <ShimmerBlock className="mt-8 h-6 w-3/5 rounded-full" />
        <ShimmerBlock className="mt-4 h-3 w-full rounded-full" />
        <ShimmerBlock className="mt-2 h-3 w-5/6 rounded-full" />
        <ShimmerBlock className="mt-6 h-11 w-44 rounded-lg" />
      </div>
    </div>
  )
}

type Draft = Required<EmailWords>
const LABELS: Record<CopyField, string> = {
  get subject() { return tt("Subject") },
  get preheader() { return tt("Preview text") },
  get heading() { return tt("Heading") },
  get body() { return tt("Text") },
  get button() { return tt("Button") },
  get footer() { return tt("Footer note") },
}
/** What a field says about itself, under it, where its job is not plain from its name. */
const HINTS: Partial<Record<CopyField, string>> = {
  get preheader() { return tt("Shown after the subject in most inboxes. Empty, the email's first line is shown.") },
  get footer() { return tt("A line of your own above the footer, such as a returns note. The address and links stay.") },
}

/**
 * The fields as they open. The main words start from the saved ones, or
 * the defaults. Another language's start empty where nothing was written
 * for it: an empty part goes out in the standard words of that language.
 */
function draftOf(id: string | undefined, saved: EmailWords | undefined, other = false): Draft {
  if (other) return { subject: saved?.subject ?? "", preheader: saved?.preheader ?? "", heading: saved?.heading ?? "", body: saved?.body ?? "", button: saved?.button ?? "", footer: saved?.footer ?? "" }
  const def = id ? DEFAULT_COPY[id] : undefined
  return { subject: saved?.subject || def?.subject || "", preheader: saved?.preheader || "", heading: saved?.heading || def?.heading || "", body: saved?.body ?? def?.body ?? "", button: saved?.button || def?.button || "", footer: saved?.footer || "" }
}
/** What is sent for a draft: another language sends only the parts written for it, so an empty text is the standard one there, never no text. */
function payloadOf(draft: Draft, other: boolean): Partial<Draft> {
  if (!other) return draft
  return Object.fromEntries(COPY_FIELDS.filter((f) => draft[f].trim() !== "").map((f) => [f, draft[f]])) as Partial<Draft>
}
const sameDraft = (a: Draft, b: Draft) => COPY_FIELDS.every((f) => a[f] === b[f])

/* A phone field is 16px, so iOS does not zoom the page into it; 14px from 640px, as every field in Settings. */
const PHONE_SAFE = "text-[16px] sm:text-[14px]"

/** Words already read for a language or for Storelib, kept for the page's life: a preview in one opens at once the second time. */
const wordsKept = new Map<string, EmailWordsIn>()

/**
 * WHERE THE SAMPLE WAS BOUGHT AND IN WHAT LANGUAGE, for one email's preview:
 * the place (a digital email only: the website, or Storelib) and the
 * language (the website's published ones; Storelib's is English). The words
 * for a language are read once (GET /api/store/emails?lang=, ?channel=storelib).
 */
function usePreviewPlace(email: CustomerEmail | null, data: CustomerEmailsData | null | undefined) {
  /* A membership is only ever bought on Storelib (the creator page, a product page): signed by the creator, in English. */
  const storelibOnly = !!email?.id.startsWith("membership_")
  const digital = email?.family === "digital" && email.id !== "checkout_reminder" && !storelibOnly
  const def = data?.languages?.defaultLanguage ?? data?.language?.lang ?? "en"
  const langs = [def, ...(data?.languages?.others ?? [])]
  const [channel, setChannel] = React.useState<BuyerChannel>("website")
  const [lang, setLang] = React.useState(def)
  const [, redraw] = React.useState(0)
  React.useEffect(() => {
    setChannel("website")
    setLang(def)
  }, [email?.id, def])
  const place: BuyerChannel = storelibOnly ? "storelib" : digital ? channel : "website"
  const key = place === "storelib" ? "storelib" : lang
  if (data?.language && !wordsKept.has(data.language.lang)) wordsKept.set(data.language.lang, data.language)
  React.useEffect(() => {
    if (wordsKept.has(key) || (place === "website" && lang === "en" && def === "en")) return
    let live = true
    void api<{ language: EmailWordsIn }>(place === "storelib" ? `${CUSTOMER_EMAILS_PATH}?channel=storelib` : `${CUSTOMER_EMAILS_PATH}?lang=${encodeURIComponent(lang)}`).then((r) => {
      if (!live || !r.ok) return
      wordsKept.set(key, r.data.language)
      redraw((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [key, place, lang, def])
  const kept = wordsKept.get(key)
  const shownLang = place === "storelib" ? "en" : lang
  /* Until a language's words arrive, its sentences read in English; the store's own words follow the rule either way. */
  const language: EmailWordsIn = React.useMemo(() => kept ?? { lang: shownLang, words: {}, own: ownWordsApply(shownLang, def) }, [kept, shownLang, def])
  return { digital, channel: place, setChannel, lang: place === "storelib" ? "en" : lang, setLang, langs, def, language }
}

export function EmailSheet({ email: asked, shop, data, saved: savedAsked, ready, onSaved, onClose }: { email: CustomerEmail | null; shop: CustomerEmailsShop; data?: CustomerEmailsData | null; saved: EmailCopy | undefined; ready: boolean; onSaved: (copy: CustomerEmailsCopy) => void; onClose: () => void }) {
  const phone = usePhoneWidth()
  /*
    CLOSES THE WAY IT OPENED. The sheet slides away for a moment after it is
    closed; drawn with no email in that moment, it shrank to an empty
    "Email" box on its way out. The last email stays in it until it is gone.
  */
  const kept = React.useRef<CustomerEmail | null>(asked)
  if (asked) kept.current = asked
  const email = asked ?? kept.current
  const keptSaved = React.useRef<EmailCopy | undefined>(savedAsked)
  if (asked) keptSaved.current = savedAsked
  const saved = asked ? savedAsked : keptSaved.current
  const id = email?.id
  const editable = !!id && !!DEFAULT_COPY[id]
  const membership = !!id?.startsWith("membership_")
  const where = usePreviewPlace(email, data)
  /*
    WHICH WORDS ARE BEING WRITTEN (round 28, the owner: "per language where
    the product supports it"). The main words go to buyers in the website's
    own language; the preview's language picker, set to another of the
    website's languages, writes that language's words (saved under `langs`,
    lib/emails/customer-custom.ts pickCopy), the main ones left as they are.
  */
  const otherLang = where.language.own === false ? where.language.lang : null
  const savedWords = React.useMemo(() => (otherLang ? saved?.langs?.[otherLang.toLowerCase().split("-")[0]] : pickCopy(saved, null)), [saved, otherLang])
  const start = React.useMemo(() => draftOf(id, savedWords, !!otherLang), [id, savedWords, otherLang])
  const [draft, setDraft] = React.useState<Draft>(start)
  const [tab, setTab] = React.useState<"preview" | "edit">("preview")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedNote, setSavedNote] = React.useState(false)
  const [test, setTest] = React.useState<{ state: "sending" } | { state: "sent"; to: string } | { state: "failed"; error: string } | null>(null)
  const last = React.useRef<{ field: CopyField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const caret = React.useRef<{ el: HTMLInputElement | HTMLTextAreaElement; at: number } | null>(null)

  /* A new email, or its saved words changed: start again from them. */
  React.useEffect(() => {
    setDraft(start)
    setError(null)
    setSavedNote(false)
  }, [start])
  React.useEffect(() => {
    if (id) {
      setTab("preview")
      last.current = null
      setTest(null)
    }
  }, [id])

  /* After a placeholder goes in, the cursor stands right after it, in the field it went into. */
  React.useLayoutEffect(() => {
    const c = caret.current
    if (!c) return
    caret.current = null
    try {
      c.el.focus({ preventScroll: true })
      c.el.setSelectionRange(c.at, c.at)
    } catch {
      /* A field that went away keeps nothing. */
    }
  }, [draft])

  /* The preview follows the typing a beat behind, so a long email never holds a key up. */
  const shown = React.useDeferredValue(draft)
  const checked = React.useMemo(() => (id && editable ? readCopy(id, payloadOf(shown, !!otherLang)) : null), [id, editable, shown, otherLang])
  /* The words the preview draws: the ones being typed in the part being written, the saved ones in every other. */
  const previewWords = React.useMemo<EmailCopy | null | undefined>(() => {
    if (!checked?.ok) return saved
    if (!otherLang) return { ...(checked.copy ?? {}), ...(saved?.langs ? { langs: saved.langs } : {}) }
    const langs = { ...(saved?.langs ?? {}) }
    const key = otherLang.toLowerCase().split("-")[0]
    if (checked.copy) langs[key] = checked.copy
    else delete langs[key]
    return { ...(pickCopy(saved, null) ?? {}), langs }
  }, [checked, saved, otherLang])
  const creator = data?.creator ?? null
  const templates = usePreviewModule(!!asked)
  const mail = React.useMemo(
    () => (id && templates ? templates.previewCustomerEmail(id, shop, previewWords, { channel: where.channel, language: where.language, creator }) : null),
    [id, templates, shop, previewWords, where.channel, where.language, creator],
  )
  const dirty = !sameDraft(draft, start)
  const isDefault = !savedWords

  /* A switch of language changes which words are being written: unsaved ones are asked about first. */
  const keepTyping = () => !dirty || window.confirm(tt("Leave without saving your changes to this email?"))
  const close = () => {
    if (dirty && !window.confirm(tt("Leave without saving your changes to this email?"))) return
    onClose()
  }

  const save = async (copy: Draft | null) => {
    if (!id) return
    setBusy(true)
    const r = await api<{ copy: CustomerEmailsCopy }>(CUSTOMER_EMAILS_PATH, { method: "PUT", body: { id, copy: copy ? payloadOf(copy, !!otherLang) : null, ...(otherLang ? { lang: otherLang } : {}) } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSavedNote(true)
    onSaved(r.data.copy)
  }

  /* The email as it is on screen, words being typed included, to the person's own inbox (app/api/store/emails/test). */
  const sendTest = async () => {
    if (!id || test?.state === "sending") return
    setTest({ state: "sending" })
    const r = await api<{ sentTo: string }>("/api/store/emails/test", { method: "POST", body: { id, channel: where.channel, lang: where.lang, ...(editable && checked?.ok ? { copy: payloadOf(draft, !!otherLang), ...(otherLang ? { copyLang: otherLang } : {}) } : {}) } })
    setTest(r.ok ? { state: "sent", to: r.data.sentTo } : { state: "failed", error: r.error })
  }

  const reset = () => {
    if (isDefault) {
      setDraft(draftOf(id, undefined, !!otherLang))
      return
    }
    void save(null)
  }

  /* Where the cursor is in the field typed in last (the text when none was), replacing a selection. */
  const insert = (key: string) => {
    const token = `{{${key}}}`
    const at = last.current
    const field: CopyField = at?.field ?? "body"
    const value = draft[field]
    const el = at?.el
    const from = el && typeof el.selectionStart === "number" ? el.selectionStart : value.length
    const to = el && typeof el.selectionEnd === "number" ? el.selectionEnd : value.length
    const next = `${value.slice(0, from)}${token}${value.slice(to)}`.slice(0, COPY_LIMITS[field])
    if (el) caret.current = { el, at: Math.min(next.length, from + token.length) }
    setDraft((d) => ({ ...d, [field]: next }))
  }

  const remember = (field: CopyField) => (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    last.current = { field, el: e.currentTarget }
  }

  const fields = editable ? (
    <div className="space-y-3.5" data-email-editor={id}>
      {!ready ? <Notice tone="amber">{tt("Saving changes needs the database update (SQL part 129). You can try words out here meanwhile.")}</Notice> : null}
      {otherLang ? (
        <p className="rounded-lg bg-[#f4f5f7] px-3 py-2 text-[12.5px] leading-[18px] text-[#374151]" data-email-editing-lang={otherLang}>
          {tt("Words for buyers who read this email in {language}. A part left empty goes out in the standard {language} words.", { language: languageName(otherLang) })}
        </p>
      ) : null}
      {COPY_FIELDS.map((f) => (
        <Field key={f} label={LABELS[f]} htmlFor={`email-${f}`} hint={HINTS[f]}>
          {f === "body" || f === "footer" ? (
            <textarea
              id={`email-${f}`}
              value={draft[f]}
              maxLength={COPY_LIMITS[f]}
              rows={f === "body" ? 6 : 2}
              onFocus={remember(f)}
              onSelect={remember(f)}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
              className={cn(FIELD, PHONE_SAFE, "h-auto resize-y py-2.5 leading-[21px] sm:h-auto", f === "body" ? "min-h-[132px]" : "min-h-[64px]")}
              placeholder={otherLang ? tt("Standard {language} words", { language: languageName(otherLang) }) : f === "body" ? tt("No opening text") : tt("No footer note")}
              data-email-field={f}
            />
          ) : (
            <TextInput
              id={`email-${f}`}
              value={draft[f]}
              maxLength={COPY_LIMITS[f]}
              autoComplete="off"
              onFocus={remember(f)}
              onSelect={remember(f)}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
              /* Emptied, the default goes out: it shows here as the hint (in another language, the standard words of that one). */
              placeholder={otherLang ? tt("Standard {language} words", { language: languageName(otherLang) }) : f === "preheader" ? tt("The email's first line") : id ? DEFAULT_COPY[id][f] : undefined}
              className={PHONE_SAFE}
              data-email-field={f}
            />
          )}
        </Field>
      ))}
      <div>
        <p className="text-[12.5px] text-[#6b7280]">{tt("Placeholders fill in for each order. Tap one to add it where you're typing.")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {placeholdersFor(id).map((p) => (
            <button
              key={p.key}
              type="button"
              /* The field keeps the focus and the cursor, so the placeholder goes where the person was typing. */
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.key)}
              className="h-8 rounded-full bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec] active:bg-[#e2e4e8] [-webkit-tap-highlight-color:transparent]"
              data-placeholder={p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {checked && checked.ok === false ? <Notice>{checked.error}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{membership ? tt("The price, the dates, the card and the link stay as they are, filled in from each membership.") : tt("The items, totals, tracking and links stay as they are, filled in from each order.")}</p>
      <button type="button" className={cn(BTN_GHOST, "-ml-3 sm:hidden")} disabled={busy || (isDefault && sameDraft(draft, draftOf(id, undefined, !!otherLang)))} onClick={reset}>
        {tt("Reset to default")}
      </button>
    </div>
  ) : null

  /* Where the sample was bought, and in what language: the email that place sends (lib/emails/buyer-channel.ts). */
  const placeControls =
    where.digital || where.langs.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2" data-preview-place="">
        {where.digital ? (
          <SegmentedTabs
            value={where.channel}
            onChange={(v) => keepTyping() && where.setChannel(v)}
            label={tt("Bought on")}
            idPrefix="preview-place"
            className="sm:w-auto"
            tabs={[
              { id: "website", label: tt("Your website") },
              { id: "storelib", label: tt("Creator page") },
            ]}
          />
        ) : null}
        {where.channel === "website" && where.langs.length > 1 ? (
          <select
            value={where.lang}
            onChange={(e) => keepTyping() && where.setLang(e.target.value)}
            aria-label={tt("Language")}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[16px] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-8 sm:text-[13px]"
            data-preview-language=""
          >
            {where.langs.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    ) : null
  const placeNote =
    where.channel === "storelib"
      ? tt("Bought on your creator page, Explore or in a community: in English, from {name}.", { name: creator?.name || shop.name })
      : where.digital
        ? tt("Bought on your website: in the language the buyer used there, from {name}.", { name: shop.name })
        : null
  /* A membership is bought on Storelib: from the creator, in English (lib/memberships/sync.ts membershipVoice). */
  const membershipNote = membership ? tt("Bought on your creator page: in English, from {name}.", { name: creator?.name || shop.name }) : null
  /* Which buyers the words on the left reach, when the website has more than one language. */
  const ownNote = editable && where.langs.length > 1 && !otherLang && where.channel === "website" ? tt("These words go to buyers in {language}, your website's language. Pick another language above to write its own.", { language: languageName(where.def) }) : null

  const preview = (active: boolean) => (
    <div className="space-y-2.5" data-email-preview={id}>
      {placeControls}
      {placeNote || membershipNote ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-preview-place-note="">{placeNote || membershipNote}</p> : null}
      {ownNote ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-preview-own-note="">{ownNote}</p> : null}
      {mail ? (
        <p className="text-[13px] text-[#6b7280]" data-email-subject="">
          <span className="font-medium text-[#374151]">{tt("Subject:")}</span> {mail.subject}
        </p>
      ) : null}
      {mail ? <PreviewFrame title={tt("{value} preview", { value: email?.name ?? tt("Email") })} html={mail.html} paused={!active} /> : <PreviewSkeleton />}
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{membership ? tt("A sample membership, drawn the way the real email is sent. The real email has the member's own plan, price and dates.") : tt("A sample order, drawn the way the real email is sent. The real email has the buyer's own items, address and order.")}</p>
    </div>
  )

  const testButton = (
    <button type="button" className={BTN_GHOST} disabled={!id || test?.state === "sending"} onClick={() => void sendTest()} data-email-test="">
      {test?.state === "sending" ? tt("Sending") : tt("Send test")}
    </button>
  )
  const testNote =
    test?.state === "sent" ? (
      <span className="truncate text-[13px] text-[#6b7280]" aria-live="polite" data-email-test-note="">
        {tt("Sent to {to}", { to: test.to })}
      </span>
    ) : test?.state === "failed" ? (
      <span className="truncate text-[13px] text-[#b42318]" aria-live="polite" data-email-test-note="">
        {test.error}
      </span>
    ) : null

  const footer = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#f1f2f4] bg-white px-4 py-3 sm:px-5" data-email-footer="">
      <div className="flex min-w-0 items-center gap-1">
        {editable ? (
          <button type="button" className={cn(BTN_GHOST, "hidden sm:inline-flex")} disabled={busy || (isDefault && sameDraft(draft, draftOf(id, undefined, !!otherLang)))} onClick={reset} data-email-reset="">
            {tt("Reset to default")}
          </button>
        ) : null}
        {testButton}
        {testNote ? <span className="hidden min-w-0 sm:inline">{testNote}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {editable ? (
          <SaveButton state={busy ? "saving" : savedNote && !dirty ? "saved" : "idle"} disabled={!dirty || !ready || (checked !== null && checked.ok === false)} onClick={() => void save(draft)} data-email-save="" />
        ) : savedNote && !dirty ? (
          <span className="text-[13px] text-[#6b7280]" aria-live="polite">
            {tt("Saved")}
          </span>
        ) : null}
      </div>
    </div>
  )
  /* On a phone the note goes on its own line above the bar, and Reset with the fields, so the bar keeps one row. */
  const phoneTestNote = testNote ? <div className="flex shrink-0 bg-white px-4 pt-2 sm:hidden">{testNote}</div> : null

  const header = (
    <div className="flex shrink-0 items-center gap-3 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{email?.name ?? tt("Email")}</SheetDialogTitle>
        <p className="truncate text-[12.5px] text-[#6b7280]">{email?.sentWhen}</p>
      </div>
    </div>
  )

  return (
    <SheetDialog
      /* Open while an email is asked for. `email` keeps the last one for the way out, so it was never null again and the X could not close the sheet. */
      open={!!asked}
      onClose={close}
      phone={phone}
      label={email?.name ?? tt("Email")}
      sheet={{ height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT }}
      /* Nothing is chosen for the person on open: a subject selected as the dialog came up was one key from being typed over. */
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_56px_-12px_rgba(16,24,40,0.28)] outline-none focus:outline-none focus-visible:outline-none sm:max-w-[1040px]"
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-email-sheet={id}>
        {header}
        {phone ? (
          <>
            {editable ? <PaneSwitch tab={tab} onTab={setTab} /> : null}
            <div className="relative min-h-0 flex-1 overflow-hidden" data-email-panes={tab}>
              <div
                className="flex h-full w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
                style={{ transform: tab === "edit" && editable ? "translate3d(-50%,0,0)" : "translate3d(0,0,0)" }}
              >
                <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab === "edit" && editable ? true : undefined} data-email-pane="preview">
                  {preview(tab === "preview" || !editable)}
                </div>
                <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab !== "edit" ? true : undefined} data-email-pane="edit">
                  {fields}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", editable && "lg:grid-cols-[360px_minmax(0,1fr)]")}>
            {editable ? <div className="border-b border-[#f1f2f4] px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">{fields}</div> : null}
            <div className="bg-[#f8f9fa] px-5 py-5 lg:min-h-0 lg:overflow-y-auto">{preview(true)}</div>
          </div>
        )}
        {phoneTestNote}
        {footer}
      </div>
    </SheetDialog>
  )
}
