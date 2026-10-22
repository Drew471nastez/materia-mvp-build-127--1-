"use client"

/**
 * ===========================================================================
 *  SETTINGS
 * ===========================================================================
 * Panels named in the address (?tab=), grouped the way /app/settings groups them:
 *
 *   COMMUNITY
 *   Access and     who can join, approval, the questions asked first, the
 *   prices         tiers with their prices (a recurring price is saved
 *                  through the memberships engine: members keep what they
 *                  joined at), the other products that let somebody in.
 *   Address and    the storelib.com address, and a domain of the creator's
 *   domain         own (round 31's panel, ./community-domain-panel).
 *   Explore and    the Explore category, being shown in Explore, and the
 *   search         title and line search engines show.
 *   Features       which sections are on, the welcome a new member sees,
 *                  their first steps.
 *   Publish and    publish, videos, archive, delete (the name typed back;
 *   archive        ?tab=advanced).
 *   MEMBERS
 *   Roles and      the owner's: what admins and moderators may do.
 *   permissions
 *   Rules and      the rules (the same editor as Moderation's), blocked
 *   policies       words, and for the owner the refund policy and how
 *                  members reach them.
 *   Points and     points, levels, badges (?tab=gamification).
 *   levels
 *   YOU
 *   Notifications  what you hear about in this community.
 *
 * ROUND 33, THE OWNER: the community's page is edited separately from
 * Settings. What people see before they join (the name, logo, tagline,
 * description, cover, gallery, what members get, questions, links) moved to
 * the Page section, the tab after Overview (app/app/community/[id]/page);
 * an address that named it here (?tab=page, ?tab=general) is sent on there
 * by the server (./logic pageTabAsked). Settings is left with what runs the
 * community.
 *
 * ROUND 32, THE OWNER: "on desktop it looks absolutely horrible, too shrunk". Page held a second column 300px wide
 * (the address, the domain, the logo, the look, the category), so the domain's line wrapped into a strip beside its
 * button and every card was squeezed. Now every panel is one column of full width cards, as /app Settings draws its
 * panels: the address and the domain are a panel of their own, the category is with Explore, the logo is in About.
 * The look (White or Dark) is gone: a member picks their own (lib/communities/client/appearance-choice.ts).
 *
 * A switch saves when it is flipped; a form saves with its save bar (./parts EditorFoot, the /app Settings bar).
 * Older links (?tab=domain, ?tab=welcome) land on the panel that holds what they pointed at (./logic settingsTabOf);
 * ?tab=page and ?tab=general open the Page section.
 */
import { MembershipSheet } from "@/components/community/membership/sheet"
import { welcomeVideoSrc } from "@/lib/communities/post-media"
import * as React from "react"
import { useRouter } from "next/navigation"
import { announceCommunityUpdated } from "@/lib/communities/updated-signal"
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Plus, X } from "lucide-react"
import { ChoicePicker } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { centsFromInput, TRIAL_CHOICES, trialDaysOf } from "@/lib/memberships/plan"
import { MAX_ACTIVE_TIERS, MAX_BENEFITS } from "@/lib/communities/limits"
import type { NotifyLevel } from "@/lib/communities/types"
import type { CommunityHead, PoliciesView, RolesView, SettingsData, TierView } from "./view-types"
import { accessChoiceOf, settingsTabAsked, settingsTabOf, type PriceInterval, type SettingsTab } from "./logic"
import { accessSummary, privacyTitle, type CommunityPricing, type CommunityPrivacy } from "@/lib/communities/access-model"
import { COMMUNITY_CATEGORIES, communityCategoryId } from "@/lib/explore/communities-mode"
import { getMainDomain } from "@/lib/url-helpers"

export type { SettingsTab }
import { GamificationPanel } from "./gamification-panel"
import { RulesEditor } from "./moderation-section"
import { BlockedWords } from "./blocked-words"
import { PERMISSION_GROUPS, type PermissionKey } from "@/lib/communities/permissions"
import { REFUND_POLICY_MAX } from "@/lib/communities/membership-policy"
import { CommunityDomainPanel } from "./community-domain-panel"
import { ChatPanel } from "./chat-panel"
import { DeleteCommunity } from "./delete-community"
import { JoinQuestionsPanel } from "./join-questions-panel"
import { OnboardingPanel } from "./onboarding-panel"
import { VideoProviders, type ProviderLine } from "@/components/video/video-providers"
import { ChoiceCards, Confirm, Dialog, EDITOR_CARD_TITLE, EditorCard, EditorFoot, Notice, PriceInput, Segmented, Toggle, buttonPrimary, buttonSecondary, card, errorText, field, label, send, useToast } from "./parts"
import { tt, ttx } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

type SettingsGroup = "community" | "people" | "you"

/** What every panel is drawn from. */
export interface SettingsPanelProps {
  head: CommunityHead
  data: SettingsData
  videoProviders: ProviderLine[]
}

/**
 * ONE PANEL OF SETTINGS: its name in the column and the phone's list, the line under it saying what is in it, who may
 * open it, its group, and what it draws. A new panel is one more entry here (and its name in ./logic SETTINGS_TABS);
 * the column, the phone's list, the address and Back all follow from this list.
 */
export interface SettingsPanel {
  value: SettingsTab
  label: string
  line: string
  needs: keyof CommunityHead["can"]
  group: SettingsGroup
  /** Left out of the list when this says no (Roles before its data is there). */
  shown?: (p: SettingsPanelProps) => boolean
  render: (p: SettingsPanelProps) => React.ReactNode
}

/*
  NAMES A BUSINESS READS AT A GLANCE (round 31, round 32). Each panel has a line under its name saying what is in it, shown
  in the phone's list and under the panel's title.
*/
const PANELS: SettingsPanel[] = [
  /* Round 33: Page is a section of its own now (the tab after Overview); Settings opens on who gets in. */
  { value: "access", get label() { return tt("Access and prices") }, needs: "manage_settings", group: "community", get line() { return tt("Who can join, approval and tiers") }, render: (p) => <Access head={p.head} data={p.data} /> },
  { value: "address", get label() { return tt("Address and domain") }, needs: "manage_settings", group: "community", get line() { return tt("Your link on Storelib, and a domain of your own") }, render: (p) => <AddressSettings head={p.head} /> },
  { value: "discovery", get label() { return tt("Explore and search") }, needs: "manage_settings", group: "community", get line() { return tt("Category, Explore and search results") }, render: (p) => <Discovery head={p.head} data={p.data} /> },
  { value: "features", get label() { return tt("Features") }, needs: "manage_settings", group: "community", get line() { return tt("Learn, Calendar, chat and the welcome") }, render: (p) => <Features head={p.head} data={p.data} /> },
  /* Round 37: chat on its own panel: channels and slow mode, who may message whom, groups, files, the chat rules, who is kept out. */
  { value: "chat", get label() { return tt("Chat") }, needs: "mute", group: "community", get line() { return tt("Channels, messages, groups and chat rules") }, render: (p) => <ChatPanel head={p.head} /> },
  { value: "advanced", get label() { return tt("Publish and archive") }, needs: "archive", group: "community", get line() { return tt("Publish, videos, archive or delete") }, render: (p) => <Advanced head={p.head} videoProviders={p.videoProviders} /> },
  /* What admins and moderators may do: the owner's alone (transfer_ownership is the action only an owner has). */
  { value: "roles", get label() { return tt("Roles and permissions") }, needs: "transfer_ownership", group: "people", get line() { return tt("What admins and moderators can do") }, shown: (p) => !!p.data.roles, render: (p) => (p.data.roles ? <Roles head={p.head} roles={p.data.roles} /> : null) },
  { value: "policies", get label() { return tt("Rules and policies") }, needs: "manage_settings", group: "people", get line() { return tt("Rules, blocked words, refunds and contact") }, render: (p) => <Policies head={p.head} data={p.data} /> },
  /*
    Member emails moved to Emails › Customer emails › Communities, with the store's other emails
    (components/app/emails/community-emails.tsx): an address that asks for them here (?tab=emails, and its older
    names) is sent there by the page (app/app/community/[id]/settings/page.tsx), the community's words and its sent
    emails as they were.
  */
  { value: "gamification", get label() { return tt("Points and levels") }, needs: "manage_gamification", group: "people", get line() { return tt("Points, levels and badges") }, render: (p) => <GamificationPanel head={p.head} levels={p.data.levels} badges={p.data.badges} /> },
  { value: "notifications", get label() { return tt("Notifications") }, needs: "view", group: "you", get line() { return tt("What you hear about from this community") }, render: (p) => <Notifications head={p.head} data={p.data} /> },
  /* round32: features panels (a new panel: its entry here, its name in ./logic SETTINGS_TABS) */
]

