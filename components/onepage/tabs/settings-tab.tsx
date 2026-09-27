"use client"

import { useOnePage } from "@/lib/onepage/context"
import { cn } from "@/lib/utils"
import { ChipFill } from "@/components/onepage/choice-marks"
import { Copy, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { ProMark, Segmented, SwitchRow, fieldInput } from "@/components/onepage/editor-kit"
import { SeoPanel } from "@/components/onepage/seo-panel"
import { getLinksShareUrl, getOnePageDomain } from "@/lib/url-helpers"
import { BADGE_TYPES, buttonStyleOf, checkPageSlug, type ButtonStyle } from "@/lib/onepage/settings-rules"
import { PRO_CHECKOUT_PLAN_ID, offeredPlan, planDisplayName, planHighlights, type PlanId } from "@/lib/billing/plans"

/* Words only: a row of stock icons beside six words said nothing the words did not. */
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic info" },
  { id: "seo", label: "SEO" },
  { id: "subscribe", label: "Subscribe" },
  { id: "share", label: "Share" },
  { id: "verified", label: "Verified badge" },
  { id: "billing", label: "Billing" },
]

const BADGE_LABELS: Record<(typeof BADGE_TYPES)[number], string> = {
  verified_creator: "Verified Creator",
  verified_brand: "Verified Brand",
  verified_business: "Verified Business",
  official_page: "Official Page",
  verified_artist: "Verified Artist",
}

