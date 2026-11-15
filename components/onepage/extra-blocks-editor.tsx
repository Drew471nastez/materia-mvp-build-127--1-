"use client"

/*
 * THE EDITOR'S HALF OF ./extra-blocks (round 63): the block catalog, each block's row, its editor,
 * its extras and badges. Split out so a visitor's OnePage downloads the blocks it draws and none of
 * the editor (the Files library, the uploaders, the form fields) that used to ride along with them.
*/
import * as React from "react"
import { CalendarClock, ChevronRight, Clock, ExternalLink, EyeOff, LayoutList, PanelBottom, Play, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { scheduleLabel, videoSource } from "@/lib/onepage/extra-blocks"
import { mapPlaceOf } from "@/lib/onepage/map-place"
import { MapPlaceField } from "@/components/onepage/map-place-field"
import { viewerZone, zoneLabel } from "@/lib/onepage/schedule"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { DateTimeField } from "@/components/onepage/date-time-field"
import { LabeledRow, Segmented } from "@/components/onepage/editor-kit"
import { CreatorBlockEditor } from "@/components/onepage/creator-blocks-editor"
import { storelibBlockRow } from "@/components/onepage/storelib-blocks-editor"
import { appBlockRow } from "@/components/onepage/app-block"
import { AppBlockEditor } from "@/components/onepage/app-block-editor"
import { VideoSourceFields, useCoverFromPreview } from "@/components/onepage/media-editor"
import { GlyphBooking, GlyphContact, GlyphCountdown, GlyphCourse, GlyphFaq, GlyphHeading, GlyphIntegration, GlyphMap, GlyphMusic, GlyphTestimonials, GlyphVideo } from "@/components/onepage/block-icons"
import { EMBED_PROVIDER_NAME, MUSIC_PROVIDER_NAME, cleanTestimonials, embedSource, lessonsLabel, musicSource, type EmbedKind } from "@/lib/onepage/creator-blocks"
import { SocialIcon } from "@/components/onepage/brand-icons"
import type { ContactFormBlockData, CourseBlockData, EmbedBlockData, MusicBlockData, TestimonialsBlockData, CountdownBlockData, FaqBlockData, HeadingBlockData, MapBlockData, OnePageBlock, OnePageBlockData, OnePageBlockSchedule, VideoBlockData } from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { hapticTap } from "@/lib/native-bridge"
import { SHEET_BLOCKS, blockInteraction, interactionPatch, offersInteraction, type BlockInteraction } from "@/lib/onepage/block-sheet"
import { ModeChoice, SettingsGroup } from "@/components/onepage/block-settings-kit"
import { EMBED_MARK, MUSIC_MARK } from "./extra-blocks"

export const EXTRA_BLOCK_CATALOG = {
  heading: { type: "heading" as const, get label() { return tt("Heading") }, get description() { return tt("A title between your links") }, icon: GlyphHeading },
  faq: { type: "faq" as const, label: "FAQ", get description() { return tt("Questions and answers that open") }, icon: GlyphFaq },
  countdown: { type: "countdown" as const, get label() { return tt("Countdown") }, get description() { return tt("Count down to a launch or a drop") }, icon: GlyphCountdown },
  map: { type: "map" as const, get label() { return tt("Map") }, get description() { return tt("Show where to find you") }, icon: GlyphMap },
  video: { type: "video" as const, get label() { return tt("Video") }, get description() { return tt("Play a YouTube, Vimeo or TikTok video") }, icon: GlyphVideo },
  course: { type: "course" as const, get label() { return tt("Course") }, get description() { return tt("Show one of your courses") }, icon: GlyphCourse },
  music: { type: "music" as const, get label() { return tt("Music") }, get description() { return tt("Play Spotify, SoundCloud or Apple Music") }, icon: GlyphMusic },
  testimonials: { type: "testimonials" as const, get label() { return tt("Testimonials") }, get description() { return tt("Show what buyers said") }, icon: GlyphTestimonials },
  contact_form: { type: "contact_form" as const, get label() { return tt("Contact form") }, get description() { return tt("Let people send you a message") }, icon: GlyphContact },
  embed: { type: "embed" as const, get label() { return tt("Embed") }, get description() { return tt("A post, form, player or calendar") }, icon: GlyphIntegration },
}

/*
  A ROW FOR A SERVICE WEARS THAT SERVICE'S MARK, in its colour (round 11:
  brand marks in the editor too). One component per mark, made once, so a
  row's icon is the same component from render to render.
*/
const brandGlyphs = new Map<string, React.ComponentType<{ className?: string }>>()
function brandGlyph(platform: string): React.ComponentType<{ className?: string }> {
  let G = brandGlyphs.get(platform)
  if (!G) {
    const B = ({ className }: { className?: string }) => <SocialIcon platform={platform} tone="brand" color="#1a1a2e" className={className} size={19} />
    B.displayName = `BrandGlyph(${platform})`
    G = B
    brandGlyphs.set(platform, G)
  }
  return G
}
/* i18n-ignore-start: marks' names, not words. */
/* i18n-ignore-end */

/** The title, the line under it and the icon a block's row shows in the editor's list. */
export function extraBlockRow(block: OnePageBlock): { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> } {
  switch (block.type) {
    case "heading": {
      const d = block.data as HeadingBlockData
      return { title: d.text?.trim() || tt("Heading"), subtitle: tt("Heading"), icon: GlyphHeading }
    }
    case "faq": {
      const d = block.data as FaqBlockData
      const n = (d.items || []).filter((i) => i.question?.trim()).length
      return { title: d.title?.trim() || "FAQ", subtitle: `${n} question${n === 1 ? "" : "s"}`, icon: GlyphFaq }
    }
    case "countdown": {
      const d = block.data as CountdownBlockData
      const t = d.target_at ? Date.parse(d.target_at) : NaN
      return {
        title: d.title?.trim() || tt("Countdown"),
        subtitle: Number.isNaN(t) ? tt("Pick a date") : new Date(t).toLocaleString(appLocale(), zoned({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
        icon: GlyphCountdown,
      }
    }
    case "map": {
      const d = block.data as MapBlockData
      return { title: d.title?.trim() || tt("Map"), subtitle: (d.address?.trim() && (mapPlaceOf(d)?.label || d.address.trim())) || tt("Add an address"), icon: GlyphMap }
    }
    case "video": {
      const d = block.data as VideoBlockData
      const s = videoSource(d.url)
      return { title: d.title?.trim() || tt("Video"), subtitle: s?.kind === "file" ? tt("Your video") : s ? tt("{value} video", { value: s.kind === "youtube" ? "YouTube" : s.kind === "vimeo" ? "Vimeo" : "TikTok" }) : tt("Paste a video link"), icon: s && s.kind !== "file" ? brandGlyph(s.kind) : GlyphVideo }
    }
    case "course": {
      const d = block.data as CourseBlockData
      const lessons = lessonsLabel(d.lessons_count)
      return { title: d.course_title?.trim() || tt("Course"), subtitle: !d.product_id ? tt("Pick a course") : lessons ? tt("{count, plural, one {# lesson} other {# lessons}}", lessons) : tt("Course"), icon: GlyphCourse }
    }
    case "music": {
      const d = block.data as MusicBlockData
      const s = musicSource(d.url)
      return { title: d.title?.trim() || tt("Music"), subtitle: s ? MUSIC_PROVIDER_NAME[s.kind] : tt("Paste a music link"), icon: s ? brandGlyph(MUSIC_MARK[s.kind]) : GlyphMusic }
    }
    case "testimonials": {
      const d = block.data as TestimonialsBlockData
      const n = cleanTestimonials(d.items).length
      return { title: d.title?.trim() || tt("Testimonials"), subtitle: n ? tt("{count, plural, one {# review} other {# reviews}}", { count: n }) : tt("Add a review"), icon: GlyphTestimonials }
    }
    case "contact_form": {
      const d = block.data as ContactFormBlockData
      return { title: d.title?.trim() || tt("Contact form"), subtitle: tt("Messages go to Emails"), icon: GlyphContact }
    }
    case "embed": {
      const d = block.data as EmbedBlockData
      const s = embedSource(d.url)
      const mark = s ? EMBED_MARK[s.kind] : undefined
      return { title: d.title?.trim() || (s ? EMBED_PROVIDER_NAME[s.kind] : tt("Embed")), subtitle: s ? EMBED_PROVIDER_NAME[s.kind] : tt("Paste a link"), icon: mark ? brandGlyph(mark) : GlyphIntegration }
    }
    case "app":
      return appBlockRow(block)
    default:
      /* The shelf, lead magnets, posts, followers and codes (./storelib-blocks). */
      return storelibBlockRow(block) ?? { title: block.type, subtitle: "", icon: GlyphBooking }
  }
}

const field = "space-y-1.5"
const label = "text-xs"

/* Round AN: the sliding size control that lived here is gone; a heading's size is the Layout tab's Segmented (components/onepage/editor-kit), as every block's choices are. */

/** The form for one of the blocks in this file, inside the editor's block panel. */
export function ExtraBlockEditor({ block, updateData }: { block: OnePageBlock; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  switch (block.type) {
    case "heading": {
      const d = block.data as HeadingBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Heading")}</Label>
            <Input value={d.text} maxLength={80} placeholder={tt("Shop my picks")} onChange={(e) => updateData({ text: e.target.value })} />
          </div>
          {/*
            Round AL: the alignment is the Layout tab's one Alignment row (components/onepage/block-settings), which writes this block's own.
            Round AN: so is the size. Small, Medium and Large sat here and a Title size slider in Layout, and the slider won on the page; one control now, in Layout.
          */}
        </div>
      )
    }
    case "faq": {
      const d = block.data as FaqBlockData
      const items = d.items || []
      const set = (next: FaqBlockData["items"]) => updateData({ items: next })
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title ?? ""} maxLength={80} placeholder={tt("Questions")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          {items.map((item, i) => (
            <div key={item.id} className="space-y-2 rounded-xl border border-[#e5e7eb] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#6b7280]">{tt("Question {value}", { value: i + 1 })}</span>
                <button
                  type="button"
                  aria-label={tt("Remove question {value}", { value: i + 1 })}
                  onClick={() => set(items.filter((x) => x.id !== item.id))}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input value={item.question} maxLength={160} placeholder={tt("What do I get?")} onChange={(e) => set(items.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)))} />
              <Textarea value={item.answer} rows={3} maxLength={1000} placeholder={tt("The answer")} onChange={(e) => set(items.map((x) => (x.id === item.id ? { ...x, answer: e.target.value } : x)))} />
            </div>
          ))}
          <button
            type="button"
            onClick={() => set([...items, { id: `q_${Date.now().toString(36)}`, question: "", answer: "" }])}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d9dbe0] text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]"
          >
            <Plus className="h-4 w-4" />
            {tt("Add a question")}
          </button>
        </div>
      )
    }
    case "countdown": {
      const d = block.data as CountdownBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title ?? ""} maxLength={80} placeholder={tt("New drop in")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          <div className={field}>
            <Label className={label}>{tt("Counts down to")}</Label>
            <div>
              <DateTimeField
                label={tt("Counts down to")}
                value={d.target_at}
                required
                emptyLabel={tt("Choose a date")}
                defaultTime={{ hour: 12, minute: 0 }}
                onChange={(iso) => iso && updateData({ target_at: iso })}
              />
            </div>
          </div>
          <div className={field}>
            <Label className={label}>{tt("Once it has passed, say")}</Label>
            <Input value={d.ended_text || ""} maxLength={80} placeholder={tt("It's here")} onChange={(e) => updateData({ ended_text: e.target.value })} />
          </div>
        </div>
      )
    }
    case "map": {
      const d = block.data as MapBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title ?? ""} maxLength={80} placeholder={tt("Visit the studio")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          <MapPlaceField data={d} updateData={updateData} />
          <LabeledRow label={tt("How close")}>
            <Segmented label={tt("How close")} value={d.zoom || "area"} options={[{ id: "street", label: tt("Street") }, { id: "area", label: tt("Area") }, { id: "city", label: tt("City") }]} onChange={(zoom) => updateData({ zoom: zoom as MapBlockData["zoom"] })} />
          </LabeledRow>
          <LabeledRow label={tt("Map height")}>
            <Segmented label={tt("Map height")} value={d.map_height || "medium"} options={[{ id: "short", label: tt("Short") }, { id: "medium", label: tt("Medium") }, { id: "tall", label: tt("Tall") }]} onChange={(map_height) => updateData({ map_height: map_height as MapBlockData["map_height"] })} />
          </LabeledRow>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
            <span className="text-[13px] text-[#1a1a2e]">{tt("Show an Open in Maps button")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={d.show_button !== false}
              aria-label={tt("Show an Open in Maps button")}
              onClick={() => { hapticTap("light"); updateData({ show_button: d.show_button === false }) }}
              className="-my-[11px] -mr-[3px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <span aria-hidden className={switchTrack(d.show_button !== false)}>
                <span className={switchKnob(d.show_button !== false)} />
              </span>
            </button>
          </div>
        </div>
      )
    }
    case "video": {
      const d = block.data as VideoBlockData
      return (
        <div className="space-y-3">
          {/* Round AR3: an address, or an upload, or one of the store's videos (./media-editor). */}
          <VideoSourceFields data={d} blockId={block.id} updateData={(patch) => updateData(patch as Partial<OnePageBlockData>)} />
          <VideoCover data={d} updateData={updateData} />
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title ?? ""} maxLength={80} placeholder={tt("Watch the trailer")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
        </div>
      )
    }
    case "app":
      return <AppBlockEditor block={block} updateData={updateData} />
    default:
      return <CreatorBlockEditor block={block} updateData={updateData} />
  }
}

