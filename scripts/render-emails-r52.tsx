/**
 * ROUND 52: Emails (Campaigns | Automations | Settings), Contacts › Forms
 * (the list, a form's four tabs, the website inbox and a message) and a
 * Community member's sheet, drawn by the real components against a stand-in
 * server, for scripts/check-emails-r52.mjs to look at on a phone and a
 * computer, light and dark.
 *
 * window.__probe = { mode, state }:
 *   mode    emails | composer (a new email opened from Contacts) | chooser (Create automation's templates) | forms | members | products (a neighbour, to compare)
 *   state   ok | empty | noanswers (forms, but none answered) | loading (nothing ever answers) | error (every read fails)
 * The address (?tab=, ?form=, ?view=, ...) picks what opens, as on the site.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EmailsClient } from "@/app/(storelib)/app/emails/emails-client"
import { FormsList } from "@/app/(storelib)/app/emails/forms/forms-list"
import { MembersSection } from "@/components/community/creator/members-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { FlowChooser } from "@/app/(storelib)/app/emails/flow/new/chooser"
import { EmailComposer } from "@/components/email/compose/composer"
import { LanguageProvider } from "@/lib/i18n"
import { Toaster } from "@/components/ui/toaster"
import { allowedActions } from "@/lib/communities/permissions"
import { emailsAddress } from "@/app/(storelib)/app/emails/emails-route"
import type { CommunityHead, MemberRowView } from "@/components/community/creator/view-types"

const probe = (window as unknown as { __probe: { mode: string; state: string } }).__probe
const STATE = probe.state
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const empty = STATE === "empty"

/* ── Emails ─────────────────────────────────────────────────────────── */
const sent = empty
  ? []
  : Array.from({ length: 9 }, (_, i) => ({
      id: uid(i + 1),
      subject: i === 1 ? "New presets are out, and the autumn pack is half price until Sunday only" : `Studio notes, issue ${30 - i}`,
      status: i === 2 ? "partially_failed" : "sent",
      sent_at: ago(2 + i * 4),
      created_at: ago(3 + i * 4),
      recipient_count: 1200 + i * 3,
      unique_opens: 610 - i * 7,
      unique_clicks: 140 - i,
    }))
const scheduled = empty ? [] : [{ id: uid(101), subject: "October drop", status: "scheduled", scheduled_at: new Date(NOW + 3 * 86_400_000).toISOString(), created_at: ago(2), updated_at: ago(1), audience_count: 1204 }]
const drafts = empty ? [] : [{ id: uid(201), subject: "", status: "draft", created_at: ago(4), updated_at: ago(1) }, { id: uid(202), subject: "Black Friday early access", status: "draft", created_at: ago(5), updated_at: ago(3) }]
const flows = empty
  ? []
  : [
      { id: uid(301), name: "Welcome series", trigger_type: "new_subscriber", status: "active", steps: [{ id: "a", type: "email", config: { subject: "Hi" } }, { id: "b", type: "wait", config: { days: 2 } }, { id: "c", type: "email", config: { subject: "Next" } }], totals: { sent: 4120, opened: 2210, clicked: 410, failed: 0, in_progress: 18 } },
      { id: uid(302), name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [{ id: "a", type: "email", config: { subject: "Thanks" } }], totals: { sent: 880, opened: 512, clicked: 90, failed: 2, in_progress: 0 } },
      { id: uid(303), name: "Form follow up for coaching applications that came in through the website", trigger_type: "form_submitted", status: "active", steps: [], totals: null },
    ]
