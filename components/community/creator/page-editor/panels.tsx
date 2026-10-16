"use client"

/**
 * ===========================================================================
 *  ONE PART OF THE PAGE, AND WHAT CHANGES IT (round 33)
 * ===========================================================================
 * The editor a part opens, in the side panel on a computer and the bottom
 * sheet on a phone (./page-editor.tsx). Each writes straight into the
 * draft, so the page in the preview changes as it is typed; nothing is
 * saved until Save.
 *
 *   cover        the picture or video across the page (Settings' cover
 *                field, ../gallery-editor.tsx CoverField), then what stays
 *                in view when it is cropped (./cover-focus.tsx)
 *   gallery      the pictures and videos after it (../gallery-editor.tsx)
 *   logo         the square picture by the name
 *   name, tagline
 *   description  the product page's own rich text editor
 *                (components/app/rich-text-editor.tsx): headings, lists,
 *                links, pictures, emoji, as HTML the server cleans with the
 *                product description's allow list
 *   links        a network and a name or an address (./links-editor.tsx)
 *   benefits     what members get, a line each
 *   join         the button's words, its style, a line under it
 *   faq          the questions people ask before joining
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { uploadDescriptionImage } from "@/lib/rich-text/upload-image"
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { MAX_BENEFITS, MAX_FAQ } from "@/lib/communities/limits"
import { JOIN_LABEL_MAX, JOIN_NOTE_MAX, buttonBrand, type JoinStyle, type PageLook } from "@/lib/communities/page-look"
import { CoverField, GalleryEditor } from "../gallery-editor"
import { GALLERY_MAX, coverItem } from "../logic"
import { PicturePick, field, label } from "../parts"
import type { GalleryVideoView } from "../view-types"
import { CoverFocus } from "./cover-focus"
import { LinksEditor } from "./links-editor"
import { ListEditor, PairEditor } from "./list-editors"
import type { PageBlock, PageDraft } from "./draft"

/** Each part's name, and the line under it saying where it shows. */
export const BLOCK_INFO: Record<PageBlock, { title: string; line: string }> = {
  cover: { get title() { return tt("Cover") }, get line() { return tt("The picture or video at the top. It also shows on your card in Explore.") } },
  gallery: { get title() { return tt("Gallery") }, get line() { return tt("More pictures and videos, after the cover, in this order.") } },
  logo: { get title() { return tt("Logo") }, get line() { return tt("The square picture by the name, in the bar and on cards.") } },
  name: { get title() { return tt("Name") }, get line() { return tt("The community's name, everywhere it shows.") } },
  tagline: { get title() { return tt("Tagline") }, get line() { return tt("One line under the name, on cards and in Explore.") } },
  description: { get title() { return tt("Description") }, get line() { return tt("What it is about, who it is for, what happens in it.") } },
  links: { get title() { return tt("Links") }, get line() { return tt("Your website and social pages, as icons under the name.") } },
  benefits: { get title() { return tt("What members get") }, get line() { return tt("A line each, with a check beside it.") } },
  join: { get title() { return tt("Join button") }, get line() { return tt("Its words, its style and a short line under it.") } },
  faq: { get title() { return tt("Questions") }, get line() { return tt("Answers to what people ask before joining.") } },
}

export interface PanelProps {
  block: PageBlock
  draft: PageDraft
  set: <K extends keyof PageDraft>(k: K, v: PageDraft[K]) => void
  setMany: (patch: Partial<PageDraft>) => void
  communityId: string
  creatorId: string
  videos: Record<string, GalleryVideoView>
  galleryReady: boolean
  /** The words the button has when the creator gives it none. */
  defaultJoinLabel: string
  /** Whether the button asks to join (approval) rather than joins. */
  requests: boolean
  free: boolean
  onError: (message: string | null) => void
  onBusy: (what: "cover" | "gallery", busy: boolean) => void
  onLinks: (links: PageDraft["links"], invalid: number) => void
  brandBusy: boolean
  onPickBrand: () => void
}

