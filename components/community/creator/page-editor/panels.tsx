"use client"

/**
 * ===========================================================================
 *  THE PARTS OF THE PAGE, AND WHAT CHANGES EACH (round 33, grouped round 26)
 * ===========================================================================
 * Each part's editor writes straight into the draft, so the preview changes
 * as it is typed; nothing is saved until Save.
 *
 * ROUND 26, THE OWNER: "simple field groups instead of a wall". Round 33 had
 * a list of ten parts, each opening on its own with a way back; the panel
 * was a list or one part, never two at once. The parts are now six groups
 * (./draft.ts PAGE_GROUPS), each a short column of labelled fields
 * (GroupFields), opened one at a time in the side panel or the phone's
 * drawer (./page-editor.tsx):
 *
 *   basics   name, tagline, short description (new, up to 160), logo
 *   media    cover picture or intro video (then what stays in view when it
 *            is cropped, ./cover-focus.tsx), gallery
 *   about    the full description (the product page's rich text editor:
 *            bold, links, lists, emoji, pictures, cleaned on the server by
 *            the product description's allow list), What's inside (a line
 *            each), questions
 *   links    website and social pages (./links-editor.tsx), member links
 *            (new, ./member-links-editor.tsx), and (round 27) the
 *            community's own privacy policy and terms pages
 *   join     the button's words (never a price: lib/communities/page-look.ts
 *            joinWordsProblem), its style and colour, a line under it
 *   search   draft or published, Explore, the search title and line with the
 *            result drawn (./search-panel.tsx)
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { uploadDescriptionImage } from "@/lib/rich-text/upload-image"
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { MAX_BENEFITS, MAX_FAQ } from "@/lib/communities/limits"
import { SUMMARY_MAX } from "@/lib/communities/member-links"
import { LEGAL_URL_MAX, type LegalKind } from "@/lib/communities/legal-links"
import { JOIN_LABEL_MAX, JOIN_NOTE_MAX, buttonBrand, type JoinStyle, type JoinWordsProblem, type PageLook } from "@/lib/communities/page-look"
import { CoverField, GalleryEditor } from "../gallery-editor"
import { GALLERY_MAX, coverItem } from "../logic"
import { PicturePick, field, label } from "../parts"
import type { CommunityHead, GalleryVideoView } from "../view-types"
import { CoverFocus } from "./cover-focus"
import { LinksEditor } from "./links-editor"
import { ListEditor, PairEditor } from "./list-editors"
import { MemberLinksEditor } from "./member-links-editor"
import { SearchPanel } from "./search-panel"
import { GROUP_BLOCKS, type DraftProblem, type PageBlock, type PageDraft, type PageGroup } from "./draft"

/** Each part's name (the field's label, the Edit button's), and the line under it saying where it shows. */
export const BLOCK_INFO: Record<PageBlock, { title: string; line: string }> = {
  cover: { get title() { return tt("Cover") }, get line() { return tt("A picture, or an intro video, at the top. It also shows on your card in Explore.") } },
  gallery: { get title() { return tt("Gallery") }, get line() { return tt("More pictures and videos, after the cover, in this order.") } },
  logo: { get title() { return tt("Logo") }, get line() { return tt("The square picture by the name, in the bar, on cards and in the browser tab.") } },
  name: { get title() { return tt("Name") }, get line() { return tt("The community's name, everywhere it shows.") } },
  tagline: { get title() { return tt("Tagline") }, get line() { return tt("One line under the name, on cards and in Explore.") } },
  summary: { get title() { return tt("Short description") }, get line() { return tt("A quick introduction on the community's card, up to 160 characters.") } },
  description: { get title() { return tt("Full description") }, get line() { return tt("What it is about, who it is for, what happens in it.") } },
  links: { get title() { return tt("Website and social pages") }, get line() { return tt("Shown as icons on the community's card.") } },
  memberLinks: { get title() { return tt("Member links") }, get line() { return tt("Up to 4 shortcuts members see inside the community. Never on this public page.") } },
  benefits: { get title() { return tt("What's inside") }, get line() { return tt("What members get, a line each, with a check beside it.") } },
  join: { get title() { return tt("Join button") }, get line() { return tt("Its words, its style and a short line under it.") } },
  faq: { get title() { return tt("Questions") }, get line() { return tt("Answers to what people ask before joining.") } },
  legal: { get title() { return tt("Privacy and terms") }, get line() { return tt("Your own privacy policy and terms, linked at the foot of the page. Empty, Storelib's are linked.") } },
  search: { get title() { return tt("Visibility and search") }, get line() { return tt("Who can open the page, Explore, and search results.") } },
}