const shop = { name: "Ana Pop Studio", supportEmail: "hello@anapop.studio", storeUrl: "https://anapop.storelib.com", logoUrl: null, phone: null, currency: "USD" }
const marketing = ["klaviyo", "omnisend", "brevo", "mailerlite", "kit"].map((provider, i) => ({
  provider,
  connected: !empty && i === 0,
  keyHint: i === 0 ? "pk_…a91" : null,
  account: i === 0 ? "Ana Pop Studio" : null,
  listId: i === 0 ? "L1" : null,
  listName: i === 0 ? "Newsletter" : null,
  backfill: false,
  backfillState: i === 0 ? "done" : null,
  lastSyncAt: i === 0 ? ago(0.1) : null,
  lastError: null,
  counts: { subscribed: i === 0 ? 1204 : 0, unsubscribed: 0, customers: i === 0 ? 312 : 0, events: 0, pulled: 0 },
  scopes: [],
  ready: true,
}))

/* ── Forms ──────────────────────────────────────────────────────────── */
const def = (title: string, mode: "form" | "quiz" = "form") => ({
  title,
  description: "",
  mode,
  fields: [
    { id: "f1", type: "short_text", label: "Your name", required: true },
    { id: "f2", type: "email", label: "Email", required: true },
    { id: "f3", type: "long_text", label: "What would you like help with?", required: false },
  ],
  submit_label: "Send",
  completion: { kind: "message", message: "Thanks, I will write back within two days." },
})
const form = (n: number, title: string, kind: string, status: string, responses: number, usages: unknown[], mode: "form" | "quiz" = "form") => ({
  id: uid(400 + n),
  title,
  status,
  revision: 3,
  draft: def(title, mode),
  published: status === "published" ? def(title, mode) : null,
  integration_settings: { notify_email: true, webhook: { enabled: false, url: "", secret_hint: null }, google_sheets: { prepared: false } },
  retention_days: null,
  updated_at: ago(n),
  created_at: ago(30 + n),
  kind,
  responses,
  usages,
})
const forms = empty
  ? []
  : [
      form(1, "Coaching application", "application", "published", 42, [{ kind: "onepage", label: "Ana's links", href: "/app/onepage" }, { kind: "website", label: "anapop.studio", href: "/app/websites" }]),
      form(2, "Free colour grading guide", "lead", "published", 318, [{ kind: "creator_page", label: "Creator Page", href: "/app/creator-page" }]),
      form(3, "Which preset pack fits your photos?", "quiz", "published", 1204, [], "quiz"),
      form(4, "Workshop feedback, spring session in Lisbon with the long title that has to cut", "survey", "draft", 0, []),
    ]
const siteForms = empty ? [] : [{ id: uid(501), name: "Old booking form", site_name: "anapop.studio", responses: 7, created_at: ago(200) }]
const messages = empty
  ? []
  : [
      { id: uid(601), email: "lena@example.com", name: "Lena Moritz", subject: "Wedding in June", message: "Hi Ana, are you free on the 14th of June for a small wedding in Porto?", site: "anapop.studio", page: "contact", created_at: ago(0.2), read_at: null, subscriber_id: uid(9001), replies: [] },
      { id: uid(602), email: "tom@example.com", name: null, subject: null, message: "Do the presets work in Lightroom mobile?", site: "anapop.studio", page: "home", created_at: ago(3), read_at: ago(2), replies: [{ id: "r1", message: "Yes, they do.", created_at: ago(2) }] },
    ]
const noAnswers = empty || STATE === "noanswers"
const responses = noAnswers
  ? []
  : Array.from({ length: 6 }, (_, i) => ({
      id: uid(700 + i),
      answers: [
        { id: "f1", label: "Your name", type: "short_text", value: i === 2 ? "" : ["Mara Ionescu", "Jon Pike", "", "Ruth Adeyemi", "Kai Lund", "Ines Ferreira"][i] },
        { id: "f2", label: "Email", type: "email", value: i === 2 ? "" : `person${i}@example.com` },
        { id: "f3", label: "What would you like help with?", type: "long_text", value: "I shoot weddings and my skin tones look orange under tungsten light. I would like a session on colour grading." },
      ],
      contact_name: i === 2 ? null : ["Mara Ionescu", "Jon Pike", "", "Ruth Adeyemi", "Kai Lund", "Ines Ferreira"][i],
      contact_email: i === 2 ? null : `person${i}@example.com`,
      contact_phone: null,
      submitted_at: ago(i * 2 + 0.3),
      status: i < 2 ? "new" : i === 3 ? "qualified" : "contacted",
      source_kind: ["onepage", "website", "link", "creator_page", "onepage", "website"][i],
      score: 0,
    }))