export function BlockPanel(p: PanelProps) {
  const { block, draft: d, set } = p
  switch (block) {
    case "cover": {
      /* A picture is shown once, as the frames crop it, to be dragged; a video or no cover is the cover field's own frame. */
      const picture = !!d.coverUrl && !coverItem(d.gallery)
      return (
        <div className="space-y-3" data-panel="cover">
          {picture && d.coverUrl ? (
            <>
              <CoverFocus url={d.coverUrl} x={d.look.coverX} y={d.look.coverY} onChange={(x, y) => set("look", { ...d.look, coverX: x, coverY: y })} />
              <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("Drag the picture to choose what stays in view where it is cropped: the card beside your page, your card in Explore.")}</p>
            </>
          ) : null}
          <CoverField
            communityId={p.communityId}
            coverUrl={d.coverUrl}
            gallery={d.gallery}
            pictureFrame={false}
            onBusy={(b) => p.onBusy("cover", b)}
            onChange={(next) => p.setMany({ coverUrl: next.coverUrl, gallery: next.gallery })}
            onError={(m) => p.onError(m)}
          />
        </div>
      )
    }
    case "gallery": {
      const cover = coverItem(d.gallery)
      return (
        <div data-panel="gallery">
          <GalleryEditor
            communityId={p.communityId}
            value={cover ? d.gallery.slice(1) : d.gallery}
            onChange={(v) => set("gallery", cover ? [cover, ...v] : v)}
            max={cover ? GALLERY_MAX - 1 : GALLERY_MAX}
            videos={p.videos}
            ready={p.galleryReady}
            onError={(m) => p.onError(m)}
            onBusy={(b) => p.onBusy("gallery", b)}
          />
        </div>
      )
    }
    case "logo":
      return (
        <div data-panel="logo">
          <PicturePick value={d.logoUrl} onChange={(v) => set("logoUrl", v)} shape="square" name={tt("logo")} onError={(m) => p.onError(m)} />
        </div>
      )
    case "name":
      return (
        <div data-panel="name">
          <label htmlFor="pe-name" className="sr-only">
            {tt("Name")}
          </label>
          <input id="pe-name" value={d.name} onChange={(e) => set("name", e.target.value.slice(0, 80))} className={cn(field, "h-11 sm:h-10")} autoComplete="off" data-autofocus="" />
          <p className="mt-1.5 text-right text-[12px] tabular-nums text-[#9ca3af]">{d.name.length}/80</p>
        </div>
      )
    case "tagline":
      return (
        <div data-panel="tagline">
          <label htmlFor="pe-tagline" className="sr-only">
            {tt("Tagline")}
          </label>
          <input id="pe-tagline" value={d.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 160))} placeholder={tt("Weekly critiques for people learning to throw")} className={cn(field, "h-11 sm:h-10")} autoComplete="off" data-autofocus="" />
          <p className="mt-1.5 text-right text-[12px] tabular-nums text-[#9ca3af]">{d.tagline.length}/160</p>
        </div>
      )
    case "description":
      return (
        <div data-panel="description">
          <RichTextEditor
            value={d.descriptionHtml}
            onChange={(html) => set("descriptionHtml", html)}
            label={tt("Description")}
            placeholder={tt("Who it is for, what happens in it, and how often")}
            uploadImage={(file) => uploadDescriptionImage(file, { creatorId: p.creatorId, productId: null })}
            checkSize={descriptionTooLong}
            minHeight={220}
            resizable
          />
        </div>
      )
    case "links":
      return (
        <div data-panel="links">
          <LinksEditor links={d.links} onChange={p.onLinks} />
        </div>
      )
    case "benefits":
      return (
        <div data-panel="benefits">
          <ListEditor items={d.benefits} onChange={(v) => set("benefits", v)} max={MAX_BENEFITS} placeholder={tt("A live call every week")} addLabel={tt("Add a line")} />
        </div>
      )
    case "faq":
      return (
        <div data-panel="faq">
          <PairEditor items={d.faq.map((r) => ({ a: r.q, b: r.a }))} onChange={(v) => set("faq", v.map((x) => ({ q: x.a, a: x.b })))} max={MAX_FAQ} aPlaceholder={tt("Who is it for?")} bPlaceholder={tt("The answer")} addLabel={tt("Add a question")} />
        </div>
      )
    case "join":
      return <JoinPanel {...p} />
  }
}

/* ── The join button ─────────────────────────────────────────────────── */

const SAMPLE = "pointer-events-none inline-flex h-9 w-full items-center justify-center rounded-[10px] border px-1.5 text-[12px] font-semibold"

