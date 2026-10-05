"use client"

/**
 * ===========================================================================
 *  SETTINGS
 * ===========================================================================
 * Under one tab row (?tab=), the way /app/settings groups its panels:
 *
 *   Page           what people see before they join: name, address,
 *                  tagline, category (the Explore pill it is found under),
 *                  description, logo, cover, the gallery of pictures and
 *                  videos, what members get, questions, links.
 *   Access         who can join, approval, the tiers with their prices (a
 *                  recurring price is saved through the memberships engine:
 *                  members keep what they joined at), the other products
 *                  that let somebody in; then who can find it: Explore,
 *                  visibility, search words.
 *   Features       which sections are on, and the welcome a new member sees.
 *   Rules and      the rules (the same editor as Moderation's), and for the
 *   policies       owner the refund policy and how members reach them
 *                  (worker M's columns, run-now part 101).
 *   Roles          the owner's: what admins and moderators may do, a group
 *                  of actions at a time (run-now part 100).
 *   Gamification   points, levels, badges.
 *   Notifications  what you hear about in this community.
 *   Advanced       publish, videos, archive, delete (the name typed back).
 *
 * The rules are written here and in Moderation, beside the reports.
 * Older links (?tab=general, ?tab=discovery) land on the tab that now holds
 * what they pointed at. A switch saves when it is flipped; a form saves
 * with its Save bar.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { centsFromInput } from "@/lib/memberships/plan"
import type { CommunityFaq, CommunityLink, NotifyLevel } from "@/lib/communities/types"
import type { CommunityHead, PoliciesView, RolesView, SettingsData, TierView } from "./view-types"
import { GALLERY_MAX, coverVideo as coverOf, typeOf, type CommunityType, type GalleryItem, type PriceInterval, type SettingsTab } from "./logic"
import { COMMUNITY_CATEGORIES, communityCategoryId } from "@/lib/explore/communities-mode"

export type { SettingsTab }
import { GamificationPanel } from "./gamification-panel"
import { RulesEditor } from "./moderation-section"
import { PERMISSION_GROUPS, type PermissionKey } from "@/lib/communities/permissions"
import { REFUND_POLICY_MAX } from "@/lib/communities/membership-policy"
import { CoverField, GalleryEditor } from "./gallery-editor"
import { VideoProviders, type ProviderLine } from "@/components/video/video-providers"
import { ChoiceCards, Confirm, Dialog, EditorCard, EditorFoot, Notice, PicturePick, PriceInput, Section, Segmented, Toggle, buttonPrimary, buttonSecondary, card, errorText, field, label, selectField, send, useToast } from "./parts"

const TABS: { value: SettingsTab; label: string; needs: keyof CommunityHead["can"] }[] = [
  { value: "page", label: "Page", needs: "manage_settings" },
  { value: "access", label: "Access", needs: "manage_settings" },
  { value: "features", label: "Features", needs: "manage_settings" },
  { value: "policies", label: "Rules and policies", needs: "manage_settings" },
  /* What admins and moderators may do: the owner's alone (transfer_ownership is the action only an owner has). */
  { value: "roles", label: "Roles", needs: "transfer_ownership" },
  { value: "gamification", label: "Gamification", needs: "manage_gamification" },
  { value: "notifications", label: "Notifications", needs: "view" },
  { value: "advanced", label: "Advanced", needs: "archive" },
]

export function SettingsSection({ head, data, tab: initialTab, videoProviders = [] }: { head: CommunityHead; data: SettingsData; tab: SettingsTab; videoProviders?: ProviderLine[] }) {
  const tabs = TABS.filter((t) => head.can[t.needs])
  const [tab, setTab] = React.useState<SettingsTab>(tabs.some((t) => t.value === initialTab) ? initialTab : (tabs[0]?.value ?? "notifications"))
  const choose = (t: SettingsTab) => {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
  }
  /* The tab you are on is in view on a phone, where the row scrolls sideways (Roles sits past the edge). */
  const strip = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const s = strip.current
    const el = s?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!s || !el) return
    const left = el.offsetLeft - s.offsetLeft
    if (left < s.scrollLeft || left + el.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollTo({ left: Math.max(0, left - 24), behavior: "auto" })
  }, [tab])
  return (
    <div data-settings="" data-tab={tab}>
      <div ref={strip} role="tablist" aria-label="Settings" className="app-gutter-bleed mb-4 flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide md:mx-0 md:px-0">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            data-settings-tab={t.value}
            onClick={() => choose(t.value)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-100 sm:text-[14px] max-md:h-10",
              tab === t.value ? "border-[#d1d5db] bg-[#f3f4f6] text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "border-transparent text-[#6b7280] hover:bg-[#f3f4f6]/70",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "page" ? <PageSettings head={head} data={data} /> : null}
      {tab === "access" ? (
        <div className="space-y-4">
          <Access head={head} data={data} />
          <Discovery head={head} data={data} />
        </div>
      ) : null}
      {tab === "features" ? <Features head={head} data={data} /> : null}
      {tab === "policies" ? <Policies head={head} data={data} /> : null}
      {tab === "roles" && data.roles ? <Roles head={head} roles={data.roles} /> : null}
      {tab === "notifications" ? <Notifications head={head} data={data} /> : null}
      {tab === "gamification" ? <GamificationPanel head={head} levels={data.levels} badges={data.badges} /> : null}
      {tab === "advanced" ? <Advanced head={head} videoProviders={videoProviders} /> : null}
    </div>
  )
}

/** A switch that saves the moment it is flipped. */
function useInstant(head: CommunityHead) {
  const toast = useToast()
  const router = useRouter()
  return async (body: Record<string, unknown>, done = "Saved") => {
    const res = await send(`/api/app/community/${head.id}`, "PATCH", body)
    if (!res.ok) {
      toast(errorText(res.data.error))
      return false
    }
    toast(done)
    router.refresh()
    return true
  }
}

function SaveBar({ dirty, busy, onSave, onReset, error, busyText }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void; error: string | null; busyText?: string }) {
  /* The product editor's foot (./parts EditorFoot): always there, Cancel and Save at its right. */
  return <EditorFoot dirty={dirty} busy={busy && !busyText} busyText={busyText} error={error} onSave={onSave} onCancel={onReset} />
}