const insights = {
  total: noAnswers ? 0 : 42,
  last30: 17,
  identified: 39,
  weeks: Array.from({ length: 12 }, (_, i) => ({ start: new Date(NOW - (12 - i) * 7 * 86_400_000).toISOString().slice(0, 10), count: [1, 2, 0, 3, 5, 4, 2, 6, 3, 7, 4, 5][i] })),
  sources: { onepage: 21, website: 14, creator_page: 5, link: 2 },
  statuses: { new: 9, contacted: 20, qualified: 8, converted: 5 },
  scores: null,
  capped: false,
}

/* ── Community ──────────────────────────────────────────────────────── */
const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const head: CommunityHead = {
  id: CID,
  slug: "salajanywood",
  name: "SalajanyWood Woodworking Club",
  tagline: "Make one thing a week, together.",
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "paid",
  visibility: "public",
  memberCount: 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
} as CommunityHead
const names = ["Ana Popescu", "Marcus Lee", "Priya Raman", "Tomás Herrera", "Elena Ionescu", "Jonah Brooks", "Sofia Rossi", "Kenji Watanabe"]
const member = (i: number): MemberRowView =>
  ({
    userId: uid(800 + i),
    memberId: uid(900 + i),
    name: names[i % names.length],
    username: names[i % names.length].toLowerCase().split(" ")[0],
    avatarUrl: null,
    email: `${names[i % names.length].toLowerCase().split(" ")[0]}@example.com`,
    role: i === 0 ? "owner" : i === 1 ? "admin" : "member",
    status: "active",
    source: i % 3 === 0 ? "subscription" : i % 3 === 1 ? "free" : "manual",
    tierId: "t1",
    tierName: i % 2 ? "Members" : "Inner circle",
    level: 1 + (i % 5),
    points: 12 * i,
    joinedAt: ago(i * 3 + 1),
    requestedAt: null,
    requestNote: null,
    lastActiveAt: ago(i * 0.3),
    mutedUntil: null,
    approved: false,
  }) as MemberRowView
const members = empty ? [] : names.map((_, i) => member(i))
const memberFacts = {
  activity: { posts: 14, comments: 63, going: 2, attended: 5 },
  answers: { submittedAt: ago(40), items: [{ id: "q1", label: "What do you build?", type: "text", value: "Mostly chairs, and a workbench this winter." }, { id: "q2", label: "How did you hear about the club?", type: "text", value: "Instagram" }] },
}

