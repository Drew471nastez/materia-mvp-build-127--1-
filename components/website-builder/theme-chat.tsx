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

import * as React from "react"
import {
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  RotateCcw,
  ImagePlus,
  Square,
  TriangleAlert,
  X,
} from "lucide-react"

import { StorelibMark } from "@/components/storelib-mark"
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
    detail: "Default, fast and good at everything here",
    provider: "anthropic",
    tier: "fast",
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    detail: "Slower and dearer. For a change you know is hard",
    provider: "anthropic",
    tier: "strong",
  },
  {
    id: "openai",
    label: "ChatGPT",
    detail: "The previous engine",
    provider: "openai",
    tier: "fast",
  },
] as const

type EngineId = (typeof ENGINES)[number]["id"]

const ENGINE_KEY = "storelib.theme-chat.engine"

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

export function ThemeChat({
  installId,
  page,
  sections,
  settings,
  selectedSectionId,
  onRunStart,
  onRunEnd,
  onOp,
  onClose,
  onOpenCodeEditor,
}: {
  installId: string
  /**
   * Opens the code editor at a path. A section the assistant writes is a file,
   * and the honest end of that is the creator reading it — not a thing that
   * appeared on their site without them seeing what it was.
   */
  onOpenCodeEditor?: (path: string) => void
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
  onOp: (op: ThemeOp) => void
  onClose: () => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [historyError, setHistoryError] = React.useState<null | "not_set_up" | "read_failed">(null)
  const [draft, setDraft] = React.useState("")
  /**
   * WHICH OF THE TWO THINGS IS BEING ASKED FOR. "change" edits this page and
   * goes to the agent; "code" writes a new section type and goes to the one
   * endpoint that compiles a file before keeping it. They are different acts
   * with different answers, and a single box that guessed between them would
   * guess wrong on "add a comparison table" — which could mean either.
   */
  const [mode, setMode] = React.useState<"change" | "code">("change")
  /** The last section written, so the panel can offer to open it. */
  const [written, setWritten] = React.useState<{ path: string; name: string } | null>(null)
  const [writing, setWriting] = React.useState(false)
  const [writeError, setWriteError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
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
  const bottomRef = React.useRef<HTMLDivElement>(null)
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
  const live = React.useRef({ sections, settings, page, selectedSectionId, locked, engine: chosenEngine })
  live.current = { sections, settings, page, selectedSectionId, locked, engine: chosenEngine }

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [exchanges])

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
   */
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/website-builder/themes/${installId}/chat`)
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
          messages: Array<{ id: string; role: string; content: string; ops: unknown[]; error: string | null }>
        }
        if (cancelled) return

        const restored: Exchange[] = []
        for (const message of body.messages) {
          if (message.role === "user") {
            restored.push({ id: message.id, prompt: message.content, changes: [], running: false })
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
        setExchanges(restored)
      } catch {
        if (!cancelled) setHistoryError("read_failed")
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [installId])

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
          }),
        })

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

            let event: { type: string; op?: ThemeOp; label?: string; text?: string; message?: string }
            try {
              event = JSON.parse(line)
            } catch {
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
            } else if (event.type === "op" && event.op) {
              if (!snapshotTaken) {
                onRunStart()
                snapshotTaken = true
              }
              onOp(event.op)
              const label = event.label ?? "Changed the page"
              patch((e) => ({ ...e, changes: [...e.changes, label] }))
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
    [busy, installId, onOp, onRunStart, onRunEnd],
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
    async (prompt: string) => {
      setWriting(true)
      setWriteError(null)
      setWritten(null)
      try {
        const res = await fetch(`/api/website-builder/themes/${installId}/sections/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        })
        const d = (await res.json().catch(() => ({}))) as {
          path?: string
          name?: string
          error?: string
          errors?: { line?: number; message: string }[]
        }
        if (!res.ok) {
          setWriteError(
            d.errors?.length
              ? `${d.error ?? "It did not compile."} ${d.errors[0].line ? `Line ${d.errors[0].line}: ` : ""}${d.errors[0].message}`
              : d.error ?? "That did not work.",
          )
          return
        }
        if (d.path && d.name) setWritten({ path: d.path, name: d.name })
      } catch {
        setWriteError("The assistant could not be reached.")
      } finally {
        setWriting(false)
      }
    },
    [installId],
  )

  const submit = React.useCallback(
    (text: string) => {
      const prompt = text.trim()
      const images = attached
      if (!prompt && images.length === 0) return
      setDraft("")
      if (mode === "code") {
        if (writing) return
        void writeOne(prompt)
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

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <StorelibMark className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />
        <span className="flex-1 truncate text-[13px] font-medium">Ask Storelib</span>

        {/*
          WHICH MODEL, in the header rather than a settings page — it is a
          per-message decision ("this one is hard, use Opus"), and a choice
          buried two screens away is one nobody makes.
        */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEngineOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={engineOpen}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Which model answers"
          >
            <span className="max-w-[92px] truncate">{chosenEngine.label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
          </button>

          {engineOpen && (
            <>
              {/* Click-away. A menu you can only close by choosing something
                  is a menu people close by choosing the wrong thing. */}
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={() => setEngineOpen(false)}
              />
              <ul
                role="listbox"
                className="absolute right-0 top-8 z-50 w-[236px] overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lg"
              >
                {ENGINES.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.id === engine}
                      onClick={() => chooseEngine(option.id)}
                      className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <Check
                        className={cn(
                          "mt-[3px] h-3 w-3 shrink-0",
                          option.id === engine ? "opacity-100" : "opacity-0",
                        )}
                        strokeWidth={2.5}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-foreground">{option.label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {option.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loadingHistory ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading
          </p>
        ) : historyError === "not_set_up" ? (
          <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-3 py-3">
            <p className="text-[13px] font-medium">Chat history is not switched on yet.</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              This database has nowhere to keep the conversation, so it will not survive a reload.
              Everything else works. Ask for a change and it is made.
            </p>
          </div>
        ) : historyError === "read_failed" ? (
          <div className="rounded-[10px] border border-red-500/30 bg-red-500/5 px-3 py-3">
            <p className="text-[13px] font-medium">We could not load this conversation.</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Nothing has been lost. This is a problem reading it, not a problem with it. You can
              still ask for a change.
            </p>
          </div>
        ) : exchanges.length === 0 ? (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {mode === "change"
                ? "Describe a change and it is made on this page. It writes the same sections, blocks and controls the panels do, the same sliders, pickers and colours, so everything stays undoable and nothing saves until you press Save."
                : "Describe a section the library does not have and it is written as a .storelib file: blocks, your colour scheme, responsive rules. It has to compile before it is kept, and it lands in the code editor for you to read before it goes anywhere near a page."}
            </p>

            <div className="space-y-1.5">
              {(mode === "change" ? SUGGESTIONS : CODE_SUGGESTIONS).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion)
                    fieldRef.current?.focus()
                    requestAnimationFrame(resize)
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] leading-snug text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>

          </div>
        ) : (
          <ul className="space-y-5">
            {exchanges.map((exchange) => (
              <li key={exchange.id} className="space-y-2">
                {exchange.images && exchange.images.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {exchange.images.map((image) => (
                      /* eslint-disable-next-line @next/next/no-img-element -- a data URL held in memory for this thread only. */
                      <img
                        key={image.id}
                        src={image.url}
                        alt={image.name}
                        className="h-16 w-16 rounded-lg border border-border object-cover"
                      />
                    ))}
                  </div>
                )}
                <p className="text-[13px] text-foreground">{exchange.prompt}</p>

                {exchange.changes.length > 0 && (
                  <ul className="space-y-1 border-l border-border pl-3">
                    {exchange.changes.map((change, index) => (
                      <li
                        key={`${change}-${index}`}
                        className="flex items-center gap-2 text-[12px] text-muted-foreground"
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
                    className="animate-in fade-in text-[12.5px] leading-relaxed text-muted-foreground duration-300"
                  >
                    {exchange.note}
                  </p>
                )}

                {exchange.running && (
                  <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Working
                  </p>
                )}

                {exchange.reply && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{exchange.reply}</p>
                )}

                {exchange.error && (
                  <div className="space-y-1.5">
                    <p className="flex items-start gap-1.5 text-[12px] text-red-500">
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
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={2} />
                      Try again
                    </button>
                  </div>
                )}
              </li>
            ))}
            {queued && (
              <li className="flex items-start gap-2 text-[12.5px] text-muted-foreground/70">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>
                  Up next: <span className="text-foreground/70">{queued}</span>
                </span>
              </li>
            )}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2.5">
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
        <div className="mb-2 flex gap-1 rounded-lg bg-muted/60 p-0.5">
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
                "flex-1 rounded-[7px] px-2 py-1.5 text-[12px] font-medium transition-colors",
                mode === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* What the writer produced, or why it could not. Also stranded in
            the empty state before: a section written after any exchange was
            reported to nobody. */}
        {written && (
          <div className="mb-2 rounded-lg border border-border bg-background p-3">
            <p className="text-[13px] font-medium text-foreground">{written.name} is written</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              It compiled and is saved as <span className="font-mono text-[12px]">{written.path}</span>.
              It is in Add Section under Created by you, and not published until you publish.
            </p>
            {onOpenCodeEditor && (
              <button
                type="button"
                onClick={() => onOpenCodeEditor(written.path)}
                className="mt-2 h-7 rounded-md bg-foreground px-2.5 text-[12px] font-[550] text-background"
              >
                Open it
              </button>
            )}
          </div>
        )}

        {writeError && (
          <p className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12.5px] leading-snug text-foreground">
            {writeError}
          </p>
        )}

        {/* The same report while it is still happening. */}
        {writing && (
          <p className="mb-2 flex items-center gap-2 px-0.5 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            Writing it, then compiling it. A section that does not compile is not kept.
          </p>
        )}

        {/*
          THE SCOPE OF THE EDIT, WHERE YOU ARE ABOUT TO TYPE IT.
          Not buried in a menu and not implied by the sentence: the chip says
          what will change before you ask for it, and one click changes the
          answer.
        */}
        {selectedSection && (
          <div className="mb-2 flex items-center gap-1.5 px-0.5">
            {locked ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-foreground/15 bg-muted/60 py-1 pl-2 pr-1 text-[11.5px] text-foreground">
                  <Lock className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2} />
                  <span className="truncate">Only {selectedSection.name}</span>
                  <button
                    type="button"
                    onClick={() => setLockOn(false)}
                    aria-label={`Stop limiting edits to ${selectedSection.name}`}
                    title="Edit the whole page instead"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X className="h-3 w-3" strokeWidth={2.25} />
                  </button>
                </span>
                <span className="truncate text-[11px] text-muted-foreground/70">
                  nothing else will change
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLockOn(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                <Lock className="h-3 w-3 opacity-60" strokeWidth={2} />
                Editing the whole page. Limit to {selectedSection.name}
              </button>
            )}
          </div>
        )}
        <div
          className="rounded-xl border border-border bg-background focus-within:border-foreground/30"
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
            void attach(event.dataTransfer.files)
          }}
        >
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attached.map((image) => (
                <div key={image.id} className="group/att relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the creator's own file; there is nothing to optimise and nowhere to fetch it from. */}
                  <img
                    src={image.url}
                    alt={image.name}
                    className="h-14 w-14 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(image.id)}
                    aria-label={`Remove ${image.name}`}
                    /**
                     * The cross is 20px because a bigger one would sit on the
                     * picture rather than beside it. The `after` box is the
                     * part a thumb hits: 36px, invisible, over the corner.
                     */
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-foreground"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachError && (
            <p className="px-3 pt-2 text-[11px] text-amber-600">{attachError}</p>
          )}
          {/*
            NOT `disabled` while a run is going. Waiting for a spinner before
            you are allowed to type your next thought is the difference between
            a conversation and a form. Enter during a run queues it instead.
          */}
          <textarea
            ref={fieldRef}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
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
            placeholder={mode === "code" ? "Describe a section, or attach a picture of one…" : busy ? "Ask for the next change…" : attached.length ? "Say what this is for, or just send it" : "Change this page, or attach a picture…"}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-snug outline-none placeholder:text-muted-foreground/50"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="pl-1 text-[11px] text-muted-foreground/60">
              {busy ? "Enter queues it" : "Enter to send, ⇧Enter for a new line"}
            </span>
            <div className="flex items-center gap-1.5">
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attached.length >= MAX_IMAGES}
                aria-label="Attach a picture"
                title={attached.length >= MAX_IMAGES ? `${MAX_IMAGES} images is the limit` : "Attach a picture of what you want"}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              {busy && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop"
                  title="Stop"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={() => submit(draft)}
                disabled={draft.trim().length === 0 && attached.length === 0}
                aria-label={busy ? "Queue" : "Send"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-opacity",
                  draft.trim().length === 0 && attached.length === 0
                    ? "bg-muted text-muted-foreground/50"
                    : "bg-foreground text-background",
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
