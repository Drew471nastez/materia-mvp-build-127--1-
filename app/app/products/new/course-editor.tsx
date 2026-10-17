"use client"

/**
 * ===========================================================================
 *  THE COURSE CARD IN THE PRODUCT EDITOR
 * ===========================================================================
 * A course is a product whose buyers get lessons instead of files. This card
 * takes the Digital Files card's place when the product is a course:
 * modules, each with its lessons, in order; a lesson opens to its title, its
 * video (an upload, or a YouTube or Vimeo link), its notes, its downloads,
 * its captions and the free preview switch.
 *
 * Every change is saved as it is made (app/api/courses/manage), not with the
 * product's Save: a two gigabyte video should not wait for a button, and a
 * lesson list half saved is worse than one saved line by line. A new
 * product is saved as a draft first, the same way the first file upload
 * does it, because a lesson needs a product to belong to.
 *
 * Videos and files go to the private bucket, straight from the browser, and
 * are checked where they land before a lesson points at them.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { ArrowDown, ArrowUp, Captions, ChevronDown, Film, ImagePlus, Link2, Loader2, Paperclip, Play, Plus, Trash2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { externalVideo } from "@/lib/courses/external"
import { clock } from "@/lib/courses/progress"
import { UploadStopped, manageCourse, uploadLessonFile, videoLength, type LessonFileKind } from "@/lib/courses/upload-client"
import type { EditorLesson, EditorModule, EditorTree } from "@/lib/courses/types"
import { namesAny, newRowId, treeOnScreen } from "@/lib/courses/editor-ops"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { secondaryDepth } from "./editor-buttons"
import { SWITCH_GROUP, SwitchRow } from "./editor-controls"
import { useConfirm } from "./confirm-sheet"
import { tt } from "@/lib/i18n/text"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { isBlankHtml, toEditorHtml } from "@/lib/rich-text/html"
import { FillBar } from "@/components/ui/fill-bar"

const TOOL =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] disabled:pointer-events-none disabled:opacity-35 sm:h-8 sm:w-8 [-webkit-tap-highlight-color:transparent]"
const FIELD =
  "w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-sm"
/* 40px on a phone, the tap size every phone control here keeps; 32px from 640px as before. */
const SMALL = cn(secondaryDepth, "h-10 shrink-0 rounded-lg px-3 text-[13px] sm:h-8")

type Uploading = { percent: number; name: string; sent: number; total: number; retrying: boolean; stop: () => void }

function bytes(n: number | null): string {
  if (!n) return ""
  if (n < 1024 * 1024) return tt("{value} KB", { value: Math.max(1, Math.round(n / 1024)) })
  if (n < 1024 ** 3) return tt("{value} MB", { value: (n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0) })
  return tt("{value} GB", { value: (n / 1024 ** 3).toFixed(1) })
}

export interface CourseEditorProps {
  productId: string | null
  /** Saves the product as a draft when it has no id yet; null when it could not be. */
  ensureProductId: () => Promise<string | null>
  /** How many lessons there are, for the editor's publish check. */
  onLessonCount: (n: number) => void
  notify: (message: string) => void
}

/** One change waiting for the server, and who is waiting to hear how it went. */
interface PendingOp {
  body: Record<string, unknown>
  /** Ids this change makes (a new module and its first lesson): a change still waiting that names one goes with it on a failure. */
  creates?: string[]
  done: (tree: EditorTree | null) => void
}

/*
  SMOOTH REORDER (round 33). A module or a lesson moved up or down glides from where it was to where it is, over 220ms:
  where every row stands is read just before the change (snap), and once React has put the rows in their new order each
  is moved back by the difference and let go. A lesson inside a module that moved glides only by what is its own, so it
  does not travel twice. Nothing animates when the motion setting asks for less.
*/
const GLIDE_MS = 220
function useGlide(container: RefObject<HTMLElement | null>, order: string): () => void {
  const before = useRef<Map<string, number> | null>(null)
  const snap = useCallback(() => {
    const root = container.current
    if (!root) return
    before.current = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-glide]")).map((el) => [el.dataset.glide ?? "", el.getBoundingClientRect().top]))
  }, [container])
  useLayoutEffect(() => {
    const root = container.current
    const was = before.current
    before.current = null
    if (!root || !was) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const moved = new Map<Element, number>()
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-glide]"))) {
      const from = was.get(el.dataset.glide ?? "")
      if (from !== undefined) moved.set(el, from - el.getBoundingClientRect().top)
    }
    for (const [el, by] of moved) {
      const parent = el.parentElement?.closest("[data-glide]")
      const own = by - (parent ? (moved.get(parent) ?? 0) : 0)
      if (Math.abs(own) > 1 && typeof (el as HTMLElement).animate === "function") (el as HTMLElement).animate([{ translate: `0 ${own}px` }, { translate: "0 0" }], { duration: GLIDE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    }
  }, [container, order])
  return snap
}

