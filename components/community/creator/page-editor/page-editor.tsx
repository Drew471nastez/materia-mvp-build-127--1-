"use client"

/**
 * ===========================================================================
 *  THE PAGE EDITOR (round 33)
 * ===========================================================================
 * /app/community/<slug>/page. The owner: "the Page editor should be the
 * best: show the actual community page as it looks to visitors, with
 * subtle Edit buttons on each editable block that open the right editor in
 * a side panel (desktop) or bottom sheet (phone), changes reflected live,
 * one Save bar."
 *
 *   THE PAGE      the About page itself (components/community/public/
 *                 sales-page.tsx), drawn from the draft (./draft.ts
 *                 previewData) into a frame 1440px or 390px wide
 *                 (./preview-frame.tsx), Computer or Phone above it. A
 *                 press on a part opens its editor; the part being edited
 *                 keeps an outline.
 *   THE PANEL     from 1024px, beside the page: the list of the parts with
 *                 what each holds now, or the one open (./panels.tsx) under
 *                 a way back to the list. Below 1024px the list is under the
 *                 page and a part opens in the bottom sheet, the page still
 *                 showing above it.
 *   SAVE          one bar for everything: in the row above the page from
 *                 1024px; on a phone and a tablet the /app save bar
 *                 (../parts EditorFoot), which rises only with a change.
 *                 Save sends what changed (./draft.ts changedBody), waits
 *                 for uploads and for a link that is not an address yet.
 *
 * THE BUTTON'S COLOUR FROM THE LOGO. Picking "Your colour" reads the logo
 * into a 48px canvas (through the image optimiser, the site's own origin,
 * so the canvas can be read) and takes its commonest saturated colour
 * (lib/communities/page-look.ts dominantColour); a new logo reads it again.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { announceCommunityUpdated } from "@/lib/communities/updated-signal"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { DEFAULT_LOOK, dominantColour, type PageLook } from "@/lib/communities/page-look"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { toEditorHtml } from "@/lib/rich-text/html"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { JoinSurface } from "@/components/community/public/join-controls"
import type { SalesPageData } from "@/components/community/public/types"
import { coverItem } from "../logic"
import { EditorFoot, Segmented, buttonPrimary, buttonSecondary, card, errorText, send, useToast } from "../parts"
import type { CommunityHead, SettingsData } from "../view-types"
import { PAGE_BLOCKS, changedBody, isPageBlock, previewData, type PageBlock, type PageDraft } from "./draft"
import { BLOCK_INFO, BlockPanel } from "./panels"
import { PreviewDocument, PreviewFrame, type Device } from "./preview-frame"
import { PreviewChrome } from "./preview-chrome"

function draftOf(head: CommunityHead, data: SettingsData): PageDraft {
  return {
    name: head.name,
    tagline: data.tagline ?? "",
    descriptionHtml: toEditorHtml(data.descriptionHtml ?? data.description),
    logoUrl: head.logoUrl,
    coverUrl: head.coverUrl,
    gallery: data.gallery,
    benefits: data.benefits,
    faq: data.faq,
    links: data.links,
    look: data.pageLook ?? DEFAULT_LOOK,
  }
}

function useWide(): boolean {
  return React.useSyncExternalStore(
    (f) => {
      const mq = window.matchMedia("(min-width: 1024px)")
      mq.addEventListener("change", f)
      return () => mq.removeEventListener("change", f)
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  )
}

/** The logo's commonest saturated colour, or null (no logo, or nothing but greys in it). */
async function logoColour(url: string): Promise<string | null> {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  img.src = optimizedImageUrl(url, 32)
  try {
    await img.decode()
  } catch {
    return null
  }
  const size = 48
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext("2d", { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0, size, size)
  try {
    return dominantColour(g.getImageData(0, 0, size, size).data)
  } catch {
    return null
  }
}

/** What a part holds now, for its row in the list. */
function summary(block: PageBlock, d: PageDraft, defaultJoin: string): string {
  switch (block) {
    case "cover": {
      const v = coverItem(d.gallery)
      return v ? tt("A video") : d.coverUrl ? (d.look.coverX === 50 && d.look.coverY === 50 ? tt("A picture") : tt("A picture, moved")) : tt("None yet")
    }
    case "gallery": {
      const n = d.gallery.length - (coverItem(d.gallery) ? 1 : 0)
      return n ? tt("{n, plural, one {# picture or video} other {# pictures and videos}}", { n }) : tt("None yet")
    }
    case "logo":
      return d.logoUrl ? tt("Added") : tt("None yet")
    case "name":
      return d.name
    case "tagline":
      return d.tagline || tt("None yet")
    case "description":
      return htmlToPlainText(d.descriptionHtml).replace(/\s+/g, " ").trim().slice(0, 80) || tt("None yet")
    case "links": {
      const n = d.links.length
      return n ? tt("{n, plural, one {# link} other {# links}}", { n }) : tt("None yet")
    }
    case "benefits": {
      const n = d.benefits.filter((b) => b.trim()).length
      return n ? tt("{n, plural, one {# line} other {# lines}}", { n }) : tt("None yet")
    }
    case "join":
      return d.look.joinLabel.trim() || defaultJoin
    case "faq": {
      const n = d.faq.length
      return n ? tt("{n, plural, one {# question} other {# questions}}", { n }) : tt("None yet")
    }
  }
}

/** The page inside the frame: its bar, its columns, the About page drawn from the draft. */
function FramedPage({ data }: { data: SalesPageData }) {
  const doc = React.useContext(PreviewDocument)
  return (
    <JoinSurface.Provider value={doc?.body ?? null}>
      <PreviewChrome community={data.community}>
        <CommunitySalesPage data={data} editing />
      </PreviewChrome>
    </JoinSurface.Provider>
  )
}

export function PageEditor({ head, data, preview, creatorId }: { head: CommunityHead; data: SettingsData; preview: SalesPageData | null; creatorId: string }) {
  const router = useRouter()
  const toast = useToast()
  const wide = useWide()
  const start = React.useMemo(() => draftOf(head, data), [head, data])
  const [saved, setSaved] = React.useState(start)
  const [d, setD] = React.useState(start)
  const [open, setOpen] = React.useState<PageBlock | null>(null)
  const [focus, setFocus] = React.useState<{ block: string } | null>(null)
  const [device, setDevice] = React.useState<Device>("desktop")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [uploads, setUploads] = React.useState<{ cover: boolean; gallery: boolean }>({ cover: false, gallery: false })
  const [badLinks, setBadLinks] = React.useState(0)
  const [brandBusy, setBrandBusy] = React.useState(false)
  const uploading = uploads.cover || uploads.gallery
  const body = React.useMemo(() => changedBody(saved, d), [saved, d])
  const dirty = Object.keys(body).length > 0

  /* A phone opens on the phone's page. */
  React.useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) setDevice("phone")
  }, [])
  /* The server drew the page again (a save, a change elsewhere) while nothing was changed here: start from it. */
  const dirtyRef = React.useRef(dirty)
  dirtyRef.current = dirty
  React.useEffect(() => {
    if (dirtyRef.current) return
    setSaved(start)
    setD(start)
  }, [start])

  const set = React.useCallback(<K extends keyof PageDraft>(k: K, v: PageDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setError(null)
  }, [])
  const setMany = React.useCallback((patch: Partial<PageDraft>) => {
    setD((x) => ({ ...x, ...patch }))
    setError(null)
  }, [])

  const readBrand = React.useCallback(async (logo: string | null) => {
    if (!logo) return
    setBrandBusy(true)
    const colour = await logoColour(logo)
    setBrandBusy(false)
    setD((x) => ({ ...x, look: { ...x.look, brand: colour } }))
  }, [])
  /* A new logo while the button is in the community's colour: its colour is read again. */
  const lastLogo = React.useRef(d.logoUrl)
  React.useEffect(() => {
    if (lastLogo.current === d.logoUrl) return
    lastLogo.current = d.logoUrl
    if (d.look.joinStyle === "brand") void readBrand(d.logoUrl)
  }, [d.logoUrl, d.look.joinStyle, readBrand])

  const videos = data.galleryVideos
  const shown = React.useMemo(() => (preview ? previewData(preview, d, videos) : null), [preview, d, videos])
  const defaultJoin = preview?.join.label || tt("Join")

  const pick = React.useCallback((b: string) => {
    if (!isPageBlock(b)) return
    setOpen(b)
  }, [])
  const choose = (b: PageBlock) => {
    setOpen(b)
    setFocus({ block: b })
  }

  const save = async () => {
    if (badLinks) return setError(tt("A link is not an address yet. Fix it or remove it."))
    if (!dirty) return
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(d)
    toast(tt("Saved"))
    router.refresh()
    announceCommunityUpdated(head.id)
  }
  const reset = () => {
    setD(saved)
    setError(null)
    setBadLinks(0)
  }

  const labels = React.useMemo(() => Object.fromEntries(PAGE_BLOCKS.map((b) => [b, BLOCK_INFO[b].title])), [])
  const panelProps = open
    ? {
        block: open,
        draft: d,
        set,
        setMany,
        communityId: head.id,
        creatorId,
        videos,
        galleryReady: data.galleryReady,
        defaultJoinLabel: defaultJoin,
        requests: preview?.join.kind === "request",
        free: preview ? preview.join.kind === "join_free" || preview.join.option?.kind === "free" : true,
        onError: (m: string | null) => setError(m),
        onBusy: (what: "cover" | "gallery", b: boolean) => setUploads((u) => (u[what] === b ? u : { ...u, [what]: b })),
        onLinks: (links: PageDraft["links"], invalid: number) => {
          set("links", links)
          setBadLinks(invalid)
        },
        brandBusy,
        onPickBrand: () => void readBrand(d.logoUrl),
      }
    : null

  const status = error ?? (uploading ? tt("Uploading") : busy ? tt("Saving") : dirty ? tt("Unsaved changes") : tt("Everything is saved"))

  const list = (
    <ul className="divide-y divide-[#f1f2f4]" data-page-parts="">
      {PAGE_BLOCKS.map((b) => (
        <li key={b}>
          <button
            type="button"
            onClick={() => choose(b)}
            data-page-part={b}
            aria-current={open === b ? "true" : undefined}
            className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left outline-none transition-colors duration-100 hover:bg-[#f8f9fa] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent] sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium leading-5 text-[#1a1a2e]">{BLOCK_INFO[b].title}</span>
              <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280]">{summary(b, d, defaultJoin)}</span>
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
          </button>
        </li>
      ))}
    </ul>
  )

  const panel = panelProps ? (
    <div data-page-panel={panelProps.block}>
      <p className="text-[13.5px] leading-5 text-[#6b7280]">{BLOCK_INFO[panelProps.block].line}</p>
      <div className="mt-4">
        <BlockPanel {...panelProps} />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-[#b42318]" data-page-panel-error="">
          {error}
        </p>
      ) : null}
    </div>
  ) : null

  return (
    <div data-page-editor="" data-device={device} className="space-y-3 lg:space-y-4">
      {/* The row above the page: which screen, and from 1024px the one Save for everything. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2" data-page-toolbar="">
        <Segmented
          value={device}
          onChange={setDevice}
          label={tt("Preview on")}
          options={[
            { value: "desktop", label: tt("Computer") },
            { value: "phone", label: tt("Phone") },
          ]}
        />
        <p className={cn("hidden min-w-0 flex-1 items-center gap-2 truncate text-[13.5px] lg:flex", error ? "text-[#b42318]" : "text-[#6b7280]")} role="status" data-page-status={error ? "error" : dirty ? "dirty" : "saved"}>
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", error ? "bg-[#d92d20]" : dirty || uploading ? "bg-[#e8a400]" : "bg-[#22a06b]")} />
          <span className="truncate">{status}</span>
        </p>
        <div className="ml-auto hidden items-center gap-2 lg:flex" data-page-save="">
          <button type="button" onClick={reset} disabled={!dirty || busy} className={cn(buttonSecondary, "disabled:cursor-default disabled:opacity-50")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={!dirty || busy || uploading} className={cn(buttonPrimary, "min-w-[72px] justify-center")} data-page-save-button="">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-5">
        <section className={cn(card, "h-[min(76dvh,760px)] overflow-hidden lg:h-[max(560px,calc(var(--vv-h,100dvh)-236px))]")} aria-label={tt("Your page")} data-page-preview-card="">
          {shown ? (
            <PreviewFrame device={device} selected={open} labels={labels} onPick={pick} focus={focus}>
              <FramedPage data={shown} />
            </PreviewFrame>
          ) : (
            <p className="p-6 text-[14px] text-[#6b7280]">{tt("The page could not be read. Reload to try again.")}</p>
          )}
        </section>

        {/* From 1024px: the parts, or the one open, beside the page. */}
        <aside className={cn(card, "hidden overflow-hidden lg:flex lg:h-[max(560px,calc(var(--vv-h,100dvh)-236px))] lg:flex-col")} data-page-side="">
          {open ? (
            <>
              <div className="flex shrink-0 items-center gap-1 border-b border-[#f1f2f4] px-2 py-2">
                <button type="button" onClick={() => setOpen(null)} className="inline-flex h-9 items-center gap-1 rounded-lg pl-1.5 pr-2.5 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-page-back="">
                  <ChevronLeft aria-hidden className="h-[18px] w-[18px]" />
                  {tt("All parts")}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4" data-page-side-body="">
                <h2 className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{BLOCK_INFO[open].title}</h2>
                <div className="mt-0.5">{panel}</div>
              </div>
            </>
          ) : (
            <>
              <div className="shrink-0 px-5 pb-2 pt-4">
                <h2 className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{tt("Your page")}</h2>
                <p className="mt-0.5 text-[13.5px] leading-5 text-[#6b7280]">{tt("Press any part of the page to change it, or pick it here.")}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2">{list}</div>
            </>
          )}
        </aside>
      </div>

      {/* Below 1024px: the parts under the page, each opening in the bottom sheet; the save bar rises with a change. */}
      {!wide ? (
        <>
          <section className={cn(card, "overflow-hidden lg:hidden")} data-page-parts-card="">
            <div className="px-4 pb-1 pt-3.5 sm:px-5">
              <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{tt("Your page")}</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-[#6b7280]">{tt("Tap any part of the page to change it, or pick it here.")}</p>
            </div>
            {list}
          </section>
          <BottomSheet
            isOpen={!!open}
            onClose={() => setOpen(null)}
            label={open ? BLOCK_INFO[open].title : tt("Your page")}
            hideFrom={null}
            fill
            aboveKeyboard
            maxHeight="calc(var(--vv-h, 100dvh) * 0.62)"
          >
            {open ? (
              <div className="flex min-h-0 flex-1 flex-col" data-page-sheet={open}>
                <div className="shrink-0 px-5 pb-2 pt-1">
                  <h2 className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{BLOCK_INFO[open].title}</h2>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4" data-page-sheet-body="">
                  {panel}
                </div>
                <div className="shrink-0 border-t border-[#f1f2f4] px-5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3">
                  <button type="button" onClick={() => setOpen(null)} className={cn(buttonPrimary, "h-11 w-full justify-center text-[15px]")} data-page-sheet-done="">
                    {tt("Done")}
                  </button>
                </div>
              </div>
            ) : null}
          </BottomSheet>
          <EditorFoot dirty={dirty} busy={busy && !uploading} busyText={uploading ? tt("Uploading") : undefined} error={error && !open ? error : null} onSave={() => void save()} onCancel={reset} />
        </>
      ) : null}
    </div>
  )
}