export const GROUP_INFO: Record<PageGroup, { title: string }> = {
  basics: { get title() { return tt("Name and introduction") } },
  media: { get title() { return tt("Cover and gallery") } },
  about: { get title() { return tt("About") } },
  links: { get title() { return tt("Links") } },
  join: { get title() { return tt("Join button") } },
  search: { get title() { return tt("Visibility and search") } },
}

export interface PanelProps {
  head: CommunityHead
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
  /** False until run-now part 220 has run: the short description and member links wait. */
  fieldsReady: boolean
  /** How often members opened each member link, when it is counted. */
  clicks: Record<string, number> | null
  problems: DraftProblem[]
  /** A tagline or the description's start, shown (never saved) where the short description is empty. */
  summaryHint: string
  publishing: boolean
  onPublish: (() => void) | null
  origin: string
}

/** What a group holds now, for the line under its name while it is closed. */
export function groupSummary(group: PageGroup, d: PageDraft): string {
  switch (group) {
    case "basics":
      return d.name.trim() || tt("None yet")
    case "media": {
      const v = coverItem(d.gallery)
      const n = d.gallery.length - (v ? 1 : 0)
      const cover = v ? tt("An intro video") : d.coverUrl ? tt("A cover picture") : tt("No cover yet")
      return n ? `${cover} · ${tt("{n, plural, one {# more in the gallery} other {# more in the gallery}}", { n })}` : cover
    }
    case "about": {
      const text = htmlToPlainText(d.descriptionHtml).replace(/\s+/g, " ").trim()
      return text.slice(0, 80) || tt("None yet")
    }
    case "links": {
      const counts = tt("{n, plural, one {# social link} other {# social links}}, {m, plural, one {# member link} other {# member links}}", { n: d.links.length, m: d.memberLinks.length })
      return d.legal.privacy.trim() || d.legal.terms.trim() ? `${counts} · ${tt("Your own legal pages")}` : counts
    }
    case "join":
      return d.look.joinLabel.trim() || tt("The page's own words")
    case "search":
      return d.seoTitle.trim() || tt("Search title from the name")
  }
}

/** One group's fields, each under its label, a hairline between them. */
export function GroupFields(p: PanelProps & { group: PageGroup }) {
  const blocks = GROUP_BLOCKS[p.group]
  const single = blocks.length === 1
  return (
    <div className="divide-y divide-[#f1f2f4]" data-page-group-fields={p.group}>
      {blocks.map((b) => (
        <section key={b} id={`pe-field-${b}`} data-page-field={b} className="scroll-mt-24 py-4 first:pt-1 last:pb-1">
          {single ? null : (
            <div className="mb-2.5">
              <h3 className="text-[14px] font-semibold leading-5 text-[#1a1a2e]">{BLOCK_INFO[b].title}</h3>
              <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]">{BLOCK_INFO[b].line}</p>
            </div>
          )}
          <BlockPanel {...p} block={b} />
        </section>
      ))}
    </div>
  )
}

