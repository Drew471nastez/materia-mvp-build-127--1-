"use client"

/**
 * ===========================================================================
 *  EVERY BLOCK'S TWO TABS: SETTINGS AND LAYOUT
 * ===========================================================================
 * The owner: "the block needs to be consistent like the other blocks in the
 * OnePage, with these Settings and Layout tabs". A link had them; a shelf of
 * products had a column of chips and a folded "Appearance & description"
 * panel underneath, and most other blocks had the same panel. Now every block
 * opens on the same two tabs (components/onepage/tabs/links-tab BlockEditor):
 *
 *   Settings  what it shows and where it goes: content, the destination, the
 *             description line, then Sensitive and Schedule.
 *   Layout    how it looks: the block's own layouts as pictures, then the
 *             shared style rows below, only those the block uses
 *             (lib/onepage/block-presentation layoutControlsFor).
 *
 * Everything here writes style.presentation by spreading what is stored, so
 * no saved field is lost, and the same presentation is drawn by
 * components/onepage/block-presentation for the editor's preview, the live
 * preview and the published page.
 */
import * as React from "react"
import { Check, LayoutGrid, RotateCcw, Settings, Sparkles } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ColorRow, LabeledRow, RangeRow, Segmented, Switch } from "@/components/onepage/editor-kit"
import { ChoiceMark } from "@/components/onepage/choice-marks"
import { tipStyleOf } from "@/lib/onepage/tips"
import {
  BLOCK_ASPECTS,
  LINK_LAYOUTS,
  blockSurfaceOf,
  blockTakesDescription,
  layoutControlsFor,
  linkLayoutHasImage,
  linkLayoutOf,
  linkLayoutPatch,
  presentationOf,
  socialPresentation,
  socialProfile,
  type BlockAspect,
  type BlockPresentation,
  type BlockShadow,
  type LinkLayout,
} from "@/lib/onepage/block-presentation"
import type { LinkButtonBlockData, OnePageBlock, OnePageTheme } from "@/lib/onepage/types"
import { restorePreview } from "@/lib/onepage/link-preview"
import { resolveLinkIcon } from "./link-icons"
import { LinkIcon } from "./brand-icons"
import { useBlockPart } from "./block-part"
/* Every field in an open block in Storelib's own look (round AL): see the file. */
import "./block-fields.css"

/* ── The two tabs ───────────────────────────────────────────────────────── */

const TAB =
  "flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]"

