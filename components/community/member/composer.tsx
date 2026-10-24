"use client"

/**
 * ===========================================================================
 *  "SHARE SOMETHING..."
 * ===========================================================================
 * Closed, the composer is the member's picture and "Share something...",
 * nothing else (round 7). Pressing it opens the editor: in place on a
 * computer, a screen of its own sliding up on a phone. The editor is a title
 * and the words (both needed), what the post carries, and one toolbar after
 * Skool's: attach files, add a link, a video (a YouTube, Vimeo or Loom
 * address, or Upload for one from the device, side by side in one row: the
 * link field, media-link.tsx, with Paste and a live preview), a poll, an
 * emoji, a GIF, the space it goes to ("Select a space", only spaces this
 * member may post in), Cancel and Post.
 * Post waits until there is a title, words, a space and nothing still
 * uploading.
 *
 * WHAT IS ATTACHED, BY WHAT IT IS (media-upload.ts): a picture goes to
 * Storelib's picture storage; a video through the community's video route,
 * with a still for the card; any other file through the community's file
 * route, checked before and after it is sent. A link typed in the words
 * brings its card on its own (fetched by the server), a YouTube, Vimeo or
 * Loom address brings the video, and either can be taken off. A picture is
 * made lighter in the browser first (media-compress.ts).
 *
 * LEAVING WITH SOMETHING WRITTEN asks first, in Storelib's own dialog: "You
 * haven't finished your post yet. Leave without posting?" (Keep writing /
 * Leave), on Cancel, on closing the phone's screen, on Back, and on a link
 * to another page (useLeaveGuard). Closing the tab gets the browser's own
 * question.
 *
 * OPENING AND CLOSING (round 9) are the compositor's. On a phone the screen
 * slides up and down on the app's sheet curves (bottom-sheet.tsx), as Web
 * Animations started before the first frame is painted. On a computer the
 * editor grows out of the closed field in place: the posts under it start
 * where they were and slide down to make room, uncovering it as they go
 * (they are drawn over it); closing is the same move backwards.
 *
 * ONE CARD, NEVER GONE (round 11). The closed field and the editor in place
 * are the same card, the same element for the composer's whole life: it is
 * never taken out and put back, and its own opacity never moves. What was
 * written is cleared once the card has closed, not before, so Leave never
 * empties the editor while it is still on screen.
 *
 * NO MORPH (round 12). The card's top row is the same row open and closed:
 * the member's picture at 40px in the same place on every frame (round 11
 * crossfaded a closed row with a 40px picture into an editor header with a
 * 32px one, which read as the picture shrinking). Opening, the card simply
 * grows (the posts under it slide down), the field's placeholder goes at
 * once and "<name> posting" with the fields and the toolbar fade in after;
 * Cancel is the same backwards: the content goes, the card folds, the field
 * is back as it ends.
 *
 * THE KEYBOARD ON A PHONE. The screen's white covers the whole window, the
 * part under the keyboard included, so a keyboard opening or closing never
 * shows the page behind it; the header, the words and the toolbar inside it
 * are sized to the part that can be seen (--vv-top and --vv-h, published from
 * visualViewport's resize and scroll by components/viewport-vars.tsx), so
 * the toolbar sits on the keyboard, and when the visible part changes the
 * field being typed in is scrolled back into sight.
 *
 * AFTER POST (round 10): the button turns to a spinner while the server is
 * asked and to a check when it has the post (one fixed width, the faces
 * crossfade), the editor closes on its usual move, and only then does the
 * post go into the feed: at the top, the posts under it sliding down to
 * make room, with a warm highlight that fades, the page scrolling smoothly
 * to it when it is out of sight (arrive.ts useArrivals).
 *
 * ROUND 17: ON A PHONE, THE WEBSITE BUILDER'S SHEET. The owner names the
 * website builder's sheet on a phone as the feel they want, so the screen is
 * that sheet (components/website-builder/mobile-editor-sheet.tsx: its rise,
 * its close, its drag, its light dim), nothing behind it moving, scaling or
 * darkening at the edges. The keyboard is the sheet's own way, the same as
 * every working bottom sheet's: the sheet stays down to the foot, white, and
 * its content is lifted by the keyboard's room, which in the iOS app is the
 * decision table's number (visible-box.ts sheetKeyboardRoom, keyboard-plan.ts)
 * made in the focus itself, before iOS can pan the page (the page jumping up
 * and glitching when the title was tapped). Round 10's toolbar dock below is
 * no longer used on a phone; the notes are kept for its history.
 *
 * ROUND 29 (the owner, on a phone and in dark mode).
 *   CANCEL AND POST. Cancel is a plain word (CANCEL_BTN), Post the one
 *   filled button (POST_BTN), with no hairline round it, so in the dark look
 *   it is a graphite step and never a light edge.
 *   A CALM PENDING STATE. Post keeps its width and its colour while the
 *   server is asked: a thin ring turns where the word was (opacity only
 *   between the faces, no scale), and the button is never `disabled`, so no
 *   disabled style can dim it in the middle of the press.
 *   ONE MOVE DOWN. Post keeps the caret through the press like Cancel, so the
 *   keyboard goes down with the sheet, not a moment before it.
 *   BACK WITH WORDS WRITTEN, THEN LEAVE goes down on the sheet's own close too
 *   (it was taken off the screen in one frame).
 *   THEN THE FEED GLIDES. Once the sheet is down the page glides to where the
 *   post goes (arrive.ts glideIntoSight) and only then is the post put in,
 *   with its slide and its warm highlight.
 *   AN EMOJI GOES WHERE THE CARET WAS: in the title when the title had it
 *   last, at its caret (it always went into the words).
 *
 * ROUND 25 (the owner: "when the keyboard closes and I tap 'Write
 * something' again, the sheet bumps up weirdly"). The sheet is primed: its
 * fields are drawn and painted before it rises, the caret goes in when the
 * sheet says it has landed, and the close ends on the sheet's word too. On
 * iOS a tap into an empty field is focused the way the first focus is, with
 * preventScroll (calm-focus.ts): a finger's focus made iOS scroll the page to
 * the field and the sheet put it back the next frame, the bump. The keyboard
 * this visit has already shown is made as room in the focus itself
 * (visible-box.ts sheetKeyboardRoom), so the field is above the keys before
 * iOS looks.
 *
 * THE TOOLBAR ON THE KEYBOARD (round 10, replaced in round 17). The visible part followed the
 * viewport at once, with no CSS transition (a transition on its height
 * moved the toolbar a different way from the top, which jumps with a pan,
 * and left an empty strip under it for a quarter second when the keyboard
 * went down). The toolbar alone is carried from where it was drawn to its
 * new place on the compositor (useToolbarDock: a FLIP on translate, 250ms,
 * the keyboard's own curve). And a keyboard that is about to go down (the
 * field lost focus to nothing that types) is not waited for: iOS says the
 * viewport changed only once the keyboard has gone, so the toolbar goes
 * down with it at once, and the report then finds it already there. The
 * same the other way: a field taking focus brings the toolbar up with the
 * keyboard, as tall as the last one was, before the report.
 *
 * WHAT IS TYPED IS KEPT. Every change is written to this browser's storage
 * for this community, and comes back if the page is closed, refreshed or
 * crashed before posting. Posting, or choosing Leave, clears it.
 *
 * ROUND 13.
 *   EDIT POST IS THIS SAME EDITOR (`edit`): opened at once with the post in
 *   it (title, words, media, link, poll and space), in place inside the post
 *   on a computer and as the same screen on a phone ("Edit post", above an
 *   opened post). Media can be taken off and added (the attachment tray is
 *   worker V's, in its own slot below); a poll can be added, taken off or
 *   changed, and once somebody has voted only its end can change (the server
 *   says so too: feed.ts POLL_VOTED). Save turns to a spinner, then a check,
 *   and the editor folds back into the post. Nothing is kept in storage.
 *   A SOUND ON POST (heart.tsx postSound, the Sounds switch), primed in the
 *   press and played once the server has the post. Round 29: one soft two
 *   note chime, no whoosh and no tap on the press.
 *   THE SPACE'S GLYPH beside its name in the space picker (space-glyph.ts).
 */
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { flushSync } from "react-dom"
import { BarChart3, Check, ChevronDown, Clapperboard, GripVertical, Link2, Paperclip, Plus, X } from "lucide-react"
import { MemberAvatar } from "./member-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { EmojiControl } from "@/components/app/rich-text/emoji-picker"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { EMOJI_POPOVER } from "@/components/ui/popover-fit"
import { SHEET_CLOSE_EASE, SHEET_EASE } from "@/components/ui/bottom-sheet"
import { MAX_MEDIA_PER_POST, POLL_OPTIONS_MAX } from "@/lib/communities/limits"
import { EMBED_NAMES, MAX_EMBEDS, MAX_GIFS, STAFF_FILE_MAX_BYTES, fileSizeLabel, postEmbedFromUrl } from "@/lib/communities/post-media"
import type { FeedPostView, PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { glideIntoSight, holdAnchor, useArrivals } from "./arrive"
import { AttachmentTray, moveKey } from "./attachment-tray"
import { LinkCard } from "./media"
import { PHONE_ROW } from "./post-card"
import { useKeepFieldInSight } from "./keep-in-sight"
import { GifButton } from "./media-gif"
import { LinkField, type LinkPick } from "./media-link"
import { stopUpload, uploadCommunityFile, uploadKindOf, uploadPicture, uploadPostVideo, uploadVideoPoster } from "./media-upload"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { postSound, primeSounds } from "./heart"
import { spaceGlyph } from "./space-glyph"
import { toast } from "./toast"
import { BTN, BTN_GHOST, CARD, DEPTH, DEPTH_PRESS, ICON_BTN } from "./ui"
import { CALM } from "@/components/library/library-ui"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"
import { MEMBER_VIDEO_MAX_BYTES } from "@/lib/video/types"
import type { ComposerSpace, LinkPreview } from "./view-types"
import { useComposeRequests } from "@/lib/communities/client/compose-intent"
import { useLayer } from "@/lib/ui/layers"
import { MobileEditorSheet, sheetMoveMs } from "@/components/website-builder/mobile-editor-sheet"
import { sheetKeyboardRoom } from "./visible-box"
import { useToolbarFollowsKeys } from "./toolbar-follow"
import { useCalmFocus } from "./calm-focus"
import { feedRestore } from "./post-motion"
import { useStaffSchedule, type ComposerStaff } from "@/components/community/creator/composer-schedule"
import { checkScheduledPoll, type ScheduledPoll } from "@/lib/communities/scheduled-posts"
import { nudgeNotifications } from "@/lib/notifications/nudge"

export interface ComposerProps {
  communityId: string
  userId: string
  me: { name: string; avatarUrl: string | null }
  spaces: ComposerSpace[]
  /** On a space's page the post goes there. */
  fixedSpaceId?: string | null
  /** Kept for the pages that pass it; files now go through the community's own file route for every member. */
  fileProductId?: string | null
  /** Kept for the pages that pass it; events are made on the creator side. */
  eventHref?: string | null
  onPosted: (post: FeedPostView) => void
  /** Edit post (round 13): this post in the editor, opened at once; Save sends the change. */
  edit?: ComposerEdit | null
  /**
   * A new post asked for away from the feed (round 21, compose-anywhere.tsx): on a phone, the sheet opened at once over the
   * place on screen, with no field of its own in a list; `onClosed` once it has gone down (posted or not).
   */
  away?: { onClosed: () => void } | null
  /**
   * The admin's Posts only (round 26, ../creator/composer-schedule.tsx): Schedule, Save draft, and a scheduled post or
   * draft opened here to change. A member's composer never has it.
   */
  staff?: ComposerStaff | null
  /**
   * ROUND 27 (J4): open at once with these words, as if the person had just written them (the create wizard's welcome post,
   * create-flow.tsx). No "Your draft is back" line, and on a phone the sheet rises at once instead of waiting under
   * "Continue". This browser's kept draft is not read over it; what is typed is kept from then on as usual.
   */
  initial?: { title: string; body: string; spaceId?: string | null } | null
}

export interface ComposerEdit {
  post: FeedPostView
  /** The server has the change: the post as it is now. Called once the editor has folded away. */
  onSaved: (post: FeedPostView) => void
  /** Closed without saving (Cancel, Escape, Back), once the editor has folded away. */
  onClose: () => void
}

type AttachmentKind = "image" | "video" | "file" | "gif" | "embed"

interface Attachment {
  key: string
  kind: AttachmentKind
  name: string
  size: number
  preview?: string
  progress: number
  media?: PostMedia
  /** Why it did not upload or process; the tray says so and Post waits until it is taken off. */
  error?: string
}

interface PollDraft {
  question: string
  options: string[]
  multiple: boolean
  /** "keep": an edited poll's own end, as it was (keepAt). */
  closesIn: "" | "1" | "3" | "7" | "keep"
  /** An edited poll's end, when it has one. */
  keepAt?: string | null
  /** Votes an edited poll already has: its question and choices then stay as they are. */
  votes?: number
}

/** The post's poll as the editor holds it (Edit post). */
export function pollDraftOf(poll: FeedPostView["poll"]): PollDraft | null {
  if (!poll) return null
  return { question: poll.question, options: poll.options.map((o) => o.label), multiple: poll.multiple, closesIn: poll.closesAt ? "keep" : "", keepAt: poll.closesAt, votes: poll.totalVotes }
}

/** The poll a scheduled post or a draft keeps (round 27): its end as days from going up, cleaned as the server keeps it. */
function staffPollOf(poll: PollDraft | null): ScheduledPoll | null {
  if (!poll) return null
  const runs = poll.closesIn === "1" || poll.closesIn === "3" || poll.closesIn === "7" ? Number(poll.closesIn) : null
  const kept = checkScheduledPoll({ question: poll.question, options: poll.options, multiple: poll.multiple, closesInDays: runs }, false)
  return kept.ok ? kept.value : null
}

/** The poll as it is sent: its end as a date, "keep" for an edited poll's own, null for none. */
export function pollPayload(poll: PollDraft, now = Date.now()) {
  const closesAt = poll.closesIn === "keep" ? "keep" : poll.closesIn ? new Date(now + Number(poll.closesIn) * 86_400_000).toISOString() : null
  return { question: poll.question, options: poll.options.filter((o) => o.trim()), multiple: poll.multiple, closesAt }
}

interface Draft {
  title: string
  body: string
  spaceId: string | null
  poll: PollDraft | null
  media: PostMedia[]
}

/** Said when the server holds a post for a moderator and gives no words of its own. */
export const HELD_POST = "Your post is waiting for a moderator."

export const LEAVE_QUESTION = "You haven't finished your post yet. Leave without posting?"

/*
  The question's two answers (round 31). The same press as every button here (a pixel down, at once), the size set where
  they are drawn. Keep writing is the library's calm secondary (components/library/library-ui.ts CALM); Leave is red
  words on a faint red ground with a red hairline, its colours variables with the dark look's own in
  scripts/gen-theme-dark.mjs.
*/
const LEAVE_BTN =
  "inline-flex shrink-0 touch-manipulation select-none items-center justify-center whitespace-nowrap font-semibold outline-none transition-[background-color,border-color,box-shadow,translate] duration-150 active:translate-y-px active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
const LEAVE_STAY = CALM
const LEAVE_GO =
  "border border-[color:var(--sl-danger-line,#f6c3bd)] bg-[var(--sl-danger-soft,#fef3f2)] text-[color:var(--sl-danger-ink,#b42318)] shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-[color:var(--sl-danger-line-hover,#f0a39a)] hover:bg-[var(--sl-danger-soft-hover,#fde7e5)] active:bg-[var(--sl-danger-soft-press,#fbd9d5)] active:shadow-none"

/** One tool in the editor's row: a 40px target, the glyph alone, no box until hovered. Shared with the wizard's welcome post (composer-welcome.tsx). */
export const TOOL =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] text-[#6b7280] outline-none transition-colors duration-150 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:opacity-70 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-[#eceef1] aria-pressed:text-[#1a1a2e] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** The editor in place grows over this long, and folds back a little quicker. */
const GROW_MS = 260
const FOLD_MS = 220
/*
  THE CARD GROWS, THEN ITS CONTENT ARRIVES (round 12). Opening: the field's
  placeholder goes at once (FIELD_OUT_MS) while the posts slide down; the
  editor's content (the name line, the fields, the toolbar) fades in from
  CONTENT_DELAY_MS, once most of the room is there. Closing is the same
  backwards: the content goes first, then the card folds and the field
  comes back as it ends. The picture never moves or changes size.
*/
const FIELD_OUT_MS = 110
const CONTENT_DELAY_MS = 110
const CONTENT_IN_MS = 200
const CONTENT_OUT_MS = 120
/* Closing: the posts start up once the content has mostly gone, and the field is back as they arrive. */
const FOLD_DELAY_MS = 70
const FIELD_BACK_DELAY_MS = 140
const FIELD_BACK_MS = 150
const FADE_GOING = "cubic-bezier(0.4, 0, 1, 1)"
const FADE_COMING = "cubic-bezier(0, 0, 0.2, 1)"
/** The closed field's height when it was never drawn (a draft that opened the editor at once). */
const CLOSED_FALLBACK_H = 72
/** How long the Post button shows its check before the editor closes. */
const SENT_HOLD_MS = 260
/** The title's own limit (its field's maxLength). */
export const TITLE_MAX = 200
/** The title and the words, as every post writer draws them (the feed's, Edit post's, the wizard's welcome post). */
export const TITLE_FIELD = "block w-full bg-transparent text-[18px] font-semibold text-[#1a1a2e] outline-none placeholder:font-semibold placeholder:text-[#a3a8b0] sm:text-[19px]"
export const WORDS_FIELD = "mt-2 text-[16px] leading-[1.55] text-[#262633] sm:text-[15px]"
/** Cancel: a plain word, tinted under a pointer (round 29). */
const CANCEL_BTN = BTN_GHOST
/** Post: the one filled button, with no hairline round it (round 29: DEPTH_INK's ink border read as a light edge in the dark look). */
const POST_BTN = `${BTN} h-10 bg-[#1a1a2e] px-4 text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18)] hover:bg-[#2b2b42] sm:h-9`

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * What comes after the editor in its list (the posts), which slides to make room for it.
 *
 * ROUND 26: A WRAPPER IS SEEN THROUGH. The admin's Posts draws the composer inside a wrapper of its own (feed-section.tsx,
 * marked data-composer-host), so the card had nothing after it: the panel and the list under the writer did not slide,
 * they jumped by the editor's whole height in one frame as it opened, and again as it folded. Inside a host, what comes
 * after the host is what slides.
 */
