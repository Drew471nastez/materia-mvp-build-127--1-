"use client"

/**
 * ===========================================================================
 *  THE AI PANEL IN THE THEME EDITOR
 * ===========================================================================
 * It edits the SAME sections the panels on the left edit. Not a copy, not a
 * parallel document — the operations that come back are applied to the state
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
 * The applier is shared with the server — see lib/website-builder/agent/
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

  Both have the same header: the history (a sub page that slides in), a new
  chat, maximize and close. Everything that talks to the server is shared
  and written once, below; only the layout differs.

  The dock is the one frosted surface in the builder, and on purpose: it sits
  over the page being edited, and the blur is what keeps it readable over
  whatever the page happens to be without hiding the page.
*/

import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  History,
  Loader2,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Paperclip,
  RotateCcw,
  ImagePlus,
  Square,
  SquarePen,
  TriangleAlert,
  X,
} from "lucide-react"

import { ImageViewer, type ViewableImage } from "@/components/website-builder/image-viewer"
import { StorelibMark } from "@/components/storelib-mark"
import { WorkPanel, type WorkCode, type WorkStep } from "@/components/website-builder/work-panel"
import { AiStatus, useStageLabel } from "@/components/website-builder/ai-status"
import { AskHistory, type HistoryTarget } from "@/components/website-builder/ask-history"
import { useVoiceInput } from "@/components/website-builder/ask-voice"
import { useSheetStop } from "@/components/website-builder/mobile-editor-sheet"
import type { WriteStage } from "@/lib/website-builder/agent/write-section"
import { cn } from "@/lib/utils"
import {
  ALLOWED_IMAGE_TYPES,
  LONG_EDGE,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  type AllowedImageType,
} from "@/lib/sites/agent/attachments"
import type { ThemeOp } from "@/lib/website-builder/agent/operations"
import { CLOSE_MS, DOCK_PAD, EASE, OPEN_MS, SLIDE_MS, dockGeometry } from "@/lib/website-builder/ask-dock"
import type { SectionInstance } from "@/lib/website-builder/types"

interface Exchange {
  id: string
  prompt: string
  /** One line per change, in the creator's words: "Added Pricing". */
  changes: string[]
  reply?: string
  error?: string
  running: boolean
  /**
   * The agent's own words while it works. It streams these between tool calls
   * and the panel used to drop them, so a run that spent twenty seconds
   * reading a section and the catalogue showed "Working" and nothing else.
   * Latest line only — this is commentary, not a transcript.
   */
  note?: string
  /**
   * What they attached, kept for the thread only. The bytes go to the model
   * once and are never written down anywhere; reloading the editor leaves the
   * words and drops the pictures, which is the trade we want.
   */
  images?: Attachment[]
  /**
   * The request, pictures and all, has reached the server. Until then the
   * thumbnails say they are being sent: the route reads the whole body
   * before it answers, so the answer starting is the upload finishing.
   */
  sent?: boolean
  /** What it said it would do, before it did any of it. */
  plan?: string
  /** One entry per tool call it actually made, in the order they happened. */
  steps?: WorkStep[]
  /** The source of any section it wrote during the run. */
  code?: WorkCode[]
}

/**
 * Written to show what it can actually do, not to be safe. Each one exercises
 * a different part: blocks, one section's controls, a section built from
 * nothing, and the theme's own settings.
 */
const SUGGESTIONS = [
  "Add an FAQ with five questions about what I sell",
  "Build a pricing section with three real tiers",
  "Make this section's heading shorter and tighten the spacing",
  "Give the whole site a warmer palette and rounder buttons",
]

/**
 * The other mode. These ask for a section TYPE that does not exist yet, which
 * is a different act from changing a page: it writes a file. Each one names
 * something the thirty sections in the library do not do, because asking for
 * a hero produces a worse hero than the one already there.
 */
const CODE_SUGGESTIONS = [
  "A comparison table of my plans, with a row per feature",
  "A before-and-after image slider with a draggable handle",
  "A stack of press quotes with the publication's logo beside each",
  "An opening-hours table with today highlighted",
]

/**
 * The three choices, as a person would describe them rather than as model ids.
 *
 * `provider` and `tier` are what the endpoint takes: the vendor, and how hard
 * a model within it. Keeping the ids out of the UI means a price change or a
 * model rename is a one-line change on the server and nothing here.
 */
