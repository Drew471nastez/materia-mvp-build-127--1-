"use client"

import * as React from "react"

import BlogEditor, { blankBlock } from "@/components/admin/blog-editor"
import { Button, ConfirmDialog, cx } from "@/app/(storelib)/admin/_console/ui"
import type { Block } from "@/lib/blog/blocks"
import type { AdminPostView, BlogAuthor, BlogCategory, BlogSnippet } from "@/lib/blog/admin-store"
import { emptyMeta, slugify, type PostMeta } from "@/lib/blog/editor-model"
import { DESCRIPTION_FITS, TITLE_FITS, isFocusShortcut, isSaveShortcut, readMinutes, searchDescription, searchTitle, seoChecklist, wordCount, type Check } from "@/lib/blog/editor-tools"
import { externalImagesOf, hostList, replaceImageUrls, type ExternalImage } from "@/lib/blog/external-images"

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
 * is typed, only on Update, and the page says so, once, with the list of
 * what part 345 adds; the fields that need it are left out rather than
 * shown disabled.
 *
 * THE PAGE. One writing column at the article's own measure and sizes. The
 * post's settings are a panel on the right that folds away (remembered in
 * this browser), and a drawer on a phone. Focus mode (Shift+Cmd+F, Esc to
 * leave) hides everything but the writing and the save state. What is
 * worked out from the whole post (the word count, the checklist, pictures
 * from other sites) follows the writing a moment after typing stops, so a
 * key press only ever redraws the block it typed into.
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

/** `value`, a moment after it last changed: for what is worked out from the whole post, so typing never waits for it. */
function useCalm<T>(value: T, ms = 400): T {
  const [calm, setCalm] = React.useState(value)
  React.useEffect(() => {
    if (calm === value) return
    const t = setTimeout(() => setCalm(value), ms)
    return () => clearTimeout(t)
  }, [value, calm, ms])
  return calm
}

/** A callback that is always the latest `fn` and never a new function, so a memoised panel does not redraw for it. */
function useStable<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const ref = React.useRef(fn)
  React.useLayoutEffect(() => {
    ref.current = fn
  })
  return React.useCallback((...a: A) => ref.current(...a), [])
}

const PANEL_KEY = "storelib.blog-editor.panel"

type Done = { kind: "published" | "updated" | "scheduled"; slug: string; at: string | null }