function following(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let at: HTMLElement | null = el; at; at = at.parentElement?.hasAttribute("data-composer-host") ? at.parentElement : null) {
    for (let x = at.nextElementSibling; x; x = x.nextElementSibling) if (x instanceof HTMLElement && !(x instanceof HTMLInputElement)) out.push(x)
  }
  return out
}

export function draftKey(communityId: string, spaceId?: string | null): string {
  return `storelib:community-draft:${communityId}${spaceId ? `:${spaceId}` : ""}`
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (typeof d !== "object" || !d) return null
    return { title: String(d.title || ""), body: String(d.body || ""), spaceId: d.spaceId || null, poll: d.poll ?? null, media: Array.isArray(d.media) ? d.media : [] }
  } catch {
    return null
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/i

function attachmentOf(m: PostMedia, key: string): Attachment {
  if (m.type === "image") return { key, kind: "image", name: "", size: 0, preview: m.url, progress: 100, media: m }
  if (m.type === "video") return { key, kind: "video", name: "Video", size: 0, preview: m.poster, progress: 100, media: m }
  if (m.type === "file") return { key, kind: "file", name: m.name, size: m.size ?? 0, progress: 100, media: m }
  if (m.type === "gif") return { key, kind: "gif", name: m.title ?? "GIF", size: 0, preview: m.still, progress: 100, media: m }
  if (m.type === "embed") return { key, kind: "embed", name: m.title ?? EMBED_NAMES[m.provider], size: 0, preview: m.thumb, progress: 100, media: m }
  return { key, kind: "file", name: "", size: 0, progress: 100 }
}

function usePhone(): boolean {
  /* Read at once in the browser (the closed field draws the same either way, so a server render matches): Edit post opens on its first frame as a phone's screen, never in place for a frame. */
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/**
 * NOT LEAVING BY ACCIDENT. While `active`: a link to another page is held
 * and the question asked first; Back is held by one extra step of history
 * (pushed while it matters, taken away again after) and the question asked;
 * closing or reloading the tab gets the browser's own. `sheet` also makes
 * Back close the phone's screen when nothing is written.
 */
function useLeaveGuard(opts: { active: boolean; sheet: boolean; ask: () => Promise<boolean>; onLeave: () => void; onSheetBack: () => void }) {
  const router = useRouter()
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })
  const guarding = opts.active || opts.sheet

  useEffect(() => {
    if (!opts.active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-composer]")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      e.preventDefault()
      e.stopPropagation()
      void latest.current.ask().then((leave) => {
        if (!leave) return
        latest.current.onLeave()
        router.push(`${url.pathname}${url.search}${url.hash}`)
      })
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [opts.active, router])

  useEffect(() => {
    if (!guarding) return
    const marker = `composer-${Date.now()}`
    /*
      THE PAGE UNDER THE STEP KEEPS ITS SCROLL. The step added here is this
      same page, and stepping back over it is a history traversal: the
      browser would put back the scroll the page had when the step was added
      (before the member scrolled while writing, and while the post just sent
      is being scrolled to). Which scroll a traversal restores is set on the
      entry it lands on, so it is set on this one before the step, and put
      back once the step is gone (a moment after popstate, when the browser
      would have restored it).
    */
    const was = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    const push = () => window.history.pushState({ ...(window.history.state ?? {}), storelibComposer: marker }, "", window.location.href)
    push()
    let ours = true
    const onPop = () => {
      if ((window.history.state as { storelibComposer?: string } | null)?.storelibComposer === marker) return
      if (!latest.current.active) {
        ours = false
        latest.current.onSheetBack()
        return
      }
      /* Held: the step comes back, and the question is asked. */
      push()
      void latest.current.ask().then((leave) => {
        if (!leave) return
        /* On a phone Back closes the screen, so Leave does only that; in place, Back meant the page before. */
        if (latest.current.sheet) return latest.current.onLeave()
        ours = false
        latest.current.onLeave()
        window.history.go(-2)
      })
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      const putBack = () => window.setTimeout(() => (window.history.scrollRestoration = was), 400)
      if (ours && (window.history.state as { storelibComposer?: string } | null)?.storelibComposer === marker) {
        window.addEventListener("popstate", putBack, { once: true })
        window.history.back()
      } else putBack()
    }
  }, [guarding])
}

export function Composer({ communityId, userId, me, spaces, fixedSpaceId = null, onPosted, edit = null, away = null, staff = null, initial = null }: ComposerProps) {
  const key = draftKey(communityId, fixedSpaceId)
  const phone = usePhone()
  /* Edit post: the post as it was, read once, for the editor's first state and to tell whether anything changed. */
  const editing = !!edit
  const [was] = useState(() => (edit ? edit.post : null))
  const wasLink = was?.media.find((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link") ?? null
  const [open, setOpen] = useState(editing || !!away || !!initial)
  const awayRef = useRef(away)
  awayRef.current = away
  const [sheetIn, setSheetIn] = useState(false)
  const sheetInRef = useRef(false)
  sheetInRef.current = sheetIn
  /*
    THE SCREEN FIRST, ITS FIELDS ON THE NEXT FRAME (round 15, the owner: "quicker to appear"). The tap drew the whole editor
    (the fields, the mentions, the emoji and GIF tools, the space picker) before the screen could move: one task of 140 to
    170ms at 4x CPU. Now the tap draws the screen's own frame (its header with Cancel and Post, and the white), the slide
    starts on that frame, and the editor is drawn into it on the next one, while the compositor is already moving it: by the
    time the body has come up into view it is filled.
  */
  const [filled, setFilled] = useState(editing)
  const [title, setTitle] = useState(was?.title ?? initial?.title ?? "")
  const [body, setBody] = useState(was?.bodyText ?? initial?.body ?? "")
  const [spaceId, setSpaceId] = useState<string | null>(
    was ? (was.space?.id ?? null) : (fixedSpaceId ?? (initial?.spaceId && spaces.some((x) => x.id === initial.spaceId) ? initial.spaceId : spaces.length === 1 ? spaces[0].id : null)),
  )
  /* Round 30: Post was pressed before a space was chosen; the picker says so until one is. */
  const [spaceAsk, setSpaceAsk] = useState(false)
  const spaceOpener = useRef<(() => void) | null>(null)
  const hintId = useId()
  if (spaceAsk && (spaceId || !open)) setSpaceAsk(false)
  const [poll, setPoll] = useState<PollDraft | null>(() => pollDraftOf(was?.poll ?? null))
  const [items, setItems] = useState<Attachment[]>(() => (was ? was.media.filter((m) => m.type !== "link").map((m, i) => attachmentOf(m, `kept-${i}`)) : []))
  const [preview, setPreview] = useState<LinkPreview | null>(wasLink ? { url: wasLink.url, title: wasLink.title ?? null, image: wasLink.image ?? null, site: null } : null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [linkField, setLinkField] = useState<null | "link" | "video">(null)
  const [busy, setBusy] = useState(false)
  /* The server has the post: the check shows, then the editor closes and the post goes into the feed (AFTER POST). */
  const [sent, setSent] = useState(false)
  const afterClose = useRef<(() => void) | null>(null)
  const arrive = useArrivals()
  const [restored, setRestored] = useState(false)
  /* The last post was held for a moderator; what is here is a copy of it. */
  const [heldCopy, setHeldCopy] = useState(false)
  const [asking, setAsking] = useState<((leave: boolean) => void) | null>(null)
  const textRef = useRef<MentionTextareaHandle>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  /* The one card (closed and open in place), its closed row, the editor's content in it, the phone's screen and the part of it that scrolls. */
  const cardRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /* The website builder's sheet is up (false from the moment it starts to go down). */
  const [sheetUp, setSheetUp] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  /* The feed's scroll when the phone's sheet opened (put back under it before it closes). */
  const notedScroll = useRef<number | null>(null)
  /* How tall the closed field was, for the editor growing out of it. */
  const closedH = useRef(0)
  /* The fold (the posts' slide, the card's edge, the crossfade), held at its end until the closed card is drawn. */
  const held = useRef<Animation[]>([])
  const leaving = useRef(false)
  /* The phone's sheet has landed down: what shut() does then (onMoved). */
  const landedDown = useRef<(() => void) | null>(null)
  /* Cancel or Leave: what was written is cleared once the card has closed, never while it is still on screen. */
  const clearAfter = useRef(false)
  /* The editor had the caret when it closed: the field gets it back (round 26). */
  const refocus = useRef(false)
  const openRef = useRef(false)

  /* A kept draft put into the fields; true when there was one. */
  const restoreFrom = (d: Draft | null): boolean => {
    if (!d || !(d.title || d.body || d.poll || d.media.length)) return false
    setTitle(d.title)
    setBody(d.body)
    if (!fixedSpaceId && d.spaceId && spaces.some((s) => s.id === d.spaceId)) setSpaceId(d.spaceId)
    setPoll(d.poll)
    setItems(d.media.filter((m) => m.type !== "link").map((m, i) => attachmentOf(m, `restored-${i}`)))
    const link = d.media.find((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
    if (link) setPreview({ url: link.url, title: link.title ?? null, image: link.image ?? null, site: null })
    setRestored(true)
    return true
  }
  /* A draft left here comes back: open in place on a computer, waiting under "Continue" on a phone. (Never into Edit post.) */
  useEffect(() => {
    /* Edit post, or words handed in (`initial`, round 27): the kept draft is not read over them. */
    if (editing || initial) return
    const d = readDraft(key)
    if (restoreFrom(d) && !window.matchMedia("(max-width: 639px)").matches) setOpen(true)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const media = items.map((u) => u.media).filter((m): m is PostMedia => !!m)
  const linkMedia: PostMedia | null = preview && !dismissed.includes(preview.url) ? { type: "link", url: preview.url, ...(preview.title ? { title: preview.title } : {}), ...(preview.image ? { image: preview.image } : {}) } : null

  /* The fields emptied (what is kept in this browser stays where it is). */
  const resetFields = useCallback(() => {
    setTitle("")
    setBody("")
    setPoll(null)
    setItems([])
    setPreview(null)
    setDismissed([])
    setLinkField(null)
    setRestored(false)
    setHeldCopy(false)
    if (!fixedSpaceId && spaces.length !== 1) setSpaceId(null)
  }, [fixedSpaceId, spaces.length])

  /*
    ROUND 26: SCHEDULE, SAVE DRAFT AND A SCHEDULED POST OPENED HERE, for the people who run the community (the admin passes
    `staff`; ../creator/composer-schedule.tsx). What it needs of the composer is below; its close is the composer's own
    (the check, then the fold or the sheet going down). A scheduled post or draft opened here never writes over the kept
    draft: what was being written is put into this browser's keeping first and comes back once it is closed.
  */
  const staffHands = useRef<{ openEditor: () => void; finish: (then: () => void) => void; nudge: (f: "title" | "body" | "space") => void }>({ openEditor: () => {}, finish: () => {}, nudge: () => {} })
  const staffItem = useRef(false)
  const kit = useStaffSchedule(staff, {
    communityId,
    title,
    body,
    spaceId,
    /* Round 27 (B1, part 222): what Post would send now goes with a scheduled post or a draft too. */
    media: linkMedia ? [...media, linkMedia] : media,
    poll: staffPollOf(poll),
    uploading: items.some((u) => !u.media && !u.error),
    failed: items.some((u) => !!u.error),
    open,
    load: (it) => {
      if (it) {
        if (!staffItem.current && (title.trim() || body.trim() || poll || items.length || linkMedia)) {
          try {
            const all = linkMedia ? [...media, linkMedia] : media
            window.localStorage.setItem(key, JSON.stringify({ title, body, spaceId, poll, media: all } satisfies Draft))
          } catch {
            /* nothing kept */
          }
        }
        staffItem.current = true
        resetFields()
        setTitle(it.title)
        setBody(it.body)
        if (!fixedSpaceId) setSpaceId(it.spaceId && spaces.some((x) => x.id === it.spaceId) ? it.spaceId : null)
        /* Its pictures, files, video, GIFs and videos by link in the tray, its link card and its poll, as they were saved. */
        const kept = it.media ?? []
        setItems(kept.filter((m) => m.type !== "link").map((m, i) => attachmentOf(m, `scheduled-${i}`)))
        const link = kept.find((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
        if (link) setPreview({ url: link.url, title: link.title ?? null, image: link.image ?? null, site: null })
        setPoll(it.poll ? { question: it.poll.question, options: it.poll.options.length ? it.poll.options : ["", ""], multiple: it.poll.multiple, closesIn: it.poll.closesInDays ? (String(it.poll.closesInDays) as PollDraft["closesIn"]) : "" } : null)
        return
      }
      staffItem.current = false
      resetFields()
      restoreFrom(readDraft(key))
    },
    openEditor: () => staffHands.current.openEditor(),
    setBusy,
    finish: (then) => staffHands.current.finish(then),
    nudge: (f) => staffHands.current.nudge(f),
    toast,
  })

  /* Every change kept, a moment after typing stops (a new post only: an edit is the post's own). */
  useEffect(() => {
    if (!open || editing) return
    /* A scheduled post or draft open here is the server's, not this browser's kept draft (round 26). */
    if (kit.item) return
    const t = window.setTimeout(() => {
      try {
        const all = linkMedia ? [...media, linkMedia] : media
        if (!title && !body && !poll && !all.length) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify({ title, body, spaceId, poll, media: all } satisfies Draft))
      } catch {
        /* Private mode: nothing kept, nothing lost. */
      }
    }, 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, body, spaceId, poll, items, preview, dismissed, key, kit.item])

  const add = (a: Attachment) => setItems((list) => [...list, a])
  const patch = (k: string, p: Partial<Attachment>) => setItems((list) => list.map((x) => (x.key === k ? { ...x, ...p } : x)))
  const drop = (k: string) => setItems((list) => list.filter((x) => x.key !== k))
  const room = () => MAX_MEDIA_PER_POST - items.length
  const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  /* An address in the words: YouTube or Vimeo become the video, anything else its card. */
  const typedLink = URL_IN_TEXT.exec(body)?.[0] ?? null
  useEffect(() => {
    if (!typedLink || dismissed.includes(typedLink)) return
    const embed = postEmbedFromUrl(typedLink)
    if (embed) {
      if (dismissed.includes(embed.url)) return
      const t = window.setTimeout(() => {
        setItems((list) => (list.some((x) => x.media?.type === "embed" && x.media.id === embed.id) || list.length >= MAX_MEDIA_PER_POST ? list : [...list, attachmentOf({ type: "embed", ...embed }, newKey())]))
      }, 400)
      return () => window.clearTimeout(t)
    }
    if (preview?.url === typedLink || (preview && !dismissed.includes(preview.url))) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: typedLink }, signal: ctrl.signal })
      if (r.ok && r.data.preview) setPreview(r.data.preview)
    }, 600)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedLink, dismissed, communityId])

  /* What the link field hands over (media-link.tsx): a video by link becomes the post's video, any other link its card. */
  const addPick = (pick: LinkPick) => {
    if (pick.embed) {
      if (items.filter((x) => x.kind === "embed").length >= MAX_EMBEDS) return toast(`Up to ${MAX_EMBEDS} videos by link in one post.`)
      if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
      const p = pick.preview
      const thumb = pick.embed.thumb ?? p?.image ?? undefined
      const k = newKey()
      add(attachmentOf({ type: "embed", ...pick.embed, ...(thumb ? { thumb } : {}), ...(p?.title ? { title: p.title.slice(0, 200) } : {}) }, k))
      setLinkField(null)
      /* Added before its page was read: Vimeo's and Loom's picture and any one's title come from there, read by the server. */
      if (!p) {
        void api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: pick.embed.url } }).then((r) => {
          const got = r.ok ? r.data.preview : null
          if (!got) return
          setItems((list) =>
            list.map((x) =>
              x.key === k && x.media?.type === "embed"
                ? { ...x, name: got.title || x.name, preview: x.preview ?? got.image ?? undefined, media: { ...x.media, ...(got.title ? { title: got.title.slice(0, 200) } : {}), ...(!x.media.thumb && got.image ? { thumb: got.image } : {}) } }
                : x,
            ),
          )
        })
      }
      return
    }
    setLinkField(null)
    setDismissed((d) => d.filter((x) => x !== pick.url))
    setPreview(pick.preview ?? { url: pick.url, title: null, image: null, site: null })
    /* Added before the page was read (Enter at once): its card fills in when the server has read it. */
    if (!pick.preview) {
      void api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: pick.url } }).then((r) => {
        if (r.ok && r.data.preview) setPreview((now) => (now?.url === pick.url ? r.data.preview : now))
      })
    }
  }

  /* A video goes through the community's video route; only a ready one can be posted. Its still is the card's picture. */
  const addVideo = async (file: File | undefined) => {
    if (!file) return
    if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    const looksVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name)
    if (!looksVideo) return toast("That file is not a video.")
    if (file.size > MEMBER_VIDEO_MAX_BYTES) return toast("That video is over 1 GB.")
    setLinkField(null)
    const k = newKey()
    add({ key: k, kind: "video", name: file.name, size: file.size, progress: 0 })
    try {
      /* Post waits until the video plays: sent, then processed on a video service (media-upload.ts uploadPostVideo). */
      const [video, still] = await Promise.all([
        uploadPostVideo({ communityId, file, key: k, onProgress: (p) => patch(k, { progress: p }), onProcessing: () => patch(k, { progress: 100 }) }),
        uploadVideoPoster(file, userId, communityId).then((s) => (s && patch(k, { preview: s.poster }), s)),
      ])
      patch(k, { progress: 100, preview: still?.poster, media: { type: "video", videoId: video.id, ...(still ? { poster: still.poster, w: still.w, h: still.h } : {}) } })
    } catch (e) {
      const message = (e as { message?: string })?.message || "The video did not upload."
      if (message === "Upload stopped") return drop(k)
      patch(k, { error: message })
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, Math.max(0, room()))
    if (list.length < files.length) toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    await Promise.all(
      list.map(async (file) => {
        const kind = uploadKindOf(file)
        const k = newKey()
        if (kind === "image") {
          add({ key: k, kind, name: file.name, size: file.size, preview: URL.createObjectURL(file), progress: 0 })
          try {
            const pic = await uploadPicture(file, userId, communityId, { key: k, onProgress: (p) => patch(k, { progress: p }) })
            patch(k, { progress: 100, media: pic })
          } catch (e) {
            const message = (e as Error).message || "The picture did not upload."
            if (message === "Upload stopped") return drop(k)
            patch(k, { error: message })
          }
          return
        }
        if (kind === "video") return addVideo(file)
        if (file.size > STAFF_FILE_MAX_BYTES) return toast(`${file.name} is over ${fileSizeLabel(STAFF_FILE_MAX_BYTES)}.`)
        add({ key: k, kind: "file", name: file.name, size: file.size, progress: 0 })
        try {
          const done = await uploadCommunityFile({ communityId, file, onProgress: (p) => patch(k, { progress: p }) })
          patch(k, { progress: 100, name: done.name, media: done })
        } catch (e) {
          const message = (e as Error).message || "The file did not upload."
          if (message === "Upload stopped") return drop(k)
          patch(k, { error: message })
        }
      }),
    )
  }

  const addGif = (gif: Extract<PostMedia, { type: "gif" }>) => {
    if (items.filter((x) => x.kind === "gif").length >= MAX_GIFS) return toast(`Up to ${MAX_GIFS} GIFs in one post.`)
    if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    add(attachmentOf(gif, newKey()))
  }

  const removeItem = (a: Attachment) => {
    stopUpload(a.key)
    const m = a.media
    if (m?.type === "embed") {
      /* Taken off, it stays off: the address in the words does not bring it back. */
      const typed = typedLink && postEmbedFromUrl(typedLink)?.id === m.id ? [typedLink] : []
      setDismissed((d) => [...d, m.url, ...typed])
    }
    drop(a.key)
  }

  /* Something to lose on Cancel: anything written, or for an edit anything changed from the post. */
  const dirty = kit.item
    ? !!kit.dirty
    : was
    ? title !== (was.title ?? "") ||
      body !== was.bodyText ||
      spaceId !== (was.space?.id ?? null) ||
      JSON.stringify(poll) !== JSON.stringify(pollDraftOf(was.poll)) ||
      JSON.stringify(linkMedia ? [...media, linkMedia] : media) !== JSON.stringify(was.media.filter((m) => m.type !== "link").concat(wasLink ? [wasLink] : []))
    : !!(title.trim() || body.trim() || items.length || poll || linkMedia)
  const uploading = items.some((u) => !u.media && !u.error)
  const pollReady = !poll || (poll.question.trim() && poll.options.filter((o) => o.trim()).length >= 2)
  const space = spaces.find((s) => s.id === spaceId) ?? null
  const ready = !!title.trim() && !!body.trim() && !!spaceId && !uploading && !items.some((u) => u.error) && !!pollReady && kit.ready
  /* What Post says it is waiting for, when that is only the space (round 30). */
  const why = !ready && title.trim() && body.trim() && !spaceId ? tt("Choose a space first") : undefined
  const nudgeRing = (el: HTMLElement | null) => {
    if (!el || typeof el.animate !== "function") return
    el.animate(
      [{ boxShadow: "0 0 0 0 rgba(26,26,46,0)" }, { boxShadow: "0 0 0 3px rgba(26,26,46,0.07)" }, { boxShadow: "0 0 0 0 rgba(26,26,46,0)" }],
      { duration: 520, easing: "ease-out" },
    )
  }
  const nudgePost = () => {
    if (ready || busy || sent) return
    hapticTap("light")
    if (!title.trim()) {
      titleRef.current?.focus({ preventScroll: true })
      nudgeRing(titleRef.current)
      return
    }
    if (!body.trim()) {
      textRef.current?.focus()
      return
    }
    if (!spaceId) {
      /*
        NO SPACE YET (round 30, the owner: "pressing Post does nothing"). The faint ring alone was not seen. Now the picker
        gives one soft shake (a translate only, on the compositor; none for reduced motion), takes an amber ring and a short
        line beside it ("Choose a space first"), and opens once the shake has settled, so the next step is in front of them.
        Post itself stays as it was: it says why in its label, never greyed out.
        On a phone the picker is on the screen (portalled), not in the card.
      */
      const btn = (sheetRef.current ?? cardRef.current)?.querySelector<HTMLButtonElement>("button[data-composer-space]") ?? null
      setSpaceAsk(true)
      const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (btn && !still && typeof btn.animate === "function") {
        btn.animate(SPACE_SHAKE, { duration: SPACE_SHAKE_MS, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" })
      }
      btn?.focus({ preventScroll: true })
      window.setTimeout(
        () => {
          if (openRef.current) spaceOpener.current?.()
        },
        still ? 0 : SPACE_SHAKE_MS + 60,
      )
      return
    }
    if (!pollReady) {
      const q = (sheetRef.current ?? cardRef.current)?.querySelector<HTMLElement>("[data-poll-question]") ?? null
      nudgeRing(q)
      q?.focus({ preventScroll: true })
    }
  }
  const sheet = open && phone
  openRef.current = open

  /*
    THE TAB BAR UNDER THE SCREEN (round 15). The phone's screen covers the tab bar while it is open, counted as a "composer"
    layer (lib/ui/layers.ts): the bar holds still under it, never slid away, and is simply there again when it has gone. Held
    from the commit that draws the screen to the one that takes it away, so no close, Leave or Back can leave it hidden.
  */
  useLayer("composer", sheet, sheetRef)

  /*
    Emptied: a new post, with what this browser keeps of it. Round 26: a scheduled post or draft open here (the staff kit)
    gives the fields back to what was being written before it instead, kept draft and all.
  */
  const clear = () => {
    if (staffItem.current) {
      staffItem.current = false
      kit.release()
      resetFields()
      restoreFrom(readDraft(key))
      return
    }
    resetFields()
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing kept */
    }
  }

  /* Edit post: what happens once the editor has gone (saved, or closed without saving). */
  const editDone = useRef<(() => void) | null>(null)
  /** Closing, with its move: down off the screen on a phone, folding back into the field in place. */
  const shut = useCallback(() => {
    if (leaving.current) return
    if (!phone && !edit && cardRef.current?.contains(document.activeElement)) refocus.current = true
    const end = () => {
      leaving.current = false
      setSheetIn(false)
      setSheetUp(false)
      setOpen(false)
      if (!edit) setFilled(false)
      if (edit) {
        const then = editDone.current ?? edit.onClose
        editDone.current = null
        then()
      }
    }
    /* In place, an edit hands the post back at once: the post card fades its words in where the editor was (post-card.tsx). */
    if (edit && !phone) return end()
    const el = phone ? sheetRef.current : cardRef.current
    /* Round 29: a phone's sheet always goes down on its own close (shorter with reduced motion, mobile-editor-sheet.tsx), never in one frame. */
    if (!el || typeof el.animate !== "function" || (!phone && reducedMotion())) return end()
    leaving.current = true
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      end()
    }
    if (phone) {
      /*
        DOWN ON THE WEBSITE BUILDER'S SHEET (round 17): the sheet's own close, over its own time. The field lets go of the
        caret now, so the keyboard goes down with the sheet (which holds its content still while it closes, round 25); the
        feed is put back first, under the covering sheet. ROUND 25: done when the sheet says it has landed (onMoved), not
        after a guess at its time; the timer is only for a tab in the background.
      */
      const active = document.activeElement as HTMLElement | null
      if (active && el.contains(active)) active.blur()
      const back = notedScroll.current === null ? null : feedRestore(notedScroll.current, window.scrollY)
      if (back !== null) window.scrollTo({ top: back, behavior: "instant" as ScrollBehavior })
      landedDown.current = finish
      setSheetUp(false)
      window.setTimeout(finish, sheetMoveMs() + 400)
      return
    }
    /* The page keeps its scroll as the editor folds (the browser would otherwise move it to follow a post on screen). */
    holdAnchor(FOLD_DELAY_MS + FOLD_MS + 900)
    const d = Math.max(0, el.offsetHeight - (closedH.current || CLOSED_FALLBACK_H))
    const timing: KeyframeAnimationOptions = { duration: FOLD_MS, delay: FOLD_DELAY_MS, easing: SHEET_CLOSE_EASE, fill: "forwards" }
    /*
      ROUND 26: DONE WHEN THE FOLD HAS FOLDED. It ended on a timer of the fold's length, started with the press; on a busy
      page the fold's first frame came late, the timer won, and the card shut with the slide part way (the list jumped the
      rest of the way in one frame). It ends on the slide's own finish now, as the phone's sheet does; the timer is only
      for a tab in the background, which draws no frames.
    */
    window.setTimeout(finish, FOLD_DELAY_MS + FOLD_MS + 400)
    /* The card stays, whole, its picture where it is: the content goes, the posts slide up over the card, the field comes back as they end. */
    const content = [editorRef.current, nameRef.current].filter((x): x is HTMLDivElement => !!x)
    for (const a of fieldRef.current?.getAnimations() ?? []) a.cancel()
    held.current = [
      ...following(el).map((x) => x.animate([{ translate: "0 0" }, { translate: `0 ${-d}px` }], timing)),
      ...content.map((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CONTENT_OUT_MS, easing: FADE_GOING, fill: "forwards" })),
      ...(fieldRef.current ? [fieldRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FIELD_BACK_MS, delay: FIELD_BACK_DELAY_MS, easing: FADE_COMING, fill: "both" })] : []),
    ]
    held.current[0]?.addEventListener("finish", finish)
  }, [phone, edit])

  const ask = useCallback(() => new Promise<boolean>((resolve) => setAsking(() => resolve)), [])

  /* The title, or the words when there is a title already; without scrolling, so the page under it stays where it is. */
  const titleNow = useRef(title)
  titleNow.current = title
  const focusFirst = useCallback(() => {
    if (titleNow.current) textRef.current?.focus()
    else titleRef.current?.focus({ preventScroll: true })
  }, [])

  /*
    AN EMOJI GOES WHERE THE CARET WAS (round 29, the owner: "with the cursor in the title, the emoji went into the words").
    The field that had the caret last is noted as it takes it (the emoji's own search box is neither, so it changes
    nothing), and a pick goes into that one: the title at its caret, replacing what is selected there, the words through
    their own handle. An input keeps its selection after it lets the focus go, so the place is still there to read.
  */
  const lastField = useRef<"title" | "body">("body")
  const insertEmoji = (emoji: string) => {
    const el = titleRef.current
    if (lastField.current !== "title" || !el) return textRef.current?.insert(emoji)
    const from = el.selectionStart ?? el.value.length
    const to = el.selectionEnd ?? from
    if (el.value.length - (to - from) + emoji.length > TITLE_MAX) return
    setTitle(el.value.slice(0, from) + emoji + el.value.slice(to))
    const caret = from + emoji.length
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(caret, caret)
    })
  }

  const cancel = async () => {
    if (dirty && !(await ask())) return
    if (!editing) clearAfter.current = true
    shut()
  }

  useLeaveGuard({
    active: open && dirty && !sent,
    sheet,
    ask,
    onLeave: () => {
      if (edit) return shut()
      /* On a phone the sheet goes down on its own close and is emptied once it is down (round 29: it went in one frame). */
      if (phone) {
        clearAfter.current = true
        return shut()
      }
      clear()
      setSheetIn(false)
      setOpen(false)
    },
    onSheetBack: shut,
  })

  /* Edit post in place: Escape is Cancel. */
  useEffect(() => {
    if (!edit || phone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog], [data-state=open][role=dialog]:not([data-post-overlay])")) {
        e.preventDefault()
        void cancel()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /*
    ROUND 17: THE PHONE'S SCREEN IS THE WEBSITE BUILDER'S SHEET (mobile-editor-sheet.tsx), rising on its own move from its
    first frame, its fields drawn before it moves (in this commit, so the move never carries their first draw), the page
    behind held where it is by its scroll alone (holdPage "scroll": no overflow switched off, which on iOS restyled the whole
    page in the close's last frame and left the feed's scroll stuck). The page's overscroll is held too, and its scroll is
    noted and put back under the sheet before it closes (shut). Nothing behind it moves, scales or darkens at its edges.
    THE FIELD TAKES THE CARET ONCE THE SHEET HAS ARRIVED: a keyboard rising while the sheet still moved changed the visible
    height in the middle of the move.
  */
  useLayoutEffect(() => {
    if (!sheet) return
    const html = document.documentElement
    const prev = html.style.overscrollBehavior
    html.style.overscrollBehavior = "none"
    notedScroll.current = window.scrollY
    /*
      ROUND R8: THE FEED BEHIND IS NOT SHORTENED FOR THE SHEET'S KEYBOARD. With a field in the sheet typed in, KeyboardGuard's
      `keyboard-open` cut the community's frame to the visible height (app/globals.css), which threw the feed's scroll back to
      the top under the sheet: the whole page jumped as the keyboard came up and stayed at the top once it went down. The
      sheet covers the frame, so the frame is marked while it is up, as an opened post marks it (data-post-over).
    */
    const shell = document.querySelector<HTMLElement>("[data-community-shell]")
    shell?.setAttribute("data-sheet-over", "")
    setFilled(true)
    /*
      ROUND 25: PREPARED BEFORE IT RISES. The sheet is primed (drawn at its stop, unseen): the fields are laid out and
      painted in it first (a frame for the sheet to mount them, a task for React, a frame for their paint), and only then is
      it raised, so the rise has nothing else to draw. The caret goes in once it has landed (onMoved), not after a guess at
      its time.
    */
    let raf = 0
    let task = 0
    raf = requestAnimationFrame(() => {
      task = window.setTimeout(() => {
        raf = requestAnimationFrame(() => {
          if (!leaving.current) setSheetUp(true)
        })
      }, 0)
    })
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(task)
      html.style.overscrollBehavior = prev
      shell?.removeAttribute("data-sheet-over")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet])

  /* In place: the posts under the editor slide down to make room, uncovering it as it fades in. */
  useLayoutEffect(() => {
    if (!open) {
      /* Closed: the fold was held at its end; the closed card is drawn now (the same pixels), so let it go in the same frame. */
      for (const a of held.current) a.cancel()
      held.current = []
      /* Cancel or Leave: emptied now that nothing of it is on screen. */
      if (clearAfter.current) {
        clearAfter.current = false
        clear()
      }
      /* Closed from inside the editor on a computer (Cancel, Escape, Post): the caret comes back to the field it opened from. */
      if (refocus.current) {
        refocus.current = false
        if (!document.activeElement || document.activeElement === document.body) fieldRef.current?.focus({ preventScroll: true })
      }
      /* A post just sent goes into the feed now, after the editor's move (AFTER POST). */
      const posted = afterClose.current
      afterClose.current = null
      posted?.()
      /* Away from the feed, the composer has nothing left to show once its sheet is down: its owner takes it out. */
      if (awayRef.current) {
        awayRef.current.onClosed()
        return
      }
      /* The posts' own layer, held while the editor was open (so the fold drew nothing new), goes once all is still. */
      const list = cardRef.current ? following(cardRef.current) : []
      const t = window.setTimeout(() => {
        for (const x of list) x.style.willChange = ""
      }, 400)
      return () => window.clearTimeout(t)
    }
    if (phone) return
    /* Edit post in place: the editor fades in where the post's words were (the card around it is the post's). */
    if (edit) {
      editorRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: CONTENT_IN_MS, easing: FADE_COMING })
      return
    }
    const el = cardRef.current
    if (!el || typeof el.animate !== "function" || reducedMotion() || !closedH.current) return
    const d = el.offsetHeight - closedH.current
    if (d <= 0) return
    const timing: KeyframeAnimationOptions = { duration: GROW_MS, easing: SHEET_EASE }
    /* The same card, the same picture: the posts slide down off it, the field's words go, then the editor's content fades in. */
    for (const x of following(el)) x.animate([{ translate: `0 ${-d}px` }, { translate: "0 0" }], timing)
    fieldRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FIELD_OUT_MS, easing: FADE_GOING })
    for (const x of [nameRef.current, editorRef.current]) x?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CONTENT_IN_MS, delay: CONTENT_DELAY_MS, easing: FADE_COMING, fill: "backwards" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phone])

  /* The field being typed in stays in sight when the visible part changes (keep-in-sight.ts). */
  useKeepFieldInSight(sheet, () => scrollRef.current)
  /* A tap into an empty field on iOS: focused the way focusFirst does, so iOS does not scroll the page to it (calm-focus.ts). */
  const sheetScope = useCallback(() => sheetRef.current, [])
  useCalmFocus(sheet, sheetScope)
  /* The keyboard's room on iOS, for the sheet to make in the focus itself (visible-box.ts sheetKeyboardRoom). */
  const keyboardRoom = useCallback(() => sheetKeyboardRoom(sheetRef.current), [])
  /* Round 27 (I7): the toolbar goes down with the keys, never left up where they were (toolbar-follow.ts). */
  const toolbarOf = useCallback(() => toolbarRef.current, [])
  useToolbarFollowsKeys(sheet && sheetUp, toolbarOf, sheetScope)
  /* The sheet has landed: up, the caret goes in (on the frame after, so nothing is drawn under the keyboard's rise); down, shut() ends. */
  const onSheetMoved = useCallback(
    (up: boolean) => {
      if (up) {
        /* Its first arrival only: a pull let go short of closing lands up too, and must not bring the keyboard. */
        if (leaving.current || sheetInRef.current) return
        sheetInRef.current = true
        setSheetIn(true)
        requestAnimationFrame(focusFirst)
        return
      }
      const then = landedDown.current
      landedDown.current = null
      then?.()
    },
    [focusFirst],
  )

  /* Edit post: the change sent, the check shown, the editor folded, then the post as it now is handed back. */
  const save = async () => {
    if (!edit || busy || sent) return
    if (!ready) return nudgePost()
    if (!dirty) return shut()
    setBusy(true)
    const all = linkMedia ? [...media, linkMedia] : media
    const r = await api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts/${edit.post.id}`, {
      method: "PATCH",
      body: {
        title: title.trim(),
        body: body.trim(),
        media: all,
        ...(spaceId && spaceId !== (was?.space?.id ?? null) ? { spaceId } : {}),
        ...(poll ? { poll: pollPayload(poll) } : was?.poll ? { poll: null } : {}),
      },
    })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    const saved = r.data.post
    setSent(true)
    editDone.current = () => edit.onSaved(saved)
    window.setTimeout(shut, reducedMotion() ? 0 : SENT_HOLD_MS)
  }

  const submit = async () => {
    if (editing) return save()
    if (busy || sent) return
    /* Schedule, or a scheduled post or draft open here: the staff kit checks and sends it (its own words say what is missing). */
    if (kit.item || kit.when) {
      await kit.primary()
      return
    }
    if (!ready) return nudgePost()
    setBusy(true)
    /* The chime is made ready in the press (a browser starts sound only from one) and played once the post is up. */
    primeSounds()
    const all = linkMedia ? [...media, linkMedia] : media
    const r = await api<{ post: FeedPostView; held?: boolean; message?: string }>(`${apiBase(communityId)}/posts`, {
      body: {
        spaceId,
        title: title.trim(),
        body: body.trim(),
        media: all,
        poll: poll ? pollPayload({ ...poll, closesIn: poll.closesIn === "keep" ? "" : poll.closesIn }) : undefined,
      },
    })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    /*
      HELD FOR A MODERATOR (202, the community's safety checks: a new member's
      first links, a lookalike link, the same words again). The editor closes
      as usual but nothing goes into the feed as if it were published; a toast
      says what the server said, and what was written stays here as a draft
      ("Continue: ...") in case the member wants to change it.
    */
    if (r.data.held) {
      const said = r.data.message || HELD_POST
      try {
        window.localStorage.setItem(key, JSON.stringify({ title, body, spaceId, poll, media: linkMedia ? [...media, linkMedia] : media } satisfies Draft))
      } catch {
        /* nothing kept */
      }
      setSent(true)
      afterClose.current = () => {
        setSent(false)
        setRestored(true)
        setHeldCopy(true)
        toast(said)
      }
      window.setTimeout(shut, reducedMotion() ? 0 : SENT_HOLD_MS)
      return
    }
    setHeldCopy(false)
    const post = r.data.post
    postSound()
    /* Replies are what comes next: in the app, ask for notifications if they are off (lib/notifications/nudge). */
    nudgeNotifications("posted")
    /* Kept no longer: a reload from here on starts empty. */
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing kept */
    }
    setSent(true)
    afterClose.current = () => {
      clear()
      setSent(false)
      /* Into the feed with its finish; a list that does not show it (another order) says it in words instead, unless the feed already did ("Posted in ..."). Away from the feed, the words alone: the feed has it when the member goes there. */
      if (awayRef.current) {
        toast("Posted")
        onPosted(post)
        return
      }
      const land = () => {
        arrive([post.id], { mine: true, missing: () => !document.querySelector('.fixed[role="status"]') && toast("Posted") })
        onPosted(post)
      }
      /* Round 29: the page glides to where the post goes (the closed field, which the list starts under), then it lands there. */
      const spot = cardRef.current
      if (spot) glideIntoSight(spot, land)
      else land()
    }
    window.setTimeout(shut, reducedMotion() ? 0 : SENT_HOLD_MS)
  }

  const openEditor = () => {
    if (cardRef.current) closedH.current = cardRef.current.offsetHeight
    setOpen(true)
    /* In place, at once; a phone's screen takes it when it has arrived (THE FIELD TAKES THE CARET). */
    if (!phone) requestAnimationFrame(focusFirst)
  }

  /*
    CREATE POST, FROM ANYWHERE (round 15: the tab bar's Create post inside a community, lib/communities/client/compose-intent.ts).
    The composer on screen opens for it, in the space asked for when this member may post there. Edit post never answers, and a
    composer held to another space (a space's own page) leaves it to one that is not.
  */
  useComposeRequests((req) => {
    if (editing || leaving.current) return false
    /* A scheduled post or draft open here is not given up for a new post (round 26). */
    if (kit.item) return false
    const asked = req.spaceSlug ? spaces.find((s) => s.slug === req.spaceSlug) : undefined
    if (req.spaceSlug && fixedSpaceId && asked?.id !== fixedSpaceId) return false
    if (asked && !fixedSpaceId) setSpaceId(asked.id)
    if (open) {
      if (!phone) requestAnimationFrame(focusFirst)
      return true
    }
    if (!phone) cardRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" })
    openEditor()
    return true
  })

  /* What the staff kit asks of the composer (round 26). */
  staffHands.current = {
    openEditor: () => {
      if (open) {
        if (!phone) requestAnimationFrame(focusFirst)
        return
      }
      if (!phone) cardRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" })
      openEditor()
    },
    finish: (then) => {
      setSent(true)
      afterClose.current = () => {
        setSent(false)
        clear()
        then()
      }
      window.setTimeout(shut, reducedMotion() ? 0 : SENT_HOLD_MS)
    },
    nudge: (f) => {
      if (f === "title") {
        titleRef.current?.focus({ preventScroll: true })
        nudgeRing(titleRef.current)
      } else if (f === "body") textRef.current?.focus()
      else {
        setSpaceAsk(true)
        const btn = (sheetRef.current ?? cardRef.current)?.querySelector<HTMLButtonElement>("button[data-composer-space]") ?? null
        btn?.focus({ preventScroll: true })
        if (btn) window.setTimeout(() => openRef.current && spaceOpener.current?.(), 60)
      }
    },
  }

  const pickers = (
    <>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} data-composer-file-input="" />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/*,.mp4,.mov,.m4v,.webm" hidden onChange={(e) => (void addVideo(e.target.files?.[0]), (e.target.value = ""))} data-composer-video-input="" />
    </>
  )

  const answer = (leave: boolean) => {
    asking?.(leave)
    setAsking(null)
  }
  /*
    Over the phone's editor screen too (it sits at z 125), so not the member area's Modal (z 80).

    ROUND 31, THE OWNER: Leave looked "too light, washed", above all in the dark, where the near black button became a
    graphite step on the sheet's own charcoal. Keep writing is the calm default now (the focused one, the library's calm
    secondary: a lifted surface on a real hairline, LEAVE_STAY) and Leave says what it does in red without shouting: a
    faint red ground, a red hairline and red words (LEAVE_GO). Both carry their colours as variables, so the dark look
    gives them their own (scripts/gen-theme-dark.mjs) instead of a mapped grey.
  */
  const leaveSize = phone ? "h-12 w-full rounded-[12px] text-[15px]" : "h-9 rounded-[10px] px-4 text-[14px]"
  const leaveActions = (
    <div className={`flex gap-2 ${phone ? "mt-6 flex-col-reverse" : "mt-5 justify-end"}`} data-leave-dialog="">
      <button type="button" className={`${LEAVE_BTN} ${LEAVE_STAY} ${leaveSize}`} onClick={() => answer(false)} data-leave-stay="" autoFocus>
        Keep writing
      </button>
      {kit.draftOnLeave ? (
        /* The people who run it may keep it as a team draft instead (round 26): the question closes, the draft is saved, the editor closes on its check. */
        <button
          type="button"
          className={`${LEAVE_BTN} ${LEAVE_STAY} ${leaveSize}`}
          onClick={() => {
            answer(false)
            void kit.saveDraft()
          }}
          data-leave-draft=""
        >
          {tt("Save draft")}
        </button>
      ) : null}
      <button type="button" className={`${LEAVE_BTN} ${LEAVE_GO} ${leaveSize}`} onClick={() => answer(true)} data-leave-go="">
        Leave
      </button>
    </div>
  )
  /* Round 31: the phone's sheet is as tall as the question and its two answers, not a fixed 340px with an empty third under them. */
  const leaveDialog = phone ? (
    <BottomSheet isOpen={!!asking} onClose={() => answer(false)} label="Leave post" hideFrom={null} zIndex={150} maxHeight="min(60vh, 420px)">
      <div className="px-5 pb-4 pt-1" data-leave-sheet="">
        <p className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{LEAVE_QUESTION}</p>
        {leaveActions}
      </div>
    </BottomSheet>
  ) : (
    <DialogPrimitive.Root open={!!asking} onOpenChange={(o) => (!o ? answer(false) : undefined)}>
      <DialogPrimitive.Portal>
        {/*
          Round 31: it leaves the way it came (Radix keeps it on the page while the out animation runs), and the scrim is
          an rgba the dark look leaves as it is: as a hex class it was mapped to a graphite haze over the dark page.
        */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[150] bg-[rgba(15,17,21,0.4)] duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] w-[min(100vw-2rem,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-[0_20px_60px_-12px_rgba(17,24,39,0.35)] outline-none duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-150 data-[state=closed]:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{LEAVE_QUESTION}</DialogPrimitive.Title>
          {leaveActions}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )

  /*
    Open in place (a computer): the card's top row stays exactly as it is, the
    member's picture at the same place and size on every frame (round 12); only
    what is beside it changes, the field's words giving way to "<name> posting".
  */
  const inPlace = open && !phone
  const row = (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5" data-composer-row="">
      <span className="flex shrink-0" data-composer-avatar="">
        <MemberAvatar src={me.avatarUrl} name={me.name} alt="" size={40} />
      </span>
      <div className="grid min-w-0 flex-1">
        <button
          ref={fieldRef}
          type="button"
          tabIndex={inPlace ? -1 : undefined}
          aria-hidden={inPlace || undefined}
          onClick={openEditor}
          /*
            The posts under the field get their own layer as the finger or the pointer comes down, so the
            first frame of the editor's open does not also have to draw them into one (a computer's move).
          */
          onPointerDown={() => {
            if (phone || !cardRef.current) return
            const list = following(cardRef.current)
            for (const x of list) x.style.willChange = "translate"
            /* A press that did not end in a click lets them go again. */
            window.setTimeout(() => {
              if (!openRef.current) for (const x of list) x.style.willChange = ""
            }, 1500)
          }}
          className={`col-start-1 row-start-1 flex h-11 min-w-0 items-center rounded-xl border border-[#eceef1] bg-[#f6f7f8] px-4 text-left text-[15px] text-[#8a8f98] transition-colors hover:bg-[#f1f2f4] ${inPlace ? "pointer-events-none opacity-0" : ""}`}
          data-composer-open={inPlace ? undefined : ""}
        >
          <span className="truncate">{restored && title ? `Continue: ${title}` : "Share something..."}</span>
        </button>
        {inPlace ? (
          <div ref={nameRef} className="col-start-1 row-start-1 flex min-w-0 items-center text-[14.5px] text-[#6b7280]" data-composer-name="">
            <span className="truncate">
              <span className="font-semibold text-[#1a1a2e]">{me.name}</span> posting{space ? ` in ${space.name}` : ""}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )

  const spacePicker =
    !fixedSpaceId && spaces.length > 1 ? (
      <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-y-1.5">
      <ResponsiveActionMenu
        title="Post in"
        align="start"
        opener={spaceOpener}
        items={spaces.map((s) => ({
          label: s.name,
          icon: (
            <span aria-hidden className="inline-flex w-4 justify-center text-[14px] leading-none" data-space-glyph="">
              {spaceGlyph(s.icon, s.kind)}
            </span>
          ),
          onClick: () => setSpaceId(s.id),
        }))}
        trigger={
          <button
            type="button"
            className={`inline-flex h-10 max-w-[200px] shrink-0 items-center gap-1 rounded-[10px] ${DEPTH} ${DEPTH_PRESS} px-3 text-[14px] font-medium outline-none transition-colors hover:bg-[#f6f7f8] focus-visible:ring-2 sm:h-9 ${space ? "text-[#1a1a2e]" : "text-[#6b7280]"} ${spaceAsk ? "ring-2 ring-[#d97706]/35" : "focus-visible:ring-[#1a1a2e]/15"}`}
            data-composer-space={space ? space.id : ""}
            data-composer-space-ask={spaceAsk ? "" : undefined}
            aria-describedby={spaceAsk ? hintId : undefined}
          >
            {space ? (
              <span aria-hidden className="shrink-0 text-[13px] leading-none" data-space-glyph="">
                {spaceGlyph(space.icon, space.kind)}
              </span>
            ) : null}
            <span className="truncate">{space ? space.name : "Select a space"}</span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        }
      />
      {/* Always there, so a screen reader hears the line when it is written into it. Beside the picker when there is room, under it on a narrow phone (never cut short). */}
      <span aria-live="polite" className="min-w-0 max-w-full">
        {spaceAsk ? (
          <span ref={hintIn} id={hintId} className="ml-2 block truncate text-[13px] font-medium text-[#b45309]" data-composer-space-hint="">
            {tt("Choose a space first")}
          </span>
        ) : null}
      </span>
      </span>
    ) : space ? (
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate px-2 text-[14px] font-medium text-[#4b5563]" data-composer-space={space.id}>
        <span aria-hidden className="shrink-0 text-[13px] leading-none" data-space-glyph="">
          {spaceGlyph(space.icon, space.kind)}
        </span>
        <span className="truncate">{space.name}</span>
      </span>
    ) : null

  const tools = (
    <div className="flex min-w-0 items-center gap-0.5" data-composer-tools="">
      <button type="button" aria-label="Attach files" title="Attach files" className={TOOL} onClick={() => fileInput.current?.click()} data-composer-tool="file">
        <Paperclip className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Add a link" title="Add a link" aria-pressed={linkField === "link"} className={TOOL} onClick={() => setLinkField((f) => (f === "link" ? null : "link"))} data-composer-tool="link">
        <Link2 className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Add a video"
        title="Add a video"
        aria-pressed={linkField === "video"}
        className={TOOL}
        data-composer-tool="video"
        onClick={() => {
          if (linkField === "video") {
            setLinkField(null)
            return
          }
          setLinkField("video")
          videoInput.current?.click()
        }}
      >
        <Clapperboard className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Add a poll" title="Add a poll" aria-pressed={!!poll} className={TOOL} onClick={() => setPoll((p) => (p ? null : { question: "", options: ["", ""], multiple: false, closesIn: "" }))} data-composer-tool="poll">
        <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <span data-composer-tool="emoji" className="contents">
        <EmojiControl className={TOOL} size={EMOJI_POPOVER} onBeforeOpen={() => undefined} onInsert={insertEmoji} />
      </span>
      <GifButton communityId={communityId} className={TOOL} onPick={addGif} />
      {kit.tool(TOOL)}
    </div>
  )

  const fields = (
    <>
      {kit.itemLine}
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => (lastField.current = "title")}
        maxLength={TITLE_MAX}
        placeholder="Title"
        aria-label="Title"
        aria-required="true"
        className={TITLE_FIELD}
        data-composer-title=""
      />
      <MentionTextarea
        ref={textRef}
        communityId={communityId}
        value={body}
        onChange={setBody}
        onFocus={() => (lastField.current = "body")}
        placeholder="Write something..."
        ariaLabel="Post"
        caretAtEnd={editing}
        minRows={sheet ? 6 : 4}
        maxLength={20000}
        className={WORDS_FIELD}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />
      {restored ? (
        <p className="mt-1 text-[12.5px] text-[#8a8f98]" data-composer-restored={heldCopy ? "held" : ""}>
          {heldCopy ? "Your post is waiting for a moderator. This is a copy, in case you want to change it." : "Your draft is back where you left it."}
        </p>
      ) : null}

      {linkField ? (
        /* The file picker opens inside the Upload press: a browser only opens one from a press it is still handling. */
        <LinkField
          key={linkField}
          mode={linkField}
          communityId={communityId}
          className="mt-3"
          onAdd={addPick}
          onUpload={linkField === "video" ? () => videoInput.current?.click() : undefined}
          onClose={() => setLinkField(null)}
        />
      ) : null}

      {/*
        THE ATTACHMENT TRAY SLOT (round 13: worker V's components/community/member/attachment-tray.tsx takes this block:
        reorder by drag, remove, add more). `items`, `removeItem` and `setItems` are what it needs; Edit post fills `items`
        from the post's media, so the tray works the same there.
      */}
      {items.length ? (
        <AttachmentTray className="mt-3" items={items} onMove={(k, to) => setItems((list) => moveKey(list, k, to))} onRemove={removeItem} onAdd={items.length < MAX_MEDIA_PER_POST ? () => fileInput.current?.click() : undefined} />
      ) : null}

      {linkMedia && preview ? (
        <div className="mt-3">
          <LinkCard url={preview.url} title={preview.title} image={preview.image} onRemove={() => setDismissed((d) => [...d, preview.url])} />
        </div>
      ) : null}

      {poll ? <PollEditor poll={poll} onChange={setPoll} onRemove={() => setPoll(null)} /> : null}
      {kit.panel}
    </>
  )

  const actionLabel = editing ? "Save" : "Post"
  /* Schedule, Save or Post now for the staff kit (round 26); the composer's own words otherwise. */
  const said = kit.label ?? undefined
  const editorBlock = (
    <div ref={editorRef} className={editing ? "pt-3" : "px-4 pb-4 pt-0.5 sm:px-5"} data-composer-editor="">
      {editing ? (
        /* In place, a quiet word that the post is being edited (the fields look like the post itself). */
        <p className="mb-2 text-[12.5px] font-medium text-[#6b7280]" data-composer-editing="">
          Editing your post
        </p>
      ) : null}
      {fields}
      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-[#f0f1f3] pt-2.5">
        {tools}
        {spacePicker}
        <div className="ml-auto flex items-center gap-1.5">
          {kit.draftButton(CANCEL_BTN)}
          <button type="button" className={CANCEL_BTN} onClick={() => void cancel()} disabled={busy || sent} data-composer-cancel="">
            Cancel
          </button>
          <PostButton busy={busy} sent={sent} ready={ready} onClick={submit} label={actionLabel} said={said} why={why} />
        </div>
      </div>
    </div>
  )

  /* One tree for every state, so nothing in it is ever taken out and put back by a change of state (ONE CARD, NEVER GONE). */
  return (
    <>
      {pickers}
      {editing ? (
        /* Edit post: inside the post's own card on a computer (no card of its own); on a phone only the screen below. */
        !phone ? (
          <div ref={cardRef} data-composer="edit" data-no-open="">
            {inPlace ? editorBlock : null}
          </div>
        ) : null
      ) : away && phone ? null : (
        <div ref={cardRef} className={`${CARD} ${PHONE_ROW} relative sm:shadow-[0_1px_2px_rgba(16,24,40,0.04)]`}
          data-composer={inPlace ? "open" : "closed"}
          /*
            ROUND 26: ESCAPE IS CANCEL IN PLACE TOO (it was only for Edit post): with something written it asks first, and the
            caret goes back to the field. A picker, a mention list or the link field open inside takes its own Escape first.
          */
          onKeyDown={(e) => {
            if (e.key !== "Escape" || !inPlace || e.defaultPrevented || busy || sent) return
            if (document.querySelector("[data-lightbox], [role=alertdialog], [data-state=open][role=dialog], [data-state=open][role=menu]")) return
            e.preventDefault()
            void cancel()
          }}
        >
          {row}
          {inPlace ? editorBlock : null}
        </div>
      )}
      {sheet ? (
        /* The website builder's sheet (round 17): its rise and close, its drag, its light dim; over an opened post for Edit post. */
        <MobileEditorSheet
          open={sheetUp}
          onOpenChange={(next) => {
            if (!next) void cancel()
          }}
          peekHeight={0}
          detents={[0.94]}
          /* Cancel puts it away evenly on the app's close curve, not dropping away; a slow pull closes it a third of the way down. */
          closeMs={420}
          closeEase={SHEET_CLOSE_EASE}
          closeAt={0.3}
          openFull
          layer="raised"
          zIndex={editing ? 135 : 125}
          holdPage="scroll"
          keyboard="sheet"
          keyboardRoom={keyboardRoom}
          primed
          onMoved={onSheetMoved}
          label={editing ? "Edit post" : "New post"}
          className="bg-white [--wb-sheet-skirt:#fff]"
        >
          <div
            ref={sheetRef}
            aria-label={editing ? "Edit post" : "New post"}
            data-composer="sheet"
            data-composer-edit={editing ? "" : undefined}
            data-composer-sheet-in={sheetIn ? "true" : "false"}
            /* The sheet puts its own fields on the keyboard (and keeps them in sight): KeyboardGuard leaves them alone. */
            data-keyboard-own=""
            className="flex min-h-0 flex-1 flex-col bg-white"
          >
            <div className="shrink-0 border-b border-[#f0f1f3]">
              <div className="flex h-12 items-center gap-2 pl-1.5 pr-3">
                {/* The field keeps the caret through the press (no blur), so the keyboard goes down with the sheet. */}
                <button type="button" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => void cancel()} className={`${CANCEL_BTN} px-2.5 text-[15px]`} disabled={sent} data-composer-cancel="">
                  Cancel
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{kit.sheetTitle ?? (editing ? "Edit post" : "New post")}</span>
                {/* Round 29: Post keeps the caret through the press too, so the keyboard goes down with the sheet, in one move. */}
                <PostButton busy={busy} sent={sent} ready={ready} onClick={submit} className="px-4" label={actionLabel} said={said} keepCaret why={why} />
              </div>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3" data-composer-scroll="" data-composer-filled={filled ? "" : undefined}>
              {filled ? (
                <>
                  <div className="mb-3 flex min-w-0 items-center gap-2">
                    <MemberAvatar src={me.avatarUrl} name={me.name} alt="" size={32} />
                    <span className="shrink-0 text-[14px] text-[#6b7280]">Posting in</span>
                    <span className="flex min-w-0">{spacePicker}</span>
                  </div>
                  {fields}
                  {/* Save draft for the people who run it (round 26): under the fields, the toolbar has no room for it beside the tools. */}
                  {kit.on ? <div className="mt-3 flex">{kit.draftButton(`${CANCEL_BTN} -ml-2.5 px-2.5 text-[15px]`)}</div> : null}
                </>
              ) : null}
            </div>
            {/* On the keyboard when it is up: the sheet pads its content by the keyboard's room. */}
            <div ref={toolbarRef} className="relative z-[1] shrink-0 border-t border-[#f0f1f3] bg-white px-2 pb-1.5 pt-1.5" data-composer-toolbar="">
              {filled ? tools : <div className="h-10" aria-hidden />}
            </div>
          </div>
        </MobileEditorSheet>
      ) : null}
      {leaveDialog}
    </>
  )
}

/**
 * Post, then a turning ring while the server is asked, then a check once it
 * has the post: three faces in one cell, so the button keeps the width
 * "Post" gives it and the faces crossfade rather than the words changing
 * length. Round 29: a calm ring of its own (a faint track, one short arc
 * turning on the compositor), the faces trade opacity only, and the button
 * is never `disabled` (it says so to assistive tech with aria-disabled and
 * ignores a press), so nothing dims or jumps while it waits.
 */
function PostButton({ busy, sent, ready, onClick, className = "", label: given = "Post", said: words, keepCaret = false, why }: { busy: boolean; sent: boolean; ready: boolean; onClick: () => void; className?: string; label?: "Post" | "Save"; /** Other words (the staff kit's Schedule, Save, Post now): its idle, pending and done faces. */ said?: { idle: string; busy: string; sent: string }; keepCaret?: boolean; why?: string }) {
  const face = (on: boolean) => `col-start-1 row-start-1 flex items-center justify-center transition-opacity duration-200 ease-out motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`
  const state = sent ? "sent" : busy ? "busy" : "idle"
  const label = words?.idle ?? given
  const said = words ? { sent: words.sent, busy: words.busy } : given === "Save" ? { sent: "Saved", busy: "Saving" } : { sent: "Posted", busy: "Posting" }
  const keep = keepCaret ? { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() } : {}
  return (
    <button
      type="button"
      className={`${POST_BTN} ${className} ${state !== "idle" ? "cursor-default active:opacity-100" : !ready ? "opacity-90" : ""}`}
      {...keep}
      onClick={() => {
        if (state === "idle") onClick()
      }}
      aria-disabled={state !== "idle" || undefined}
      aria-label={sent ? said.sent : busy ? said.busy : !ready ? `${label}: ${why ?? "add what's missing"}` : undefined}
      data-composer-post=""
      data-post-state={state}
      data-post-ready={ready ? "true" : "false"}
    >
      <span className="grid">
        <span className={face(state === "idle")}>{label}</span>
        <span className={face(state === "busy")} aria-hidden data-post-ring="">
          <span className="relative block h-4 w-4">
            <span className="absolute inset-0 rounded-full border-2 border-current opacity-25" />
            <span className={`absolute inset-0 rounded-full border-2 border-transparent border-t-current [animation-duration:800ms] motion-reduce:animate-none ${state === "busy" ? "animate-spin" : ""}`} />
          </span>
        </span>
        <span className={face(state === "sent")} aria-hidden>
          <Check className="h-[17px] w-[17px]" strokeWidth={2.5} />
        </span>
      </span>
    </button>
  )
}

/**
 * THE NO SPACE CUE (round 30). One soft shake of the space picker, side to side and settling, on translate only: about
 * a third of a second, never more than 4px, so it reads as "here" and not as an error.
 */
const SPACE_SHAKE_MS = 340
const SPACE_SHAKE: Keyframe[] = [
  { translate: "0 0" },
  { translate: "-4px 0", offset: 0.18 },
  { translate: "3.5px 0", offset: 0.4 },
  { translate: "-2px 0", offset: 0.62 },
  { translate: "1px 0", offset: 0.8 },
  { translate: "0 0" },
]
/** The line beside the picker fades in as it is written (opacity and a 3px slide; opacity only for reduced motion). */
function hintIn(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: "-3px 0" }, { opacity: 1, translate: "0 0" }], { duration: 200, easing: "ease-out" })
}