const ENGINES = [
  {
    id: "claude",
    label: "Claude Sonnet",
    short: "Sonnet",
    detail: "Default, fast and good at everything here",
    provider: "anthropic",
    tier: "fast",
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    short: "Opus",
    detail: "Slower and dearer. For a change you know is hard",
    provider: "anthropic",
    tier: "strong",
  },
  {
    id: "openai",
    label: "ChatGPT",
    short: "ChatGPT",
    detail: "The previous engine",
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
 * One picture in the composer. `data` is what goes to the model; `url` is the
 * same bytes as a data URL, purely so the thumbnail can be drawn without a
 * second read.
 */
interface Attachment {
  id: string
  name: string
  mediaType: AllowedImageType
  data: string
  url: string
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

/**
 * The page agent's line while it runs, moved on by what the run has shown
 * so far: nothing yet, a plan or a step, then changes arriving on the page.
 */
function RunStatus({ exchange }: { exchange: Exchange }) {
  const stage =
    exchange.changes.length > 0
      ? "changing"
      : exchange.plan || (exchange.steps?.length ?? 0) > 0 || exchange.note
        ? "working"
        : "starting"
  const label = useStageLabel(
    stage,
    { starting: "Starting…", working: "Working on it…", changing: "Making changes…" },
    { starting: { after: 1200, label: "Thinking…" } },
  )
  return label ? <AiStatus label={label} /> : null
}

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
  onRunStart,
  onRunEnd,
  onBusyChange,
  onOp,
  onClose,
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
  /** With the reason, for an editor whose chat is closed and so cannot show it. */
  /** Nothing was written: `answered` when it replied in words instead, which is not a failure. */
  onWriteFailed?: (reason: string, answered?: boolean) => void
  /**
   * Opens the code editor at a path. A section the assistant writes is a file,
   * and the honest end of that is the creator reading it — not a thing that
   * appeared on their site without them seeing what it was.
   */
  onOpenCodeEditor?: (path: string) => void
  /** A section's code was rewritten during a run, so the theme's files are stale. */
  onSourcesChanged?: () => void
  page: string
  sections: SectionInstance[]
  settings: Record<string, unknown>
  /**
   * The section the creator has open, so "make this section better" has a
   * referent. Without it the model gets a demonstrative pronoun and a list of
   * nine sections, which is not a question anybody can answer.
   */
  selectedSectionId?: string
  /** Called once before the first change, so one Undo takes the lot back. */
  onRunStart: () => void
  /**
   * Called once after a run that changed something finishes cleanly, with
   * the prompt that asked for it. The editor takes a backup here, labelled
   * with that prompt, so "load the version from before I asked for the red
   * header" is a thing somebody can do.
   */
  onRunEnd?: (prompt: string) => void
  /** Whether a request is running, so the editor can say so with the panel closed. */
  onBusyChange?: (busy: boolean) => void
  onOp: (op: ThemeOp) => void
  onClose: () => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [historyError, setHistoryError] = React.useState<null | "not_set_up" | "read_failed">(null)
  const [draft, setDraft] = React.useState("")
  const dock = variant === "dock"
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
  /** Pictures being read and shrunk, shown as placeholders while they are. */
  const [preparing, setPreparing] = React.useState(0)
  const reducedMotion = useReducedMotion()
  const sheetStop = useSheetStop()
  /**
   * WHICH OF THE TWO THINGS IS BEING ASKED FOR. "change" edits this page and
   * goes to the agent; "code" writes a new section type and goes to the one
   * endpoint that compiles a file before keeping it. They are different acts
   * with different answers, and a single box that guessed between them would
   * guess wrong on "add a comparison table" — which could mean either.
   */
  const [mode, setMode] = React.useState<"change" | "code">("change")
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
  const writeLabel = useStageLabel(
    writeStage,
    { starting: "Starting…", thinking: "Thinking…", checking: "Checking it…", fixing: "Fixing a detail…" },
    { thinking: { after: 4500, label: "Writing the section…" }, fixing: { after: 4500, label: "Writing it again…" } },
  )
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])
  /**
   * THE NEXT THING TO ASK, WHILE THE LAST ONE IS STILL GOING.
   *
   * The box used to be `disabled` for the whole run, so the moment you had a
   * second thought you had to hold it in your head and watch a spinner. A run
   * is one request in and one answer out — there is no reason a person cannot
   * be writing the next one — so Enter during a run queues it and it goes the
   * instant the run ends.
   */
  const [queued, setQueued] = React.useState<string | null>(null)
  /**
   * ONLY THE OPEN SECTION MAY CHANGE.
   *
   * On by default whenever a section is selected, because that is what
   * selecting one means: asking for "a bit more space" on a FAQ and getting a
   * reworded hero back is an edit you have to check the whole page to trust.
   *
   * A toggle rather than a rule, and shown as a chip, so the scope of the edit
   * is something the creator sets and can SEE — not something inferred from
   * how they happened to phrase the sentence.
   */
  const [lockOn, setLockOn] = React.useState(true)
  /**
   * WHICH MODEL ANSWERS.
   *
   * Claude Sonnet 5 by default — it is the everyday model and what the
   * deployment is configured for. Opus is there for a change somebody already
   * knows is hard, and it is their choice rather than the model's: a model
   * that can promote itself to the five-times-dearer tier eventually will, and
   * the bill is theirs.
   *
   * Remembered per browser. Somebody who has chosen ChatGPT has chosen it for
   * more than one message, and re-picking it every time is the kind of small
   * friction that makes a switch feel broken.
   */
  const [engine, setEngine] = React.useState<EngineId>("claude")
  const [engineOpen, setEngineOpen] = React.useState(false)

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ENGINE_KEY)
      if (saved && ENGINES.some((e) => e.id === saved)) setEngine(saved as EngineId)
    } catch {
      // A browser with site data blocked still gets the default. Not worth a
      // failed render.
    }
  }, [])

  const chooseEngine = React.useCallback((id: EngineId) => {
    setEngine(id)
    setEngineOpen(false)
    try {
      window.localStorage.setItem(ENGINE_KEY, id)
    } catch {
      /* per-browser convenience only */
    }
  }, [])
  const abortRef = React.useRef<AbortController | null>(null)
  /** The conversation's own scroller, and the only thing a new message scrolls. */
  const threadRef = React.useRef<HTMLDivElement>(null)
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)

  /**
   * The live state, read at send time rather than captured in the callback.
   *
   * A run started thirty seconds ago must send what the page looks like NOW —
   * including anything the person changed by hand while it was open — or the
   * model plans against a page that no longer exists and addresses sections by
   * ids that have moved.
   */
  const selectedSection = React.useMemo(
    () => (selectedSectionId ? sections.find((s) => s.id === selectedSectionId) : undefined),
    [sections, selectedSectionId],
  )
  const locked = !!selectedSection && lockOn

  /**
   * A NEW SELECTION IS A FRESH INTENT. Clearing the lock to add a section, then
   * clicking a different section, should not leave the next edit quietly
   * unscoped — the chip would say one thing and the last click meant another.
   */
  React.useEffect(() => {
    setLockOn(true)
  }, [selectedSectionId])

  const chosenEngine = ENGINES.find((e) => e.id === engine) ?? ENGINES[0]

  /**
   * Read at SEND time, like everything else in here: a run started thirty
   * seconds ago must send what the panel looks like now.
   */
  const live = React.useRef({ sections, settings, page, selectedSectionId, locked, engine: chosenEngine, conversation })
  live.current = { sections, settings, page, selectedSectionId, locked, engine: chosenEngine, conversation }

  /**
   * ===========================================================================
   *  A NEW MESSAGE SCROLLS THE THREAD, AND NOTHING ELSE
   * ===========================================================================
   * This was `scrollIntoView` on a marker at the end of the list. That walks
   * EVERY scrollable ancestor and moves each of them until the marker is in
   * view, on both axes: the thread, and also the phone sheet (an
   * `overflow: hidden` box is still scrollable by script) and the document
   * behind it. With a keyboard up the end of the list is under the keys, so
   * the document went up and took the sheet's header under the status bar,
   * and a thread holding anything wider than itself was left scrolled
   * sideways with every message cut off on the left. The thread's own
   * `scrollTop` touches nothing but the thread.
   */
  /*
    ─────────────────────────────────────────────────────────────────────────
     AND IT FOLLOWS A RUN ONLY FOR SOMEBODY WHO IS FOLLOWING IT
    ─────────────────────────────────────────────────────────────────────────
    Every line a run streams in (a step, a plan, a note) is a new `exchanges`,
    and each one scrolled the thread to its end. Somebody who had scrolled up
    to read what the last run did was pulled back down on every step, for as
    long as the run went on.

    So the thread is PINNED while its reader is at the end, and only a pinned
    thread follows. Scrolling up unpins it, scrolling back to the end pins it
    again. A new exchange pins it whatever the reader was doing, because a
    new exchange is the message they just sent. That one arrives with a
    smooth scroll; the run's own lines, which come many a second, land
    without one, as a chat's growing last message does.

    The scroll a smooth scroll makes is not the reader's, so for its length
    it does not unpin anything, unless a finger or a wheel takes over.
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
   * THE CONVERSATION SURVIVES A REFRESH.
   *
   * It used to live only in this component's state, so reloading the editor
   * left the sections changed and no record of what had been asked for or
   * why — which is exactly the question somebody has when they come back to a
   * page they built last week.
   *
   * Restored as pairs: the transcript stores one row for the question and one
   * for the reply, and the panel shows one exchange.
   *
   * ONE CONVERSATION AT A TIME: `which` is an id from the history, "earlier"
   * for the messages from before conversations, or null for the one used
   * last. A newer load, or a message sent meanwhile, makes an older load's
   * answer stale (`loadSeq`), and a stale answer is dropped.
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
           * sitting in the table.
           */
          const body = (await response.json().catch(() => ({}))) as { reason?: string }
          if (!cancelled) {
            setHistoryError(body.reason === "not_set_up" ? "not_set_up" : "read_failed")
          }
          return
        }
        const body = (await response.json()) as {
          conversation?: { id: string; title: string } | null
          earlier?: boolean
          messages: Array<{
            id: string
            role: string
            content: string
            ops: unknown[]
            error: string | null
            images?: { id: string; name: string; url: string }[]
          }>
        }
        if (cancelledNow()) return

        const restored: Exchange[] = []
        for (const message of body.messages) {
          if (message.role === "user") {
            restored.push({
              id: message.id,
              /**
               * The note the route wrote is for the day the pictures have
               * expired and the words are all there is. While the picture is
               * still there, showing "[an image attached]" underneath it is
               * a caption nobody needs.
               */
              prompt: message.images?.length
                ? message.content.replace(/\n*\[(?:an image|\d+ images) attached\]\s*$/, "").trim() ||
                  (message.images.length === 1 ? "Build this." : "Build these.")
                : message.content,
              changes: [],
              running: false,
              /**
               * The pictures come back too, as signed URLs the server minted
               * for this read. After thirty days there are none and the words
               * are what is left, which is the trade the expiry buys.
               */
              images: message.images?.length
                ? message.images.map((image) => ({
                    id: image.id,
                    name: image.name,
                    /* Kept only to satisfy the viewer's shape; unused on a restored picture. */
                    mediaType: "image/png" as AllowedImageType,
                    data: "",
                    url: image.url,
                  }))
                : undefined,
            })
            continue
          }
          const open = restored[restored.length - 1]
          if (!open) continue
          open.reply = message.content || undefined
          open.error = message.error ?? undefined
          /**
           * The operations are summarised rather than replayed. Replaying them
           * would apply the same edits a second time to a page that already
           * has them — the transcript is a record, not a script.
           */
          open.changes =
            message.ops.length > 0
              ? [`${message.ops.length} change${message.ops.length === 1 ? "" : "s"}`]
              : []
        }
        /* A different conversation lands at its end without a glide, as a restore does. */
        seenExchanges.current = 0
        setExchanges(restored)
        setConversation({
          id: body.conversation?.id ?? null,
          title: body.conversation?.title ?? (body.earlier ? restored[0]?.prompt ?? "" : ""),
          earlier: !!body.earlier,
        })
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
   *  A PICTURE OF WHAT THEY WANT, HANDED STRAIGHT TO THE ASSISTANT
   * ═════════════════════════════════════════════════════════════════════════
   * "Attach a screenshot and tell it to build a section like that." Three
   * ways in, because people reach for whichever is nearest: the button, a
   * paste, and a drop onto the composer.
   *
   * Read here as base64 rather than uploaded anywhere. The bytes travel with
   * the one request that mentions them and are gone after it — no bucket, no
   * path, and nothing of one creator's to keep away from another's.
   */
  const [attached, setAttached] = React.useState<Attachment[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [attachError, setAttachError] = React.useState<string | null>(null)
  /** Which picture is open full size, and the set it belongs to. */
  const [viewing, setViewing] = React.useState<{ images: ViewableImage[]; at: number } | null>(null)
  /**
   * A FILE IS OVER THE PANEL.
   *
   * Counted rather than set, because dragenter and dragleave fire for every
   * child the pointer crosses: a boolean flickers off the moment the cursor
   * passes from the thread onto the composer inside it, and the drop target
   * blinks the whole way down the panel.
   */
  const dragDepth = React.useRef(0)
  const [dragging, setDragging] = React.useState(false)

  /**
   * A SCREENSHOT IS SHRUNK BEFORE IT IS SENT.
   *
   * Two reasons, and the second is the hard one. The model scales anything
   * over LONG_EDGE down before it looks at it and charges for the pixels
   * either way, so a 4K screenshot buys nothing. And this posts to a Node
   * serverless function, whose request body the platform caps at 4.5MB —
   * base64 is a third larger than the file, so two phone screenshots would
   * be refused with a 413 raised before any of our code runs, which is a
   * failure nobody could explain to the person who hit it.
   *
   * A picture already inside the limit is left exactly as it is: re-encoding
   * a small PNG only makes it worse.
   */
  const shrink = React.useCallback(
    (url: string, mediaType: AllowedImageType): Promise<{ url: string; mediaType: AllowedImageType }> =>
      new Promise((resolve) => {
        const keep = { url, mediaType }
        const image = new Image()
        image.onerror = () => resolve(keep)
        image.onload = () => {
          const long = Math.max(image.naturalWidth, image.naturalHeight)
          /* Under the edge AND under the size: nothing to gain. */
          if (long <= LONG_EDGE && url.length * 0.75 <= MAX_IMAGE_BYTES / 2) { resolve(keep); return }
          const scale = Math.min(1, LONG_EDGE / long)
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          const context = canvas.getContext("2d")
          if (!context) { resolve(keep); return }
          /* White underneath, because a transparent PNG becomes black in JPEG. */
          context.fillStyle = "#ffffff"
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.imageSmoothingQuality = "high"
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          try {
            /**
             * 0.92, not 0.8. The point of the picture is the detail in it,
             * and JPEG artefacts around small text are exactly the detail
             * that gets read wrong.
             */
            const out = canvas.toDataURL("image/jpeg", 0.92)
            resolve(out.length < url.length ? { url: out, mediaType: "image/jpeg" } : keep)
          } catch {
            resolve(keep)
          }
        }
        image.src = url
      }),
    [],
  )

  const attach = React.useCallback(async (files: FileList | File[] | null) => {
    if (!files) return
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (picked.length === 0) return
    setAttachError(null)
    /* A picture is somewhere to look the moment it is chosen: a placeholder
       holds its place while it is read and shrunk. */
    setPreparing((n) => n + picked.length)
    const read = await Promise.all(
      picked.map(
        (file) =>
          new Promise<Attachment | string>((resolve) => {
            if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
              resolve(`${file.name} is not a PNG, JPEG, WebP or GIF.`)
              return
            }
            if (file.size > MAX_IMAGE_BYTES) {
              resolve(`${file.name} is over ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`)
              return
            }
            const reader = new FileReader()
            reader.onerror = () => resolve(`${file.name} could not be read.`)
            reader.onload = () => {
              const url = String(reader.result ?? "")
              const comma = url.indexOf(",")
              if (comma < 0) { resolve(`${file.name} could not be read.`); return }
              void shrink(url, file.type as AllowedImageType).then((small) => {
                const cut = small.url.indexOf(",")
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  mediaType: small.mediaType,
                  data: small.url.slice(cut + 1),
                  url: small.url,
                })
              })
            }
            reader.readAsDataURL(file)
          }),
      ),
    )
    setPreparing((n) => Math.max(0, n - picked.length))
    const ok = read.filter((r): r is Attachment => typeof r !== "string")
    const bad = read.filter((r): r is string => typeof r === "string")
    setAttached((previous) => {
      const room = MAX_IMAGES - previous.length
      if (ok.length > room) bad.push(`Only ${MAX_IMAGES} images at a time.`)
      /**
       * And under the total the request can carry. Said here rather than
       * left to the server, so it reads as "that is too much" in the
       * composer instead of arriving as a failed run.
       */
      const kept: Attachment[] = []
      let total = previous.reduce((sum, a) => sum + a.data.length * 0.75, 0)
      for (const image of ok.slice(0, Math.max(0, room))) {
        const size = image.data.length * 0.75
        if (total + size > MAX_TOTAL_IMAGE_BYTES) {
          bad.push(`That is more than ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB of pictures in one go.`)
          break
        }
        total += size
        kept.push(image)
      }
      return [...previous, ...kept]
    })
    if (bad.length) setAttachError(bad[0])
  }, [shrink])

  const removeAttachment = React.useCallback((id: string) => {
    setAttached((previous) => previous.filter((a) => a.id !== id))
  }, [])

  const send = React.useCallback(
    async (text: string, images: Attachment[] = []) => {
      const prompt = text.trim()
      /**
       * A picture on its own is a whole request. "Even if it says nothing and
       * uploads an image, it should try to replicate it."
       */
      if ((!prompt && images.length === 0) || busy) return

      const id = crypto.randomUUID()
      setDraft("")
      setAttached([])
      setAttachError(null)
      setBusy(true)
      /* A history read still in flight would land on top of this message: it is dropped. */
      if (loadingHistory) {
        loadSeq.current++
        setLoadingHistory(false)
      }
      setWanted(true)
      setExchanges((previous) => [
        ...previous,
        { id, prompt: prompt || (images.length === 1 ? "Build this." : "Build these."), changes: [], running: true, images },
      ])

      const patch = (change: (exchange: Exchange) => Exchange) =>
        setExchanges((previous) => previous.map((e) => (e.id === id ? change(e) : e)))

      /** One snapshot, before anything moves, so Undo takes back the whole run. */
      let snapshotTaken = false

      /**
       * THE RUN BELONGS TO THE PAGE IT STARTED ON.
       *
       * Switching pages swaps `sections` for a different page's, and the
       * operations coming back address the OLD page by id. Most would miss
       * harmlessly — update, move and remove all no-op on an id that is not
       * there — but `add_section` names no existing id and would land a new
       * section on whichever page happens to be open. Somebody would find a
       * pricing table on their About page with no idea where it came from.
       */
      const startedOn = live.current.page

      try {
        const controller = new AbortController()
        abortRef.current = controller

        const response = await fetch(`/api/website-builder/themes/${installId}/agent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
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
        })

        /* The route has read the whole request, pictures included, before it answers. */
        patch((e) => ({ ...e, sent: true }))

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          patch((e) => ({ ...e, running: false, error: body.error ?? "That did not go through." }))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let newline = buffer.indexOf("\n")
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf("\n")
            if (!line) continue

            let event: {
              type: string
              op?: ThemeOp
              label?: string
              text?: string
              message?: string
              /* A step's id and state, and a written file's path and source. */
              id?: string
              state?: string
              path?: string
              source?: string
              /* The conversation's name, on the event that says which one this run is in. */
              title?: string
            }
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            /* Which conversation this run is recorded in: a new chat now has an id, and a name. */
            if (event.type === "conversation" && event.id) {
              const opened = { id: event.id, title: event.title ?? "", earlier: false }
              setConversation((was) => (was.id === opened.id && was.title === opened.title && !was.earlier ? was : opened))
              continue
            }

            /**
             * Checked per operation rather than once: the page can change at
             * any point during a run, and the next event is where it matters.
             */
            if (live.current.page !== startedOn) {
              controller.abort()
              patch((e) => ({
                ...e,
                running: false,
                reply: "Stopped, you moved to another page. Nothing was applied there.",
              }))
              return
            }

            if (event.type === "thinking") {
              const note = event.text ?? ""
              patch((e) => ({ ...e, note }))
            } else if (event.type === "plan") {
              const plan = event.text ?? ""
              patch((e) => ({ ...e, plan }))
            } else if (event.type === "step") {
              const id = event.id ?? ""
              const label = event.label ?? ""
              const state = (event.state ?? "running") as WorkStep["state"]
              patch((e) => {
                const steps = e.steps ?? []
                const at = steps.findIndex((step) => step.id === id)
                /**
                 * The same id arrives twice, once running and once settled.
                 * Replacing in place is what makes the line TICK rather than
                 * appear a second time underneath itself.
                 */
                if (at < 0) return { ...e, steps: [...steps, { id, label, state }] }
                const next = [...steps]
                next[at] = { id, label, state }
                return { ...e, steps: next }
              })
            } else if (event.type === "code") {
              const path = event.path ?? ""
              const source = event.source ?? ""
              if (path && source) {
                patch((e) => {
                  const code = e.code ?? []
                  const at = code.findIndex((file) => file.path === path)
                  if (at < 0) return { ...e, code: [...code, { path, source }] }
                  const next = [...code]
                  next[at] = { path, source }
                  return { ...e, code: next }
                })
              }
            } else if (event.type === "op" && event.op) {
              if (!snapshotTaken) {
                onRunStart()
                snapshotTaken = true
              }
              onOp(event.op)
              const label = event.label ?? "Changed the page"
              patch((e) => ({ ...e, changes: [...e.changes, label] }))
            } else if (event.type === "sources-changed") {
              // The canvas is drawing the old source; the editor holds the files.
              onSourcesChanged?.()
            } else if (event.type === "message") {
              const reply = event.text ?? ""
              patch((e) => ({ ...e, reply, running: false }))
            } else if (event.type === "error") {
              const message = event.message ?? "The edit failed."
              patch((e) => ({ ...e, running: false, error: message }))
            }
          }
        }

        patch((e) => ({ ...e, running: false }))
        if (snapshotTaken) onRunEnd?.(prompt)
      } catch (thrown) {
        const stopped = thrown instanceof DOMException && thrown.name === "AbortError"
        patch((e) => ({
          ...e,
          running: false,
          /**
           * A stop is the person deciding, not a fault — and changes already
           * applied are NOT rolled back, because they are on screen and one
           * Undo takes them back. Silently reverting work somebody watched
           * happen would be the more surprising behaviour.
           */
          error: stopped ? undefined : "Lost the connection. Anything already changed is still here.",
          reply: stopped ? "Stopped." : e.reply,
        }))
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, installId, loadingHistory, onOp, onRunStart, onRunEnd],
  )

  /**
   * Drains the queue when the run that was in the way finishes. `send` refuses
   * while `busy`, so this cannot fire into the middle of one.
   */
  React.useEffect(() => {
    if (busy || !queued) return
    const next = queued
    setQueued(null)
    void send(next)
  }, [busy, queued, send])

  /** Enter sends, or queues if something is already running. */
  /**
   * WRITE ME A SECTION. Not the agent loop: that edits a page, and every one
   * of its operations names something that already exists. This asks for a
   * file, and the server compiles it before keeping it — a section that does
   * not compile is never stored, so the worst outcome here is being told why.
   */
  const writeOne = React.useCallback(
    async (prompt: string, images: Attachment[] = []) => {
      lastWrite.current = { prompt, images }
      setWriting(true)
      setWriteStage("starting")
      setWriteError(null)
      setWriteReply(null)
      setWritten(null)
      setAttached([])
      setAttachError(null)
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
           * THE PICTURES GO TOO. They used not to, which is the whole of the
           * bug: attaching a screenshot here sent `{ prompt: "" }`, failed
           * the route's own validation, and came back as "the assistant could
           * not produce a section that compiles".
           */
          /**
           * AND THE SITE GOES TOO. Writing a section is the one moment every
           * colour, font and spacing value is decided at once, and this path
           * used to make those decisions knowing nothing about the site the
           * section was for. The editor already holds both, so it costs a
           * request body rather than a database read.
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
             chat: "Line 331: <schema> is never closed" tells a creator
             nothing they can act on. The detail stays in the console. */
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
        setWriting(false)
        setWriteStage(null)
      }
    },
    /**
     * Everything it reads. This list was `[installId]` alone, so the request
     * carried the site's settings and sections as they were when the panel
     * first rendered: a section written after changing the colours was
     * written for the old ones.
     */
    [installId, settings, sections, onWriteStart, onWriteDone, onWriteFailed, dock],
  )

  const submit = React.useCallback(
    (text: string) => {
      const prompt = text.trim()
      const images = attached
      if (!prompt && images.length === 0) return
      setDraft("")
      if (mode === "code") {
        if (writing) return
        void writeOne(prompt, images)
        return
      }
      if (busy) {
        setQueued(prompt)
        return
      }
      void send(prompt, images)
    },
    [busy, send, mode, writing, writeOne, attached],
  )

  /**
   * The box grows with what is in it, to a point. Two fixed rows is enough for
   * "make it blue" and not enough for the kind of instruction that is worth
   * writing — and a box you cannot see the bottom of is one people stop
   * writing long things in.
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
    sent: they are read and changed first like typed ones. See ask-voice.ts
    for which way the browser hears them, and why the microphone is simply
    not drawn where it cannot.
  */
  const voiceBase = React.useRef("")
  const voice = useVoiceInput({
    onText: (text) => {
      const base = voiceBase.current
      setDraft(base ? `${base} ${text}` : text)
    },
  })
  const listening = voice.state === "listening"
  const voiceRef = React.useRef(voice)
  voiceRef.current = voice

  /** The model menu closes on any press outside it, as a menu does. */
  const engineRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!engineOpen) return
    const away = (event: PointerEvent) => {
      if (!engineRef.current?.contains(event.target as Node)) setEngineOpen(false)
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [engineOpen])

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
   * same pixels the maximize animation measures.
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
    if (!dock) {
      if (!sheetStop) return
      if (sheetStop.tallest) sheetStop.toMiddle()
      else sheetStop.toTallest()
      return
    }
    const surface = surfaceRef.current
    const pill = pillFlipRef.current
    if (surface && pill && !reducedMotion && expanded) {
      flipFrom.current = { surface: surface.getBoundingClientRect(), pill: pill.getBoundingClientRect() }
    }
    setWanted(true)
    setExpanded(true)
    setMaximized((was) => !was)
  }, [dock, sheetStop, reducedMotion, expanded])
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
    again once it has slid back out. Left mounted, its box sat past the
    sheet's edge for as long as the chat was open.
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
    setHistoryError(null)
    clearThread()
    setConversation({ id: null, title: "", earlier: false })
    setView("thread")
    setDraft("")
    if (dock) requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
  }, [busy, writing, clearThread, dock])

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
    voice.clearError()
    if (dock) openDock()
    void voice.start()
  }, [draft, voice, dock, openDock])

  viewingRef.current = !!viewing
  const phone = !dock
  const busyNow = busy || writing
  const isMax = dock ? maximized : !!sheetStop?.tallest
  const empty = draft.trim().length === 0 && attached.length === 0
  const placeholder =
    listening
      ? "Listening…"
      : voice.state === "transcribing"
        ? "Writing it out…"
        : dock && !expanded && writing
          ? writeLabel ?? "Writing the section…"
          : mode === "code"
            ? "Describe a section, or attach a picture of one…"
            : busy
              ? dock && !expanded
                ? "Working on it. Ask for the next change…"
                : "Ask for the next change…"
              : attached.length
                ? "Say what this is for, or just send it"
                : dock
                  ? exchanges.length
                    ? "Continue the conversation"
                    : "Ask Storelib to change this page"
                  : "Change this page, or attach a picture…"

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

  const header = (
    <div data-ask-header="" className={cn("flex shrink-0 items-center gap-0.5", phone ? "h-[52px] px-1.5" : "h-12 px-2.5")}>
      {view === "history" ? (
        <>
          <button type="button" onClick={() => setView("thread")} aria-label="Back to the conversation" className={iconButton}>
            <ChevronLeft className="h-[19px] w-[19px]" strokeWidth={1.9} />
          </button>
          <span data-ask-title="" className="min-w-0 flex-1 truncate pl-1 text-[14px] font-semibold text-[#1a1a2e]">
            Conversations
          </span>
        </>
      ) : (
        <>
          <button
            type="button"
            data-ask-history-button=""
            onClick={openHistory}
            aria-label="Conversation history"
            title="Conversation history"
            className={cn(iconButton, "w-auto gap-0.5", phone ? "min-w-11 px-2.5" : "px-2")}
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
      {(dock || sheetStop) && (
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
        (`overflow-wrap: anywhere`, which also lets a flex row shrink past
        it), and a finger here pans vertically only. Code blocks scroll
        sideways inside themselves (work-panel.tsx). Measured by
        scripts/check-chat-keyboard.mjs: scrollWidth equals clientWidth with
        a 200 character URL, a long unbroken word and a wide code block in it.
      */}
      <div
        ref={threadRef}
        data-chat-thread=""
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 [overflow-wrap:anywhere] [touch-action:pan-y]"
      >
        <div className={cn("min-w-0", dock && maximized && "mx-auto max-w-[720px]")}>
          {loadingHistory ? (
            <p className="flex items-center gap-2 text-[13px] text-[#6b7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </p>
          ) : historyError === "not_set_up" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
              <p className="text-[13px] font-medium text-[#1a1a2e]">Chat history is not switched on yet.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6b7280]">
                This database has nowhere to keep the conversation, so it will not survive a reload.
                Everything else works. Ask for a change and it is made.
              </p>
            </div>
          ) : historyError === "read_failed" ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-3">
              <p className="text-[13px] font-medium text-[#1a1a2e]">We could not load this conversation.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6b7280]">
                Nothing has been lost. This is a problem reading it, not a problem with it. You can
                still ask for a change.
              </p>
            </div>
          ) : exchanges.length === 0 ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-[#6b7280]">
                {mode === "change"
                  ? "Describe a change and it is made on this page. It writes the same sections, blocks and controls the panels do, the same sliders, pickers and colours, so everything stays undoable and nothing saves until you press Save."
                  : "Describe a section the library does not have and it is written as a .storelib file, with blocks, your colour scheme and a phone layout. It has to compile before it is kept. It appears on this page where you are working, and goes live when you publish."}
              </p>

              <div className="space-y-1.5">
                {(mode === "change" ? SUGGESTIONS : CODE_SUGGESTIONS).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setDraft(suggestion)
                      fieldRef.current?.focus({ preventScroll: true })
                      requestAnimationFrame(resize)
                    }}
                    className={cn(
                      "w-full rounded-xl border border-[#e5e7eb] bg-white/70 px-3.5 text-left text-[13px] leading-snug text-[#1a1a2e]/75 transition-colors hover:border-[#1a1a2e]/20 hover:text-[#1a1a2e]",
                      phone ? "min-h-[44px] py-2.5" : "py-2",
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-5">
              {exchanges.map((exchange) => (
                <li key={exchange.id} className="space-y-2.5">
                  {exchange.images && exchange.images.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {exchange.images.map((image, index) => (
                        <button
                          key={image.id}
                          type="button"
                          data-ask-sent-image=""
                          onClick={() => setViewing({ images: exchange.images ?? [], at: index })}
                          aria-label={`Open ${image.name}`}
                          className="relative block overflow-hidden rounded-xl border border-[#e5e7eb] transition-opacity hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- bytes this thread already holds. */}
                          <img src={image.url} alt={image.name} className="h-16 w-16 object-cover" />
                          {exchange.running && !exchange.sent && (
                            <span data-ask-sending="" className="absolute inset-0 flex items-center justify-center bg-white/55">
                              <Loader2 className="h-4 w-4 animate-spin text-[#1a1a2e]/70" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <p
                      data-ask-prompt=""
                      className="max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#f1f2f4] px-3.5 py-2 text-[13.5px] leading-[1.5] text-[#1a1a2e]"
                    >
                      {exchange.prompt}
                    </p>
                  </div>

                  {/*
                    THE RUN ITSELF: the plan, the steps as they tick off, and
                    any code it wrote. Above the change list, because it is what
                    is happening and the list is what happened.
                  */}
                  <WorkPanel
                    plan={exchange.plan}
                    steps={exchange.steps ?? []}
                    code={exchange.code ?? []}
                    running={exchange.running}
                    onOpenCode={onOpenCodeEditor}
                  />

                  {exchange.changes.length > 0 && (
                    <ul className="space-y-1 border-l border-[#e5e7eb] pl-3">
                      {exchange.changes.map((change, index) => (
                        <li
                          key={`${change}-${index}`}
                          className="flex items-center gap-2 text-[12.5px] text-[#6b7280]"
                        >
                          <Check className="h-3 w-3 shrink-0 text-emerald-500" strokeWidth={2} />
                          <span className="truncate">{change}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {exchange.note && exchange.running && (
                    <p
                      key={exchange.note}
                      className="animate-in fade-in text-[12.5px] leading-relaxed text-[#6b7280] duration-300"
                    >
                      {exchange.note}
                    </p>
                  )}

                  {exchange.running && <RunStatus exchange={exchange} />}

                  {exchange.reply && (
                    <p className="text-[13.5px] leading-relaxed text-[#1a1a2e]">{exchange.reply}</p>
                  )}

                  {exchange.error && (
                    <div className="space-y-1.5">
                      <p className="flex items-start gap-1.5 text-[12.5px] text-red-600">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                        {exchange.error}
                      </p>
                      {/*
                        A failed run leaves the request sitting there with no way
                        to make it again except retyping it, which is the moment
                        most people give up on a feature rather than on the
                        network.
                      */}
                      <button
                        type="button"
                        onClick={() => submit(exchange.prompt)}
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] text-[#1a1a2e]/75 transition-colors hover:border-[#1a1a2e]/25 hover:text-[#1a1a2e] disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={2} />
                        Try again
                      </button>
                    </div>
                  )}
                </li>
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
          )}
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
        />
      </div>
    </div>
  )

  /* Wraps like the thread: a long path in "is saved as", or a URL in a
     reply to the writer, breaks where it has to rather than running out of
     the panel under the clipped x axis. */
  const tray = (
    <div data-ask-tray="" className={cn("min-w-0 [overflow-wrap:anywhere]", dock && maximized && "mx-auto max-w-[720px]")}>
      {/* What the writer produced, or why it could not. Also stranded in
          the empty state before: a section written after any exchange was
          reported to nobody. */}
      {written && (
        <div className="mb-2 rounded-xl border border-[#e5e7eb] bg-white p-3">
          <p className="text-[13px] font-medium text-[#1a1a2e]">
            {written.placed ? `${written.name} is on the page` : `${written.name} is written`}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#6b7280]">
            It compiled and is saved as <span className="font-mono text-[12px]">{written.path}</span>.{" "}
            {written.placed
              ? "It goes live when you publish."
              : "Add it from Add Section, under Created by you. It goes live when you publish."}
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

      {/* It answered rather than wrote: the question, then the answer,
          like any other turn of a conversation. */}
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

      {/* What it is doing while it does it, from the server's reports. */}
      {writing && writeLabel && <AiStatus label={writeLabel} className="mb-2 px-0.5" />}

      {voice.error && (
        <p data-ask-voice-error="" role="alert" className="mb-2 flex items-start gap-1.5 px-0.5 text-[12.5px] leading-snug text-[#b45309]">
          <TriangleAlert className="mt-[3px] h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1">{voice.error}</span>
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

      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        {/*
          ═════════════════════════════════════════════════════════════════════
           THE TWO THINGS IT DOES, ALWAYS REACHABLE
          ═════════════════════════════════════════════════════════════════════
          Changing this page and writing a new kind of section are different
          acts with different answers, and "add a comparison table" is a
          sentence that could mean either. So it asks, in one row.

          THE ROW USED TO BE IN THE EMPTY STATE ONLY. Ask for one change and
          it was gone, and the conversation is kept across reloads — so after
          a creator's first message, in that install, forever, half the
          assistant could not be reached at all. It lives with the box you
          type into now, because it decides what typing there does.
        */}
        <div role="group" aria-label="What to ask for" className="flex min-w-0 shrink-0 gap-0.5 rounded-full bg-black/[0.045] p-0.5">
          {([
            ["change", "Change this page"],
            ["code", "Code a section"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setWriteError(null) }}
              aria-pressed={mode === key}
              className={cn(
                "min-w-0 truncate rounded-full font-medium transition-[background-color,color,box-shadow] duration-150",
                phone ? "h-11 px-4 text-[13px]" : "h-7 px-3 text-[12px]",
                mode === key
                  ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.1)]"
                  : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/*
          THE SCOPE OF THE EDIT, WHERE YOU ARE ABOUT TO TYPE IT.
          Not buried in a menu and not implied by the sentence: the chip says
          what will change before you ask for it, and one click changes the
          answer.
        */}
        {selectedSection && (
          <div className="flex min-w-0 items-center gap-1.5">
            {locked ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[#1a1a2e]/12 bg-white py-1 pl-2.5 pr-1 text-[12px] text-[#1a1a2e]">
                  <Lock className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2} />
                  <span className="truncate">Only {selectedSection.name}</span>
                  <button
                    type="button"
                    onClick={() => setLockOn(false)}
                    aria-label={`Stop limiting edits to ${selectedSection.name}`}
                    title="Edit the whole page instead"
                    className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-black/[0.06] hover:text-[#1a1a2e]"
                  >
                    <X className="h-3 w-3" strokeWidth={2.25} />
                  </button>
                </span>
                <span className="min-w-0 truncate text-[11.5px] text-[#6b7280]/80">
                  nothing else will change
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLockOn(true)}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white/70 px-2.5 py-1 text-[12px] text-[#6b7280] transition-colors hover:border-[#1a1a2e]/25 hover:text-[#1a1a2e]"
              >
                <Lock className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2} />
                <span className="truncate">Editing the whole page. Limit to {selectedSection.name}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  /*
    WHICH MODEL, where the message is written: it is a per-message decision
    ("this one is hard, use Opus"), and a choice buried two screens away is
    one nobody makes. A short name on the button, the reason in the menu.
  */
  const modelMenu = (
    <div ref={engineRef} className="relative shrink-0">
      <button
        type="button"
        data-ask-model=""
        onClick={() => setEngineOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={engineOpen}
        title="Which model answers"
        className={cn(
          "relative flex items-center gap-1 rounded-full text-[13px] text-[#1a1a2e]/75 transition-colors hover:bg-black/[0.05] hover:text-[#1a1a2e]",
          phone ? "h-11 pl-3.5 pr-2.5" : "h-9 pl-3 pr-2",
        )}
      >
        <span className="max-w-[96px] truncate">{chosenEngine.short}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200", engineOpen && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {engineOpen && (
        <ul
          role="listbox"
          aria-label="Model"
          data-ask-model-menu=""
          className={cn(
            "absolute bottom-full z-50 mb-2 w-[252px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.3)]",
            "animate-in fade-in slide-in-from-bottom-1 duration-150",
            phone ? "left-0" : "right-0",
          )}
        >
          {ENGINES.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === engine}
                onClick={() => chooseEngine(option.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl px-2.5 text-left transition-colors hover:bg-black/[0.04]",
                  phone ? "min-h-[48px] py-2.5" : "py-2",
                )}
              >
                <Check
                  className={cn("mt-[3px] h-3.5 w-3.5 shrink-0 text-[#1a1a2e]", option.id === engine ? "opacity-100" : "opacity-0")}
                  strokeWidth={2.5}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-[#1a1a2e]">{option.label}</span>
                  <span className="block text-[11.5px] leading-snug text-[#6b7280]">{option.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ALLOWED_IMAGE_TYPES.join(",")}
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
      disabled={attached.length + preparing >= MAX_IMAGES}
      aria-label="Attach a picture"
      title={attached.length >= MAX_IMAGES ? `${MAX_IMAGES} images is the limit` : "Attach a picture of what you want"}
      className={cn(quietRound, dock && "border border-black/[0.06] bg-white/60")}
    >
      <Paperclip className="h-4 w-4" strokeWidth={1.9} />
    </button>
  )

  const micButton = voice.supported && (
    <>
      {listening && (
        <span data-ask-voice-clock="" className={cn("flex shrink-0 items-center px-1 text-[12.5px] tabular-nums text-[#1a1a2e]/70", phone ? "h-11" : "h-9")}>
          {clock(voice.seconds)}
        </span>
      )}
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
    </>
  )

  const stopButton = busy && (
    <button
      type="button"
      onClick={() => abortRef.current?.abort()}
      aria-label="Stop"
      title="Stop"
      className={cn(quietRound, "border border-[#e5e7eb] bg-white")}
    >
      <Square className="h-2.5 w-2.5 fill-current" />
    </button>
  )

  const sendButton = (
    <button
      type="button"
      data-ask-send=""
      onClick={() => submit(draft)}
      disabled={draft.trim().length === 0 && attached.length === 0}
      aria-label={busy ? "Queue" : "Send"}
      className={cn(
        roundButton,
        "disabled:opacity-100",
        empty ? "bg-black/[0.06] text-black/30" : "bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90",
      )}
    >
      <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
    </button>
  )

  /*
    NOT `disabled` while a run is going. Waiting for a spinner before you are
    allowed to type your next thought is the difference between a
    conversation and a form. Enter during a run queues it instead.
  */
  const field = (
    <textarea
      ref={fieldRef}
      rows={1}
      value={draft}
      aria-label="Message Storelib AI"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={dock ? openDock : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          submit(draft)
        }
      }}
      /** A screenshot goes to the clipboard; this is where it lands. */
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files)
        if (!files.some((f) => f.type.startsWith("image/"))) return
        event.preventDefault()
        void attach(files)
      }}
      placeholder={placeholder}
      className={cn(
        "block w-full resize-none bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#6b7280]/80",
        phone ? "min-h-[44px] px-1.5 py-[11px] text-[15px] leading-[22px]" : "min-h-[40px] py-[9px] text-[14px] leading-[22px]",
      )}
    />
  )

  const thumbnails = (attached.length > 0 || preparing > 0) && (
    <div data-ask-attachments="" className="flex flex-wrap gap-2 px-3 pt-3">
      {attached.map((image) => (
        <div key={image.id} data-ask-thumb="" className="group/att relative animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => setViewing({ images: attached, at: attached.indexOf(image) })}
            aria-label={`Open ${image.name}`}
            className="block overflow-hidden rounded-xl border border-[#e5e7eb] transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the creator's own file; there is nothing to optimise and nowhere to fetch it from. */}
            <img src={image.url} alt={image.name} className="h-14 w-14 object-cover" />
          </button>
          <button
            type="button"
            onClick={() => removeAttachment(image.id)}
            aria-label={`Remove ${image.name}`}
            /**
             * The cross is 20px because a bigger one would sit on the
             * picture rather than beside it. The `after` box is the part a
             * thumb hits: 44px, invisible, over the corner.
             */
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] shadow-sm transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-[#1a1a2e]"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      ))}
      {Array.from({ length: preparing }, (_, index) => (
        <div
          key={`preparing-${index}`}
          data-ask-preparing=""
          aria-label="Preparing a picture"
          className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#e5e7eb] bg-[#f8f9fa]"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
        </div>
      ))}
    </div>
  )

  const attachProblem = attachError && (
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
          {/* The pill's two faces: frosted over the canvas, plain white as the conversation's input row. */}
          <span
            aria-hidden
            data-ask-glass=""
            className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/70 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_12px_32px_-12px_rgba(15,23,42,0.28),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.05] backdrop-blur-xl backdrop-saturate-150"
            style={{ opacity: expanded ? 0 : 1, transition: reducedMotion ? "none" : "opacity 200ms ease-out" }}
          />
          <span
            aria-hidden
            data-ask-solid=""
            className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.16)]"
            style={{ opacity: expanded ? 1 : 0, transition: reducedMotion ? "none" : "opacity 200ms ease-out" }}
          />
        </>
      )}
      <div className="relative min-w-0">
        {thumbnails}
        {attachProblem}
        {fileInput}
        {dock ? (
          <div className="flex min-w-0 items-end gap-1.5 py-[7px] pl-5 pr-[7px]">
            <div className="min-w-0 flex-1">{field}</div>
            {modelMenu}
            {attachButton}
            {micButton}
            {stopButton}
            {sendButton}
          </div>
        ) : (
          <>
            <div className="px-2 pt-0.5">{field}</div>
            <div className="flex min-w-0 items-center gap-0.5 px-1 pb-1">
              {modelMenu}
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
    gesture is something you either already know about or never find, and a
    file let go over a panel that showed no target reads as broken.
  */
  const dropTarget = dragging && (
    <div data-drop-target="" className="pointer-events-none absolute inset-2 z-[120] flex flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-[#1a1a2e]/25 bg-white/90">
      <ImagePlus className="h-6 w-6 text-[#1a1a2e]/60" strokeWidth={1.75} />
      <p className="text-[13px] font-medium text-[#1a1a2e]">Drop the picture here</p>
      <p className="text-[12px] text-[#6b7280]">It will be built as closely as the theme allows</p>
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
        {...dropHandlers}
      >
        {dropTarget}
        {viewer}
        {header}
        <div data-ask-body="" className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {threadPane}
          {historyPane}
        </div>
        <div className="min-w-0 shrink-0 px-2.5 pb-2.5 pt-1.5">
          {tray}
          {composer}
        </div>
      </div>
    )
  }

  /* ── The dock ───────────────────────────────────────────────────────── */
  const g = box ? dockGeometry(box.w, box.h, maximized, box.vh) : null
  const showPill = !hidden && !suspended && g !== null
  const cardOpen = expanded && showPill
  const pillAway = !showPill || (yielding && !cardOpen)
  const fade = (shown: boolean, away: string, openMs = OPEN_MS, closeMs = CLOSE_MS): React.CSSProperties => ({
    transform: shown ? "none" : away,
    opacity: shown ? 1 : 0,
    visibility: shown ? "visible" : "hidden",
    pointerEvents: shown ? "auto" : "none",
    transition: reducedMotion
      ? "none"
      : shown
        ? `transform ${openMs}ms ${EASE}, opacity ${Math.round(openMs * 0.66)}ms ease-out, visibility 0s`
        : `transform ${closeMs}ms ${EASE}, opacity ${closeMs - 40}ms ease-in, visibility 0s linear ${closeMs}ms`,
  })

  return (
    <div
      ref={dockRef}
      data-ask-dock=""
      data-state={!showPill ? "hidden" : cardOpen ? "open" : "pill"}
      data-maximized={maximized ? "true" : "false"}
      className={cn("pointer-events-none absolute inset-0", cardOpen ? "z-40" : "z-20")}
      {...dropHandlers}
    >
      {viewer}
      {g && box && (
        <>
          {/*
            THE HALO. The canvas just around the pill is softly blurred and
            lifted towards white, fading out to nothing at its edge, so the
            pill floats over the page rather than being stuck on it.
          */}
          <div
            aria-hidden
            data-ask-halo=""
            className="pointer-events-none absolute"
            style={{
              left: (box.w - g.pillW) / 2 - 56,
              width: g.pillW + 112,
              bottom: 0,
              height: g.pillBottom + pillHeight + 36,
              background: "rgba(248, 249, 250, 0.38)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              maskImage: "radial-gradient(closest-side, #000 42%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(closest-side, #000 42%, transparent 100%)",
              opacity: showPill && !cardOpen && !pillAway ? 1 : 0,
              transition: reducedMotion ? "none" : "opacity 240ms ease-out",
            }}
          />

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
              ...fade(cardOpen, "translateY(18px) scale(0.965)"),
            }}
          >
            <div
              ref={surfaceRef}
              data-ask-surface=""
              className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white/[0.97] shadow-[0_32px_80px_-28px_rgba(15,23,42,0.38),0_10px_28px_-14px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150"
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
            <div data-ask-pill-state={pillAway ? "away" : "shown"} style={fade(!pillAway, "translateY(14px) scale(0.98)", 280, 200)}>
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