/* ── The stand-in server ───────────────────────────────────────────── */
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const url = raw.replace(/^https?:\/\/[^/]+/, "")
  const method = (init?.method || "GET").toUpperCase()
  if (STATE === "loading") return new Promise<Response>(() => {})
  await new Promise((r) => setTimeout(r, 60))
  if (STATE === "error") return reply(500, { error: "Something went wrong on our side. Try again." })
  /* The composer opened from Contacts (?contacts=, ?to=): who of the picked people may get it, and why the rest were left out. */
  if (url.startsWith("/api/email/audience"))
    return reply(200, { options: [{ type: "all", label: "All subscribers", count: 1204 }, { type: "last_30days", label: "Joined in the last 30 days", count: 118 }], segments: [], plan: { limit: 2000, used: 212 }, brand: { name: "Ana Pop Studio", logoUrl: null, storeUrl: "https://storelib.com/anapop", accent: "#0f766e", address: "12 Harbour Street, Portland, ME 04101", avatarUrl: null }, upgraded: true })
  if (url.startsWith("/api/email/recipients")) {
    const ids = (JSON.parse(String(init?.body ?? "{}")).contacts ?? []) as string[]
    const blocked = ids.length === 1 && ids[0] === uid(9002)
    const leftOut = ids.length > 1 ? { unsubscribed: 2, suppressed: 1, no_consent: 3, unknown: 1 } : blocked ? { unsubscribed: 0, suppressed: 0, no_consent: 1, unknown: 0 } : { unsubscribed: 0, suppressed: 0, no_consent: 0, unknown: 0 }
    const left = leftOut.unsubscribed + leftOut.suppressed + leftOut.no_consent + leftOut.unknown
    const recipients = ids.length - left
    return reply(200, { asked: ids.length, recipients, leftOut, segment: recipients ? { id: uid(9100), count: recipients } : null })
  }
  if (url.startsWith("/api/email/stats")) return reply(200, { campaigns: sent, stats: empty ? { totalSent: 0, totalOpens: 0, totalClicks: 0, totalUnsubscribed: 0, openRate: 0, clickRate: 0 } : { totalSent: 16840, totalOpens: 8420, totalClicks: 1930, totalUnsubscribed: 31, openRate: 50, clickRate: 11.5 }, monthlyUsage: { sent: empty ? 0 : 1402, limit: 2000 } })
  if (url.startsWith("/api/email/campaigns?status=scheduled")) return reply(200, { campaigns: scheduled })
  if (url.startsWith("/api/email/campaigns?status=draft")) return reply(200, { campaigns: drafts })
  const rep = /^\/api\/email\/campaigns\/([^/]+)\/report$/.exec(url)
  if (rep) {
    const row = sent.find((c) => c.id === rep[1]) ?? sent[0]
    return reply(200, {
      campaign: { id: rep[1], subject: row?.subject ?? "Studio notes", preview_text: "Three things from the studio", status: row?.status ?? "sent", audience_type: "all", segment_id: null, audience_count: 1204, scheduled_at: null, sent_at: row?.sent_at ?? null, completed_at: row?.sent_at ?? null, created_at: ago(9), updated_at: ago(8), track_opens: true, last_error: null },
      counts: { total: 1204, pending: 0, sending: 0, sent: 402, delivered: 790, bounced: 9, failed: 2, skipped: 1, unknown: 0 },
      stats: { sent: 1201, delivered: 790, bounced: 8, complained: 1, opened: 604, clicked: 139, unsubscribed: 6, failed: 2, unknown: 0, skipped: 1, waiting: 0 },
      links: [{ url: "https://storelib.com/anapop/autumn", clicks: 120, people: 98 }, { url: "https://anapop.studio/blog/skin-tones-in-evening-light", clicks: 51, people: 44 }],
      html: "<!doctype html><html><body style='font-family:sans-serif;padding:24px'><h2>Studio notes</h2><p>Three things from the studio this week.</p></body></html>",
      sender: { name: "Ana Pop Studio", from: "Ana Pop Studio <noreply@storelib.com>", replyTo: "hello@anapop.studio", address: null },
      upgraded: true,
    })
  }
  if (url.startsWith("/api/email/area?part=flows")) return reply(200, flows)
  if (url.startsWith("/api/email/area?part=sender")) return reply(200, { name: "Ana Pop Studio", replyTo: "hello@anapop.studio" })
  if (url.startsWith("/api/email/area?part=messages")) return reply(200, { available: true, rows: messages })
  if (url.startsWith("/api/store/emails/activity")) return reply(200, { days: 30, emails: { receipt: { sent: 412, lastAt: ago(0.4) }, download: { sent: 388, lastAt: ago(0.5) } }, communities: {}, flows: [], reminderReplacedBy: null })
  if (url.startsWith("/api/store/emails")) return reply(200, { shop, copy: {}, ready: true, communities: [] })
  if (url.startsWith("/api/store/integrations/marketing")) return reply(200, { marketing })
  if (url.startsWith("/api/email/sending-domain")) return reply(200, { domain: null, ready: true, available: true })
  if (url.startsWith("/api/forms?overview=1")) return reply(200, { forms, siteForms })
  if (/^\/api\/forms\/[^/]+\/insights/.test(url)) return reply(200, { insights })
  if (url.startsWith("/api/forms/site/")) return reply(200, { form: { id: uid(501), name: "Old booking form", site_name: "anapop.studio" }, responses: [{ id: uid(511), fields: { Name: "Ola Berg", Email: "ola@example.com", Date: "May 3" }, created_at: ago(190) }] })
  if (url.startsWith("/api/leads")) return reply(200, { leads: responses, next: null })
  if (new RegExp(`/api/app/community/${CID}/members/[^/?]+$`).test(url)) return reply(200, memberFacts)
  if (url.startsWith(`/api/app/community/${CID}/members`)) return reply(200, { rows: members, next: null, capped: false, counts: { active: members.length } })
  void method
  return reply(404, { error: "Not in the probe" })
}