export function BlockPanel(p: PanelProps & { block: PageBlock }) {
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
          <input id="pe-name" value={d.name} onChange={(e) => set("name", e.target.value.slice(0, 80))} className={cn(field, "h-11 sm:h-10", !d.name.trim() && "border-[#f0b4ae]")} autoComplete="off" data-autofocus="" />
          <Counter n={d.name.length} max={80} error={!d.name.trim() ? tt("A community needs a name.") : null} />
        </div>
      )
    case "tagline":
      return (
        <div data-panel="tagline">
          <label htmlFor="pe-tagline" className="sr-only">
            {tt("Tagline")}
          </label>
          <input id="pe-tagline" value={d.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 160))} placeholder={tt("Weekly critiques for people learning to throw")} className={cn(field, "h-11 sm:h-10")} autoComplete="off" />
          <Counter n={d.tagline.length} max={160} />
        </div>
      )
    case "summary": {
      if (!p.fieldsReady) return <Waiting />
      const n = Array.from(d.summary.trim()).length
      return (
        <div data-panel="summary">
          <label htmlFor="pe-summary" className="sr-only">
            {tt("Short description")}
          </label>
          <textarea
            id="pe-summary"
            value={d.summary}
            /* One line: a return is a space. A paste longer than the limit is kept whole, so nothing is lost without the counter saying so. */
            onChange={(e) => set("summary", e.target.value.replace(/[\r\n]+/g, " ").slice(0, SUMMARY_MAX + 200))}
            rows={3}
            placeholder={p.summaryHint || tt("Who it is for and what happens in it, in a sentence or two")}
            className={cn(field, "resize-none py-2.5 leading-relaxed", n > SUMMARY_MAX && "border-[#f0b4ae]")}
            aria-invalid={n > SUMMARY_MAX ? true : undefined}
            data-summary-input=""
          />
          <Counter n={n} max={SUMMARY_MAX} error={n > SUMMARY_MAX ? tt("Up to {max} characters: {n} over.", { max: SUMMARY_MAX, n: n - SUMMARY_MAX }) : null} note={!d.summary.trim() && p.summaryHint ? tt("Empty, the card shows your tagline or the start of your description.") : null} />
        </div>
      )
    }
    case "description":
      return (
        <div data-panel="description">
          <RichTextEditor
            value={d.descriptionHtml}
            onChange={(html) => set("descriptionHtml", html)}
            label={tt("Full description")}
            placeholder={tt("Who it is for, what happens in it, and how often")}
            uploadImage={(file) => uploadDescriptionImage(file, { creatorId: p.creatorId, productId: null })}
            checkSize={descriptionTooLong}
            minHeight={200}
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
    case "memberLinks":
      return (
        <div data-panel="memberLinks">
          <MemberLinksEditor links={d.memberLinks} onChange={(v) => set("memberLinks", v)} clicks={p.clicks} ready={p.fieldsReady} />
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
    case "legal":
      return <LegalPanel {...p} />
    case "search":
      return <SearchPanel head={p.head} draft={d} set={set} publishing={p.publishing} onPublish={p.onPublish} origin={p.origin} />
  }
}

function Waiting() {
  return <p className="rounded-xl bg-[#f8f9fa] px-3.5 py-3 text-[13px] leading-5 text-[#6b7280]">{tt("This field is waiting for a Storelib update. Everything else on this page saves as usual.")}</p>
}

/** The count under a field, and what is wrong with it when something is. */
function Counter({ n, max, error, note }: { n: number; max: number; error?: string | null; note?: string | null }) {
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3 text-[12px] leading-snug">
      <span className={error ? "text-[#b42318]" : "text-[#6b7280]"} role={error ? "alert" : undefined}>
        {error ?? note ?? ""}
      </span>
      <span className={cn("shrink-0 tabular-nums", n > max ? "font-medium text-[#b42318]" : "text-[#9ca3af]")}>
        {n}/{max}
      </span>
    </div>
  )
}

/* ── The community's own legal pages (round 27) ─────────────────────── */