export default function BlogPostEditorClient({ initial, full, categories, authors, snippets, tags, note345 }: EditorProps) {
  const [postId, setPostId] = React.useState<string | null>(initial?.id ?? null)
  const [view, setView] = React.useState<AdminPostView | null>(initial)
  const [meta, setMetaState] = React.useState<PostMeta>(() => initial?.meta ?? { ...emptyMeta(), author_id: authors[0]?.id ?? null, author_name: authors[0] ? byline(authors[0]) : "" })
  const [blocks, setBlocksState] = React.useState<Block[]>(() => (initial?.blocks?.length ? initial.blocks : [blankBlock("p")]))
  const [editorKey, setEditorKey] = React.useState(0)
  const [save, setSave] = React.useState<SaveState>(() => (initial ? { kind: "saved", at: Date.parse(initial.draft_saved_at ?? initial.updated_at ?? "") || Date.now() } : { kind: "idle" }))
  /* The settings panel: open or folded on a wide screen (remembered), a drawer on a phone. */
  const [panel, setPanel] = React.useState(true)
  const [drawer, setDrawer] = React.useState(false)
  const [focusMode, setFocusMode] = React.useState(false)
  const [done, setDone] = React.useState<Done | null>(null)
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

  /* Cmd+S: save now, whatever is waiting, with a revision. Shift+Cmd+F: focus mode; Esc leaves it. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSaveShortcut(e)) {
        e.preventDefault()
        if (!autosaves) return flash("This post is live: Update saves it. Drafts of live posts come with SQL part 345.")
        queue("save").then((ok) => ok && flash(full ? "Saved, and kept in History" : "Saved"))
        return
      }
      if (isFocusShortcut(e)) {
        e.preventDefault()
        setFocusMode((f) => !f)
        return
      }
      if (e.key === "Escape" && !e.defaultPrevented) {
        setFocusMode(false)
        setDrawer(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [autosaves, full, queue, flash])

  /* Wide enough for the panel beside the writing (the lg breakpoint), followed as the window changes. */
  const [wide, setWide] = React.useState(true)
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(PANEL_KEY) === "closed") setPanel(false)
    } catch {}
    const mq = window.matchMedia("(min-width: 1024px)")
    const follow = () => setWide(mq.matches)
    follow()
    mq.addEventListener("change", follow)
    return () => mq.removeEventListener("change", follow)
  }, [])
  const toggleSettings = React.useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setPanel((open) => {
        try {
          window.localStorage.setItem(PANEL_KEY, open ? "closed" : "open")
        } catch {}
        return !open
      })
    } else setDrawer((d) => !d)
  }, [])
  /** Opens the settings wherever they are on this screen, at one section. */
  const showSettings = useStable((section?: string) => {
    setFocusMode(false)
    if (window.matchMedia("(min-width: 1024px)").matches) setPanel(true)
    else setDrawer(true)
    if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: "start", behavior: "smooth" }))
  })

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
    if (action === "unpublish" || !v) return flash("Unpublished. Its address answers 404 now.")
    /* Published, updated or scheduled: said with the address and a way to it. */
    setDone({ kind: v.status === "scheduled" ? "scheduled" : action === "publish" ? "published" : "updated", slug: v.live.slug, at: v.live.published_at })
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

  const upload = React.useCallback(async (file: File): Promise<string> => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) throw new Error(typeof data.error === "string" ? data.error : "The picture could not be uploaded.")
    return data.url as string
  }, [])

  /** A pasted picture address from another site, copied into Storelib as Copy to Storelib does. */
  const importImage = React.useCallback(async (url: string): Promise<string> => {
    const res = await fetch("/api/admin/blog/copy-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || typeof data.url !== "string") throw new Error(typeof data.error === "string" ? data.error : "Not copied.")
    return data.url
  }, [])

  /*
    COPY TO STORELIB. Each picture from another site is downloaded by the
    server (app/api/admin/blog/copy-image) one at a time and its new address
    put in place; the post then saves as any edit does.
  */
  const [copyBusy, setCopyBusy] = React.useState<{ done: number; of: number } | null>(null)
  const [copyErrors, setCopyErrors] = React.useState<{ url: string; error: string }[]>([])
  /* Worked out from the whole post a moment after typing stops (useCalm), never on a key press. */
  const calmBlocks = useCalm(blocks)
  const externals = React.useMemo(() => externalImagesOf(meta, calmBlocks), [meta, calmBlocks])
  const words = React.useMemo(() => wordCount(calmBlocks), [calmBlocks])
  async function copyToStorelib(list: ExternalImage[]) {
    const moved = new Map<string, string>()
    const errors: { url: string; error: string }[] = []
    for (const [i, img] of list.entries()) {
      setCopyBusy({ done: i, of: list.length })
      try {
        const res = await fetch("/api/admin/blog/copy-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: img.url }) })
        const data = await res.json().catch(() => ({}))
        if (res.ok && typeof data.url === "string") moved.set(img.url, data.url)
        else errors.push({ url: img.url, error: typeof data.error === "string" ? data.error : "That did not work." })
      } catch {
        errors.push({ url: img.url, error: "No connection." })
      }
    }
    setCopyBusy(null)
    setCopyErrors(errors)
    if (!moved.size) return
    const next = replaceImageUrls(metaRef.current, blocksRef.current, moved)
    metaRef.current = next.meta
    blocksRef.current = next.blocks
    setMetaState(next.meta)
    setBlocksState(next.blocks)
    setEditorKey((k) => k + 1)
    touched()
    const n = moved.size === 1 ? "1 picture" : `${moved.size} pictures`
    flash(autosaves ? `Copied ${n} to Storelib.` : `Copied ${n} to Storelib. Update makes it live.`)
  }

  async function openPreview() {
    if (!autosaves && dirty) flash("The preview shows the live post. Changes here reach it on Update, until SQL part 345 adds drafts.")
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
  const statusLabel = status === "scheduled" ? `Scheduled for ${formatWhen(view?.live.published_at)}` : status === "published" ? (view?.hasDraft ? "Published, with changes not live yet" : "Published") : "Draft"

  const liveSlug = view?.live.slug ?? ""
  const slugMoves = isLiveish && Boolean(liveSlug) && meta.slug !== liveSlug
  const wordsLine = words ? `${words.toLocaleString("en-US")} ${words === 1 ? "word" : "words"} · ${readMinutes(words)} min read` : "No words yet"

  const onSlugTouched = React.useCallback(() => setSlugTouched(true), [])
  const onUnpublish = React.useCallback(() => setConfirmUnpublish(true), [])
  const onHistory = React.useCallback(() => setHistoryOpen(true), [])
  const onReschedule = useStable((at: string) => act("update", { publish_at: at }))
  const focusTitle = React.useCallback(() => {
    const t = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Title']")
    if (!t) return
    t.focus()
    t.setSelectionRange(t.value.length, t.value.length)
  }, [])

  const publishButton =
    status === "draft" ? (
      <div className="relative">
        <Button variant="primary" onClick={() => setPublishOpen((o) => !o)} aria-expanded={publishOpen} aria-haspopup="dialog" disabled={busy !== null}>
          {busy === "publish" ? "Publishing…" : "Publish"}
        </Button>
        {publishOpen ? (
          <PublishPopover
            when={view?.live.published_at ?? null}
            slug={meta.slug}
            checks={() => seoChecklist(metaRef.current, blocksRef.current, { full })}
            onReview={() => {
              setPublishOpen(false)
              showSettings("seo-checklist")
            }}
            onClose={() => setPublishOpen(false)}
            onPublish={(at) => act("publish", { publish_at: at })}
            busy={busy === "publish"}
          />
        ) : null}
      </div>
    ) : (
      <Button variant="primary" onClick={() => act("update")} disabled={busy !== null || (!hasChanges && !dirty)} title={hasChanges || dirty ? "Make these changes live" : "Nothing to update"}>
        {busy === "update" ? "Updating…" : "Update"}
      </Button>
    )

  const settingsOpen = wide ? panel : drawer
  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]">
      {focusMode ? (
        /* Focus mode: the writing alone, the save state in a corner, a way out. */
        <div className="fixed right-3 top-3 z-30 flex items-center gap-2 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100" style={{ marginTop: "env(safe-area-inset-top)" }}>
          <SaveStatus save={save} autosaves={autosaves} />
          <Button variant="quiet" onClick={() => setFocusMode(false)} title="Esc">
            Leave focus
          </Button>
        </div>
      ) : (
        <BlogBar
          title={
            <a href="/admin/blog" className="flex min-w-0 shrink-0 items-center gap-1 rounded-[6px] text-[13px] text-[#9b9ba6] outline-none hover:text-[#ededf0] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70">
              <span aria-hidden>←</span> Posts
            </a>
          }
        >
          <SaveStatus save={save} autosaves={autosaves} />
          <span className="hidden w-[150px] truncate text-right text-[12px] tabular-nums text-[#6b6b76] xl:block" aria-label={wordsLine}>
            {wordsLine}
          </span>
          <Button variant="quiet" onClick={() => setFocusMode(true)} title="Focus mode (Shift+Cmd+F)" className="max-md:hidden">
            Focus
          </Button>
          <Button variant="quiet" onClick={openPreview} className="max-sm:px-2">
            Preview
          </Button>
          <button
            type="button"
            onClick={toggleSettings}
            aria-label={settingsOpen ? "Hide post settings" : "Show post settings"}
            title="Post settings"
            aria-controls="post-settings"
            aria-expanded={settingsOpen}
            className={cx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70",
              panel ? "lg:bg-white/[0.07] lg:text-[#ededf0]" : "lg:text-[#9b9ba6]",
              drawer ? "max-lg:bg-white/[0.07] max-lg:text-[#ededf0]" : "max-lg:text-[#9b9ba6]",
              "hover:bg-white/[0.07] hover:text-[#ededf0]",
            )}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
              <path d="M10 2.5v11" />
            </svg>
          </button>
          {publishButton}
        </BlogBar>
      )}

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

      <div className="mx-auto flex max-w-[1440px] items-start">
        <main className={cx("min-w-0 flex-1 px-4 pb-24 sm:px-6", focusMode ? "pt-16 sm:pt-20" : "pt-7 lg:pt-10")}>
          <div className="mx-auto max-w-[756px] pl-7 sm:pl-9">
            {!focusMode ? (
              <>
                <div className="mb-5 flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6b6b76]">
                  <PostStatusDot status={status} label={statusLabel} />
                  {status === "published" ? (
                    <a href={`/blog/${liveSlug}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">
                      storelib.com/blog/{liveSlug}
                    </a>
                  ) : null}
                  <span className="tabular-nums xl:hidden">{wordsLine}</span>
                </div>
                {!autosaves ? (
                  <p className="mb-5 rounded-[8px] border border-[#d4a72c]/30 px-3 py-2 text-[12px] leading-[18px] text-[#d4a72c]">
                    This post is live, so changes are saved when you press Update. Saving drafts of live posts as you type comes with SQL part 345 (Admin › SQL updates).
                  </p>
                ) : null}
                {externals.length || copyErrors.length ? <ExternalImagesNotice images={externals} busy={copyBusy} errors={copyErrors} onCopy={() => copyToStorelib(externals)} /> : null}
              </>
            ) : null}
            <TitleField value={meta.title} onChange={onTitle} autoFocus={!initial} />
            <BlogEditor key={editorKey} blocks={blocks} onChange={setBlocks} onUpload={upload} onImport={importImage} onLeaveTop={focusTitle} snippets={snippets} snippetsNote={full ? null : `Snippets: ${note345}`} />
          </div>
        </main>

        {drawer ? <div aria-hidden className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} /> : null}
        <aside
          id="post-settings"
          aria-label="Post settings"
          className={cx(
            "shrink-0 bg-[#0b0b0f]",
            "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:w-full max-lg:max-w-[420px] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:border-l max-lg:border-white/[0.1] max-lg:shadow-[0_0_48px_rgba(0,0,0,0.6)]",
            !drawer && "max-lg:hidden",
            panel && !focusMode ? "lg:sticky lg:top-12 lg:block lg:h-[calc(100dvh-48px)] lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-white/[0.08]" : "lg:hidden",
          )}
        >
          <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#0b0b0f] px-4 lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)", boxSizing: "content-box" }}>
            <h2 className="text-[14px] font-semibold">Post settings</h2>
            <Button variant="quiet" onClick={() => setDrawer(false)}>
              Done
            </Button>
          </div>
          <SettingsPanel
            meta={meta}
            setMeta={setMeta}
            blocks={calmBlocks}
            words={words}
            view={view}
            postId={postId}
            full={full}
            categories={categories}
            authors={authors}
            tags={tags}
            note345={note345}
            slugMoves={slugMoves}
            liveSlug={liveSlug}
            onSlugTouched={onSlugTouched}
            upload={upload}
            onUnpublish={onUnpublish}
            onReschedule={onReschedule}
            onHistory={onHistory}
          />
        </aside>
      </div>

      {toast ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[9px] border border-white/[0.12] bg-[#17171d] px-3.5 py-2 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          {toast}
        </div>
      ) : null}

      <PublishedDialog done={done} onClose={() => setDone(null)} />

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

/** The save state, always in the same place and the same width, so nothing beside it moves when it changes. */
function SaveStatus({ save, autosaves }: { save: SaveState; autosaves: boolean }) {
  /* The words, and a shorter form for a phone's bar. */
  const [word, short, tone] = ((): [string, string, "quiet" | "bad" | "warn"] => {
    switch (save.kind) {
      case "saving":
        return ["Saving…", "Saving…", "quiet"]
      case "saved":
        return [`Saved ${new Date(save.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, "Saved", "quiet"]
      case "dirty":
        return autosaves ? ["Saving…", "Saving…", "quiet"] : ["Unsaved: Update saves", "Unsaved", "warn"]
      case "error":
        return [save.retrying ? "Not saved, retrying" : save.message, "Not saved", "bad"]
      case "conflict":
        return ["Changed in another tab", "Conflict", "warn"]
      default:
        return ["", "", "quiet"]
    }
  })()
  return (
    <span
      className={cx("block w-[64px] truncate text-right text-[12px] tabular-nums sm:w-[150px]", tone === "bad" ? "text-[#f47067]" : tone === "warn" ? "text-[#d4a72c]" : "text-[#6b6b76]")}
      aria-live="polite"
      title={save.kind === "error" ? save.message : undefined}
      data-save-state={save.kind}
    >
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{word}</span>
    </span>
  )
}

function TitleField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  React.useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  const toBody = () => {
    const first = document.querySelector<HTMLElement>("[data-blog-editor] [data-rt]")
    if (!first) return
    first.focus()
    const sel = window.getSelection()
    const r = document.createRange()
    r.selectNodeContents(first.tagName === "UL" || first.tagName === "OL" ? (first.firstElementChild ?? first) : first)
    r.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(r)
  }
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        const el = e.currentTarget
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault()
          toBody()
        }
        if (e.key === "ArrowDown" && !e.shiftKey && el.selectionStart === el.value.length) {
          e.preventDefault()
          toBody()
        }
      }}
      placeholder="Title"
      aria-label="Title"
      className="mb-6 block w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-[1.15] tracking-[-0.025em] text-[#ededf0] outline-none placeholder:text-[#3a3a44] max-md:!text-[30px]"
    />
  )
}

