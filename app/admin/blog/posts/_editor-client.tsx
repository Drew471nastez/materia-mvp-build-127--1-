"use client"

import * as React from "react"

import BlogEditor, { blankBlock } from "@/components/admin/blog-editor"
import { Button, ConfirmDialog, cx } from "@/app/admin/_console/ui"
import type { Block } from "@/lib/blog/blocks"
import type { AdminPostView, BlogAuthor, BlogCategory, BlogSnippet } from "@/lib/blog/admin-store"
import { META_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT, emptyMeta, readTimeFor, slugify, type PostMeta } from "@/lib/blog/editor-model"

import { BlogBar, Field, Needs345, PostStatusDot, Section, Switch, field, formatAgo, formatWhen, toLocalInput } from "../_ui"

/**
 * ===========================================================================
 *  ONE POST, BEING WRITTEN
 * ===========================================================================
 * The page hands this the post as the server read it, so nothing is fetched
 * before the editor draws.
 *
 * SAVING. Every change is saved 1.5 s after typing stops. On a post that is
 * live (or scheduled) it is saved into the draft copy, and readers see the
 * change only on Update (lib/blog/admin-store.ts savePost). Saves go one at
 * a time, each naming the version it was made from; a 409 means another tab
 * saved first, and the editor stops and asks rather than save over it. A
 * failed save is tried again, sooner first. Leaving with something unsaved
 * asks first. Cmd+S saves now and keeps a revision in History.
 *
 * Before SQL part 345 there is no draft copy: a live post is not saved as it
 * is typed, only on Update, and the page says so.
 */

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string; retrying: boolean }
  | { kind: "conflict"; current: AdminPostView | null }

type Action = "autosave" | "save" | "publish" | "update" | "unpublish"

export interface EditorProps {
  initial: AdminPostView | null
  full: boolean
  categories: BlogCategory[]
  authors: BlogAuthor[]
  snippets: BlogSnippet[]
  tags: string[]
  note345: string
}

const AUTOSAVE_MS = 1500

function isBlank(meta: PostMeta, blocks: Block[]) {
  return !meta.title.trim() && blocks.every((b) => !(b.html ?? "").trim() && !b.url && !b.videoId && !(b.items ?? []).some(Boolean) && !b.text && b.type !== "hr" && b.type !== "table")
}

function byline(a: Pick<BlogAuthor, "name" | "role">) {
  return a.role ? `${a.name} - ${a.role}` : a.name
}

const short345 = (note: string) => note.replace(/ to turn this on\.$/, "")

