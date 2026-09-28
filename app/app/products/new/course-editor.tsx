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

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Captions, ChevronDown, Film, Link2, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { externalVideo } from "@/lib/courses/external"
import { clock } from "@/lib/courses/progress"
import { UploadStopped, manageCourse, uploadLessonFile, videoLength, type LessonFileKind } from "@/lib/courses/upload-client"
import type { EditorLesson, EditorModule, EditorTree } from "@/lib/courses/types"
import { secondaryDepth } from "./editor-buttons"
import { SWITCH_GROUP, SwitchRow } from "./editor-controls"
import { useConfirm } from "./confirm-sheet"

const TOOL =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] disabled:pointer-events-none disabled:opacity-35 sm:h-8 sm:w-8 [-webkit-tap-highlight-color:transparent]"
const FIELD =
  "w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-sm"
const SMALL = cn(secondaryDepth, "h-8 shrink-0 rounded-lg px-3 text-[13px]")

type Uploading = { percent: number; name: string; sent: number; total: number; retrying: boolean; stop: () => void }

function bytes(n: number | null): string {
  if (!n) return ""
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export interface CourseEditorProps {
  productId: string | null
  /** Saves the product as a draft when it has no id yet; null when it could not be. */
  ensureProductId: () => Promise<string | null>
  /** How many lessons there are, for the editor's publish check. */
  onLessonCount: (n: number) => void
  notify: (message: string) => void
}

export function CourseEditor({ productId, ensureProductId, onLessonCount, notify }: CourseEditorProps) {
  const [tree, setTree] = useState<EditorTree | null>(productId ? null : { courseId: null, modules: [] })
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploads, setUploads] = useState<Record<string, Uploading>>({})
  const [ask, confirmSheet] = useConfirm()
  const idRef = useRef(productId)
  idRef.current = productId

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    fetch(`/api/courses/manage?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { tree?: EditorTree }) => !cancelled && setTree(j.tree ?? { courseId: null, modules: [] }))
      .catch(() => !cancelled && setTree({ courseId: null, modules: [] }))
    return () => {
      cancelled = true
    }
  }, [productId])

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

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const id = idRef.current ?? (await ensureProductId())
      if (!id) return null
      setBusy(true)
      try {
        const next = await manageCourse({ ...body, productId: id })
        setTree(next)
        return next
      } catch (e) {
        notify(e instanceof Error ? e.message : "That did not save. Try again.")
        return null
      } finally {
        setBusy(false)
      }
    },
    [ensureProductId, notify],
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
        setTree(next)
      } catch (e) {
        if (!(e instanceof UploadStopped)) notify(e instanceof Error ? e.message : "The upload did not finish. Try again.")
      } finally {
        setUploads((u) => {
          const rest = { ...u }
          delete rest[key]
          return rest
        })
      }
    },
    [notify],
  )

  const addModule = async () => {
    const next = await act({ action: "add-module", title: `Module ${(tree?.modules.length ?? 0) + 1}` })
    const last = next?.modules[next.modules.length - 1]
    if (last?.lessons[0]) setOpenId(last.lessons[0].id)
  }

  if (!tree) {
    return (
      <div className="flex items-center gap-2 py-6 text-[14px] text-[#6b7280]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading lessons
      </div>
    )
  }

  /* Lesson numbers run through the whole course, as the buyer sees them. */
  const starts = tree.modules.map((_, i) => tree.modules.slice(0, i).reduce((n, x) => n + x.lessons.length, 0) + 1)
  return (
    <div data-course-editor className="space-y-3">
      {tree.modules.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-7 text-center">
          <p className="text-[14px] font-medium text-[#1a1a2e]">No lessons yet</p>
          <p className="mx-auto mt-1 max-w-[340px] text-[13px] text-[#6b7280]">Lessons sit in modules. Start with one module; you can add more and reorder them later.</p>
          <button type="button" onClick={addModule} disabled={busy} className={cn(SMALL, "mt-3")}>
            <Plus className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
            Add a module
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
          busy={busy}
          uploads={uploads}
          act={act}
          upload={upload}
          ask={ask}
        />
      ))}

      {tree.modules.length > 0 ? (
        <button type="button" onClick={addModule} disabled={busy} className={SMALL} data-add-module>
          <Plus className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
          Add module
        </button>
      ) : null}
      {confirmSheet}
    </div>
  )
}

function ModuleBlock(props: {
  module: EditorModule
  index: number
  modules: EditorModule[]
  firstNumber: number
  openId: string | null
  setOpenId: (id: string | null) => void
  busy: boolean
  uploads: Record<string, Uploading>
  act: (body: Record<string, unknown>) => Promise<EditorTree | null>
  upload: (lessonId: string, kind: LessonFileKind, file: File) => Promise<void>
  ask: ReturnType<typeof useConfirm>[0]
}) {
  const { module: m, index, modules, act } = props
  const [name, setName] = useState(m.title)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setName(m.title)
  }, [m.title])

  const move = (dir: -1 | 1) => {
    const ids = modules.map((x) => x.id)
    const at = ids.indexOf(m.id)
    ;[ids[at], ids[at + dir]] = [ids[at + dir], ids[at]]
    void act({ action: "order-modules", ids })
  }

  const moveLesson = (lessonId: string, dir: -1 | 1) => {
    const ids = m.lessons.map((l) => l.id)
    const at = ids.indexOf(lessonId)
    if (at + dir < 0 || at + dir >= ids.length) return
    ;[ids[at], ids[at + dir]] = [ids[at + dir], ids[at]]
    void act({ action: "order-lessons", moduleId: m.id, ids })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" data-module={m.id}>
      <div className="flex items-center gap-1 bg-[#fafafb] py-1.5 pl-3 pr-1.5 sm:pl-4">
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#9ca3af]">{index + 1}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            if (name.trim() && name.trim() !== m.title) void act({ action: "rename-module", moduleId: m.id, title: name })
            else setName(m.title)
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label="Module name"
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 text-[16px] font-semibold text-[#1a1a2e] outline-none focus:bg-white focus:ring-2 focus:ring-[#8b5cf6]/20 sm:text-sm"
        />
        {modules.length > 1 ? (
          <>
            <button type="button" className={TOOL} disabled={index === 0 || props.busy} onClick={() => move(-1)} aria-label={`Move ${m.title} up`}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className={TOOL} disabled={index === modules.length - 1 || props.busy} onClick={() => move(1)} aria-label={`Move ${m.title} down`}>
              <ArrowDown className="h-4 w-4" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={cn(TOOL, "hover:text-[#dc2626]")}
          aria-label={`Delete ${m.title}`}
          onClick={async () => {
            const yes =
              m.lessons.length === 0 ||
              (await props.ask({
                title: `Delete ${m.title}?`,
                body: `Its ${m.lessons.length} ${m.lessons.length === 1 ? "lesson" : "lessons"}, their videos and files go too, and buyers lose them.`,
                confirm: "Delete module",
                cancel: "Keep it",
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
            busy={props.busy}
            uploads={props.uploads}
            act={act}
            upload={props.upload}
            ask={props.ask}
          />
        ))}
      </ol>

      <div className="border-t border-[#f0f1f3] px-3 py-2 sm:px-4">
        <button
          type="button"
          disabled={props.busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#1a1a2e]"
          onClick={async () => {
            const next = await act({ action: "add-lesson", moduleId: m.id, title: `Lesson ${m.lessons.length + 1}` })
            const mod = next?.modules.find((x) => x.id === m.id)
            const added = mod?.lessons[mod.lessons.length - 1]
            if (added) props.setOpenId(added.id)
          }}
          data-add-lesson
        >
          <Plus className="h-3.5 w-3.5" />
          Add lesson
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
  busy: boolean
  uploads: Record<string, Uploading>
  act: (body: Record<string, unknown>) => Promise<EditorTree | null>
  upload: (lessonId: string, kind: LessonFileKind, file: File) => Promise<void>
  ask: ReturnType<typeof useConfirm>[0]
}) {
  const { lesson: l, act } = props
  const videoUp = props.uploads[`${l.id}:video:`]
  const external = externalVideo(l.externalUrl)
  const what = videoUp ? (videoUp.retrying ? "Reconnecting" : `Uploading ${videoUp.percent}%`) : l.video ? "Video" : external ? (external.provider === "youtube" ? "YouTube" : "Vimeo") : "Text"
  return (
    <li data-lesson={l.id}>
      <button type="button" onClick={props.onToggle} aria-expanded={props.open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#fafafb] sm:px-4">
        <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-[#9ca3af]">{props.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{l.title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[#9ca3af]">
            <span>{what}</span>
            {l.durationSeconds ? <span className="tabular-nums">{clock(l.durationSeconds)}</span> : null}
            {l.attachments.length ? <span>{l.attachments.length} {l.attachments.length === 1 ? "file" : "files"}</span> : null}
            {l.isPreview ? <span className="font-medium text-[#8b5cf6]">Free preview</span> : null}
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
          Lesson title
        </label>
        <input
          id={`t-${l.id}`}
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
        <p className="text-sm font-medium text-gray-700">Video</p>
        {videoUp ? (
          <Progress up={videoUp} />
        ) : l.video ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
            <Film className="h-4 w-4 shrink-0 text-[#6b7280]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{l.video.name}</span>
              <span className="text-[12px] text-[#9ca3af]">
                {bytes(l.video.size)}
                {l.durationSeconds ? ` · ${clock(l.durationSeconds)}` : ""} · Private, only buyers can watch
              </span>
            </span>
            <button type="button" className={SMALL} onClick={() => videoInput.current?.click()}>
              Replace
            </button>
            <button type="button" className={cn(TOOL, "hover:text-[#dc2626]")} aria-label="Remove video" onClick={() => void act({ action: "remove-video", lessonId: l.id })}>
              <Trash2 className="h-4 w-4" />
            </button>
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
              <span className="text-[14px] font-medium text-[#1a1a2e]">Upload a video</span>
              <span className="text-[12px] text-[#9ca3af]">MP4, MOV or WebM. Kept private; buyers stream it.</span>
            </button>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onFocus={() => (editing.current = "link")}
                onBlur={() => save("link")}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                placeholder="Or paste a YouTube or Vimeo link"
                className={cn(FIELD, "h-11 pl-9", badLink && "border-[#fca5a5] focus:border-[#ef4444] focus:ring-[#ef4444]/15")}
                inputMode="url"
              />
            </div>
            {badLink ? <p className="text-[12px] text-[#b91c1c]">That is not a YouTube or Vimeo link.</p> : null}
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
        <label className="text-sm font-medium text-gray-700" htmlFor={`n-${l.id}`}>
          Notes
        </label>
        <textarea
          id={`n-${l.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onFocus={() => (editing.current = "notes")}
          onBlur={() => save("notes")}
          rows={4}
          placeholder="What this lesson covers, links, steps to follow"
          className={cn(FIELD, "resize-y py-2.5 leading-6")}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-700">Files to download</p>
          <button type="button" className={SMALL} onClick={() => fileInput.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 text-[#6b7280]" />
            Add file
          </button>
        </div>
        {l.attachments.length || fileUps.length ? (
          <ul className="divide-y divide-[#f0f1f3] rounded-xl border border-gray-200">
            {l.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{a.name}</span>
                <span className="shrink-0 text-[12px] text-[#9ca3af]">{bytes(a.size)}</span>
                <button type="button" className={cn(TOOL, "hover:text-[#dc2626]")} aria-label={`Remove ${a.name}`} onClick={() => void act({ action: "remove-attachment", attachmentId: a.id })}>
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
          title="Free preview"
          hint="Anyone can watch this lesson before they buy."
          checked={l.isPreview}
          onChange={(next) => void act({ action: "update-lesson", lessonId: l.id, isPreview: next })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {l.video ? (
          captionUp ? (
            <span className="text-[13px] text-[#6b7280]">Captions {captionUp.percent}%</span>
          ) : l.captions ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-[#4b5563]">
              <Captions className="h-4 w-4" /> Captions added
              <button type="button" className="font-medium text-[#6b7280] underline underline-offset-2 hover:text-[#dc2626]" onClick={() => void act({ action: "remove-captions", lessonId: l.id })}>
                Remove
              </button>
            </span>
          ) : (
            <button type="button" className={SMALL} onClick={() => captionInput.current?.click()}>
              <Captions className="h-3.5 w-3.5 text-[#6b7280]" />
              Add captions
            </button>
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
          <button type="button" className={TOOL} disabled={!props.canUp || props.busy} onClick={() => props.onMove(-1)} aria-label="Move lesson up">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" className={TOOL} disabled={!props.canDown || props.busy} onClick={() => props.onMove(1)} aria-label="Move lesson down">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(TOOL, "hover:text-[#dc2626]")}
            aria-label="Delete lesson"
            onClick={async () => {
              const yes = await props.ask({
                title: `Delete ${l.title}?`,
                body: "Its video and files go too, and buyers lose the lesson.",
                confirm: "Delete lesson",
                cancel: "Keep it",
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

/** A file on its way: its name, how much of how much has gone, and a way to stop it. A dropped connection says it is being tried again. */
function Progress({ up, bare }: { up: Uploading; bare?: boolean }) {
  const { name, percent, stop: onStop } = up
  return (
    <div className={cn("flex items-center gap-3", !bare && "rounded-xl border border-gray-200 px-3 py-2.5")} data-upload-progress="">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-[#1a1a2e]">{name}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">
            {up.retrying ? "Connection lost, trying again" : up.total >= 5 * 1024 * 1024 ? `${bytes(up.sent) || "0 KB"} of ${bytes(up.total)}` : `${percent}%`}
          </span>
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
          <span className="block h-full rounded-full bg-[#8b5cf6] transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </span>
      </span>
      <button type="button" className={TOOL} onClick={onStop} aria-label={`Stop uploading ${name}`}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
