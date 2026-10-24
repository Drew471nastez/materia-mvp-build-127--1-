"use client"

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { ConnectionsSettings } from "@/components/website-builder/website-settings/connections"
import { AppsSettings } from "@/components/website-builder/website-settings/apps"
import { BackupSettings } from "@/components/website-builder/website-settings/backups"
import { CommerceSettings } from "@/components/website-builder/website-settings/commerce"
import { DomainSettings } from "@/components/website-builder/website-settings/domains"
import { GeneralSettings } from "@/components/website-builder/website-settings/general"
import { NavigationSettings } from "@/components/website-builder/website-settings/navigation"
import { PageSettings } from "@/components/website-builder/website-settings/pages"
import { PolicySettings } from "@/components/website-builder/website-settings/policies"
import { PublishingSettings } from "@/components/website-builder/website-settings/publishing"
import { PerformanceSettings } from "@/components/website-builder/website-settings/performance"
import { SeoSettings } from "@/components/website-builder/website-settings/seo"
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_SECTIONS,
  type ConnectVia,
  type SettingsContext,
  type SettingsSection,
  type SitePage,
} from "@/components/website-builder/website-settings/types"
import { LookButton, SettingsLookContext, useSettingsLookChoice } from "@/components/website-builder/website-settings/parts"
import { tt } from "@/lib/i18n/text"

export type { SettingsSection } from "@/components/website-builder/website-settings/types"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS: A PAGE OVER THE BUILDER, NOT A DIALOG IN IT
 * ===========================================================================
 *
 * A whole screen: the subjects down the left, one of them on the right, and
 * "Back to editor" as the only way out. That shape says "you have stepped out
 * of the editor to look at the website itself", which is what settings are.
 *
 * It is still the same page underneath: no navigation, no reload, the draft
 * in the editor untouched. So the address is left alone. Pushing
 * `?page=settings` into history would give the browser's Back button a job
 * the screen's own Back already does, and two Backs that mean different
 * things is how somebody loses an edit.
 *
 * TEN SUBJECTS, EACH BACKED BY SOMETHING REAL. A control here is either an
 * API that exists (the name, publishing, backups, the domains, the agent
 * connections), one of the website's own settings written through the
 * editor's `updateSetting` so autosave, undo and Publish treat it like any
 * other change, or a door into the builder where the thing is really edited
 * (pages, the menu, the policies, the code). Nothing is drawn that does
 * nothing: an entry that opens an empty panel is a promise the product
 * cannot keep.
 *
 * ON A PHONE the subjects are a list first, and one opens over it with its
 * own Back. They used to be a row of chips scrolling sideways across the top,
 * and the last ones, Connections among them, were off the edge of the screen
 * where nobody found them.
 *
 * AND IT MOVES LIKE A PHONE'S OWN SETTINGS. A subject is pushed in from the
 * right over the list, and Back slides it away again, on transform only (see
 * PUSH_MS below). The list is never taken out of the layout while a subject
 * is open, only hidden, so it comes back scrolled exactly where it was left.
 */

/** A subject sliding in over the list, and back out: iOS's own push curve. */
const PUSH_MS = 340
const POP_MS = 280
const PUSH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const POP_EASE = "cubic-bezier(0.4, 0, 0.2, 1)"
/** The width below which the subjects are a list with a page pushed over it. Tailwind's md. */
const PHONE_QUERY = "(max-width: 767px)"