function LegalPanel(p: PanelProps) {
  const legal = p.draft.legal
  const rows: { kind: LegalKind; title: string; placeholder: string }[] = [
    { kind: "privacy", title: tt("Privacy policy"), placeholder: "https://yoursite.com/privacy" },
    { kind: "terms", title: tt("Terms"), placeholder: "https://yoursite.com/terms" },
  ]
  return (
    <div className="space-y-4" data-panel="legal">
      {rows.map((r) => {
        const problem = p.problems.find((x): x is Extract<DraftProblem, { block: "legal" }> => x.block === "legal" && x.kind === r.kind)
        const id = `pe-legal-${r.kind}`
        return (
          <div key={r.kind}>
            <label htmlFor={id} className={label}>
              {r.title}
            </label>
            <input
              id={id}
              type="url"
              inputMode="url"
              value={legal[r.kind]}
              onChange={(e) => p.set("legal", { ...legal, [r.kind]: e.target.value.slice(0, LEGAL_URL_MAX + 20) })}
              placeholder={r.placeholder}
              className={cn(field, "h-11 sm:h-10", problem && "border-[#f0b4ae]")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={problem ? true : undefined}
              data-legal-input={r.kind}
            />
            {problem ? (
              <p role="alert" className="mt-1.5 text-[12.5px] leading-snug text-[#b42318]" data-legal-problem={r.kind}>
                {problem.code === "long" ? tt("That address is too long.") : tt("Enter the full address of a web page, like {example}.", { example: r.placeholder })}
              </p>
            ) : (
              <p className="mt-1.5 text-[12.5px] leading-snug text-[#6b7280]">{legal[r.kind].trim() ? tt("Opens in a new tab from the foot of your page.") : tt("Empty, the page links to Storelib's.")}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── The join button ─────────────────────────────────────────────────── */

const SAMPLE = "pointer-events-none inline-flex h-9 w-full items-center justify-center rounded-[10px] border px-1.5 text-[12px] font-semibold"

function wordsProblem(code: JoinWordsProblem): string {
  return code === "money" ? tt("Leave prices, currencies and billing periods out. The real price is shown on the page.") : tt("Joining costs money, so the button cannot say free.")
}

function JoinPanel(p: PanelProps) {
  const look = p.draft.look
  const setLook = (patch: Partial<PageLook>) => p.set("look", { ...look, ...patch })
  const brand = buttonBrand(look.brand)
  const paidJoin = !p.free && !p.requests
  const suggestions = [p.free ? tt("Join free") : null, tt("Get access"), tt("Join now"), paidJoin ? tt("Become a member") : null, p.requests ? tt("Request access") : null].filter((s): s is string => !!s)
  const labelProblem = p.problems.find((x): x is Extract<DraftProblem, { block: "join" }> => x.block === "join" && x.field === "joinLabel")
  const noteProblem = p.problems.find((x): x is Extract<DraftProblem, { block: "join" }> => x.block === "join" && x.field === "joinNote")
  const shownLabel = (!labelProblem && look.joinLabel.trim()) || p.defaultJoinLabel
  const styles: { value: JoinStyle; title: string; detail: string }[] = [
    { value: "ink", title: tt("Ink"), detail: tt("Storelib's dark button") },
    { value: "brand", title: tt("Your colour"), detail: p.draft.logoUrl ? (p.brandBusy ? tt("Reading your logo") : brand ? tt("From your logo") : tt("No colour found in your logo")) : look.brand ? tt("Your own colour") : tt("Add a logo first") },
    { value: "outline", title: tt("Outline"), detail: tt("White with a dark edge") },
  ]
  const picker = React.useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-6" data-panel="join">
      <div>
        <label htmlFor="pe-join-label" className={label}>
          {tt("Words on the button")}
        </label>
        <input id="pe-join-label" value={look.joinLabel} onChange={(e) => setLook({ joinLabel: e.target.value.slice(0, JOIN_LABEL_MAX) })} placeholder={p.defaultJoinLabel} className={cn(field, "h-11 sm:h-10", labelProblem && "border-[#f0b4ae]")} autoComplete="off" aria-invalid={labelProblem ? true : undefined} aria-describedby="pe-join-rule" data-join-label-input="" />
        {labelProblem ? (
          <p role="alert" className="mt-1.5 text-[12.5px] leading-snug text-[#b42318]" data-join-problem={labelProblem.code}>
            {wordsProblem(labelProblem.code)}
          </p>
        ) : null}
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
        {/* The rule, said once where it applies (lib/communities/page-look.ts). */}
        <p id="pe-join-rule" className="mt-2 text-[12.5px] leading-snug text-[#6b7280]" data-join-rule="">
          {look.joinLabel.trim() ? tt("Words only. The price comes from your memberships and is shown beside the button, so prices, currencies and billing periods are left out.") : tt("Empty, the button says “{label}”, with the real price from your memberships.", { label: p.defaultJoinLabel })}
        </p>
      </div>

      <div>
        <p className={label} id="pe-join-style">
          {tt("Style")}
        </p>
        <div role="radiogroup" aria-labelledby="pe-join-style" className="grid grid-cols-3 gap-2" data-join-styles="">
          {styles.map((s) => {
            const on = look.joinStyle === s.value
            const off = s.value === "brand" && !p.draft.logoUrl && !look.brand
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
        <input id="pe-join-note" value={look.joinNote} onChange={(e) => setLook({ joinNote: e.target.value.slice(0, JOIN_NOTE_MAX) })} placeholder={p.free ? tt("No card needed") : tt("Cancel any time")} className={cn(field, "h-11 sm:h-10", noteProblem && "border-[#f0b4ae]")} autoComplete="off" aria-invalid={noteProblem ? true : undefined} />
        <Counter n={look.joinNote.length} max={JOIN_NOTE_MAX} error={noteProblem ? wordsProblem(noteProblem.code) : null} />
      </div>
    </div>
  )
}