/* ── Publish now or later ─────────────────────────────────────────────── */

function PublishPopover({
  when,
  slug,
  checks,
  onReview,
  onClose,
  onPublish,
  busy,
}: {
  when: string | null
  slug: string
  checks: () => Check[]
  onReview: () => void
  onClose: () => void
  onPublish: (at: string | null) => void
  busy: boolean
}) {
  const [later, setLater] = React.useState(false)
  const [at, setAt] = React.useState(() => toLocalInput(when && Date.parse(when) > Date.now() ? when : new Date(Date.now() + 86400_000).toISOString()))
  const ref = React.useRef<HTMLDivElement>(null)
  const warnings = React.useMemo(() => checks().filter((c) => c.state === "warn"), [checks])
  React.useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
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
    <div ref={ref} role="dialog" aria-label="Publish" className="absolute right-0 top-10 z-40 w-[300px] max-w-[calc(100vw-32px)] rounded-[10px] border border-white/[0.1] bg-[#17171d] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
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
          {!future ? <span className="mt-1 block text-[12px] text-[#d4a72c]">Pick a time in the future.</span> : null}
        </label>
      ) : null}
      <p className="mt-3 break-all text-[12px] leading-4 text-[#9b9ba6]">
        {later ? "Then it goes live at" : "Goes live at"} <span className="text-[#ededf0]">storelib.com/blog/{slug || "…"}</span>, on the blog, in the feed and in the sitemap.
      </p>
      {warnings.length ? (
        <p className="mt-2 text-[12px] leading-4 text-[#d4a72c]">
          {warnings.length === 1 ? "1 search check is" : `${warnings.length} search checks are`} worth a look.{" "}
          <button type="button" onClick={onReview} className="rounded-[4px] underline underline-offset-2 outline-none hover:text-[#ededf0] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70">
            Review
          </button>
        </p>
      ) : null}
      <Button variant="primary" className="mt-3 w-full" disabled={busy || (later && !future)} onClick={() => onPublish(later ? new Date(at).toISOString() : null)}>
        {busy ? "Working…" : later ? "Schedule" : "Publish now"}
      </Button>
    </div>
  )
}