function JoinPanel(p: PanelProps) {
  const look = p.draft.look
  const setLook = (patch: Partial<PageLook>) => p.set("look", { ...look, ...patch })
  const brand = buttonBrand(look.brand)
  const suggestions = [p.free ? tt("Join for free") : null, tt("Get access"), tt("Join now"), p.requests ? tt("Request access") : null].filter((s): s is string => !!s)
  const shownLabel = look.joinLabel.trim() || p.defaultJoinLabel
  const styles: { value: JoinStyle; title: string; detail: string }[] = [
    { value: "ink", title: tt("Ink"), detail: tt("Storelib's dark button") },
    { value: "brand", title: tt("Your colour"), detail: p.draft.logoUrl ? (p.brandBusy ? tt("Reading your logo") : brand ? tt("From your logo") : tt("No colour found in your logo")) : tt("Add a logo first") },
    { value: "outline", title: tt("Outline"), detail: tt("White with a dark edge") },
  ]
  const picker = React.useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-6" data-panel="join">
      <div>
        <label htmlFor="pe-join-label" className={label}>
          {tt("Words on the button")}
        </label>
        <input id="pe-join-label" value={look.joinLabel} onChange={(e) => setLook({ joinLabel: e.target.value.slice(0, JOIN_LABEL_MAX) })} placeholder={p.defaultJoinLabel} className={cn(field, "h-11 sm:h-10")} autoComplete="off" data-autofocus="" />
        <div className="mt-2 flex flex-wrap gap-1.5" data-join-suggestions="">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setLook({ joinLabel: s })}
              aria-pressed={look.joinLabel === s}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-2.5 text-[13px] outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8",
                look.joinLabel === s ? "border-[#1a1a2e] bg-white font-medium text-[#1a1a2e]" : "border-[#e1e3e7] bg-white text-[#4b5563] hover:border-[#c9ccd2] hover:text-[#1a1a2e]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-[#6b7280]">{look.joinLabel.trim() ? tt("Shown on the button wherever people join.") : tt("Empty, the button says “{label}”.", { label: p.defaultJoinLabel })}</p>
      </div>

      <div>
        <p className={label} id="pe-join-style">
          {tt("Style")}
        </p>
        <div role="radiogroup" aria-labelledby="pe-join-style" className="grid grid-cols-3 gap-2" data-join-styles="">
          {styles.map((s) => {
            const on = look.joinStyle === s.value
            const off = s.value === "brand" && !p.draft.logoUrl
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={off}
                onClick={() => {
                  setLook({ joinStyle: s.value })
                  if (s.value === "brand" && !look.brand) p.onPickBrand()
                }}
                data-join-style-option={s.value}
                className={cn(
                  "flex min-w-0 flex-col items-stretch gap-2 rounded-xl border bg-white p-2.5 text-left outline-none transition-[border-color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-not-allowed disabled:opacity-55",
                  on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e1e3e7] hover:border-[#c9ccd2]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(SAMPLE, s.value === "outline" ? "border-[#1a1a2e] bg-white text-[#1a1a2e]" : s.value === "brand" && brand ? "text-white" : "border-[#1a1a2e] bg-[#1a1a2e] text-white")}
                  style={s.value === "brand" && brand ? { backgroundColor: brand, borderColor: brand } : undefined}
                >
                  <span className="truncate">{shownLabel}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#1a1a2e]">{s.title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-[#6b7280]">{s.detail}</span>
                </span>
              </button>
            )
          })}
        </div>
        {look.joinStyle === "brand" ? (
          <div className="mt-2.5 flex items-center gap-2.5" data-join-brand={brand ?? ""}>
            <span aria-hidden className="h-6 w-6 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(16,24,40,0.12)]" style={{ backgroundColor: brand ?? "#1a1a2e" }} />
            <span className="min-w-0 flex-1 text-[12.5px] text-[#6b7280]">{brand ? tt("Darkened where needed, so white words on it are easy to read.") : tt("Pick a colour instead.")}</span>
            <button type="button" onClick={() => picker.current?.click()} className="shrink-0 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
              {tt("Pick a colour")}
            </button>
            <input ref={picker} type="color" value={look.brand ?? "#1a1a2e"} onChange={(e) => setLook({ brand: e.target.value.toLowerCase() })} className="sr-only" tabIndex={-1} aria-label={tt("Button colour")} />
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="pe-join-note" className={label}>
          {tt("Line under the button")}
        </label>
        <input id="pe-join-note" value={look.joinNote} onChange={(e) => setLook({ joinNote: e.target.value.slice(0, JOIN_NOTE_MAX) })} placeholder={p.free ? tt("No card needed") : tt("Cancel any time")} className={cn(field, "h-11 sm:h-10")} autoComplete="off" />
        <p className="mt-1.5 text-right text-[12px] tabular-nums text-[#9ca3af]">
          {look.joinNote.length}/{JOIN_NOTE_MAX}
        </p>
      </div>
    </div>
  )
}
