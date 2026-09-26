"use client"

/**
 * ===========================================================================
 *  THE AI PANEL IN THE THEME EDITOR
 * ===========================================================================
 * It edits the SAME sections the panels on the left edit. Not a copy, not a
 * parallel document: the operations that come back are applied to the state
 * the colour pickers and the drag handles are already writing to.
 *
 * That is what makes the three things below true at once, and none of them
 * would be if the AI wrote to the database behind the editor's back:
 *
 *   - the preview moves WHILE the model is working, because each operation is
 *     applied the moment it arrives rather than at the end;
 *   - Undo takes back the whole AI edit, because one snapshot is pushed before
 *     the first operation and the operations are ordinary state changes after
 *     that;
 *   - Save is unchanged. It writes what is on screen, and it has no idea an AI
 *     was involved.
 *
 * The applier is shared with the server: see lib/website-builder/agent/
 * operations.ts for why there is exactly one of it.
 */

/*
  ═══════════════════════════════════════════════════════════════════════════
   TWO SHAPES, ONE CONVERSATION
  ═══════════════════════════════════════════════════════════════════════════
  `variant="dock"` on a computer: a frosted pill at the bottom centre of the
  canvas. Focusing it opens the conversation above it, the pill becoming its
  input row; Escape or a click outside puts it back to the pill with the
  conversation and any running change kept. It can be maximized, and closed,
  which hides the pill until the Ask AI button in the bar brings it back.

  `variant="sheet"` on a phone: the same header, thread and composer inside
  the editor's bottom sheet, which is what a phone does with a panel.

  Both have the same header: the history (a sub page that slides in), Connect
  AI, a new chat and close; the computer's has maximize too (a phone's sheet
  is resized by its handle). Everything that talks to the server is shared
  and written once, below; only the layout differs.

  SOLID WHITE, NOT GLASS. The pill is white at 95% with a light blur behind
  it, so it reads the same over a dark page and a white one, with a hairline
  and soft shadows of the page's own ink. There is no blurred band round it:
  Safari draws a backdrop blur but not the mask that feathers it, which left
  a hard edged strip over the page. The open conversation is plain white
  with no backdrop filter at all, so opening it moves one flat layer.

  THE BLUR STAYS ON WHILE IT FADES. A backdrop filter stops at an ancestor
  whose opacity is below 1 (the Backdrop Root), so the pill's glass face
  carries its own opacity and the pill is moved by a transform on the
  element around it. The conversation has no glass inside it, so it moves
  and fades as one element: one compositor layer, transform and opacity.
*/

import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  History,
  ImageOff,
  ImagePlus,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  Paperclip,
  RotateCcw,
  Square,
  SquarePen,
  TriangleAlert,
  X,
} from "lucide-react"

import { ImageViewer, type ViewableImage } from "@/components/website-builder/image-viewer"
import { StorelibMark } from "@/components/storelib-mark"
import {
  ActivityLine,
  AnswerMeta,
  CodePreview,
  ReportForm,
  StepsList,
  stepsLabel,
  type ReportState,
} from "@/components/website-builder/ask-activity"
import { AskHistory, type DeletedTarget, type HistoryTarget } from "@/components/website-builder/ask-history"
import { ModelPicker } from "@/components/website-builder/ask-model-picker"
import { ownFor, useOwnAi } from "@/components/website-builder/use-own-ai"
import { FadeImage, PictureTray, ProgressRing, type ComposerPicture } from "@/components/website-builder/ask-attachments"
import { ConnectAiButton, ModeSwitch, QuestionChoices, ScopeChip, SuggestionChips, type AskMode } from "@/components/website-builder/ask-parts"
import { PrepareError, preparePicture, prepareStills } from "@/components/website-builder/ask-attach-prepare"
import { useVoiceInput } from "@/components/website-builder/ask-voice"
import type { WriteStage } from "@/lib/website-builder/agent/write-section"
import { cn } from "@/lib/utils"
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
  type AllowedImageType,
} from "@/lib/sites/agent/attachments"
import {
  EMPTY_ACTIVITY,
  activityLine,
  changeSummary,
  detailToShow,
  finishedSteps,
  READING_MS,
  reduceActivity,
  settleActivity,
  type Activity,
} from "@/lib/website-builder/ask-activity"
import { attachProblem, kindOf, stillsRoom } from "@/lib/website-builder/ask-attach"
import { reportAnswer, streamPost } from "@/lib/website-builder/ask-client"
import { promptForPictures, restoreExchanges, type StoredMessage } from "@/lib/website-builder/ask-restore"
import { armAskSounds, playAskSound, setSoundsOn, soundsOn } from "@/lib/website-builder/ask-sounds"
import { suggestionsFor } from "@/lib/website-builder/ask-suggestions"
import { typeToward, withSpoken } from "@/lib/website-builder/ask-typing"
import type { ThemeOp } from "@/lib/website-builder/agent/operations"
import { CLOSE_EASE, CLOSE_MS, DOCK_PAD, EASE, OPEN_MS, SLIDE_MS, dockGeometry } from "@/lib/website-builder/ask-dock"
import type { SectionInstance } from "@/lib/website-builder/types"

/** A picture in the thread: the composer's, once sent, or a stored one read back. */
type Attachment = ComposerPicture

/** One line of the agent's stream, as the chat reads it. Anything else it carries is kept for ask-activity. */
type RunLine = Record<string, unknown> & { type?: string; op?: ThemeOp; id?: unknown; title?: unknown }

interface Exchange {
  id: string
  prompt: string
  reply?: string
  error?: string
  running: boolean
  /**
   * What the run is doing and did: its steps, commentary, the changes that
   * landed and the files it wrote, read from the stream by
   * lib/website-builder/ask-activity.ts.
   */
  activity: Activity
  /** When it started, by performance.now, for the line before anything is said. */
  startedAt?: number
  /**
   * What they attached, kept for the thread only. The bytes go to the model
   * once; the server keeps a copy for thirty days so the thread can show it
   * again after a reload.
   */
  images?: Attachment[]
  /**
   * Pictures this question was sent with that did not come back when it was
   * read again: past their thirty days, or never kept. Each is drawn as a
   * "Picture no longer available" tile where the picture was.
   */
  missingImages?: number
  /**
   * This question, or its pictures, could not be kept for a reason other
   * than the database update not being run (that one is said once, above
   * the thread): said under it, so a reload does not surprise anybody.
   */
  notKept?: "chat" | "pictures"
  /**
   * The request, pictures and all, has reached the server. Until then the
   * thumbnails say they are being sent, with a ring for how much of it has.
   */
  sent?: boolean
  /** 0 to 1: how much of a request with pictures has gone up. */
  upload?: number
  /** The question as the server kept it, which Report names. */
  messageId?: string | null
  /** The model that answered, for a report. */
  engine?: string
  /** The page the run started on: Undo is only offered while it is still the page on screen. */
  page?: string
  /** The editor's snapshot for this run, which Undo restores. */
  runId?: string
  undone?: boolean
}

/**
 * The three choices, as a person would describe them rather than as model ids.
 *
 * `provider` and `tier` are what the endpoint takes: the vendor, and how hard
 * a model within it. Keeping the ids out of the UI means a price change or a
 * model rename is a one line change on the server and nothing here.
 */
const ENGINES = [
  {
    id: "claude",
    label: "Claude Sonnet",
    short: "Sonnet",
    detail: "Quick, and right for most changes",
    provider: "anthropic",
    tier: "fast",
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    short: "Opus",
    detail: "Slower. For a change you know is hard",
    provider: "anthropic",
    tier: "strong",
  },
  {
    id: "openai",
    label: "ChatGPT",
    short: "ChatGPT",
    detail: "OpenAI's model",
    provider: "openai",
    tier: "fast",
  },
] as const

type EngineId = (typeof ENGINES)[number]["id"]

const ENGINE_KEY = "storelib.theme-chat.engine"

/**
 * How near the end of the thread still counts as reading the newest message.
 * About three lines: a reader resting a thumb a line short of the end is
 * still following the run, and one who has scrolled up a screen is not.
 */
const PIN_SLACK_PX = 64
/** Long enough for a smooth scroll to the end to finish. */
const AUTO_SCROLL_MS = 700
/**
 * How long the phone's composer takes to ride up onto a keyboard or back
 * down: iOS animates its keyboard in about a quarter of a second, and the
 * composer keeps time with it rather than arriving first and waiting.
 */
const KEYBOARD_RIDE_MS = 250
/** A finger that moved further than this on the box was scrolling, not tapping it. */
const TAP_SLOP_PX = 10

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    let query: MediaQueryList
    try {
      query = window.matchMedia("(prefers-reduced-motion: reduce)")
    } catch {
      return
    }
    const read = () => setReduced(query.matches)
    read()
    query.addEventListener?.("change", read)
    return () => query.removeEventListener?.("change", read)
  }, [])
  return reduced
}

/** "0:07", for the recording clock. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * The writer's answer, read as it arrives. The route sends a line per stage
 * and then the result when asked for NDJSON; an older deployment, or a
 * proxy that buffered it, answers with plain JSON, which is read the same.
 */
async function readWriteAnswer(
  res: Response,
  onStage: (stage: WriteStage) => void,
): Promise<{
  status: number
  path?: string
  type?: string
  name?: string
  error?: string
  reply?: string
  errors?: { line?: number; message: string }[]
}> {
  const kind = res.headers.get("content-type") ?? ""
  if (!kind.includes("application/x-ndjson") || !res.body) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, ...json }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: { status?: number; answer?: Record<string, unknown> } | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    let at = buffer.indexOf("\n")
    while (at >= 0) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      at = buffer.indexOf("\n")
      if (!line) continue
      try {
        const event = JSON.parse(line) as { type?: string; stage?: WriteStage; status?: number; answer?: Record<string, unknown> }
        if (event.type === "stage" && event.stage) onStage(event.stage)
        else if (event.type === "result") result = event
      } catch {
        /* a partial line; the next read completes it */
      }
    }
    if (done) break
  }
  if (!result) return { status: 502, error: "The answer was cut off." }
  return { ...(result.answer ?? {}), status: typeof result.status === "number" ? result.status : 500 }
}

/**
 * What went wrong, in words a creator can act on. The compiler's report and
 * the model's plumbing are not that: they say "try again" or "say more",
 * which is the only thing anybody in this panel can actually do about them.
 * A plain sentence from the route (describe the section, the theme is full)
 * is already written for a person, and is passed through.
 */
function plainWriteError(status: number, error: string | undefined, compileErrors: boolean): string {
  const raw = error ?? ""
  if (compileErrors || /did not compile|would not be correct|too long to finish|could not produce|sent nothing|cut off/i.test(raw)) {
    return "I could not get that section right this time. Try again, or describe it in a few more words."
  }
  if (/declined/i.test(raw)) return "That is not something I can write. Try describing a different section."
  if (status === 401) return "Your session ended. Sign in again to use Storelib AI."
  if (status === 429 || status >= 500 || /reach|fetch|network|timeout|overload|rate limit/i.test(raw)) {
    return "Storelib AI is busy right now. Try again in a moment."
  }
  return raw || "That did not work. Try again."
}

/** The section writer's stages, as the live line says them. */
const WRITE_LINES: Record<"starting" | WriteStage, string> = {
  starting: "Reading what you asked for",
  thinking: "Writing the section",
  checking: "Checking it compiles",
  fixing: "Fixing a detail",
}