export function CourseEditor({ productId, ensureProductId, onLessonCount, notify }: CourseEditorProps) {
  const [tree, setTree] = useState<EditorTree | null>(productId ? null : { courseId: null, modules: [] })
  const [openId, setOpenId] = useState<string | null>(null)
  /* The row whose name takes the caret once it is drawn: a module just added, or a lesson just added. */
  const [focusId, setFocusId] = useState<string | null>(null)
  const [uploads, setUploads] = useState<Record<string, Uploading>>({})
  const [ask, confirmSheet] = useConfirm()
  const idRef = useRef(productId)
  idRef.current = productId
  const listRef = useRef<HTMLDivElement>(null)

  /*
    EVERY CHANGE SHOWS AT ONCE AND IS SAVED BEHIND IT (round 33: "adding a module is not smooth and takes too much
    time"). The tree on screen is the last one the server answered with, plus every change still on its way, applied
    here the way the server will apply it (optimistic). The changes go one at a time, in the order they were made, so a
    rename sent while its module is still being made arrives after it. A change that fails comes off again, with the
    reason, and so does anything waiting that names a row it was making.
  */
  const confirmed = useRef<EditorTree | null>(tree)
  const queue = useRef<PendingOp[]>([])
  const running = useRef(false)
  const redraw = useCallback(() => {
    const base = confirmed.current
    if (!base) return
    setTree(treeOnScreen(base, queue.current.map((op) => op.body)))
  }, [])
  const confirm = useCallback(
    (next: EditorTree) => {
      confirmed.current = next
      redraw()
    },
    [redraw],
  )

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    fetch(`/api/courses/manage?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { tree?: EditorTree }) => !cancelled && confirm(j.tree ?? { courseId: null, modules: [] }))
      .catch(() => !cancelled && confirm({ courseId: null, modules: [] }))
    return () => {
      cancelled = true
    }
  }, [productId, confirm])

  /*
    A VIDEO GOING UP IS NOT LEFT BY ACCIDENT. The bytes go from this page, so
    closing the tab or reloading stops them; the browser asks first while
    one is on its way. Leaving the editor inside the app keeps the page, so
    an upload under way finishes and is attached to its lesson all the same.
  */
  const uploading = Object.keys(uploads).length > 0
  useEffect(() => {
    if (!uploading) return
    const hold = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", hold)
    return () => window.removeEventListener("beforeunload", hold)
  }, [uploading])

  const count = tree ? tree.modules.reduce((n, m) => n + m.lessons.length, 0) : 0
  useEffect(() => {
    onLessonCount(count)
  }, [count, onLessonCount])

  const drain = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      while (queue.current.length) {
        const op = queue.current[0]
        const id = idRef.current ?? (await ensureProductId())
        if (!id) {
          /* The product could not be saved, so nothing waiting can be: every change comes off. */
          const dropped = queue.current
          queue.current = []
          redraw()
          dropped.forEach((d) => d.done(null))
          break
        }
        try {
          const next = await manageCourse({ ...op.body, productId: id })
          queue.current.shift()
          confirm(next)
          op.done(next)
        } catch (e) {
          queue.current.shift()
          const made = op.creates ?? []
          const dropped = made.length ? queue.current.filter((o) => namesAny(o.body, made)) : []
          if (dropped.length) queue.current = queue.current.filter((o) => !dropped.includes(o))
          redraw()
          notify(e instanceof Error ? e.message : tt("That did not save. Try again."))
          op.done(null)
          dropped.forEach((d) => d.done(null))
        }
      }
    } finally {
      running.current = false
    }
  }, [confirm, ensureProductId, notify, redraw])

  const act = useCallback(
    (body: Record<string, unknown>, creates?: string[]): Promise<EditorTree | null> =>
      new Promise((resolve) => {
        if (!confirmed.current) confirmed.current = { courseId: null, modules: [] }
        queue.current.push({ body, creates, done: resolve })
        redraw()
        void drain()
      }),
    [drain, redraw],
  )

  const upload = useCallback(
    async (lessonId: string, kind: LessonFileKind, file: File) => {
      const id = idRef.current
      if (!id) return
      const key = `${lessonId}:${kind}:${kind === "attachment" ? file.name : ""}`
      const controller = new AbortController()
      setUploads((u) => ({ ...u, [key]: { percent: 0, name: file.name, sent: 0, total: file.size, retrying: false, stop: () => controller.abort() } }))
      const length = kind === "video" ? videoLength(file) : Promise.resolve(null)
      try {
        let next = await uploadLessonFile({
          productId: id,
          lessonId,
          kind,
          file,
          signal: controller.signal,
          onProgress: (percent, sent) => setUploads((u) => (u[key] && (u[key].percent !== percent || u[key].retrying) ? { ...u, [key]: { ...u[key], percent, sent, retrying: false } } : u)),
          onRetry: () => setUploads((u) => (u[key] ? { ...u, [key]: { ...u[key], retrying: true } } : u)),
        })
        const seconds = await length
        if (seconds) next = await manageCourse({ action: "update-lesson", productId: id, lessonId, durationSeconds: seconds }).catch(() => next)
        confirm(next)
      } catch (e) {
        if (!(e instanceof UploadStopped)) notify(e instanceof Error ? e.message : tt("The upload did not finish. Try again."))
      } finally {
        setUploads((u) => {
          const rest = { ...u }
          delete rest[key]
          return rest
        })
      }
    },
    [confirm, notify],
  )

  /* A module is there the moment Add module is pressed, with its first lesson, the caret in its name. */
  const addModule = () => {
    const moduleId = newRowId()
    const lessonId = newRowId()
    const title = tt("Module {value}", { value: (tree?.modules.length ?? 0) + 1 })
    void act({ action: "add-module", moduleId, lessonId, title, lessonTitle: tt("Lesson {value}", { value: 1 }) }, [moduleId, lessonId])
    setFocusId(moduleId)
  }
  const addLesson = (m: EditorModule) => {
    const lessonId = newRowId()
    void act({ action: "add-lesson", moduleId: m.id, lessonId, title: tt("Lesson {value}", { value: m.lessons.length + 1 }) }, [lessonId])
    setOpenId(lessonId)
    setFocusId(lessonId)
  }
  const clearFocus = useCallback(() => setFocusId(null), [])

  const order = tree ? tree.modules.map((m) => `${m.id}:${m.lessons.map((l) => l.id).join(",")}`).join("|") : ""
  const snap = useGlide(listRef, order)
  /* A move: where everything stands is read first, so the rows glide to their new places. */
  const reorder = useCallback(
    (body: Record<string, unknown>) => {
      snap()
      void act(body)
    },
    [act, snap],
  )

  if (!tree) {
    return (
      <div className="flex items-center gap-2 py-6 text-[14px] text-[#6b7280]">
        <Loader2 className="h-4 w-4 animate-spin" /> {tt("Loading lessons")}
      </div>
    )
  }

  /* Lesson numbers run through the whole course, as the buyer sees them. */
  const starts = tree.modules.map((_, i) => tree.modules.slice(0, i).reduce((n, x) => n + x.lessons.length, 0) + 1)
  return (
    <div data-course-editor className="space-y-3" ref={listRef}>
      {tree.modules.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-7 text-center">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("No lessons yet")}</p>
          <p className="mx-auto mt-1 max-w-[340px] text-[13px] text-[#6b7280]">{tt("Lessons sit in modules. Start with one module; you can add more and reorder them later.")}</p>
          <button type="button" onClick={addModule} className={cn(SMALL, "mt-3")} data-add-module>
            <Plus className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
            {tt("Add a module")}
          </button>
        </div>
      ) : null}

      {tree.modules.map((m, mi) => (
        <ModuleBlock
          key={m.id}
          module={m}
          index={mi}
          modules={tree.modules}
          firstNumber={starts[mi]}
          openId={openId}
          setOpenId={setOpenId}
          focusId={focusId}
          onFocused={clearFocus}
          uploads={uploads}
          act={act}
          reorder={reorder}
          upload={upload}
          ask={ask}
          onAddLesson={() => addLesson(m)}
          notify={notify}
        />
      ))}

      {tree.modules.length > 0 ? (
        <button type="button" onClick={addModule} className={SMALL} data-add-module>
          <Plus className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
          {tt("Add module")}
        </button>
      ) : null}
      {confirmSheet}
    </div>
  )
}

/** A picture for a module or a lesson: uploaded to the product pictures folder, the same as a product's photos. */
async function uploadCover(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(tt("Pick a picture: JPG, PNG or WebP."))
  const uploader = new DirectUploader({ file, folder: "product-images" })
  try {
    const result = await uploader.start()
    if (!result.publicUrl) throw new Error(tt("The picture did not upload. Try again."))
    return result.publicUrl
  } finally {
    uploader.destroy()
  }
}

/** The small 16:9 cover at the start of a module's bar, and the lesson's cover field: press to pick, a cross to take it off. */
function CoverThumb({ url, label, onChange, notify, size }: { url: string | null | undefined; label: string; onChange: (url: string | null) => void; notify: (m: string) => void; size: "bar" | "field" }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File) => {
    setBusy(true)
    try {
      onChange(await uploadCover(file))
    } catch (e) {
      notify(e instanceof Error ? e.message : tt("The picture did not upload. Try again."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className={cn("relative shrink-0 overflow-hidden rounded-md border border-black/[0.06] bg-[#f1f2f4]", size === "bar" ? "block h-[42px] w-14 sm:aspect-[16/9] sm:h-auto sm:w-12" : "block aspect-[16/9] w-full max-w-[240px] rounded-xl")} data-cover-thumb={size}>
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={url ? tt("Change the cover of {title}", { title: label }) : tt("Add a cover to {title}", { title: label })}
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-1.5 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]/40",
          url ? "text-transparent hover:bg-black/30 hover:text-white" : "text-[#6b7280] hover:bg-[#e9ebee]",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : !url ? <ImagePlus className="h-3.5 w-3.5" aria-hidden /> : null}
        {size === "field" && !busy ? (url ? tt("Change") : tt("Add a cover, 16:9")) : null}
      </button>
      {url && size === "field" && !busy ? (
        <button type="button" onClick={() => onChange(null)} aria-label={tt("Remove the cover")} className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void pick(f)
        }}
      />
    </span>
  )
}

function ModuleBlock(props: {
  module: EditorModule
  index: number
  modules: EditorModule[]
  firstNumber: number
  openId: string | null
  setOpenId: (id: string | null) => void
  focusId: string | null
  onFocused: () => void
  uploads: Record<string, Uploading>
  act: (body: Record<string, unknown>, creates?: string[]) => Promise<EditorTree | null>
  reorder: (body: Record<string, unknown>) => void
  upload: (lessonId: string, kind: LessonFileKind, file: File) => Promise<void>
  ask: ReturnType<typeof useConfirm>[0]
  onAddLesson: () => void
  notify: (message: string) => void
}) {
  const { module: m, index, modules, act } = props
  const [name, setName] = useState(m.title)
  const focused = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focused.current) setName(m.title)
  }, [m.title])
  /* Just added: the caret goes into its name with the name selected, so typing replaces "Module 2". */
  const wantsFocus = props.focusId === m.id
  const { onFocused } = props
  useEffect(() => {
    if (!wantsFocus) return
    const el = nameRef.current
    if (el) {
      el.focus({ preventScroll: false })
      el.select()
      el.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
    }
    onFocused()
  }, [wantsFocus, onFocused])

  const move = (dir: -1 | 1) => {
    const ids = modules.map((x) => x.id)
    const at = ids.indexOf(m.id)
    if (at + dir < 0 || at + dir >= ids.length) return
    ;[ids[at], ids[at + dir]] = [ids[at + dir], ids[at]]
    props.reorder({ action: "order-modules", ids })
  }

  const moveLesson = (lessonId: string, dir: -1 | 1) => {
    const ids = m.lessons.map((l) => l.id)
    const at = ids.indexOf(lessonId)
    if (at + dir < 0 || at + dir >= ids.length) return
    ;[ids[at], ids[at + dir]] = [ids[at + dir], ids[at]]
    props.reorder({ action: "order-lessons", moduleId: m.id, ids })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" data-module={m.id} data-glide={m.id}>
      <div className="flex items-center gap-1 bg-[#fafafb] py-1.5 pl-3 pr-1.5 sm:pl-4">
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#9ca3af]">{index + 1}</span>
        <span className="ml-1.5 flex shrink-0">
          <CoverThumb url={m.coverUrl} label={m.title} size="bar" notify={props.notify} onChange={(coverUrl) => void act({ action: "update-module", moduleId: m.id, coverUrl })} />
        </span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            if (name.trim() && name.trim() !== m.title) void act({ action: "rename-module", moduleId: m.id, title: name })
            else setName(m.title)
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={tt("Module name")}
          data-module-name=""
          className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 text-[16px] font-semibold sm:min-h-0 text-[#1a1a2e] outline-none focus:bg-white focus:ring-2 focus:ring-[#8b5cf6]/20 sm:text-sm"
        />
        {modules.length > 1 ? (
          <>
            <button type="button" className={TOOL} disabled={index === 0} onClick={() => move(-1)} aria-label={tt("Move {title} up", { title: m.title })}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className={TOOL} disabled={index === modules.length - 1} onClick={() => move(1)} aria-label={tt("Move {title} down", { title: m.title })}>
              <ArrowDown className="h-4 w-4" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={cn(TOOL, "hover:text-[#dc2626]")}
          aria-label={tt("Delete {title}", { title: m.title })}
          onClick={async () => {
            const yes =
              m.lessons.length === 0 ||
              (await props.ask({
                title: tt("Delete {title}?", { title: m.title }),
                body: tt("Its {length, plural, one {# lesson} other {# lessons}}, their videos and files go too, and buyers lose them.", { length: m.lessons.length }),
                confirm: tt("Delete module"),
                cancel: tt("Keep it"),
                tone: "critical",
              }))
            if (yes) void act({ action: "delete-module", moduleId: m.id })
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ol className="divide-y divide-[#f0f1f3]">
        {m.lessons.map((l, li) => (
          <LessonRow
            key={l.id}
            lesson={l}
            number={props.firstNumber + li}
            open={props.openId === l.id}
            onToggle={() => props.setOpenId(props.openId === l.id ? null : l.id)}
            canUp={li > 0}
            canDown={li < m.lessons.length - 1}
            onMove={(dir) => moveLesson(l.id, dir)}
            focus={props.focusId === l.id}
            onFocused={props.onFocused}
            uploads={props.uploads}
            act={act}
            upload={props.upload}
            ask={props.ask}
            notify={props.notify}
          />
        ))}
      </ol>

      <div className="border-t border-[#f0f1f3] px-3 py-2 sm:px-4">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#6b7280] sm:h-9 hover:bg-[#f4f5f7] hover:text-[#1a1a2e]"
          onClick={props.onAddLesson}
          data-add-lesson
        >
          <Plus className="h-3.5 w-3.5" />
          {tt("Add lesson")}
        </button>
      </div>
    </section>
  )
}

function LessonRow(props: {
  lesson: EditorLesson
  number: number
  open: boolean
  onToggle: () => void
  canUp: boolean
  canDown: boolean
  onMove: (dir: -1 | 1) => void
  /** Just added: its title takes the caret. */
  focus: boolean
  onFocused: () => void
  uploads: Record<string, Uploading>
  act: (body: Record<string, unknown>) => Promise<EditorTree | null>
  upload: (lessonId: string, kind: LessonFileKind, file: File) => Promise<void>
  ask: ReturnType<typeof useConfirm>[0]
  notify: (message: string) => void
}) {
  const { lesson: l, act } = props
  const videoUp = props.uploads[`${l.id}:video:`]
  const external = externalVideo(l.externalUrl)
  const what = videoUp ? (videoUp.retrying ? tt("Reconnecting") : tt("Uploading {percent}%", { percent: videoUp.percent })) : l.video ? tt("Video") : external ? (external.provider === "youtube" ? "YouTube" : "Vimeo") : tt("Text")
  return (
    <li data-lesson={l.id} data-glide={l.id} className="bg-white">
      <button type="button" onClick={props.onToggle} aria-expanded={props.open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#fafafb] sm:px-4">
        <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-[#9ca3af]">{props.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{l.title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[#9ca3af]">
            <span>{what}</span>
            {l.durationSeconds ? <span className="tabular-nums">{clock(l.durationSeconds)}</span> : null}
            {l.attachments.length ? <span>{tt("{n, plural, one {# file} other {# files}}", { n: l.attachments.length })}</span> : null}
            {l.isPreview ? <span className="font-medium text-[#8b5cf6]">{tt("Free preview")}</span> : null}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-[rotate]", props.open && "rotate-180")} />
      </button>
      {props.open ? <LessonPanel {...props} /> : null}
    </li>
  )
}

function LessonPanel(props: Parameters<typeof LessonRow>[0]) {
  const { lesson: l, act, upload, uploads } = props
  const [title, setTitle] = useState(l.title)
  const [notes, setNotes] = useState(l.notes)
  const [link, setLink] = useState(l.externalUrl)
  const editing = useRef<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const { focus, onFocused } = props
  useEffect(() => {
    if (!focus) return
    const el = titleRef.current
    if (el) {
      el.focus()
      el.select()
      el.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
    }
    onFocused()
  }, [focus, onFocused])
  const notesTimer = useRef<number | null>(null)
  useEffect(() => () => { if (notesTimer.current) window.clearTimeout(notesTimer.current) }, [])
  useEffect(() => {
    if (editing.current !== "title") setTitle(l.title)
    if (editing.current !== "notes") setNotes(l.notes)
    if (editing.current !== "link") setLink(l.externalUrl)
  }, [l.title, l.notes, l.externalUrl])

  const videoInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const captionInput = useRef<HTMLInputElement>(null)
  const videoUp = uploads[`${l.id}:video:`]
  const captionUp = uploads[`${l.id}:captions:`]
  const fileUps = Object.entries(uploads).filter(([k]) => k.startsWith(`${l.id}:attachment:`))

  const save = (field: "title" | "notes" | "link") => {
    editing.current = null
    if (field === "title" && title.trim() && title !== l.title) void act({ action: "update-lesson", lessonId: l.id, title })
    if (field === "notes" && notes !== l.notes) void act({ action: "update-lesson", lessonId: l.id, notes })
    if (field === "link" && link.trim() !== l.externalUrl) {
      if (link.trim() && !externalVideo(link)) return
      void act({ action: "update-lesson", lessonId: l.id, externalUrl: link.trim() })
    }
  }
  const badLink = !!link.trim() && !externalVideo(link)

  return (
    <div className="space-y-4 border-t border-[#f0f1f3] bg-white px-3 pb-4 pt-3 sm:px-4" data-lesson-panel>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700" htmlFor={`t-${l.id}`}>
          {tt("Lesson title")}
        </label>
        <input
          ref={titleRef}
          id={`t-${l.id}`}
          data-lesson-title=""
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => (editing.current = "title")}
          onBlur={() => save("title")}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className={cn(FIELD, "h-11")}
        />
      </div>

      {/* The video: an upload, or a link */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-gray-700">{tt("Video")}</p>
        {videoUp ? (
          <Progress up={videoUp} />
        ) : l.video ? (
          <>
          <LessonPlayer lessonId={l.id} />
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
            <Film className="h-4 w-4 shrink-0 text-[#6b7280]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{l.video.name}</span>
              <span className="text-[12px] text-[#9ca3af]">
                {bytes(l.video.size)}
                {l.durationSeconds ? ` · ${clock(l.durationSeconds)}` : ""} · {tt("Private, only buyers can watch")}
              </span>
            </span>
            <button type="button" className={SMALL} onClick={() => videoInput.current?.click()}>
              {tt("Replace")}
            </button>
            <button type="button" className={cn(TOOL, "hover:text-[#dc2626]")} aria-label={tt("Remove video")} onClick={() => void act({ action: "remove-video", lessonId: l.id })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          </>
        ) : l.externalUrl && externalVideo(l.externalUrl) && editing.current !== "link" ? (
          /* A saved YouTube or Vimeo link: the video itself, as buyers will see it, with a way to change it. */
          <div className="space-y-2" data-lesson-link-preview="">
            <EmbedPreview video={externalVideo(l.externalUrl)!} />
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#6b7280]">{l.externalUrl}</span>
              <button type="button" className={SMALL} onClick={() => void act({ action: "update-lesson", lessonId: l.id, externalUrl: "" })}>
                {tt("Remove")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => videoInput.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center transition-colors hover:border-gray-300 hover:bg-[#fafafb]"
              data-upload-video
            >
              <Upload className="h-5 w-5 text-[#6b7280]" />
              <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Upload a video")}</span>
              <span className="text-[12px] text-[#9ca3af]">{tt("MP4, MOV or WebM. Kept private; buyers stream it.")}</span>
            </button>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onFocus={() => (editing.current = "link")}
                onBlur={() => save("link")}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                placeholder={tt("Or paste a YouTube or Vimeo link")}
                className={cn(FIELD, "h-11 pl-9", badLink && "border-[#fca5a5] focus:border-[#ef4444] focus:ring-[#ef4444]/15")}
                inputMode="url"
              />
            </div>
            {badLink ? <p className="text-[12px] text-[#b91c1c]">{tt("That is not a YouTube or Vimeo link.")}</p> : null}
          </>
        )}
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) void upload(l.id, "video", f)
          }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-gray-700">{tt("Cover")}</p>
        <CoverThumb url={l.coverUrl} label={l.title} size="field" notify={props.notify} onChange={(coverUrl) => void act({ action: "update-lesson", lessonId: l.id, coverUrl })} />
        <p className="text-[12px] text-[#9ca3af]">{tt("Shown at the top of a lesson that has no video.")}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-gray-700">{tt("Notes")}</p>
        {/* The same editor as a product's description: headings, bold, lists, links. Saved a moment after typing stops. */}
        <RichTextEditor
          value={toEditorHtml(notes)}
          onChange={(html) => {
            setNotes(html)
            editing.current = "notes"
            if (notesTimer.current) window.clearTimeout(notesTimer.current)
            notesTimer.current = window.setTimeout(() => {
              editing.current = null
              if (html !== l.notes) void act({ action: "update-lesson", lessonId: l.id, notes: isBlankHtml(html) ? "" : html })
            }, 900)
          }}
          label={tt("Notes")}
          placeholder={tt("What this lesson covers, links, steps to follow")}
          tools={["h2", "h3", "bold", "italic", "underline", "bulletList", "numberedList", "quote", "link", "rule"]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-700">{tt("Files to download")}</p>
          <button type="button" className={SMALL} onClick={() => fileInput.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 text-[#6b7280]" />
            {tt("Add file")}
          </button>
        </div>
        {l.attachments.length || fileUps.length ? (
          <ul className="divide-y divide-[#f0f1f3] rounded-xl border border-gray-200">
            {l.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{a.name}</span>
                <span className="shrink-0 text-[12px] text-[#9ca3af]">{bytes(a.size)}</span>
                <button type="button" className={cn(TOOL, "hover:text-[#dc2626]")} aria-label={tt("Remove {name}", { name: a.name })} onClick={() => void act({ action: "remove-attachment", attachmentId: a.id })}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
            {fileUps.map(([k, u]) => (
              <li key={k} className="px-3 py-2">
                <Progress up={u} bare />
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ""
            for (const f of files) void upload(l.id, "attachment", f)
          }}
        />
      </div>

      <div className={SWITCH_GROUP}>
        <SwitchRow
          title={tt("Free preview")}
          hint={tt("Anyone can watch this lesson before they buy.")}
          checked={l.isPreview}
          onChange={(next) => void act({ action: "update-lesson", lessonId: l.id, isPreview: next })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {l.video ? (
          captionUp ? (
            <span className="text-[13px] text-[#6b7280]">{tt("Captions {percent}%", { percent: captionUp.percent })}</span>
          ) : l.captions ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-[#4b5563]">
              <Captions className="h-4 w-4" /> {tt("Captions added")}
              <button type="button" className="font-medium text-[#6b7280] underline underline-offset-2 hover:text-[#dc2626]" onClick={() => void act({ action: "remove-captions", lessonId: l.id })}>
                {tt("Remove")}
              </button>
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" className={SMALL} onClick={() => captionInput.current?.click()}>
                <Captions className="h-3.5 w-3.5 text-[#6b7280]" />
                {tt("Add captions")}
              </button>
              <span className="text-[12px] text-[#9ca3af]">{tt("A .vtt or .srt file. Buyers turn them on with CC in the player.")}</span>
            </span>
          )
        ) : null}
        <input
          ref={captionInput}
          type="file"
          accept=".vtt,.srt,text/vtt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) void upload(l.id, "captions", f)
          }}
        />
        <div className="ml-auto flex items-center">
          <button type="button" className={TOOL} disabled={!props.canUp} onClick={() => props.onMove(-1)} aria-label={tt("Move lesson up")}>
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" className={TOOL} disabled={!props.canDown} onClick={() => props.onMove(1)} aria-label={tt("Move lesson down")}>
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(TOOL, "hover:text-[#dc2626]")}
            aria-label={tt("Delete lesson")}
            onClick={async () => {
              const yes = await props.ask({
                title: tt("Delete {title}?", { title: l.title }),
                body: tt("Its video and files go too, and buyers lose the lesson."),
                confirm: tt("Delete lesson"),
                cancel: tt("Keep it"),
                tone: "critical",
              })
              if (yes) void act({ action: "delete-lesson", lessonId: l.id })
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * THE UPLOADED VIDEO, PLAYED RIGHT HERE. After an upload there was only a
 * file name: no way to see that the right video went up. A 16:9 frame that
 * asks the player's own route for a signed address (the creator can always
 * watch their own lesson) only when Play is pressed, so an editor with
 * twenty lessons loads no video until one is wanted.
 */
function LessonPlayer({ lessonId }: { lessonId: string }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "failed"; error: string }>({ kind: "idle" })
  const play = async () => {
    setState({ kind: "loading" })
    try {
      const r = await fetch(`/api/courses/lessons/${encodeURIComponent(lessonId)}/play`, { cache: "no-store" })
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!r.ok || !j.url) return setState({ kind: "failed", error: j.error || tt("This video could not be opened. Try again.") })
      setState({ kind: "ready", url: j.url })
    } catch {
      setState({ kind: "failed", error: tt("This video could not be opened. Try again.") })
    }
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#111318]" data-lesson-player="">
      {state.kind === "ready" ? (
        <video src={state.url} controls autoPlay playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
      ) : (
        <button type="button" onClick={() => void play()} disabled={state.kind === "loading"} className="absolute inset-0 grid place-items-center text-white" aria-label={tt("Play the video")}>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-transform hover:scale-105">
            {state.kind === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </span>
          {state.kind === "failed" ? <span className="absolute inset-x-0 bottom-3 px-4 text-center text-[12.5px] text-white/80">{state.error}</span> : null}
        </button>
      )}
    </div>
  )
}

/** A YouTube or Vimeo link, shown as the video: its picture first (YouTube's own thumbnail), the player once pressed. */
function EmbedPreview({ video }: { video: { provider: "youtube" | "vimeo"; id: string; embedUrl: string } }) {
  const [on, setOn] = useState(false)
  const thumb = video.provider === "youtube" ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#111318]" data-lesson-embed={video.provider}>
      {on ? (
        <iframe src={`${video.embedUrl}${video.embedUrl.includes("?") ? "&" : "?"}autoplay=1`} title={tt("Lesson video")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="absolute inset-0 grid place-items-center" aria-label={tt("Play the video")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : null}
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-transform hover:scale-105">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
          <span className="absolute bottom-2.5 left-3 rounded-md bg-black/55 px-2 py-0.5 text-[11.5px] font-medium text-white">{video.provider === "youtube" ? "YouTube" : "Vimeo"}</span>
        </button>
      )}
    </div>
  )
}

/** A file on its way: its name, how much of how much has gone, and a way to stop it. A dropped connection says it is being tried again. */
function Progress({ up, bare }: { up: Uploading; bare?: boolean }) {
  const { name, percent, stop: onStop } = up
  return (
    <div className={cn("flex items-center gap-3", !bare && "rounded-xl border border-gray-200 px-3 py-2.5")} data-upload-progress="">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-[#1a1a2e]">{name}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">
            {up.retrying ? tt("Connection lost, trying again") : up.total >= 5 * 1024 * 1024 ? tt("{value} of {total}", { value: bytes(up.sent) || "0 KB", total: bytes(up.total) }) : `${percent}%`}
          </span>
        </span>
        <FillBar quiet value={percent} className="mt-1.5" />
      </span>
      <button type="button" className={TOOL} onClick={onStop} aria-label={tt("Stop uploading {name}", { name })}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