/** Settings | Layout, the two big outlined buttons a link block always had. */
export function BlockEditorTabs({ settings, layout, firstLabel, firstIcon }: { settings: React.ReactNode; layout: React.ReactNode; firstLabel?: string; firstIcon?: React.ReactNode }) {
  return (
    <Tabs defaultValue="settings" className="w-full" data-block-tabs="">
      <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
        <TabsTrigger value="settings" className={TAB} data-block-tab="settings">
          {firstIcon ?? <Settings className="w-3.5 h-3.5" />}
          {firstLabel ?? tt("Settings")}
        </TabsTrigger>
        <TabsTrigger value="layout" className={TAB} data-block-tab="layout">
          <LayoutGrid className="w-3.5 h-3.5" />
          {tt("Layout")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-0">
        {settings}
      </TabsContent>
      <TabsContent value="layout" className="mt-0 space-y-5">
        {layout}
      </TabsContent>
    </Tabs>
  )
}

/*
  WHICH HALF A BLOCK'S OWN EDITOR DRAWS. Some editors were written with tabs
  of their own (email signup, images, documents, menus, bookings) or as one
  column (the shelf, posts). Inside BlockEditorTabs each is drawn twice, once
  per tab, and draws only the half this says; outside it (null) it draws all.
*/
export { BlockPartContext, useBlockPart, type BlockPart } from "./block-part"
/** The old inner <Tabs>: now just its children. */
export function PartTabs({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
/** The old inner tab buttons: the outer tabs replace them. */
export function PartHidden(_props: Record<string, unknown>) {
  return null
}
/** The old inner tab panel: drawn when its tab is the one open. */
export function PartContent({ value, className, children }: { value: string; className?: string; children?: React.ReactNode }) {
  const part = useBlockPart()
  if (part && part !== value) return null
  return <div className={className}>{children}</div>
}

/* ── Writing the presentation ───────────────────────────────────────────── */

type Change = (updates: Partial<OnePageBlock>) => void

/**
 * Two edits in one tick both land: each reads the block as it is now
 * (getBlock, the editor's latest page), not as it was when this rendered.
 */
export function usePresentationWriter(block: OnePageBlock, onChange: Change, getBlock?: () => OnePageBlock | undefined) {
  const latest = React.useRef(block)
  latest.current = block
  return React.useCallback(
    (patch: Partial<BlockPresentation>, data?: Record<string, unknown>) => {
      const source = getBlock?.() || latest.current
      onChange({
        style: { ...source.style, presentation: { ...source.style?.presentation, ...patch } },
        ...(data ? { data: { ...(source.data as object), ...data } as OnePageBlock["data"] } : {}),
      })
    },
    [getBlock, onChange],
  )
}

const heading = "text-[14px] font-semibold text-[#1a1a2e]"
/* The editor's text box (components/onepage/editor-kit fieldInput), as a box of a few lines. */
const textArea =
  "block w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] leading-[1.45] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"

/* ── Settings: the description line ─────────────────────────────────────── */

/** The optional line under a block. On a link it is the preview's description until it is typed over. */
export function BlockDescriptionField({ block, onChange, getBlock }: { block: OnePageBlock; onChange: Change; getBlock?: () => OnePageBlock | undefined }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  if (!blockTakesDescription(block.type)) return null
  const p = presentationOf(block)
  const link = block.type === "link_button" ? (block.data as LinkButtonBlockData) : null
  return (
    <label className="mt-5 block text-[13px] font-medium text-[#1a1a2e]" data-block-description-field="">
      {/* The words over the box sit on their own line with room under them: "Description (optional)" was glued to the box. */}
      <span className="mb-2 flex min-h-8 items-center justify-between gap-2 leading-[18px]">
        <span>
          {tt("Description")} <span className="font-normal text-[#6b7280]">{tt("(optional)")}</span>
        </span>
        {p.subtitle ? (
          <button
            type="button"
            className="h-8 rounded-lg px-1 text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e]"
            onClick={(e) => {
              e.preventDefault()
              write({ subtitle: "" }, link ? { link_preview: { ...link.link_preview, description_edited: true } } : undefined)
            }}
          >
            {tt("Remove")}
          </button>
        ) : null}
      </span>
      <textarea
        data-block-description=""
        rows={2}
        maxLength={600}
        value={p.subtitle ?? ""}
        placeholder={tt("A line under the title")}
        onChange={(e) => write({ subtitle: e.target.value }, link ? { link_preview: { ...link.link_preview, description_edited: true } } : undefined)}
        className={textArea}
      />
    </label>
  )
}

/* ── Settings: a link's automatic preview ───────────────────────────────── */

const hostOf = (url: string | undefined) => {
  try {
    return new URL(url || "").hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * The preview the server read for this address (lib/onepage/link-preview):
 * on or off, where it came from, Refresh, and Restore once something was
 * changed by hand. Turning it off takes away what it filled in and leaves
 * what the creator typed or uploaded.
 */
export function LinkPreviewControls({ block, onChange, getBlock, onRefresh }: { block: OnePageBlock; onChange: Change; getBlock?: () => OnePageBlock | undefined; onRefresh: () => void }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  const data = block.data as LinkButtonBlockData
  const lp = data.link_preview ?? {}
  const on = lp.enabled !== false
  const p = presentationOf(block)
  const edited = !!(lp.title_edited || lp.description_edited || lp.image_edited || lp.image_hidden)
  const host = hostOf(lp.url || data.url)
  return (
    <div className="space-y-2" data-link-preview-controls="">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-[#1a1a2e]">{tt("Automatic link preview")}</span>
          {on && lp.title && host ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-[#6b7280]" data-link-preview-source="">
              {lp.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lp.favicon} alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0 rounded-[3px]" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
              ) : null}
              <span className="truncate">{host}</span>
            </span>
          ) : null}
        </span>
        <Switch
          label={tt("Automatic link preview")}
          checked={on}
          onChange={(enabled) => {
            const fromPreview = data.thumbnail_url && data.thumbnail_url === lp.image && !lp.image_edited
            const subtitleFromPreview = !lp.description_edited && !!p.subtitle && p.subtitle === lp.description
            write(subtitleFromPreview && !enabled ? { subtitle: "" } : {}, { link_preview: { ...lp, enabled }, ...(!enabled && fromPreview ? { thumbnail_url: null } : {}) })
            if (enabled) onRefresh()
          }}
        />
      </div>
      {on && hostOf(data.url) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" data-link-preview-refresh="" onClick={onRefresh} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
            <RotateCcw className="h-3.5 w-3.5" />
            {tt("Refresh preview")}
          </button>
          {data.thumbnail_url ? (
            <button type="button" data-link-preview-remove-image="" onClick={() => write({}, { thumbnail_url: null, link_preview: { ...lp, image_hidden: true, image_edited: false } })} className="min-h-10 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
              {tt("Remove picture")}
            </button>
          ) : null}
          {edited && lp.title ? (
            <button
              type="button"
              data-link-preview-restore=""
              onClick={() => {
                const r = restoreFrom(data)
                write({ subtitle: r.subtitle }, r.data)
              }}
              className="min-h-10 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]"
            >
              {tt("Use the preview again")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
const restoreFrom = (data: LinkButtonBlockData) => restorePreview(data) as { data: Record<string, unknown>; subtitle?: string }

/**
 * How a social address behaves: a link that leaves, or the network's own
 * embed on the page. Offered only where the address has an embed. Round AL:
 * "Profile card" was a third choice here and the Profile picture in Layout
 * too, two controls for one thing; it is in Layout only now.
 */
export function SocialShowAs({ block, onChange, getBlock }: { block: OnePageBlock; onChange: Change; getBlock?: () => OnePageBlock | undefined }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  const data = block.data as LinkButtonBlockData
  const embed = socialPresentation(data.url || "")
  if (!embed) return null
  const p = presentationOf(block)
  const value = p.media_mode === "native" ? "embed" : "link"
  /* Round AR3: a form, a booking page, a map, a design or a show is shown in place, not "the post". */
  const kindOf = ["YouTube", "Vimeo", "TikTok", "Spotify", "SoundCloud", "Apple Music", "Apple Podcasts", "Loom", "Mixcloud", "Deezer"].includes(embed.platform) ? "play" : ["Instagram", "X"].includes(embed.platform) ? "post" : "here"
  const options = [{ id: "link", label: tt("Link") }, { id: "embed", label: kindOf === "play" ? tt("Play here") : kindOf === "post" ? tt("Show the post") : tt("Show it here") }]
  return (
    <div className="space-y-1.5" data-social-show-as="">
      <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Show as")}</p>
      <Segmented
        label={tt("Show as")}
        value={value}
        options={options}
        onChange={(id) => {
          if (id === "embed") write({ media_mode: "native", ...(!p.variant || p.variant === "original" || p.variant === "profile" ? { variant: "image-first" as const } : {}) })
          else write({ media_mode: undefined })
        }}
      />
    </div>
  )
}

/* ── Layout: the link's pictures of its layouts ─────────────────────────── */

const LINK_LAYOUT_LABEL: Record<LinkLayout, () => string> = {
  classic: () => tt("Classic"),
  featured: () => tt("Featured"),
  visual: () => tt("Card"),
  cover: () => tt("Cover"),
  "image-first": () => tt("Photo"),
  compact: () => tt("Compact"),
  profile: () => tt("Profile"),
  tile: () => tt("Media tile"),
}

/**
 * One link layout drawn small, in this page's colours, with this link's
 * picture. Round AQ: without a picture, the link's icon (the one chosen, or
 * its platform's mark from the address) is drawn where the page draws it,
 * Classic and Compact draw no picture at all when the link has neither, as
 * the page does, and its description is the second line. A grey stand-in is
 * left only where a layout needs a picture and the link has nothing.
 */
export function LinkVariantThumb({ id, theme, image, title, icon = null, subtitle = null }: { id: LinkLayout; theme?: Partial<OnePageTheme> | null; image?: string | null; title?: string | null; icon?: string | null; subtitle?: string | null }) {
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f7f7f8"
  const r = Math.max(2, Math.min(Number(theme?.button_border_radius ?? 8) * 0.4, 9))
  const line = (w: string, c = ink, o = 0.85) => <span className="block h-[3px] shrink-0 rounded-full" style={{ width: w, background: c, opacity: o }} />
  /* Round AL: the link's own title, small, where it sits on the page; a line only while it has none. */
  const words = (w: string, c = ink) =>
    title?.trim() ? (
      <span className="block min-w-0 truncate text-[8.5px] font-semibold leading-none" style={{ maxWidth: w, color: c }}>
        {title.trim()}
      </span>
    ) : (
      line(w, c)
    )
  const sub = (w: string, c = ink) =>
    subtitle?.trim() ? (
      <span className="block min-w-0 truncate text-[7px] leading-none" style={{ maxWidth: w, color: c, opacity: 0.7 }}>
        {subtitle.trim()}
      </span>
    ) : (
      line(w, c, 0.45)
    )
  const tint = `color-mix(in srgb, ${ink} 30%, ${btn})`
  /* `small`: a button's own picture slot (Classic, Compact), where an icon stands bare and nothing is drawn without one. */
  const pic = (cls: string, style?: React.CSSProperties, small = false) =>
    image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={cn("block shrink-0 object-cover", cls)} style={style} draggable={false} />
    ) : icon ? (
      /* Over a picture the words sit at the foot, so the icon keeps to the top corner, clear of them. */
      <span data-thumb-icon="" className={cn("flex shrink-0", cls.includes("inset-0") ? "items-start justify-start p-1" : "items-center justify-center", cls)} style={small ? style : { background: tint, ...style }}>
        <LinkIcon name={icon} size={small ? 11 : 14} color={ink} tone="mono" />
      </span>
    ) : small ? null : (
      <span className={cn("block shrink-0", cls)} style={{ background: tint, ...style }} />
    )
  const card: React.CSSProperties = { background: btn, borderRadius: r }
  let body: React.ReactNode
  switch (id) {
    case "classic":
      body = (
        <span className={cn("relative flex h-[22px] w-full items-center justify-center", image || icon ? "px-[20px]" : "px-1")} style={card}>
          {pic("absolute left-1 h-[14px] w-[14px]", { borderRadius: Math.max(2, r - 2) }, true)}
          {words(title?.trim() ? "100%" : "62%")}
        </span>
      )
      break
    case "featured":
      body = (
        <span className="flex w-full flex-col overflow-hidden" style={card}>
          {pic("aspect-[16/9] w-full")}
          <span className="grid h-[16px] place-items-center px-1">{words("90%")}</span>
        </span>
      )
      break
    case "visual":
    case "cover":
      body = (
        <span className={cn("relative block w-full overflow-hidden", id === "cover" ? "aspect-[4/5] w-[62%]" : "aspect-[16/10]")} style={card}>
          {pic("absolute inset-0 h-full w-full")}
          <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.6)_100%)]" />
          <span className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-[3px]">{words("90%", "#ffffff")}{sub("70%", "#ffffff")}</span>
        </span>
      )
      break
    case "image-first":
      body = (
        <span className="flex w-full flex-col overflow-hidden" style={card}>
          {pic("aspect-video w-full")}
          <span className="flex h-[18px] items-center px-1.5">{words("90%")}</span>
        </span>
      )
      break
    case "compact":
      body = (
        <span className="flex h-[24px] w-full items-center gap-1.5 px-1" style={card}>
          {pic("h-[16px] w-[16px]", { borderRadius: Math.max(2, r - 2) }, true)}
          {words("75%")}
        </span>
      )
      break
    case "profile":
      body = (
        <span className="flex w-full flex-col items-center gap-1 py-1.5" style={card}>
          {pic("h-[18px] w-[18px] rounded-full")}
          {words("80%")}
          {sub("70%")}
        </span>
      )
      break
    case "tile":
      body = (
        <span className="relative block aspect-square w-[58%] overflow-hidden" style={card}>
          {pic("absolute inset-0 h-full w-full")}
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.55))]" />
          <span className="absolute inset-x-1.5 bottom-1.5">{words("90%", "#ffffff")}</span>
        </span>
      )
      break
  }
  return (
    <span aria-hidden data-link-layout-thumb={id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[12%]" style={{ background: page }}>
      {body}
    </span>
  )
}

/** The link's eight layouts as pictures; Classic and Featured are the two it always had. */
export function LinkLayoutPicker({ block, theme, onChange, getBlock }: { block: OnePageBlock; theme?: Partial<OnePageTheme> | null; onChange: Change; getBlock?: () => OnePageBlock | undefined }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  const current = linkLayoutOf(block)
  const data = block.data as LinkButtonBlockData
  const p = presentationOf(block)
  const image = p.image_url || data.thumbnail_url || null
  const icon = resolveLinkIcon(data.icon, data.url)
  return (
    <div className="space-y-2.5" data-link-layouts="">
      <p className={heading}>{tt("Layout")}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {LINK_LAYOUTS.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-link-layout-choice={id}
              data-layout-choice={id === "classic" ? "default" : id === "featured" ? "pro" : id}
              onClick={() => {
                const patch = linkLayoutPatch(id)
                /* "Open link" on a social address used to force the card; a layout picked here wins. */
                write({ variant: patch.variant, ...(p.media_mode === "card" ? { media_mode: undefined } : {}) }, { layout_type: patch.layout_type })
              }}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <LinkVariantThumb id={id} theme={theme} image={image} title={data.label} icon={icon} subtitle={p.subtitle} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{LINK_LAYOUT_LABEL[id]()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** For a link drawn with its picture large: the picture's shape, a fade at its foot, where the words sit and how dark the shade is. */
export function LinkImageOptions({ block, onChange, getBlock }: { block: OnePageBlock; onChange: Change; getBlock?: () => OnePageBlock | undefined }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  const layout = linkLayoutOf(block)
  /* Classic and Featured are drawn by the page's own button rules, as they always were. */
  if (layout === "classic" || layout === "featured") return null
  const p = presentationOf(block)
  const overImage = layout === "visual" || layout === "cover" || layout === "tile"
  const pictured = linkLayoutHasImage(layout)
  /* Round AN: each row named over its choices (LabeledRow), never three loose words. */
  return (
    <div className="space-y-4 border-t border-[#eef0f2] pt-4" data-link-image-options="">
      <p className={heading}>{pictured ? tt("Picture") : tt("Size")}</p>
      {pictured ? <>
      <LabeledRow label={tt("Picture shape")}>
        <Segmented<BlockAspect>
          label={tt("Picture shape")}
          value={p.aspect || "auto"}
          options={BLOCK_ASPECTS.map((a) => ({ id: a, label: a === "auto" ? tt("Auto") : a.replace("/", ":") }))}
          onChange={(aspect) => write({ aspect: aspect === "auto" ? undefined : aspect })}
        />
      </LabeledRow>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Fade at the bottom")}</span>
        <Switch label={tt("Fade at the bottom")} checked={p.fade ?? overImage} onChange={(fade) => write({ fade })} />
      </div>
      {overImage ? (
        <>
          <LabeledRow label={tt("Text position")}>
            <Segmented
              label={tt("Text position")}
              value={p.position || "bottom"}
              options={[
                { id: "top", label: tt("Top") },
                { id: "center", label: tt("Middle") },
                { id: "bottom", label: tt("Bottom") },
              ]}
              onChange={(position) => write({ position: position as BlockPresentation["position"] })}
            />
          </LabeledRow>
          <RangeRow compact label={tt("Shade")} value={p.overlay ?? 65} min={0} max={90} step={1} unit="%" onChange={(overlay) => write({ overlay })} />
        </>
      ) : null}
      </> : null}
      <LabeledRow label={tt("Width")}>
        <Segmented
          label={tt("Width")}
          value={p.size || "full"}
          options={[
            { id: "full", label: tt("Full width") },
            { id: "half", label: tt("Half width") },
            { id: "tall", label: tt("Tall") },
          ]}
          onChange={(size) => write({ size: size as BlockPresentation["size"] })}
        />
      </LabeledRow>
    </div>
  )
}

/* ── Layout: the shared style rows ──────────────────────────────────────── */

/**
 * Alignment, colours, type and shape, for whichever of them this block uses.
 * Nothing folded: the rows are few because only the relevant ones show, and
 * a panel block's corner, shadow and padding appear once it has a background.
 */
export function BlockStyleControls({ block, onChange, getBlock }: { block: OnePageBlock; onChange: Change; getBlock?: () => OnePageBlock | undefined }) {
  const write = usePresentationWriter(block, onChange, getBlock)
  const controls = layoutControlsFor(block.type)
  if (!controls.length) return null
  const has = (c: (typeof controls)[number]) => controls.includes(c)
  const p = presentationOf(block)
  /* A tips block's card takes its corners, shadow and padding from the start (lib/onepage/block-presentation blockSurfaceOf). */
  const panel = blockSurfaceOf(block) === "panel"
  const shaped = !panel || !!p.background
  const hasDescription = has("description") && !!p.subtitle?.trim()
  /*
    A heading and a text block keep their alignment in their own data, and
    the page reads it there (round AL): this one row writes both, and the
    duplicate in their Settings is gone, so there is one Alignment.
  */
  const ownAlign = block.type === "heading" || block.type === "text"
  /* A tips card's words sit at the left until told otherwise (components/onepage/tip-block); every other block is centred. */
  const alignDefault = blockSurfaceOf(block) === "card" && tipStyleOf(block.data as never) === "card" ? "left" : "center"
  const alignNow = (ownAlign ? ((block.data as { alignment?: BlockPresentation["align"] }).alignment || p.align) : p.align) || alignDefault
  const touched = (["align", "title_color", "title_size", "title_weight", "subtitle_color", "subtitle_size", "icon_color", "icon_size", "background", "radius", "shadow", "padding", "gap"] as const).some((k) => p[k] !== undefined)
  const color = (label: string, key: "title_color" | "subtitle_color" | "icon_color" | "background") => (
    <ColorRow label={label} value={p[key]} onChange={(value) => write({ [key]: value })} onClear={() => write({ [key]: undefined })} emptyLabel={tt("Page default")} />
  )
  return (
    <div className="space-y-5" data-block-style="">
      {has("align") || has("title") ? (
        <section className="space-y-4 border-t border-[#eef0f2] pt-4">
          <p className={heading}>{tt("Text")}</p>
          {has("align") ? (
            <LabeledRow label={tt("Alignment")}>
              <Segmented
                label={tt("Alignment")}
                value={alignNow}
                options={[
                  { id: "left", label: tt("Left") },
                  { id: "center", label: tt("Center") },
                  { id: "right", label: tt("Right") },
                ]}
                onChange={(align) => write({ align: align as BlockPresentation["align"] }, ownAlign ? { alignment: align } : undefined)}
              />
            </LabeledRow>
          ) : null}
          {has("title") ? (
            <>
              {color(tt("Title colour"), "title_color")}
              {block.type === "heading" ? (
                /*
                  ONE SIZE FOR A HEADING (round AN). Its Settings had Small, Medium and
                  Large and this tab a Title size slider, and the slider won on the page
                  ([data-title-size] in app/globals.css), so the first did nothing once
                  the second was touched. The three sizes are the one control now, here;
                  picking one lets go of a slider size saved before.
                */
                <LabeledRow label={tt("Size")}>
                  <Segmented
                    label={tt("Size")}
                    value={(block.data as { size?: string }).size || "medium"}
                    options={[
                      { id: "small", label: tt("Small") },
                      { id: "medium", label: tt("Medium") },
                      { id: "large", label: tt("Large") },
                    ]}
                    onChange={(size) => write({ title_size: undefined }, { size })}
                  />
                </LabeledRow>
              ) : (
                <RangeRow compact label={tt("Title size")} value={p.title_size ?? 16} min={12} max={40} step={1} unit="px" onChange={(title_size) => write({ title_size })} />
              )}
              <LabeledRow label={tt("Title weight")}>
                <Segmented
                  label={tt("Title weight")}
                  value={String(p.title_weight || 600)}
                  options={[
                    { id: "400", label: tt("Regular") },
                    { id: "600", label: tt("Semibold") },
                    { id: "700", label: tt("Bold") },
                  ]}
                  onChange={(v) => write({ title_weight: Number(v) })}
                />
              </LabeledRow>
            </>
          ) : null}
          {hasDescription ? (
            <>
              {color(tt("Description colour"), "subtitle_color")}
              <RangeRow compact label={tt("Description size")} value={p.subtitle_size ?? 13} min={11} max={24} step={1} unit="px" onChange={(subtitle_size) => write({ subtitle_size })} />
            </>
          ) : null}
          {has("icon") ? (
            <>
              {color(tt("Icon colour"), "icon_color")}
              <RangeRow compact label={tt("Icon size")} value={p.icon_size ?? 22} min={16} max={48} step={1} unit="px" onChange={(icon_size) => write({ icon_size })} />
            </>
          ) : null}
        </section>
      ) : null}
      {has("background") || has("radius") || has("shadow") || has("padding") ? (
        <section className="space-y-4 border-t border-[#eef0f2] pt-4">
          <p className={heading}>{tt("Shape")}</p>
          {has("background") ? color(tt("Background"), "background") : null}
          {shaped && has("radius") ? <RangeRow compact label={tt("Corners")} value={p.radius ?? 16} min={0} max={40} step={1} unit="px" onChange={(radius) => write({ radius })} /> : null}
          {shaped && has("shadow") ? (
            <LabeledRow label={tt("Shadow")}>
              <Segmented<BlockShadow>
                label={tt("Shadow")}
                value={p.shadow || "none"}
                options={[
                  { id: "none", label: tt("None") },
                  { id: "soft", label: tt("Soft") },
                  { id: "lifted", label: tt("Lifted") },
                ]}
                onChange={(shadow) => write({ shadow: shadow === "none" ? undefined : shadow })}
              />
            </LabeledRow>
          ) : null}
          {shaped && has("padding") ? <RangeRow compact label={tt("Padding")} value={p.padding ?? 16} min={8} max={40} step={1} unit="px" onChange={(padding) => write({ padding })} /> : null}
        </section>
      ) : null}
      {touched ? (
        <button
          type="button"
          data-block-style-reset=""
          className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]"
          onClick={() => {
            /* The look goes back to the page's; the words (the description) and the layout stay. */
            const keep = getBlock?.()?.style?.presentation ?? block.style?.presentation ?? {}
            onChange({ style: { ...(getBlock?.() || block).style, presentation: { subtitle: keep.subtitle, variant: keep.variant, media_mode: keep.media_mode, image_url: keep.image_url, size: keep.size } } })
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {tt("Reset style")}
        </button>
      ) : null}
    </div>
  )
}

/* ── The row: an animation, for the blocks where one helps ──────────────── */

/**
 * WHICH BLOCKS MOVE (round AL). "Not all of them should have, but some of
 * them should truly have." A moving block pulls the eye, so it is offered on
 * the blocks someone is meant to press once: a link, a product, an email
 * signup, a document, a menu and a booking. A shelf, a gallery, a video or a
 * row of icons is never animated: many cards moving at once is noise, and a
 * player already moves. The page draws them with the animate-onepage-*
 * classes (app/globals.css), which stop under reduced motion.
 */
export const ANIMATED_BLOCKS = new Set(["link_button", "product", "email_capture", "pdf_document", "food_menu", "calendly"])
export const BLOCK_ANIMATIONS = ["none", "pulse", "bounce", "shake", "glow", "swipe"] as const
export type BlockAnimation = (typeof BLOCK_ANIMATIONS)[number]
const ANIMATION_LABEL: Record<BlockAnimation, () => string> = {
  none: () => tt("None"),
  pulse: () => tt("Pulse"),
  bounce: () => tt("Bounce"),
  shake: () => tt("Shake"),
  glow: () => tt("Glow"),
  swipe: () => tt("Swipe"),
}

/**
 * THE SPARKLE IN THE BLOCK'S ROW (round AN). Round AL moved the animation
 * into Layout as six moving pictures; the owner: "the animations should not
 * be as thumbnail previews, they should be positioned in the block next to
 * the analytics icon". So it is the small button beside the numbers again,
 * as before round AL: a menu under it on a computer and the shared sheet on
 * a phone (components/ui/responsive-action-menu), the chosen one checked,
 * and the button tinted while the block moves. On a phone the choice lands
 * once the sheet has gone, so the page's render does not hold up the slide.
 */
export function BlockAnimationButton({ value, onChange }: { value: string | null | undefined; onChange: (animation: BlockAnimation) => void }) {
  const current = (BLOCK_ANIMATIONS as readonly string[]).includes(value || "") ? (value as BlockAnimation) : "none"
  const items = React.useMemo(
    () =>
      BLOCK_ANIMATIONS.map((id) => ({
        id: `animation-${id}`,
        label: ANIMATION_LABEL[id](),
        /* The chosen one checked; the rest keep its room so the words line up. */
        icon: id === current ? <Check aria-hidden strokeWidth={2.25} /> : <span aria-hidden className="block h-4 w-4" />,
        onClick: () => {
          if (id !== current) onChange(id)
        },
        ...(id === "pulse" ? { separatorBefore: true } : {}),
      })),
    [current, onChange],
  )
  const moving = current !== "none"
  return (
    <ResponsiveActionMenu
      title={tt("Animation")}
      items={items}
      menuWidth="w-44"
      trigger={
        <button
          type="button"
          data-block-animation={current}
          aria-label={moving ? tt("Animation: {name}", { name: ANIMATION_LABEL[current]() }) : tt("Animation")}
          title={tt("Animation")}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]",
            moving ? "bg-[#f4f4f6] text-[#1a1a2e] hover:bg-[#ececef]" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600",
          )}
        >
          <Sparkles aria-hidden className="h-4 w-4" />
        </button>
      }
    />
  )
}

/* ── Layout: Classic or Featured, drawn as the block will be ────────────── */

/**
 * A DOCUMENT, A MENU AND A BOOKING (round AL). Each had its own pair of
 * grey sketches (a bar, a picture box with a mountain) the owner found
 * nothing like the page. Now the two are drawn in this page's button colours,
 * with this block's own title and picture: Classic is the button, Featured
 * the picture over the title and its button. The cards keep their shape at
 * any width (an aspect ratio, never a fixed height).
 */
export function ClassicFeaturedPicker({
  value,
  theme,
  title,
  image,
  icon,
  cta,
  onChange,
}: {
  value: string | null | undefined
  theme?: Partial<OnePageTheme> | null
  title: string
  image?: string | null
  icon?: React.ReactNode
  /** Round AQ: the block's own button words, drawn on Featured's button when it has them. */
  cta?: string | null
  onChange: (layout: "default" | "pro") => void
}) {
  const current = value === "pro" ? "pro" : "default"
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f7f7f8"
  const r = Math.max(3, Math.min(Number(theme?.button_border_radius ?? 8) * 0.45, 10))
  const words = (title || "").trim() || tt("Title")
  const label = (
    <span className="min-w-0 truncate text-[9px] font-semibold leading-none" style={{ color: ink }}>
      {words}
    </span>
  )
  const options = [
    { id: "default" as const, name: tt("Classic") },
    { id: "pro" as const, name: tt("Featured") },
  ]
  return (
    <div className="space-y-2.5" data-classic-featured="">
      <p className={heading}>{tt("Layout")}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((o) => {
          const on = current === o.id
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              data-layout-choice={o.id}
              onClick={() => onChange(o.id)}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span aria-hidden className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl px-[11%] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]" style={{ background: page }}>
                {o.id === "default" ? (
                  <span className="relative flex h-[26%] w-full items-center justify-center gap-1.5 px-6" style={{ background: btn, borderRadius: r }}>
                    <span className="absolute left-1.5 grid h-[62%] aspect-square place-items-center overflow-hidden [&_svg]:h-3 [&_svg]:w-3" style={{ color: ink, borderRadius: Math.max(2, r - 2) }}>
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        icon
                      )}
                    </span>
                    {label}
                  </span>
                ) : (
                  <span className="flex w-[86%] flex-col overflow-hidden" style={{ background: btn, borderRadius: r }}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="block aspect-[16/9] w-full object-cover" draggable={false} />
                    ) : (
                      <span className="grid aspect-[16/9] w-full place-items-center [&_svg]:h-4 [&_svg]:w-4" style={{ background: `color-mix(in srgb, ${ink} 18%, ${btn})`, color: ink }}>
                        {icon}
                      </span>
                    )}
                    <span className="flex flex-col items-center gap-1 px-2 py-1.5">
                      {label}
                      {cta?.trim() ? (
                        <span className="block max-w-[80%] truncate rounded-full px-1.5 py-[2px] text-[7px] font-semibold leading-none" style={{ background: ink, color: btn }}>
                          {cta.trim()}
                        </span>
                      ) : (
                        <span className="block h-[9px] w-[52%] rounded-full" style={{ background: ink, opacity: 0.9 }} />
                      )}
                    </span>
                  </span>
                )}
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{o.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* How a block of many is arranged, its cards in view and how many: components/onepage/layout-pickers. */
export { ArrangePicker, CardsInViewControl, EditorThemeContext, HowManyControl, PictureFitControl, CARDS_IN_VIEW, type ArrangeKind, type CardsInView, type PictureFit } from "./layout-pickers"
