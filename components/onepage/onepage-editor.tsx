"use client"

import { ProfileImage } from "@/components/onepage/profile-image"

import { useOnePage, OnePageProvider } from "@/lib/onepage/context"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { PosterVideo } from "./poster-video"
import { videoPoster } from "@/lib/onepage/poster-video"
import { croppedMediaStyle } from "@/lib/onepage/media-crop"
import { ownOpen, useOwnMarker } from "@/lib/analytics/own-site"
import { bottomAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"
import { PhonePreview, MobilePreviewContent } from "./live-preview"
import { PREVIEW_PICK_EVENT } from "@/lib/onepage/preview-select"
import { InstagramBioShare } from "./instagram-bio-share"
import { DesignTab } from "./tabs/design-tab"
import { LinksTab } from "./tabs/links-tab"
import { ProductsTab } from "./tabs/products-tab"
import { SETTINGS_SECTION_IDS, SettingsTab, type SettingsSectionId, type SettingsTabRef } from "./tabs/settings-tab"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ExternalLink,
  Copy,
  Loader2,
  Check,
  Palette,
  Link2,
  ShoppingBag,
  Undo2,
  Redo2,
  Save,
  Eye,
  Edit3,
  Globe,
  Zap,
  AlertCircle,
  ArrowLeft,
  Share,
  SlidersHorizontal,
} from "lucide-react"
import * as ReactModule from "react"
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, startTransition } from "react"
import { useRouter } from "next/navigation"
import { BuilderLoader, useLinger } from "@/components/website-builder/builder-loader"
import { LEAVING_SEEN_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { backThen } from "@/lib/navigation/go-back"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { isPlainClick } from "@/lib/ui/app-navigation"
import { setLeaveGuard } from "@/lib/ui/leave-guard"
import { HtmlClass } from "@/components/platform/html-class"
import { hapticTap } from "@/lib/native-bridge"
import { iconDepth, primaryDepth } from "@/components/ui/depth-button"
import type { OnePage } from "@/lib/onepage/types"
import { getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { creatorPageHostFrom } from "@/lib/custom-domains/client"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OnboardingModal } from "./onboarding-modal"
import { usePillPress, usePillSlide } from "./pill-tabs"
import { createClient } from "@/lib/supabase/client"
import { SaveNotification, ToastSpot } from "@/components/ui/save-notification"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { AvatarMark } from "@/components/app/app-avatar"
import { tt } from "@/lib/i18n/text"
import { formatDateTime } from "@/lib/i18n/format"
import { EditorPartBoundary } from "@/components/onepage/editor-part-boundary"
import { fetchBillingSubscription, planIdOf } from "@/lib/billing/plan-client"
import { OnePageTeamProvider, useOnePageTeam, useTeamProductsStore, type OnePageTeam } from "@/lib/onepage/team-context"

/* React 19.2's <Activity>. The installed types are 19.0's, which do not name it yet; the runtime has it. */
const Activity = (ReactModule as unknown as {
  Activity: React.ComponentType<{ mode: "visible" | "hidden"; children?: React.ReactNode }>
}).Activity

// Settings Filter Icon SVG Component
const SettingsFilterIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 512 512" className={className} fill="currentColor">
    <path d="M0 416c0 17.7 14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384c-17.7 0-32 14.3-32 32zm128 0a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM320 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm32-80c-32.8 0-61 19.7-73.3 48L32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48zM192 128a32 32 0 1 1 0-64 32 32 0 1 1 0 64zm73.3-64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48L32 64C14.3 64 0 78.3 0 96s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 128c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 64z" />
  </svg>
)

interface OnePageEditorProps {
  initialOnePage: OnePage
  /** A team member editing the store's page (lib/onepage/team-context); absent for the owner. */
  team?: OnePageTeam | null
}

export function OnePageEditor({ initialOnePage, team = null }: OnePageEditorProps) {
  useTeamProductsStore(team)
  return (
    <OnePageTeamProvider team={team}>
      <OnePageProvider initialOnePage={initialOnePage} key={`${initialOnePage?.owner_id}:${initialOnePage?.id}`}>
        {/* Every toast in the editor, its tabs' included, sits clear of its bars and its preview (components/ui/save-notification ToastSpot). */}
        <ToastSpot spot="onepage-editor">
          <EditorLayout />
        </ToastSpot>
      </OnePageProvider>
    </OnePageTeamProvider>
  )
}

type TabType = "design" | "links" | "products" | "settings"
/** The order the tabs sit in, which says which side a new one comes in from. */
const TAB_ORDER: TabType[] = ["links", "design", "products", "settings"]
/** Built once and kept (see ONE TAB TO THE NEXT below); Settings is built each time. */
const KEPT_TABS: TabType[] = ["links", "design", "products"]
/**
 * A SWITCH IS A SHORT FADE AND NOTHING ELSE. "Direct, not so much
 * animation, but smooth, normal." The new tab slid 12px over 220ms as it
 * faded, and the old one slid the other way under it. Now the new tab only
 * fades in, over 120ms, over the old one, which stays whole under it until
 * it is covered and is then hidden: no slide, no frame of neither.
 */
const TAB_FADE_IN_MS = 120
const TAB_FADE_EASE = "cubic-bezier(0, 0, 0.2, 1)"
/**
 * The phone bar's chosen button takes its dark fill in place over this long,
 * on opacity alone, and its icon and word cross from grey to white with it.
 */
const TAB_SELECT_MS = 140
/* The phone bar's icon and word: white on the chosen button's ink, grey on the others. */
const PHONE_TAB_INK_ON = "#ffffff"
const PHONE_TAB_INK_OFF = "#4b5563"

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** Leaving was answered but the editor is still here this long after: it holds Back again. */
const LEAVE_REVIVE_MS = 12_000

/** The way out of the editor: the app's home, and where a back that goes nowhere lands. */
const EXIT_HREF = "/app"

/** The loader on the way in waits for the preview this long at most. */
const ARRIVE_CAP_MS = 2500
/** Round AT: on a phone the Preview's frame is warmed once the editor is idle, or after this long at the latest. */
const PREVIEW_WARM_MS = 2500

/*
  THE EDITOR'S TWO QUESTIONS, ON THE APP'S OWN SHEET ON A PHONE.

  Both used to be a centred dialog pushed to the bottom by hand, with the drag
  written into React state on every touchmove (a re-render per finger event)
  and a close that simply unmounted, so a tap on a button made the sheet
  vanish rather than slide away. Under 768px they are now the shared
  BottomSheet (components/ui/bottom-sheet.tsx): dragged on the compositor,
  let go with the finger's real speed, and closed with the same slide down
  every other sheet in /app has. From 768px they stay a centred dialog.
*/
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const check = () => setIsPhone(mq.matches)
    check()
    mq.addEventListener("change", check)
    return () => mq.removeEventListener("change", check)
  }, [])
  return isPhone
}

function EditorQuestion({
  open,
  onClose,
  label,
  desktopWidth,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  desktopWidth: string
  children: React.ReactNode
}) {
  const isPhone = useIsPhone()
  if (isPhone) {
    return (
      /* Kept, as Share is: built while the page is idle, so the tap on the back arrow only slides it up. */
      <BottomSheet isOpen={open} onClose={onClose} label={label} hideFrom="md" keepMounted>
        {children}
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={cn("p-0 gap-0 overflow-hidden w-[calc(100%-32px)] max-w-sm rounded-2xl mx-auto", desktopWidth)}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/**
 * WORK ON THIS DEVICE THAT NEVER REACHED A SAVE, ON A PAGE SAVED ELSEWHERE
 * SINCE (round AU, lib/onepage/local-draft). Neither copy is thrown away
 * unasked: the creator picks. This device's changes come back unsaved, so
 * the next Save is still theirs to press, and undo takes them away again.
 * Only a choice answers it: a stray tap outside never throws either away.
 */
function DraftQuestionDialog({ at, onAnswer }: { at: number; onAnswer: (useDevice: boolean) => void }) {
  return (
    <EditorQuestion open onClose={() => {}} label={tt("Unsaved changes on this device")} desktopWidth="md:max-w-[380px]">
      <div className="px-6 pt-5 pb-5 text-center md:pt-6" data-draft-question="">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e] mb-1.5">{tt("Unsaved changes on this device")}</h2>
        <p className="text-sm text-[#6b7280]">
          {tt("You made changes here on {when} that were never saved. The page has been saved somewhere else since.", { when: formatDateTime(at) })}
        </p>
      </div>
      <div className="px-5 pb-5 space-y-2.5 md:px-6 md:pb-6">
        <button
          type="button"
          onClick={() => onAnswer(true)}
          data-draft-use-device=""
          className="w-full h-12 px-4 bg-[#1a1a2e] text-white font-medium rounded-xl hover:bg-[#2a2a40] active:bg-[#0f0f1c] transition-colors flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.25)]"
        >
          {tt("Use the changes from this device")}
        </button>
        <button
          type="button"
          onClick={() => onAnswer(false)}
          data-draft-keep-saved=""
          className="w-full h-12 px-4 bg-white text-[#1a1a2e] font-medium rounded-xl border border-[#e5e7eb] hover:bg-[#fafafa] transition-colors"
        >
          {tt("Keep the saved page")}
        </button>
      </div>
    </EditorQuestion>
  )
}

function UnsavedChangesDialog({
  open,
  onClose,
  onSave,
  onDiscard,
  isSaving
}: {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDiscard: () => void
  isSaving: boolean
}) {
  return (
    <EditorQuestion open={open} onClose={onClose} label={tt("Save changes?")} desktopWidth="md:max-w-[340px]">
      <div className="px-6 pt-5 pb-5 text-center md:pt-6">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e] mb-1.5">{tt("Save changes?")}</h2>
        <p className="text-sm text-[#6b7280]">
          {tt("Once saved, they'll appear on your OnePage.")}
        </p>
      </div>

      <div className="px-5 pb-5 space-y-2.5 md:px-6 md:pb-6">
        <button
          onClick={onSave}
          disabled={isSaving}
          data-unsaved-save=""
          className="w-full h-12 px-4 bg-[#1a1a2e] text-white font-medium rounded-xl hover:bg-[#2a2a40] active:bg-[#0f0f1c] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.25)]"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {tt("Saving")}
            </>
          ) : (
            tt("Save changes")
          )}
        </button>

        <button
          onClick={onDiscard}
          disabled={isSaving}
          data-unsaved-discard=""
          className="w-full h-12 px-4 bg-white text-[#c4290c] font-medium rounded-xl border border-[#e5e7eb] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
        >
          {tt("Discard changes")}
        </button>

        <button
          onClick={onClose}
          disabled={isSaving}
          className="w-full h-11 px-4 text-[#6b7280] font-medium rounded-xl hover:bg-[#f3f4f6] hover:text-[#1a1a2e] transition-colors disabled:opacity-50"
        >
          {tt("Keep editing")}
        </button>
      </div>
    </EditorQuestion>
  )
}