export default function BlogPostEditorClient({ initial, full, categories, authors, snippets, tags, note345 }: EditorProps) {
  const [postId, setPostId] = React.useState<string | null>(initial?.id ?? null)
  const [view, setView] = React.useState<AdminPostView | null>(initial)
  const [meta, setMetaState] = React.useState<PostMeta>(() => initial?.meta ?? { ...emptyMeta(), author_id: authors[0]?.id ?? null, author_name: authors[0] ? byline(authors[0]) : "" })
  const [blocks, setBlocksState] = React.useState<Block[]>(() => (initial?.blocks?.length ? initial.blocks : [blankBlock("p")]))
  const [editorKey, setEditorKey] = React.useState(0)
  const [save, setSave] = React.useState<SaveState>(() => (initial ? { kind: "saved", at: Date.parse(initial.draft_saved_at ?? initial.updated_at ?? "") || Date.now() } : { kind: "idle" }))
  const [tab, setTab] = React.useState<"write" | "settings">("write")
  const [slugTouched, setSlugTouched] = React.useState(Boolean(initial))
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = React.useState(false)
  const [busy, setBusy] = React.useState<Action | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)

  const metaRef = React.useRef(meta)
  const blocksRef = React.useRef(blocks)
  const idRef = React.useRef(postId)
  const versionRef = React.useRef<string | null>(initial?.version ?? null)
  const viewRef = React.useRef(view)
  const editSeq = React.useRef(0)
  const savedSeq = React.useRef(0)
  const chain = React.useRef<Promise<unknown>>(Promise.resolve())
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const retry = React.useRef<{ t: ReturnType<typeof setTimeout> | null; n: number }>({ t: null, n: 0 })
  const conflict = React.useRef(false)
  const saveKind = React.useRef(save.kind)
  React.useLayoutEffect(() => {
    metaRef.current = meta
    blocksRef.current = blocks
    idRef.current = postId
    viewRef.current = view
    saveKind.current = save.kind
  })

  const status = view?.status ?? "draft"
  const isLiveish = status !== "draft"
  /** Before 345 a live post has no draft copy: nothing is saved until Update. */
  const autosaves = full || !isLiveish

  const flash = React.useCallback((text: string) => {
    setToast(text)
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2600)
  }, [])

  /* ── Saving ─────────────────────────────────────────────────────────── */

  const queueRef = React.useRef<(action: Action, extra?: { publish_at?: string | null; force?: boolean }) => Promise<boolean>>(async () => false)

  const scheduleRetry = React.useCallback((action: Action, message: string) => {
    const n = (retry.current.n = Math.min(retry.current.n + 1, 5))
    setSave({ kind: "error", message, retrying: true })
    if (retry.current.t) clearTimeout(retry.current.t)
    retry.current.t = setTimeout(() => queueRef.current(action), Math.min(30_000, 1000 * 2 ** n))
  }, [])

  const run = React.useCallback(
    async (action: Action, extra: { publish_at?: string | null; force?: boolean } = {}): Promise<boolean> => {
      if (conflict.current && !extra.force) return false
      const id = idRef.current
      if (!id && action === "autosave" && isBlank(metaRef.current, blocksRef.current)) return true
      const seq = editSeq.current
      const body = { action, version: versionRef.current, meta: metaRef.current, blocks: blocksRef.current, ...extra }
      setSave({ kind: "saving" })
      let res: Response
      try {
        res = await fetch(id ? `/api/admin/blog/posts/${id}` : "/api/admin/blog/posts", {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } catch {
        scheduleRetry(action, "You are offline or the server did not answer.")
        return false
      }
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.post) {
        retry.current.n = 0
        const post = data.post as AdminPostView
        versionRef.current = post.version
        viewRef.current = post
        setView(post)
        if (!id) {
          idRef.current = post.id
          setPostId(post.id)
          window.history.replaceState(null, "", `/admin/blog/posts/${post.id}`)
          if (post.meta.slug !== metaRef.current.slug) setMetaState((m) => ({ ...m, slug: post.meta.slug }))
        }
        savedSeq.current = seq
        setSave(editSeq.current === seq ? { kind: "saved", at: Date.now() } : { kind: "dirty" })
        return true
      }
      if (res.status === 409 && data.code === "stale") {
        conflict.current = true
        setSave({ kind: "conflict", current: (data.current as AdminPostView) ?? null })
        return false
      }
      if (res.status === 401) {
        scheduleRetry(action, "Signed out. Sign in again in another tab; this keeps trying.")
        return false
      }
      if (res.status >= 500) {
        scheduleRetry(action, typeof data.error === "string" ? data.error : "Couldn't save.")
        return false
      }
      setSave({ kind: "error", message: typeof data.error === "string" ? data.error : "Couldn't save.", retrying: false })
      return false
    },
    [scheduleRetry],
  )

  const queue = React.useCallback(
    (action: Action, extra?: { publish_at?: string | null; force?: boolean }) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const p = chain.current.then(() => run(action, extra))
      chain.current = p.catch(() => false)
      return p
    },
    [run],
  )
  React.useEffect(() => {
    queueRef.current = queue
  }, [queue])

  /** Every edit: counted, and saved a moment after the last one. */
  const touched = React.useCallback(() => {
    editSeq.current++
    if (conflict.current) return
    setSave((s) => (s.kind === "saving" ? s : { kind: "dirty" }))
    if (!(full || (viewRef.current?.status ?? "draft") === "draft")) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => queue("autosave"), AUTOSAVE_MS)
  }, [full, queue])

  const setMeta = React.useCallback(
    (patch: Partial<PostMeta>) => {
      setMetaState((m) => {
        const next = { ...m, ...patch }
        metaRef.current = next
        return next
      })
      touched()
    },
    [touched],
  )
  const setBlocks = React.useCallback(
    (next: Block[]) => {
      blocksRef.current = next
      setBlocksState(next)
      touched()
    },
    [touched],
  )

  /* Leaving with something unsaved asks first. */
  React.useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (editSeq.current !== savedSeq.current || saveKind.current === "saving") {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onLeave)
    return () => window.removeEventListener("beforeunload", onLeave)
  }, [])

  /* Cmd+S: save now, with a revision. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (!autosaves) return flash("A live post saves on Update until SQL part 345 is run.")
        queue("save").then((ok) => ok && flash(full ? "Saved, and kept in History" : "Saved"))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [autosaves, full, queue, flash])

  async function act(action: Action, extra?: { publish_at?: string | null }) {
    if (!metaRef.current.title.trim()) {
      setSave({ kind: "error", message: "Give the post a title first.", retrying: false })
      document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Title']")?.focus()
      return
    }
    setBusy(action)
    const ok = await queue(action, extra)
    setBusy(null)
    if (!ok) return
    setPublishOpen(false)
    setConfirmUnpublish(false)
    const v = viewRef.current
    flash(action === "unpublish" ? "Unpublished. Its address answers 404 now." : v?.status === "scheduled" ? `Scheduled for ${formatWhen(v.live.published_at)}` : action === "update" ? "Updated. The live page shows it within a minute." : "Published")
  }

  async function resolveConflict(choice: "theirs" | "mine") {
    const s = save.kind === "conflict" ? save.current : null
    conflict.current = false
    if (choice === "theirs" && s) {
      versionRef.current = s.version
      setView(s)
      setMetaState(s.meta)
      setBlocksState(s.blocks.length ? s.blocks : [blankBlock("p")])
      setEditorKey((k) => k + 1)
      savedSeq.current = ++editSeq.current
      setSave({ kind: "saved", at: Date.now() })
      return
    }
    await queue(full || viewRef.current?.status === "draft" ? "autosave" : "update", { force: true })
  }

  async function upload(file: File): Promise<string> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) throw new Error(typeof data.error === "string" ? data.error : "The picture could not be uploaded.")
    return data.url as string
  }

  async function openPreview() {
    const w = window.open("about:blank", "_blank")
    if (autosaves && (editSeq.current !== savedSeq.current || !idRef.current)) await queue("autosave")
    await chain.current
    const id = idRef.current
    if (!id) {
      w?.close()
      flash("Write something first: a preview needs a saved post.")
      return
    }
    const res = await fetch(`/api/admin/blog/posts/${id}/preview`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) {
      if (w) w.location.href = data.url
      else window.location.href = data.url
    } else {
      w?.close()
      flash(typeof data.error === "string" ? data.error : "No preview link.")
    }
  }

  function onTitle(title: string) {
    const patch: Partial<PostMeta> = { title }
    if (!slugTouched && status === "draft" && !view?.live.published_at) patch.slug = slugify(title)
    setMeta(patch)
  }

  /* ── What the bar says ──────────────────────────────────────────────── */

  const dirty = save.kind === "dirty" || save.kind === "saving" || (save.kind === "error" && save.retrying)
  const hasChanges = Boolean(view?.hasDraft) || (!full && isLiveish && dirty)
  const saveWord = (() => {
    switch (save.kind) {
      case "saving":
        return "Saving…"
      case "saved":
        return `Saved ${new Date(save.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      case "dirty":
        return autosaves ? "Editing…" : "Not saved: Update saves it"
      case "error":
        return save.retrying ? "Couldn't save, retrying" : save.message
      case "conflict":
        return "Changed in another tab"
      default:
        return ""
    }
  })()
  const statusLabel = status === "scheduled" ? `Scheduled for ${formatWhen(view?.live.published_at)}` : status === "published" ? (view?.hasDraft ? "Published, with changes not live yet" : "Published") : "Draft"

  const liveSlug = view?.live.slug ?? ""
  const slugMoves = isLiveish && Boolean(liveSlug) && meta.slug !== liveSlug

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]">
      <BlogBar
        title={
          <a href="/admin/blog" className="flex min-w-0 shrink-0 items-center gap-1 text-[13px] text-[#9b9ba6] hover:text-[#ededf0]">
            <span aria-hidden>←</span> Posts
          </a>
        }
      >
        <span className={cx("hidden max-w-[240px] truncate text-[12px] tabular-nums md:block", save.kind === "error" ? "text-[#f47067]" : save.kind === "conflict" ? "text-[#d4a72c]" : "text-[#6b6b76]")} aria-live="polite" data-save-state={save.kind}>
          {saveWord}
        </span>
        <Button variant="quiet" onClick={() => setHistoryOpen(true)} disabled={!postId} className="max-sm:hidden">
          History
        </Button>
        <Button variant="quiet" onClick={openPreview}>
          Preview
        </Button>
        {status === "draft" ? (
          <div className="relative">
            <Button variant="primary" onClick={() => setPublishOpen((o) => !o)} aria-expanded={publishOpen} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
            {publishOpen ? <PublishPopover when={view?.live.published_at ?? null} onClose={() => setPublishOpen(false)} onPublish={(at) => act("publish", { publish_at: at })} busy={busy === "publish"} /> : null}
          </div>
        ) : (
          <>
            <Button variant="plain" onClick={() => setConfirmUnpublish(true)} disabled={busy !== null} className="max-sm:hidden">
              Unpublish
            </Button>
            <Button variant="primary" onClick={() => act("update")} disabled={busy !== null || (!hasChanges && !dirty)} title={hasChanges || dirty ? "Make these changes live" : "Nothing to update"}>
              {busy === "update" ? "Updating…" : "Update"}
            </Button>
          </>
        )}
      </BlogBar>

      {save.kind === "conflict" ? (
        <div className="border-b border-[#d4a72c]/30 bg-[#d4a72c]/[0.06] px-4 py-2.5 sm:px-6" role="alert">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
            <p className="text-[13px]">
              This post was saved somewhere else
              {save.current?.draft_saved_at || save.current?.updated_at ? ` at ${new Date((save.current.draft_saved_at ?? save.current.updated_at) as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}, after you opened it. Nothing here was saved over it.
            </p>
            <div className="flex gap-2">
              <Button variant="plain" onClick={() => resolveConflict("theirs")} disabled={!save.current}>
                Load that version
              </Button>
              <Button variant="quiet" onClick={() => resolveConflict("mine")}>
                Keep mine
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* A phone has one column: what is being written, or its settings. */}
      <div className="sticky top-12 z-20 flex border-b border-white/[0.08] bg-[#0b0b0f] px-4 lg:hidden" role="tablist" aria-label="Editor">
        {(["write", "settings"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("-mb-px h-10 border-b-2 px-3 text-[13px] outline-none", tab === t ? "border-[#8b5cf6] text-[#ededf0]" : "border-transparent text-[#9b9ba6]")}>
            {t === "write" ? "Write" : "Settings"}
          </button>
        ))}
        <span className={cx("ml-auto min-w-0 self-center truncate pl-2 text-[12px]", save.kind === "error" ? "text-[#f47067]" : save.kind === "conflict" ? "text-[#d4a72c]" : "text-[#6b6b76]")}>{saveWord}</span>
      </div>

      <div className="mx-auto flex max-w-[1440px] items-start">
        <main className={cx("min-w-0 flex-1 px-4 pb-24 pt-7 sm:px-6 lg:pt-10", tab === "settings" && "hidden lg:block")}>
          <div className="mx-auto max-w-[720px] pl-7 sm:pl-9">
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6b6b76]">
              <PostStatusDot status={status} label={statusLabel} />
              {status === "published" ? (
                <a href={`/blog/${liveSlug}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">
                  storelib.com/blog/{liveSlug}
                </a>
              ) : null}
            </div>
            {!autosaves ? <p className="mb-5 rounded-[8px] border border-[#d4a72c]/30 px-3 py-2 text-[12px] text-[#d4a72c]">This post is live, so changes save only on Update. {short345(note345)} to save drafts of live posts as you type.</p> : null}
            <TitleField value={meta.title} onChange={onTitle} />
            <BlogEditor key={editorKey} blocks={blocks} onChange={setBlocks} onUpload={upload} snippets={snippets} snippetsNote={full ? null : `Snippets: ${note345}`} />
          </div>
        </main>

        <aside className={cx("w-full shrink-0 border-white/[0.08] lg:sticky lg:top-12 lg:block lg:h-[calc(100dvh-48px)] lg:w-[340px] lg:overflow-y-auto lg:border-l", tab === "write" && "hidden")} aria-label="Post settings">
          <Settings
            meta={meta}
            setMeta={setMeta}
            blocks={blocks}
            view={view}
            full={full}
            categories={categories}
            authors={authors}
            tags={tags}
            note345={note345}
            slugMoves={slugMoves}
            liveSlug={liveSlug}
            onSlugTouched={() => setSlugTouched(true)}
            upload={upload}
            onUnpublish={() => setConfirmUnpublish(true)}
            onReschedule={(at) => act("update", { publish_at: at })}
            onHistory={() => setHistoryOpen(true)}
          />
        </aside>
      </div>

      {toast ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[9px] border border-white/[0.12] bg-[#17171d] px-3.5 py-2 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          {toast}
        </div>
      ) : null}

      <ConfirmDialog open={confirmUnpublish} title="Unpublish this post?" confirmLabel="Unpublish" danger busy={busy === "unpublish"} onClose={() => setConfirmUnpublish(false)} onConfirm={() => act("unpublish")}>
        <p>
          {status === "scheduled" ? "It will not go live at its scheduled time." : <>storelib.com/blog/{liveSlug} will answer 404 until it is published again.</>} The writing is kept as a draft.
        </p>
      </ConfirmDialog>

      {historyOpen && postId ? (
        <HistoryDialog
          postId={postId}
          full={full}
          note345={note345}
          onClose={() => setHistoryOpen(false)}
          onRestore={(m, b) => {
            metaRef.current = m
            blocksRef.current = b.length ? b : [blankBlock("p")]
            setMetaState(m)
            setBlocksState(blocksRef.current)
            setEditorKey((k) => k + 1)
            setHistoryOpen(false)
            touched()
            flash(isLiveish ? "Restored into the draft. Update makes it live." : "Restored.")
          }}
        />
      ) : null}
    </div>
  )
}

function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          document.querySelector<HTMLElement>("[data-blog-editor] [data-rt]")?.focus()
        }
      }}
      placeholder="Title"
      aria-label="Title"
      className="mb-5 block w-full resize-none overflow-hidden bg-transparent text-[30px] font-bold leading-[1.2] tracking-[-0.015em] text-[#ededf0] outline-none placeholder:text-[#3a3a44] max-md:!text-[28px] sm:text-[36px]"
    />
  )
}

/* ── Publish now or later ─────────────────────────────────────────────── */

function PublishPopover({ when, onClose, onPublish, busy }: { when: string | null; onClose: () => void; onPublish: (at: string | null) => void; busy: boolean }) {
  const [later, setLater] = React.useState(false)
  const [at, setAt] = React.useState(() => toLocalInput(when && Date.parse(when) > Date.now() ? when : new Date(Date.now() + 86400_000).toISOString()))
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [onClose])
  const t = Date.parse(at)
  const future = Number.isFinite(t) && t > Date.now()
  return (
    <div ref={ref} className="absolute right-0 top-10 z-40 w-[290px] max-w-[calc(100vw-32px)] rounded-[10px] border border-white/[0.1] bg-[#17171d] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
      <div className="flex gap-1 rounded-[8px] bg-[#0b0b0f] p-0.5" role="radiogroup" aria-label="When">
        {[
          { id: false, label: "Now" },
          { id: true, label: "Later" },
        ].map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={later === o.id} onClick={() => setLater(o.id)} className={cx("h-8 flex-1 rounded-[6px] text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70", later === o.id ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6]")}>
            {o.label}
          </button>
        ))}
      </div>
      {later ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-[#9b9ba6]">Goes live at, your time</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={cx(field, "h-9")} />
          {!future ? <span className="mt-1 block text-[12px] text-[#d4a72c]">Pick a time in the future.</span> : <span className="mt-1 block text-[12px] leading-4 text-[#6b6b76]">It appears on the blog, in the feed and in the sitemap then.</span>}
        </label>
      ) : (
        <p className="mt-3 text-[12px] leading-4 text-[#9b9ba6]">The post goes live at its address, on the blog, in the feed and in the sitemap.</p>
      )}
      <Button variant="primary" className="mt-3 w-full" disabled={busy || (later && !future)} onClick={() => onPublish(later ? new Date(at).toISOString() : null)}>
        {busy ? "Working…" : later ? "Schedule" : "Publish now"}
      </Button>
    </div>
  )
}

/* ── The sidebar ──────────────────────────────────────────────────────── */

function Settings({
  meta,
  setMeta,
  blocks,
  view,
  full,
  categories,
  authors,
  tags,
  note345,
  slugMoves,
  liveSlug,
  onSlugTouched,
  upload,
  onUnpublish,
  onReschedule,
  onHistory,
}: {
  meta: PostMeta
  setMeta: (p: Partial<PostMeta>) => void
  blocks: Block[]
  view: AdminPostView | null
  full: boolean
  categories: BlogCategory[]
  authors: BlogAuthor[]
  tags: string[]
  note345: string
  slugMoves: boolean
  liveSlug: string
  onSlugTouched: () => void
  upload: (f: File) => Promise<string>
  onUnpublish: () => void
  onReschedule: (at: string) => void
  onHistory: () => void
}) {
  const status = view?.status ?? "draft"
  const [when, setWhen] = React.useState(toLocalInput(view?.live.published_at))
  const autoRead = readTimeFor(blocks)
  const categoryNames = categories.map((c) => c.name)
  return (
    <div className="pb-16">
      {status !== "draft" ? (
        <Section title="Publishing">
          <p className="text-[13px] text-[#c9c9d1]">{status === "scheduled" ? <>Goes live {formatWhen(view?.live.published_at)}.</> : <>Live since {formatWhen(view?.live.published_at)}.</>}</p>
          {status === "scheduled" ? (
            <div className="flex gap-2">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cx(field, "h-9 flex-1")} aria-label="Go live at" />
              <Button variant="plain" disabled={!when || Date.parse(when) <= Date.now() || toLocalInput(view?.live.published_at) === when} onClick={() => onReschedule(new Date(when).toISOString())}>
                Move
              </Button>
            </div>
          ) : null}
          <div className="flex gap-2 sm:hidden">
            <Button variant="plain" onClick={onUnpublish}>
              Unpublish
            </Button>
            <Button variant="quiet" onClick={onHistory}>
              History
            </Button>
          </div>
        </Section>
      ) : null}

      <Section title="Address">
        <Field
          label="Slug"
          warn={
            slugMoves ? (
              full ? (
                <>The live address changes on Update. /blog/{liveSlug} will redirect here.</>
              ) : (
                <>The live address changes on Update and /blog/{liveSlug} will stop working. {short345(note345)} for redirects.</>
              )
            ) : null
          }
        >
          <div className="flex h-9 items-center overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] focus-within:border-[#8b5cf6]/70">
            <span className="shrink-0 pl-3 text-[13px] text-[#6b6b76]">/blog/</span>
            <input
              value={meta.slug}
              onChange={(e) => {
                onSlugTouched()
                setMeta({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-") })
              }}
              onBlur={() => setMeta({ slug: slugify(meta.slug) || slugify(meta.title) })}
              aria-label="Slug"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[13px] text-[#ededf0] outline-none"
            />
          </div>
        </Field>
      </Section>

      <Section title="Post">
        <Field label="Category">
          <select value={meta.category} onChange={(e) => setMeta({ category: e.target.value })} className={cx(field, "h-9")}>
            {!categoryNames.includes(meta.category) && meta.category ? <option value={meta.category}>{meta.category}</option> : null}
            {categories.map((c) => (
              <option key={c.slug} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {full ? <TagsField value={meta.tags} suggestions={tags} onChange={(t) => setMeta({ tags: t })} /> : <Needs345>Tags: {note345}</Needs345>}
        {full && authors.length ? (
          <Field label="Author" hint={<a href="/admin/blog/library?tab=authors" className="underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">Manage authors</a>}>
            <select
              value={meta.author_id ?? ""}
              onChange={(e) => {
                const a = authors.find((x) => x.id === e.target.value)
                setMeta({ author_id: a?.id ?? null, author_name: a ? byline(a) : meta.author_name })
              }}
              className={cx(field, "h-9")}
            >
              <option value="">{meta.author_name ? `${meta.author_name} (no profile)` : "No profile"}</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.role ? `, ${a.role}` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Byline" hint={full ? <a href="/admin/blog/library?tab=authors" className="underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">Add author profiles</a> : `Author profiles: ${note345}`}>
            <input value={meta.author_name} onChange={(e) => setMeta({ author_name: e.target.value })} placeholder="Name - Role" className={cx(field, "h-9")} />
          </Field>
        )}
        <Field label="Excerpt" hint="Shown on the blog's lists and in the feed." count={{ n: meta.excerpt.length, max: 300 }}>
          <textarea value={meta.excerpt} onChange={(e) => setMeta({ excerpt: e.target.value })} rows={3} className={cx(field, "resize-y py-2 leading-5")} />
        </Field>
        <Field label="Read time" hint={meta.read_time ? null : `Worked out from the words: ${autoRead}.`}>
          <input value={meta.read_time} onChange={(e) => setMeta({ read_time: e.target.value })} placeholder={autoRead} className={cx(field, "h-9")} />
        </Field>
      </Section>

      <Section title="Featured image">
        <ImageField value={meta.cover_image_url} onChange={(url) => setMeta({ cover_image_url: url })} upload={upload} alt={meta.cover_alt} onAlt={full ? (alt) => setMeta({ cover_alt: alt }) : undefined} altNote={full ? null : `Alt text for the featured image: ${note345}`} />
      </Section>

      <SearchSection meta={meta} setMeta={setMeta} full={full} note345={note345} upload={upload} />
    </div>
  )
}

function TagsField({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = React.useState("")
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40)
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < 20) onChange([...value, t])
    setDraft("")
  }
  return (
    <div>
      <span className="mb-1 block text-[12px] text-[#9b9ba6]">Tags</span>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-1.5 py-1 focus-within:border-[#8b5cf6]/70">
        {value.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-0.5 rounded-[6px] bg-white/[0.07] pl-2 pr-0.5 text-[12px] text-[#ededf0]">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="flex h-5 w-5 items-center justify-center rounded-[4px] text-[#9b9ba6] hover:bg-white/[0.08] hover:text-[#ededf0]">
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          list="blog-tag-suggestions"
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            }
            if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : "pricing, launch"}
          aria-label="Add a tag"
          className="h-6 min-w-[80px] flex-1 bg-transparent px-1 text-[13px] text-[#ededf0] outline-none placeholder:text-[#5c5c66]"
        />
        <datalist id="blog-tag-suggestions">
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
      <span className="mt-1 block text-[12px] text-[#6b6b76]">Enter or a comma adds one.</span>
    </div>
  )
}

/** An image by upload or address, with the 1200 by 630 crop a shared link is drawn at. */
function ImageField({
  value,
  onChange,
  upload,
  alt,
  onAlt,
  altNote,
  placeholderNote,
}: {
  value: string
  onChange: (url: string) => void
  upload: (f: File) => Promise<string>
  alt?: string
  onAlt?: (alt: string) => void
  altNote?: string | null
  placeholderNote?: string
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [broken, setBroken] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#0b0b0f]" style={{ aspectRatio: "1200 / 630" }}>
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={alt || ""} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-[12px] leading-4 text-[#6b6b76]">{broken ? "This picture did not load." : placeholderNote ?? "Shown at 1200 × 630 when the post is shared."}</p>
            <Button variant="plain" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </div>
        )}
        {value && !broken ? <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white/80">1200 × 630 crop</span> : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          setBusy(true)
          setError(null)
          try {
            onChange(await upload(f))
            setBroken(false)
          } catch (err) {
            setError((err as Error).message)
          }
          setBusy(false)
        }}
      />
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setBroken(false)
            onChange(e.target.value.trim())
          }}
          placeholder="https://…"
          aria-label="Image address"
          className={cx(field, "h-9 min-w-0 flex-1")}
        />
        {value ? (
          <Button variant="quiet" onClick={() => onChange("")}>
            Remove
          </Button>
        ) : (
          <Button variant="plain" onClick={() => fileRef.current?.click()} disabled={busy}>
            Upload
          </Button>
        )}
      </div>
      {error ? <p className="text-[12px] text-[#f47067]">{error}</p> : null}
      {onAlt ? (
        <Field label="Alt text" warn={value && !(alt ?? "").trim() ? "Add alt text: what the picture shows." : null}>
          <input value={alt ?? ""} onChange={(e) => onAlt(e.target.value)} className={cx(field, "h-9")} />
        </Field>
      ) : altNote ? (
        <Needs345>{altNote}</Needs345>
      ) : null}
    </div>
  )
}

function SearchSection({ meta, setMeta, full, note345, upload }: { meta: PostMeta; setMeta: (p: Partial<PostMeta>) => void; full: boolean; note345: string; upload: (f: File) => Promise<string> }) {
  const title = (meta.seo_title || meta.title || "Post title").replace(/ \| Storelib(?: Blog)?$/i, "")
  const shownTitle = `${title} | Storelib`
  const description = meta.seo_description || meta.excerpt
  const canonicalBad = Boolean(meta.canonical_url) && !/^https?:\/\/\S+$/i.test(meta.canonical_url)
  return (
    <Section title="Search and sharing">
      <div className="rounded-[8px] bg-white px-3.5 py-3" role="img" aria-label="How a search result may show the post">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#dadce0] text-[11px] font-bold text-[#1a1a2e]">S</span>
          <span className="min-w-0 leading-[16px]">
            <span className="block text-[13px] text-[#202124]">Storelib</span>
            <span className="block truncate text-[12px] text-[#4d5156]">https://storelib.com › blog › {meta.slug || "slug"}</span>
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[18px] leading-[23px] text-[#1a0dab]">{shownTitle.length > 63 ? `${shownTitle.slice(0, 60).trimEnd()}…` : shownTitle}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-[20px] text-[#4d5156]">{description ? (description.length > 158 ? `${description.slice(0, 155).trimEnd()}…` : description) : "Add a meta description, or the search engine picks a line from the post."}</p>
      </div>
      <Field label="SEO title" hint="Empty: the title. “| Storelib” is added after it." count={{ n: (meta.seo_title || meta.title).length, max: SEO_TITLE_LIMIT }}>
        <input value={meta.seo_title} onChange={(e) => setMeta({ seo_title: e.target.value })} placeholder={meta.title || "SEO title"} className={cx(field, "h-9")} />
      </Field>
      <Field label="Meta description" hint="Empty: the excerpt." count={{ n: (meta.seo_description || meta.excerpt).length, max: META_DESCRIPTION_LIMIT }}>
        <textarea value={meta.seo_description} onChange={(e) => setMeta({ seo_description: e.target.value })} placeholder={meta.excerpt || "What a reader finds in the post"} rows={3} className={cx(field, "resize-y py-2 leading-5")} />
      </Field>
      <Field label="Focus keyword" hint="Optional, for your own reference.">
        <input value={meta.focus_keyword} onChange={(e) => setMeta({ focus_keyword: e.target.value })} className={cx(field, "h-9")} />
      </Field>
      {full ? (
        <>
          <Field label="Canonical address" warn={canonicalBad ? "A full address, starting https://" : null} hint="Empty: the post's own address. Set it only when the original lives elsewhere; the post then leaves the sitemap.">
            <input value={meta.canonical_url} onChange={(e) => setMeta({ canonical_url: e.target.value.trim() })} placeholder={`https://storelib.com/blog/${meta.slug || "slug"}`} className={cx(field, "h-9")} />
          </Field>
          <div>
            <span className="mb-1 block text-[12px] text-[#9b9ba6]">Share image</span>
            <ImageField value={meta.og_image_url} onChange={(url) => setMeta({ og_image_url: url })} upload={upload} placeholderNote={meta.cover_image_url ? "Empty: the featured image is used." : "Empty: Storelib's own card is used."} />
          </div>
          <Switch checked={meta.noindex} onChange={(v) => setMeta({ noindex: v })} label="Hide from search engines" hint="Adds noindex and leaves the sitemap. The page still opens for anyone with the link." />
        </>
      ) : (
        <Needs345>Canonical address, share image and noindex: {note345}</Needs345>
      )}
    </Section>
  )
}