/** The poll's fields: the Storelib field with its hairline and 1px shadow. */
const POLL_FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e9] bg-white px-3 text-[16px] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.05)] motion-reduce:transition-none sm:h-10 sm:text-[14px]"

const POLL_ENDS: { value: PollDraft["closesIn"]; label: string }[] = [
  { value: "", label: "No end" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "1 week" },
]

let choiceSeq = 0
const newChoiceId = () => `choice-${++choiceSeq}`

/**
 * ===========================================================================
 *  THE POLL, AS IT IS WRITTEN (round 12)
 * ===========================================================================
 * A card inside the editor with the light depth: the question, the choices
 * (two to ten), each with a handle to drag it up or down (or the arrow keys
 * on the handle) and an x to take it off, "Add a choice", then how long it
 * runs (No end, 1 day, 3 days, 1 week) and whether a member may pick more
 * than one. A choice dragged follows the finger on the compositor, the one
 * it passes slides into the place it left.
 */
function PollEditor({ poll, onChange, onRemove }: { poll: PollDraft; onChange: (p: PollDraft) => void; onRemove: () => void }) {
  const set = (patch: Partial<PollDraft>) => onChange({ ...poll, ...patch })
  /* Edit post, after votes: the question and the choices are what people voted on (feed.ts POLL_VOTED); only the end changes. */
  const voted = (poll.votes ?? 0) > 0
  const ends: { value: PollDraft["closesIn"]; label: string }[] = poll.keepAt ? [{ value: "keep", label: `Ends ${new Date(poll.keepAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` }, ...POLL_ENDS] : POLL_ENDS
  /* A key per choice that moves with it, so a dragged field keeps its caret and its place in React. */
  const ids = useRef<string[]>([])
  while (ids.current.length < poll.options.length) ids.current.push(newChoiceId())
  if (ids.current.length > poll.options.length) ids.current.length = poll.options.length
  const listRef = useRef<HTMLOListElement>(null)
  const latest = useRef(poll)
  latest.current = poll

  const move = (from: number, to: number) => {
    const opts = [...latest.current.options]
    const [o] = opts.splice(from, 1)
    opts.splice(to, 0, o)
    const keys = [...ids.current]
    const [k] = keys.splice(from, 1)
    keys.splice(to, 0, k)
    ids.current = keys
    const next = { ...latest.current, options: opts }
    latest.current = next
    flushSync(() => onChange(next))
  }
  const rowOf = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-choice="${id}"]`) ?? null
  /* The choice that gave way slides from where it was to its new place. */
  const slide = (id: string, from: number) => {
    const el = rowOf(id)
    if (!el || typeof el.animate !== "function" || reducedMotion()) return
    el.animate([{ translate: `0 ${from}px` }, { translate: "0 0" }], { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" })
  }

  const drag = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const id = ids.current[index]
    const row = rowOf(id)
    if (!row) return
    const step = row.offsetHeight + 6
    const y0 = e.clientY
    let at = index
    /*
      Heard on the window, not the handle: moving the row in the list takes its node out and puts it back,
      which ends a pointer capture, so the move would stop at the first choice it passed.
    */
    const id0 = e.pointerId
    row.style.zIndex = "1"
    row.style.willChange = "translate"
    row.dataset.dragging = ""
    const onMove = (m: PointerEvent) => {
      if (m.pointerId !== id0) return
      m.preventDefault()
      const dy = m.clientY - y0
      const want = Math.max(0, Math.min(latest.current.options.length - 1, index + Math.round(dy / step)))
      if (want !== at) {
        const passed = ids.current[want]
        move(at, want)
        slide(passed, (want - at) * step)
        at = want
      }
      row.style.translate = `0 ${dy - (at - index) * step}px`
    }
    const onUp = (u: PointerEvent) => {
      if (u.pointerId !== id0) return
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      const left = row.style.translate
      row.style.translate = ""
      row.style.zIndex = ""
      delete row.dataset.dragging
      if (left && !reducedMotion() && typeof row.animate === "function") row.animate([{ translate: left }, { translate: "0 0" }], { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" }).onfinish = () => (row.style.willChange = "")
      else row.style.willChange = ""
    }
    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const keyMove = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : -1
    if (to < 0 || to >= poll.options.length) return
    e.preventDefault()
    const id = ids.current[index]
    move(index, to)
    rowOf(id)?.querySelector<HTMLButtonElement>("[data-choice-handle]")?.focus()
  }

  return (
    <div className="mt-3 rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]" data-composer-poll-editor="">
      <div className="flex items-center justify-between border-b border-[#f0f1f3] py-1 pl-3.5 pr-1">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[#1a1a2e]">
          <BarChart3 className="h-4 w-4 text-[#6b7280]" strokeWidth={2} aria-hidden />
          Poll
        </span>
        <button type="button" onClick={onRemove} aria-label="Remove poll" className={ICON_BTN} data-poll-remove="">
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="p-3 sm:p-3.5">
        {voted ? (
          <p className="mb-2 text-[12.5px] leading-relaxed text-[#6b7280]" data-poll-voted="">
            {poll.votes === 1 ? "1 person has" : `${poll.votes} people have`} voted, so the question and the choices stay as they are.
          </p>
        ) : null}
        <input value={poll.question} onChange={(e) => set({ question: e.target.value })} maxLength={200} placeholder="Ask a question" aria-label="Poll question" className={`${POLL_FIELD} font-medium disabled:bg-[#f8f9fa] disabled:text-[#4b5563]`} disabled={voted} data-poll-question="" />
        <ol ref={listRef} className="mt-2.5 space-y-1.5" aria-label="Choices">
          {poll.options.map((o, i) => (
            <li key={ids.current[i]} className="relative flex items-center gap-1 rounded-[10px] bg-white data-[dragging]:shadow-[0_8px_20px_-8px_rgba(17,24,39,0.25)]" data-choice={ids.current[i]}>
              <button
                type="button"
                aria-label={`Move choice ${i + 1}`}
                title="Drag to reorder"
                onPointerDown={(e) => drag(e, i)}
                onKeyDown={(e) => keyMove(e, i)}
                className="flex h-10 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-[8px] text-[#a3a8b0] outline-none transition-colors hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:cursor-grabbing disabled:opacity-30"
                disabled={poll.options.length < 2 || voted}
                data-choice-handle=""
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </button>
              <input
                value={o}
                onChange={(e) => set({ options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })}
                maxLength={100}
                placeholder={`Choice ${i + 1}`}
                aria-label={`Choice ${i + 1}`}
                className={`${POLL_FIELD} disabled:bg-[#f8f9fa] disabled:text-[#4b5563]`}
                disabled={voted}
                data-poll-choice={i}
              />
              {poll.options.length > 2 && !voted ? (
                <button
                  type="button"
                  onClick={() => {
                    ids.current.splice(i, 1)
                    set({ options: poll.options.filter((_, j) => j !== i) })
                  }}
                  aria-label={`Remove choice ${i + 1}`}
                  className={ICON_BTN}
                  data-poll-choice-remove={i}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="w-10 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ol>
        {poll.options.length < POLL_OPTIONS_MAX && !voted ? (
          <button type="button" onClick={() => set({ options: [...poll.options, ""] })} className={`${BTN_GHOST} mt-1.5 pl-2 text-[13.5px]`} data-poll-add="">
            <Plus className="h-4 w-4" aria-hidden />
            Add a choice
          </button>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#f0f1f3] pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#6b7280]">Ends</span>
            <div role="radiogroup" aria-label="Poll ends" className="flex items-center gap-1 rounded-full bg-[#f1f2f4] p-0.5">
              {ends.map((d) => (
                <button
                  key={d.value || "never"}
                  type="button"
                  role="radio"
                  aria-checked={poll.closesIn === d.value}
                  onClick={() => set({ closesIn: d.value })}
                  className={`h-10 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none sm:h-8 ${poll.closesIn === d.value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "text-[#6b7280] hover:text-[#1a1a2e]"}`}
                  data-poll-ends={d.value || "never"}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={poll.multiple} onClick={() => set({ multiple: !poll.multiple })} disabled={voted} className="flex min-h-10 items-center gap-2.5 text-[13.5px] text-[#4b5563] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:opacity-50" data-poll-multiple={poll.multiple ? "on" : "off"}>
            More than one answer
            <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${poll.multiple ? "bg-[#1a1a2e]" : "bg-[#d9dce1]"}`} aria-hidden>
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)] transition-[translate] duration-200 ease-out motion-reduce:transition-none ${poll.multiple ? "translate-x-4" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