function ProUpgradeDialog({
  open,
  onClose,
  onUpgrade,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean
  onClose: () => void
  onUpgrade: () => void
  onDiscard: () => void
  onKeepEditing: () => void
}) {
  return (
    <EditorQuestion open={open} onClose={onClose} label={tt("Upgrade to Grow?")} desktopWidth="md:max-w-[420px]">
      <div className="px-6 pt-5 pb-5 text-center md:pt-6">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e] mb-1.5">{tt("Upgrade to Grow?")}</h2>
        <p className="text-sm text-[#6b7280] leading-relaxed">
          {tt("The verified badge and hiding Storelib branding are part of Grow. Upgrade to save these changes.")}
        </p>
      </div>

      <div className="px-5 pb-5 space-y-2.5 md:px-6 md:pb-6">
        <button
          onClick={onUpgrade}
          className={cn(primaryDepth, "w-full h-12 px-5 rounded-xl gap-2")}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          {tt("Upgrade to Grow")}
        </button>

        <button
          onClick={onDiscard}
          className="w-full h-12 px-4 bg-white text-[#374151] font-medium rounded-xl border border-[#e5e7eb] hover:bg-[#fafafa] transition-colors"
        >
          {tt("Discard changes")}
        </button>

        <button
          onClick={onKeepEditing}
          className="w-full h-11 px-4 text-[#6b7280] font-medium rounded-xl hover:bg-[#f3f4f6] hover:text-[#1a1a2e] transition-colors"
        >
          {tt("Keep editing")}
        </button>
      </div>
    </EditorQuestion>
  )
}