function Page() {
  if (probe.mode === "emails") {
    const at = emailsAddress(new URLSearchParams(location.search))
    return (
      <div id="shell" style={{ position: "fixed", inset: 0 }}>
        <EmailsClient initialTab={at.tab} initialShow={at.show} initialSection={at.section} />
      </div>
    )
  }
  if (probe.mode === "forms") {
    /* As app/(storelib)/app/contacts/forms/page.tsx draws it: the Contacts bar (stood in for), then the list in the page's width. */
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6 lg:px-8">
          <div className="flex h-12 items-center text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]" data-probe-contacts-bar="">Forms</div>
        </div>
        <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-3 sm:px-6 md:pb-8 lg:px-8" data-contacts-forms="">
          <FormsList />
        </div>
      </div>
    )
  }
  if (probe.mode === "members") {
    const focus = new URLSearchParams(location.search).get("member") ? members[3] ?? null : null
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <SectionSeed id="members" stamp="">
          <MembersSection head={head} meId={uid(800)} initial={{ rows: members, next: null, capped: false }} counts={{ active: members.length, pending: empty ? 0 : 2, muted: 0, paused: 0, banned: 0, removed: 0, expired: empty ? 0 : 5, cancelled: 0 }} status="active" tiers={[{ id: "t1", name: "Members", kind: "paid" }, { id: "t2", name: "Inner circle", kind: "paid" }]} canEmail invites={{ rows: [], next: null }} openInvite={false} badges={[]} focus={focus} />
        </SectionSeed>
      </div>
    )
  }
  if (probe.mode === "composer") {
    const sp = new URLSearchParams(location.search)
    return (
      <div className="h-screen overflow-y-auto bg-[#f8f9fa]">
        <EmailComposer campaignId={null} onExit={() => {}} preset={{ contacts: [sp.get("to"), ...(sp.get("contacts") ?? "").split(",")].filter((x): x is string => !!x), segment: null, layout: null }} />
      </div>
    )
  }
  if (probe.mode === "chooser") return <div className="min-h-screen bg-[#f8f9fa]"><FlowChooser existing={empty ? {} : { welcome: uid(301) }} /></div>
  const shelf = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, creator_id: "c1", title: `Product ${i + 1}`, type: "digital", price_cents: 1200 + i * 350, status: i % 5 === 2 ? "draft" : "published", thumbnail_url: null, slug: `product-${i}`, created_at: ago(i), archived: false, sales_count: i * 3 }))
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <main className="h-full overflow-hidden bg-[#f8f9fa]">
        <div className="app-content-scroll h-[100svh] overflow-y-auto">
          <ProductsClient products={shelf as never} creatorUsername="ana" />
        </div>
      </main>
    </div>
  )
}

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Page />
    <Toaster />
  </LanguageProvider>,
)