/** After Publish, Update or Schedule: what happened, the address, and the post itself. */
function PublishedDialog({ done, onClose }: { done: Done | null; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    const d = ref.current
    if (!d) return
    if (done && !d.open) d.showModal?.()
    if (!done && d.open) d.close()
    setCopied(false)
  }, [done])
  const url = done ? `https://storelib.com/blog/${done.slug}` : ""
  const title = done?.kind === "scheduled" ? "Scheduled" : done?.kind === "updated" ? "Updated" : "Published"
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-[14px] border border-white/[0.1] bg-[#111116] p-0 text-[#ededf0] backdrop:bg-black/60 sm:m-auto sm:w-[440px] sm:rounded-[12px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-published={done?.kind ?? ""}
    >
      {done ? (
        <div className="p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <span aria-hidden className={cx("h-2 w-2 rounded-full", done.kind === "scheduled" ? "bg-[#d4a72c]" : "bg-[#3fb950]")} />
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-[#9b9ba6]">
            {done.kind === "scheduled" ? <>It goes live on {formatWhen(done.at)}, your time, at this address:</> : done.kind === "updated" ? <>The changes are live at this address:</> : <>The post is live at this address:</>}
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] py-1 pl-3 pr-1">
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#ededf0]" data-live-url>
              storelib.com/blog/{done.slug}
            </span>
            <Button
              variant="quiet"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="quiet" onClick={onClose} className="h-10 sm:h-9">
              Keep editing
            </Button>
            {done.kind !== "scheduled" ? (
              <a href={`/blog/${done.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-[7px] bg-[#ededf0] px-3 text-[13px] font-medium text-[#0b0b0f] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 sm:h-9">
                View post
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}

/* ── The sidebar ──────────────────────────────────────────────────────── */

interface SettingsProps {
  meta: PostMeta
  setMeta: (p: Partial<PostMeta>) => void
  /** The post as it was a moment ago (useCalm): what the read time and the checklist are worked out from. */
  blocks: Block[]
  words: number
  view: AdminPostView | null
  postId: string | null
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
}

/** Memoised: typing in the post never redraws it, only a change to the meta or the calm copy of the blocks does. */
const SettingsPanel = React.memo(function Settings({ meta, setMeta, blocks, words, view, postId, full, categories, authors, tags, note345, slugMoves, liveSlug, onSlugTouched, upload, onUnpublish, onReschedule, onHistory }: SettingsProps) {
  const status = view?.status ?? "draft"
  const [when, setWhen] = React.useState(toLocalInput(view?.live.published_at))
  const autoRead = `${readMinutes(words)} min read`
  const categoryNames = categories.map((c) => c.name)
  return (
    <div className="pb-16">
      {!full ? (
        <div className="border-b border-white/[0.08] px-4 py-4">
          <Needs345>
            <span className="block text-[#ededf0]">Writing, saving and publishing work now.</span>
            <span className="mt-1 block">
              SQL part 345 adds tags, author profiles, cover alt text, canonical, share image, noindex, history, redirects, snippets and drafts of live posts. {short345(note345)} to turn them on.
            </span>
          </Needs345>
        </div>
      ) : null}

      <Section title="Post">
        <p className="text-[13px] leading-5 text-[#c9c9d1]">
          {status === "scheduled" ? <>Goes live {formatWhen(view?.live.published_at)}.</> : status === "published" ? <>Live since {formatWhen(view?.live.published_at)}.</> : postId ? <>Draft. Only you can see it, in Preview.</> : <>Draft. Saved once you start writing.</>}
        </p>
        {status === "scheduled" ? (
          <div className="flex gap-2">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cx(field, "h-9 flex-1")} aria-label="Go live at" />
            <Button variant="plain" disabled={!when || Date.parse(when) <= Date.now() || toLocalInput(view?.live.published_at) === when} onClick={() => onReschedule(new Date(when).toISOString())}>
              Move
            </Button>
          </div>
        ) : null}
        {status !== "draft" || (full && postId) ? (
          <div className="flex flex-wrap gap-2">
            {full && postId ? (
              <Button variant="plain" onClick={onHistory}>
                History
              </Button>
            ) : null}
            {status !== "draft" ? (
              <Button variant="plain" onClick={onUnpublish} className="text-[#f47067]">
                Unpublish
              </Button>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Address">
        <Field
          label="Slug"
          warn={
            slugMoves ? (
              full ? (
                <>The live address changes on Update. /blog/{liveSlug} will redirect here.</>
              ) : (
                <>The live address changes on Update and /blog/{liveSlug} will stop working: redirects come with SQL part 345.</>
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

      <Section title="Details">
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
        {full ? <TagsField value={meta.tags} suggestions={tags} onChange={(t) => setMeta({ tags: t })} /> : null}
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
          <Field label="Byline" hint={full ? <a href="/admin/blog/library?tab=authors" className="underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">Add author profiles</a> : "Name - Role, as the article shows it."}>
            <input value={meta.author_name} onChange={(e) => setMeta({ author_name: e.target.value })} placeholder="Storelib Team" className={cx(field, "h-9")} />
          </Field>
        )}
        <Field label="Excerpt" hint="Shown on the blog's lists and in the feed. Empty meta description: this too." count={{ n: meta.excerpt.length, max: 300 }}>
          <textarea value={meta.excerpt} onChange={(e) => setMeta({ excerpt: e.target.value })} rows={3} className={cx(field, "resize-y py-2 leading-5")} />
        </Field>
        <Field label="Read time" hint={meta.read_time ? null : `Worked out from ${words.toLocaleString("en-US")} words: ${autoRead}.`}>
          <input value={meta.read_time} onChange={(e) => setMeta({ read_time: e.target.value })} placeholder={autoRead} className={cx(field, "h-9")} />
        </Field>
      </Section>

      <Section title="Featured image" id="featured-image">
        <ImageField value={meta.cover_image_url} onChange={(url) => setMeta({ cover_image_url: url })} upload={upload} alt={meta.cover_alt} onAlt={full ? (alt) => setMeta({ cover_alt: alt }) : undefined} />
      </Section>

      <SearchSection meta={meta} setMeta={setMeta} blocks={blocks} full={full} upload={upload} />
    </div>
  )
})

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

/** Pictures linked from other sites: which, where, and Copy to Storelib. */
function ExternalImagesNotice({ images, busy, errors, onCopy }: { images: ExternalImage[]; busy: { done: number; of: number } | null; errors: { url: string; error: string }[]; onCopy: () => void }) {
  const where = (img: ExternalImage) => img.where.map((w) => (w === "cover" ? "featured image" : w === "share" ? "share image" : "article"))
  const places = [...new Set(images.flatMap(where))]
  const count = images.length === 1 ? "1 picture is" : `${images.length} pictures are`
  return (
    <div role="status" className="mb-5 rounded-[8px] border border-[#d4a72c]/30 px-3 py-2.5 text-[12px] leading-[18px]" data-external-images={images.length}>
      {images.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 basis-[260px] text-[#d4a72c]">
            {count} linked from {hostList(images)} ({places.join(", ")}). The other site can change or remove {images.length === 1 ? "it" : "them"} at any time.
          </p>
          <Button variant="plain" onClick={onCopy} disabled={busy !== null}>
            {busy ? `Copying ${busy.done + 1} of ${busy.of}…` : "Copy to Storelib"}
          </Button>
        </div>
      ) : null}
      {errors.length ? (
        <ul className={cx("space-y-0.5 text-[#f47067]", images.length > 0 && "mt-2")}>
          {errors.map((e) => (
            <li key={e.url} className="min-w-0 break-words">
              {e.url.replace(/^https?:\/\//, "").slice(0, 60)}: {e.error}
            </li>
          ))}
        </ul>
      ) : null}
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

/** A string's width in Google's result title font, to cut the preview where Google would (about 600 px at 20 px Arial). */
function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 9
  const c = (textWidth as unknown as { canvas?: HTMLCanvasElement }).canvas ?? ((textWidth as unknown as { canvas?: HTMLCanvasElement }).canvas = document.createElement("canvas"))
  const ctx = c.getContext("2d")
  if (!ctx) return text.length * 9
  ctx.font = font
  return ctx.measureText(text).width
}

function cutTo(text: string, px: number, font: string): string {
  if (textWidth(text, font) <= px) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(`${text.slice(0, mid).trimEnd()} ...`, font) <= px) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo).trimEnd()} ...`
}

const CHECK_DOT: Record<Check["state"], string> = { ok: "bg-[#3fb950]", warn: "bg-[#d4a72c]", info: "bg-[#6b6b76]" }

function SearchSection({ meta, setMeta, blocks, full, upload }: { meta: PostMeta; setMeta: (p: Partial<PostMeta>) => void; blocks: Block[]; full: boolean; upload: (f: File) => Promise<string> }) {
  const shownTitle = searchTitle(meta)
  const description = searchDescription(meta)
  const canonicalBad = Boolean(meta.canonical_url) && !/^https?:\/\/\S+$/i.test(meta.canonical_url)
  const checks = React.useMemo(() => seoChecklist(meta, blocks, { full }), [meta, blocks, full])
  const titleFont = "20px Arial, sans-serif"
  return (
    <Section title="Search and sharing" id="search">
      <div className="rounded-[8px] bg-white px-3.5 py-3" role="img" aria-label={`How a Google result may show the post: ${shownTitle || "Post title"}`}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#dadce0] text-[11px] font-bold text-[#1a1a2e]">S</span>
          <span className="min-w-0 leading-[16px]">
            <span className="block text-[13px] text-[#202124]">Storelib</span>
            <span className="block truncate text-[12px] text-[#4d5156]">https://storelib.com › blog › {meta.slug || "slug"}</span>
          </span>
        </div>
        {/* Cut where a desktop result cuts it (about 600 px of 20 px Arial), then wrapped to this narrow box. */}
        <p className="mt-1.5 line-clamp-2 text-[18px] leading-[23px] text-[#1a0dab]" style={{ fontFamily: "Arial, sans-serif" }}>
          {shownTitle ? cutTo(shownTitle, 600, titleFont) : "Post title | Storelib"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-[20px] text-[#4d5156]" style={{ fontFamily: "Arial, sans-serif" }}>
          {description ? (description.length > DESCRIPTION_FITS ? `${description.slice(0, DESCRIPTION_FITS - 3).trimEnd()} ...` : description) : "No meta description: the search engine picks a line from the post."}
        </p>
      </div>

      <div id="seo-checklist" className="scroll-mt-16">
        <h3 className="mb-1.5 text-[12px] text-[#9b9ba6]">Checks</h3>
        <ul className="space-y-1.5" aria-label="Search checks">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-2 text-[12px] leading-[17px]" data-check={c.id} data-state={c.state}>
              <span aria-hidden className={cx("mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full", CHECK_DOT[c.state])} />
              <span className={cx("min-w-0 break-words", c.state === "warn" ? "text-[#ededf0]" : "text-[#9b9ba6]")}>
                <span className="sr-only">{c.state === "ok" ? "Done: " : c.state === "warn" ? "To look at: " : ""}</span>
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Field label="SEO title" hint={`Empty: the title. “| Storelib” is added after it; the count includes it.`} count={{ n: shownTitle.length, max: TITLE_FITS }}>
        <input value={meta.seo_title} onChange={(e) => setMeta({ seo_title: e.target.value })} placeholder={meta.title || "SEO title"} className={cx(field, "h-9")} />
      </Field>
      <Field label="Meta description" hint="Empty: the excerpt." count={{ n: description.length, max: DESCRIPTION_FITS }}>
        <textarea value={meta.seo_description} onChange={(e) => setMeta({ seo_description: e.target.value })} placeholder={meta.excerpt || "What a reader finds in the post"} rows={3} className={cx(field, "resize-y py-2 leading-5")} />
      </Field>
      <Field label="Focus keyword" hint="Optional. The checks say whether the title and the first paragraph use it.">
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
      ) : null}
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