/** What the share sheet shows: the page as a card, its address to copy, and the ways out. */
function ShareOnePage({
  open,
  onClose,
  onepage,
  pageUrl,
  copied,
  onCopy,
  onOpen,
  connectedDomain,
  userPlan,
}: {
  open: boolean
  onClose: () => void
  onepage: OnePage
  pageUrl: string
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  connectedDomain: string | null
  userPlan: "free" | "growth" | "pro" | null
}) {
  const isPhone = useIsPhone()
  const theme = onepage.theme
  /* The card wears the page's own wallpaper; a white one gets a light grey so it reads as a card. */
  const bg = theme.background_type === "gradient" && theme.background_gradient
    ? theme.background_gradient
    : (() => {
        const c = (theme.background_color || "#1f2937").toLowerCase()
        return ["#ffffff", "#fff", "white", "#fafafa", "#f9fafb", "#f5f5f5"].includes(c) ? "#f3f4f6" : c
      })()
  const hasPro = userPlan === "growth" || userPlan === "pro"
  const address = pageUrl.replace(/^https?:\/\//, "")
  const row = "flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 text-left text-[14px] font-medium text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"

  const body = (
    <div className="space-y-3" data-share-onepage="">
      <div className="rounded-2xl p-5 text-center" style={{ background: bg }}>
        {onepage.avatar_video_url ? (
          /*
            Round 42: the sheet is built ahead and kept on a phone, so an
            autoplaying video here played the whole time, hidden, beside the
            preview's own. It plays only while the sheet is open, from its
            first frame (components/onepage/poster-video).
          */
          <span className="relative mx-auto mb-2 block h-14 w-14 overflow-hidden rounded-full" data-share-avatar="">
            <PosterVideo
              src={onepage.avatar_video_url}
              poster={videoPoster(onepage.avatar_video_crop)}
              fallback={onePageImageSrc(onepage.avatar_url, 64) || null}
              alt={onepage.title || ""}
              mediaStyle={croppedMediaStyle(onepage.avatar_video_crop) as ReactModule.CSSProperties | undefined}
              still={!open}
            />
          </span>
        ) : onepage.avatar_url ? (
          <ProfileImage
            src={onePageImageSrc(onepage.avatar_url, 64)}
            name={onepage.title || ""}
            alt={onepage.title}
            className="mx-auto mb-2 h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.text_color}20` }}>
            <span className="text-xl font-semibold" style={{ color: theme.text_color }}>{onepage.title?.trim() ? onepage.title.charAt(0).toUpperCase() : <AvatarMark name="" size={48} />}</span>
          </div>
        )}
        <h3 className="text-[15px] font-semibold" style={{ color: theme.text_color }}>{onepage.title || tt("Your name")}</h3>
        <p className="mt-0.5 text-[12.5px]" style={{ color: `${theme.text_color}99` }}>/{onepage.slug}</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f7f7f8] py-1.5 pl-4 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{address}</span>
        <button type="button" onClick={onCopy} data-share-copy="" className={cn(primaryDepth, "h-9 gap-1.5 rounded-lg px-3.5 text-[13px]")}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? tt("Copied") : tt("Copy")}
        </button>
      </div>

      <button type="button" onClick={onOpen} className={row}>
        <ExternalLink className="h-4 w-4 shrink-0 text-[#6b7280]" />
        {tt("Open in a new tab")}
      </button>

      {/* Round 17, the owner: "get rid of the Share to Instagram story option from the share your OnePage modal". */}

      {/* Round AR: the steps for an Instagram bio, opening here under the row (components/onepage/instagram-bio-share). */}
      <InstagramBioShare slug={onepage.slug} published={onepage.status === "published" || !!onepage.published_at} phone={isPhone} rowClassName={row} />

      {!connectedDomain && (
        <button type="button" onClick={() => { window.location.href = "/app/settings?tab=domains" }} className={cn(row, "justify-between")}>
          <span className="flex items-center gap-3">
            <Globe className="h-4 w-4 shrink-0 text-[#6b7280]" />
            {tt("Add a custom domain")}
          </span>
          <span title={hasPro ? tt("Included in your plan") : tt("Custom domains are part of Grow")} className="rounded-full bg-[#f1f2f4] px-2 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">
            {hasPro ? tt("Included") : "Grow"}
          </span>
        </button>
      )}
    </div>
  )

  if (isPhone) {
    return (
      /* Built while the page is idle and kept, as the notifications sheet is: the tap only slides it up. */
      <BottomSheet isOpen={open} onClose={onClose} title={tt("Share your OnePage")} hideFrom="md" keepMounted>
        <div className="px-4 pb-3 pt-3">{body}</div>
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent overlayClassName="backdrop-blur-[3px]" className="w-[calc(100%-32px)] max-w-[420px] gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-[#eef0f2] px-5 py-4">
          <DialogTitle className="text-center text-[17px] font-semibold text-[#1a1a2e]">{tt("Share your OnePage")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-5">{body}</div>
      </DialogContent>
    </Dialog>
  )
}

/*
  THE PILL UNDER THE CHOSEN TAB SLIDES, ON A COMPUTER. The segmented row in
  the header has one pill under the words, moved by transform from under the
  last tab to under the next one (scaled from the last one's size on the
  way), on the compositor, started from the press. It is the pill every
  pill-tab row in the editor uses (./pill-tabs usePillSlide, usePillPress).
  With no tab of the row chosen (Settings) it fades away where it is. The
  phone's bar has no pill: its buttons change in place (THE PHONE'S TAB BAR
  below).
*/
/**
 * A tab's icon and name, twice: in the colour it has when chosen and in the
 * colour it has when not, one over the other. A switch fades one into the
 * other, rather than changing the colour of the words in a single frame.
 */
function TabFace({ on, onClass, offClass, className, children }: { on: boolean; onClass: string; offClass: string; className?: string; children: React.ReactNode }) {
  const face = "col-start-1 row-start-1 flex min-w-0 max-w-full items-center justify-center transition-opacity ease-out motion-reduce:transition-none"
  return (
    <span className={cn("relative z-[2] grid min-w-0", className)}>
      <span data-tab-face="off" className={cn(face, offClass)} style={{ opacity: on ? 0 : 1, transitionDuration: `${TAB_SELECT_MS}ms` }}>{children}</span>
      <span data-tab-face="on" aria-hidden className={cn(face, onClass)} style={{ opacity: on ? 1 : 0, transitionDuration: `${TAB_SELECT_MS}ms` }}>{children}</span>
    </span>
  )
}

function EditorLayout() {
  const {
    onepage,
    saveState,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    save,
    saveError,
    updateSettings,
    retrying,
    draftQuestion,
    answerDraftQuestion,
    draftRestoredAt,
    discardUnsaved,
  } = useOnePage()

  /*
    THE WAY OUT, THE SAME AS THE CREATOR PAGE AND THE WEBSITE BUILDER. The
    dark glass with "Going back" goes up, stays long enough to be read, and
    then /app is pushed, with a ceiling so a slow route cannot hang it (see
    components/app/creator-page-workspace.tsx, which this copies on purpose).
    `leavingRef` also stands the beforeunload prompt down: a creator who
    already chose Save or Discard has answered it.
  */
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  /* Puts the Back hold on or takes it off for what the page holds now (set below, by the hold itself). */
  const refreshLeaveGuard = useRef<() => void>(() => {})
  const cancelCeiling = useRef<(() => void) | null>(null)
  const leave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaveGuard(null)
    setLeaving(true)
    cancelCeiling.current?.()
    const start = window.setTimeout(() => {
      cancelCeiling.current = navigateWithCeiling(
        () => router.push(EXIT_HREF),
        () => window.location.assign(EXIT_HREF),
        (cb, ms) => window.setTimeout(cb, ms),
        (id) => window.clearTimeout(id),
      )
    }, LEAVING_SEEN_MS)
    cancelCeiling.current = () => window.clearTimeout(start)
  }, [router])
  useEffect(() => {
    if (!leaving) return
    const revive = () => {
      leavingRef.current = false
      setLeaving(false)
      refreshLeaveGuard.current()
    }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) revive() }
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("popstate", revive)
    const watchdog = window.setTimeout(revive, 6000)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("popstate", revive)
      window.clearTimeout(watchdog)
      cancelCeiling.current?.()
    }
  }, [leaving])
  useEffect(() => {
    try {
      router.prefetch("/app")
    } catch {
      /* A router that will not prefetch still navigates. */
    }
  }, [router])

  /*
    THE WAY IN, AS THE CREATOR PAGE COMES IN. Its editor puts the bar up at
    once and the light loader over the canvas, holds the loader until the
    page in its frame has loaded, and fades it off a page that is already
    whole (components/app/creator-page-workspace.tsx). This does the same:
    the bar at once, the loader over what is under it until it is drawn,
    then 320ms off it.

    Drawn means the preview's frame has painted the page with its fonts
    (components/onepage/live-preview) where the preview is on screen, from
    768px, and the editor's own fonts where it is not. It used to be one
    animation frame: the loader went before the preview had even started
    loading, and the phone beside the editor filled in afterwards, a second
    arrival after the first. Never longer than ARRIVE_CAP_MS: a preview that
    is slow to load arrives on its own fade instead of holding the editor.
  */
  const [arrived, setArrived] = useState(false)
  const [previewDrawn, setPreviewDrawn] = useState(false)
  useEffect(() => {
    if (arrived) return
    let cancelled = false
    const wide = window.matchMedia("(min-width: 768px)").matches
    const cap = window.setTimeout(() => { if (!cancelled) setArrived(true) }, ARRIVE_CAP_MS)
    if (!wide || previewDrawn) {
      const fonts = document.fonts?.ready ?? Promise.resolve()
      fonts.then(() => requestAnimationFrame(() => { if (!cancelled) setArrived(true) }))
    }
    return () => {
      cancelled = true
      window.clearTimeout(cap)
    }
  }, [arrived, previewDrawn])
  const loaderVisible = useLinger(!arrived, 320)

  // --- Hash-based tab navigation ---
  /*
    #links, #design, #products and #settings open their tab, as they always
    have. #settings-seo (any section's id) opens Settings on that section,
    and choosing a section writes it there, so a reload or a shared link
    comes back to it.
  */
  const fromHash = (raw: string): { tab: TabType; section: SettingsSectionId | null } => {
    const hash = raw.replace("#", "")
    if (hash === "links" || hash === "design" || hash === "products" || hash === "settings") return { tab: hash, section: null }
    const section = hash.startsWith("settings-") ? hash.slice("settings-".length) : ""
    if ((SETTINGS_SECTION_IDS as readonly string[]).includes(section)) return { tab: "settings", section: section as SettingsSectionId }
    return { tab: "links", section: null }
  }
  const getInitialTab = (): TabType => {
    if (typeof window === "undefined") return "links"
    return fromHash(window.location.hash).tab
  }
  /* The section Settings opens on: the one asked for in the address, then the last one chosen, kept while Settings is closed. */
  const settingsSection = useRef<SettingsSectionId>(
    (typeof window !== "undefined" && fromHash(window.location.hash).section) || "basic",
  )
  /* A section asked for by Back or Forward, or a #settings-… typed into the address, while Settings is already open: it switches to it. */
  const [settingsJump, setSettingsJump] = useState<{ id: SettingsSectionId; n: number } | null>(null)
  const onSettingsSection = useCallback((id: SettingsSectionId) => {
    settingsSection.current = id
    if (typeof window === "undefined" || !window.location.hash.startsWith("#settings")) return
    window.history.replaceState(window.history.state, "", id === "basic" ? "#settings" : `#settings-${id}`)
  }, [])
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab)
  /*
    ONE TAB TO THE NEXT WITHOUT A BLANK FRAME, AND BACK TO WHERE IT WAS.

    Each tab was mounted when it was chosen and thrown away when another
    was, in one scroll box they shared: the new tab was built on the tap
    (50 to 180ms on a phone, measured with the CPU slowed four times), drawn
    in a single frame over the old one, and opened wherever the last tab
    had been scrolled to, clamped to its own height; coming back to Links
    after Design put it at the top.

    Now Links, Design and Products are each built once, in the page's idle
    time after it arrives, and kept: each in its own scroll box, so each has
    its own place, and a hidden one sits in React's <Activity mode="hidden">,
    so an edit made on one tab does not re-render the other two while they
    are out of sight (they catch up at the lowest priority). A switch shows
    the new one over the old: the new fades in over 120ms, on the
    compositor, over the old one, which is hidden once it is covered. Settings
    is still built each time it is opened, because what was typed there is
    handed to the page on the way out and a kept copy would keep it too.
  */
  /*
    The bars answer the tap at once; the panels follow once that has been
    drawn, in a render React can put aside for the next tap: the pill is
    already moving (on the compositor) while the tab it opens is being
    drawn, as the shared sheet starts its slide before the page hears of it.
  */
  const [panelTab, setPanelTab] = useState(activeTab)
  useEffect(() => {
    if (panelTab === activeTab) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setPanelTab(activeTab)), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [activeTab, panelTab])
  const [panels, setPanels] = useState<{ tab: TabType; leaving: TabType | null; built: TabType[] }>(() => {
    const first = getInitialTab()
    return { tab: first, leaving: null, built: first === "settings" ? [] : [first] }
  })
  /* The tab the panels show changed: the one it replaces stays drawn, leaving, in this same render. */
  if (panels.tab !== panelTab) {
    setPanels({
      tab: panelTab,
      leaving: panels.tab,
      built: panelTab === "settings" || panels.built.includes(panelTab) ? panels.built : [...panels.built, panelTab],
    })
  }
  const panelRefs = useRef<Partial<Record<TabType, HTMLDivElement | null>>>({})
  const scrollMemory = useRef<Partial<Record<TabType, number>>>({})
  const shownTabRef = useRef(panels.tab)
  const activeTabRef = useRef(activeTab)
  /* The computer row's pill slide, started from the press (see ./pill-tabs usePillSlide). */
  const pillMoves = useRef<((id: string) => void)[]>([])
  const showTab = useCallback((tab: TabType) => {
    if (activeTabRef.current === tab) return
    activeTabRef.current = tab
    setActiveTab(tab)
  }, [])

  const handleTabChange = useCallback((tab: TabType) => {
    /*
      LEAVING SETTINGS TAKES WHAT WAS TYPED THERE ALONG. The page name, the
      address and the SEO text are held by the Settings tab until a Save, and
      the tab is unmounted when another one is chosen, so a title typed there
      and then saved from the Links tab was simply gone while the header said
      "Changes saved". Handing the typed fields to the page first means the
      next Save sends them. Only fields that were actually typed in are
      handed over, so passing through the tab changes nothing.
    */
    if (tab !== "settings") {
      settingsTabRef.current?.saveAllSettings().catch(() => {})
    }
    pillMoves.current.forEach((slide) => slide(tab))
    showTab(tab)
    /*
      THE TAB IS IN THE ADDRESS, NOT IN THE HISTORY. Each tab used to push an
      entry of its own, `pushState(null, "", "#settings")`: Back walked back
      through every tab before it left the editor, and the null state went
      through the router's own history patch, which filled it in from
      whatever the entry before it held and started a navigation of its own
      to the new address on every click. Now the tab replaces the address of
      the entry the editor is on, with that entry's own state, which carries
      the router's marker, so the router lets it through and does nothing:
      one entry for the editor, whatever tab it is on, and a reload keeps the
      tab.
    */
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", tab === "settings" && settingsSection.current !== "basic" ? `#settings-${settingsSection.current}` : `#${tab}`)
      refreshLeaveGuard.current()
    }
  }, [])

  /* Round AR: a block clicked in the phone preview opens in the Links list (lib/onepage/preview-select). */
  useEffect(() => {
    const onPick = () => {
      if (activeTabRef.current !== "links") handleTabChange("links")
    }
    window.addEventListener(PREVIEW_PICK_EVENT, onPick)
    return () => window.removeEventListener(PREVIEW_PICK_EVENT, onPick)
  }, [handleTabChange])

  // Sync tab when browser back/forward changes the hash
  useEffect(() => {
    const onPopState = () => {
      const { tab, section } = fromHash(window.location.hash)
      if (section) {
        settingsSection.current = section
        setSettingsJump((j) => ({ id: section, n: (j?.n ?? 0) + 1 }))
      }
      showTab(tab)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    The switch itself, after React has drawn both tabs and before the
    browser paints them: the new tab back at its own place, then the two
    moves. The old tab is let go, and hidden, when its fade has finished.
  */
  useLayoutEffect(() => {
    const to = panels.tab
    const from = shownTabRef.current === to ? null : shownTabRef.current
    shownTabRef.current = to
    const incoming = panelRefs.current[to]
    if (!incoming || !from) return
    const outgoing = panelRefs.current[from]
    /* Where the tab being left was scrolled to: hidden, its box has nothing in it to keep a place. */
    if (outgoing) scrollMemory.current[from] = outgoing.scrollTop
    incoming.scrollTop = scrollMemory.current[to] ?? 0
    const letGo = () => setPanels((p) => (p.leaving === from ? { ...p, leaving: null } : p))
    /* A tab still fading from the switch before this one goes at once. */
    for (const t of TAB_ORDER) if (t !== to && t !== from) panelRefs.current[t]?.getAnimations().forEach((a) => a.cancel())
    incoming.getAnimations().forEach((a) => a.cancel())
    outgoing?.getAnimations().forEach((a) => a.cancel())
    if (!outgoing || typeof incoming.animate !== "function" || reducedMotion()) {
      letGo()
      return
    }
    /* One animation: the new tab's white fades in over the old tab, which is let go once it is covered. */
    const fade = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TAB_FADE_IN_MS, easing: TAB_FADE_EASE })
    fade.onfinish = letGo
    /* However the fade ends, or if a background tab draws no frames, the old tab goes. */
    const timer = window.setTimeout(letGo, TAB_FADE_IN_MS + 200)
    return () => window.clearTimeout(timer)
  }, [panels.tab])

  /* A tab that has finished leaving is at rest: nothing of its fade is left on it. */
  useLayoutEffect(() => {
    for (const t of TAB_ORDER) {
      if (t === panels.tab || t === panels.leaving) continue
      panelRefs.current[t]?.getAnimations().forEach((a) => a.cancel())
    }
  }, [panels.leaving, panels.tab])

  const [copied, setCopied] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

  /*
    BUILT WHILE NOTHING ELSE IS HAPPENING. Once the editor has arrived and
    the page is idle, the tabs not yet opened are built, hidden, at a
    priority any tap overtakes, so even the first switch to each is only the
    fade. Opened before then, a tab is built on the tap, as before.
  */
  useEffect(() => {
    if (!arrived) return
    const build = () => startTransition(() => setPanels((p) => (KEPT_TABS.every((t) => p.built.includes(t)) ? p : { ...p, built: [...p.built, ...KEPT_TABS.filter((t) => !p.built.includes(t))] })))
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      /* 1.5s at most: a tab pressed in the first seconds was built on the press (895 elements, a 70ms frame on a phone). */
      const id = w.requestIdleCallback(build, { timeout: 1500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(build, 1500)
    return () => window.clearTimeout(t)
  }, [arrived])

  /* The preview on a phone takes the editor's place: the tab it covered comes back where it was. */
  const togglePreview = () => {
    const box = panelRefs.current[shownTabRef.current]
    if (box && !showMobilePreview) scrollMemory.current[shownTabRef.current] = box.scrollTop
    setShowMobilePreview(!showMobilePreview)
  }
  useLayoutEffect(() => {
    if (showMobilePreview) return
    const box = panelRefs.current[shownTabRef.current]
    const at = scrollMemory.current[shownTabRef.current]
    if (box && at) box.scrollTop = at
  }, [showMobilePreview])
  /* The phone's Preview, once opened, is kept: the next look is the page as it was left, with nothing to load. */
  const [mobilePreviewKept, setMobilePreviewKept] = useState(false)
  useEffect(() => {
    if (showMobilePreview) setMobilePreviewKept(true)
  }, [showMobilePreview])
  /*
    ROUND AT, THE OWNER: "make sure that the preview and edit when I click on the one page editor is more smooth and
    clean." Three things made the switch blink:
      - the first Preview loaded its frame on the tap: the page's colour, empty, until the frame had drawn;
      - Edit came back from display:none, so the whole tab was laid out again on the tap;
      - the tab bar was unmounted and mounted again each way.
    Now, once the editor has arrived and a phone's main thread is idle, the preview's frame is loaded and drawn, unseen,
    at its real size (PREVIEW_WARM_MS at the latest), and a press on Preview starts it at once if that has not happened
    yet. Preview and Edit are then two layers that are both laid out: a switch only changes which one is visible and
    which one is inert, so nothing is laid out, loaded or mounted on the tap (scripts/check-onepage-at2.mjs times it).
  */
  useEffect(() => {
    if (!arrived || mobilePreviewKept) return
    if (!window.matchMedia("(max-width: 767px)").matches) return
    const warm = () => setMobilePreviewKept(true)
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: PREVIEW_WARM_MS })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(warm, PREVIEW_WARM_MS)
    return () => window.clearTimeout(t)
  }, [arrived, mobilePreviewKept])
  /* Widened past a phone with Preview up (a tablet turned): the editor is the editor again, with its phone beside it. */
  useEffect(() => {
    if (!showMobilePreview) return
    const mq = window.matchMedia("(min-width: 768px)")
    const back = () => {
      if (mq.matches) setShowMobilePreview(false)
    }
    back()
    mq.addEventListener("change", back)
    return () => mq.removeEventListener("change", back)
  }, [showMobilePreview])
  const [showLinkModal, setShowLinkModal] = useState(false)
  /* Round AT: Share your OnePage ticks in the iOS and Android apps (lib/native-bridge hapticTap); a browser feels nothing. */
  const openShare = () => {
    if (isNativeApp()) hapticTap("light")
    setShowLinkModal(true)
  }
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isSavingForNav, setIsSavingForNav] = useState(false)
  const [showProUpgradeDialog, setShowProUpgradeDialog] = useState(false)
  const [saveToastSequence, setSaveToastSequence] = useState(0)
  const [historyToastSequence, setHistoryToastSequence] = useState(0)
  const [historyToastMessage, setHistoryToastMessage] = useState("Updated")
  const [saveFailure, setSaveFailure] = useState<{ message: string; sequence: number }>({ message: "", sequence: 0 })
  const showSaveFailure = useCallback((message: string) => {
    setSaveFailure((prev) => ({ message, sequence: prev.sequence + 1 }))
  }, [])

  /*
    EVERY FAILED SAVE IS SAID OUT LOUD, WHOEVER ASKED FOR IT. The header's
    Save, a Save button inside Settings and the onboarding's closing save all
    go through the same save(), and it reports a failure through saveError.
    Watching that here puts one toast on screen for all of them, instead of
    each caller having to remember to.
  */
  useEffect(() => {
    if (saveError) showSaveFailure(tt(saveError.message))
  }, [saveError, showSaveFailure])

  // =====================================================
  // ONBOARDING STATE - Fetch directly from database
  // This ensures it works across ALL devices for the same account
  // =====================================================
  
  const [showOnboarding, setShowOnboarding] = useState(false) // Start with false, check DB
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)
  const [userPlan, setUserPlan] = useState<"free" | "growth" | "pro" | null>(null)
  /*
    WHETHER THE PLAN WAS READ, NOT GUESSED. A plan request that failed (or has
    not come back yet) is shown as Free, as before, but it never stops a Save:
    a paying creator with the Storelib badge hidden was asked to upgrade on
    every Save while /api/billing/subscription was slow or down, and could not
    save at all. The server is the one that refuses a paid setting on a free
    plan (app/api/onepage PUT, which asks the plan itself).
  */
  const [planConfirmed, setPlanConfirmed] = useState(false)

  /* A team member: the store owner's plan and domain came with the page (lib/onepage/team-context); the two reads below are the member's own account's. */
  const team = useOnePageTeam()

  // Fetch custom domain and user plan on mount
  useEffect(() => {
    if (team) {
      setConnectedDomain(team.domain)
      setUserPlan(team.plan)
      setPlanConfirmed(true)
      return
    }
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        /* The OnePage is at /links on the creator page's domain. */
        const host = creatorPageHostFrom(data)
        if (host) setConnectedDomain(host)
      })
      .catch(() => {})

    /* Shared with Settings and the billing tab (lib/billing/plan-client.ts). currentPlan first: it is the plan in force
       (an admin's override included), where a cancelled subscription's plan_id is the plan that ended. */
    void fetchBillingSubscription().then((data) => {
      const id = planIdOf(data)
      if (id) setPlanConfirmed(true)
      setUserPlan((plan) => id ?? plan ?? "free")
    })
  }, [team])

  const [onboardingChecked, setOnboardingChecked] = useState(false) // Track if we've checked
  const completedThisSessionRef = useRef(false)
  const settingsTabRef = useRef<SettingsTabRef>(null)
  
  // Check onboarding status directly from database on mount
  useEffect(() => {
    if (!onepage?.id || onboardingChecked || completedThisSessionRef.current) return
    /* The first visit's wizard sets up the owner's own account (their name, photo, store): never for a team member. */
    if (team) {
      setShowOnboarding(false)
      setOnboardingChecked(true)
      return
    }
    /*
      THE PAGE ALREADY SAYS. The server read the whole row a moment ago
      (app/app/onepage/page.tsx), onboarding_completed with it. Asking the
      database again from the browser was a second round trip on every open,
      and when that one failed (a flaky connection, a slow phone) and this
      browser had no note of its own, the first visit's full screen wizard
      came up over an editor somebody had set up long ago. Asked only when
      the row did not say.
    */
    if ((onepage as { onboarding_completed?: boolean | null }).onboarding_completed === true) {
      setShowOnboarding(false)
      setOnboardingChecked(true)
      return
    }
    
    const checkOnboardingStatus = async () => {
      const supabase = createClient()
      
      console.log("[OnePageEditor] Checking onboarding status from database...")
      console.log("[OnePageEditor] onepage.id:", onepage.id)
      
      // Fetch fresh onboarding_completed status directly from database
      const { data, error } = await supabase
        .from("onepages")
        .select("onboarding_completed")
        .eq("id", onepage.id)
        .single()
      
      if (error) {
        console.error("[OnePageEditor] Error fetching onboarding status:", error)
        // On error, check localStorage as fallback
        if (typeof window !== "undefined") {
          const localDone = localStorage.getItem(`onepage_onboarding_done_${onepage.id}`)
          if (localDone === "true") {
            console.log("[OnePageEditor] localStorage says completed")
            setShowOnboarding(false)
          } else {
            console.log("[OnePageEditor] No completion found, showing onboarding")
            setShowOnboarding(true)
          }
        }
      } else {
        console.log("[OnePageEditor] Database onboarding_completed:", data?.onboarding_completed)
        
        if (data?.onboarding_completed === true) {
          // Completed in database - don't show onboarding
          setShowOnboarding(false)
          // Sync localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
          }
        } else {
          // Not completed in database - check localStorage as backup
          if (typeof window !== "undefined") {
            const localDone = localStorage.getItem(`onepage_onboarding_done_${onepage.id}`)
            if (localDone === "true") {
              console.log("[OnePageEditor] localStorage override - not showing onboarding")
              setShowOnboarding(false)
            } else {
              console.log("[OnePageEditor] Not completed - showing onboarding")
              setShowOnboarding(true)
            }
          } else {
            setShowOnboarding(true)
          }
        }
      }
      
      setOnboardingChecked(true)
    }
    
    checkOnboardingStatus()
  }, [onepage?.id, onboardingChecked, team])

  // Check if user has Pro features enabled that require Pro plan
  const hasProFeaturesEnabled = useCallback(() => {
    if (!onepage) return false
    // Hide branding is a Pro feature - check if show_branding is false (meaning branding is hidden)
    // Verified badge is also a Pro feature
    return onepage.settings.show_branding === false || (onepage.settings as any).verified_badge_enabled === true
  }, [onepage])

  // Handle save with Pro plan check
  const handleSaveWithProCheck = useCallback(async () => {
    const userHasPro = !planConfirmed || userPlan === "growth" || userPlan === "pro"

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowProUpgradeDialog(true)
      return
    }

    // If on the settings tab, hand what was typed there to the page first, so
    // the save below sends it (basic info, SEO, subscribe, share, verified badge)
    if (activeTab === "settings") {
      try {
        await settingsTabRef.current?.saveAllSettings()
      } catch (error) {
        console.error("Settings could not be prepared for saving:", error)
        showSaveFailure(tt("Couldn't save. Try again"))
        return
      }
    }

    /*
      "CHANGES SAVED" ONLY WHEN THEY WERE. This used to toast success after
      any save at all, including one that failed and one that never ran
      because another was in flight. save() now answers, and a failure has
      already put its own toast up through saveError.
    */
    const result = await save()
    if (result.ok) setSaveToastSequence((prev) => prev + 1)
  }, [hasProFeaturesEnabled, save, activeTab, userPlan, planConfirmed, showSaveFailure])

  // Handle upgrading to Pro — auto-saves non-pro changes, then sends user to pricing page
  const handleUpgradeToPro = useCallback(async () => {
    setShowProUpgradeDialog(false)
    // Auto-save current changes (non-pro changes will be persisted)
    // This prevents the user from losing work when they navigate away.
    // If the save failed, stay: leaving now would throw the work away, and the
    // failure is already on screen.
    const result = await save()
    /*
      A refusal (400) is the paid setting itself on a free plan: the save can
      only work after the upgrade, so it is no reason to stay. The work is
      kept on this device (lib/onepage/local-draft, written as the page goes)
      and put back when they come back. Any other failure stays, as before:
      leaving would throw the work away, and the failure is on screen.
    */
    if (!result.ok && result.status !== 400) return
    const returnTo = encodeURIComponent(window.location.pathname)
    leavingRef.current = true
    window.location.href = `/pricing?source=upgrade&returnTo=${returnTo}`
  }, [save])

  // Handle discarding Pro changes
  const handleDiscardProChanges = useCallback(() => {
    // Reset Pro-only settings to defaults
    updateSettings({
      show_branding: true, // Re-enable branding
      hide_branding_pro_enabled: false,
      verified_badge_enabled: false, // Disable verified badge
    } as any)
    setShowProUpgradeDialog(false)
  }, [updateSettings])

  // Handle keep editing
  const handleKeepEditing = useCallback(() => {
    setShowProUpgradeDialog(false)
  }, [])

  const isDirtyRef = useRef(isDirty)
  
  // Keep isDirtyRef in sync with isDirty
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // Handle browser back/forward and page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !leavingRef.current) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty])
  
  /*
    BACK ASKS ONLY WHEN THERE IS SOMETHING TO LOSE, AND NEEDS NO ENTRY OF ITS
    OWN. The editor used to push an entry on arrival so that Back had
    something to pop: every visit then took an extra Back to leave (two, and
    one more per tab), "Discard" went back by counting entries, and on a
    first load the entry was pushed before the router had patched the
    history, so it carried none of the router's state. Now Back is held only
    while there is unsaved work, through the one listener that runs before
    the router's (lib/ui/leave-guard.ts), and the dialog asks. With nothing
    unsaved, Back is the browser's own and leaves in one press.
  */
  const leaveTimer = useRef(0)
  const armLeaveGuard = useCallback(() => {
    if (!isDirtyRef.current || leavingRef.current) {
      setLeaveGuard(null)
      return
    }
    setLeaveGuard({
      url: window.location.href,
      state: window.history.state,
      onHeld: () => {
        setPendingNavigation("back")
        setShowUnsavedDialog(true)
      },
    })
  }, [])
  refreshLeaveGuard.current = armLeaveGuard
  useEffect(() => {
    armLeaveGuard()
  }, [isDirty, armLeaveGuard])
  useEffect(() => () => {
    window.clearTimeout(leaveTimer.current)
    setLeaveGuard(null)
  }, [])

  /*
    A LINK OUT, WITH WORK UNSAVED, ASKS FIRST, AND ONLY THEN DOES ANYTHING
    START. The press is stopped before the link, the rail or the shell sees it,
    so no bar runs and no page is hidden for a navigation that may not
    happen. Only a press that would leave this tab: a new tab or window, a
    download, or a place on this same page leaves nothing behind.
  */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current || leavingRef.current || !isPlainClick(e)) return
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setPendingNavigation(url.href)
      setShowUnsavedDialog(true)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  /*
    ANSWERED: GO WHERE THE PRESS WAS GOING. A link out is followed the way the
    rail follows it, by the router, with the shell told on the same press
    (the row lights, the bar and the spinner answer a slow page). It used to
    be a whole document load, whose stale "unsaved changes" handler then
    asked the browser's own question on top of this one. A held Back goes
    back one entry, from the one the hold put back to the one Back was going
    to. If nothing has taken the editor away in LEAVE_REVIVE_MS, it holds
    Back again: the work is still here.
  */
  const leaveTo = useCallback((target: string) => {
    leavingRef.current = true
    setLeaveGuard(null)
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => {
      leavingRef.current = false
      refreshLeaveGuard.current()
    }, LEAVE_REVIVE_MS)
    /*
      AND EVERY WAY OUT ENDS SOMEWHERE. The soft navigation first, with the
      shell's bar told so a slow page says something, and the address loaded
      for real if this editor is still here at the ceiling
      (lib/website-builder/navigate-ceiling), which is what `leave` does too.
    */
    const goTo = (href: string) => {
      startNavigationLoading(href)
      cancelCeiling.current?.()
      cancelCeiling.current = navigateWithCeiling(
        () => router.push(href),
        () => window.location.assign(href),
        (cb, ms) => window.setTimeout(cb, ms),
        (id) => window.clearTimeout(id),
      )
    }
    /*
      A HELD BACK THAT GOES NOWHERE GOES HOME. The hold puts the editor's own
      entry back and Back then pops from it, so there is normally an entry to
      pop to. There is not always: the entry behind was replaced, the editor
      was opened straight from a link or the app's start screen, the web view
      reports a length it cannot go back through. `history.back()` says
      nothing when it does nothing, so the editor sat quiet with the dialog
      gone for the whole LEAVE_REVIVE_MS (12s) and then simply held Back
      again. Now a back that does not show itself within BACK_WATCH_MS is
      followed by the app's home (lib/navigation/go-back backThen).
    */
    if (target === "back") {
      backThen(() => goTo(EXIT_HREF))
      return
    }
    let url: URL
    try {
      url = new URL(target, window.location.href)
    } catch {
      return
    }
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href)
      return
    }
    goTo(url.pathname + url.search + url.hash)
  }, [router])

  const handleSaveAndNavigate = useCallback(async () => {
    const userHasPro = !planConfirmed || userPlan === "growth" || userPlan === "pro"

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowUnsavedDialog(false)
      setShowProUpgradeDialog(true)
      return
    }

    /*
      Leave only once the save has worked. A failed save used to be followed
      by the navigation anyway, which is the one moment unsaved work cannot
      be got back; now the dialog stays, with Discard still in it, and the
      failure is on screen.
    */
    setIsSavingForNav(true)
    try {
      if (activeTab === "settings") {
        await settingsTabRef.current?.saveAllSettings()
      }
      const result = await save()
      if (!result.ok) return
    } catch (error) {
      console.error("Save before leaving failed:", error)
      showSaveFailure(tt("Couldn't save. Try again"))
      return
    } finally {
      setIsSavingForNav(false)
    }
    setShowUnsavedDialog(false)
    /* "/app" is the phone's way out (handleExit), through the glass; "back" a held Back; anything else a link's address. */
    if (pendingNavigation === "/app") {
      leave()
    } else if (pendingNavigation) {
      leaveTo(pendingNavigation)
    }
    setPendingNavigation(null)
  }, [save, pendingNavigation, hasProFeaturesEnabled, activeTab, userPlan, planConfirmed, showSaveFailure, leave, leaveTo])

  const handleDiscardAndNavigate = useCallback(() => {
    setShowUnsavedDialog(false)
    /* The device's copy goes too, or the next open puts the discarded work back (lib/onepage/context discardUnsaved). */
    discardUnsaved()
    if (pendingNavigation === "/app") {
      leave()
    } else if (pendingNavigation) {
      leaveTo(pendingNavigation)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, leave, leaveTo, discardUnsaved])

  // Handle onboarding completion
  // Note: The onboarding modal already saves everything to the database and calls save()
  // This handler just updates local state and closes the modal
  const handleOnboardingComplete = useCallback(async () => {
    console.log("[OnePageEditor] Onboarding completed - modal already saved, updating local state...")

    // Mark completed in localStorage immediately as backup
    if (onepage?.id && typeof window !== "undefined") {
      localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
      localStorage.removeItem("onepage_onboarding_progress")
    }

    completedThisSessionRef.current = true
    setShowOnboarding(false)

    // The onboarding modal already:
    // 1. Saved onboarding_completed to database
    // 2. Called save() to persist all editor changes
    // So we don't need to do it again here
    console.log("[OnePageEditor] Onboarding completion handled - auto-save already done by modal")
  }, [onepage?.id])

  const desktopPill = usePillSlide(activeTab)
  pillMoves.current = [desktopPill.slideTo]
  /* The pill starts for the tab the button went down on (./pill-tabs usePillPress). */
  const desktopPress = usePillPress(desktopPill.slideTo, activeTab)
  /*
    THE PHONE'S CHOSEN BUTTON CHANGES FROM THE PRESS TOO. Its fill and its
    words crossed on the click, after the editor had rendered: 175 to 230ms
    after the finger went down on a phone with the CPU slowed four times.
    The finger going down now writes the opacities straight onto the fills
    and the faces (the same in-place crossfade, no pill, nothing moving);
    React's render then writes the same values. A finger that scrolls
    instead, or is let go elsewhere, puts them back.
  */
  const phoneRowRef = useRef<HTMLDivElement>(null)
  const phoneShow = useCallback((id: string) => {
    const row = phoneRowRef.current
    if (!row) return
    for (const button of row.querySelectorAll<HTMLElement>("[data-tab]")) {
      const on = button.getAttribute("data-tab") === id
      const fill = button.querySelector<HTMLElement>("[data-tab-fill]")
      if (fill) fill.style.opacity = on ? "1" : "0"
      const ink = button.querySelector<HTMLElement>("[data-tab-ink]")
      if (ink) ink.style.color = on ? PHONE_TAB_INK_ON : PHONE_TAB_INK_OFF
    }
  }, [])
  const phonePress = usePillPress(phoneShow, activeTab)
  /* What the last press on the phone's bar was: only a finger gets the haptic tick. */
  const phonePointer = useRef<string>("mouse")
  /*
    The same elements from one render of the editor to the next, so a tap on
    a tab (which re-renders the editor to move the pill) does not re-render
    the tab on screen or the preview. Each still renders when the page it
    reads changes.
  */
  /* Round AU: each tab and the preview break on their own (components/onepage/editor-part-boundary), never the whole editor and its Save. */
  const designPanel = useMemo(() => <EditorPartBoundary part="design"><DesignTab userPlan={userPlan} /></EditorPartBoundary>, [userPlan])
  const linksPanel = useMemo(() => <EditorPartBoundary part="links"><LinksTab /></EditorPartBoundary>, [])
  const productsPanel = useMemo(() => <EditorPartBoundary part="products"><ProductsTab onGoToLinks={() => handleTabChange("links")} /></EditorPartBoundary>, [handleTabChange])
  const phonePreview = useMemo(() => <EditorPartBoundary part="preview"><PhonePreview onDrawn={() => setPreviewDrawn(true)} /></EditorPartBoundary>, [])

  if (!onepage) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Always the external, shareable address: storelib.me/{handle}, or <domain>/links on a creator page domain
  const pageUrl = connectedDomain ? getLinksUrlWithCustomDomain(onepage.slug, connectedDomain) : getLinksShareUrl(onepage.slug)

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* The creator opening their own OnePage is not one of its visitors (lib/analytics/own-site). */
  useOwnMarker()

  const viewLive = () => {
    openExternal(ownOpen(pageUrl))
  }

  const tabs = [
    { id: "links" as const, label: tt("Links"), icon: Link2 },
    { id: "design" as const, label: tt("Design"), icon: Palette },
    { id: "products" as const, label: tt("Products"), icon: ShoppingBag },
  ]

  // Determine save button state
  const getSaveButtonContent = () => {
    if (saveState === "saving") {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="hidden sm:inline ml-2">{tt("Saving...")}</span>
        </>
      )
    }
    if (saveState === "saved" && !isDirty) {
      return (
        <>
          <Check className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">{tt("Saved")}</span>
        </>
      )
    }
    /* The last save failed and nothing has been typed since: the button says
       so, and pressing it is the retry. The next edit or save clears it. */
    if (saveState === "error" && isDirty) {
      /* Round AU: a save that failed for the network is being tried again on its own; pressing still tries now. */
      return (
        <>
          <AlertCircle className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">{retrying ? tt("Not saved, retrying") : tt("Try again")}</span>
        </>
      )
    }
    // Show lightning bolt when the user has pro features active but no paid plan
    const userHasPro = !planConfirmed || userPlan === "growth" || userPlan === "pro"
    const showZap = hasProFeaturesEnabled() && !userHasPro
    return (
      <>
        {showZap ? <Zap className="h-4 w-4" strokeWidth={2.5} /> : <Save className="h-4 w-4" />}
        <span className="hidden sm:inline ml-2">{tt("Save")}</span>
      </>
    )
  }

  const isSaveDisabled = saveState === "saving" || (saveState === "saved" && !isDirty) || !isDirty

  /* Back to Storelib, asking first when there is work that is not saved. */
  const handleExit = () => {
    if (isDirty) {
      setPendingNavigation("/app")
      setShowUnsavedDialog(true)
      return
    }
    leave()
  }

  const handleUndoClick = () => {
    undo()
    setHistoryToastMessage(tt("Undone"))
    setHistoryToastSequence((v) => v + 1)
  }

  const handleRedoClick = () => {
    redo()
    setHistoryToastMessage(tt("Redone"))
    setHistoryToastSequence((v) => v + 1)
  }

  return (
    <div
      className="flex flex-col bg-gray-50/50 fixed left-0 right-0 top-0 md:left-[var(--app-rail-w,240px)] md:top-[58px]"
      /* The bottom edge is the keyboard's top when one is up, and the
         screen's bottom when none is: see bottomAboveKeyboard. */
      style={{ zIndex: 30, ...bottomAboveKeyboard() }}
      data-onepage-editor=""
    >
      {/*
        FULL SCREEN ON A PHONE. The editor used to start under the app's black
        header, 68px down, with a black band under the clock above it. Now it
        starts at the top of the screen and its own white bar pads itself into
        the safe area. `with-op-editor` tells app/globals.css to stop painting
        the black header and the native shield under 768px, where this bar
        replaces them. From 768px nothing changes: header, rail, editor beside.
        Hidden rather than covered, so the editor keeps z 30 and every dialog
        and sheet it opens (z 50) still sits over it.
      */}
      <HtmlClass name="with-op-editor" />
      <SaveNotification
        key={saveToastSequence}
        show={saveToastSequence > 0}
        message={tt("Changes saved")}
        duration={4000}
      />
      <SaveNotification
        key={`history-${historyToastSequence}`}
        show={historyToastSequence > 0}
        message={historyToastMessage}
        duration={2200}
      />
      <SaveNotification
        key={`draft-restored-${draftRestoredAt ?? 0}`}
        show={draftRestoredAt !== null}
        message={tt("Unsaved changes restored")}
        duration={4000}
      />
      <SaveNotification
        key={`save-failed-${saveFailure.sequence}`}
        show={saveFailure.sequence > 0}
        message={saveFailure.message}
        duration={5000}
        icon={<AlertCircle className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />}
      />
      {/*
        ═══════════════════════════════════════════════════════════════════
         THE WHITE BAR ON A PHONE, AND THE HOLE THAT WAS IN THE MIDDLE OF IT
        ═══════════════════════════════════════════════════════════════════
        Reported from a phone, of the editor in Preview: a white bar across
        the top of a dark page, mostly empty. Measured at 390x844 with a real
        iPhone's safe area (scripts/check-onepage-bar.mjs):

          the bar          104px of white (56 of bar + 47 of safe area + 1
                           of border), of which 72px were rows with nothing
                           in them at all
          across it        a 91px hole in the middle, 23% of the width, and
                           it grows with the screen: it is the shape of the
                           DESKTOP layout, where this half is `flex-1` to
                           line up with the editor panel and holds the tab
                           pill and the settings button. On a phone both are
                           `hidden` and the tabs live in the bottom bar, so
                           the half was sized for children that are not there

        So the bar is given the height its controls actually need — 44px, a
        phone's nav bar, against 56 for a 36px back arrow — and the hole is
        given the one thing the phone bar never said: whether the page is
        saved. Under 640px the save button is its icon alone (its word is
        `hidden sm:inline`), so until now nothing on a phone said "Unsaved"
        in words at all. The word is `md:hidden`, like the back arrow, the
        share square and Edit: it belongs to the phone bar, and from 768px
        the tab pill has the middle back. Nothing is taken away — the same
        six controls, closer to their own size, with the middle no longer
        dead.

        Measured in Inter at 12px, the longest of the four words is "Saving…"
        at 53px. Since the share square and the save icon joined the bar the
        room was the width of the screen less 344px, and at 390 (the most
        common phone) the word read "Unsa…" (round 10, scripts/check-onepage-
        shell.mjs). The bar's gaps are 6px on a phone now and Preview is a
        little tighter, which gives the word 56px at 390; from 390px up it is
        there whole, and narrower than that it is left out rather than cut.
      */}
      <header className="box-content flex items-center border-b bg-white h-11 sm:h-[60px] pt-[env(safe-area-inset-top)] md:pt-0 shrink-0 relative z-30 overflow-hidden">
        {/* Left controls area - flex-1 matches editor panel below */}
        <div className="flex-1 min-w-0 h-full px-3 sm:px-4 md:px-0">
          <div className="flex items-center gap-1.5 sm:gap-3 h-full w-full md:max-w-xl md:mx-auto md:px-6">
            {/* The way out on a phone, where the app's header is not drawn. */}
            <button
              type="button"
              onClick={handleExit}
              aria-label={tt("Back to Storelib")}
              title={tt("Back to Storelib")}
              data-onepage-exit=""
              className="md:hidden -ml-1 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] active:bg-[#eceef1] [-webkit-tap-highlight-color:transparent]"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            {/* Undo/Redo: the icon squares from the rest of /app, a hairline and a soft foot */}
            <div className="flex items-center gap-1.5" data-onepage-history="">
              <button
                type="button"
                className={cn(iconDepth, "h-8 w-8 rounded-[9px] text-[#374151]")}
                onClick={handleUndoClick}
                disabled={!canUndo}
                title={tt("Undo")}
                aria-label={tt("Undo")}
              >
                <Undo2 className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                className={cn(iconDepth, "h-8 w-8 rounded-[9px] text-[#374151]")}
                onClick={handleRedoClick}
                disabled={!canRedo}
                title={tt("Redo")}
                aria-label={tt("Redo")}
              >
                <Redo2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* What fills the phone bar's middle: see the note on the bar above. */}
            <span
              data-onepage-state=""
              className={cn(
                "min-w-0 flex-1 truncate text-center text-[12px] font-medium leading-none hidden min-[390px]:block md:hidden",
                saveState === "error" && isDirty
                  ? "text-red-600"
                  : isDirty || saveState === "saving"
                    ? "text-amber-600"
                    : "text-[#6b7280]",
              )}
            >
              {saveState === "saving"
                ? tt("Saving…")
                : saveState === "error" && isDirty
                  ? tt("Failed")
                  : isDirty
                    ? tt("Unsaved")
                    : tt("Saved")}
            </span>

            {/* Tab Navigation - Desktop - Pill shaped tabs */}
            <div ref={desktopPill.rowRef} className="relative isolate hidden md:flex items-center gap-1 bg-gray-100 rounded-full p-1" data-tab-row="desktop">
              <span
                ref={desktopPill.pillRef}
                aria-hidden
                data-tab-pill=""
                className="pointer-events-none absolute left-0 top-0 z-[1] origin-left rounded-full bg-white shadow-sm"
                style={{ opacity: 0 }}
              />
              {tabs.map((tab) => {
                const Icon = tab.icon
                const on = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    data-tab={tab.id}
                    aria-pressed={on}
                    onPointerDown={desktopPress(tab.id).onPointerDown}
                    onPointerCancel={desktopPress(tab.id).onPointerCancel}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer",
                      !on && "hover:bg-white/50"
                    )}
                  >
                    <TabFace on={on} onClass="text-foreground" offClass="text-muted-foreground">
                      <Icon className="mr-2 h-4 w-4" />
                      {tab.label}
                    </TabFace>
                  </button>
                )
              })}
            </div>

            {/* Settings Button - Desktop */}
            <button
              onClick={() => handleTabChange("settings")}
              title={tt("Settings")}
              className={cn(
                "hidden md:flex w-10 h-10 rounded-xl items-center justify-center border transition-[background-color,border-color,color,box-shadow] duration-200 cursor-pointer",
                activeTab === "settings"
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-900 hover:border-gray-900 hover:text-white shadow-sm hover:shadow-md"
              )}
            >
              <SettingsFilterIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 pr-3 sm:pr-4 md:w-[410px] md:border-l md:justify-end md:pr-6 md:pl-3">
          {/* Unsaved — mr-auto pushes it to the far left of the panel, away from the divider */}
          {isDirty && saveState !== "saving" && (
            <span className="hidden lg:inline text-xs text-amber-600 font-medium whitespace-nowrap shrink-0 mr-auto">
              {tt("Unsaved")}
            </span>
          )}

          {/* The phone's way to share, in the bar's own icon square: it opens the share sheet. */}
          <button
            type="button"
            className={cn(iconDepth, "md:hidden h-8 w-8 rounded-[9px] text-[#374151]")}
            onClick={openShare}
            aria-label={tt("Share your OnePage")}
            title={tt("Share your OnePage")}
            data-onepage-share=""
          >
            <Share className="h-4 w-4" strokeWidth={2} />
          </button>

          {/* Save Button */}
          <Button
            onClick={handleSaveWithProCheck}
            disabled={isSaveDisabled}
            data-onepage-save={saveState === "error" && isDirty ? (retrying ? "retrying" : "failed") : saveState}
            className={cn(
              "h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-[background-color,color,opacity] duration-200",
              saveState === "saved" && !isDirty
                ? "bg-[#1a1a2e] hover:bg-[#2a2a40] text-white opacity-60 cursor-default pointer-events-none"
                : saveState === "error" && isDirty
                  ? "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  : isDirty
                  ? "bg-[#1a1a2e] hover:bg-[#2a2a40] text-white cursor-pointer"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
          >
            {getSaveButtonContent()}
          </Button>

          {/* Share your OnePage Button - Desktop */}
          <div className="hidden md:block">
            <button
              onClick={openShare}
              data-onepage-share-desk=""
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border text-sm font-medium hover:shadow-md hover:bg-gray-50 transition-[background-color,box-shadow] cursor-pointer whitespace-nowrap"
            >
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{tt("Share your OnePage")}</span>
            </button>
          </div>

          {/* Mobile Preview Toggle - Black button */}
          <Button
            variant={showMobilePreview ? "outline" : "default"}
            size="sm"
            className={cn(
              "md:hidden h-8 px-2.5 rounded-lg",
              !showMobilePreview && "bg-gray-900 hover:bg-gray-800 text-white"
            )}
            onClick={togglePreview}
            /* The press starts the frame if idle time has not yet (round AT): it is loading by the time the finger lifts. */
            onPointerDown={() => {
              if (!mobilePreviewKept) setMobilePreviewKept(true)
            }}
            data-onepage-preview-toggle=""
          >
            {showMobilePreview ? (
              <>
                <Edit3 className="h-4 w-4 mr-1" />
                {tt("Edit")}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                {tt("Preview")}
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content Area: under the bar, and what the way in's loader covers. */}
      <div className="relative flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/*
          Editor Panel - Hidden when mobile preview is active. Each tab in
          its own scroll box, stacked (see ONE TAB TO THE NEXT above); the
          one on screen is the editor's `data-scroll-container`.
        */}
        <div
          className={cn(
            "relative flex-1 min-h-0 overflow-hidden bg-white isolate block",
            /* Round AT: laid out under the preview, not taken away, so Edit comes back without a layout. */
            showMobilePreview && "max-md:invisible"
          )}
          inert={showMobilePreview || undefined}
          data-onepage-panels=""
        >
          {TAB_ORDER.filter((t) => t === panels.tab || t === panels.leaving || panels.built.includes(t)).map((t) => {
            const shown = t === panels.tab || t === panels.leaving
            return (
              <div
                key={t}
                ref={(el) => { panelRefs.current[t] = el }}
                data-tab-panel={t}
                data-scroll-container={t === panels.tab ? "links-tab" : undefined}
                aria-hidden={shown ? undefined : true}
                inert={t !== panels.tab}
                className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-white"
                style={{
                  scrollbarWidth: "thin",
                  /*
                    The scrollbar's room is kept whether the tab scrolls or
                    not. Where scrollbars take room (Windows, a Mac set to
                    show them), Design's list does not scroll and Theme
                    does, so every push and back made the column 10px
                    narrower or wider in its first frame and both pages
                    were laid out again at the new width.
                  */
                  scrollbarGutter: "stable",
                  zIndex: t === panels.tab ? 1 : 0,
                  /* Hidden, a kept tab is neither drawn nor laid out, and keeps its place in React. */
                  visibility: shown ? undefined : "hidden",
                  contentVisibility: shown ? undefined : "hidden",
                }}
              >
                {/*
                  The reading width and the padding are each tab's own.
                  Design's pages slide across the whole column, so that tab
                  is given all of it and keeps both inside each page
                  (design-tab, EACH PAGE IS THE COLUMN).
                */}
                <div
                  className={cn(
                    "w-full mx-auto",
                    t === "design" ? null : "p-4 md:p-6 op-tabbar-clearance md:pb-6",
                    t === "settings" ? "max-w-3xl" : t === "design" ? null : "max-w-xl"
                  )}
                >
                  {t === "settings" ? (
                    <EditorPartBoundary part="settings"><SettingsTab ref={settingsTabRef} pageUrl={pageUrl} onSave={handleSaveWithProCheck} userPlan={userPlan} section={settingsSection.current} jump={settingsJump} onSectionChange={onSettingsSection} /></EditorPartBoundary>
                  ) : (
                    <Activity mode={shown ? "visible" : "hidden"}>
                      {t === "design" && designPanel}
                      {/*
                        NO ANALYTICS LINE OVER THE LINKS. It sat above the
                        profile picture, the first thing on the tab the
                        editor opens on, and it is a reading rather than
                        anything to edit: "I still don't like the analytics
                        text thing showing above the profile avatar, get rid
                        of it". The numbers are on Analytics, where they are
                        looked at on purpose.
                      */}
                      {t === "links" && linksPanel}
                      {t === "products" && productsPanel}
                    </Activity>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Preview Panel - Desktop with phone mockup */}
        <div
          className="hidden md:block border-l bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 overflow-auto"
          style={{
            width: '410px',
            minWidth: '410px',
            flexShrink: 0,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              minHeight: '100%',
              padding: '20px 53px',
            }}
          >
            {phonePreview}
          </div>
        </div>

        {/* Mobile Preview - NO phone mockup, just real page content like Linktree.
            Kept once opened (hidden, not unmounted), so its frame is not loaded again. */}
        {(showMobilePreview || mobilePreviewKept) && (
          <div
            className={cn("absolute inset-0 z-[3] flex flex-col overflow-hidden md:hidden", !showMobilePreview && "invisible pointer-events-none")}
            inert={!showMobilePreview || undefined}
            data-onepage-mobile-layer={showMobilePreview ? "shown" : "warm"}
          >
            <EditorPartBoundary part="preview"><MobilePreviewContent /></EditorPartBoundary>
          </div>
        )}

        {/* The way in: the same light loader the creator page shows over its canvas, under the bar, faded off the editor once it is drawn. */}
        {loaderVisible && (
          <div
            className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"
            data-leaving={arrived}
            data-onepage-loader=""
            aria-hidden={arrived}
          >
            <BuilderLoader tone="light" lines={[tt("Loading your page")]} />
          </div>
        )}
      </div>

      {/*
        THE PHONE'S TAB BAR: FOUR EQUAL BUTTONS, SETTINGS ONE OF THEM.
        Links, Design, Products and Settings, an icon over its word, each
        54px tall, 8px apart and 16px in from the edges (6px and 12px under
        340px), white with a hairline and a soft foot, the chosen one near
        black with the light and shade of Preview. The bar is --op-tabbar-h
        tall (app/globals.css), the buttons end 10px above its foot or above
        the home indicator, and the tabs leave the same room under their
        content.

        THE CHOSEN ONE CHANGES IN PLACE. "No slide-in slide effect." A dark
        pill used to travel from the last tab to the next on transform. Now
        each button has its own dark fill, and a tap crossfades it (opacity,
        TAB_SELECT_MS) while the icon and word turn from grey to white. Nothing
        moves sideways. Reduced motion swaps at once.

        THE ICONS NO LONGER JUMP AS THEY CHANGE (round 42). "The icons
        jump/bounce weirdly on touch when switching." Each button drew its
        icon and word twice (TabFace), one over the other, and a switch faded
        one copy out and the other in. A fading element is lifted onto a
        layer of its own for the length of the fade and dropped back when it
        ends (measured: 9 layers in the bar at rest, 11 during every switch),
        and at 83.5px a button every icon sits on a half pixel, so it was
        drawn snapped one way on its layer and the other way off it: a half
        pixel hop as the fade began and again as it ended, on the two buttons
        under the thumb. Now there is one icon and one word, whose colour
        turns (a repaint where it is), the dark fill keeps its own layer for
        good (will-change), and the word's line is a whole 15px so the column
        inside the 54px button starts on a whole pixel.
        scripts/check-onepage-editor-r42.mjs: the layers in the bar stay the
        same number through a switch, and no icon or word moves.

        NOTHING BUMPS UNDER THE THUMB (round 11). "When I switch, it bumps the
        icons, bumps the links, glitches [...] especially on hover with the
        touch it bumps the buttons." A press shrank the button to 96% on
        :active, so every finger that landed, or slid across the bar, shook
        it. Now a press only greys the button's own ground (background-color,
        120ms), nothing changes size or place, and a finger's tap gives a
        light tick of haptics (lib/native-bridge hapticTap), as the app's own
        tab bar does. scripts/check-onepage-motion-r11.mjs measures the boxes
        and the layout shift around a tap.

        THE WORD KEEPS ITS DESCENDERS. It was `leading-none` inside
        `truncate`, a 1em box that clips whatever it overflows: the tails of
        the g in Design and Settings were cut off. The line is 1.3em now,
        which holds Inter's whole height, and the word still ends in an
        ellipsis rather than spill out of a narrow button
        (scripts/check-onepage-tabbar.mjs measures both).
      */}
        <div
          className={cn("md:hidden fixed bottom-0 left-0 right-0 z-20 h-[var(--op-tabbar-h)] border-t border-[#e5e7eb] bg-white shadow-[0_-1px_2px_rgba(16,24,40,0.03),0_-6px_16px_rgba(16,24,40,0.04)]", showMobilePreview && "invisible")}
          /* Round AT: kept mounted under Preview, only hidden, so Edit does not build it again. */
          inert={showMobilePreview || undefined}
          data-onepage-tabbar=""
        >
          {/* 9px under the bar's 1px hairline: 10px over the buttons, as --op-tabbar-h counts it. */}
          <div ref={phoneRowRef} className="grid grid-cols-4 gap-1.5 px-3 pt-[9px] min-[340px]:gap-2 min-[340px]:px-4" data-tab-row="phone">
            {[...tabs, { id: "settings" as const, label: tt("Settings"), icon: SlidersHorizontal }].map((tab) => {
              const Icon = tab.icon
              const on = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tab={tab.id}
                  aria-pressed={on}
                  onPointerDown={(e) => {
                    phonePointer.current = e.pointerType
                    phonePress(tab.id).onPointerDown(e)
                  }}
                  onPointerCancel={phonePress(tab.id).onPointerCancel}
                  onClick={() => {
                    /* A light tick under the thumb, as the app's own tab bar gives (components/app/sidebar-mobile-nav). */
                    if (phonePointer.current === "touch" && !on) hapticTap("light")
                    phonePointer.current = "mouse"
                    handleTabChange(tab.id)
                  }}
                  className="relative isolate flex h-[54px] min-w-0 cursor-pointer touch-manipulation select-none items-center justify-center rounded-[12px] border border-[#e3e4e8] bg-white px-0.5 text-[11.5px] font-medium shadow-[inset_0_-2px_0_rgba(0,0,0,0.05),0_1px_2px_rgba(15,23,42,0.07)] outline-none transition-[background-color] duration-[120ms] ease-out active:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]/40 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
                >
                  <span
                    aria-hidden
                    data-tab-fill=""
                    className="pointer-events-none absolute -inset-px z-[1] rounded-[12px] bg-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25),0_4px_12px_rgba(16,24,40,0.14)] transition-opacity ease-out will-change-[opacity] motion-reduce:transition-none"
                    style={{ opacity: on ? 1 : 0, transitionDuration: `${TAB_SELECT_MS}ms` }}
                  />
                  {/* One icon and one word, whose colour turns (a repaint where they are): never a second copy fading over the first. */}
                  <span
                    data-tab-ink=""
                    className="relative z-[2] flex w-full min-w-0 max-w-full flex-col items-center gap-[5px] transition-[color] ease-out motion-reduce:transition-none"
                    style={{ color: on ? PHONE_TAB_INK_ON : PHONE_TAB_INK_OFF, transitionDuration: `${TAB_SELECT_MS}ms` }}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                    <span className="block h-[15px] max-w-full truncate text-center leading-[15px]" data-tab-word="">{tab.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

      {/*
        SHARE YOUR ONEPAGE. On a phone it is the app's own sheet
        (components/ui/bottom-sheet): it rises from the bottom, follows the
        thumb and is flicked away like every other sheet in /app. It was a
        centred modal on every width. From 768px it stays a dialog.
      */}
      <ShareOnePage
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onepage={onepage}
        pageUrl={pageUrl}
        copied={copied}
        onCopy={copyLink}
        onOpen={viewLive}
        connectedDomain={connectedDomain}
        userPlan={userPlan}
      />

      {/* Unsaved Changes Dialog */}
      {draftQuestion ? <DraftQuestionDialog at={draftQuestion.at} onAnswer={answerDraftQuestion} /> : null}

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onClose={() => { setShowUnsavedDialog(false); setPendingNavigation(null); }}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
        isSaving={isSavingForNav}
      />

      {/* Pro Upgrade Dialog - shown when trying to save with Pro features */}
      <ProUpgradeDialog
        open={showProUpgradeDialog}
        onClose={() => setShowProUpgradeDialog(false)}
        onUpgrade={handleUpgradeToPro}
        onDiscard={handleDiscardProChanges}
        onKeepEditing={handleKeepEditing}
      />

      {/* The way out, the same dark glass as the creator page and the website builder. */}
      {leaving && (
        <div className="wb-leaving" role="status" aria-live="polite" aria-label={tt("Going back")} data-onepage-leaving="">
          <BuilderLoader className="wb-leaving-content" tone="dark" lines={[tt("Going back"), tt("Almost there")]} />
        </div>
      )}

      {/* Onboarding Modal - shown on first visit only, after database check */}
      {onboardingChecked && !completedThisSessionRef.current && (
        <OnboardingModal
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  )
}