/* ── Page ───────────────────────────────────────────────────────────────── */

interface PageState {
  name: string
  slug: string
  tagline: string
  /** One of Explore's category ids, or "" for none. */
  category: string
  description: string
  logoUrl: string | null
  coverUrl: string | null
  gallery: GalleryItem[]
  benefits: string[]
  faq: CommunityFaq[]
  links: CommunityLink[]
}

function PageSettings({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const start = React.useMemo<PageState>(
    () => ({
      name: head.name,
      slug: head.slug,
      tagline: data.tagline ?? "",
      category: communityCategoryId(data.category) ?? "",
      description: data.description,
      logoUrl: head.logoUrl,
      coverUrl: head.coverUrl,
      gallery: data.gallery,
      benefits: data.benefits,
      faq: data.faq,
      links: data.links,
    }),
    [head, data],
  )
  const [s, setS] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(s) !== saved
  const set = <K extends keyof PageState>(k: K, v: PageState[K]) => {
    setS((x) => ({ ...x, [k]: v }))
    setError(null)
  }

  const save = async () => {
    const before = JSON.parse(saved) as PageState
    const body: Record<string, unknown> = {}
    for (const k of Object.keys(s) as (keyof PageState)[]) if (JSON.stringify(s[k]) !== JSON.stringify(before[k])) body[k] = s[k]
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(s))
    toast("Saved")
    router.refresh()
  }

  /*
    THE PRODUCT EDITOR'S PAGE (app/app/products/new): one column of cards
    under 1024px, in the order the page reads; from 1024px the community
    itself on the left (what it is called and says, its pictures, what
    members get, questions, links) and how it is found on the right (its
    address, logo and Explore category), with the save foot under both.
  */
  return (
    <div data-page-settings="">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-4">
          <EditorCard title="About" id="about">
            <div>
              <label htmlFor="g-name" className={label}>
                Name
              </label>
              <input id="g-name" value={s.name} onChange={(e) => set("name", e.target.value.slice(0, 80))} className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div>
              <label htmlFor="g-tagline" className={label}>
                Tagline
              </label>
              <input id="g-tagline" value={s.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 160))} placeholder="One line on cards and in Explore" className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div>
              <label htmlFor="g-desc" className={label}>
                Description
              </label>
              <textarea id="g-desc" value={s.description} onChange={(e) => set("description", e.target.value.slice(0, 10_000))} rows={6} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
            </div>
          </EditorCard>

          <EditorCard title="Photos and video" hint="The cover, then pictures and videos at the top of your page, the first one shown first." id="gallery">
            <div className="min-w-0">
              <p className={label}>Cover</p>
              {/* A picture, or a YouTube or Vimeo video (round 11): then the gallery's first item, and its still the cover picture on Save. */}
              <CoverField
                coverUrl={s.coverUrl}
                gallery={s.gallery}
                onChange={(next) => {
                  setS((x) => ({ ...x, coverUrl: next.coverUrl, gallery: next.gallery }))
                  setError(null)
                }}
                onError={setError}
              />
            </div>
            {/* The cover video, when there is one, is the cover's to change; the gallery edits what follows it. */}
            <GalleryEditor
              communityId={head.id}
              value={coverOf(s.gallery) ? s.gallery.slice(1) : s.gallery}
              onChange={(v) => {
                const cover = coverOf(s.gallery)
                set("gallery", cover ? [cover, ...v] : v)
              }}
              max={coverOf(s.gallery) ? GALLERY_MAX - 1 : GALLERY_MAX}
              videos={data.galleryVideos}
              ready={data.galleryReady}
              onError={setError}
              onBusy={setUploading}
            />
          </EditorCard>

          <EditorCard title="What members get" hint="A line each, on the community's page.">
            <ListEditor items={s.benefits} onChange={(v) => set("benefits", v)} max={12} placeholder="A live call every week" addLabel="Add a line" />
          </EditorCard>

          <EditorCard title="Questions" hint="Answers to what people ask before joining.">
            <PairEditor items={s.faq.map((r) => ({ a: r.q, b: r.a }))} onChange={(v) => set("faq", v.map((x) => ({ q: x.a, a: x.b })))} max={20} aPlaceholder="Who is it for?" bPlaceholder="The answer" addLabel="Add a question" />
          </EditorCard>

          <EditorCard title="Links">
            <PairEditor items={s.links.map((r) => ({ a: r.label, b: r.url }))} onChange={(v) => set("links", v.map((x) => ({ label: x.a, url: x.b })))} max={6} aPlaceholder="Website" bPlaceholder="https://" addLabel="Add a link" singleLine />
          </EditorCard>
        </div>

        <div className="min-w-0 space-y-4">
          <EditorCard title="Address" id="address">
            <div>
              <label htmlFor="g-slug" className="sr-only">
                Address
              </label>
              <div className="flex h-11 items-center overflow-hidden rounded-lg border border-[#e1e3e7] bg-white focus-within:border-[#1a1a2e]/50 sm:h-10">
                <span className="shrink-0 pl-3 text-[13px] text-[#9ca3af]">/community/</span>
                <input id="g-slug" value={s.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48))} className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[16px] text-[#1a1a2e] outline-none sm:text-[14px]" />
              </div>
              {/* The old address is kept (run-now part 94): a shared link opens the community at its new address. */}
              {s.slug !== start.slug && head.status === "published" ? <p className="mt-1 text-[12px] text-[#6b7280]" data-slug-note="">Links to /community/{start.slug} will open the new address.</p> : <p className="mt-1 truncate text-[12px] text-[#9ca3af]">storelib.com/community/{s.slug || "..."}</p>}
            </div>
          </EditorCard>

          <EditorCard title="Logo">
            <PicturePick value={s.logoUrl} onChange={(v) => set("logoUrl", v)} shape="square" name="logo" onError={setError} />
          </EditorCard>

          <EditorCard title="Category" hint="Where it shows up in Explore.">
            {/* The same list as Explore's category pills: the one picked here is the pill it is found under. */}
            <select id="g-category" aria-label="Category" value={s.category} onChange={(e) => set("category", e.target.value)} className={selectField} data-category-select="">
              <option value="">No category</option>
              {COMMUNITY_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </EditorCard>

          {head.can.manage_settings ? (
            <p className="px-1 text-[13px] text-[#6b7280]">
              Rules and the refund policy are in{" "}
              <Link href={`/app/community/${head.id}/settings?tab=policies`} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                Rules and policies
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy || uploading} busyText={uploading ? "Uploading" : undefined} error={error} onSave={() => void save()} onReset={() => { setS(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

/* ── Features ───────────────────────────────────────────────────────────── */

function Features({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const [features, setFeatures] = React.useState({ classroomEnabled: head.classroomEnabled, eventsEnabled: head.eventsEnabled, chatEnabled: data.chatEnabled, directoryEnabled: data.directoryEnabled })
  const start = React.useMemo(() => ({ enabled: data.onboarding.enabled === true, welcome: data.onboarding.welcome ?? "", askIntro: data.onboarding.askIntro !== false, showRules: data.onboarding.showRules !== false }), [data])
  const [w, setW] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(w) !== saved

  const flip = async (key: keyof typeof features, v: boolean) => {
    setFeatures((f) => ({ ...f, [key]: v }))
    if (!(await instant({ [key]: v }, v ? "Turned on" : "Turned off"))) setFeatures((f) => ({ ...f, [key]: !v }))
  }
  const save = async () => {
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { onboarding: w })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(w))
    setError(null)
    toast("Saved")
    router.refresh()
  }

  return (
    <div className="space-y-4" data-features="">
      <Section title="Sections" hint="Turned off, a section is hidden from members. Nothing in it is deleted.">
        <div className="-my-1 divide-y divide-[#f1f2f4]">
          <Toggle checked={features.classroomEnabled} onChange={(v) => void flip("classroomEnabled", v)} title="Learn" hint="Your programs and lessons, inside the community." />
          <Toggle checked={features.eventsEnabled} onChange={(v) => void flip("eventsEnabled", v)} title="Calendar" hint="Calls, workshops and meetups with RSVPs." />
          <Toggle checked={features.chatEnabled} onChange={(v) => void flip("chatEnabled", v)} title="Chat" hint="Spaces of the chat kind, and messages between members." />
          <Toggle checked={features.directoryEnabled} onChange={(v) => void flip("directoryEnabled", v)} title="Member directory" hint="Members can see who else is here." />
        </div>
      </Section>

      <Section title="Welcome" hint="What a new member sees the first time they open it.">
        <Toggle checked={w.enabled} onChange={(v) => setW({ ...w, enabled: v })} title="Show a welcome" />
        {w.enabled ? (
          <div className="mt-2 space-y-1">
            <textarea value={w.welcome} onChange={(e) => setW({ ...w, welcome: e.target.value.slice(0, 2000) })} rows={3} placeholder="Glad you are here. Start by introducing yourself." aria-label="Welcome message" className={cn(field, "resize-y py-2.5 leading-relaxed")} />
            <Toggle checked={w.showRules} onChange={(v) => setW({ ...w, showRules: v })} title="Ask them to read the rules" hint={data.rules.length ? `${data.rules.length} ${data.rules.length === 1 ? "rule" : "rules"}, written in Moderation.` : "There are no rules yet. Write them in Moderation."} />
            <Toggle checked={w.askIntro} onChange={(v) => setW({ ...w, askIntro: v })} title="Ask them to introduce themselves" />
          </div>
        ) : null}
      </Section>

      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setW(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

function ListEditor({ items, onChange, max, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; addLabel: string }) {
  const rows = items.length ? items : [""]
  return (
    <div className="space-y-2">
      {rows.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={b} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))} placeholder={i === 0 ? placeholder : ""} aria-label={`Line ${i + 1}`} className={cn(field, "h-11 sm:h-10")} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]">
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
      {rows.length < max ? (
        <button type="button" onClick={() => onChange([...rows, ""])} className={cn(buttonSecondary, "mt-1")}>
          <Plus aria-hidden className="h-4 w-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}

function PairEditor({ items, onChange, max, aPlaceholder, bPlaceholder, addLabel, singleLine }: { items: { a: string; b: string }[]; onChange: (v: { a: string; b: string }[]) => void; max: number; aPlaceholder: string; bPlaceholder: string; addLabel: string; singleLine?: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className={cn("min-w-0 flex-1", singleLine ? "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.6fr]" : "space-y-1.5")}>
            <input value={it.a} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, a: e.target.value.slice(0, 200) } : x)))} placeholder={aPlaceholder} aria-label={`${addLabel.replace("Add a ", "")} ${i + 1}`} className={cn(field, "h-11 font-medium sm:h-10")} />
            {singleLine ? (
              <input value={it.b} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, b: e.target.value.trim().slice(0, 1000) } : x)))} placeholder={bPlaceholder} aria-label={`Address ${i + 1}`} className={cn(field, "h-11 sm:h-10")} />
            ) : (
              <textarea value={it.b} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, b: e.target.value.slice(0, 2000) } : x)))} placeholder={bPlaceholder} rows={2} aria-label={`Detail ${i + 1}`} className={cn(field, "resize-y py-2 leading-relaxed")} />
            )}
          </div>
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${i + 1}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]">
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
      {items.length < max ? (
        <button type="button" onClick={() => onChange([...items, { a: "", b: "" }])} className={buttonSecondary}>
          <Plus aria-hidden className="h-4 w-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}

/* ── Access & pricing ───────────────────────────────────────────────────── */

const TYPE_OPTIONS: { value: CommunityType; title: string; detail: string }[] = [
  { value: "free", title: "Free", detail: "Anyone can join." },
  { value: "paid", title: "Paid membership", detail: "Members pay to join." },
  { value: "private", title: "Private", detail: "Invite only. Hidden from Explore." },
]

const dollars = (cents: number | null) => (cents ? String(cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)) : "")

function Access({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const owner = head.can.manage_pricing === true
  const [type, setType] = React.useState<CommunityType>(typeOf(head))
  const [approval, setApproval] = React.useState(data.approvalRequired)
  const [adding, setAdding] = React.useState(false)
  const [typeError, setTypeError] = React.useState<string | null>(null)
  const tiers = data.tiers
  const live = tiers.filter((t) => !t.archived)
  const archived = tiers.filter((t) => t.archived)

  const changeType = async (t: CommunityType) => {
    if (t === type) return
    setTypeError(null)
    if (t === "paid" && !live.some((x) => x.kind === "paid")) {
      setTypeError("Add a paid tier with a price first, then switch to paid.")
      setAdding(true)
      return
    }
    const before = type
    setType(t)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { type: t })
    if (!res.ok) {
      setType(before)
      return setTypeError(errorText(res.data.error))
    }
    toast("Saved")
    router.refresh()
  }

  return (
    <div className="space-y-4" data-access="">
      {!data.paymentsReady && owner && (type === "paid" || live.some((t) => t.kind === "paid")) ? (
        <Notice tone="warn">
          Connect payouts before members can pay: people pay you through Stripe.{" "}
          <a href="/app/settings?tab=payments" className="font-semibold underline">
            Set up payouts
          </a>
        </Notice>
      ) : null}

      <Section title="Who can join">
        {owner ? <ChoiceCards rows value={type} onChange={(t) => void changeType(t)} options={TYPE_OPTIONS} label="Who can join" /> : <p className="text-[14px] text-[#1a1a2e]">{TYPE_OPTIONS.find((o) => o.value === type)?.title}. Only the owner changes this.</p>}
        {typeError ? (
          <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
            {typeError}
          </p>
        ) : null}
        <div className="mt-3 border-t border-[#f1f2f4] pt-1.5">
          <Toggle
            checked={approval}
            onChange={async (v) => {
              setApproval(v)
              if (!(await instant({ approvalRequired: v }, v ? "Requests need your approval" : "People join straight away"))) setApproval(!v)
            }}
            title="Approve each request"
            hint={type === "paid" ? "People ask first; once you approve, they can pay." : "People ask to join and you approve them under Members."}
          />
        </div>
      </Section>

      <Section
        title="Tiers"
        hint="What people join on. A paid tier is sold through Storelib checkout, with the price on its product."
        action={
          owner ? (
            <button type="button" onClick={() => setAdding(true)} className={buttonSecondary} data-tier-add="">
              <Plus aria-hidden className="h-4 w-4" />
              Add tier
            </button>
          ) : null
        }
      >
        {live.length === 0 ? <p className="text-[13.5px] text-[#6b7280]">No tiers yet.</p> : (
          <div className="-my-1 divide-y divide-[#f1f2f4]">
            {live.map((t) => (
              <TierCard key={t.id} head={head} tier={t} products={data.products} owner={owner} canDefault={live.length > 1} />
            ))}
          </div>
        )}
        {archived.length ? (
          <div className="mt-4 border-t border-[#f1f2f4] pt-3">
            <p className="mb-2 text-[12.5px] font-medium text-[#6b7280]">Not sold any more</p>
            <ul className="space-y-1">
              {archived.map((t) => (
                <li key={t.id} className="flex min-h-10 items-center justify-between gap-3">
                  <span className="truncate text-[13.5px] text-[#4b5563]">
                    {t.name} · {t.priceLine || "Free"} · {t.members} {t.members === 1 ? "member" : "members"}
                  </span>
                  {owner ? <TierRestore head={head} tier={t} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <NewTierDialog head={head} open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function TierRestore({ head, tier }: { head: CommunityHead; tier: TierView }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={async () => {
        const res = await send(`/api/app/community/${head.id}/tiers/${tier.id}`, "PATCH", { archived: false })
        if (!res.ok) return toast(errorText(res.data.error))
        toast("Back on sale")
        router.refresh()
      }}
      className={cn(buttonSecondary, "h-10 sm:h-8")}
    >
      Sell again
    </button>
  )
}

function TierCard({ head, tier, products, owner, canDefault }: { head: CommunityHead; tier: TierView; products: SettingsData["products"]; owner: boolean; canDefault: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/tiers/${tier.id}`
  const start = { name: tier.name, monthly: dollars(tier.monthlyCents), yearly: dollars(tier.yearlyCents), price: dollars(tier.priceCents) }
  const [s, setS] = React.useState(start)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const dirty = JSON.stringify(s) !== JSON.stringify(start)

  const save = async () => {
    const body: Record<string, unknown> = {}
    if (s.name !== start.name) body.name = s.name
    if (tier.billing === "recurring") {
      if (s.monthly !== start.monthly) body.monthlyPrice = s.monthly
      if (s.yearly !== start.yearly) body.yearlyPrice = s.yearly
    }
    if (tier.billing === "one_time" && s.price !== start.price) body.price = s.price
    setBusy(true)
    setError(null)
    const res = await send(base, "PATCH", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    toast(tier.billing === "recurring" && (body.monthlyPrice !== undefined || body.yearlyPrice !== undefined) ? "Price saved. Members keep the price they joined at." : "Saved")
    router.refresh()
  }

  const patch = async (body: Record<string, unknown>, done: string) => {
    const res = await send(base, "PATCH", body)
    if (!res.ok) return toast(errorText(res.data.error))
    toast(done)
    router.refresh()
  }

  const setProduct = async (productId: string, on: boolean) => {
    const res = await send(`${base}/products`, "POST", { productId, on })
    if (!res.ok) return toast(errorText(res.data.error))
    toast(on ? "Product added" : "Product taken off")
    setPicking(false)
    router.refresh()
  }

  const yearlyHint = (() => {
    const m = centsFromInput(s.monthly)
    const y = centsFromInput(s.yearly)
    if (!m || !y || !Number.isFinite(m) || !Number.isFinite(y)) return null
    const saving = Math.round((1 - y / (m * 12)) * 100)
    return saving > 0 ? `Saves ${saving}% against monthly` : null
  })()

  const offered = new Set([...tier.accessProducts.map((p) => p.id)])
  const pickable = products.filter((p) => !offered.has(p.id))

  return (
    <div className="py-4 first:pt-1 last:pb-1" data-tier={tier.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex min-w-0 items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{tier.name}</span>
          {tier.isDefault ? <StatusBadge tone="neutral">Default</StatusBadge> : null}
          {tier.kind === "paid" && tier.productStatus !== "published" ? <StatusBadge tone="attention">Off sale</StatusBadge> : null}
        </p>
        <span className="text-[13px] tabular-nums text-[#6b7280]">
          {tier.priceLine || "No price"} · {tier.members.toLocaleString("en-US")} {tier.members === 1 ? "member" : "members"}
        </span>
      </div>
      {owner ? (
        <>
          <div className={cn("mt-3 grid gap-3", tier.billing === "recurring" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
            <div className={tier.billing === "recurring" ? "col-span-2 sm:col-span-1" : undefined}>
              <label htmlFor={`t-name-${tier.id}`} className={label}>
                Name
              </label>
              <input id={`t-name-${tier.id}`} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value.slice(0, 60) })} className={cn(field, "h-11 sm:h-10")} />
            </div>
            {tier.billing === "recurring" ? (
              <>
                <div>
                  <label htmlFor={`t-m-${tier.id}`} className={label}>
                    Monthly
                  </label>
                  <PriceInput id={`t-m-${tier.id}`} value={s.monthly} onChange={(v) => setS({ ...s, monthly: v })} placeholder="None" />
                </div>
                <div>
                  <label htmlFor={`t-y-${tier.id}`} className={label}>
                    Yearly
                  </label>
                  <PriceInput id={`t-y-${tier.id}`} value={s.yearly} onChange={(v) => setS({ ...s, yearly: v })} placeholder="None" />
                  {yearlyHint ? <p className="mt-1 text-[12px] text-[#15803d]">{yearlyHint}</p> : null}
                </div>
              </>
            ) : tier.billing === "one_time" ? (
              <div>
                <label htmlFor={`t-p-${tier.id}`} className={label}>
                  One time price
                </label>
                <PriceInput id={`t-p-${tier.id}`} value={s.price} onChange={(v) => setS({ ...s, price: v })} />
              </div>
            ) : null}
          </div>
          {tier.kind === "paid" ? (
            <div className="mt-3">
              <p className="text-[12.5px] font-medium text-[#4b5563]">Also let in buyers of</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {tier.accessProducts.map((p) => (
                  <span key={p.id} className="inline-flex h-10 items-center gap-0.5 rounded-full border border-[#e5e7eb] bg-[#fafbfb] pl-3 text-[12.5px] text-[#1a1a2e] sm:h-8 sm:pr-1">
                    <span className="max-w-[180px] truncate">{p.title}</span>
                    <button type="button" aria-label={`Take ${p.title} off`} onClick={() => void setProduct(p.id, false)} className="grid h-10 w-10 place-items-center rounded-full text-[#6b7280] hover:bg-[#eceef1] sm:h-6 sm:w-6">
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {pickable.length ? (
                  <button type="button" onClick={() => setPicking(true)} className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-[#d1d5db] px-3 text-[12.5px] font-medium text-[#4b5563] hover:border-[#9ca3af] sm:h-8">
                    <Plus aria-hidden className="h-3.5 w-3.5" />
                    Product
                  </button>
                ) : tier.accessProducts.length === 0 ? (
                  <span className="text-[12.5px] text-[#9ca3af]">No other products yet.</span>
                ) : null}
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {!tier.isDefault && canDefault ? (
              <button type="button" onClick={() => void patch({ makeDefault: true }, `${tier.name} is the default`)} className={cn(buttonSecondary, "h-10 border-transparent shadow-none sm:h-8")}>
                Make default
              </button>
            ) : null}
            {!tier.isDefault ? (
              <button type="button" onClick={() => setArchiving(true)} className={cn(buttonSecondary, "h-10 border-transparent shadow-none sm:h-8")}>
                Stop selling
              </button>
            ) : null}
            {dirty ? (
              <button type="button" onClick={() => void save()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-8")} data-tier-save="">
                {busy ? "Saving" : "Save tier"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      <Confirm open={archiving} onClose={() => setArchiving(false)} title={`Stop selling ${tier.name}?`} detail="Nobody new can join on it. Members already on it keep it while they pay." action="Stop selling" onConfirm={() => { setArchiving(false); void patch({ archived: true }, "Not sold any more") }} />
      <Dialog open={picking} onClose={() => setPicking(false)} title="Also let in buyers of">
        <ul className="-mx-1.5 space-y-0.5">
          {pickable.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => void setProduct(p.id, true)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-1.5 text-left hover:bg-[#f7f7f8]">
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden className="h-9 w-9 rounded-lg bg-[#eceef1]" />
                )}
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{p.title}</span>
                <span className="text-[12px] capitalize text-[#9ca3af]">{p.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function NewTierDialog({ head, open, onClose }: { head: CommunityHead; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [kind, setKind] = React.useState<"paid" | "free">("paid")
  const [name, setName] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [interval, setInterval] = React.useState<PriceInterval>("month")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}/tiers`, "POST", { kind, name, price, interval })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    toast("Tier added")
    setName("")
    setPrice("")
    onClose()
    router.refresh()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New tier"
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? "Adding" : "Add tier"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} label="Kind" className="w-full" options={[{ value: "paid", label: "Paid" }, { value: "free", label: "Free" }]} />
        <div>
          <label htmlFor="nt-name" className={label}>
            Name
          </label>
          <input id="nt-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={kind === "paid" ? "Inner circle" : "Members"} className={cn(field, "h-11 sm:h-10")} />
        </div>
        {kind === "paid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
            <div>
              <label htmlFor="nt-price" className={label}>
                Price
              </label>
              <PriceInput id="nt-price" value={price} onChange={setPrice} placeholder="29" />
            </div>
            <Segmented value={interval} onChange={setInterval} label="How often" className="w-full sm:w-auto" options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }, { value: "once", label: "One time" }]} />
          </div>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Dialog>
  )
}

/* ── Discovery ──────────────────────────────────────────────────────────── */

function Discovery({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const [discover, setDiscover] = React.useState(data.discoveryEnabled)
  const start = { visibility: head.visibility, seoTitle: data.seoTitle ?? "", seoDescription: data.seoDescription ?? "" }
  const [s, setS] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(s) !== saved
  const save = async () => {
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", s)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(s))
    setError(null)
    toast("Saved")
    router.refresh()
  }
  return (
    <div className="space-y-4">
      {data.platformHidden ? <Notice tone="warn">Storelib took this community out of Explore. Contact support to talk about it.</Notice> : null}
      <Section title="Who can find it">
        <Toggle
          checked={discover}
          onChange={async (v) => {
            setDiscover(v)
            if (!(await instant({ discoveryEnabled: v }, v ? "Shown in Explore" : "Hidden from Explore"))) setDiscover(!v)
          }}
          title="Show in Explore"
          hint="Published public communities can be found in Explore and search."
          disabled={s.visibility !== "public"}
        />
        <div className="mt-3 space-y-3.5 border-t border-[#f1f2f4] pt-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="d-vis" className={label}>
                Visibility
              </label>
              <select id="d-vis" value={s.visibility} onChange={(e) => setS({ ...s, visibility: e.target.value as typeof s.visibility })} className={selectField}>
                <option value="public">Public: anyone can see the page</option>
                <option value="unlisted">Unlisted: only with the link</option>
                <option value="private">Private: members only</option>
              </select>
            </div>
            {/* The category is chosen in Page, from Explore's own list. */}
          </div>
          <div>
            <label htmlFor="d-seo-t" className={label}>
              Search title
            </label>
            <input id="d-seo-t" value={s.seoTitle} onChange={(e) => setS({ ...s, seoTitle: e.target.value.slice(0, 200) })} placeholder={head.name} className={cn(field, "h-11 sm:h-10")} />
          </div>
          <div>
            <label htmlFor="d-seo-d" className={label}>
              Search description
            </label>
            <textarea id="d-seo-d" value={s.seoDescription} onChange={(e) => setS({ ...s, seoDescription: e.target.value.slice(0, 500) })} rows={2} placeholder={head.tagline ?? ""} className={cn(field, "resize-y py-2.5")} />
          </div>
        </div>
      </Section>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => setS(JSON.parse(saved))} />
    </div>
  )
}

/* ── Notifications ──────────────────────────────────────────────────────── */

const LEVELS: { value: NotifyLevel; title: string; detail: string }[] = [
  { value: "all", title: "Everything", detail: "Posts, comments, reactions, events." },
  { value: "important", title: "What matters", detail: "Everything except reactions." },
  { value: "mentions", title: "Only for me", detail: "Mentions, replies and messages to you." },
  { value: "none", title: "Nothing", detail: "Check in when you like." },
]

function Notifications({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const toast = useToast()
  const [n, setN] = React.useState(data.myNotify)
  const save = async (next: typeof n) => {
    const before = n
    setN(next)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { notify: { level: next.level, emailAnnouncements: next.emailAnnouncements, emailEvents: next.emailEvents } })
    if (!res.ok) {
      setN(before)
      return toast(errorText(res.data.error))
    }
    toast("Saved")
  }
  return (
    <div className="space-y-4">
      <Section title="In the community" hint="What reaches your notifications in this community.">
        <ChoiceCards value={n.level} onChange={(v) => void save({ ...n, level: v })} options={LEVELS} label="What you hear about" columns={2} />
      </Section>
      <Section title="By email">
        <div className="divide-y divide-[#f1f2f4]">
          <Toggle checked={n.emailAnnouncements} onChange={(v) => void save({ ...n, emailAnnouncements: v })} title="Announcements" />
          <Toggle checked={n.emailEvents} onChange={(v) => void save({ ...n, emailEvents: v })} title="Event reminders" />
        </div>
      </Section>
    </div>
  )
}

/* ── Rules and policies ─────────────────────────────────────────────────── */

function Policies({ head, data }: { head: CommunityHead; data: SettingsData }) {
  return (
    <div className="space-y-4" data-policies="">
      <section className={cn(card)} data-policies-rules="">
        <div className="px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Rules</h2>
        </div>
        <RulesEditor head={head} initial={data.rules} onSaved={() => {}} />
      </section>
      {data.policies ? <PolicyForm head={head} initial={data.policies} /> : null}
    </div>
  )
}

function PolicyForm({ head, initial }: { head: CommunityHead; initial: PoliciesView }) {
  const router = useRouter()
  const toast = useToast()
  const start = React.useMemo(() => ({ refundPolicy: initial.refundPolicy, contactEmail: initial.contactEmail, contactEmailPublic: initial.contactEmailPublic }), [initial])
  const [p, setP] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const dirty = JSON.stringify(p) !== saved
  const ready = initial.ready
  const save = async () => {
    setBusy(true)
    const res = await send<{ policies?: PoliciesView }>(`/api/app/community/${head.id}`, "PATCH", { policies: p })
    setBusy(false)
    if (!res.ok) return setError({ text: res.data.error === "needs_update" ? "This needs a Storelib update first. Try again later." : errorText(res.data.error), field: res.data.field })
    const next = res.data.policies ? { refundPolicy: res.data.policies.refundPolicy, contactEmail: res.data.policies.contactEmail, contactEmailPublic: res.data.policies.contactEmailPublic } : p
    setP(next)
    setSaved(JSON.stringify(next))
    setError(null)
    toast("Saved")
    router.refresh()
  }
  return (
    <>
      {!ready ? <Notice tone="info">The refund policy and contact settings arrive with a Storelib update. They can be saved once it is in.</Notice> : null}
      <EditorCard title="Refund policy" hint="Shown at checkout and on each member's Membership page. Plain words: when you refund, and how to ask." id="refund">
        <div>
          <textarea
            id="p-refund"
            aria-label="Refund policy"
            value={p.refundPolicy}
            disabled={!ready}
            onChange={(e) => {
              setP({ ...p, refundPolicy: e.target.value.slice(0, REFUND_POLICY_MAX) })
              setError(null)
            }}
            rows={5}
            placeholder="Cancel any time and keep access until the end of the period you paid for. Write to me within 14 days of a payment for a full refund."
            aria-invalid={error?.field === "refundPolicy" || undefined}
            className={cn(field, "resize-y py-2.5 leading-relaxed", error?.field === "refundPolicy" && "border-[#dc2626]")}
          />
          <p className="mt-1 text-right text-[12px] tabular-nums text-[#9ca3af]">
            {p.refundPolicy.length.toLocaleString("en-US")} / {REFUND_POLICY_MAX.toLocaleString("en-US")}
          </p>
        </div>
      </EditorCard>
      <EditorCard title="Contact" hint="Members write to you from the community. Messages reach your inbox and this email; it stays private unless you show it." id="contact">
        <div>
          <label htmlFor="p-email" className={label}>
            Email for members
          </label>
          <input
            id="p-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={p.contactEmail}
            disabled={!ready}
            onChange={(e) => {
              setP({ ...p, contactEmail: e.target.value.slice(0, 254), contactEmailPublic: e.target.value.trim() ? p.contactEmailPublic : false })
              setError(null)
            }}
            placeholder="you@example.com"
            aria-invalid={error?.field === "contactEmail" || undefined}
            className={cn(field, "h-11 sm:h-10 sm:max-w-[360px]", error?.field === "contactEmail" && "border-[#dc2626]")}
          />
        </div>
        <Toggle checked={p.contactEmailPublic} disabled={!ready || !p.contactEmail.trim()} onChange={(v) => setP({ ...p, contactEmailPublic: v })} title="Show this email on the community" hint="On the About page and in Membership, beside the contact form." />
      </EditorCard>
      <SaveBar dirty={dirty} busy={busy} error={error?.text ?? null} onSave={() => void save()} onReset={() => { setP(JSON.parse(saved)); setError(null) }} />
    </>
  )
}

/* ── Roles ──────────────────────────────────────────────────────────────── */

const ROLE_COPY = {
  admin: { title: "Admins", hint: "People who help you run the community." },
  moderator: { title: "Moderators", hint: "People who keep conversations in order." },
} as const

function Roles({ head, roles }: { head: CommunityHead; roles: RolesView }) {
  const router = useRouter()
  const toast = useToast()
  const start = React.useMemo(() => ({ admin: roles.admin, moderator: roles.moderator }), [roles])
  const [r, setR] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(r) !== saved
  const flip = (role: "admin" | "moderator", key: PermissionKey, on: boolean) => {
    setR((x) => ({ ...x, [role]: { ...x[role], [key]: on } }))
    setError(null)
  }
  const save = async () => {
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { roles: r })
    setBusy(false)
    if (!res.ok) return setError(res.data.error === "needs_update" ? "This needs a Storelib update first. Try again later." : errorText(res.data.error))
    setSaved(JSON.stringify(r))
    setError(null)
    toast("Roles saved")
    router.refresh()
  }
  return (
    <div className="space-y-4" data-roles="">
      {!roles.ready ? <Notice tone="info">Choosing what each role may do arrives with a Storelib update. Until then admins and moderators have the usual permissions shown below.</Notice> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(["admin", "moderator"] as const).map((role) => (
          <EditorCard key={role} title={ROLE_COPY[role].title} hint={ROLE_COPY[role].hint} id={`role-${role}`}>
            <div className="-my-1 divide-y divide-[#f1f2f4]" data-role-groups={role}>
              {PERMISSION_GROUPS.map((g) => (
                <Toggle key={g.key} id={`${role}-${g.key}`} checked={r[role][g.key]} disabled={!roles.ready} onChange={(v) => flip(role, g.key, v)} title={g.label} hint={g.detail} />
              ))}
            </div>
          </EditorCard>
        ))}
      </div>
      <p className="px-1 text-[13px] leading-relaxed text-[#6b7280]">Prices, payouts, deleting the community and handing it over always stay with you. Nobody can act on someone ranked the same or above them.</p>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setR(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

/* ── Advanced ───────────────────────────────────────────────────────────── */

function Advanced({ head, videoProviders }: { head: CommunityHead; videoProviders: ProviderLine[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const run = async (key: string, url: string, body: unknown, done: string) => {
    setBusy(key)
    setError(null)
    const res = await send(url, key === "publish" || key === "unpublish" ? "PATCH" : "POST", body)
    setBusy(null)
    if (!res.ok) return setError(errorText(res.data.error))
    toast(done)
    router.refresh()
  }

  const remove = async () => {
    setBusy("delete")
    setError(null)
    const res = await send(`/api/app/community/${head.id}/delete`, "POST", { confirm: typed })
    setBusy(null)
    if (!res.ok) return setError(errorText(res.data.error))
    router.push("/app/community")
  }

  return (
    <div className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {!head.archived && head.can.manage_settings ? (
        <Section title={head.status === "published" ? "Published" : "Draft"} hint={head.status === "published" ? "Anyone allowed can see it and join." : "Only you and your team can see it."}>
          {head.status === "published" ? (
            <button type="button" onClick={() => void run("unpublish", `/api/app/community/${head.id}`, { publish: false }, "Back to a draft")} disabled={busy !== null} className={buttonSecondary}>
              {busy === "unpublish" ? "Working" : "Unpublish"}
            </button>
          ) : (
            <button type="button" onClick={() => void run("publish", `/api/app/community/${head.id}`, { publish: true }, "Published")} disabled={busy !== null} className={buttonPrimary}>
              {busy === "publish" ? "Publishing" : "Publish"}
            </button>
          )}
        </Section>
      ) : null}
      {videoProviders.length ? (
        <Section title="Videos" hint="Where replays and videos you upload to this community are kept.">
          <VideoProviders providers={videoProviders} />
        </Section>
      ) : null}
      <Section title={head.archived ? "Archived" : "Archive"} hint={head.archived ? "Members can read it; nobody can post. Bringing it back makes it a draft." : "Keep everything, stop new posts and new members. Members can still read it."}>
        <button type="button" onClick={() => void run("archive", `/api/app/community/${head.id}/archive`, { archived: !head.archived }, head.archived ? "Brought back as a draft" : "Archived")} disabled={busy !== null} className={buttonSecondary}>
          {busy === "archive" ? "Working" : head.archived ? "Bring it back" : "Archive"}
        </button>
      </Section>
      {head.can.delete ? (
        <Section title="Delete" hint="It disappears for everyone. Orders and payments are kept. Not possible while members still pay for it.">
          <button type="button" onClick={() => { setTyped(""); setDeleting(true) }} className="inline-flex h-10 items-center rounded-lg border border-[#fecaca] bg-white px-3 text-[13px] font-medium text-[#b42318] hover:bg-[#fef2f2] sm:h-8">
            Delete community
          </button>
        </Section>
      ) : null}
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this community?"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(false)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              Cancel
            </button>
            <button type="button" disabled={typed.trim() !== head.name.trim() || busy === "delete"} onClick={() => void remove()} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#b42318] px-4 text-[13px] font-medium text-white hover:bg-[#9a1d14] disabled:opacity-40 sm:h-9" data-delete-confirm="">
              {busy === "delete" ? "Deleting" : "Delete"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[#4b5563]">
          Type <span className="font-semibold text-[#1a1a2e]">{head.name}</span> to delete it.
        </p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Community name" autoComplete="off" className={cn(field, "mt-3 h-11 sm:h-10")} />
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