export function ProjectSettings({
  open,
  onClose,
  installId,
  name,
  onRenamed,
  websiteUrl,
  websiteUrlDisplay,
  storeName,
  displayName,
  live,
  publishedAt,
  onRestored,
  onHoldDraft,
  onEditPage,
  initialSection = null,
  githubReturned = null,
  connectVia = null,
  settings = {},
  onSettingChange = () => {},
  pages = [],
  productCount = null,
  onAddPage = () => {},
  onEditMenu = () => {},
  onOpenThemeGroup = () => {},
  onOpenCode = () => {},
  onPublish = () => {},
  onUnpublished = () => {},
  onNavigate = (href) => window.location.assign(href),
  onAddressChanged = () => {},
  navigation = {},
}: {
  open: boolean
  onClose: () => void
  installId: string
  name: string
  onRenamed: (name: string) => void
  websiteUrl: string
  websiteUrlDisplay: string
  /** Store details' store name and the person's name: the store's name in the tab when the website gives none. */
  storeName?: string
  displayName?: string
  live: boolean
  publishedAt: string | null
  /** A backup has been written into the draft; the editor must reload it. */
  onRestored?: () => void
  /** Saves the editor's draft and pauses autosave while a restore runs (true), or lets it go (false). */
  onHoldDraft?: (hold: boolean) => Promise<boolean>
  /** Open one of the site's pages in the builder. */
  onEditPage?: (pageKey: string) => void
  /** Open on this page rather than General, e.g. from a tab on the website page. */
  initialSection?: SettingsSection | null
  /** What GitHub's round trip came back with, shown on the GitHub card. */
  githubReturned?: string | null
  /** Open Connections on this path: GitHub, from the top bar's GitHub button. */
  connectVia?: ConnectVia | null
  settings?: ThemeSettingsValues
  onSettingChange?: (key: string, value: unknown) => void
  pages?: SitePage[]
  productCount?: number | null
  onAddPage?: () => void
  onEditMenu?: (handle?: string) => void
  onOpenThemeGroup?: (group: string) => void
  onOpenCode?: () => void
  onPublish?: () => void
  onAddressChanged?: (handle: string) => void
  onUnpublished?: () => void
  onNavigate?: (href: string) => void
  /** The header, the footer and the editor's writers for them: Navigation. */
  navigation?: Pick<SettingsContext, "header" | "footer" | "onSectionSetting" | "onBlockSetting" | "onAddBlock" | "onRemoveBlock" | "onReorderBlocks" | "linkTargets" | "linkSections" | "currentPageKey" | "currentSections" | "onPageDraftSaved" | "preview">
}) {
  const [section, setSection] = useState<SettingsSection>("general")
  /** Light or dark: the person's own choice (website-settings/parts.tsx useSettingsLookChoice). */
  const look = useSettingsLookChoice()
  /** A phone shows the list until a subject is picked. */
  const [picked, setPicked] = useState(false)
  /**
   * A push or a pop in flight on a phone. Both the list and the page stay
   * drawn until it lands; after a push the list is hidden (not removed, so
   * it keeps its scroll), after a pop the page is.
   */
  const [moving, setMoving] = useState<null | "push" | "pop">(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLElement | null>(null)
  const motion = useRef<Animation[]>([])

  /* Reset while rendering, not in an effect: an effect runs after paint,
     so a reopened Settings showed the last subject for a frame first (and
     on a phone, that subject's page instead of the list). */
  const openedAs = open ? `open:${initialSection ?? ""}` : "closed"
  const [seen, setSeen] = useState<string | null>(null)
  if (seen !== openedAs) {
    setSeen(openedAs)
    if (open) {
      setSection(initialSection ?? "general")
      setPicked(initialSection !== null)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      /* An open list or menu inside (the registrar list in Domains) takes Escape for itself, and Radix marks it handled. */
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  /* A new subject starts at its top, not wherever the last one was scrolled to. */
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [section])

  /**
   * THE PUSH AND THE POP. Started before the frame that shows the new state
   * is painted, so the page's first frame is already off to the right; on
   * the compositor, so a subject that is heavy to draw does not stutter it.
   * Only the page and the list move: `transform`, and the list's dimming,
   * nothing that lays anything out.
   */
  useLayoutEffect(() => {
    /* A move that has landed holds its last frame (`fill`) until the render
       that hides the list or the page has been committed, which is now:
       letting go of it earlier showed the page over the list for one frame
       at the end of every Back. */
    for (const a of motion.current) a.cancel()
    motion.current = []
    if (!moving) return
    const page = panelRef.current
    const list = listRef.current
    if (!page || typeof page.animate !== "function") {
      setMoving(null)
      return
    }
    const push = moving === "push"
    const timing: KeyframeAnimationOptions = { duration: push ? PUSH_MS : POP_MS, easing: push ? PUSH_EASE : POP_EASE, fill: "both" }
    const off = "translate3d(100%, 0, 0)"
    const at = "translate3d(0, 0, 0)"
    const a = page.animate(push ? [{ transform: off }, { transform: at }] : [{ transform: at }, { transform: off }], timing)
    motion.current = [a]
    if (list) {
      /* The list gives way by a quarter of its width and dims, as a phone's does. */
      const back = { transform: "translate3d(-24%, 0, 0)", opacity: 0.5 }
      const front = { transform: at, opacity: 1 }
      motion.current.push(list.animate(push ? [front, back] : [back, front], timing))
    }
    a.onfinish = () => {
      if (motion.current[0] === a) setMoving(null)
    }
    /* However it ends, or if it never runs (a tab in the background), it lands. */
    const late = window.setTimeout(() => setMoving(null), (push ? PUSH_MS : POP_MS) + 200)
    return () => window.clearTimeout(late)
  }, [moving])
  useEffect(() => () => { for (const a of motion.current) a.cancel() }, [])

  if (!open) return null
  if (typeof document === "undefined") return null

  /** Whether this screen is the phone's list-then-page, and should move. */
  const phoneMotion = () =>
    typeof window !== "undefined" &&
    !!window.matchMedia?.(PHONE_QUERY).matches &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  const go = (next: SettingsSection) => {
    setSection(next)
    /* From the list, on a phone: pushed in. Between subjects on a desktop, or
       from inside one (a link to Publishing), the page is already there. */
    if (!picked && phoneMotion()) setMoving("push")
    else if (moving) setMoving(null)
    setPicked(true)
  }
  const backToList = () => {
    setMoving(phoneMotion() ? "pop" : null)
    setPicked(false)
  }
  /** Leaves settings for the builder, and then does the thing. */
  const thenClose = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const ctx: SettingsContext = {
    installId,
    name,
    websiteUrl,
    websiteUrlDisplay,
    storeName,
    displayName,
    live,
    publishedAt,
    settings,
    onSettingChange,
    pages,
    productCount,
    githubReturned,
    connectVia,
    go,
    onRenamed,
    onRestored,
    onHoldDraft,
    onEditPage: (key) => {
      onClose()
      onEditPage?.(key)
    },
    onAddPage: thenClose(onAddPage),
    onEditMenu: (handle?: string) => {
      onClose()
      onEditMenu(handle)
    },
    onOpenThemeGroup: (group: string) => {
      onClose()
      onOpenThemeGroup(group)
    },
    onOpenCode: thenClose(onOpenCode),
    onPublish: thenClose(onPublish),
    onUnpublished,
    onNavigate,
    ...navigation,
    onAddressChanged,
  }

  const current = SETTINGS_SECTIONS.find((s) => s.id === section)

  return createPortal(
    <SettingsLookContext.Provider value={look}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("Website settings")}
      data-ws-look={look}
      className="wb-settings-in fixed inset-0 z-[150] flex flex-col overflow-hidden bg-[#0f0f0f] text-white md:flex-row"
      /**
       * THE PHONE'S OWN FURNITURE IS NOT A SUGGESTION. This is pinned to the
       * viewport, and the viewport on a phone starts underneath the clock and
       * ends under the home indicator. The insets are real numbers the device
       * gives us; they are read once here and the whole surface stands
       * inside them.
       */
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* The list and the page share this box. On a phone they are stacked in
          it, the page over the list; from md they are two columns. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      {/* ── The subjects ──────────────────────────────────────────────── */}
      <aside
        ref={listRef}
        className={cn(
          /* The whole box on a phone, under the page; md:flex-none gives the
             desktop column its own width back, whatever is open. */
          "wb-slim-scroll flex min-h-0 flex-col overflow-y-auto overscroll-contain max-md:absolute max-md:inset-0 md:w-[264px] md:flex-none md:border-r md:border-white/10",
          /* Hidden under a page, never removed: it keeps its scroll for Back. */
          picked && moving !== "push" && "max-md:invisible",
        )}
        aria-hidden={picked && moving !== "push" ? true : undefined}
      >
        {/* The way out on the left, light or dark on the right: the screen's two controls of its own. */}
        <div className="flex items-center justify-between gap-2 px-3 pt-3 md:pl-6 md:pr-4 md:pt-7">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-white/80 transition-colors hover:text-white active:bg-white/[0.06] md:-ml-2 md:h-9 [-webkit-tap-highlight-color:transparent]"
          >
            <ArrowLeft className="h-[18px] w-[18px] md:h-4 md:w-4" strokeWidth={2} />
            {tt("Back to editor")}
          </button>
          <LookButton look={look} />
        </div>
        <p className="px-5 pt-5 text-[20px] font-semibold text-white md:px-6 md:pt-6 md:text-[17px]">{tt("Website settings")}</p>
        <nav aria-label={tt("Website settings")} className="flex flex-col px-3 pb-6">
          {SETTINGS_SECTIONS.map(({ id, label, group }, i) => {
            const active = section === id
            /* Each group under its own heading: the site, what is on it,
               going live, and Connections, which is how code reaches the
               site rather than a setting of it. */
            const startsGroup = SETTINGS_SECTIONS[i - 1]?.group !== group
            return (
              <Fragment key={id}>
              {startsGroup && (
                <p className={cn("px-3 pb-1.5 text-[12px] font-medium uppercase tracking-wider text-white/50", i === 0 ? "pt-4" : "pt-5")}>
                  {SETTINGS_GROUP_LABELS[group]}
                </p>
              )}
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 text-left transition-colors duration-150 [-webkit-tap-highlight-color:transparent]",
                  /* A phone's row: 52px and 16px words, the size of the list it is. */
                  "h-[52px] text-[16px] active:bg-white/[0.06] md:h-10 md:text-[15px]",
                  active ? "md:bg-white/[0.08] md:text-white" : "",
                  /* On a phone every row reads the same: which one was open last is not news. */
                  active ? "text-white/90 md:text-white" : "text-white/90 md:text-white/70 md:hover:bg-white/[0.05] md:hover:text-white",
                )}
              >
                <span>{label}</span>
                <ChevronRight className="h-[18px] w-[18px] text-white/30 md:hidden" />
              </button>
              </Fragment>
            )
          })}
        </nav>
      </aside>

      {/* ── One subject ───────────────────────────────────────────────── */}
      <main
        ref={panelRef}
        data-settings-page=""
        className={cn(
          "wb-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#0f0f0f] max-md:absolute max-md:inset-0 max-md:shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.6)]",
          !picked && moving !== "pop" && "max-md:hidden",
        )}
      >
        {/* A phone's own Back, to the list. Solid, not blurred: a blur on a
            bar that the page scrolls under is redrawn on every frame of the
            scroll. */}
        <div data-settings-bar="" className="sticky top-0 z-10 flex h-12 items-center border-b border-white/10 bg-[#0f0f0f] px-1.5 md:hidden">
          <button
            type="button"
            onClick={backToList}
            className="flex h-11 items-center gap-0.5 rounded-lg pl-1 pr-2.5 text-[16px] font-medium text-white/85 transition-colors active:bg-white/[0.06] [-webkit-tap-highlight-color:transparent]"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2} />
            {tt("Website Settings")}
          </button>
        </div>
        {/* A new subject fades in where it is: no rise, no scale. It rose 8px
            and grew from 98.5%, which on every switch read as a bump. On a
            phone the push is the motion, and the fade is left out
            (`[data-settings-page] .wb-settings-swap` in globals.css). */}
        {/* Round AK: the speed page's charts and tables a little wider on a big screen. */}
        <div key={section} className={cn("wb-settings-swap mx-auto w-full max-w-[860px] px-4 pb-[max(64px,calc(env(safe-area-inset-bottom)+32px))] pt-5 md:px-12 md:pb-14 md:pt-12", section === "performance" && "xl:max-w-[1040px]")} aria-label={current?.label}>
          {section === "general" && <GeneralSettings ctx={ctx} />}
          {section === "domains" && <DomainSettings ctx={ctx} />}
          {section === "seo" && <SeoSettings ctx={ctx} />}
          {section === "pages" && <PageSettings ctx={ctx} />}
          {section === "navigation" && <NavigationSettings ctx={ctx} />}
          {section === "commerce" && <CommerceSettings ctx={ctx} />}
          {section === "policies" && <PolicySettings ctx={ctx} />}
          {section === "apps" && <AppsSettings ctx={ctx} />}
          {section === "publishing" && <PublishingSettings ctx={ctx} />}
          {section === "performance" && <PerformanceSettings ctx={ctx} />}
          {section === "backups" && <BackupSettings ctx={ctx} />}
          {section === "connections" && <ConnectionsSettings ctx={ctx} />}
        </div>
      </main>
      </div>
    </div>
    </SettingsLookContext.Provider>,
    document.body,
  )
}