const STYLE_OPTIONS: readonly { id: ButtonStyle; label: string }[] = [
  { id: "glass", label: "Glass" },
  { id: "white", label: "White" },
  { id: "black", label: "Black" },
]

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
export const SettingsTab = forwardRef<SettingsTabRef, SettingsTabProps>(function SettingsTab({ pageUrl: givenUrl, onSave, userPlan: givenPlan }, ref) {
  const { onepage, updateProfile, updateSettings, updateSlug, save, saveState, isDirty, markDirty } = useOnePage()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState("basic")
  /*
    A SECTION CHANGES AS WEBSITE SETTINGS' TABS DO. It swapped in a single
    frame. Now the section is one keyed element that settles in tone
    (app/globals.css .settings-panel: 0.2 to 1 over 200ms, opacity alone,
    nothing moves), put on only once a section has been pressed, so opening
    Settings is simply there.
  */
  const [sectionEntrance, setSectionEntrance] = useState(false)
  const chooseSection = (id: string) => {
    if (id === activeSection) return
    setSectionEntrance(true)
    setActiveSection(id)
  }
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
        else if (body.available === false) setAvailability({ name: typedName, state: "taken", error: body.error || "That page address is taken" })
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

  const saving = localSaving || saveState === "saving"
  const slugPending = pageSlug !== onepage.slug
  const unsaved = isDirty || slugPending
  const failed = saveState === "error" && unsaved
  const status = saving ? "Saving…" : failed ? "Not saved. Try again" : unsaved ? "Unsaved changes" : "All changes saved"

  const saveRow = (
    <div className="flex items-center justify-between gap-3 border-t border-[#f0f0f2] pt-4" data-settings-save="">
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
        disabled={saving || (!unsaved && !failed) || (slugVerdict !== null && !slugVerdict.ok) || slugTaken}
        className={cn(primaryDepth, "h-10 gap-2 rounded-lg px-4 text-[14px] disabled:cursor-not-allowed disabled:opacity-40")}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {failed ? "Try again" : "Save"}
      </button>
    </div>
  )

  const title = (text: string, sub?: string) => (
    <div>
      <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{text}</h3>
      {sub ? <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{sub}</p> : null}
    </div>
  )

  // Sidebar navigation item component
  const NavItem = ({ section }: { section: (typeof SETTINGS_SECTIONS)[0] }) => {
    const isActive = activeSection === section.id
    return (
      <button
        onClick={() => chooseSection(section.id)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "w-full flex items-center px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors text-left cursor-pointer",
          isActive
            ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-[#e5e7eb]"
            : "text-[#6b7280] hover:bg-white/70 hover:text-[#1a1a2e]",
        )}
      >
        {section.label}
      </button>
    )
  }

  const onePageDomain = getOnePageDomain()

  const renderBasicInfo = () => (
    <div className="space-y-5" data-settings-basic="">
      {title("Basic info")}

      <div className="space-y-1.5">
        <label htmlFor="op-page-name" className="text-[13px] font-medium text-[#374151]">
          Page name
        </label>
        {/* Written to the page as it is typed: the preview, the header on the page and the search title follow it. */}
        <input
          id="op-page-name"
          data-settings-name=""
          value={onepage.title || ""}
          maxLength={80}
          onChange={(e) => updateProfile({ title: e.target.value })}
          placeholder="Your name or brand"
          className={fieldInput}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="op-page-slug" className="text-[13px] font-medium text-[#374151]">
          Page address
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
          <p className="text-[12.5px] text-[#6b7280]" data-slug-checking="">Checking {onePageDomain}/{typedName}</p>
        ) : slugPending ? (
          <p className="text-[12.5px] text-[#6b7280]" data-slug-free={availability?.state === "free" ? "" : undefined}>
            {availability?.state === "free" ? `${onePageDomain}/${typedName} is free. ` : ""}Your page moves to this address when you save. The old one stops working.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-[#6b7280]" title={pageUrl}>
          {pageUrl.replace(/^https?:\/\//, "")}
        </p>
        <button type="button" onClick={copyUrl} className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[13px]")}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      {saveRow}
    </div>
  )

  const renderToggleSection = (kind: "subscribe" | "share") => {
    const enabledKey = kind === "subscribe" ? "subscribe_enabled" : "share_enabled"
    const styleKey = kind === "subscribe" ? "subscribe_style" : "share_style"
    const enabled = settings[enabledKey] !== false
    const style = buttonStyleOf(settings[styleKey], kind === "subscribe" ? "glass" : "white")
    return (
      <div className="space-y-5" data-settings-toggle={kind}>
        {title(kind === "subscribe" ? "Subscribe" : "Share")}
        <SwitchRow
          label={kind === "subscribe" ? "Subscribe button" : "Share button"}
          description={kind === "subscribe" ? "A bell at the top right of your page. Visitors leave their email." : "At the top left of your page. Visitors copy the link or send it on."}
          checked={enabled}
          onChange={(on) => updateSettings({ [enabledKey]: on } as never)}
        />
        {enabled ? (
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[#374151]">Button style</p>
            <Segmented
              label="Button style"
              value={style}
              options={STYLE_OPTIONS.map((o) => ({ ...o }))}
              onChange={(id) => updateSettings({ [styleKey]: id } as never)}
            />
          </div>
        ) : null}
        {kind === "subscribe" && enabled ? (
          <p className="text-[12.5px] text-[#6b7280]">Turning it off keeps the subscribers you have.</p>
        ) : null}
        {saveRow}
      </div>
    )
  }

  const hasPaidPlan = userPlan === "growth" || userPlan === "pro"

  const renderVerified = () => {
    const enabled = settings.verified_badge_enabled === true
    const type = (BADGE_TYPES as readonly string[]).includes(settings.verified_badge_type) ? (settings.verified_badge_type as (typeof BADGE_TYPES)[number]) : "verified_creator"
    return (
      <div className="space-y-5" data-settings-verified="">
        {title("Verified badge")}
        <SwitchRow
          label="Verified badge"
          description={hasPaidPlan ? "A check mark beside your name" : "A check mark beside your name. Saving it needs a paid plan"}
          checked={enabled}
          onChange={(on) => updateSettings({ verified_badge_enabled: on, ...(on ? { verified_badge_type: type } : {}) } as never)}
          extra={<ProMark title={hasPaidPlan ? "Included in your plan" : "Pro"} />}
        />
        {enabled ? (
          <div className="space-y-1.5">
            <label htmlFor="op-badge-type" className="text-[13px] font-medium text-[#374151]">
              What it says
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
              <span className="truncate">{onepage.title || "Your name"}</span>
              <svg viewBox="0 0 22 22" className="h-4 w-4 shrink-0 text-[#1d9bf0]" fill="currentColor" aria-label={BADGE_LABELS[type]}>
                <path d={VERIFIED_PATH} />
              </svg>
              <span className="ml-1 text-[12.5px] font-normal text-[#6b7280]">{BADGE_LABELS[type]}</span>
            </div>
          </div>
        ) : null}
        {saveRow}
      </div>
    )
  }

  // Internal "growth" is sold as Pro; the earlier "pro" plan is also Pro.
  // Each plan is described by its fee, from the same table that charges it.
  const currentPlanKey: PlanId = userPlan === "growth" || userPlan === "pro" ? userPlan : "free"
  const proOffer = offeredPlan(PRO_CHECKOUT_PLAN_ID)

  const renderBilling = () => (
    <div className="space-y-5" data-settings-billing="">
      {title("Billing")}
      <div className="rounded-xl border border-[#e5e7eb] px-4 py-3.5">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Your plan</p>
        {planLoading ? (
          <div className="mt-2 h-6 w-24 animate-pulse rounded bg-[#f3f4f6]" />
        ) : (
          <>
            <p className="mt-1 text-[18px] font-semibold text-[#1a1a2e]">{planDisplayName(currentPlanKey)}</p>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">{planHighlights(currentPlanKey)[0]}</p>
          </>
        )}
      </div>

      {/* Pro offer: only for Free. Pro is the top plan on sale. */}
      {!planLoading && !hasPaidPlan && (
        <div className="rounded-xl border border-[#e5e7eb] px-4 py-3.5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{proOffer.name} plan</p>
            <p className="text-[14px] text-[#4b5563]">
              {proOffer.price}
              {proOffer.period}
            </p>
          </div>
          <ul className="mb-4 space-y-2">
            {proOffer.features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-[13.5px] text-[#4b5563]">
                <Check className="h-3.5 w-3.5 text-[#1a1a2e]" />
                {feature}
              </li>
            ))}
          </ul>
          <button type="button" className={cn(primaryDepth, "h-10 w-full rounded-lg text-[14px]")} onClick={() => router.push("/app/settings/billing/upgrade")}>
            Upgrade to {proOffer.name}
          </button>
        </div>
      )}

      <Link
        href="/app/settings/billing"
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#e5e7eb] px-4 py-3 text-[14px] text-[#1a1a2e] transition-colors hover:bg-[#f9fafb]"
      >
        Billing and invoices
        <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
      </Link>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar Navigation - Hidden on mobile, shown inline */}
      <div className="hidden md:block w-48 flex-shrink-0">
        <nav className="space-y-1 sticky top-0">
          {SETTINGS_SECTIONS.map((section) => (
            <NavItem key={section.id} section={section} />
          ))}
        </nav>
      </div>

      {/* Mobile Navigation - Horizontal scroll */}
      <div className="md:hidden -mx-4 px-4 mb-4">
        <div className="flex gap-2 overflow-x-auto p-px pb-1 no-scrollbar">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => chooseSection(section.id)}
              aria-pressed={activeSection === section.id}
              className="relative px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer bg-white ring-1 ring-[#e5e7eb] [-webkit-tap-highlight-color:transparent]"
            >
              {/* The chosen chip's dark fill fades in as the last one's fades out (components/onepage/choice-marks). */}
              <ChipFill on={activeSection === section.id} />
              <span className={cn("relative transition-colors duration-[180ms]", activeSection === section.id ? "text-white" : "text-[#4b5563]")}>{section.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        <div key={activeSection} data-settings-section={activeSection} className={cn("bg-white rounded-xl border border-gray-200 p-5", sectionEntrance && "settings-panel")}>
          {activeSection === "basic" && renderBasicInfo()}
          {activeSection === "seo" && <SeoPanel pageUrl={pageUrl} footer={saveRow} />}
          {activeSection === "subscribe" && renderToggleSection("subscribe")}
          {activeSection === "share" && renderToggleSection("share")}
          {activeSection === "verified" && renderVerified()}
          {activeSection === "billing" && renderBilling()}
        </div>
      </div>

      {/* Add custom scrollbar hiding CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  )
})
