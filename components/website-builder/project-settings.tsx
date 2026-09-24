"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { ConnectionsSettings } from "@/components/website-builder/website-settings/connections"
import { BackupSettings } from "@/components/website-builder/website-settings/backups"
import { CommerceSettings } from "@/components/website-builder/website-settings/commerce"
import { DomainSettings } from "@/components/website-builder/website-settings/domains"
import { GeneralSettings } from "@/components/website-builder/website-settings/general"
import { PageSettings } from "@/components/website-builder/website-settings/pages"
import { PolicySettings } from "@/components/website-builder/website-settings/policies"
import { PublishingSettings } from "@/components/website-builder/website-settings/publishing"
import { SeoSettings } from "@/components/website-builder/website-settings/seo"
import {
  SETTINGS_SECTIONS,
  type ConnectVia,
  type SettingsContext,
  type SettingsSection,
  type SitePage,
} from "@/components/website-builder/website-settings/types"

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
 * NINE SUBJECTS, EACH BACKED BY SOMETHING REAL. A control here is either an
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
 */

export function ProjectSettings({
  open,
  onClose,
  installId,
  name,
  onRenamed,
  websiteUrl,
  websiteUrlDisplay,
  live,
  publishedAt,
  onRestored,
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
  onOpenCode = () => {},
  onPublish = () => {},
  onUnpublished = () => {},
  onNavigate = (href) => window.location.assign(href),
  onAddressChanged = () => {},
}: {
  open: boolean
  onClose: () => void
  installId: string
  name: string
  onRenamed: (name: string) => void
  websiteUrl: string
  websiteUrlDisplay: string
  live: boolean
  publishedAt: string | null
  /** A backup has been written into the draft; the editor must reload it. */
  onRestored?: () => void
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
  onEditMenu?: () => void
  onOpenCode?: () => void
  onPublish?: () => void
  onAddressChanged?: (handle: string) => void
  onUnpublished?: () => void
  onNavigate?: (href: string) => void
}) {
  const [section, setSection] = useState<SettingsSection>("general")
  /** A phone shows the list until a subject is picked. */
  const [picked, setPicked] = useState(false)
  const panelRef = useRef<HTMLElement | null>(null)

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
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  /* A new subject starts at its top, not wherever the last one was scrolled to. */
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [section])

  if (!open) return null
  if (typeof document === "undefined") return null

  const go = (next: SettingsSection) => {
    setSection(next)
    setPicked(true)
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
    onEditPage: (key) => {
      onClose()
      onEditPage?.(key)
    },
    onAddPage: thenClose(onAddPage),
    onEditMenu: thenClose(onEditMenu),
    onOpenCode: thenClose(onOpenCode),
    onPublish: thenClose(onPublish),
    onUnpublished,
    onNavigate,
    onAddressChanged,
  }

  const current = SETTINGS_SECTIONS.find((s) => s.id === section)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Website settings"
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
      {/* ── The subjects ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          /* flex-1 fills a phone with the list; md:flex-none gives the
             desktop column its own width back, whatever is open. */
          "min-h-0 shrink-0 flex-col overflow-y-auto md:flex md:w-[264px] md:flex-none md:border-r md:border-white/10",
          picked ? "hidden" : "flex flex-1",
        )}
      >
        <div className="px-5 pt-5 md:px-6 md:pt-7">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center gap-2 rounded-lg text-[15px] font-medium text-white/80 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to editor
          </button>
        </div>
        <p className="px-5 pb-2 pt-6 text-[12px] font-medium uppercase tracking-wider text-white/40 md:px-6">Website Settings</p>
        <nav aria-label="Website settings" className="flex flex-col px-3 pb-6">
          {SETTINGS_SECTIONS.map(({ id, label, group }, i) => {
            const active = section === id
            /* Connections is how code reaches the site, not a setting of it,
               so it stands under its own heading after the site's pages. */
            const startsGroup = group === "code" && SETTINGS_SECTIONS[i - 1]?.group !== "code"
            return (
              <Fragment key={id}>
              {startsGroup && (
                <p className="mt-4 border-t border-white/10 px-3 pb-2 pt-5 text-[12px] font-medium uppercase tracking-wider text-white/40">Code</p>
              )}
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 text-left text-[15px] transition-colors duration-150",
                  "h-12 md:h-10",
                  active ? "md:bg-white/[0.08] md:text-white" : "",
                  active ? "text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <span>{label}</span>
                <ChevronRight className="h-4 w-4 text-white/30 md:hidden" />
              </button>
              </Fragment>
            )
          })}
        </nav>
      </aside>

      {/* ── One subject ───────────────────────────────────────────────── */}
      <main ref={panelRef} className={cn("wb-slim-scroll min-h-0 flex-1 overflow-y-auto", !picked && "hidden md:block")}>
        {/* A phone's own Back, to the list. */}
        <div className="sticky top-0 z-10 flex h-12 items-center border-b border-white/10 bg-[#0f0f0f]/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setPicked(false)}
            className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-white/80"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Website Settings
          </button>
        </div>
        {/* A new subject fades in where it is: no rise, no scale. It rose 8px
            and grew from 98.5%, which on every switch read as a bump. */}
        <div key={section} className="wb-settings-swap mx-auto w-full max-w-[860px] px-5 pb-16 pt-6 md:px-12 md:pb-14 md:pt-12" aria-label={current?.label}>
          {section === "general" && <GeneralSettings ctx={ctx} />}
          {section === "domains" && <DomainSettings ctx={ctx} />}
          {section === "seo" && <SeoSettings ctx={ctx} />}
          {section === "pages" && <PageSettings ctx={ctx} />}
          {section === "commerce" && <CommerceSettings ctx={ctx} />}
          {section === "policies" && <PolicySettings ctx={ctx} />}
          {section === "publishing" && <PublishingSettings ctx={ctx} />}
          {section === "backups" && <BackupSettings ctx={ctx} />}
          {section === "connections" && <ConnectionsSettings ctx={ctx} />}
        </div>
      </main>
    </div>,
    document.body,
  )
}