/** What the words of a report problem are. */
function reportProblem(problem: "not_set_up" | "not_found" | "busy" | "failed"): string {
  if (problem === "not_set_up") return "Reports turn on once the database update is run."
  if (problem === "busy") return "That is a lot of reports at once. Try again in a minute."
  if (problem === "not_found") return "This answer is no longer in your history."
  return "The report did not send. Try again."
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   ONE EXCHANGE IN THE THREAD
  ═══════════════════════════════════════════════════════════════════════════
  Memoised on its own props: typing re-renders the panel on every key (and
  a voice recording types a few characters a frame), and a thread of fifty
  answers should not be redrawn for any of it. Everything handed in is
  either the exchange itself, a string, or a callback that never changes.
*/
const ExchangeItem = React.memo(function ExchangeItem({
  exchange,
  answer,
  phone,
  canUndo,
  canRetry,
  onRetry,
  onUndo,
  onView,
  onOpenCode,
  onReport,
  onAnswer,
}: {
  exchange: Exchange
  /** The message after this one, which is the answer when this run asked a question. */
  answer?: string
  phone: boolean
  canUndo: boolean
  canRetry: boolean
  onRetry: (exchange: Exchange) => void
  onUndo: (exchange: Exchange) => void
  onView: (images: ViewableImage[], at: number) => void
  onOpenCode?: (path: string) => void
  onReport: (exchange: Exchange, reason: string) => Promise<ReportState>
  onAnswer: (text: string) => void
}) {
  const [stepsOpen, setStepsOpen] = React.useState(false)
  const [report, setReport] = React.useState<ReportState>({ stage: "closed" })
  /** The flag the report popover opens from. */
  const reportAnchor = React.useRef<HTMLButtonElement>(null)
  const { activity } = exchange
  /* The run stopped to ask: the question stands where its answer would, and the closing message that repeats it is not drawn. */
  const question = activity.question

  /* Before the run says anything: "Reading the page", then "Planning the change" once READING_MS has passed. */
  const [, setTick] = React.useState(0)
  const quiet = exchange.running && activity.last === "none"
  React.useEffect(() => {
    if (!quiet || exchange.startedAt === undefined) return
    const left = READING_MS - (performance.now() - exchange.startedAt)
    if (left <= 0) return
    const later = window.setTimeout(() => setTick((n) => n + 1), left + 20)
    return () => window.clearTimeout(later)
  }, [quiet, exchange.startedAt])

  const elapsed = exchange.startedAt === undefined ? READING_MS : performance.now() - exchange.startedAt
  const finished = finishedSteps(activity)
  /* "Changed Hero and FAQ" when the run named them, "2 sections changed" when it did not. */
  const count = changeSummary(activity)
  /* The run's own sentence of what changed, where the answer above does not already say it. */
  const detail = !exchange.running && !question ? detailToShow(exchange.reply, activity.done) : null
  const sending = exchange.running && !exchange.sent
  const hasWork = !!activity.plan || finished.length > 0 || activity.code.length > 0

  /*
    THE PICTURES, AS PICTURES. The ones in hand are thumbnails that open in
    the viewer: the bytes themselves while the chat is open, a signed URL
    once it is read back. One whose URL does not load (its thirty days ran
    out between the read and the look) and one the transcript mentions but
    did not return are the same tile: "Picture no longer available", where
    the picture was, never the note the transcript keeps for them.
  */
  const [broken, setBroken] = React.useState<string[]>([])
  const pictures = (exchange.images ?? []).filter((image) => image.url && !broken.includes(image.id))
  const gone = (exchange.missingImages ?? 0) + (exchange.images?.length ?? 0) - pictures.length
  /*
    ARRIVING, NOT APPEARING. A message sent in this sitting (it has a start
    time; one read back from the history does not) rises a few pixels into
    place as it fades in, and so does its answer when that lands. Transform
    and opacity, once, on mount: `ask-in` in globals.css. A thread read back
    is simply there.
  */
  const fresh = exchange.startedAt !== undefined
  const arrive = fresh ? "ask-in" : undefined
  /* A phone reads the thread at arm's length: a size up, a touch heavier. */
  const words = phone ? "text-[15px] font-[450]" : "text-[13.5px]"

  return (
    <li data-ask-exchange={exchange.running ? "running" : exchange.error ? "failed" : "done"} className={cn("space-y-2.5", arrive)}>
      {(pictures.length > 0 || gone > 0) && (
        <div data-ask-sent-images="" className="flex flex-wrap justify-end gap-1.5">
          {pictures.map((image, index) => (
            <button
              key={image.id}
              type="button"
              data-ask-sent-image=""
              onClick={() => onView(pictures, index)}
              aria-label={`Open ${image.name}`}
              className="relative block overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f1f2f4] transition-opacity hover:opacity-90"
            >
              {/* Held at its final size, a neutral shimmer until the picture has decoded, then faded in over it. */}
              <FadeImage
                src={image.url ?? ""}
                alt={image.name}
                lazy
                onError={() => setBroken((was) => (was.includes(image.id) ? was : [...was, image.id]))}
                className="h-16 w-16"
              />
              {exchange.running && !exchange.sent && (
                <span data-ask-sending="" className="ask-fade absolute inset-0 flex items-center justify-center bg-white/60">
                  <ProgressRing fraction={exchange.upload ?? null} />
                </span>
              )}
            </button>
          ))}
          {Array.from({ length: Math.max(0, gone) }, (_, index) => (
            <span
              key={`gone-${index}`}
              data-ask-missing-image=""
              role="img"
              aria-label="Picture no longer available"
              className="flex h-16 w-[104px] flex-col items-center justify-center gap-1 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-2 text-center"
            >
              <ImageOff aria-hidden className="h-3.5 w-3.5 text-[#6b7280]/70" strokeWidth={1.8} />
              <span className="text-[11px] leading-[1.25] text-[#6b7280]">Picture no longer available</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <p
          data-ask-prompt=""
          className={cn("max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#f1f2f4] px-3.5 py-2 leading-[1.5] text-[#1a1a2e]", words)}
        >
          {exchange.prompt}
        </p>
      </div>
      {exchange.notKept && (
        <p data-ask-not-kept={exchange.notKept} className="text-right text-[11.5px] leading-snug text-[#6b7280]">
          {exchange.notKept === "chat"
            ? "This message could not be saved, so it will not be here after a reload."
            : "These pictures could not be kept, so they will not show after a reload."}
        </p>
      )}

      {exchange.running && (
        <div className="min-w-0">
          <ActivityLine label={sending && exchange.images?.length ? "Sending your pictures" : activityLine(activity, elapsed)} />
          {finished.length > 0 && (
            <button
              type="button"
              data-ask-steps-toggle=""
              aria-expanded={stepsOpen}
              onClick={() => setStepsOpen((open) => !open)}
              className={cn(
                "relative mt-1 inline-flex items-center gap-1 pl-[18px] text-[12px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]",
                phone ? "h-8 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']" : "h-6",
              )}
            >
              {finished.length} step{finished.length === 1 ? "" : "s"} done
              <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", stepsOpen && "rotate-180")} strokeWidth={2.25} />
            </button>
          )}
          {stepsOpen && <StepsList plan={activity.plan} steps={finished} code={[]} onOpenCode={onOpenCode} />}
          {/* A section file being written is shown as it is written. */}
          {activity.code.map((file) => (
            <CodePreview key={file.path} file={file} onOpenCode={onOpenCode} />
          ))}
        </div>
      )}

      {question ? (
        <QuestionChoices question={question} answer={answer} canAnswer={!exchange.running} onAnswer={onAnswer} phone={phone} />
      ) : (
        exchange.reply && (
          <p data-ask-reply="" className={cn("whitespace-pre-wrap leading-relaxed text-[#1a1a2e]", words, arrive)}>
            {exchange.reply}
          </p>
        )
      )}
      {detail && (
        <p data-ask-detail="" className={cn("whitespace-pre-wrap leading-relaxed text-[#1a1a2e]", words, arrive)}>
          {detail}
        </p>
      )}

      {exchange.error && (
        <div className={cn("space-y-1.5", arrive)}>
          <p className={cn("flex items-start gap-1.5 text-red-600", phone ? "text-[14px]" : "text-[12.5px]")}>
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {exchange.error}
          </p>
          {/*
            A failed run leaves the request sitting there with no way to make
            it again except retyping it, which is the moment most people give
            up on a feature rather than on the network. Its pictures go again
            too.
          */}
          <button
            type="button"
            onClick={() => onRetry(exchange)}
            disabled={!canRetry}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] text-[#1a1a2e]/75 transition-colors hover:border-[#1a1a2e]/25 hover:text-[#1a1a2e] disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2} />
            Try again
          </button>
        </div>
      )}

      {!exchange.running && (exchange.reply || exchange.error || count || hasWork || question) && (
        <div className="min-w-0">
          <AnswerMeta
            count={count}
            steps={stepsLabel(finished.length, !!activity.plan || activity.code.length > 0)}
            stepsOpen={stepsOpen}
            onToggleSteps={() => setStepsOpen((open) => !open)}
            undo={exchange.undone ? "done" : canUndo ? "available" : null}
            onUndo={() => onUndo(exchange)}
            copyText={exchange.reply ?? detail ?? question?.question ?? ""}
            canReport={!!exchange.messageId}
            report={report}
            onReport={setReport}
            phone={phone}
            reportRef={reportAnchor}
          />
          {stepsOpen && hasWork && <StepsList plan={activity.plan} steps={finished} code={activity.code} onOpenCode={onOpenCode} />}
          <ReportForm
            report={report}
            onChange={setReport}
            phone={phone}
            anchor={reportAnchor}
            onSend={(reason) => {
              setReport({ stage: "sending", reason })
              void onReport(exchange, reason).then(setReport)
            }}
          />
        </div>
      )}
    </li>
  )
})

/**
 * Memoised: the editor re-renders on every edit it makes, and the chat only
 * needs to when something it is given has changed. What it types, streams
 * and shows is its own state, so none of that re-renders the editor.
 */
export const ThemeChat = React.memo(ThemeChatPanel)

function ThemeChatPanel({
  installId,
  page,
  sections,
  settings,
  selectedSectionId,
  store,
  onRunStart,
  onRunEnd,
  onUndoRun,
  onBusyChange,
  onOp,
  onClose,
  onConnectAi,
  onOpenCodeEditor,
  onSourcesChanged,
  onWriteStart,
  onWriteDone,
  onWriteFailed,
  variant = "sheet",
  hidden = false,
  suspended = false,
  openRequest = 0,
}: {
  installId: string
  /**
   * "dock" is the computer's shape, a pill over the canvas that opens into
   * the conversation; "sheet" fills whatever holds it (the phone's sheet).
   */
  variant?: "sheet" | "dock"
  /** Dock only: closed with its X. Hidden, but mounted, so a run keeps going. */
  hidden?: boolean
  /** Dock only: the canvas is showing something else (the code, settings). */
  suspended?: boolean
  /** Dock only: each new value opens the conversation and puts the cursor in it. */
  openRequest?: number
  /**
   * WRITING A SECTION, AS THE CANVAS SEES IT. Start holds a spot on the page
   * where the section will go; done puts it there, and answers whether it
   * could (false when the creator has moved to another page meanwhile);
   * failed lets go of the spot. See lib/website-builder/ai-placement.ts.
   */
  onWriteStart?: (prompt: string) => void
  onWriteDone?: (section: { type: string; name: string; path: string }) => Promise<boolean> | boolean
  /** Nothing was written: `answered` when it replied in words instead, which is not a failure. */
  onWriteFailed?: (reason: string, answered?: boolean) => void
  /**
   * Opens the code editor at a path. A section the assistant writes is a file,
   * and the honest end of that is the creator reading it, not a thing that
   * appeared on their site without them seeing what it was.
   */
  onOpenCodeEditor?: (path: string) => void
  /** A section's code was rewritten during a run, so the theme's files are stale. */
  onSourcesChanged?: () => void
  /** Opens Website settings on Connections: Claude Code or Codex on this website. */
  onConnectAi?: () => void
  page: string
  sections: SectionInstance[]
  settings: Record<string, unknown>
  /**
   * The section the creator has open, so "make this section better" has a
   * referent. Without it the model gets a demonstrative pronoun and a list of
   * nine sections, which is not a question anybody can answer.
   */
  selectedSectionId?: string
  /** What the suggestions know about the store: how many products it has. */
  store?: { productCount: number | null }
  /**
   * Called once before the first change, so one Undo takes the lot back,
   * with an id the chat's own Undo can name later.
   */
  onRunStart: (runId?: string) => void
  /**
   * Called once after a run that changed something finishes cleanly, with
   * the prompt that asked for it. The editor takes a backup here, labelled
   * with that prompt, so "load the version from before I asked for the red
   * header" is a thing somebody can do.
   */
  onRunEnd?: (prompt: string) => void
  /**
   * Takes back one run's changes, by the id onRunStart was given. False when
   * it cannot (the page has changed since), and the chat stops offering it.
   */
  onUndoRun?: (runId: string) => boolean
  /** Whether a request is running, so the editor can say so with the panel closed. */
  onBusyChange?: (busy: boolean) => void
  onOp: (op: ThemeOp) => void
  onClose: () => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  /**
   * The newest finished run the open conversation has shown. One that ends
   * while the dock is folded is not seen yet, and the folded pill says what
   * it did, or asks its question, until the conversation is opened.
   */
  const [seenRun, setSeenRun] = React.useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  /**
   * `not_set_up` is a database with the chat table but not the
   * conversations part: every message is kept, as one chat. A database
   * without even the chat table is `keeping.chat` below.
   */
  const [historyError, setHistoryError] = React.useState<null | "not_set_up" | "read_failed">(null)
  /**
   * WHAT THIS DATABASE CAN KEEP. False before the update that creates the
   * table (chat: run-now part 24; pictures: part 33). Said once, plainly,
   * above the thread, instead of letting a reload show an empty history or
   * a note where a picture was.
   */
  const [keeping, setKeeping] = React.useState<{ chat: boolean; pictures: boolean }>({ chat: true, pictures: true })
  const [draft, setDraft] = React.useState("")
  const dock = variant === "dock"
  const phone = !dock
  /**
   * THE CONVERSATION ON SCREEN. `id` is null for a new chat until its first
   * run, when the route answers with the conversation it opened. `earlier`
   * is the thread from before conversations were kept apart; continuing it
   * files those messages under a new conversation.
   */
  const [conversation, setConversation] = React.useState<{ id: string | null; title: string; earlier: boolean }>({
    id: null,
    title: "",
    earlier: false,
  })
  /** The thread, or the history sliding in over it. */
  const [view, setView] = React.useState<"thread" | "history">("thread")
  /** Mounted on first open and kept, so going back and forth is a slide rather than a fetch and a flash. */
  const [historyMounted, setHistoryMounted] = React.useState(false)
  const [historyKey, setHistoryKey] = React.useState(0)
  /** Dock: the conversation is open above the pill. */
  const [expanded, setExpanded] = React.useState(false)
  /** Dock: the conversation fills most of the canvas. */
  const [maximized, setMaximized] = React.useState(false)
  /**
   * Dock: whether the conversation has been asked for yet. The history is
   * read the first time the dock opens rather than on every editor load:
   * reading it signs a URL for every picture in it.
   */
  const [wanted, setWanted] = React.useState(!dock)
  const reducedMotion = useReducedMotion()
  /**
   * WHICH OF THE TWO THINGS IS BEING ASKED FOR. "change" edits this page and
   * goes to the agent; "code" writes a new section type and goes to the one
   * endpoint that compiles a file before keeping it. They are different acts
   * with different answers, and a single box that guessed between them would
   * guess wrong on "add a comparison table", which could mean either.
   */
  const [mode, setMode] = React.useState<AskMode>("change")
  /** The last section written, so the panel can offer to open it. */
  const [written, setWritten] = React.useState<{ path: string; name: string; placed: boolean } | null>(null)
  const [writing, setWriting] = React.useState(false)
  const [writeError, setWriteError] = React.useState<string | null>(null)
  /** Where the writer has got to, from the server's own reports. */
  const [writeStage, setWriteStage] = React.useState<"starting" | WriteStage | null>(null)
  /** An answer instead of a section: the message was a question, or unclear. */
  const [writeReply, setWriteReply] = React.useState<{ prompt: string; text: string } | null>(null)
  /** The last request, so Try again can make it again without retyping it. */
  const lastWrite = React.useRef<{ prompt: string; images: Attachment[] } | null>(null)
  const writeLabel = writeStage ? WRITE_LINES[writeStage] : null
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])
  /**
   * THE NEXT THING TO ASK, WHILE THE LAST ONE IS STILL GOING.
   *
   * The box used to be `disabled` for the whole run, so the moment you had a
   * second thought you had to hold it in your head and watch a spinner. A run
   * is one request in and one answer out, and there is no reason a person
   * cannot be writing the next one, so Enter during a run queues it and it
   * goes the instant the run ends.
   */
  const [queued, setQueued] = React.useState<string | null>(null)
  /**
   * ONLY THE OPEN SECTION MAY CHANGE.
   *
   * On by default whenever a section is selected, because that is what
   * selecting one means: asking for "a bit more space" on a FAQ and getting a
   * reworded hero back is an edit you have to check the whole page to trust.
   * A chip rather than a rule, so the scope of the edit is something the
   * creator sets and can SEE.
   */
  const [lockOn, setLockOn] = React.useState(true)
  /**
   * WHICH MODEL ANSWERS.
   *
   * Claude Sonnet by default: it is the everyday model and what the
   * deployment is configured for. Opus is there for a change somebody already
   * knows is hard, and it is their choice rather than the model's: a model
   * that can promote itself to the five times dearer tier eventually will,
   * and the bill is theirs.
   *
   * Remembered per browser. Somebody who has chosen ChatGPT has chosen it for
   * more than one message.
   */
  const [engine, setEngine] = React.useState<EngineId>("claude")
  const [engineOpen, setEngineOpen] = React.useState(false)

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ENGINE_KEY)
      if (saved && ENGINES.some((e) => e.id === saved)) setEngine(saved as EngineId)
    } catch {
      // A browser with site data blocked still gets the default.
    }
  }, [])

  const chooseEngine = React.useCallback((id: string) => {
    if (!ENGINES.some((e) => e.id === id)) return
    setEngine(id as EngineId)
    setEngineOpen(false)
    try {
      window.localStorage.setItem(ENGINE_KEY, id)
    } catch {
      /* per-browser convenience only */
    }
  }, [])

  /**
   * SOUNDS: a tick as the microphone opens and closes, a whoosh as a message
   * goes, a chime when the answer is in (lib/website-builder/ask-sounds.ts).
   * On unless this browser turned them off, from the menu under the model
   * button. Arming only listens for the first press on the page, where the
   * audio may be woken; nothing plays until something is sent or recorded.
   */
  const [sounds, setSounds] = React.useState(true)
  React.useEffect(() => {
    setSounds(soundsOn())
    armAskSounds()
  }, [])
  const chooseSounds = React.useCallback((on: boolean) => {
    setSounds(on)
    setSoundsOn(on)
    /* Turned on: one chime, so the choice is heard. */
    if (on) playAskSound("done")
  }, [])
  const abortRef = React.useRef<AbortController | null>(null)
  /** The conversation's own scroller, and the only thing a new message scrolls. */
  const threadRef = React.useRef<HTMLDivElement>(null)
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  /** Where a finger came down on the box, to tell a tap on it from a scroll. */
  const fieldTap = React.useRef<{ x: number; y: number } | null>(null)

  const selectedSection = React.useMemo(
    () => (selectedSectionId ? sections.find((s) => s.id === selectedSectionId) : undefined),
    [sections, selectedSectionId],
  )
  const locked = !!selectedSection && lockOn

  /**
   * A NEW SELECTION IS A FRESH INTENT. Clearing the lock to add a section, then
   * clicking a different section, should not leave the next edit quietly
   * unscoped: the chip would say one thing and the last click meant another.
   */
  React.useEffect(() => {
    setLockOn(true)
  }, [selectedSectionId])

  const chosenEngine = ENGINES.find((e) => e.id === engine) ?? ENGINES[0]
  /* Which models the creator's own AI answers, if they have connected one: "Your key" beside them in the menu. */
  const ownAi = useOwnAi()
  const ownByEngine = React.useMemo(() => {
    const out: Record<string, string | null> = {}
    for (const e of ENGINES) {
      const source = ownFor(ownAi.keys, e.provider)
      out[e.id] = source ? (source === "openrouter" ? "Your OpenRouter" : "Your key") : null
    }
    return out
  }, [ownAi.keys])

  /**
   * Read at SEND time, like everything else in here: a run started thirty
   * seconds ago must send what the page looks like NOW, including anything
   * the person changed by hand while it was open, or the model plans against
   * a page that no longer exists and addresses sections by ids that moved.
   */
  const live = React.useRef({ sections, settings, page, selectedSectionId, locked, engine: chosenEngine, conversation })
  live.current = { sections, settings, page, selectedSectionId, locked, engine: chosenEngine, conversation }

  /**
   * WHAT TO ASK NEXT, from where the creator is: the section they have open,
   * what the page has and lacks, and whether the store has products. See
   * lib/website-builder/ask-suggestions.ts.
   */
  const brandName = typeof settings.brand_name === "string" ? settings.brand_name : ""
  const productCount = store?.productCount ?? null
  const suggestions = React.useMemo(
    () => suggestionsFor({ mode, page, sections, selectedId: selectedSectionId, storeName: brandName, productCount }),
    [mode, page, sections, selectedSectionId, brandName, productCount],
  )

  /**
   * ===========================================================================
   *  A NEW MESSAGE SCROLLS THE THREAD, AND NOTHING ELSE
   * ===========================================================================
   * The thread's own `scrollTop` touches nothing but the thread. A marker's
   * `scrollIntoView` walks every scrollable ancestor and moved the phone
   * sheet and the document behind it too, which with a keyboard up took the
   * sheet's header under the status bar.
   */
  /*
    ─────────────────────────────────────────────────────────────────────────
     AND IT FOLLOWS A RUN ONLY FOR SOMEBODY WHO IS FOLLOWING IT
    ─────────────────────────────────────────────────────────────────────────
    Every line a run streams in is a new `exchanges`, and each one used to
    scroll the thread to its end, pulling down somebody who had scrolled up
    to read what the last run did. So the thread is PINNED while its reader
    is at the end, and only a pinned thread follows. A new exchange pins it
    whatever the reader was doing, because a new exchange is the message they
    just sent. The scroll a smooth scroll makes is not the reader's, so for
    its length it does not unpin anything, unless a finger or a wheel takes
    over.
  */
  const pinned = React.useRef(true)
  const autoScrollUntil = React.useRef(0)
  const seenExchanges = React.useRef(0)
  React.useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    const onScroll = () => {
      if (performance.now() < autoScrollUntil.current) return
      pinned.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= PIN_SLACK_PX
    }
    const onReader = () => {
      autoScrollUntil.current = 0
    }
    /* The thread shrinks when a keyboard comes up under the composer; a
       pinned reader keeps the newest line in view rather than losing it. */
    const ro = new ResizeObserver(() => {
      if (pinned.current) thread.scrollTop = thread.scrollHeight
    })
    thread.addEventListener("scroll", onScroll, { passive: true })
    thread.addEventListener("touchstart", onReader, { passive: true })
    thread.addEventListener("wheel", onReader, { passive: true })
    thread.addEventListener("pointerdown", onReader, { passive: true })
    ro.observe(thread)
    return () => {
      thread.removeEventListener("scroll", onScroll)
      thread.removeEventListener("touchstart", onReader)
      thread.removeEventListener("wheel", onReader)
      thread.removeEventListener("pointerdown", onReader)
      ro.disconnect()
    }
  }, [])
  /*
    ─────────────────────────────────────────────────────────────────────────
     A KEYBOARD COMING UP KEEPS THE NEWEST LINE IN VIEW
    ─────────────────────────────────────────────────────────────────────────
    On a phone the composer rides up over the end of the thread rather than
    the thread shrinking (see the footer below), and the spacer at the end of
    the thread grows by the same amount. A reader who was at the end is
    glided to the new end, alongside the composer, so the last line sits just
    above it. Going the other way needs nothing: the spacer shrinks, the
    browser clamps the scroll to the new end, and the thread is flush with
    the composer again with no gap to close.
  */
  const keysRoomRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const room = keysRoomRef.current
    const thread = threadRef.current
    if (!room || !thread) return
    let last = room.offsetHeight
    const ro = new ResizeObserver(() => {
      const now = room.offsetHeight
      const grew = now > last
      last = now
      if (!grew || !pinned.current) return
      const end = Math.max(0, thread.scrollHeight - thread.clientHeight)
      autoScrollUntil.current = performance.now() + AUTO_SCROLL_MS
      if (prefersReducedMotion()) thread.scrollTop = end
      else thread.scrollTo({ top: end, behavior: "smooth" })
    })
    ro.observe(room)
    return () => ro.disconnect()
  }, [])
  React.useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    const restored = seenExchanges.current === 0
    const added = exchanges.length > seenExchanges.current
    seenExchanges.current = exchanges.length
    if (added) pinned.current = true
    if (!pinned.current) return
    const end = Math.max(0, thread.scrollHeight - thread.clientHeight)
    const gliding = performance.now() < autoScrollUntil.current
    if ((added && !restored) || gliding) {
      if (!prefersReducedMotion()) {
        if (added) autoScrollUntil.current = performance.now() + AUTO_SCROLL_MS
        thread.scrollTo({ top: end, behavior: "smooth" })
        return
      }
    }
    thread.scrollTop = end
  }, [exchanges, queued])

  /**
   * THE CONVERSATION SURVIVES A REFRESH, one conversation at a time: `which`
   * is an id from the history, "earlier" for the messages from before
   * conversations, or null for the one used last. Restored as pairs: the
   * transcript stores one row for the question and one for the reply, and
   * the panel shows one exchange. A newer load, or a message sent meanwhile,
   * makes an older load's answer stale (`loadSeq`), and it is dropped.
   */
  const loadSeq = React.useRef(0)
  const load = React.useCallback(
    async (which: string | null) => {
      const seq = ++loadSeq.current
      const cancelledNow = () => seq !== loadSeq.current
      setLoadingHistory(true)
      setHistoryError(null)
      try {
        const query = which ? `?conversation=${encodeURIComponent(which)}` : ""
        const response = await fetch(`/api/website-builder/themes/${installId}/chat${query}`)
        const cancelled = cancelledNow()
        if (!response.ok) {
          /**
           * A FAILED READ IS NOT AN EMPTY CONVERSATION. Showing a blank panel
           * would let somebody believe their history was gone when it is
           * sitting in the table. And a database without the chat table at
           * all keeps nothing, which is said as that: not "could not load",
           * and not "kept as one chat", which would not be true.
           */
          const body = (await response.json().catch(() => ({}))) as { reason?: string }
          if (!cancelled) {
            if (body.reason === "not_set_up") setKeeping((was) => ({ ...was, chat: false }))
            else setHistoryError("read_failed")
          }
          return
        }
        const body = (await response.json()) as {
          conversation?: { id: string; title: string } | null
          earlier?: boolean
          history?: string
          pictures?: string
          messages: StoredMessage[]
        }
        if (cancelledNow()) return

        /**
         * Paired and read back the way they were sent: the words without
         * the note the transcript keeps for pictures, the pictures that came
         * back as signed URLs, and a count of the ones that did not, drawn
         * as "no longer available". The operations are counted, never
         * replayed. See lib/website-builder/ask-restore.ts.
         */
        const restored: Exchange[] = restoreExchanges(body.messages).map((r) => ({
          id: r.id,
          messageId: r.messageId,
          prompt: r.prompt,
          reply: r.reply,
          error: r.error,
          running: false,
          activity: r.activity,
          images: r.images.length
            ? r.images.map((image) => ({
                id: image.id,
                name: image.name,
                state: "ready" as const,
                progress: 1,
                /* Kept only to satisfy the shape; a restored picture is never sent again. */
                mediaType: "image/png" as AllowedImageType,
                data: "",
                url: image.url,
              }))
            : undefined,
          missingImages: r.missingImages || undefined,
        }))
        setKeeping({ chat: true, pictures: body.pictures !== "not_set_up" })
        /* A different conversation lands at its end without a glide, as a restore does. */
        seenExchanges.current = 0
        /* What was already there has been seen: the folded pill only speaks for a run that ends while it is folded. */
        setSeenRun(restored[restored.length - 1]?.id ?? null)
        setExchanges(restored)
        setConversation({
          id: body.conversation?.id ?? null,
          title: body.conversation?.title ?? (body.earlier ? restored[0]?.prompt ?? "" : ""),
          earlier: !!body.earlier,
        })
        /* A database without the conversations part: say so, above the one thread it has. */
        if (body.history === "not_set_up") setHistoryError("not_set_up")
      } catch {
        if (!cancelledNow()) setHistoryError("read_failed")
      } finally {
        if (!cancelledNow()) setLoadingHistory(false)
      }
    },
    [installId],
  )

  React.useEffect(() => {
    if (!wanted) return
    void load(null)
    return () => {
      /* An unmount, or a different install: whatever is in flight is stale. */
      loadSeq.current++
    }
  }, [wanted, load])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  PICTURES, AND VIDEOS AS STILLS, HANDED STRAIGHT TO THE ASSISTANT
   * ═════════════════════════════════════════════════════════════════════════
   * Three ways in, because people reach for whichever is nearest: the paper
   * clip, a paste, and a drop anywhere on the panel. Each one is a thumbnail
   * the moment it is chosen, drawn from the file itself, with a ring that
   * fills as it is made ready (components/website-builder/
   * ask-attach-prepare.ts: decoded, shrunk to the size the model reads,
   * encoded). A HEIC photo is converted where the browser can read it; a
   * video becomes a few stills. What cannot be attached says why, under the
   * row, in a sentence.
   *
   * The bytes travel with the request that mentions them, in the shape
   * lib/sites/agent/attachments.ts checks at the route.
   */
  const [attached, setAttached] = React.useState<Attachment[]>([])
  const attachedRef = React.useRef(attached)
  attachedRef.current = attached
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [attachError, setAttachError] = React.useState<string | null>(null)
  /** Which picture is open full size, and the set it belongs to. */
  const [viewing, setViewing] = React.useState<{ images: ViewableImage[]; at: number } | null>(null)
  /**
   * A FILE IS OVER THE PANEL. Counted rather than set, because dragenter and
   * dragleave fire for every child the pointer crosses: a boolean flickers
   * off the moment the cursor passes from the thread onto the composer.
   */
  const dragDepth = React.useRef(0)
  const [dragging, setDragging] = React.useState(false)
  /** Object URLs made for thumbnails, let go once a picture is ready or removed. */
  const previews = React.useRef(new Map<string, string>())

  const letGoPreview = React.useCallback((id: string) => {
    const url = previews.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      previews.current.delete(id)
    }
  }, [])
  React.useEffect(() => {
    const made = previews.current
    return () => {
      for (const url of made.values()) URL.revokeObjectURL(url)
      made.clear()
    }
  }, [])

  const patchPicture = React.useCallback((id: string, change: Partial<Attachment>) => {
    setAttached((previous) => previous.map((a) => (a.id === id ? { ...a, ...change } : a)))
  }, [])

  /**
   * Makes one waiting picture ready. Under the total the request can carry,
   * checked here rather than left to the server, so it reads as "that is too
   * much" in the composer instead of arriving as a failed run.
   */
  const prepare = React.useCallback(
    async (id: string, file: File) => {
      try {
        const ready = await preparePicture(file, (fraction) => patchPicture(id, { progress: fraction }))
        const others = attachedRef.current.filter((a) => a.id !== id && a.state === "ready")
        const total = others.reduce((sum, a) => sum + a.data.length * 0.75, 0) + ready.data.length * 0.75
        if (total > MAX_TOTAL_IMAGE_BYTES) {
          letGoPreview(id)
          setAttached((previous) => previous.filter((a) => a.id !== id))
          setAttachError(`That is more than ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB of pictures in one message. Send some now and the rest after.`)
          return
        }
        letGoPreview(id)
        patchPicture(id, { state: "ready", progress: 1, mediaType: ready.mediaType, data: ready.data, url: ready.url, error: undefined })
      } catch (thrown) {
        const message = thrown instanceof PrepareError ? thrown.message : `${file.name} could not be read.`
        /* A HEIC this browser cannot open is not going to open on a second try. */
        const retry = !(kindOf(file) === "heic" && /HEIC/.test(message))
        patchPicture(id, { state: "failed", progress: 0, error: message, source: retry ? file : undefined })
        setAttachError(message)
      }
    },
    [patchPicture, letGoPreview],
  )

  const attach = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return
      const picked = Array.from(files)
      if (picked.length === 0) return
      setAttachError(null)
      const problems: string[] = []
      let room = MAX_IMAGES - attachedRef.current.length
      for (const file of picked) {
        const problem = attachProblem(file)
        if (problem) {
          problems.push(problem)
          continue
        }
        const kind = kindOf(file)
        if (room <= 0) {
          problems.push(`${MAX_IMAGES} pictures is the most one message can carry.`)
          break
        }
        if (kind === "video") {
          const count = stillsRoom(MAX_IMAGES - room)
          room -= count
          const ids = Array.from({ length: count }, () => crypto.randomUUID())
          setAttached((previous) => [
            ...previous,
            ...ids.map((id, index) => ({
              id,
              name: `${file.name}, still ${index + 1}`,
              state: "preparing" as const,
              progress: 0,
              mediaType: "image/jpeg" as AllowedImageType,
              data: "",
              url: "",
              still: true,
            })),
          ])
          void prepareStills(file, count, (fraction) => ids.forEach((id) => patchPicture(id, { progress: fraction })))
            .then((stills) => {
              ids.forEach((id, index) => {
                const still = stills[index]
                if (still) patchPicture(id, { state: "ready", progress: 1, mediaType: still.mediaType, data: still.data, url: still.url })
                else setAttached((previous) => previous.filter((a) => a.id !== id))
              })
            })
            .catch((thrown) => {
              const message = thrown instanceof PrepareError ? thrown.message : `${file.name} could not be read.`
              setAttached((previous) => previous.filter((a) => !ids.includes(a.id)))
              setAttachError(message)
            })
          continue
        }
        room -= 1
        const id = crypto.randomUUID()
        /* The thumbnail is the file itself until the prepared picture replaces it. HEIC draws where it can. */
        let url = ""
        try {
          url = URL.createObjectURL(file)
          previews.current.set(id, url)
        } catch {
          url = ""
        }
        setAttached((previous) => [
          ...previous,
          { id, name: file.name, state: "preparing", progress: 0, mediaType: "image/jpeg", data: "", url, source: file },
        ])
        void prepare(id, file)
      }
      if (problems.length) setAttachError(problems[0])
    },
    [prepare, patchPicture],
  )

  const retryPicture = React.useCallback(
    (id: string) => {
      const item = attachedRef.current.find((a) => a.id === id)
      if (!item?.source) return
      setAttachError(null)
      patchPicture(id, { state: "preparing", progress: 0, error: undefined })
      void prepare(id, item.source)
    },
    [patchPicture, prepare],
  )

  const removeAttachment = React.useCallback(
    (id: string) => {
      letGoPreview(id)
      setAttached((previous) => previous.filter((a) => a.id !== id))
    },
    [letGoPreview],
  )

  const preparing = attached.some((a) => a.state === "preparing")
  const readyPictures = attached.filter((a) => a.state === "ready")

  const patchExchange = React.useCallback((id: string, change: (exchange: Exchange) => Exchange) => {
    setExchanges((previous) => previous.map((e) => (e.id === id ? change(e) : e)))
  }, [])

  /**
   * ONE RUN. It leaves the box alone: what is in it is the caller's (submit
   * empties it for what it sends), so an answer tapped under a question, a
   * Try again, or a queued message going out does not wipe what somebody has
   * started typing since.
   */
  const send = React.useCallback(
    async (text: string, images: Attachment[] = [], quiet = false) => {
      const prompt = text.trim()
      /**
       * A picture on its own is a whole request. "Even if it says nothing and
       * uploads an image, it should try to replicate it."
       */
      if ((!prompt && images.length === 0) || busy) return

      const id = crypto.randomUUID()
      const runId = crypto.randomUUID()
      const startedOn = live.current.page
      /* The whoosh as it goes; a queued message already had its own when it was queued. */
      if (!quiet) playAskSound("sent")
      setBusy(true)
      /* A history read still in flight would land on top of this message: it is dropped. */
      if (loadingHistory) {
        loadSeq.current++
        setLoadingHistory(false)
      }
      setWanted(true)
      setExchanges((previous) => [
        ...previous,
        {
          id,
          prompt: prompt || promptForPictures(images.length),
          running: true,
          images,
          activity: EMPTY_ACTIVITY,
          startedAt: performance.now(),
          engine: live.current.engine.id,
          page: startedOn,
        },
      ])

      const patch = (change: (exchange: Exchange) => Exchange) => patchExchange(id, change)

      /** One snapshot, before anything moves, so Undo takes back the whole run. */
      let snapshotTaken = false
      let uploadStep = -1
      /** The run has said its last word: the chime has played, or an error made it unnecessary. */
      let finished = false

      /**
       * THE RUN BELONGS TO THE PAGE IT STARTED ON.
       *
       * Switching pages swaps `sections` for a different page's, and the
       * operations coming back address the OLD page by id. Most would miss
       * harmlessly, but `add_section` names no existing id and would land a
       * new section on whichever page happens to be open.
       */
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const result = await streamPost(
          `/api/website-builder/themes/${installId}/agent`,
          JSON.stringify({
            prompt,
            images: images.map((a) => ({ mediaType: a.mediaType, data: a.data, name: a.name })),
            page: live.current.page,
            sections: live.current.sections,
            settings: live.current.settings,
            selectedSectionId: live.current.selectedSectionId,
            lockToSelection: live.current.locked,
            provider: live.current.engine.provider,
            tier: live.current.engine.tier,
            /* The conversation on screen; the route opens a new one for null. */
            conversationId: live.current.conversation.id,
            continueEarlier: live.current.conversation.earlier,
          }),
          {
            signal: controller.signal,
            /* How much of a request with pictures has gone up, in twentieths, so the ring moves without a render per packet. */
            onUpload: images.length
              ? (fraction) => {
                  const step = Math.floor(fraction * 20)
                  if (step === uploadStep) return
                  uploadStep = step
                  patch((e) => ({ ...e, upload: fraction }))
                }
              : undefined,
            /* The route has read the whole request, pictures included, before it answers. */
            onSent: () => patch((e) => ({ ...e, sent: true })),
            onLine: (line) => {
              const event = line as RunLine
              const type = typeof event.type === "string" ? event.type : ""

              /* Which conversation this run is recorded in: a new chat now has an id, and a name. */
              if (event.type === "conversation" && event.id) {
                const opened = { id: String(event.id), title: typeof event.title === "string" ? event.title : "", earlier: false }
                setConversation((was) => (was.id === opened.id && was.title === opened.title && !was.earlier ? was : opened))
                return
              }
              /* The id the question was kept under, which Report names. */
              if (type === "recorded") {
                const messageId = typeof event.messageId === "string" ? event.messageId : null
                if (messageId) patch((e) => ({ ...e, messageId }))
                return
              }
              /*
                IT COULD NOT BE KEPT, said as it happens. Before the database
                update, once above the thread for the whole chat; for any
                other reason, under this message.
              */
              if (type === "unsaved") {
                const what = event.what === "pictures" ? "pictures" : "chat"
                if (event.reason === "not_set_up") setKeeping((was) => ({ ...was, [what]: false }))
                else patch((e) => ({ ...e, notKept: what }))
                return
              }

              /**
               * Checked per line rather than once: the page can change at any
               * point during a run, and the next line is where it matters.
               */
              if (live.current.page !== startedOn) {
                controller.abort()
                patch((e) => ({
                  ...e,
                  running: false,
                  activity: settleActivity(e.activity),
                  reply: "Stopped, you moved to another page. Nothing was applied there.",
                }))
                return
              }

              if (event.type === "op" && event.op) {
                if (!snapshotTaken) {
                  onRunStart(runId)
                  snapshotTaken = true
                  patch((e) => ({ ...e, runId }))
                }
                onOp(event.op)
              } else if (type === "sources-changed") {
                // The canvas is drawing the old source; the editor holds the files.
                onSourcesChanged?.()
                return
              } else if (type === "question") {
                /**
                 * THE RUN STOPPED TO ASK, and is over as far as anybody
                 * reading it is concerned: the question and its answers
                 * replace the line. The closing message that follows says
                 * the same question as text, and is kept only for Copy.
                 */
                patch((e) => {
                  const next = reduceActivity(e.activity, event)
                  return next.question ? { ...e, running: false, activity: next } : e
                })
                /* Its turn is over: the chime, as for an answer. */
                if (!finished) playAskSound("done")
                finished = true
                return
              } else if (type === "message") {
                const reply = typeof event.text === "string" ? event.text : ""
                patch((e) => ({ ...e, reply, running: false, activity: settleActivity(e.activity) }))
                /* The answer is in. Once per run: a question's closing message is not a second one. */
                if (!finished) playAskSound("done")
                finished = true
                return
              } else if (type === "error") {
                const message = typeof event.message === "string" ? event.message : "The edit failed."
                patch((e) => ({ ...e, running: false, error: message, activity: settleActivity(e.activity, true) }))
                finished = true
                return
              }
              /*
                Everything else is progress: the agent's `thinking`, `plan`,
                `step`, `code` and `op`, and any kind of line the server adds
                later that carries a label. See lib/website-builder/ask-activity.ts.
              */
              patch((e) => {
                const next = reduceActivity(e.activity, event)
                return next === e.activity ? e : { ...e, activity: next }
              })
            },
          },
        )
        if (!result.ok) {
          patch((e) => ({ ...e, running: false, sent: true, error: result.error ?? "That did not go through.", activity: settleActivity(e.activity, true) }))
          return
        }
        patch((e) => ({ ...e, running: false, activity: settleActivity(e.activity) }))
        if (snapshotTaken) onRunEnd?.(prompt)
      } catch (thrown) {
        const stopped = thrown instanceof DOMException && thrown.name === "AbortError"
        patch((e) => ({
          ...e,
          running: false,
          activity: settleActivity(e.activity, !stopped),
          /**
           * A stop is the person deciding, not a fault, and changes already
           * applied are NOT rolled back: they are on screen and Undo takes
           * them back. Silently reverting work somebody watched happen would
           * be the more surprising behaviour.
           */
          error: stopped ? undefined : "Lost the connection. Anything already changed is still here.",
          reply: stopped ? e.reply ?? "Stopped." : e.reply,
        }))
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, installId, loadingHistory, onOp, onRunStart, onRunEnd, onSourcesChanged, patchExchange],
  )

  /**
   * Drains the queue when the run that was in the way finishes. `send` refuses
   * while `busy`, so this cannot fire into the middle of one.
   */
  React.useEffect(() => {
    if (busy || !queued) return
    const next = queued
    setQueued(null)
    /* Quiet: it had its whoosh when it was queued. */
    void send(next, [], true)
  }, [busy, queued, send])

  /**
   * WRITE ME A SECTION. Not the agent loop: that edits a page, and every one
   * of its operations names something that already exists. This asks for a
   * file, and the server compiles it before keeping it; a section that does
   * not compile is never stored, so the worst outcome here is being told why.
   */
  const writeOne = React.useCallback(
    async (prompt: string, images: Attachment[] = []) => {
      lastWrite.current = { prompt, images }
      playAskSound("sent")
      setWriting(true)
      setWriteStage("starting")
      setWriteError(null)
      setWriteReply(null)
      setWritten(null)
      /* The box's pictures went with this request; a suggestion tapped with pictures waiting leaves them there. */
      if (images.length) {
        setAttached([])
        setAttachError(null)
      }
      onWriteStart?.(prompt)
      /* The section arrives on the canvas: the dock gets out of its way while it does. */
      if (dock) setExpanded(false)
      let kept = false
      let answered = false
      let reason = "The section could not be written."
      try {
        const res = await fetch(`/api/website-builder/themes/${installId}/sections/code`, {
          method: "POST",
          /* One line per stage, then the answer: see the route. */
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          /**
           * THE PICTURES GO TOO, and so does the site: writing a section is
           * the one moment every colour, font and spacing value is decided at
           * once, and the editor already holds both.
           */
          body: JSON.stringify({
            prompt,
            images: images.map((a) => ({ mediaType: a.mediaType, data: a.data, name: a.name })),
            settings,
            sectionTypes: [...new Set(sections.map((s) => s.type))].slice(0, 40),
          }),
        })
        const d = await readWriteAnswer(res, setWriteStage)
        /* It answered instead: the message was a question, or too unclear
           to build. A conversation, shown as one, and nothing to retry. */
        if (d.reply) {
          reason = d.reply
          answered = true
          setWriteReply({ prompt, text: d.reply })
          return
        }
        const type = d.type ?? d.path?.match(/^sections\/([a-z0-9_-]+)\.storelib$/)?.[1]
        if (d.status >= 400 || !d.path || !d.name || !type) {
          /* The compiler's own words are for the code editor, not for this
             chat; the detail stays in the console. */
          if (d.errors?.length) console.warn("[storelib ai] section did not compile", d.errors)
          reason = plainWriteError(d.status, d.error, Boolean(d.errors?.length))
          setWriteError(reason)
          return
        }
        /**
         * Written and kept, whatever happens next: the file is saved. If the
         * editor cannot put it on the page, it is still in Add Section, and
         * the message below says so rather than reporting a failure.
         */
        kept = true
        const section = { type, name: d.name, path: d.path }
        const placed = await Promise.resolve()
          .then(() => onWriteDone?.(section))
          .then((v) => v === true)
          .catch(() => false)
        setWritten({ path: section.path, name: section.name, placed })
      } catch {
        reason = "Storelib AI could not be reached. Check your connection and try again."
        setWriteError(reason)
      } finally {
        if (!kept) onWriteFailed?.(reason, answered)
        /* Nothing on the canvas to look at: the reason, or the answer, is read here. */
        if (!kept && dock) setExpanded(true)
        /* The section is written, or it answered: the chime. A failure has its sentence instead. */
        if (kept || answered) playAskSound("done")
        setWriting(false)
        setWriteStage(null)
      }
    },
    /**
     * Everything it reads, so a section written after changing the colours is
     * written for the new ones.
     */
    [installId, settings, sections, onWriteStart, onWriteDone, onWriteFailed, dock],
  )

  const submit = React.useCallback(
    (text: string) => {
      const prompt = text.trim()
      const images = attachedRef.current.filter((a) => a.state === "ready")
      if (!prompt && images.length === 0) return
      /* A picture still being made ready is waited for: sending now would leave it behind. */
      if (attachedRef.current.some((a) => a.state === "preparing")) return
      setDraft("")
      if (mode === "code") {
        if (writing) return
        void writeOne(prompt, images)
        return
      }
      if (busy) {
        /* The words wait for the run in the way; the pictures stay in the box, to go with the next message. */
        setQueued(prompt)
        playAskSound("sent")
        return
      }
      setAttached([])
      setAttachError(null)
      void send(prompt, images)
    },
    [busy, send, mode, writing, writeOne],
  )

  /**
   * AN ANSWER TAPPED UNDER THE RUN'S QUESTION. It goes to the agent as the
   * next message in this conversation, whichever mode the box is in, since
   * the agent is what asked; the box keeps whatever is in it.
   */
  const answerQuestion = React.useCallback(
    (text: string) => {
      if (busy) {
        setQueued(text)
        playAskSound("sent")
        return
      }
      void send(text)
    },
    [busy, send],
  )

  /** Try again: the same words, and the same pictures when they are still in hand. */
  const retry = React.useCallback(
    (exchange: Exchange) => {
      if (busy) return
      const images = (exchange.images ?? []).filter((a) => a.data)
      void send(exchange.prompt, images)
    },
    [busy, send],
  )

  /** The editor's Undo for one run: the page as it was before it started. */
  const undoRun = React.useCallback(
    (exchange: Exchange) => {
      if (!exchange.runId || !onUndoRun) return
      const done = onUndoRun(exchange.runId)
      patchExchange(exchange.id, (e) => ({ ...e, undone: done, runId: done ? e.runId : undefined }))
    },
    [onUndoRun, patchExchange],
  )

  const reportOne = React.useCallback(
    async (exchange: Exchange, reason: string): Promise<ReportState> => {
      if (!exchange.messageId) return { stage: "problem", message: "This answer cannot be reported yet.", reason }
      const result = await reportAnswer(installId, { messageId: exchange.messageId, reason, engine: exchange.engine })
      if (result.ok) return { stage: "sent" }
      return { stage: "problem", message: reportProblem(result.problem), reason }
    },
    [installId],
  )

  const viewImages = React.useCallback((images: ViewableImage[], at: number) => setViewing({ images, at }), [])

  /**
   * The box grows with what is in it, to a point. Two fixed rows is enough for
   * "make it blue" and not enough for the kind of instruction that is worth
   * writing.
   */
  const resize = React.useCallback(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = "auto"
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`
  }, [])

  React.useEffect(resize, [draft, resize])

  /*
    ═════════════════════════════════════════════════════════════════════════
     SPEAKING INSTEAD OF TYPING
    ═════════════════════════════════════════════════════════════════════════
    The words land in the box, after whatever was already typed, and are not
    sent: they are read and changed first like typed ones. They TYPE
    themselves in, a few characters a frame, while the words are still being
    said: a recogniser hands them over in bursts and revises its guesses,
    and put straight in the box they jumped by whole phrases and flickered at
    the end (lib/website-builder/ask-typing.ts). When the recording stops the
    box holds exactly what was heard. See ask-voice.ts for which way the
    browser hears.
  */
  const voiceBase = React.useRef("")
  const voiceTarget = React.useRef<string | null>(null)
  const typingFrame = React.useRef(0)
  const draftRef = React.useRef(draft)
  draftRef.current = draft
  const typeFrame = React.useCallback(() => {
    typingFrame.current = 0
    const target = voiceTarget.current
    if (target === null) return
    const next = typeToward(draftRef.current, target)
    draftRef.current = next
    setDraft(next)
    if (next !== target) typingFrame.current = requestAnimationFrame(typeFrame)
    /* Caught up after the recording ended: nothing more is coming. */ else if (voiceRef.current?.state === "idle") voiceTarget.current = null
  }, [])
  const voice = useVoiceInput({
    onText: (text) => {
      voiceTarget.current = withSpoken(voiceBase.current, text)
      if (!typingFrame.current) typingFrame.current = requestAnimationFrame(typeFrame)
    },
  })
  const listening = voice.state === "listening"
  const voiceRef = React.useRef(voice)
  voiceRef.current = voice
  /*
    A TICK AS THE MICROPHONE OPENS, AND ONE AS IT CLOSES. On the state the
    recorder is actually in, not on the press: a microphone that was refused
    never opened, and makes no sound saying it did.
  */
  const heardState = React.useRef(voice.state)
  React.useEffect(() => {
    const was = heardState.current
    heardState.current = voice.state
    if (voice.state === "listening" && was !== "listening") playAskSound("record-start")
    else if (was === "listening" && voice.state !== "listening") playAskSound("record-stop")
  }, [voice.state])
  /*
    The recording is over. Words heard live are already in the box, so what
    is left of them lands whole. A recording turned into text by the server
    (the iOS app records rather than hears) arrives in one piece, and types
    itself in like live words would, rather than appearing at once.
  */
  const lastVoiceState = React.useRef(voice.state)
  React.useEffect(() => {
    const was = lastVoiceState.current
    lastVoiceState.current = voice.state
    if (voice.state === "listening" || voice.state === "starting") return
    const target = voiceTarget.current
    if (target === null) return
    if (was === "transcribing") {
      if (!typingFrame.current && draftRef.current !== target) typingFrame.current = requestAnimationFrame(typeFrame)
      return
    }
    if (typingFrame.current) cancelAnimationFrame(typingFrame.current)
    typingFrame.current = 0
    voiceTarget.current = null
    if (target !== null) setDraft(target)
  }, [voice.state, typeFrame])
  /** Words still typing themselves in, taken whole: for Send, and for a person who starts typing. */
  const settleVoice = React.useCallback((): string | null => {
    const target = voiceTarget.current
    if (typingFrame.current) cancelAnimationFrame(typingFrame.current)
    typingFrame.current = 0
    voiceTarget.current = null
    return target
  }, [])
  React.useEffect(
    () => () => {
      if (typingFrame.current) cancelAnimationFrame(typingFrame.current)
    },
    [],
  )

  /** The model menu closes on any press outside it, as a menu does. On a phone it is a sheet, which closes itself. */
  const engineRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!engineOpen || phone) return
    const away = (event: PointerEvent) => {
      if (!engineRef.current?.contains(event.target as Node)) setEngineOpen(false)
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [engineOpen, phone])

  /* ── The dock: open, closed, where, and how it moves ─────────────────── */
  const dockRef = React.useRef<HTMLDivElement>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const pillSlotRef = React.useRef<HTMLDivElement>(null)
  const pillFlipRef = React.useRef<HTMLDivElement>(null)
  const pillRef = React.useRef<HTMLDivElement>(null)

  const openDock = React.useCallback(() => {
    setWanted(true)
    setExpanded(true)
  }, [])
  const collapseDock = React.useCallback(() => {
    setExpanded(false)
    setEngineOpen(false)
    const field = fieldRef.current
    if (field && document.activeElement === field) field.blur()
  }, [])

  /** The editor asking for the conversation: the Ask AI button on a section, or an answer to read. */
  const seenRequest = React.useRef(0)
  React.useEffect(() => {
    if (openRequest === seenRequest.current) return
    seenRequest.current = openRequest
    if (!dock) return
    openDock()
    requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
  }, [openRequest, dock, openDock])

  /* Closed, or the canvas showing something else: the conversation folds away with it. */
  React.useEffect(() => {
    if (!hidden && !suspended) return
    setExpanded(false)
    setEngineOpen(false)
    if (voiceRef.current.state !== "idle") voiceRef.current.cancel()
  }, [hidden, suspended])

  /*
    ESCAPE, OR A PRESS ANYWHERE ELSE, PUTS IT BACK TO THE PILL. What is open
    inside it goes first: the picture viewer handles its own Escape, then the
    model menu, a recording, the history, and only then the conversation.
    Nothing is lost: the thread, the draft and a running change all stay.
  */
  const viewingRef = React.useRef(false)
  React.useEffect(() => {
    if (!dock || !expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || viewingRef.current) return
      if (engineOpen) setEngineOpen(false)
      else if (voiceRef.current.state === "listening") voiceRef.current.cancel()
      else if (view === "history") setView("thread")
      else collapseDock()
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || viewingRef.current) return
      if (cardRef.current?.contains(target) || pillSlotRef.current?.contains(target)) return
      if (target.closest?.("[data-ask-keep]")) return
      collapseDock()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown, true)
    }
  }, [dock, expanded, engineOpen, view, collapseDock])

  /**
   * THE CANVAS'S BOX, MEASURED ONCE AND SHARED. The pill, the conversation
   * and the maximized size are all placed from it (dockGeometry), in the
   * same pixels the maximize animation measures. With a tablet's keyboard up
   * the box ends on the keyboard (`--kb-inset`, below), and this is where
   * the conversation learns it is shorter.
   */
  const [box, setBox] = React.useState<{ w: number; h: number; vh: number } | null>(null)
  useLayout(() => {
    if (!dock) return
    const el = dockRef.current
    if (!el) return
    const read = () => {
      const w = Math.round(el.clientWidth)
      const h = Math.round(el.clientHeight)
      const vh = window.innerHeight
      setBox((was) => (was && was.w === w && was.h === h && was.vh === vh ? was : { w, h, vh }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    window.addEventListener("resize", read)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", read)
    }
  }, [dock])

  /** The pill's height, which grows with pictures and long messages; the conversation keeps room for it. */
  const [pillHeight, setPillHeight] = React.useState(54)
  useLayout(() => {
    if (!dock) return
    const el = pillRef.current
    if (!el) return
    const read = () => setPillHeight(el.offsetHeight || 54)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [dock, box !== null])

  /*
    MAXIMIZE, MEASURED. The conversation takes its new size at once, and is
    then drawn from where it was to where it is with a transform (the FLIP
    technique): measure, change, invert, play. The words inside fade back in
    at the new size rather than being stretched on screen. Transform and
    opacity only; nothing on the canvas moves.
  */
  const flipFrom = React.useRef<{ surface: DOMRect; pill: DOMRect } | null>(null)
  const toggleMaximize = React.useCallback(() => {
    if (!dock) return
    const surface = surfaceRef.current
    const pill = pillFlipRef.current
    if (surface && pill && !reducedMotion && expanded) {
      flipFrom.current = { surface: surface.getBoundingClientRect(), pill: pill.getBoundingClientRect() }
    }
    setWanted(true)
    setExpanded(true)
    setMaximized((was) => !was)
  }, [dock, reducedMotion, expanded])
  useLayout(() => {
    const from = flipFrom.current
    flipFrom.current = null
    const surface = surfaceRef.current
    const pill = pillFlipRef.current
    const content = contentRef.current
    if (!from || !surface || !pill || !content) return
    const to = surface.getBoundingClientRect()
    const pillTo = pill.getBoundingClientRect()
    if (!to.width || !to.height) return
    surface.style.transition = "none"
    surface.style.transformOrigin = "0 0"
    surface.style.transform = `translate(${from.surface.left - to.left}px, ${from.surface.top - to.top}px) scale(${from.surface.width / to.width}, ${from.surface.height / to.height})`
    pill.style.transition = "none"
    pill.style.transform = `translateY(${from.pill.top - pillTo.top}px)`
    content.style.transition = "none"
    content.style.opacity = "0"
    void surface.offsetWidth
    surface.style.transition = `transform ${OPEN_MS}ms ${EASE}`
    surface.style.transform = ""
    pill.style.transition = `transform ${OPEN_MS}ms ${EASE}`
    pill.style.transform = ""
    content.style.transition = `opacity 180ms ease-out ${OPEN_MS - 150}ms`
    content.style.opacity = ""
  }, [maximized])

  /*
    THE SECTION'S TOOLBAR WINS. The selected section's toolbar sits at the
    top right of the section, and a section that starts near the bottom of
    the canvas puts it where the pill is. The toolbar is drawn above the pill
    either way, and the pill steps down out of sight while they overlap, so
    neither is half covered. Measured against the pill's slot, which does not
    move, so stepping away cannot itself end the overlap and start a flicker.
  */
  const [yielding, setYielding] = React.useState(false)
  React.useEffect(() => {
    if (!dock || expanded || hidden || suspended) {
      setYielding(false)
      return
    }
    let frame = 0
    const check = () => {
      frame = 0
      const slot = pillSlotRef.current
      const bar = document.querySelector<HTMLElement>(".wb-section-toolbar")
      if (!slot || !bar || getComputedStyle(bar).pointerEvents === "none") {
        setYielding(false)
        return
      }
      const a = slot.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      const m = 8
      setYielding(!(b.right < a.left - m || b.left > a.right + m || b.bottom < a.top - m || b.top > a.bottom + m))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    schedule()
    const later = [window.setTimeout(schedule, 120), window.setTimeout(schedule, 320)]
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      later.forEach((t) => window.clearTimeout(t))
      document.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
    }
  }, [dock, expanded, hidden, suspended, selectedSectionId, box])

  /* ── Conversations: the history, a new chat, closing ─────────────────── */
  const clearThread = React.useCallback(() => {
    seenExchanges.current = 0
    setExchanges([])
    setQueued(null)
    setWritten(null)
    setWriteError(null)
    setWriteReply(null)
  }, [])

  /*
    THE HISTORY IS THERE ONLY WHILE IT IS USED. Drawn off to the right and
    slid in on the frame after (two frames, so the off screen position has
    been painted and there is something to slide from), and taken away
    again once it has slid back out.
  */
  const openHistory = React.useCallback(() => {
    setEngineOpen(false)
    setHistoryMounted(true)
    setHistoryKey((k) => k + 1)
    if (reducedMotion) {
      setView("history")
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => setView("history")))
  }, [reducedMotion])
  React.useEffect(() => {
    if (view !== "thread" || !historyMounted) return
    const gone = window.setTimeout(() => setHistoryMounted(false), reducedMotion ? 0 : SLIDE_MS + 60)
    return () => window.clearTimeout(gone)
  }, [view, historyMounted, reducedMotion])

  const openConversation = React.useCallback(
    (target: HistoryTarget) => {
      setView("thread")
      if (target.kind === "one" && target.id === conversation.id && !conversation.earlier) return
      if (target.kind === "earlier" && conversation.earlier) return
      clearThread()
      setConversation(
        target.kind === "one" ? { id: target.id, title: target.title, earlier: false } : { id: null, title: "", earlier: true },
      )
      void load(target.kind === "one" ? target.id : "earlier")
    },
    [conversation.id, conversation.earlier, clearThread, load],
  )

  /** A fresh conversation. The one on screen stays in the history. */
  const newChat = React.useCallback(() => {
    if (busy || writing) return
    loadSeq.current++
    setLoadingHistory(false)
    setHistoryError((was) => (was === "not_set_up" ? was : null))
    clearThread()
    setConversation({ id: null, title: "", earlier: false })
    setView("thread")
    setDraft("")
    if (dock) requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
  }, [busy, writing, clearThread, dock])

  /** A conversation deleted from the history: the one on screen goes with it, and a new chat takes its place. */
  const onDeleted = React.useCallback(
    (target: DeletedTarget) => {
      const onScreen =
        target.kind === "all" ||
        (target.kind === "one" && target.id === conversation.id && !conversation.earlier) ||
        (target.kind === "earlier" && conversation.earlier)
      if (!onScreen || busy || writing) return
      loadSeq.current++
      setLoadingHistory(false)
      clearThread()
      setConversation({ id: null, title: "", earlier: false })
    },
    [conversation.id, conversation.earlier, busy, writing, clearThread],
  )

  /** Closing the chat. On a computer the pill goes too, until the bar's Ask AI brings it back. */
  const closeChat = React.useCallback(() => {
    setEngineOpen(false)
    setView("thread")
    if (dock) {
      setExpanded(false)
      setMaximized(false)
    }
    onClose()
  }, [dock, onClose])

  const startVoice = React.useCallback(() => {
    voiceBase.current = draft.trim()
    voiceTarget.current = null
    voice.clearError()
    if (dock) openDock()
    void voice.start()
  }, [draft, voice, dock, openDock])

  /*
    A SUGGESTION IS SENT, not copied into the box to be sent again. It is a
    whole request already ("Show my 3 newest products"), so a tap asks for
    it, in the mode the box is in, the same as an answer tapped under a
    question: whatever is typed in the box, and any pictures there, stay.
  */
  const pickSuggestion = React.useCallback(
    (text: string) => {
      if (dock) openDock()
      if (mode === "code") {
        if (!writing) void writeOne(text)
        return
      }
      if (busy) {
        setQueued(text)
        playAskSound("sent")
        return
      }
      void send(text)
    },
    [dock, openDock, mode, writing, writeOne, busy, send],
  )

  viewingRef.current = !!viewing
  const busyNow = busy || writing
  const isMax = dock && maximized
  const empty = draft.trim().length === 0 && readyPictures.length === 0
  /** The run going now, whose line the folded pill shows. */
  const runningExchange = busy ? exchanges.find((e) => e.running) : undefined
  const pillLine =
    runningExchange && dock && !expanded
      ? activityLine(runningExchange.activity, runningExchange.startedAt === undefined ? READING_MS : performance.now() - runningExchange.startedAt)
      : null
  /** The newest run once it is over. */
  const latest = exchanges[exchanges.length - 1]
  const lastRun = latest && !latest.running ? latest : undefined
  /** It stopped on a question nobody has answered yet: the next message is the answer. */
  const openQuestion = lastRun?.activity.question ? lastRun : undefined
  /*
    SEEN, once the conversation it ended in is open (a phone's sheet always
    is). Until then the folded pill says what it did in the run's own
    sentence, or asks its question: a run that ends while the pill is folded
    otherwise ends without a word.
  */
  const lastRunId = lastRun?.id
  React.useEffect(() => {
    if (lastRunId && (!dock || expanded)) setSeenRun(lastRunId)
  }, [lastRunId, dock, expanded])
  const foldedLine =
    dock && !expanded && lastRun && lastRun.id !== seenRun
      ? (lastRun.activity.question?.question ?? detailToShow(undefined, lastRun.activity.done))
      : null
  const placeholder = listening
    ? "Listening…"
    : voice.state === "transcribing"
      ? "Writing it out…"
      : dock && !expanded && writing
        ? `${writeLabel ?? "Writing the section"}…`
        : pillLine
          ? `${pillLine}…`
          : foldedLine
            ? foldedLine
            : mode === "code"
              ? "Describe a section"
              : busy
                ? "Ask for the next change"
                : attached.length
                  ? "Add a note, or just send"
                  : openQuestion
                    ? "Or type your answer"
                    : exchanges.length
                      ? "Continue the conversation"
                      : "Ask for a change"

  /* Undo is offered on the newest run that changed this page, while this is still the page. */
  const undoable = React.useMemo(() => {
    if (!onUndoRun) return null
    for (let i = exchanges.length - 1; i >= 0; i--) {
      const e = exchanges[i]
      if (e.running) return null
      if (!e.runId && !e.undone) continue
      if (e.undone || e.page !== page || e.activity.code.length > 0) return null
      return e.id
    }
    return null
  }, [exchanges, onUndoRun, page])

  /* ── The pieces, drawn once and placed by the variant below ──────────── */
  const iconButton = cn(
    "relative flex shrink-0 items-center justify-center rounded-full text-[#1a1a2e]/65 transition-[background-color,color,opacity] duration-150",
    "hover:bg-black/[0.05] hover:text-[#1a1a2e] active:bg-black/[0.08] disabled:pointer-events-none disabled:opacity-35",
    phone ? "h-11 w-11" : "h-8 w-8",
  )
  const roundButton = cn(
    "relative flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,opacity,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-40",
    phone ? "h-11 w-11" : "h-9 w-9",
  )
  const quietRound = cn(roundButton, "text-[#1a1a2e]/70 hover:bg-black/[0.05] hover:text-[#1a1a2e] active:bg-black/[0.08]")
  const slide = (transform: string, opacity: number): React.CSSProperties => ({
    transform,
    opacity,
    transition: reducedMotion ? "none" : `transform ${SLIDE_MS}ms ${EASE}, opacity ${SLIDE_MS}ms ${EASE}`,
  })

  /* ── Where the dock is, read once for the pill's faces and the layout below ── */
  const g = dock && box ? dockGeometry(box.w, box.h, maximized, box.vh) : null
  const showPill = dock && !hidden && !suspended && g !== null
  const cardOpen = expanded && showPill
  const pillAway = !showPill || (yielding && !cardOpen)
  /** True for the length of the close, so the conversation keeps its layer until it is put away. */
  const [cardLeaving, setCardLeaving] = React.useState(false)
  const cardWasOpen = React.useRef(false)
  useLayout(() => {
    const was = cardWasOpen.current
    cardWasOpen.current = cardOpen
    if (cardOpen || !was || reducedMotion) {
      setCardLeaving(false)
      return
    }
    setCardLeaving(true)
    /* The fallback for a transitionend that never comes (a hidden tab, an interrupted move). */
    const done = window.setTimeout(() => setCardLeaving(false), CLOSE_MS + 80)
    return () => window.clearTimeout(done)
  }, [cardOpen, reducedMotion])
  /*
    IN AND OUT, IN TWO PARTS. `lift` moves a layer on transform, and hides it
    once it is away so nothing in it can be reached; `appear` fades a layer on
    its own opacity. Kept apart because a glass layer has to carry its own
    opacity: fading an element around it would switch its blur off for the
    length of the fade (the Backdrop Root), and on at the end with a jump.
  */
  const lift = (shown: boolean, away: string, openMs = OPEN_MS, closeMs = CLOSE_MS): React.CSSProperties => ({
    transform: shown ? "none" : away,
    visibility: shown ? "visible" : "hidden",
    pointerEvents: shown ? "auto" : "none",
    transition: reducedMotion
      ? "none"
      : shown
        ? `transform ${openMs}ms ${EASE}, visibility 0s`
        : `transform ${closeMs}ms ${CLOSE_EASE}, visibility 0s linear ${closeMs}ms`,
  })
  /*
    THE CONVERSATION, IN AND OUT. One element moves and fades: the iOS curve
    in, a quicker ease in out. It stays in the page the whole time and is
    only hidden once the close has finished (visibility waits for it), so
    closing is never an instant unmount. will-change is on while it is open
    and for the length of the close, so the layer is not rebuilt at either
    end of the move, and off once it is put away.
  */
  const cardMotion = (shown: boolean): React.CSSProperties => ({
    transform: shown ? "none" : "translate3d(0, 12px, 0) scale(0.97)",
    opacity: shown ? 1 : 0,
    visibility: shown ? "visible" : "hidden",
    pointerEvents: shown ? "auto" : "none",
    willChange: shown || cardLeaving ? "transform, opacity" : "auto",
    transition: reducedMotion
      ? "none"
      : shown
        ? `transform ${OPEN_MS}ms ${EASE}, opacity ${Math.round(OPEN_MS * 0.6)}ms ease-out, visibility 0s`
        : `transform ${CLOSE_MS}ms ${CLOSE_EASE}, opacity ${CLOSE_MS}ms ${CLOSE_EASE}, visibility 0s linear ${CLOSE_MS}ms`,
  })
  const appear = (shown: boolean, openMs = OPEN_MS, closeMs = CLOSE_MS): React.CSSProperties => ({
    opacity: shown ? 1 : 0,
    transition: reducedMotion ? "none" : shown ? `opacity ${Math.round(openMs * 0.66)}ms ease-out` : `opacity ${closeMs - 40}ms ${CLOSE_EASE}`,
  })

  const header = (
    <div data-ask-header="" className={cn("flex shrink-0 items-center gap-0.5", phone ? "h-[52px] px-1.5" : "h-12 px-2.5")}>
      {view === "history" ? (
        <>
          <button type="button" onClick={() => setView("thread")} aria-label="Back to the conversation" className={iconButton}>
            <ChevronLeft className="h-[19px] w-[19px]" strokeWidth={1.9} />
          </button>
          <span data-ask-title="" className="min-w-0 flex-1 truncate pl-1 text-[14px] font-semibold text-[#1a1a2e]">
            Chats
          </span>
        </>
      ) : phone ? (
        /*
          ON A PHONE THE NAME IS THE WAY IN. The chat's name with a chevron,
          which opens the list of chats, as a phone's chat apps do: one
          control where a computer has two, so Connect AI fits beside it on
          a 360px screen and the name is still readable.
        */
        <button
          type="button"
          data-ask-history-button=""
          onClick={openHistory}
          aria-label="Conversation history"
          title="Conversation history"
          className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-full pl-2.5 pr-2 text-left transition-colors hover:bg-black/[0.05] active:bg-black/[0.08]"
        >
          <span data-ask-title="" className="min-w-0 truncate text-[14px] font-medium text-[#1a1a2e]">
            {conversation.title || "Ask Storelib"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#1a1a2e]/55" strokeWidth={2.2} />
        </button>
      ) : (
        <>
          <button
            type="button"
            data-ask-history-button=""
            onClick={openHistory}
            aria-label="Conversation history"
            title="Conversation history"
            className={cn(iconButton, "w-auto gap-0.5 px-2")}
          >
            <History className="h-[17px] w-[17px]" strokeWidth={1.8} />
            <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2.2} />
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2 pl-1.5">
            <StorelibMark className="h-4 w-4 shrink-0 rounded-[4px]" />
            <span data-ask-title="" className="min-w-0 truncate text-[14px] font-medium text-[#1a1a2e]">
              {conversation.title || "Ask Storelib"}
            </span>
          </span>
        </>
      )}
      {onConnectAi && (
        <span className={cn("flex shrink-0 items-center", phone ? "pl-1 pr-0.5" : "pl-1 pr-1.5")}>
          <ConnectAiButton phone={phone} onClick={onConnectAi} />
        </span>
      )}
      <button
        type="button"
        data-ask-new=""
        onClick={newChat}
        disabled={busyNow}
        aria-label="New chat"
        title={busyNow ? "Available when this change finishes" : "New chat"}
        className={iconButton}
      >
        <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </button>
      {dock && (
        <button
          type="button"
          data-ask-maximize=""
          onClick={toggleMaximize}
          aria-label={isMax ? "Restore size" : "Maximize"}
          aria-pressed={isMax}
          title={isMax ? "Restore size" : "Maximize"}
          className={iconButton}
        >
          {isMax ? <Minimize2 className="h-4 w-4" strokeWidth={1.8} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.8} />}
        </button>
      )}
      <button type="button" data-ask-close="" onClick={closeChat} aria-label="Close chat" title="Close chat" className={iconButton}>
        <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
    </div>
  )

  const idle = !busyNow
  const threadPane = (
    <div
      data-ask-view="thread"
      aria-hidden={view === "history" || undefined}
      inert={view === "history"}
      className="absolute inset-0 flex min-w-0 flex-col"
      style={slide(view === "history" ? "translateX(-24%)" : "none", view === "history" ? 0 : 1)}
    >
      {/*
        THE THREAD SCROLLS ONE WAY. Up and down, never sideways: x is hidden,
        a word or a URL longer than the line breaks where it has to
        (`overflow-wrap: anywhere`), and a finger here pans vertically only.
        Code blocks scroll sideways inside themselves. Measured by
        scripts/check-chat-keyboard.mjs.
      */}
      <div
        ref={threadRef}
        data-chat-thread=""
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 [overflow-wrap:anywhere] [touch-action:pan-y]"
      >
        <div className={cn("flex min-h-full min-w-0 flex-col", dock && maximized && "mx-auto max-w-[720px]")}>
          {/*
            WHAT THIS DATABASE CANNOT KEEP YET, said once, above the thread.
            Before the update nothing is lost quietly: the creator knows a
            reload will not bring this chat, or its pictures, back.
          */}
          {!keeping.chat ? (
            <p data-ask-not-set-up="chat" className="mb-3 text-[12.5px] leading-snug text-[#6b7280]">
              Chats are not saved yet. They are kept once the database update is run.
            </p>
          ) : historyError === "not_set_up" ? (
            <p data-ask-not-set-up="" className="mb-3 text-[12.5px] leading-snug text-[#6b7280]">
              History turns on once the database update is run. Until then your messages here are kept as one chat.
            </p>
          ) : null}
          {keeping.chat && !keeping.pictures && (
            <p data-ask-not-set-up="pictures" className="mb-3 text-[12.5px] leading-snug text-[#6b7280]">
              Pictures show here until you leave. They are kept once the database update is run.
            </p>
          )}
          {loadingHistory ? (
            <p className="flex items-center gap-2 text-[13px] text-[#6b7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </p>
          ) : historyError === "read_failed" ? (
            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] px-3 py-2.5">
              <p className="text-[13px] font-medium text-[#1a1a2e]">This chat could not be loaded.</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#6b7280]">Nothing is lost. You can still ask for a change.</p>
            </div>
          ) : exchanges.length === 0 ? (
            /* Empty: nothing to read, so only what to ask, down by the box you type it in. */
            <div data-ask-empty="" className="mt-auto">
              <SuggestionChips items={suggestions} onPick={pickSuggestion} phone={phone} />
            </div>
          ) : (
            <>
              <ul className="space-y-5">
                {exchanges.map((exchange, index) => (
                  <ExchangeItem
                    key={exchange.id}
                    exchange={exchange}
                    answer={exchanges[index + 1]?.prompt}
                    phone={phone}
                    canUndo={exchange.id === undoable}
                    canRetry={idle}
                    onRetry={retry}
                    onUndo={undoRun}
                    onView={viewImages}
                    onOpenCode={onOpenCodeEditor}
                    onReport={reportOne}
                    onAnswer={answerQuestion}
                  />
                ))}
                {queued && (
                  <li className="flex items-start gap-2 text-[12.5px] text-[#6b7280]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b7280]/50" />
                    <span>
                      Up next: <span className="text-[#1a1a2e]/75">{queued}</span>
                    </span>
                  </li>
                )}
              </ul>
              {/* What to ask next, once this answer is in. Not under a question: its answers are the next thing to tap. */}
              {idle && !queued && !openQuestion && (
                <SuggestionChips items={suggestions} onPick={pickSuggestion} phone={phone} className="mt-5" />
              )}
            </>
          )}
          {/* Room for the composer while a keyboard has lifted it over the thread's end: `--sheet-keys`, 0 otherwise. */}
          {phone && <div ref={keysRoomRef} aria-hidden data-ask-keys-room="" className="shrink-0" style={{ height: "var(--sheet-keys, 0px)" }} />}
        </div>
      </div>
    </div>
  )

  /* The history, off to the right until it is asked for, then slid in over the thread. */
  const historyPane = historyMounted && (
    <div
      data-ask-view="history"
      aria-hidden={view !== "history" || undefined}
      inert={view !== "history"}
      className="absolute inset-0 min-w-0"
      style={slide(view === "history" ? "none" : "translateX(100%)", view === "history" ? 1 : 0)}
    >
      <div className={cn("h-full", dock && maximized && "mx-auto max-w-[720px]")}>
        <AskHistory
          installId={installId}
          refreshKey={historyKey}
          current={{ id: conversation.id, earlier: conversation.earlier }}
          locked={busyNow}
          phone={phone}
          onOpen={openConversation}
          onDeleted={onDeleted}
        />
      </div>
    </div>
  )

  /* Wraps like the thread: a long path in "is saved as", or a URL in a
     reply to the writer, breaks where it has to rather than running out of
     the panel under the clipped x axis. */
  const tray = (
    <div data-ask-tray="" className={cn("min-w-0 [overflow-wrap:anywhere]", dock && maximized && "mx-auto max-w-[720px]")}>
      {/* What the writer produced, or why it could not. */}
      {written && (
        <div className="mb-2 rounded-xl border border-[#e5e7eb] bg-white p-3">
          <p className="text-[13px] font-medium text-[#1a1a2e]">
            {written.placed ? `${written.name} is on the page` : `${written.name} is written`}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#6b7280]">
            Saved as <span className="font-mono text-[12px]">{written.path}</span>.{" "}
            {written.placed ? "It goes live when you publish." : "Add it from Add Section, under Created."}
          </p>
          {onOpenCodeEditor && (
            <button
              type="button"
              onClick={() => onOpenCodeEditor(written.path)}
              className="mt-2 h-8 rounded-full bg-[#1a1a2e] px-3 text-[12.5px] font-medium text-white"
            >
              Open the code
            </button>
          )}
        </div>
      )}

      {/* It answered rather than wrote: the question, then the answer. */}
      {writeReply && !writing && (
        <div className="mb-2 space-y-1.5 rounded-xl border border-[#e5e7eb] bg-white p-3">
          <p className="text-[12.5px] text-[#6b7280]">{writeReply.prompt}</p>
          <p className="text-[13px] leading-relaxed text-[#1a1a2e]">{writeReply.text}</p>
        </div>
      )}

      {writeError && !writing && (
        <div className="mb-2 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-[12.5px] leading-snug text-[#1a1a2e]">{writeError}</p>
          {lastWrite.current && (
            <button
              type="button"
              onClick={() => {
                const again = lastWrite.current
                if (again) void writeOne(again.prompt, again.images)
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] text-[#1a1a2e]/75 transition-colors hover:border-[#1a1a2e]/25 hover:text-[#1a1a2e]"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
              Try again
            </button>
          )}
        </div>
      )}

      {/* What the writer is doing while it does it, from the server's reports. */}
      {writing && writeLabel && <ActivityLine label={writeLabel} className="mb-2 px-0.5" />}

      {voice.error && (
        <p data-ask-voice-error="" role="alert" className="mb-2 flex items-start gap-1.5 px-0.5 text-[12.5px] leading-snug text-[#b45309]">
          <TriangleAlert className="mt-[3px] h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1">
            {voice.error}
            {/* A refusal in the app: one tap to the switch that undoes it. */}
            {voice.canOpenSettings && (
              <button
                type="button"
                data-ask-voice-settings=""
                onClick={() => {
                  voice.clearError()
                  voice.openSettings()
                }}
                className="relative ml-1 font-medium text-[#1a1a2e] underline underline-offset-2 after:absolute after:-inset-2 after:content-['']"
              >
                Open Settings
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={voice.clearError}
            aria-label="Dismiss"
            className="relative -my-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#6b7280] after:absolute after:-inset-3 after:content-[''] hover:text-[#1a1a2e]"
          >
            <X className="h-3 w-3" strokeWidth={2.25} />
          </button>
        </p>
      )}

      {/*
        ═════════════════════════════════════════════════════════════════════
         THE TWO THINGS IT DOES, ALWAYS REACHABLE, ON ONE ROW
        ═════════════════════════════════════════════════════════════════════
        Changing this page and writing a new kind of section are different
        acts with different answers, and "add a comparison table" is a
        sentence that could mean either. So it asks, beside the box you type
        into, and the scope of a change sits on the same row. Two words a
        side, so the row is one row on a 360px phone (measured by
        scripts/check-ask-dock.mjs).
      */}
      <div data-ask-mode-row="" className="mb-2 flex min-w-0 flex-nowrap items-center gap-2">
        <ModeSwitch
          mode={mode}
          onChange={(key) => {
            setMode(key)
            setWriteError(null)
          }}
          phone={phone}
          reducedMotion={reducedMotion}
        />
        {selectedSection && mode === "change" && (
          <ScopeChip
            name={selectedSection.name}
            locked={locked}
            onLock={() => setLockOn(true)}
            onUnlock={() => setLockOn(false)}
            phone={phone}
          />
        )}
      </div>
    </div>
  )

  /*
    WHICH MODEL, where the message is written: it is a per-message decision
    ("this one is hard, use Opus"), and a choice buried two screens away is
    one nobody makes. While a recording runs, its clock sits in the same
    place, over the model's button, so nothing on the row moves.
  */
  const modelSlot = (
    <div ref={engineRef} className="relative shrink-0">
      <div className={cn(listening && "invisible")}>
        <ModelPicker
          engines={ENGINES}
          value={engine}
          onChange={chooseEngine}
          open={engineOpen}
          onOpenChange={setEngineOpen}
          phone={phone}
          sounds={sounds}
          onSoundsChange={chooseSounds}
          own={ownByEngine}
          onOwnAi={onConnectAi}
        />
      </div>
      {listening && (
        <span
          data-ask-voice-clock=""
          role="timer"
          aria-label={`Recording, ${clock(voice.seconds)}`}
          className="absolute inset-0 flex items-center justify-center gap-1.5 text-[12.5px] tabular-nums text-[#1a1a2e]/80"
        >
          <span aria-hidden className="ask-rec-dot h-2 w-2 rounded-full bg-[#dc2626]" />
          {clock(voice.seconds)}
        </span>
      )}
    </div>
  )

  /*
    THE PICKER OFFERS WHAT THE MODEL READS, AND VIDEO. Not HEIC by name: an
    iPhone converts a HEIC photo to JPEG itself when the picker does not ask
    for HEIC, which is the surest conversion there is. A HEIC dropped or
    pasted on a computer is converted here instead (ask-attach-prepare.ts).
  */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={[...ALLOWED_IMAGE_TYPES, "video/*"].join(",")}
      multiple
      className="hidden"
      onChange={(event) => {
        void attach(event.target.files)
        /* So choosing the same file twice in a row still fires. */
        event.target.value = ""
      }}
    />
  )

  const attachButton = (
    <button
      type="button"
      data-ask-attach=""
      onClick={() => {
        if (dock) openDock()
        fileInputRef.current?.click()
      }}
      disabled={attached.length >= MAX_IMAGES}
      aria-label="Attach pictures or a video"
      title={attached.length >= MAX_IMAGES ? `${MAX_IMAGES} pictures is the most one message can carry` : "Attach pictures or a video"}
      className={cn(quietRound, dock && "border border-black/[0.06] bg-white/60")}
    >
      <Paperclip className="h-4 w-4" strokeWidth={1.9} />
    </button>
  )

  const micButton = voice.supported && (
    <button
      type="button"
      data-ask-mic={voice.state}
      onClick={() => (voice.state === "idle" ? startVoice() : voice.stop())}
      disabled={voice.state === "starting" || voice.state === "transcribing"}
      aria-label={listening ? "Stop recording" : "Speak instead of typing"}
      aria-pressed={listening}
      title={listening ? "Stop, and keep what was said" : "Speak instead of typing"}
      className={cn(
        quietRound,
        dock && !listening && "border border-black/[0.06] bg-white/60",
        listening && "bg-[#1a1a2e] text-white hover:bg-[#1a1a2e] hover:text-white",
      )}
    >
      {listening && <span aria-hidden className="ask-listen-ring" />}
      {voice.state === "starting" || voice.state === "transcribing" ? (
        <Loader2 className="relative h-4 w-4 animate-spin" />
      ) : listening ? (
        <Square className="relative h-3 w-3 fill-current" />
      ) : (
        <Mic className="relative h-4 w-4" strokeWidth={1.9} />
      )}
    </button>
  )

  const stopButton = busy && (
    <button
      type="button"
      data-ask-stop=""
      onClick={() => abortRef.current?.abort()}
      aria-label="Stop"
      title="Stop"
      className={cn(quietRound, "border border-[#e5e7eb] bg-white")}
    >
      <Square className="h-2.5 w-2.5 fill-current" />
    </button>
  )

  /** What Send sends: the box, or the whole of what was heard when it is still typing itself in. */
  const takeDraft = () => {
    const spoken = settleVoice()
    if (voiceRef.current.state === "listening") voiceRef.current.cancel()
    return spoken ?? draft
  }

  const sendButton = (
    <button
      type="button"
      data-ask-send=""
      onClick={() => submit(takeDraft())}
      disabled={(draft.trim().length === 0 && attached.length === 0) || preparing}
      aria-label={busy ? "Queue" : "Send"}
      title={preparing ? "Waiting for the pictures to be ready" : undefined}
      className={cn(
        roundButton,
        "disabled:opacity-100",
        empty || preparing ? "bg-black/[0.06] text-black/30" : "bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90",
      )}
    >
      <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
    </button>
  )

  /*
    NOT `disabled` while a run is going. Waiting for a spinner before you
    are allowed to type your next thought is the difference between a
    conversation and a form. Enter during a run queues it instead.
  */
  const field = (
    <textarea
      ref={fieldRef}
      rows={1}
      value={draft}
      aria-label="Message Storelib AI"
      onChange={(event) => {
        /* A person typing takes the box back from words still typing themselves in. */
        if (voiceTarget.current !== null && !listening) settleVoice()
        setDraft(event.target.value)
      }}
      onFocus={dock ? openDock : undefined}
      /*
        ON A PHONE THE TAP THAT OPENS THE KEYBOARD FOCUSES WITHOUT A SCROLL.
        Left to itself, a tap on a box at the bottom of the screen makes the
        browser scroll whatever it can to bring the box above where the
        keyboard will be, before any code here can say the composer is about
        to ride up by itself. So a plain tap on the box (not a scroll that
        started on it, and not a tap on a box that already has the caret)
        is answered here: its default is cancelled and the box is focused
        with `preventScroll`, which still brings the keyboard up because it
        happens inside the tap. The sheet holds the document where it was
        for anything that scrolls it anyway (mobile-editor-sheet.tsx).
      */
      onTouchStart={
        phone
          ? (event) => {
              const t = event.touches[0]
              fieldTap.current = t ? { x: t.clientX, y: t.clientY } : null
            }
          : undefined
      }
      onTouchEnd={
        phone
          ? (event) => {
              const start = fieldTap.current
              fieldTap.current = null
              const el = event.currentTarget
              const t = event.changedTouches[0]
              if (!start || !t || document.activeElement === el || !event.cancelable) return
              if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP_PX) return
              event.preventDefault()
              el.focus({ preventScroll: true })
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          submit(takeDraft())
        }
      }}
      /** A screenshot goes to the clipboard; this is where it lands. */
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files)
        if (files.length === 0) return
        event.preventDefault()
        void attach(files)
      }}
      placeholder={placeholder}
      enterKeyHint="send"
      className={cn(
        "block w-full resize-none bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#6b7280]/80 placeholder:truncate",
        phone ? "min-h-[44px] px-1.5 py-[11px] text-[16px] leading-[22px]" : "min-h-[40px] py-[9px] text-[14px] leading-[22px]",
      )}
    />
  )

  const thumbnails = (
    <PictureTray
      items={attached}
      onRemove={removeAttachment}
      onRetry={retryPicture}
      onOpen={(id) => {
        const ready = attached.filter((a) => a.url)
        const at = ready.findIndex((a) => a.id === id)
        if (at >= 0) setViewing({ images: ready, at })
      }}
    />
  )

  const attachProblemLine = attachError && (
    <p data-ask-attach-error="" role="alert" className="flex items-start gap-1.5 px-4 pt-2 text-[12px] leading-snug text-[#b45309]">
      <span className="min-w-0 flex-1">{attachError}</span>
      <button
        type="button"
        onClick={() => setAttachError(null)}
        aria-label="Dismiss"
        className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-3 after:content-[''] hover:text-[#1a1a2e]"
      >
        <X className="h-3 w-3" strokeWidth={2.25} />
      </button>
    </p>
  )

  const composer = (
    <div
      data-chat-composer=""
      className={cn(
        "relative min-w-0",
        dock
          ? "rounded-[27px]"
          : "rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors focus-within:border-[#1a1a2e]/25",
      )}
      /**
       * A drop anywhere on the composer, not just on the button. The
       * dragover has to be cancelled or the browser opens the file
       * instead, which loses whatever was typed.
       */
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        void attach(event.dataTransfer.files)
      }}
    >
      {dock && (
        <>
          {/*
            The pill's two faces: near solid white over the canvas, plain
            white as the conversation's input row. Folded it is 95% white
            over a light 10px blur, so it reads over a dark page as well as
            a white one; a hairline of ink for its edge; and three soft
            shadows of the page's own ink (close, middle, far) for depth.
            Nothing outside it is lighter than the page: no glow.
          */}
          <span
            aria-hidden
            data-ask-glass=""
            className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#1a1a2e]/[0.08] bg-white/[0.95] shadow-[0_0_0_1px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-8px_rgba(15,23,42,0.16),0_22px_44px_-20px_rgba(15,23,42,0.24)] backdrop-blur-[10px] backdrop-saturate-[1.2]"
            style={appear(!expanded && !pillAway, 280, 200)}
          />
          <span
            aria-hidden
            data-ask-solid=""
            className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.16)]"
            style={appear(expanded && !pillAway, 280, 200)}
          />
        </>
      )}
      <div className="relative min-w-0" style={dock ? appear(!pillAway, 280, 200) : undefined}>
        {thumbnails}
        {attachProblemLine}
        {fileInput}
        {dock ? (
          <div className="flex min-w-0 items-end gap-1.5 py-[7px] pl-5 pr-[7px]">
            <div className="min-w-0 flex-1">{field}</div>
            {modelSlot}
            {attachButton}
            {micButton}
            {stopButton}
            {sendButton}
          </div>
        ) : (
          <>
            <div className="px-2 pt-0.5">{field}</div>
            <div className="flex min-w-0 items-center gap-0.5 px-1 pb-1">
              {modelSlot}
              <span className="min-w-0 flex-1" />
              {attachButton}
              {micButton}
              {stopButton}
              {sendButton}
            </div>
          </>
        )}
      </div>
    </div>
  )

  /*
    WHAT A DROP WILL DO, while the file is still in the air. Without it the
    gesture is something you either already know about or never find.
  */
  const dropTarget = dragging && (
    <div data-drop-target="" className="pointer-events-none absolute inset-2 z-[120] flex flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-[#1a1a2e]/25 bg-white/90">
      <ImagePlus className="h-6 w-6 text-[#1a1a2e]/60" strokeWidth={1.75} />
      <p className="text-[13px] font-medium text-[#1a1a2e]">Drop pictures or a video</p>
    </div>
  )

  /*
    The viewer is fixed to the window, and a fixed element inside anything
    with a transform or a backdrop filter is fixed to THAT instead. The dock
    has both, so the viewer is drawn in the body.
  */
  const viewer =
    viewing && typeof document !== "undefined"
      ? createPortal(
          <div data-ask-keep="">
            <ImageViewer images={viewing.images} startAt={viewing.at} onClose={() => setViewing(null)} />
          </div>,
          document.body,
        )
      : null

  /**
   * DROPPING WORKS ANYWHERE ON THE PANEL, not only on the composer. The
   * counter is why: dragenter and dragleave fire for every child the
   * pointer crosses, so a boolean would blink off on the way past the
   * thread and the target would flicker down the whole panel.
   */
  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return
      dragDepth.current += 1
      setDragging(true)
      if (dock) openDock()
    },
    onDragOver: (event: React.DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault()
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event: React.DragEvent) => {
      if (!event.dataTransfer.files.length) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      void attach(event.dataTransfer.files)
    },
  }

  if (!dock) {
    return (
      <div
        /*
          `min-h-0 flex-1` so that inside the phone sheet this column is the
          room the sheet leaves above its padding, which is the keyboard when
          one is up: the thread is the part that gives, and the composer ends
          on the keys. `min-w-0` and a clipped x axis so nothing in here can be
          wider than the panel, or scrolled sideways by script.
        */
        className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background [overflow-x:clip]"
        data-ask-sheet=""
        /*
          THE PAGE PANNED, SO THE CONVERSATION FOLLOWS IT DOWN. When iOS pans
          the visible area down the page to show the field anyway, the sheet
          (fixed) is left behind with its header above the screen. The whole
          column is moved down by exactly the pan, which the sheet reads from
          the same viewport in the same frame (`--sheet-pan`): a transform,
          so nothing inside is laid out again. Zero, and so nothing, with no
          keyboard and on every platform that does not pan.
        */
        style={{ transform: "translate3d(0, var(--sheet-pan, 0px), 0)" }}
        {...dropHandlers}
      >
        {dropTarget}
        {viewer}
        {header}
        <div data-ask-body="" className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {threadPane}
          {historyPane}
        </div>
        {/*
          ═══════════════════════════════════════════════════════════════════
           THE COMPOSER RIDES THE KEYBOARD, AND NOTHING ELSE MOVES
          ═══════════════════════════════════════════════════════════════════
          The sheet used to make room for a keyboard by growing and padding
          itself, which laid the whole thread out again on every frame iOS
          reported the keyboard moving: the thread jumped as it opened, and
          as it closed the padding went a beat before the keys did and left
          a band of white where the thread should have been. The owner's
          screen recording showed both.

          Now the sheet is a "composer" sheet (mobile-editor-sheet.tsx): it
          keeps its size and its place, and says how far the keyboard
          reaches into it as `--sheet-keys`. This row, the mode switch and
          the box, is moved up by exactly that on a transform, over the
          keyboard's own quarter second, and the thread keeps its height. At
          the end of the thread a spacer of the same height lets its newest
          line be scrolled clear of the composer (see `keysRoomRef`).

          ABOVE THE THREAD, WITH A LITTLE DEPTH. It is drawn over the thread
          (the thread scrolls under it, and the keyboard lifts it over the
          thread's last lines), so it has the panel's own background and a
          soft shadow up onto the thread, with a hairline, rather than
          sitting flat against the words.
        */}
        <div
          data-ask-footer=""
          className="relative z-[1] min-w-0 shrink-0 bg-background px-2.5 pb-2.5 pt-2 shadow-[0_-1px_0_rgba(15,23,42,0.05),0_-10px_22px_-14px_rgba(15,23,42,0.22)]"
          style={{
            transform: "translate3d(0, calc(-1 * var(--sheet-keys, 0px)), 0)",
            transition: reducedMotion ? "none" : `transform ${KEYBOARD_RIDE_MS}ms ${EASE}`,
          }}
        >
          {tray}
          {composer}
        </div>
      </div>
    )
  }

  /* ── The dock ─────────────────────────────────────────────────────────
     Its geometry (g, showPill, cardOpen, pillAway) and the two halves of
     its motion (lift, appear) are read above, with the pill's faces. */

  return (
    <div
      ref={dockRef}
      data-ask-dock=""
      data-state={!showPill ? "hidden" : cardOpen ? "open" : "pill"}
      data-maximized={maximized ? "true" : "false"}
      className={cn("pointer-events-none absolute inset-x-0 top-0", cardOpen ? "z-40" : "z-20")}
      /*
        ON A KEYBOARD. A tablet's on screen keyboard covers the bottom of the
        canvas, and the pill with it. The box ends where the keyboard begins
        (`--kb-inset`, published once by ViewportVars from visualViewport, and
        0 wherever there is no such keyboard), so the pill sits just above the
        keys and the conversation shrinks to fit, measured by the observer
        above. Nothing on the canvas moves.
      */
      style={{ bottom: "var(--kb-inset, 0px)" }}
      {...dropHandlers}
    >
      {viewer}
      {g && box && (
        <>
          {/* The conversation, above the pill. */}
          <div
            ref={cardRef}
            data-ask-card=""
            aria-hidden={!cardOpen || undefined}
            inert={!cardOpen}
            className="absolute"
            style={{
              left: (box.w - g.cardW) / 2,
              bottom: g.cardBottom,
              width: g.cardW,
              height: g.cardH,
              transformOrigin: "50% 100%",
              ...cardMotion(cardOpen),
            }}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "transform" && !cardOpen) setCardLeaving(false)
            }}
          >
            {/*
              READABLE FIRST. The open conversation is solid white, so the
              page's colours never show behind the words, with a hairline and
              three soft shadows for depth. No backdrop filter: a blur under
              an opaque surface costs a full repaint of the canvas behind it
              on every frame of the open and shows nothing.
            */}
            <div
              ref={surfaceRef}
              data-ask-surface=""
              className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-[#1a1a2e]/[0.07] bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.03),0_2px_6px_rgba(15,23,42,0.05),0_12px_28px_-10px_rgba(15,23,42,0.16),0_32px_72px_-24px_rgba(15,23,42,0.3)]"
            >
              {dropTarget}
              <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
                {header}
                <div data-ask-body="" className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                  {threadPane}
                  {historyPane}
                </div>
                <div className="shrink-0 px-4 pt-1">{tray}</div>
                {/* Room for the pill, which sits over this. */}
                <div aria-hidden className="shrink-0" style={{ height: pillHeight + DOCK_PAD + 6 }} />
              </div>
            </div>
          </div>

          {/* The pill. Its slot never moves, which is what the toolbar check measures. */}
          <div
            ref={pillSlotRef}
            data-ask-pill-slot=""
            className="absolute"
            style={{ left: (box.w - g.pillW) / 2, bottom: g.pillBottom, width: g.pillW }}
          >
            {/* Moved on transform only: the glass inside fades itself (see the pill's faces). */}
            <div data-ask-pill-state={pillAway ? "away" : "shown"} style={lift(!pillAway, "translateY(14px) scale(0.98)", 280, 200)}>
              <div ref={pillFlipRef}>
                <div
                  ref={pillRef}
                  data-ask-pill=""
                  onPointerDown={(event) => {
                    if (expanded) return
                    openDock()
                    const target = event.target as HTMLElement
                    if (!target.closest("button, textarea, input")) {
                      requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
                    }
                  }}
                >
                  {composer}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** A layout effect in the browser and a plain one where there is no layout, on the server. */
const useLayout = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