/**
 * THE SCHEDULE AND THE WARNING, UNDER ANY BLOCK'S OWN SETTINGS, as the rows
 * of Linktree's link settings: a line icon, a name, a grey line saying what
 * is set, and the control. The schedule row opens in place to two fields,
 * "Show from" and "Hide after", each a day and a time
 * (./date-time-field), with the time zone they are in said underneath.
 * Closed until used, so a block's panel is no longer than it was for
 * somebody who never schedules anything; opened by itself once a schedule
 * is set.
 */
export function BlockExtras({
  block,
  scheduling = true,
  updateBlock,
  updateData,
}: {
  block: OnePageBlock
  /** Off inside a group: a group's blocks show with the group. */
  scheduling?: boolean
  updateBlock: (updates: Partial<OnePageBlock>) => void
  updateData: (updates: Partial<OnePageBlockData>) => void
}) {
  const s = block.schedule || null
  const [open, setOpen] = React.useState(!!(s?.start_at || s?.end_at))
  const isLink = block.type === "link_button"
  const sensitive = isLink && !!(block.data as { sensitive?: boolean }).sensitive
  const status = scheduleLabel(block)
  const set = (next: OnePageBlockSchedule) => updateBlock({ schedule: next.start_at || next.end_at ? next : null })
  const invalid = !!(s?.start_at && s?.end_at && Date.parse(s.end_at) <= Date.parse(s.start_at))
  const [zone, setZone] = React.useState<string | null>(null)
  React.useEffect(() => setZone(viewerZone()), [])
  const row = "flex min-h-[60px] w-full items-center gap-3.5 py-2 text-left"
  return (
    <>
    {offersInteraction(block.type) ? <InteractionChoice block={block} updateData={updateData} /> : null}
    <div data-block-extras="" className="mt-4 border-t border-[#eef0f2] pt-1">
      {isLink ? (
        <div className={row}>
          <EyeOff aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium text-[#1a1a2e]">{tt("Sensitive content")}</span>
            <span className="block text-[13px] text-[#6b7280]">{tt("Visitors confirm before it opens")}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sensitive}
            aria-label={tt("Sensitive content")}
            data-sensitive-switch=""
            onClick={() => { hapticTap("light"); updateData({ sensitive: !sensitive }) }}
            className="-mr-[3px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
          >
            <span aria-hidden className={switchTrack(sensitive)}>
              <span className={switchKnob(sensitive)} />
            </span>
          </button>
        </div>
      ) : null}
      {scheduling ? (
        <div className={cn(isLink && "border-t border-[#eef0f2]")}>
          <button type="button" aria-expanded={open} data-schedule-toggle="" onClick={() => setOpen((v) => !v)} className={cn(row, "cursor-pointer rounded-lg outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]")}>
            <CalendarClock aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.6} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-[#1a1a2e]">{tt("Schedule")}</span>
              <span className={cn("block truncate text-[13px]", status ? (status.live ? "text-[#15803d]" : "text-[#9a5b00]") : "text-[#6b7280]")}>{status ? status.text : tt("Show it only between two times")}</span>
            </span>
            <ChevronRight aria-hidden data-keep-transform="" className={cn("h-5 w-5 shrink-0 text-[#1a1a2e] transition-[rotate] duration-200", open && "rotate-90")} strokeWidth={1.75} />
          </button>
          {open ? (
            <div data-schedule-panel="" className="mb-2 space-y-3 rounded-2xl border border-[#e3e4e8] bg-white p-3.5">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Show from")}</span>
                <DateTimeField label={tt("Show from")} value={s?.start_at} emptyLabel={tt("Now")} defaultTime={{ hour: 9, minute: 0 }} onChange={(iso) => set({ ...(s || {}), start_at: iso })} />
              </div>
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Hide after")}</span>
                <DateTimeField label={tt("Hide after")} value={s?.end_at} emptyLabel={tt("Never")} defaultTime={{ hour: 23, minute: 59 }} after={s?.start_at} onChange={(iso) => set({ ...(s || {}), end_at: iso })} />
              </div>
              {invalid ? <p className="text-[13px] text-[#b42318]">{tt("It hides before it shows, so it would never be on the page.")}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0f2] pt-3">
                <span className="text-[12.5px] text-[#6b7280]" data-schedule-zone="">{zone ? tt("Times are in {name}", { name: zoneLabel(zone) }) : "\u00a0"}</span>
                {s?.start_at || s?.end_at ? (
                  <button type="button" data-schedule-clear="" onClick={() => updateBlock({ schedule: null })} className="h-9 cursor-pointer rounded-lg px-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                    {tt("Clear schedule")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
    </>
  )
}

/**
 * INTERACTION (round AL): what a tap on a block that shows another service
 * does. In a sheet over the page (components/onepage/block-sheet), straight
 * to the service, or the block drawn on the page itself (lib/onepage/
 * block-sheet blockInteraction).
 */
function InteractionChoice({ block, updateData }: { block: OnePageBlock; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  const allowed = SHEET_BLOCKS[block.type] ?? []
  const all: { id: BlockInteraction; label: string; icon: React.ReactNode }[] = [
    { id: "sheet", label: tt("Open in a sheet"), icon: <PanelBottom className="h-4 w-4" /> },
    { id: "direct", label: tt("Go to the link"), icon: <ExternalLink className="h-4 w-4" /> },
    { id: "inline", label: tt("Show on the page"), icon: <LayoutList className="h-4 w-4" /> },
  ]
  return (
    <SettingsGroup title={tt("When someone taps it")} className="mt-4">
      <ModeChoice
        label={tt("When someone taps it")}
        value={blockInteraction(block)}
        options={all.filter((o) => allowed.includes(o.id))}
        onPick={(mode) => updateData(interactionPatch(block.type, mode) as Partial<OnePageBlockData>)}
      />
    </SettingsGroup>
  )
}

/** A Vimeo video's frame for the card layout, from its public preview (YouTube's is read from the address itself). */
function VideoCover({ data, updateData }: { data: VideoBlockData; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  const s = videoSource(data.url)
  useCoverFromPreview(data.url, data.poster_url, "poster_url", s?.kind === "vimeo", (patch) => updateData(patch as Partial<OnePageBlockData>))
  return null
}

/** The small marks on a block's row in the editor: when it is scheduled, and when its link asks first. */
export function BlockBadges({ block }: { block: OnePageBlock }) {
  const status = scheduleLabel(block)
  const sensitive = block.type === "link_button" && !!(block.data as { sensitive?: boolean }).sensitive
  if (!status && !sensitive) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {status ? (
        <span
          data-block-schedule={status.live ? "live" : "off"}
          className={cn(
            "inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium",
            status.live ? "bg-[#e3f5e9] text-[#15803d]" : "bg-[#fff4e0] text-[#9a5b00]",
          )}
        >
          <Clock aria-hidden className="h-2.5 w-2.5" />
          {status.text}
        </span>
      ) : null}
      {sensitive ? (
        <span data-block-sensitive="" className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[#f1f2f4] px-1.5 text-[10.5px] font-medium text-[#4b5563]">
          <EyeOff aria-hidden className="h-2.5 w-2.5" />
          {tt("Sensitive")}
        </span>
      ) : null}
    </span>
  )
}
