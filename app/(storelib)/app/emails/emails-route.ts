/**
 * ===========================================================================
 *  WHERE AN ADDRESS ON /app/emails LANDS (round 51)
 * ===========================================================================
 * Pure: read by the page on the server (./page.tsx), by the list in the
 * browser (./emails-client.tsx), by the composer's way back
 * (./list-return.ts) and by tests/emails-r51.test.ts.
 *
 * Three tabs now, Campaigns | Automations | Settings. Every address the
 * older nine tabs had still opens something true (the shared round 51
 * contract):
 *
 *   ?tab=subscribers               Contacts, Subscribers
 *   ?tab=leads                     Contacts, Leads
 *   ?tab=leads&form=<id>           Contacts › Forms, that form
 *   ?tab=leads&lead=<id>, ?lead=   that person's profile, through
 *                                  /app/contacts/open?from=lead
 *   ?tab=messages, ?message=<id>   Contacts › Forms, the message kept
 *   ?contact=<subscriberId>        that person's profile (from=subscriber)
 *   ?tab=flows                     Automations
 *   ?tab=published|scheduled|drafts  Campaigns, shown as Sent, Scheduled, Drafts
 *   ?tab=customer                  Settings › Customer emails (kind and
 *                                  community kept, the editor reads them)
 *   ?tab=platforms                 Settings › Sending
 */

export type EmailsPageTab = "campaigns" | "automations" | "settings"
export type CampaignShow = "all" | "sent" | "scheduled" | "drafts"
export type SettingsSection = "sending" | "customer"

export const PAGE_TABS: EmailsPageTab[] = ["campaigns", "automations", "settings"]
export const CAMPAIGN_SHOWS: CampaignShow[] = ["all", "sent", "scheduled", "drafts"]
export const SETTINGS_SECTIONS: SettingsSection[] = ["sending", "customer"]

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function get(sp: Params, key: string): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key)
  const v = sp[key]
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null
}

export function isPageTab(v: unknown): v is EmailsPageTab {
  return typeof v === "string" && (PAGE_TABS as string[]).includes(v)
}
export function isShow(v: unknown): v is CampaignShow {
  return typeof v === "string" && (CAMPAIGN_SHOWS as string[]).includes(v)
}
export function isSection(v: unknown): v is SettingsSection {
  return typeof v === "string" && (SETTINGS_SECTIONS as string[]).includes(v)
}

/** The tab, filter and section an address opens. Anything unknown is the default: Campaigns, All. */
export function emailsAddress(sp: Params): { tab: EmailsPageTab; show: CampaignShow; section: SettingsSection } {
  const tab = get(sp, "tab")
  const show = get(sp, "show")
  const section = get(sp, "section")
  return {
    tab: isPageTab(tab) ? tab : "campaigns",
    show: isShow(show) ? show : "all",
    section: isSection(section) ? section : "sending",
  }
}

const enc = encodeURIComponent

/** Keep these params of the old address on the new one (an open email, the customer editor's family). */
function carry(sp: Params, keys: string[]): string {
  const out = new URLSearchParams()
  for (const k of keys) {
    const v = get(sp, k)
    if (v) out.set(k, v)
  }
  const s = out.toString()
  return s ? `&${s}` : ""
}

/**
 * Where an older address goes now, or null when it is already one of the
 * three tabs. A redirect, so a bookmark, a notification's link or an email
 * sent months ago all open the right place.
 */
export function legacyEmailsRedirect(sp: Params): string | null {
  const tab = get(sp, "tab")
  const lead = get(sp, "lead")
  const message = get(sp, "message")
  const contact = get(sp, "contact")

  /* The people moved to Contacts. */
  if (tab === "subscribers") return "/app/contacts?filter=subscribers"
  if (tab === "leads" || (!tab && lead)) {
    if (lead) return `/app/contacts/open?from=lead&id=${enc(lead)}`
    /* One form's answers (Forms › a form's Leads link) are that form's, in Contacts › Forms. */
    const form = get(sp, "form")
    if (form) return `/app/contacts/forms?form=${enc(form)}`
    return "/app/contacts?filter=leads"
  }
  /* The website's contact form messages moved to Contacts › Forms, the opened one kept. */
  if (tab === "messages" || (!tab && message)) return message ? `/app/contacts/forms?message=${enc(message)}` : "/app/contacts/forms"
  /* A subscriber's page opened over the old Subscribers tab (the creator's email about a new message links to it). */
  if (contact && !get(sp, "email")) return `/app/contacts/open?from=subscriber&id=${enc(contact)}`

  /* The emails themselves: the same list, filtered. */
  const show: Record<string, CampaignShow> = { published: "sent", scheduled: "scheduled", drafts: "drafts" }
  if (tab && show[tab]) return `/app/emails?tab=campaigns&show=${show[tab]}${carry(sp, ["email"])}`
  if (tab === "flows") return "/app/emails?tab=automations"
  if (tab === "customer") return `/app/emails?tab=settings&section=customer${carry(sp, ["kind", "community"])}`
  if (tab === "platforms") return "/app/emails?tab=settings&section=sending"
  return null
}

/** The address of the list showing an email in this state, for the composer's way back. */
export function campaignsHref(show: CampaignShow): string {
  return show === "all" ? "/app/emails?tab=campaigns" : `/app/emails?tab=campaigns&show=${show}`
}

/** The composer's older names for where an email now belongs ("published" is sent). */
export function showOfStatus(status: string | null | undefined): CampaignShow {
  if (status === "drafts" || status === "draft") return "drafts"
  if (status === "scheduled") return "scheduled"
  if (status === "published" || status === "sent") return "sent"
  return "all"
}

/**
 * The view the page draws for a tab, its Campaigns filter and its Settings
 * section (./emails-home.tsx EmailsTab): "published" is Sent, "flows" is
 * Automations, "platforms" is Settings › Sending.
 */
export function viewOf(tab: EmailsPageTab, show: CampaignShow, section: SettingsSection): "all" | "published" | "scheduled" | "drafts" | "flows" | "customer" | "platforms" {
  if (tab === "automations") return "flows"
  if (tab === "settings") return section === "customer" ? "customer" : "platforms"
  return show === "sent" ? "published" : show
}

interface ListedEmail {
  kind?: "sent" | "scheduled" | "draft"
  created_at: string
  updated_at?: string
  sent_at?: string
  scheduled_at?: string
}

/**
 * Campaigns › All, one list: what is scheduled first, soonest first, because
 * it is what happens next; then drafts and sent emails together, the most
 * recently touched first.
 */
export function mergeCampaigns<T extends ListedEmail>(all: { sent: { campaigns: T[] }; scheduled: T[]; drafts: T[] } | undefined): T[] {
  if (!all) return []
  const when = (c: T) => Date.parse(c.kind === "sent" ? c.sent_at ?? c.created_at : c.updated_at ?? c.created_at) || 0
  const scheduled = [...all.scheduled].sort((a, b) => (Date.parse(a.scheduled_at ?? "") || 0) - (Date.parse(b.scheduled_at ?? "") || 0))
  const rest = [...all.drafts, ...all.sent.campaigns].sort((a, b) => when(b) - when(a))
  return [...scheduled, ...rest]
}