const GROUPS: { id: SettingsGroup; label: string }[] = [
  { id: "community", get label() { return tt("Community") } },
  { id: "people", get label() { return tt("Members") } },
  { id: "you", get label() { return tt("You") } },
]

/** The history entry a phone pushes when it opens a panel from the list, so Back returns to the list. */
const PANEL_ENTRY = "communitySettingsPanel"

/*
  THE /app SETTINGS WAY OF FINDING A PANEL (round 31). From 1024px the panels are a column of groups beside the one open
  (components/app/settings-form-new.tsx data-settings-groups: 232px and 48px from it from 1280px, as there). Below it
  Settings opens on the list itself, in its groups, a row each with what it holds and a chevron; a row opens its panel
  under a back row, and Back (the row, the browser's, a phone's swipe) returns to the list. An address that names a panel
  (?tab=) opens on it.

  A PANEL YOU LEFT KEEPS WHAT YOU TYPED. Each panel stays mounted once it has been opened and is only hidden while another is
  showing, so going to Access and back to Page does not throw away an unsaved name.
*/
export function SettingsSection({ head, data, tab: initialTab, asked = true, videoProviders = [] }: { head: CommunityHead; data: SettingsData; tab: SettingsTab; asked?: boolean; videoProviders?: ProviderLine[] }) {
  const props: SettingsPanelProps = { head, data, videoProviders }
  const tabs = PANELS.filter((t) => head.can[t.needs] && (!t.shown || t.shown(props)))
  const [tab, setTab] = React.useState<SettingsTab>(tabs.some((t) => t.value === initialTab) ? initialTab : (tabs[0]?.value ?? "notifications"))
  /* Below 1024px only: the list of panels, or the one open. From 1024px both are drawn by CSS, whatever this says. */
  const [view, setView] = React.useState<"list" | "panel">(asked ? "panel" : "list")
  const [opened, setOpened] = React.useState<Set<SettingsTab>>(() => new Set([tab]))
  const root = React.useRef<HTMLDivElement>(null)
  const open = (t: SettingsTab) => {
    setTab(t)
    setOpened((was) => (was.has(t) ? was : new Set(was).add(t)))
  }
  const toTop = () => {
    const pane = root.current?.closest<HTMLElement>(".orders-pane")
    if (pane) pane.scrollTop = 0
  }
  /* A computer's column: the address follows, with no history entry per panel. */
  const choose = (t: SettingsTab) => {
    open(t)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
  }
  /* A phone's list: a history entry, so Back returns to the list. */
  const openFromList = (t: SettingsTab) => {
    open(t)
    setView("panel")
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    window.history.pushState({ [PANEL_ENTRY]: true }, "", url.pathname + url.search)
    toTop()
  }
  const backToList = () => {
    if ((window.history.state as Record<string, unknown> | null)?.[PANEL_ENTRY]) return window.history.back()
    setView("list")
    const url = new URL(window.location.href)
    url.searchParams.delete("tab")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    toTop()
  }
  React.useEffect(() => {
    const onPop = () => {
      if (!/\/settings\/?$/.test(window.location.pathname)) return
      const raw = new URLSearchParams(window.location.search).get("tab")
      if (!settingsTabAsked(raw)) return setView("list")
      open(settingsTabOf(raw))
      setView("panel")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  const current = tabs.find((t) => t.value === tab)
  return (
    <div ref={root} data-settings="" data-tab={tab} data-view={view} className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[232px_minmax(0,1fr)] xl:gap-12">
      {/* Sticky 20px under the shell's row of tabs, which is 52px from 768px (round 26, community-shell.tsx CommunityHeader). */}
      <nav aria-label={tt("Settings")} data-settings-groups="" className="sticky top-[72px] hidden lg:block">
        {GROUPS.map((g) => {
          const list = tabs.filter((t) => t.group === g.id)
          if (!list.length) return null
          return (
            <div key={g.id} className="mb-1 last:mb-0 [&+&]:mt-4" data-settings-group={g.id}>
              <p className="px-3 pb-1 text-[12px] font-medium text-[#9ca3af]">{g.label}</p>
              {list.map((t) => {
                const on = tab === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    data-settings-tab={t.value}
                    onClick={() => choose(t.value)}
                    className={cn(
                      "flex h-9 w-full items-center rounded-[10px] px-3 text-left text-[14px] outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]",
                      on ? "bg-[#e9e9eb] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,18,27,0.08),inset_0_0_0_1px_rgba(16,18,27,0.05),inset_0_1px_0_rgba(255,255,255,0.7)]" : "text-[#4b5563] hover:bg-[#f1f1f3] hover:text-[#1a1a2e]",
                    )}
                  >
                    <span className="truncate">{t.label}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
        {/* round32: features panels. New panels are registered in PANELS above; the column draws them in their group. */}
      </nav>

      {/* Below 1024px, the list of panels in their groups. */}
      <div data-settings-list="" className={cn("space-y-5 lg:hidden", view !== "list" && "hidden")}>
        {GROUPS.map((g) => {
          const list = tabs.filter((t) => t.group === g.id)
          if (!list.length) return null
          return (
            <section key={g.id} data-settings-list-group={g.id}>
              <h2 className="mb-1.5 px-1 text-[13px] font-medium text-[#6b7280]">{g.label}</h2>
              <div className={cn(card, "divide-y divide-[#f1f2f4] overflow-hidden")}>
                {list.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    data-settings-row={t.value}
                    onClick={() => openFromList(t.value)}
                    className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-100 active:bg-[#f4f5f7] focus-visible:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-5 text-[#1a1a2e]">{t.label}</span>
                      <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280]">{t.line}</span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div data-settings-open="" className={cn("min-w-0", view === "list" && "max-lg:hidden")}>
        {/* The panel's name and what it holds; on a phone under the way back to the list. */}
        <div className="mb-4 lg:mb-5" data-settings-head="">
          <button type="button" onClick={backToList} data-settings-back="" className="-ml-2 mb-1.5 inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg pl-1.5 pr-2.5 text-[14px] font-medium text-[#4b5563] outline-none transition-colors duration-100 hover:bg-[#eceef1] hover:text-[#1a1a2e] active:bg-[#e4e6ea] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] lg:hidden [-webkit-tap-highlight-color:transparent]">
            <ChevronLeft aria-hidden className="h-[18px] w-[18px]" />
            {tt("Settings")}
          </button>
          <h2 className="text-[20px] font-bold leading-7 text-[#1a1a2e] lg:text-[22px]">{current?.label}</h2>
          <p className="mt-0.5 text-[14px] text-[#6b7280]">{current?.line}</p>
        </div>
        {tabs.map((t) =>
          opened.has(t.value) || tab === t.value ? (
            <div key={t.value} hidden={tab !== t.value} data-settings-panel={t.value}>
              {t.render(props)}
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}

/** A switch that saves the moment it is flipped. */
function useInstant(head: CommunityHead) {
  const toast = useToast()
  const router = useRouter()
  return async (body: Record<string, unknown>, done = tt("Saved")) => {
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

/* ── Address and domain ─────────────────────────────────────────────────── */

/*
  WHERE THE COMMUNITY OPENS (round 32: a panel of its own). The storelib.com address, saved with its own bar: a new
  address moves these screens with it (/app/community/<slug>), and the old one keeps opening the community (run-now part
  94). Under it the creator's own domain (./community-domain-panel), which saves as it goes.
*/
function AddressSettings({ head }: { head: CommunityHead }) {
  const router = useRouter()
  const toast = useToast()
  const [slug, setSlug] = React.useState(head.slug)
  const [saved, setSaved] = React.useState(head.slug)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = slug !== saved
  const save = async () => {
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { slug })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    const before = saved
    setSaved(slug)
    setError(null)
    toast(tt("Saved"))
    /* A new address: these screens move with it, rather than reloading under the old one. */
    const { pathname, search } = window.location
    router.replace(pathname.replace(`/app/community/${before}`, `/app/community/${slug}`) + search, { scroll: false })
    announceCommunityUpdated(head.id)
  }
  return (
    <div className="space-y-4" data-address-settings="">
      <EditorCard title={tt("Storelib address")} hint={tt("The link people open and share. Changing it keeps the old link working.")} id="address">
        <div className="max-w-[560px]">
          <label htmlFor="g-slug" className="sr-only">
            {tt("Address")}
          </label>
          <div className="flex h-11 items-center overflow-hidden rounded-lg border border-[#e1e3e7] bg-white shadow-[0_1px_0_rgba(17,24,39,0.04)] transition-[border-color,box-shadow] focus-within:border-[#1a1a2e]/50 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:h-10" data-slug-field="">
            <span className="shrink-0 pl-3 text-[14px] text-[#9ca3af] max-sm:text-[13px]">{`${getMainDomain()}/community/`}</span>
            <input
              id="g-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48))
                setError(null)
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[16px] text-[#1a1a2e] outline-none sm:text-[14px]"
            />
          </div>
          {/* The old address is kept (run-now part 94): a shared link opens the community at its new address. */}
          {dirty && head.status === "published" ? <p className="mt-1.5 text-[13px] text-[#6b7280]" data-slug-note="">{tt("Links to /community/{slug} will open the new address.", { slug: saved })}</p> : null}
        </div>
      </EditorCard>

      {/* Round 31: a domain of the creator's own can show this community (./community-domain-panel). */}
      <CommunityDomainPanel communityId={head.id} />

      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setSlug(saved); setError(null) }} />
    </div>
  )
}

/* ── Features ───────────────────────────────────────────────────────────── */

function Features({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const [features, setFeatures] = React.useState({ classroomEnabled: head.classroomEnabled, eventsEnabled: head.eventsEnabled, chatEnabled: data.chatEnabled, directoryEnabled: data.directoryEnabled })
  const start = React.useMemo(
    () => ({
      enabled: data.onboarding.enabled === true,
      welcome: data.onboarding.welcome ?? "",
      askIntro: data.onboarding.askIntro !== false,
      showRules: data.onboarding.showRules !== false,
      /* Round AF: heading, intro video, button words, popup or card. */
      title: data.onboarding.title ?? "",
      videoUrl: data.onboarding.videoUrl ?? "",
      button: data.onboarding.button ?? "",
      style: data.onboarding.style === "popup" ? ("popup" as const) : ("card" as const),
    }),
    [data],
  )
  const [previewing, setPreviewing] = React.useState(false)
  const [w, setW] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(w) !== saved

  const flip = async (key: keyof typeof features, v: boolean) => {
    setFeatures((f) => ({ ...f, [key]: v }))
    if (!(await instant({ [key]: v }, v ? tt("Turned on") : tt("Turned off")))) setFeatures((f) => ({ ...f, [key]: !v }))
  }
  const save = async () => {
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { onboarding: w })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(w))
    setError(null)
    toast(tt("Saved"))
    router.refresh()
  }

  return (
    <div className="space-y-4" data-features="">
      <EditorCard title={tt("Sections")} hint={tt("Turned off, a section is hidden from members. Nothing in it is deleted.")}>
        <div className="-my-1 divide-y divide-[#f1f2f4]">
          <Toggle checked={features.classroomEnabled} onChange={(v) => void flip("classroomEnabled", v)} title={tt("Learn")} hint={tt("Your programs and lessons, inside the community.")} />
          <Toggle checked={features.eventsEnabled} onChange={(v) => void flip("eventsEnabled", v)} title={tt("Calendar")} hint={tt("Calls, workshops and meetups with RSVPs.")} />
          <Toggle checked={features.chatEnabled} onChange={(v) => void flip("chatEnabled", v)} title={tt("Chat")} hint={tt("Spaces of the chat kind, and messages between members.")} />
          <Toggle checked={features.directoryEnabled} onChange={(v) => void flip("directoryEnabled", v)} title={tt("Member directory")} hint={tt("Members can see who else is here.")} />
        </div>
      </EditorCard>

      <EditorCard title={tt("Welcome")} hint={tt("What a new member sees the first time they open it.")}>
        <div>
        <Toggle checked={w.enabled} onChange={(v) => setW({ ...w, enabled: v })} title={tt("Show a welcome")} />
        {w.enabled ? (
          <div className="mt-2 space-y-1">
            <textarea value={w.welcome} onChange={(e) => setW({ ...w, welcome: e.target.value.slice(0, 2000) })} rows={3} placeholder={tt("Glad you are here. Start by introducing yourself.")} aria-label={tt("Welcome message")} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
            <Toggle checked={w.showRules} onChange={(v) => setW({ ...w, showRules: v })} title={tt("Ask them to read the rules")} hint={data.rules.length ? tt("{length, plural, one {# rule} other {# rules}}, in Rules and policies.", { length: data.rules.length }) : tt("There are no rules yet. Write them in Rules and policies.")} />
            <Toggle checked={w.askIntro} onChange={(v) => setW({ ...w, askIntro: v })} title={tt("Ask them to introduce themselves")} />
            <div className="space-y-3 pt-2" data-welcome-extra="">
              <div>
                <p className={label}>{tt("How it opens")}</p>
                <div role="radiogroup" aria-label={tt("How it opens")} className="mt-1 flex flex-wrap gap-1.5" data-welcome-style="">
                  {(["popup", "card"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={w.style === v}
                      onClick={() => setW({ ...w, style: v })}
                      className={cn(
                        "inline-flex h-10 items-center rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 sm:h-8",
                        w.style === v ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f8f9fa]",
                      )}
                    >
                      {v === "popup" ? tt("Popup on their first visit") : tt("Card at the top of the feed")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="welcome-title" className={label}>{tt("Heading")}</label>
                <input id="welcome-title" value={w.title} onChange={(e) => setW({ ...w, title: e.target.value.slice(0, 80) })} placeholder={tt("Welcome to {name}", { name: head.name })} className={cn(field, "h-11 sm:h-10")} data-welcome-title="" />
              </div>
              <div>
                <label htmlFor="welcome-video" className={label}>{tt("Intro video")}</label>
                <input id="welcome-video" value={w.videoUrl} onChange={(e) => setW({ ...w, videoUrl: e.target.value.slice(0, 500) })} placeholder={tt("A YouTube, Vimeo or Loom link")} inputMode="url" className={cn(field, "h-11 sm:h-10")} data-welcome-video="" />
              </div>
              <div>
                <label htmlFor="welcome-button" className={label}>{tt("Button")}</label>
                <input id="welcome-button" value={w.button} onChange={(e) => setW({ ...w, button: e.target.value.slice(0, 30) })} placeholder={w.showRules ? tt("I agree, let's go") : tt("Got it")} className={cn(field, "h-11 sm:h-10")} data-welcome-button="" />
              </div>
              <p className="text-[12.5px] text-[#6b7280]">{tt("Each member sees it once, on any device. People already in see it only if they have not yet.")}</p>
              <button type="button" onClick={() => setPreviewing(true)} className="inline-flex h-10 items-center rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-9" data-welcome-preview="">
                {tt("Preview")}
              </button>
            </div>
          </div>
        ) : null}
        <WelcomePreview open={previewing} onClose={() => setPreviewing(false)} name={head.name} w={w} rules={w.showRules ? data.rules : []} />
        </div>
      </EditorCard>

      {/* Round 32: a new member's first steps and the welcome message sent to them (./onboarding-panel). */}
      <OnboardingPanel head={head} />

      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setW(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

/* ── Access & pricing ───────────────────────────────────────────────────── */

/*
  WHO CAN GET IN, AND WHAT IT COSTS: two facts, two controls, one card. They
  used to be one switch, which is why a private community could never charge
  (lib/communities/access-model.ts).
*/
const PRIVACY_OPTIONS: { value: CommunityPrivacy; title: string; detail: string }[] = [
  { value: "public", get title() { return tt("Anyone") }, get detail() { return tt("Found in Explore and on your page.") } },
  { value: "unlisted", get title() { return tt("People with the link") }, get detail() { return tt("Not in Explore. Anyone who has the link can join.") } },
  { value: "private", get title() { return tt("Only people you invite") }, get detail() { return tt("An invite link is the only way in.") } },
]

const PRICING_OPTIONS: { value: CommunityPricing; title: string; detail: string }[] = [
  { value: "free", title: "Free", get detail() { return tt("Joining costs nothing.") } },
  { value: "paid", get title() { return tt("Paid") }, get detail() { return tt("Members pay for a tier to join.") } },
]

const dollars = (cents: number | null) => (cents ? String(cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)) : "")

function Access({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const owner = head.can.manage_pricing === true
  const stored = accessChoiceOf(head)
  const [privacy, setPrivacy] = React.useState<CommunityPrivacy>(stored.privacy)
  const [pricing, setPricing] = React.useState<CommunityPricing>(stored.pricing)
  const [approval, setApproval] = React.useState(data.approvalRequired)
  const [adding, setAdding] = React.useState(false)
  const [typeError, setTypeError] = React.useState<string | null>(null)
  const tiers = data.tiers
  const live = tiers.filter((t) => !t.archived)
  const archived = tiers.filter((t) => t.archived)
  const paidTier = live.find((t) => t.kind === "paid")
  const priceOfTier = paidTier?.priceLine && paidTier.priceLine !== "Free" ? paidTier.priceLine : null

  const change = async (next: { privacy?: CommunityPrivacy; pricing?: CommunityPricing }) => {
    const want = { privacy: next.privacy ?? privacy, pricing: next.pricing ?? pricing }
    if (want.privacy === privacy && want.pricing === pricing) return
    setTypeError(null)
    if (want.pricing === "paid" && !paidTier) {
      setTypeError(tt("Add a paid tier with a price first, then switch to paid."))
      setAdding(true)
      return
    }
    const before = { privacy, pricing }
    setPrivacy(want.privacy)
    setPricing(want.pricing)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", want)
    if (!res.ok) {
      setPrivacy(before.privacy)
      setPricing(before.pricing)
      return setTypeError(errorText(res.data.error))
    }
    toast(tt("Saved"))
    router.refresh()
  }

  return (
    <div className="space-y-4" data-access="">
      {!data.paymentsReady && owner && (pricing === "paid" || live.some((t) => t.kind === "paid")) ? (
        <Notice tone="warn">
          {tt("Connect payouts before members can pay: people pay you through Stripe.")}{" "}
          <a href="/app/settings?tab=payments" className="font-semibold underline">
            {tt("Set up payouts")}
          </a>
        </Notice>
      ) : null}

      <EditorCard title={tt("Who can get in, and what it costs")}>
        {/* Round 32: the two choices side by side from 1280px, where the panel is wide enough for both; one under the other below it. */}
        {owner ? (
          <div className="grid grid-cols-1 gap-x-10 gap-y-4 xl:grid-cols-2" data-access-choices="">
            <div className="min-w-0">
              <p className={cn(label, "mb-1")}>{tt("Who can get in")}</p>
              <ChoiceCards rows value={privacy} onChange={(v) => void change({ privacy: v })} options={PRIVACY_OPTIONS} label={tt("Who can get in")} />
            </div>
            <div className="min-w-0 max-xl:border-t max-xl:border-[#f1f2f4] max-xl:pt-3">
              <p className={cn(label, "mb-1")}>{tt("What joining costs")}</p>
              <ChoiceCards rows value={pricing} onChange={(v) => void change({ pricing: v })} options={PRICING_OPTIONS} label={tt("What joining costs")} />
            </div>
          </div>
        ) : (
          <p className="text-[14px] text-[#1a1a2e]">
            {privacyTitle(privacy)}, {pricing === "paid" ? "paid" : "free"}{tt(". Only the owner changes this.")}
          </p>
        )}
        <div>
          <p className="rounded-lg bg-[#f7f7f8] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#4b5563]" data-access-summary="">
            {accessSummary(privacy, pricing, priceOfTier)}
          </p>
          {typeError ? (
            <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
              {typeError}
            </p>
          ) : null}
        </div>
        <div className="border-t border-[#f1f2f4] pt-1.5">
          <Toggle
            checked={approval}
            onChange={async (v) => {
              setApproval(v)
              if (!(await instant({ approvalRequired: v }, v ? tt("Requests need your approval") : tt("People join straight away")))) setApproval(!v)
            }}
            title={tt("Approve each request")}
            hint={privacy === "private" ? tt("An invite is already an approval, so this only applies to anyone who asks without one.") : pricing === "paid" ? tt("People ask first; once you approve, they can pay.") : tt("People ask to join and you approve them under Members.")}
          />
        </div>
      </EditorCard>

      {/* Round 32: the questions asked before joining (./join-questions-panel). */}
      <JoinQuestionsPanel head={head} initial={data.joinForm} />

      <EditorCard
        title={tt("Plans")}
        hint={tt("Up to {max} plans on sale at once. With more than one, Join opens a page to pick a plan.", { max: MAX_ACTIVE_TIERS })}
        action={
          owner ? (
            <div className="flex items-center gap-2">
              <a href={`/community/${head.slug}?preview=plans&join=plans`} target="_blank" rel="noreferrer" className={cn(buttonSecondary, "border-transparent shadow-none")} data-plans-preview="">
                <ExternalLink aria-hidden className="h-4 w-4" />
                {tt("Preview")}
              </a>
              {live.length < MAX_ACTIVE_TIERS ? (
                <button type="button" onClick={() => setAdding(true)} className={buttonSecondary} data-tier-add="">
                  <Plus aria-hidden className="h-4 w-4" />
                  {tt("Add plan")}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {live.length === 0 ? <p className="text-[13.5px] text-[#6b7280]">{tt("No plans yet. Add one to start.")}</p> : (
          <div className="space-y-3" data-tier-list="">
            {live.map((t) => (
              <TierCard key={t.id} head={head} tier={t} products={data.products} owner={owner} canDefault={live.length > 1} first={t.id === live[0]?.id} last={t.id === live[live.length - 1]?.id} />
            ))}
          </div>
        )}
        {owner && live.length >= MAX_ACTIVE_TIERS ? <p className="text-[12.5px] text-[#6b7280]" data-plans-full="">{tt("{max} plans are on sale, the most there can be. Stop selling one to add another.", { max: MAX_ACTIVE_TIERS })}</p> : null}
        {archived.length ? (
          <div className="border-t border-[#f1f2f4] pt-3">
            <p className="mb-2 text-[12.5px] font-medium text-[#6b7280]">{tt("Not sold any more")}</p>
            <ul className="space-y-1">
              {archived.map((t) => (
                <li key={t.id} className="flex min-h-10 items-center justify-between gap-3">
                  <span className="truncate text-[13.5px] text-[#4b5563]">
                    {t.name} · {t.priceLine || ttx("price", "Free")} · {tt("{n, plural, one {# member} other {# members}}", { n: t.members })}
                  </span>
                  {owner ? <TierRestore head={head} tier={t} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </EditorCard>

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
        toast(tt("Back on sale"))
        router.refresh()
      }}
      className={cn(buttonSecondary, "h-10 sm:h-8")}
    >
      {tt("Sell again")}
    </button>
  )
}

function TierCard({ head, tier, products, owner, canDefault, first = true, last = true }: { head: CommunityHead; tier: TierView; products: SettingsData["products"]; owner: boolean; canDefault: boolean; first?: boolean; last?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/tiers/${tier.id}`
  const start = { name: tier.name, description: tier.description ?? "", benefits: tier.benefits.join("\n"), trial: String(trialDaysOf(tier.trialDays)), monthly: dollars(tier.monthlyCents), yearly: dollars(tier.yearlyCents), price: dollars(tier.priceCents) }
  const [s, setS] = React.useState(start)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const dirty = JSON.stringify(s) !== JSON.stringify(start)

  const save = async () => {
    const body: Record<string, unknown> = {}
    if (s.name !== start.name) body.name = s.name
    if (s.description !== start.description) body.description = s.description
    if (s.benefits !== start.benefits) body.benefits = s.benefits.split("\n").map((b) => b.trim()).filter(Boolean)
    if (tier.billing === "recurring") {
      if (s.monthly !== start.monthly) body.monthlyPrice = s.monthly
      if (s.yearly !== start.yearly) body.yearlyPrice = s.yearly
      if (s.trial !== start.trial) body.trialDays = Number(s.trial)
    }
    if (tier.billing === "one_time" && s.price !== start.price) body.price = s.price
    setBusy(true)
    setError(null)
    const res = await send(base, "PATCH", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setEditing(false)
    toast(tier.billing === "recurring" && (body.monthlyPrice !== undefined || body.yearlyPrice !== undefined) ? tt("Price saved. Members keep the price they joined at.") : body.trialDays !== undefined ? tt("Saved. The trial applies to people who join from now on.") : tt("Saved"))
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
    toast(on ? tt("Product added") : tt("Product taken off"))
    setPicking(false)
    router.refresh()
  }

  const yearlyHint = (() => {
    const m = centsFromInput(s.monthly)
    const y = centsFromInput(s.yearly)
    if (!m || !y || !Number.isFinite(m) || !Number.isFinite(y)) return null
    const saving = Math.round((1 - y / (m * 12)) * 100)
    return saving > 0 ? tt("Saves {saving}% against monthly", { saving }) : null
  })()

  const offered = new Set([...tier.accessProducts.map((p) => p.id)])
  const pickable = products.filter((p) => !offered.has(p.id))

  /* Round AG: the benefits as a list of rows, one input each; saved as lines like before. */
  const benefitRows = s.benefits.length ? s.benefits.split("\n") : []
  const setBenefits = (rows: string[]) => setS({ ...s, benefits: rows.slice(0, MAX_BENEFITS).join("\n") })
  const shownBenefits = tier.benefits.slice(0, 3)
  const cancel = () => {
    setS(start)
    setError(null)
    setEditing(false)
  }

  /*
    ROUND AG: A PLAN IS A CARD, the way a visitor sees it. Name, price, trial and members at a glance; Edit opens the
    form below it (a smooth grid row open), saved with one button. Order, default and stop selling stay one tap away.
  */
  return (
    <div className="rounded-2xl border border-[#e8eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]" data-tier={tier.kind} data-tier-card="" data-editing={editing ? "" : undefined}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-[#1a1a2e]">{tier.name}</span>
            {tier.isDefault ? <StatusBadge tone="neutral">{tt("Default")}</StatusBadge> : null}
            {tier.kind === "paid" && tier.productStatus !== "published" ? <StatusBadge tone="attention">{tt("Off sale")}</StatusBadge> : null}
          </p>
          <p className="mt-1 text-[13.5px] tabular-nums text-[#1a1a2e]">
            <span className="font-medium">{tier.priceLine || (tier.kind === "free" ? ttx("price", "Free") : tt("No price"))}</span>
            {tier.trialDays > 0 ? <span className="text-[#6b7280]"> · {tt("{n}-day free trial", { n: tier.trialDays })}</span> : null}
            <span className="text-[#6b7280]"> · {tt("{n, plural, one {# member} other {# members}}", { n: tier.members })}</span>
          </p>
          {tier.subscribers && (tier.subscribers.paying || tier.subscribers.trialing || tier.subscribers.trialsEnded) ? (
            <p className="mt-0.5 text-[12.5px] tabular-nums text-[#6b7280]" data-tier-subscribers="">
              {tt("{n} paying", { n: tier.subscribers.paying })}
              {tier.subscribers.trialing ? ` · ${tt("{n} on a free trial", { n: tier.subscribers.trialing })}` : ""}
              {tier.subscribers.trialsEnded ? ` · ${tt("{c} of {n} ended trials now paying", { c: tier.subscribers.trialsConverted, n: tier.subscribers.trialsEnded })}` : ""}
            </p>
          ) : null}
          {!editing && shownBenefits.length ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" data-tier-benefit-chips="">
              {shownBenefits.map((b, i) => (
                <li key={i} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#f4f5f7] px-2.5 py-1 text-[12px] text-[#4b5563]">
                  <Check aria-hidden className="h-3 w-3 shrink-0 text-[#1a1a2e]" strokeWidth={2.5} />
                  <span className="truncate">{b}</span>
                </li>
              ))}
              {tier.benefits.length > shownBenefits.length ? <li className="px-1 py-1 text-[12px] text-[#9ca3af]">+{tier.benefits.length - shownBenefits.length}</li> : null}
            </ul>
          ) : null}
        </div>
        {owner ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {!(first && last) ? (
              <span className="flex items-center" data-tier-move="">
                <button type="button" disabled={first} aria-label={tt("Move {name} up", { name: tier.name })} onClick={() => void patch({ move: "up" }, tt("Moved"))} className="grid h-10 w-10 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 sm:h-8 sm:w-8">
                  <ArrowUp aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" disabled={last} aria-label={tt("Move {name} down", { name: tier.name })} onClick={() => void patch({ move: "down" }, tt("Moved"))} className="grid h-10 w-10 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 sm:h-8 sm:w-8">
                  <ArrowDown aria-hidden className="h-4 w-4" />
                </button>
              </span>
            ) : null}
            <button type="button" onClick={() => (editing ? cancel() : setEditing(true))} aria-expanded={editing} className={cn(buttonSecondary, "ml-1 h-10 gap-1 sm:h-8")} data-tier-edit="">
              {editing ? tt("Close") : tt("Edit")}
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-[rotate] duration-200", editing && "rotate-180")} />
            </button>
          </div>
        ) : null}
      </div>
      {owner ? (
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", editing ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} data-tier-form="">
          <div className="min-h-0 overflow-hidden" inert={!editing}>
            <div className="space-y-5 border-t border-[#f1f2f4] px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
              <section>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Plan")}</p>
                <div className={cn("grid gap-3", tier.billing === "recurring" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
                  <div className={tier.billing === "recurring" ? "col-span-2 sm:col-span-1" : undefined}>
                    <label htmlFor={`t-name-${tier.id}`} className={label}>
                      {tt("Name")}
                    </label>
                    <input id={`t-name-${tier.id}`} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value.slice(0, 60) })} className={cn(field, "h-11 sm:h-10")} />
                  </div>
                  {tier.billing === "recurring" ? (
                    <>
                      <div>
                        <label htmlFor={`t-m-${tier.id}`} className={label}>
                          {tt("Monthly price")}
                        </label>
                        <PriceInput id={`t-m-${tier.id}`} value={s.monthly} onChange={(v) => setS({ ...s, monthly: v })} placeholder={tt("None")} />
                      </div>
                      <div>
                        <label htmlFor={`t-y-${tier.id}`} className={label}>
                          {tt("Yearly price")}
                        </label>
                        <PriceInput id={`t-y-${tier.id}`} value={s.yearly} onChange={(v) => setS({ ...s, yearly: v })} placeholder={tt("None")} />
                        {yearlyHint ? <p className="mt-1 text-[12px] text-[#15803d]">{yearlyHint}</p> : null}
                      </div>
                    </>
                  ) : tier.billing === "one_time" ? (
                    <div>
                      <label htmlFor={`t-p-${tier.id}`} className={label}>
                        {tt("One time price")}
                      </label>
                      <PriceInput id={`t-p-${tier.id}`} value={s.price} onChange={(v) => setS({ ...s, price: v })} />
                    </div>
                  ) : null}
                </div>
                {tier.billing === "recurring" ? (
                  <div className="mt-3">
                    <p id={`t-t-${tier.id}`} className={label}>
                      {tt("Free trial")}
                    </p>
                    <div role="radiogroup" aria-labelledby={`t-t-${tier.id}`} className="inline-flex flex-wrap gap-1 rounded-xl bg-[#f4f5f7] p-1" data-tier-trial="">
                      {[...new Set<number>([...TRIAL_CHOICES, trialDaysOf(start.trial)])].sort((a, b) => a - b).map((d) => {
                        const on = s.trial === String(d)
                        return (
                          <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setS({ ...s, trial: String(d) })}
                            className={cn(
                              "inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 sm:h-8",
                              on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.04)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                            )}
                            data-trial-days={d}
                          >
                            {d === 0 ? tt("No trial") : tt("{n} days", { n: d })}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-[12px] text-[#6b7280]">{tt("At least 7 days. A card is taken at sign up and charged when the trial ends, unless they cancel.")}</p>
                  </div>
                ) : null}
              </section>

              <section>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Pricing card")}</p>
                <label htmlFor={`t-d-${tier.id}`} className={label}>
                  {tt("Subheading")}
                </label>
                <input id={`t-d-${tier.id}`} value={s.description} maxLength={500} onChange={(e) => setS({ ...s, description: e.target.value.slice(0, 500) })} placeholder={tt("Who this plan is for")} className={cn(field, "h-11 sm:h-10")} data-tier-description="" />
                <p className={cn(label, "mt-3")}>{tt("What members get")}</p>
                <ul className="space-y-1.5" data-tier-benefits="">
                  {benefitRows.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <input
                        value={b}
                        aria-label={tt("Benefit {n}", { n: i + 1 })}
                        onChange={(e) => setBenefits(benefitRows.map((x, j) => (j === i ? e.target.value.replace(/\n/g, " ").slice(0, 120) : x)))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (benefitRows.length < MAX_BENEFITS) setBenefits([...benefitRows.slice(0, i + 1), "", ...benefitRows.slice(i + 1)])
                          }
                        }}
                        placeholder={i === 0 ? tt("Full community access") : tt("Another thing members get")}
                        className={cn(field, "h-10 flex-1")}
                      />
                      <button type="button" aria-label={tt("Remove")} onClick={() => setBenefits(benefitRows.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#4b5563]">
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                {benefitRows.length < MAX_BENEFITS ? (
                  <button type="button" onClick={() => setBenefits([...benefitRows, ""])} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f4f5f7]" data-tier-benefit-add="">
                    <Plus aria-hidden className="h-4 w-4" />
                    {tt("Add a benefit")}
                  </button>
                ) : null}
              </section>

              {tier.kind === "paid" ? (
                <section>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Also let in buyers of")}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tier.accessProducts.map((p) => (
                      <span key={p.id} className="inline-flex h-10 items-center gap-0.5 rounded-full border border-[#e5e7eb] bg-[#fafbfb] pl-3 text-[12.5px] text-[#1a1a2e] sm:h-8 sm:pr-1">
                        <span className="max-w-[180px] truncate">{p.title}</span>
                        <button type="button" aria-label={tt("Take {title} off", { title: p.title })} onClick={() => void setProduct(p.id, false)} className="grid h-10 w-10 place-items-center rounded-full text-[#6b7280] hover:bg-[#eceef1] sm:h-6 sm:w-6">
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                    {pickable.length ? (
                      <button type="button" onClick={() => setPicking(true)} className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-[#d1d5db] px-3 text-[12.5px] font-medium text-[#4b5563] hover:border-[#9ca3af] sm:h-8">
                        <Plus aria-hidden className="h-3.5 w-3.5" />
                        {tt("Product")}
                      </button>
                    ) : tier.accessProducts.length === 0 ? (
                      <span className="text-[12.5px] text-[#9ca3af]">{tt("No other products yet.")}</span>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {error ? (
                <p role="alert" className="text-[13px] text-[#b91c1c]">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-[#f1f2f4] pt-4">
                {!tier.isDefault && canDefault ? (
                  <button type="button" onClick={() => void patch({ makeDefault: true }, tt("{name} is the default", { name: tier.name }))} className={cn(buttonSecondary, "h-10 border-transparent shadow-none sm:h-8")}>
                    {tt("Make default")}
                  </button>
                ) : null}
                {!tier.isDefault ? (
                  <button type="button" onClick={() => setArchiving(true)} className={cn(buttonSecondary, "h-10 border-transparent shadow-none sm:h-8")}>
                    {tt("Stop selling")}
                  </button>
                ) : null}
                <span className="flex-1" />
                <button type="button" onClick={cancel} className={cn(buttonSecondary, "h-10 px-4 sm:h-8")}>
                  {tt("Cancel")}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={cn(buttonPrimary, "h-10 px-4 sm:h-8")} data-tier-save="">
                  {busy ? tt("Saving") : tt("Save plan")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <Confirm open={archiving} onClose={() => setArchiving(false)} title={tt("Stop selling {name}?", { name: tier.name })} detail={tt("Nobody new can join on it. Members already on it keep it while they pay.")} action="Stop selling" onConfirm={() => { setArchiving(false); void patch({ archived: true }, tt("Not sold any more")) }} />
      <Dialog open={picking} onClose={() => setPicking(false)} title={tt("Also let in buyers of")}>
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

/*
  ROUND AG: ADDING A PLAN IN ONE GO. Free or paid, the name, the price and how often, then (for a subscription) the trial and
  the card's subheading and benefits, so a new plan is ready to sell without opening it again. The plan is made first (POST),
  the rest saved on it straight after (PATCH), each checked by the server as when editing.
*/
function NewTierDialog({ head, open, onClose }: { head: CommunityHead; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [kind, setKind] = React.useState<"paid" | "free">("paid")
  const [name, setName] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [interval, setInterval] = React.useState<PriceInterval>("month")
  const [trial, setTrial] = React.useState(0)
  const [description, setDescription] = React.useState("")
  const [benefits, setBenefits] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const recurring = kind === "paid" && interval !== "once"
  const reset = () => {
    setName("")
    setPrice("")
    setTrial(0)
    setDescription("")
    setBenefits("")
    setError(null)
  }
  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}/tiers`, "POST", { kind, name, price, interval, description: description.trim() || undefined })
    if (!res.ok) {
      setBusy(false)
      return setError(errorText(res.data.error))
    }
    const lines = benefits.split("\n").map((b) => b.trim()).filter(Boolean).slice(0, MAX_BENEFITS)
    const tierId = (res.data as { tierId?: string }).tierId
    const extra: Record<string, unknown> = {}
    if (lines.length) extra.benefits = lines
    if (recurring && trial > 0) extra.trialDays = trial
    if (tierId && Object.keys(extra).length) {
      const more = await send(`/api/app/community/${head.id}/tiers/${tierId}`, "PATCH", extra)
      if (!more.ok) toast(tt("Plan added. Its benefits or trial didn't save: {error}", { error: errorText(more.data.error) }))
    }
    setBusy(false)
    toast(tt("Plan added"))
    reset()
    onClose()
    router.refresh()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tt("New plan")}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !name.trim() || (kind === "paid" && !price)} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-tier-create="">
            {busy ? tt("Adding") : tt("Add plan")}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-new-tier="">
        <Segmented value={kind} onChange={setKind} label={tt("Kind")} className="w-full" options={[{ value: "paid", label: tt("Paid") }, { value: "free", label: "Free" }]} />
        <div>
          <label htmlFor="nt-name" className={label}>
            {tt("Name")}
          </label>
          <input id="nt-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={kind === "paid" ? tt("Inner circle") : tt("Members")} className={cn(field, "h-11 sm:h-10")} />
        </div>
        {kind === "paid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
            <div>
              <label htmlFor="nt-price" className={label}>
                {tt("Price")}
              </label>
              <PriceInput id="nt-price" value={price} onChange={setPrice} placeholder="29" />
            </div>
            <Segmented value={interval} onChange={setInterval} label={tt("How often")} className="w-full sm:w-auto" options={[{ value: "month", label: tt("Monthly") }, { value: "year", label: tt("Yearly") }, { value: "once", label: tt("One time") }]} />
          </div>
        ) : null}
        {recurring ? (
          <div>
            <p id="nt-trial" className={label}>
              {tt("Free trial")}
            </p>
            <div role="radiogroup" aria-labelledby="nt-trial" className="inline-flex flex-wrap gap-1 rounded-xl bg-[#f4f5f7] p-1">
              {TRIAL_CHOICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={trial === d}
                  onClick={() => setTrial(d)}
                  className={cn("inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-8", trial === d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.04)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                >
                  {d === 0 ? tt("No trial") : tt("{n} days", { n: d })}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="nt-sub" className={label}>
            {tt("Subheading")} <span className="font-normal text-[#9ca3af]">{tt("(optional)")}</span>
          </label>
          <input id="nt-sub" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} placeholder={tt("Who this plan is for")} className={cn(field, "h-11 sm:h-10")} />
        </div>
        <div>
          <label htmlFor="nt-benefits" className={label}>
            {tt("What members get, one per line")} <span className="font-normal text-[#9ca3af]">{tt("(optional)")}</span>
          </label>
          <textarea id="nt-benefits" value={benefits} rows={3} onChange={(e) => setBenefits(e.target.value.split("\n").slice(0, MAX_BENEFITS).join("\n"))} placeholder={tt("Full community access\nWeekly live calls")} className={cn(field, "min-h-[84px] resize-y py-2.5 text-[16px] sm:text-[14px]")} />
        </div>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Dialog>
  )
}

/* ── Explore and search ─────────────────────────────────────────────────── */

/*
  HOW PEOPLE FIND IT (round 32: a panel of its own). Explore: the switch (saved as it flips) and the category, the pill it
  is found under there (from Explore's own list, searchable, a sheet on a phone). Search results: the title and the line a
  search engine shows. Who can get in is set once, under Access and prices; it is not a second choice here.
*/
function Discovery({ head, data }: { head: CommunityHead; data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const instant = useInstant(head)
  const [discover, setDiscover] = React.useState(data.discoveryEnabled)
  const start = React.useMemo(() => ({ category: communityCategoryId(data.category) ?? "", seoTitle: data.seoTitle ?? "", seoDescription: data.seoDescription ?? "" }), [data])
  const [s, setS] = React.useState(start)
  const [saved, setSaved] = React.useState(JSON.stringify(start))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(s) !== saved
  const listed = head.visibility === "public"
  const save = async () => {
    const before = JSON.parse(saved) as typeof s
    const body: Record<string, unknown> = {}
    for (const k of Object.keys(s) as (keyof typeof s)[]) if (s[k] !== before[k]) body[k] = s[k]
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(s))
    setError(null)
    toast(tt("Saved"))
    router.refresh()
  }
  return (
    <div className="space-y-4" data-discovery="">
      {data.platformHidden ? <Notice tone="warn">{tt("Storelib took this community out of Explore. Contact support to talk about it.")}</Notice> : null}
      <EditorCard title={tt("Explore")} hint={tt("Where people browse communities on Storelib.")} id="explore">
        <div className="-mb-1">
          <Toggle
            checked={discover}
            onChange={async (v) => {
              setDiscover(v)
              if (!(await instant({ discoveryEnabled: v }, v ? tt("Shown in Explore") : tt("Hidden from Explore")))) setDiscover(!v)
            }}
            title={tt("Show in Explore")}
            hint={listed ? tt("Published public communities can be found in Explore and search.") : tt("Only a community anyone can join is shown. Change that under Access and prices.")}
            disabled={!listed}
          />
        </div>
        <div className="border-t border-[#f1f2f4] pt-4"><div className="max-w-[560px]">
          <label htmlFor="g-category" className={label}>
            {tt("Category")}
          </label>
          {/* The same list as Explore's category pills: the one picked here is the pill it is found under. */}
          <ChoicePicker
            id="g-category"
            name="community-category"
            title={tt("Category")}
            choices={[{ value: "", label: tt("No category") }, ...COMMUNITY_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]}
            value={s.category}
            onChange={(v) => {
              setS({ ...s, category: v })
              setError(null)
            }}
            placeholder={tt("Search categories")}
            fieldLabel={COMMUNITY_CATEGORIES.find((c) => c.id === s.category)?.label ?? tt("No category")}
            fieldMuted={!s.category}
            fieldClassName="h-11 rounded-lg border-[#e1e3e7] sm:h-10"
          />
        </div></div>
      </EditorCard>
      <EditorCard title={tt("Search results")} hint={tt("What Google and other search engines show for the community's page.")} id="search">
        <div>
          <label htmlFor="d-seo-t" className={label}>
            {tt("Search title")}
          </label>
          <input id="d-seo-t" value={s.seoTitle} onChange={(e) => setS({ ...s, seoTitle: e.target.value.slice(0, 200) })} placeholder={head.name} className={cn(field, "h-11 sm:h-10")} />
        </div>
        <div>
          <label htmlFor="d-seo-d" className={label}>
            {tt("Search description")}
          </label>
          <textarea id="d-seo-d" value={s.seoDescription} onChange={(e) => setS({ ...s, seoDescription: e.target.value.slice(0, 500) })} rows={3} placeholder={head.tagline ?? ""} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
        </div>
      </EditorCard>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setS(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

/* ── Notifications ──────────────────────────────────────────────────────── */

const LEVELS: { value: NotifyLevel; title: string; detail: string }[] = [
  { value: "all", get title() { return tt("Everything") }, get detail() { return tt("Posts, comments, reactions, events.") } },
  { value: "important", get title() { return tt("What matters") }, get detail() { return tt("Everything except reactions.") } },
  { value: "mentions", get title() { return tt("Only for me") }, get detail() { return tt("Mentions, replies and messages to you.") } },
  { value: "none", get title() { return tt("Nothing") }, get detail() { return tt("Check in when you like.") } },
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
    toast(tt("Saved"))
  }
  return (
    <div className="space-y-4">
      <EditorCard title={tt("In the community")} hint={tt("What reaches your notifications in this community.")}>
        <ChoiceCards value={n.level} onChange={(v) => void save({ ...n, level: v })} options={LEVELS} label={tt("What you hear about")} columns={2} />
      </EditorCard>
      <EditorCard title={tt("By email")}>
        <div className="divide-y divide-[#f1f2f4]">
          <Toggle checked={n.emailAnnouncements} onChange={(v) => void save({ ...n, emailAnnouncements: v })} title={tt("Announcements")} />
          <Toggle checked={n.emailEvents} onChange={(v) => void save({ ...n, emailEvents: v })} title={tt("Event reminders")} />
        </div>
      </EditorCard>
    </div>
  )
}

/* ── Rules and policies ─────────────────────────────────────────────────── */

function Policies({ head, data }: { head: CommunityHead; data: SettingsData }) {
  return (
    <div className="space-y-4" data-policies="">
      <section className={cn(card)} data-policies-rules="">
        <div className="px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          <h2 className={EDITOR_CARD_TITLE}>{tt("Rules")}</h2>
        </div>
        <RulesEditor head={head} initial={data.rules} onSaved={() => {}} />
      </section>
      {/* The words a post or comment may not use (worker T2), beside the rules they back up; it reads its own list. */}
      <section className={cn(card, "overflow-hidden")} data-policies-words="">
        <BlockedWords communityId={head.id} canEdit={head.can.manage_settings === true} card />
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
    if (!res.ok) return setError({ text: res.data.error === "needs_update" ? tt("This needs a Storelib update first. Try again later.") : errorText(res.data.error), field: res.data.field })
    const next = res.data.policies ? { refundPolicy: res.data.policies.refundPolicy, contactEmail: res.data.policies.contactEmail, contactEmailPublic: res.data.policies.contactEmailPublic } : p
    setP(next)
    setSaved(JSON.stringify(next))
    setError(null)
    toast(tt("Saved"))
    router.refresh()
  }
  return (
    <>
      {!ready ? <Notice tone="info">{tt("The refund policy and contact settings arrive with a Storelib update. They can be saved once it is in.")}</Notice> : null}
      <EditorCard title={tt("Refund policy")} hint={tt("Shown at checkout and on each member's Membership page. Plain words: when you refund, and how to ask.")} id="refund">
        <div>
          <textarea
            id="p-refund"
            aria-label={tt("Refund policy")}
            value={p.refundPolicy}
            disabled={!ready}
            onChange={(e) => {
              setP({ ...p, refundPolicy: e.target.value.slice(0, REFUND_POLICY_MAX) })
              setError(null)
            }}
            rows={5}
            placeholder={tt("Cancel any time and keep access until the end of the period you paid for. Write to me within 14 days of a payment for a full refund.")}
            aria-invalid={error?.field === "refundPolicy" || undefined}
            className={cn(field, "resize-y py-2.5 leading-relaxed", error?.field === "refundPolicy" && "border-[#dc2626]")}
          />
          <p className="mt-1 text-right text-[12px] tabular-nums text-[#9ca3af]">
            {p.refundPolicy.length.toLocaleString(appLocale())} / {REFUND_POLICY_MAX.toLocaleString(appLocale())}
          </p>
        </div>
      </EditorCard>
      <EditorCard title={tt("Contact")} hint={tt("Members write to you from the community. Messages reach your inbox and this email; it stays private unless you show it.")} id="contact">
        <div>
          <label htmlFor="p-email" className={label}>
            {tt("Email for members")}
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
        <Toggle checked={p.contactEmailPublic} disabled={!ready || !p.contactEmail.trim()} onChange={(v) => setP({ ...p, contactEmailPublic: v })} title={tt("Show this email on the community")} hint={tt("On the About page and in Membership, beside the contact form.")} />
      </EditorCard>
      <SaveBar dirty={dirty} busy={busy} error={error?.text ?? null} onSave={() => void save()} onReset={() => { setP(JSON.parse(saved)); setError(null) }} />
    </>
  )
}

/* ── Roles ──────────────────────────────────────────────────────────────── */

const ROLE_COPY = {
  admin: { get title() { return tt("Admins") }, get hint() { return tt("People who help you run the community.") } },
  moderator: { get title() { return tt("Moderators") }, get hint() { return tt("People who keep conversations in order.") } },
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
    if (!res.ok) return setError(res.data.error === "needs_update" ? tt("This needs a Storelib update first. Try again later.") : errorText(res.data.error))
    setSaved(JSON.stringify(r))
    setError(null)
    toast(tt("Roles saved"))
    router.refresh()
  }
  return (
    <div className="space-y-4" data-roles="">
      {!roles.ready ? <Notice tone="info">{tt("Choosing what each role may do arrives with a Storelib update. Until then admins and moderators have the usual permissions shown below.")}</Notice> : null}
      <div className="space-y-4">
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
      <p className="px-1 text-[13px] leading-relaxed text-[#6b7280]">{tt("Prices, payouts, deleting the community and handing it over always stay with you. Nobody can act on someone ranked the same or above them.")}</p>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={() => void save()} onReset={() => { setR(JSON.parse(saved)); setError(null) }} />
    </div>
  )
}

/* ── Advanced ───────────────────────────────────────────────────────────── */

function Advanced({ head, videoProviders }: { head: CommunityHead; videoProviders: ProviderLine[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
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

  return (
    <div className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {/* Round 32: each is its heading, its line and its one button at the right, so the line keeps the card's width. */}
      {!head.archived && head.can.manage_settings ? (
        <EditorCard
          title={head.status === "published" ? tt("Published") : tt("Draft")}
          hint={head.status === "published" ? tt("Anyone allowed can see it and join.") : tt("Only you and your team can see it.")}
          action={
            head.status === "published" ? (
              <button type="button" onClick={() => void run("unpublish", `/api/app/community/${head.id}`, { publish: false }, tt("Back to a draft"))} disabled={busy !== null} className={buttonSecondary}>
                {busy === "unpublish" ? tt("Working") : tt("Unpublish")}
              </button>
            ) : (
              <button type="button" onClick={() => void run("publish", `/api/app/community/${head.id}`, { publish: true }, tt("Published"))} disabled={busy !== null} className={buttonPrimary}>
                {busy === "publish" ? tt("Publishing") : tt("Publish")}
              </button>
            )
          }
        />
      ) : null}
      {videoProviders.length ? (
        <EditorCard title={tt("Videos")} hint={tt("Where replays and videos you upload to this community are kept.")}>
          <VideoProviders providers={videoProviders} />
        </EditorCard>
      ) : null}
      {/* Round 26: one being deleted comes back only through Keep, on the Delete card below; Bring it back was refused there. */}
      {head.deleting ? null : (
        <EditorCard
          title={head.archived ? tt("Archived") : tt("Archive")}
          hint={head.archived ? tt("Members can read it; nobody can post. Bringing it back makes it a draft.") : tt("Keep everything, stop new posts and new members. Members can still read it.")}
          action={
            <button type="button" onClick={() => void run("archive", `/api/app/community/${head.id}/archive`, { archived: !head.archived }, head.archived ? tt("Brought back as a draft") : tt("Archived"))} disabled={busy !== null} className={buttonSecondary}>
              {busy === "archive" ? tt("Working") : head.archived ? tt("Bring it back") : tt("Archive")}
            </button>
          }
        />
      )}
      {/* Round 33: deleting, with members who pay, at the end of what they paid for or now with refunds (./delete-community). */}
      {head.can.delete ? <DeleteCommunity head={head} /> : null}
    </div>
  )
}

/** Round AF: the welcome as a new member will see it, from what is typed now (saved or not). */
function WelcomePreview({ open, onClose, name, w, rules }: { open: boolean; onClose: () => void; name: string; w: { title: string; welcome: string; videoUrl: string; button: string; style: "popup" | "card"; showRules: boolean }; rules: { title: string; body: string }[] }) {
  const embed = w.videoUrl ? welcomeVideoSrc(w.videoUrl) : null
  const heading = w.title.trim() || tt("Welcome to {name}", { name })
  return (
    <MembershipSheet open={open} onClose={onClose} title={heading} marker="welcome-preview" footer={(phone) => [<button key="ok" type="button" onClick={onClose} className={cn("inline-flex h-10 items-center justify-center rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white", phone && "h-11 w-full")}>{w.button.trim() || (rules.length ? tt("I agree, let's go") : tt("Got it"))}</button>]}>
      {w.videoUrl && !embed ? <p className="text-[13px] text-[#b42318]">{tt("Use a YouTube, Vimeo or Loom link for the welcome video.")}</p> : null}
      {embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-[#111113]">
          <iframe src={embed} title={heading} className="h-full w-full" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        </div>
      ) : null}
      {w.welcome.trim() ? <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#4b5563]">{w.welcome}</p> : null}
      {rules.length ? (
        <ol className="mt-4 space-y-2 border-t border-[#f0f1f3] pt-4 text-[14px]">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 shrink-0 font-semibold text-[#9ca3af]">{i + 1}</span>
              <span className="font-medium text-[#1a1a2e]">{r.title}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </MembershipSheet>
  )
}