/* ── History ──────────────────────────────────────────────────────────── */

type RevisionRow = { id: string; kind: string; title: string; created_at: string; created_by: string | null }

const KIND: Record<string, string> = { save: "Saved", publish: "Published", update: "Updated", unpublish: "Unpublished", schedule: "Scheduled", restore: "Restored" }

function HistoryDialog({ postId, full, note345, onClose, onRestore }: { postId: string; full: boolean; note345: string; onClose: () => void; onRestore: (meta: PostMeta, blocks: Block[]) => void }) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const [rows, setRows] = React.useState<RevisionRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => {
    ref.current?.showModal?.()
    if (!full) return
    fetch(`/api/admin/blog/posts/${postId}/revisions`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d.revisions) ? setRows(d.revisions) : setError(d.error ?? "The history could not be read.")))
      .catch(() => setError("The history could not be read."))
  }, [postId, full])
  async function restore(id: string) {
    setBusy(id)
    const res = await fetch(`/api/admin/blog/posts/${postId}/revisions/${id}`)
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok || !d.revision) return setError(d.error ?? "That revision could not be read.")
    onRestore(d.revision.meta, d.revision.blocks)
  }
  return (
    <dialog ref={ref} onClose={onClose} aria-label="History" className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[14px] border border-white/[0.1] bg-[#111116] p-0 text-[#ededf0] backdrop:bg-black/60 sm:m-auto sm:w-[480px] sm:rounded-[12px]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <h2 className="text-[15px] font-semibold">History</h2>
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="max-h-[60dvh] overflow-y-auto">
        {!full ? (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{note345}</p>
        ) : error ? (
          <p className="px-4 py-6 text-[13px] text-[#f47067]">{error}</p>
        ) : !rows ? (
          <p className="px-4 py-6 text-[13px] text-[#6b6b76]">Reading…</p>
        ) : !rows.length ? (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Nothing yet. Each Cmd+S, publish and update keeps a copy here, the last 50.</p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[13px] text-[#ededf0]">
                    {KIND[r.kind] ?? r.kind}{" "}
                    <span className="text-[#6b6b76]">
                      · {formatWhen(r.created_at)} · {formatAgo(r.created_at)}
                    </span>
                  </p>
                  <p className="truncate text-[12px] text-[#9b9ba6]">{r.title || "Untitled"}</p>
                </div>
                <Button variant="plain" onClick={() => restore(r.id)} disabled={busy !== null}>
                  {busy === r.id ? "Reading…" : "Restore"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] text-[#6b6b76]">Restore puts that version in the editor. Nothing live changes until you publish or update.</p>
    </dialog>
  )
}
