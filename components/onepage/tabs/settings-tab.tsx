"use client"

import { useOnePage } from "@/lib/onepage/context"
import { cn } from "@/lib/utils"
import { PillPanels, PillTabs } from "@/components/onepage/pill-tabs"
import { Copy, Check, ChevronDown, Loader2 } from "lucide-react"
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { ProMark, SwitchRow, fieldInput } from "@/components/onepage/editor-kit"
import { SeoPanel } from "@/components/onepage/seo-panel"
import { OnePageDomainRow, OnePageIntegrations } from "@/components/onepage/settings-integrations"
import { SignupDestination } from "@/components/onepage/creator-blocks"
import { getLinksShareUrl, getOnePageDomain } from "@/lib/url-helpers"
import { BADGE_TYPES, checkPageSlug } from "@/lib/onepage/settings-rules"
import { PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, formatPlanPrice, offeredPlan, planDisplayName, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { StatusBadge, card as APP_CARD } from "@/app/app/orders/order-parts"
import { tt } from "@/lib/i18n/text"

/* Words only: a row of stock icons beside six words said nothing the words did not. */
const SETTINGS_SECTIONS = [
  { id: "basic", get label() { return tt("Basic info") } },
  { id: "seo", label: "SEO" },
  { id: "subscribe", get label() { return tt("Subscribe") } },
  { id: "share", get label() { return tt("Share") } },
  { id: "verified", get label() { return tt("Verified badge") } },
  /* What the page is connected to: its analytics and pixels, the email tools its signups go to (components/onepage/settings-integrations). */
  { id: "integrations", get label() { return tt("Integrations") } },
  { id: "billing", get label() { return tt("Billing") } },
] as const
type SectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

/** A section of Settings, as the editor's address names it (#settings-seo). */
export type SettingsSectionId = SectionId
export const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = SETTINGS_SECTIONS.map((section) => section.id)

/*
  THE SECTIONS, AND WHICH ONE IS SHOWN. The choice lives here and not in
  SettingsTab, so a press re-renders the row and the panels' frame and
  nothing else: each section is made by SettingsTab and handed in, the same
  element from one press to the next, so React leaves it alone.

  ONE ROW OF PILLS, AT EVERY WIDTH. "Make the settings not with the sidebar
  there, make it with pill shapes, as settings categories, that I can switch
  between." It was a list down the left on a computer and chips on a phone.
  Now it is one row across the top, the chips of the Theme page's kinds
  (design-tab, data-pill-row="theme-kinds"): the editor's one pill-tab row
  (components/onepage/pill-tabs PillTabs), Storelib's own pills since
  round 11: the chosen one's light fill fades in where it is. It stays at the top of the tab as a section is scrolled, so another
  section is one press away from anywhere. On a phone it scrolls sideways
  with no bar drawn, and the chosen pill is always brought fully into view
  (keepInView), from a press or from the address (#settings-billing).

  The sections are kept, and switch the way Storelib's own settings do: the
  one left goes in the frame the next one lands (lib/ui/pill-switch), each
  scrolled where it was left, and what was typed in one is still there on
  the way back (PillPanels). They sit in one grid cell, and the box under the
  row is as tall as the section shown (PillPanels `fit`): it was as tall as
  the tallest, which left Billing on Pro a card over an empty, scrolling field.
*/
function SettingsSections({ panels, initial, jump, onChange }: { panels: Record<SectionId, ReactNode>; initial: SectionId; jump?: { id: SectionId; n: number } | null; onChange?: (id: SectionId) => void }) {
  const [active, setActive] = useState<SectionId>(initial)
  /* A section asked for from outside (the address, Back) while this is open. */
  const [jumped, setJumped] = useState(jump?.n ?? 0)
  if (jump && jump.n !== jumped) {
    setJumped(jump.n)
    setActive(jump.id)
  }
  const choose = (id: SectionId) => {
    setActive(id)
    onChange?.(id)
  }
  return (
    <div data-settings-sections="">
      {/*
        ROUND 11. "Things are a little bit too shrinked, but I like it." The
        row has the room Storelib's own settings pills have (components/
        library/library-tabs PILL: 40px on a phone, 36px from 640px, 16px in
        from each side of the word, 8px apart) and a little more under it.
        The pills themselves are Storelib's (components/onepage/pill-tabs).

        SEVEN PILLS, NONE CUT OFF. With Integrations there are seven, about
        690px of pills at Storelib's size. From 768px the row is never cut:
        one row where the column holds them (the editor gives Settings 768px,
        720 inside), and where it does not (the column beside the phone
        preview is 364px at 1024 and 620px at 1280) the pills that do not fit
        go on to a second row, the same size, rather than past the edge. On a
        phone it scrolls sideways with no bar, the chosen pill kept in view,
        and the last one reaches the screen's 16px margin like the first: a
        flex row drops its end padding from what scrolls, so a 1px end piece
        (`after:`) plus the 8px gap and the row's own padding hold it.
      */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 bg-white px-4 pb-3 pt-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6" data-settings-pills="">
        <PillTabs
          dataRow="settings-pills"
          label={tt("Settings")}
          items={SETTINGS_SECTIONS}
          value={active}
          onChange={choose}
          keepInView
          className="-mx-4 flex gap-2 overflow-x-auto scroll-px-4 px-4 py-0.5 app-no-scrollbar after:block after:w-px after:shrink-0 after:content-[''] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:after:hidden"
          itemClassName="h-10 px-4 text-[13px] sm:h-9"
        />
      </div>

      {/* fit: the box is the shown section's height, so a short one (Billing on Pro) has no empty field and no scroll under it. */}
      <PillPanels dataPanels="settings" value={active} panels={SETTINGS_SECTIONS.map((section) => ({ id: section.id, node: panels[section.id] }))} fit />
    </div>
  )
}

const BADGE_LABELS: Record<(typeof BADGE_TYPES)[number], string> = {
  get verified_creator() { return tt("Verified Creator") },
  get verified_brand() { return tt("Verified Brand") },
  get verified_business() { return tt("Verified Business") },
  get official_page() { return tt("Official Page") },
  get verified_artist() { return tt("Verified Artist") },
}

const VERIFIED_PATH =
  "M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"

export interface SettingsTabRef {
  saveSeo: () => Promise<void>
  /**
   * Hands every field typed into this tab to the page, so the next save()
   * sends it. Makes no request of its own: the editor's save is the one that
   * writes, and the one that reports whether it worked.
   */
  saveAllSettings: () => Promise<void>
}

export interface SettingsTabProps {
  /** The address the page is shared at, as the editor's Share card gives it. */
  pageUrl?: string
  /** The editor's own Save, which asks about paid features first. */
  onSave?: () => Promise<void> | void
  userPlan?: "free" | "growth" | "pro" | null
  /** The section it opens on (the editor keeps the last one, and reads #settings-seo). */
  section?: SettingsSectionId
  /** A section asked for while the tab is open (Back, the address): `n` counts the asks. */
  jump?: { id: SettingsSectionId; n: number } | null
  /** A section was chosen: the editor writes it into the address. */
  onSectionChange?: (id: SettingsSectionId) => void
}

/*
  ===========================================================================
   EVERY SETTING WRITES TO THE PAGE AS IT CHANGES, AND ONE SAVE SENDS IT
  ===========================================================================
  The name, the switches, the styles, the badge and the search and share
  fields go into the page the moment they change, as every other tab's
  controls do: the phone preview shows them at once, undo takes them back,
  and the header's Save (or the Save at the foot of each section, which is
  the same save) sends them. The server checks each one
  (lib/onepage/settings-rules) and the public page draws what was saved.

  The page address is the exception: it is held here while it is typed and
  only goes to the page on Save, checked the way a username is, so a half
  typed address is never the page's address for a moment.
*/
export const SettingsTab = forwardRef<SettingsTabRef, SettingsTabProps>(function SettingsTab({ pageUrl: givenUrl, onSave, userPlan: givenPlan, section = "basic", jump, onSectionChange }, ref) {
  const { onepage, updateProfile, updateSettings, updateSlug, save, saveState, isDirty, markDirty, getSavedSettings } = useOnePage()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [localSaving, setLocalSaving] = useState(false)

  // The plan, from the editor when it has it, else asked here
  const [ownPlan, setOwnPlan] = useState<"free" | "growth" | "pro" | null>(null)
  useEffect(() => {
    if (givenPlan !== undefined) return
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((data) => setOwnPlan(((data.subscription?.plan_id || data.currentPlan?.id) as "free" | "growth" | "pro" | undefined) || "free"))
      .catch(() => setOwnPlan("free"))
  }, [givenPlan])
  const userPlan = givenPlan !== undefined ? givenPlan : ownPlan
  const planLoading = userPlan === null

  const [pageSlug, setPageSlug] = useState(onepage?.slug || "")

  /**
   * THE ADDRESS IS ONLY REFILLED FROM THE PAGE WHEN THE PAGE'S VALUE MOVED,
   * AND NOBODY IS TYPING IN IT. The field remembers the value it last took
   * from the page (`syncedFromPageRef`). When the page's value is still that,
   * nothing happens. When it has moved (an undo, a save that came back), the
   * field follows it only if what is in the field is still what it took last
   * time; if it differs, somebody typed there, and the typing wins.
   */
  const fromPage = onepage ? { pageSlug: onepage.slug || "" } : null
  const inFields: Record<string, unknown> = { pageSlug }
  const setField: Record<string, (value: any) => void> = { pageSlug: setPageSlug }
  const syncedFromPageRef = useRef<Record<string, unknown> | null>(null)
  const fromPageKey = JSON.stringify(fromPage)
  useEffect(() => {
    if (!fromPage) return
    const synced = syncedFromPageRef.current
    if (!synced) {
      syncedFromPageRef.current = { ...fromPage }
      return
    }
    for (const [key, incoming] of Object.entries(fromPage)) {
      if (Object.is(synced[key], incoming)) continue
      const typedIn = !Object.is(inFields[key], synced[key])
      synced[key] = incoming
      if (!typedIn) setField[key](incoming)
    }
    // Keyed on the page's values for these fields, not on the whole page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPageKey])

  /*
    IS THE ADDRESS FREE? Asked of the server a moment after typing stops
    (app/api/onepage/address, which runs the same check the save runs), and
    only for a name the rules already accept that is not the page's own, so
    the field says "taken" before Save does rather than after.
  */
  const [availability, setAvailability] = useState<{ name: string; state: "checking" | "free" | "taken" | "unknown"; error?: string } | null>(null)
  const typedName = pageSlug.trim().toLowerCase()
  const typedIsNew = !!onepage && typedName !== onepage.slug && checkPageSlug(typedName).ok
  useEffect(() => {
    if (!typedIsNew) {
      setAvailability(null)
      return
    }
    setAvailability({ name: typedName, state: "checking" })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onepage/address?name=${encodeURIComponent(typedName)}`, { signal: controller.signal, cache: "no-store" })
        const body = (await res.json().catch(() => ({}))) as { available?: boolean | null; error?: string }
        if (body.available === true) setAvailability({ name: typedName, state: "free" })
        else if (body.available === false) setAvailability({ name: typedName, state: "taken", error: body.error || tt("That page address is taken") })
        else setAvailability({ name: typedName, state: "unknown" })
      } catch {
        if (!controller.signal.aborted) setAvailability({ name: typedName, state: "unknown" })
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [typedName, typedIsNew])
  const slugTaken = availability?.name === typedName && availability.state === "taken"

  /** Whether a field holds something typed since it last took the page's value. */
  const typedSinceSync = (key: string, value: unknown) => {
    const synced = syncedFromPageRef.current
    return !!synced && !Object.is(synced[key], value)
  }

  /*
    WHAT THE HEADER'S SAVE, AND LEAVING THIS TAB, TAKE FROM HERE: the address,
    when somebody typed a valid one. Everything else is already in the page.
  */
  const handleSaveAllSettings = async () => {
    if (!onepage) return
    const next = pageSlug.trim().toLowerCase()
    if (typedSinceSync("pageSlug", pageSlug) && next !== onepage.slug && checkPageSlug(next).ok && !slugTaken) {
      updateSlug(next)
    }
  }

  useImperativeHandle(ref, () => ({
    saveSeo: handleSaveAllSettings,
    saveAllSettings: handleSaveAllSettings,
  }))

  if (!onepage) return null

  const settings = onepage.settings as Record<string, any>
  const pageUrl = givenUrl || getLinksShareUrl(onepage.slug)
  const slugVerdict = pageSlug === onepage.slug ? null : checkPageSlug(pageSlug)

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* A browser that refuses the clipboard: the address is on screen to copy by hand. */
    }
  }

  /**
   * Every Save in this tab is the editor's own, which asks about paid
   * features before it sends anything (onSave), and the words beside it are
   * the page's own save state, so they say what the header says.
   */
  const runSave = async () => {
    setLocalSaving(true)
    try {
      await handleSaveAllSettings()
      /* "All changes saved" comes from the page's save state below, only after a save that worked. */
      if (onSave) await onSave()
      else await save()
    } finally {
      setLocalSaving(false)
    }
  }

  const slugPending = pageSlug !== onepage.slug

  /*
    EACH SECTION'S SAVE IS FOR ITS OWN CHANGES. The row at the foot of every
    section read the whole page's "unsaved": a word typed in SEO lit Save and
    "Unsaved changes" in all five (scripts/check-onepage-audit.mjs). Each
    section now compares its own fields with the page as last saved
    (getSavedSettings). Pressing it still sends the whole page, as the
    header's Save does.
  */
  const saved = getSavedSettings()
  const changed = (keys: (k: string) => boolean) => {
    if (!saved) return isDirty
    const now = settings as Record<string, unknown>
    const names = new Set([...Object.keys(now), ...Object.keys(saved.settings)].filter(keys))
    for (const k of names) if (JSON.stringify(now[k] ?? null) !== JSON.stringify(saved.settings[k] ?? null)) return true
    return false
  }
  const sectionUnsaved: Record<"basic" | "seo" | "subscribe" | "share" | "verified", boolean> = {
    basic: slugPending || (saved ? (onepage.title || "") !== saved.title || onepage.slug !== saved.slug : isDirty),
    seo: changed((k) => k.startsWith("seo_") || k.startsWith("social_")) || (!!saved && JSON.stringify((onepage as { share_image_mode?: unknown }).share_image_mode ?? null) !== JSON.stringify(saved.share_image_mode)),
    subscribe: changed((k) => k.startsWith("subscribe_")),
    share: changed((k) => k.startsWith("share_")),
    verified: changed((k) => k.startsWith("verified_badge")),
  }

  const saveRow = (section: keyof typeof sectionUnsaved) => {
    const unsaved = sectionUnsaved[section]
    const saving = (localSaving || saveState === "saving") && unsaved
    const failed = saveState === "error" && unsaved
    const status = saving ? tt("Saving…") : failed ? tt("Not saved. Try again") : unsaved ? tt("Unsaved changes") : tt("All changes saved")
    return (
      <div className="flex items-center justify-between gap-3 border-t border-[#f0f0f2] pt-4" data-settings-save={section}>
        <span
          className={cn("min-w-0 truncate text-[13px]", failed ? "text-red-600" : unsaved || saving ? "text-[#b45309]" : "text-[#6b7280]")}
          role="status"
          aria-live="polite"
          data-settings-status=""
        >
          {status}
        </span>
        <button
          type="button"
          onClick={runSave}
          disabled={saving || (!unsaved && !failed) || (section === "basic" && ((slugVerdict !== null && !slugVerdict.ok) || slugTaken))}
          className={cn(primaryDepth, "h-10 gap-2 rounded-lg px-4 text-[14px] disabled:cursor-not-allowed disabled:opacity-40")}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {failed ? tt("Try again") : tt("Save")}
        </button>
      </div>
    )
  }

  const title = (text: string, sub?: string) => (
    <div>
      <h3 className="text-[17px] font-bold text-[#1a1a2e]">{text}</h3>
      {sub ? <p className="mt-1 text-[14px] leading-snug text-[#6b7280]">{sub}</p> : null}
    </div>
  )

  const onePageDomain = getOnePageDomain()

  const renderBasicInfo = () => (
    <div className="space-y-6" data-settings-basic="">
      {title("Basic info")}

      <div className="space-y-1.5">
        <label htmlFor="op-page-name" className="text-[13px] font-medium text-[#374151]">
          {tt("Page name")}
        </label>
        {/* Written to the page as it is typed: the preview, the header on the page and the search title follow it. */}
        <input
          id="op-page-name"
          data-settings-name=""
          value={onepage.title || ""}
          maxLength={80}
          onChange={(e) => updateProfile({ title: e.target.value })}
          placeholder={tt("Your name or brand")}
          className={fieldInput}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="op-page-slug" className="text-[13px] font-medium text-[#374151]">
          {tt("Page address")}
        </label>
        <div
          className={cn(
            "flex h-12 items-center overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]",
            (slugVerdict && !slugVerdict.ok) || slugTaken ? "border-red-400 focus-within:border-red-500" : "border-[#e3e4e8] focus-within:border-[#1a1a2e]",
          )}
        >
          <span className="shrink-0 pl-4 text-[16px] text-[#9ca3af] sm:text-[15px]">{onePageDomain}/</span>
          <input
            id="op-page-slug"
            data-settings-slug=""
            value={pageSlug}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              /* The header's Save lights up for it, as it does for any edit. */
              markDirty()
            }}
            placeholder="your-name"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[15px]"
          />
        </div>
        {slugVerdict && !slugVerdict.ok ? (
          <p className="text-[12.5px] text-red-600" role="alert" data-slug-error="">
            {slugVerdict.error}
          </p>
        ) : slugTaken ? (
          <p className="text-[12.5px] text-red-600" role="alert" data-slug-error="">
            {availability?.error}
          </p>
        ) : slugPending && availability?.name === typedName && availability.state === "checking" ? (
          <p className="text-[12.5px] text-[#6b7280]" data-slug-checking="">{tt("Checking {onePageDomain}/{typedName}", { onePageDomain, typedName })}</p>
        ) : slugPending ? (
          <p className="text-[12.5px] text-[#6b7280]" data-slug-free={availability?.state === "free" ? "" : undefined}>
            {availability?.state === "free" ? tt("{onePageDomain}/{typedName} is free. ", { onePageDomain, typedName }) : ""}{tt("Your page moves to this address when you save. The old one stops working.")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-[#6b7280]" title={pageUrl}>
          {pageUrl.replace(/^https?:\/\//, "")}
        </p>
        <button type="button" onClick={copyUrl} className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[13px]")}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? tt("Copied") : tt("Copy link")}
        </button>
      </div>

      {/* The page's own domain (Settings › Domains), and how to connect one. */}
      <OnePageDomainRow />

      {saveRow("basic")}
    </div>
  )

  const renderToggleSection = (kind: "subscribe" | "share") => {
    const enabledKey = kind === "subscribe" ? "subscribe_enabled" : "share_enabled"
    const enabled = settings[enabledKey] !== false
    return (
      <div className="space-y-6" data-settings-toggle={kind}>
        {title(kind === "subscribe" ? tt("Subscribe") : tt("Share"))}
        <SwitchRow
          label={kind === "subscribe" ? tt("Subscribe button") : tt("Share button")}
          description={kind === "subscribe" ? tt("A bell at the top right of your page. Visitors leave their email.") : tt("At the top left of your page. Visitors copy the link or send it on.")}
          checked={enabled}
          onChange={(on) => updateSettings({ [enabledKey]: on } as never)}
        />
        {/* Round 40: its look (glass, white or black) is the page's design, so it is set in Design › Layout, the same field as before (components/onepage/themes/layout-section). */}
        {enabled ? <p className="text-[12.5px] text-[#6b7280]" data-settings-style-moved="">{tt("Its style is in Design, under Layout.")}</p> : null}
        {kind === "subscribe" && enabled ? (
          <p className="text-[12.5px] text-[#6b7280]">{tt("Turning it off keeps the subscribers you have.")}</p>
        ) : null}
        {/* Where the bell's and every signup form's addresses go: Emails › Subscribers, and Klaviyo or Omnisend when connected. */}
        {kind === "subscribe" ? <SignupDestination /> : null}
        {saveRow(kind)}
      </div>
    )
  }

  const hasPaidPlan = userPlan === "growth" || userPlan === "pro"

  const renderVerified = () => {
    const enabled = settings.verified_badge_enabled === true
    const type = (BADGE_TYPES as readonly string[]).includes(settings.verified_badge_type) ? (settings.verified_badge_type as (typeof BADGE_TYPES)[number]) : "verified_creator"
    return (
      <div className="space-y-6" data-settings-verified="">
        {title(tt("Verified badge"))}
        <SwitchRow
          label={tt("Verified badge")}
          description={hasPaidPlan ? tt("A check mark beside your name") : tt("A check mark beside your name. Saving it needs a paid plan")}
          checked={enabled}
          onChange={(on) => updateSettings({ verified_badge_enabled: on, ...(on ? { verified_badge_type: type } : {}) } as never)}
          extra={<ProMark title={hasPaidPlan ? tt("Included in your plan") : "Pro"} />}
        />
        {enabled ? (
          <div className="space-y-1.5">
            <label htmlFor="op-badge-type" className="text-[13px] font-medium text-[#374151]">
              {tt("What it says")}
            </label>
            {/* The phone's own picker on a phone, a list on a computer: a native select, with the editor's box around it. */}
            <div className="relative">
              <select
                id="op-badge-type"
                data-settings-badge=""
                value={type}
                onChange={(e) => updateSettings({ verified_badge_type: e.target.value } as never)}
                className={cn(fieldInput, "cursor-pointer appearance-none pr-11")}
              >
                {BADGE_TYPES.map((id) => (
                  <option key={id} value={id}>
                    {BADGE_LABELS[id]}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            </div>
            <div className="flex items-center gap-1.5 pt-2 text-[15px] font-semibold text-[#1a1a2e]" data-badge-preview="">
              <span className="truncate">{onepage.title || tt("Your name")}</span>
              <svg viewBox="0 0 22 22" className="h-4 w-4 shrink-0 text-[#1d9bf0]" fill="currentColor" aria-label={BADGE_LABELS[type]}>
                <path d={VERIFIED_PATH} />
              </svg>
              <span className="ml-1 text-[12.5px] font-normal text-[#6b7280]">{BADGE_LABELS[type]}</span>
            </div>
          </div>
        ) : null}
        {saveRow("verified")}
      </div>
    )
  }

  // Internal "growth" is sold as Pro; the earlier "pro" plan is also Pro.
  // Each plan is described by its fee, from the same table that charges it.
  const currentPlanKey: PlanId = userPlan === "growth" || userPlan === "pro" ? userPlan : "free"
  const proOffer = offeredPlan(PRO_CHECKOUT_PLAN_ID)

  /*
    BILLING IS /app's BILLING (round 11, "make the Billing / plans more Storelib UI adapted"). The plan is the card
    /app/settings Billing opens on (components/app/billing/billing-page-client, data-billing-plan): "Current plan", the
    plan's name with its status, the price large, the fee per sale on a hairline row, and the way to manage it. On Free
    the two plan cards follow, the very ones Billing and the plans page draw (components/billing/plan-cards), Pro first
    on a phone, its button the upgrade page's.
  */
  const planPrice = formatPlanPrice(currentPlanKey === "free" ? 0 : PRO_PRICE_CENTS)
  const renderBilling = () => (
    <div className="space-y-6" data-settings-billing="">
      {title(tt("Billing"))}
      <div data-settings-plan="" className={cn(APP_CARD, "px-5 py-5 sm:px-6")}>
        {planLoading ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-4 w-24 animate-pulse rounded bg-[#f3f4f6]" />
            <div className="h-7 w-32 animate-pulse rounded bg-[#f3f4f6]" />
            <div className="h-9 w-20 animate-pulse rounded bg-[#f3f4f6]" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#6b7280]">{tt("Current plan")}</p>
                <p className="mt-1 text-[22px] font-bold leading-7 text-[#1a1a2e]">{planDisplayName(currentPlanKey)}</p>
              </div>
              {hasPaidPlan ? <StatusBadge tone="success">{tt("Active")}</StatusBadge> : null}
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-[34px] font-bold leading-none tracking-[-0.02em] text-[#1a1a2e] tabular-nums">{planPrice}</span>
              {currentPlanKey !== "free" ? <span className="text-[14px] text-[#6b7280]">{tt("/month")}</span> : null}
            </div>
            <dl className="mt-4 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[14px]">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[#6b7280]">{tt("Fee per sale")}</dt>
                <dd className="text-right font-medium text-[#1a1a2e] tabular-nums">{getFeeDescription(currentPlanKey).replace(/ per sale$/, "")}</dd>
              </div>
            </dl>
            <div className="mt-5 flex">
              <Link href="/app/settings/billing" className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[14px] no-underline max-sm:flex-1")}>
                {tt("Billing and invoices")}
              </Link>
            </div>
          </>
        )}
      </div>

      {/* The plans: only for Free. Pro is the top plan on sale. */}
      {!planLoading && !hasPaidPlan ? (
        <div data-settings-plans="">
          <PlanCards
            compact
            lead={PRO_CHECKOUT_PLAN_ID}
            labels={{ free: tt("Current plan") }}
            actions={{
              free: { label: tt("Current plan"), settled: true, current: true },
              [PRO_CHECKOUT_PLAN_ID]: { label: tt("Upgrade to {name}", { name: proOffer.name }), onClick: () => router.push("/app/settings/billing/upgrade") },
            } as Record<OfferedPlanId, PlanCardAction>}
          />
        </div>
      ) : null}
    </div>
  )

  /*
    Each section in its own card, made here and handed to SettingsSections, which only shows one. ROUND 11: the card is
    Storelib's (app/app/orders/order-parts `card`, the one /app's Settings and Billing are drawn on), with the room its
    cards have (24px in from a computer's edge, 20px on a phone).
  */
  const card = (id: SectionId, body: ReactNode) => (
    <div data-settings-section={id} className={cn(APP_CARD, "p-5 sm:p-6")}>
      {body}
    </div>
  )

  return (
    <>
      <SettingsSections
        initial={section}
        jump={jump}
        onChange={onSectionChange}
        panels={{
          basic: card("basic", renderBasicInfo()),
          seo: card("seo", <SeoPanel pageUrl={pageUrl} footer={saveRow("seo")} />),
          subscribe: card("subscribe", renderToggleSection("subscribe")),
          share: card("share", renderToggleSection("share")),
          verified: card("verified", renderVerified()),
          integrations: card("integrations", <OnePageIntegrations />),
          /* Billing is drawn as /app's Billing is: its title on the page, the plan on its own card, the plan cards under it (no card in a card). */
          billing: <div data-settings-section="billing">{renderBilling()}</div>,
        }}
      />
    </>
  )
})
