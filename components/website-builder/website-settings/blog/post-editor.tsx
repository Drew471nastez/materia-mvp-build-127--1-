"use client"

/**
 * ===========================================================================
 *  A POST, WRITTEN FULL SCREEN OVER WEBSITE SETTINGS
 * ===========================================================================
 * The top bar: back to the posts, whether it is saved (at a fixed width, so
 * nothing moves when it changes), History, Preview, the post's settings and
 * Publish. Under it the title and storelib.com's own block editor
 * (components/admin/blog-editor.tsx) given the website blog's blocks, gallery
 * and button among them, and its menus in the person's language. Beside it,
 * or as a drawer on a phone, everything else about the post
 * (blog/post-panel.tsx).
 *
 * Always dark, as the writing surface of the admin's editor is, whatever
 * look Website Settings is in: it is drawn on document.body, outside the
 * settings page's light sheet, with data-ws-look="dark".
 *
 * SAVING (blog/save-queue.ts). An edit is saved 1.5s after typing stops, one
 * request at a time, each naming the version it was made from. Cmd+S saves
 * at once. A 409 (another tab, a team member) stops autosave and asks which
 * to keep. Publish, Update, Schedule and Preview save first, so what goes
 * live is exactly what is on screen. Leaving with something unsaved saves
 * it, and asks before going if it cannot.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Eye, History, Loader2, PanelRight, X } from "lucide-react"
import BlogEditor, { blankBlock } from "@/components/admin/blog-editor"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatDateTime } from "@/lib/i18n/format"
import { isSaveShortcut, readMinutes, wordCount } from "@/lib/blog/editor-tools"
import { SITE_BLOCK_TYPES } from "@/lib/site-blog/blocks"
import { isPostSlug, postSlugFrom } from "@/lib/site-blog/slug"
import type { AdminPost, SiteBlock, SitePostMeta } from "@/lib/site-blog/types"
import { Badge, SettingsLookContext } from "../parts"
import { storeNameFor } from "../seo"
import type { SettingsContext } from "../types"
import { BlogApiError, copyImage, getBlog, getPost, postAction, previewPost, savePostDraft, type BlogOverview, type PostAction } from "./api"
import { editorLabel } from "./editor-words"
import { statusLabel, statusTone } from "./model"
import { PostPanel } from "./post-panel"
import { PublishButton } from "./publish-popover"
import { RevisionsDialog } from "./revisions"
import { createSaveQueue, type SaveQueue, type SaveState } from "./save-queue"
import { BlogDialog } from "./ui"
import { uploadBlogImage } from "./upload"

type Load = { kind: "loading" } | { kind: "ready"; post: AdminPost; overview: BlogOverview } | { kind: "error"; message: string; sql: boolean }

export function SitePostEditor({ ctx, postId, onClose }: { ctx: SettingsContext; postId: string; onClose: () => void }) {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    Promise.all([getPost(ctx.installId, postId), getBlog(ctx.installId)])
      .then(([post, overview]) => live && setLoad({ kind: "ready", post, overview }))
      .catch((e: unknown) => live && setLoad({ kind: "error", message: e instanceof Error ? e.message : tt("Something went wrong. Try again."), sql: e instanceof BlogApiError && e.sql }))
    return () => {
      live = false
    }
  }, [ctx.installId, postId, attempt])

  if (typeof document === "undefined") return null
  return createPortal(
    <SettingsLookContext.Provider value="dark">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tt("Post editor")}
        data-site-post-editor=""
        data-ws-look="dark"
        className="wb-settings-in fixed inset-0 z-[160] flex flex-col bg-[#0f0f0f] text-white"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {load.kind === "ready" ? (
          <Writer ctx={ctx} initial={load.post} overview={load.overview} onClose={onClose} />
        ) : (
          <>
            <TopBar onBack={onClose} />
            <div className="grid flex-1 place-items-center px-6 text-center">
              {load.kind === "loading" ? (
                <p role="status" className="flex items-center gap-2 text-[14px] text-white/55">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tt("Opening the post")}
                </p>
              ) : (
                <div className="max-w-[420px]">
                  <p className="text-[15px] font-medium text-white">{load.sql ? tt("Blog turns on after the database update (SQL part 353).") : load.message}</p>
                  {!load.sql && (
                    <button
                      type="button"
                      onClick={() => {
                        setLoad({ kind: "loading" })
                        setAttempt((a) => a + 1)
                      }}
                      className="mt-4 inline-flex h-10 items-center rounded-lg border border-white/[0.13] bg-white/[0.06] px-4 text-[14px] font-medium text-white hover:bg-white/[0.1]"
                    >
                      {tt("Try again")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SettingsLookContext.Provider>,
    document.body,
  )
}

function TopBar({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-white/10 px-2 md:gap-2 md:px-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-white/80 transition-colors hover:text-white active:bg-white/[0.06] md:h-9 [-webkit-tap-highlight-color:transparent]"
        data-blog-back=""
      >
        <ArrowLeft className="h-[18px] w-[18px] md:h-4 md:w-4" strokeWidth={2} />
        <span className="max-sm:sr-only">{tt("Posts")}</span>
      </button>
      {children}
    </header>
  )
}

const iconBtn =
  "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/65 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 active:bg-white/[0.06] disabled:opacity-40 md:h-9 md:w-9 [-webkit-tap-highlight-color:transparent]"

function saveText(s: SaveState): string {
  switch (s.kind) {
    case "dirty":
      return tt("Unsaved")
    case "saving":
      return tt("Saving…")
    case "saved":
      return tt("Saved")
    case "error":
      return s.retrying ? tt("Not saved, retrying") : tt("Not saved")
    case "conflict":
      return tt("Changed elsewhere")
    default:
      return ""
  }
}

/** Whether the slug should keep following the title: a post never published whose slug is still the title's, or a placeholder. */
export function slugFollowsTitle(post: Pick<AdminPost, "firstPublishedAt">, meta: Pick<SitePostMeta, "slug" | "title">): boolean {
  if (post.firstPublishedAt) return false
  return !meta.slug || meta.slug === postSlugFrom(meta.title) || /^(post|untitled|new-post)(-\d+)?$/.test(meta.slug)
}

type Done = { action: PostAction; post: AdminPost }

function Writer({ ctx, initial, overview, onClose }: { ctx: SettingsContext; initial: AdminPost; overview: BlogOverview; onClose: () => void }) {
  const [post, setPost] = React.useState(initial)
  const [meta, setMetaState] = React.useState<SitePostMeta>(initial.meta)
  const [blocks, setBlocksState] = React.useState<SiteBlock[]>(() => (initial.blocks.length ? initial.blocks : [blankBlock("p")]))
  const [editorKey, setEditorKey] = React.useState(0)
  const [save, setSave] = React.useState<SaveState>({ kind: "idle" })
  const [busy, setBusy] = React.useState<PostAction | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<Done | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [panelOpen, setPanelOpen] = React.useState(true)
  const [drawer, setDrawer] = React.useState(false)
  const [leaving, setLeaving] = React.useState<null | "asking" | "saving">(null)
  const [previewing, setPreviewing] = React.useState(false)

  const metaRef = React.useRef(meta)
  const blocksRef = React.useRef(blocks)
  const versionRef = React.useRef(initial.version)
  const queueRef = React.useRef<SaveQueue | null>(null)
  const slugFollows = React.useRef(slugFollowsTitle(initial, initial.meta))
  const titleRef = React.useRef<HTMLTextAreaElement>(null)
  const siteName = storeNameFor(ctx)

  /* The queue lives as long as the writer; made in an effect so a remount (React's strict mode) gets a live one. */
  React.useEffect(() => {
    const q = createSaveQueue({
      version: versionRef.current,
      save: (version) => savePostDraft(ctx.installId, initial.id, { meta: metaRef.current, blocks: blocksRef.current, version }),
      onState: setSave,
      onSaved: (p) => {
        versionRef.current = p.version
        setPost(p)
      },
    })
    queueRef.current = q
    return () => q.dispose()
  }, [ctx.installId, initial.id])

  const flash = React.useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 2400)
  }, [])

  const setMeta = React.useCallback((patch: Partial<SitePostMeta>) => {
    const next = { ...metaRef.current, ...patch }
    metaRef.current = next
    setMetaState(next)
    queueRef.current?.touch()
  }, [])
  const setBlocks = React.useCallback((next: SiteBlock[]) => {
    blocksRef.current = next
    setBlocksState(next)
    queueRef.current?.touch()
  }, [])
  const onSlugTouched = React.useCallback(() => {
    slugFollows.current = false
  }, [])
  const onTitle = (title: string) => {
    const patch: Partial<SitePostMeta> = { title }
    if (slugFollows.current) {
      const slug = postSlugFrom(title)
      if (slug && isPostSlug(slug)) patch.slug = slug
    }
    setMeta(patch)
  }

  /** What the server answered replaces what is on screen: a restore, or "take theirs" after a 409. */
  const replaceWith = React.useCallback((p: AdminPost) => {
    versionRef.current = p.version
    metaRef.current = p.meta
    blocksRef.current = p.blocks.length ? p.blocks : [blankBlock("p")]
    setMetaState(metaRef.current)
    setBlocksState(blocksRef.current)
    setPost(p)
    setEditorKey((k) => k + 1)
  }, [])

  /* Cmd+S saves now. Escape closes the drawer; the writer itself is only left by Back, so a stray Escape loses nothing. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSaveShortcut(e)) {
        e.preventDefault()
        const q = queueRef.current
        if (!q) return
        if (q.conflicted()) return flash(tt("Choose which version to keep first."))
        void q.flush().then((ok) => ok && flash(tt("Saved")))
        return
      }
      if (e.key === "Escape" && !e.defaultPrevented) setDrawer(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [flash])

  /* Closing the tab with something unsaved asks first. */
  React.useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (queueRef.current?.pending()) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onLeave)
    return () => window.removeEventListener("beforeunload", onLeave)
  }, [])

  /* The panel beside the writing from lg; a drawer under it. */
  const [wide, setWide] = React.useState(true)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const follow = () => setWide(mq.matches)
    follow()
    mq.addEventListener("change", follow)
    return () => mq.removeEventListener("change", follow)
  }, [])
  const togglePanel = () => (wide ? setPanelOpen((o) => !o) : setDrawer((d) => !d))

  async function back() {
    const q = queueRef.current
    if (!q || !q.pending()) return onClose()
    setLeaving("saving")
    const ok = await q.flush()
    if (ok) return onClose()
    setLeaving("asking")
  }

  async function act(action: PostAction, publishAt?: string | null): Promise<boolean> {
    setActionError(null)
    setDone(null)
    const q = queueRef.current
    if (!q) return false
    if (action !== "unpublish") {
      if (!metaRef.current.title.trim()) {
        setActionError(tt("Give the post a title first."))
        titleRef.current?.focus()
        return false
      }
      if (!isPostSlug(metaRef.current.slug)) {
        setActionError(tt("Give the post an address it can use, under Address and date."))
        return false
      }
    }
    setBusy(action)
    try {
      if (!(await q.flush())) {
        setActionError(q.conflicted() ? tt("Choose which version to keep first.") : tt("Your changes could not be saved, so nothing was published. Try again."))
        return false
      }
      const p = await postAction(ctx.installId, post.id, action, { publishAt: publishAt ?? null, version: q.version() })
      q.adopt(p)
      versionRef.current = p.version
      setPost(p)
      setDone({ action, post: p })
      return true
    } catch (e) {
      setActionError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function preview() {
    setActionError(null)
    /* Opened now, in the press, so a pop up blocker lets it through; pointed at the preview once the server has signed it. */
    const w = window.open("", "_blank")
    setPreviewing(true)
    try {
      await queueRef.current?.flush()
      const url = await previewPost(ctx.installId, post.id)
      if (w) {
        w.opener = null
        w.location.href = url
      } else window.open(url, "_blank", "noopener")
    } catch (e) {
      w?.close()
      setActionError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setPreviewing(false)
    }
  }

  async function resolve(choice: "mine" | "theirs") {
    const q = queueRef.current
    if (!q || save.kind !== "conflict") return
    let current = save.current
    if (!current) {
      try {
        current = await getPost(ctx.installId, post.id)
      } catch (e) {
        setActionError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
        return
      }
    }
    if (choice === "theirs") replaceWith(current)
    await q.resolve(choice, current)
  }

  const upload = React.useCallback((file: File) => uploadBlogImage(file), [])
  const importImage = React.useCallback((url: string) => copyImage(ctx.installId, url), [ctx.installId])
  const words = wordCount(blocks)
  const dirty = post.hasUnpublishedChanges || save.kind === "dirty" || save.kind === "saving"
  const liveUrl = post.livePath ? `${overview.liveBase}${post.livePath}` : null

  const panel = <PostPanel meta={meta} set={setMeta} post={post} overview={overview} siteName={siteName} words={words} minutes={readMinutes(words)} onSlugTouched={onSlugTouched} />

  return (
    <>
      <TopBar onBack={() => void back()}>
        <span
          role="status"
          aria-live="polite"
          title={save.kind === "error" ? save.message : undefined}
          data-blog-save={save.kind}
          className={cn("block w-[64px] truncate text-[12.5px] tabular-nums sm:w-[150px]", save.kind === "error" || save.kind === "conflict" ? "text-amber-200" : "text-white/50")}
        >
          {leaving === "saving" ? tt("Saving…") : saveText(save)}
        </span>
        <span className="flex-1" />
        <span className="hidden md:inline-flex">
          <Badge tone={statusTone(post.status)}>{statusLabel(post.status)}</Badge>
        </span>
        <button type="button" onClick={() => setHistoryOpen(true)} className={iconBtn} aria-label={tt("History")} title={tt("History")}>
          <History className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={() => void preview()} disabled={previewing} className={iconBtn} aria-label={tt("Preview")} title={tt("Preview")} data-blog-preview="">
          {previewing ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
        <button
          type="button"
          onClick={togglePanel}
          className={cn(iconBtn, (wide ? panelOpen : drawer) && "bg-white/[0.08] text-white")}
          aria-label={(wide ? panelOpen : drawer) ? tt("Hide post settings") : tt("Show post settings")}
          aria-expanded={wide ? panelOpen : drawer}
          aria-controls="site-post-settings"
        >
          <PanelRight className="h-[18px] w-[18px]" />
        </button>
        <PublishButton post={post} dirty={dirty} busy={busy} error={actionError} onAct={act} />
      </TopBar>

      {save.kind === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-[14px] text-amber-100 md:px-6">
          <span className="min-w-0 flex-1">{tt("This post was changed somewhere else (another tab or a team member) since you opened it. Autosave has stopped.")}</span>
          <button type="button" onClick={() => void resolve("theirs")} className="h-9 rounded-lg px-3 font-medium text-white/85 hover:bg-white/[0.08]">
            {tt("Load theirs")}
          </button>
          <button type="button" onClick={() => void resolve("mine")} className="h-9 rounded-lg bg-white px-3 font-semibold text-[#0f0f0f] hover:opacity-90">
            {tt("Keep mine")}
          </button>
        </div>
      )}
      {save.kind === "error" && !save.retrying && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-[14px] text-red-200 md:px-6">
          <span className="min-w-0 flex-1">{save.message}</span>
          {!save.sql && (
            <button type="button" onClick={() => void queueRef.current?.flush()} className="h-9 rounded-lg px-3 font-medium text-white/85 hover:bg-white/[0.08]">
              {tt("Try again")}
            </button>
          )}
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-[14px] text-red-200 md:px-6">
          <span className="min-w-0 flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label={tt("Close")} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/[0.08]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {done && <DoneBanner done={done} liveUrl={liveUrl} onClose={() => setDone(null)} />}

      <div className="relative flex min-h-0 flex-1">
        <main className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[760px] pb-40 pl-10 pr-5 pt-8 sm:pl-14 sm:pr-10 md:pt-14">
            <TitleField ref={titleRef} value={meta.title} onChange={onTitle} />
            <div className="mt-6">
              <BlogEditor
                key={editorKey}
                blocks={blocks}
                onChange={setBlocks}
                onUpload={upload}
                onImport={importImage}
                onLeaveTop={() => titleRef.current?.focus()}
                types={SITE_BLOCK_TYPES}
                label={editorLabel}
              />
            </div>
          </div>
        </main>

        {wide ? (
          panelOpen && (
            <aside id="site-post-settings" aria-label={tt("Post settings")} className="wb-slim-scroll w-[360px] shrink-0 overflow-y-auto overscroll-contain border-l border-white/10 bg-[#121212]">
              {panel}
            </aside>
          )
        ) : (
          <>
            <div aria-hidden className={cn("fixed inset-0 z-[162] bg-black/50 transition-opacity duration-200", drawer ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setDrawer(false)} />
            <aside
              id="site-post-settings"
              aria-label={tt("Post settings")}
              aria-hidden={!drawer}
              inert={!drawer}
              className={cn(
                "fixed inset-y-0 right-0 z-[163] flex w-full max-w-[420px] flex-col bg-[#121212] shadow-[-24px_0_48px_-16px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                drawer ? "translate-x-0" : "translate-x-full",
              )}
              style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 pl-5 pr-2">
                <p className="text-[16px] font-semibold">{tt("Post settings")}</p>
                <button type="button" onClick={() => setDrawer(false)} className={iconBtn} aria-label={tt("Close")}>
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">{panel}</div>
            </aside>
          </>
        )}
      </div>

      {toast && (
        <p role="status" className="wb-settings-in pointer-events-none fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-[175] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#0f0f0f] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {toast}
        </p>
      )}

      {historyOpen && (
        <RevisionsDialog
          installId={ctx.installId}
          postId={post.id}
          beforeRestore={() => queueRef.current?.flush() ?? Promise.resolve(true)}
          onRestored={(p) => {
            replaceWith(p)
            queueRef.current?.adopt(p)
            flash(tt("Restored into your draft"))
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {leaving === "asking" && (
        <BlogDialog
          destructive
          title={tt("Leave without saving?")}
          lead={save.kind === "conflict" ? tt("This post was changed somewhere else. Your last changes are only on this screen.") : tt("Your last changes could not be saved. If you leave now, they are lost.")}
          confirmLabel={tt("Leave")}
          busy={false}
          error={null}
          onCancel={() => setLeaving(null)}
          onConfirm={onClose}
        />
      )}
    </>
  )
}

function DoneBanner({ done, liveUrl, onClose }: { done: Done; liveUrl: string | null; onClose: () => void }) {
  const p = done.post
  const text =
    done.action === "unpublish"
      ? tt("Unpublished. It is a draft again and its address no longer opens.")
      : p.status === "scheduled"
        ? tt("Scheduled. It goes live {when}.", { when: formatDateTime(p.publishedAt ?? "", { dateStyle: "medium", timeStyle: "short" }) })
        : done.action === "update"
          ? tt("Updated. Visitors see your changes now.")
          : tt("Published. It is on your website now.")
  return (
    <div role="status" data-blog-done={done.action} className="flex flex-wrap items-center gap-3 border-b border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-[14px] text-emerald-100 md:px-6">
      <span className="min-w-0 flex-1">{text}</span>
      {liveUrl && p.status === "published" && done.action !== "unpublish" && (
        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="h-9 rounded-lg bg-white px-3 font-semibold leading-9 text-[#0f0f0f] hover:opacity-90" data-live-url={liveUrl}>
          {tt("View post")}
        </a>
      )}
      <button type="button" onClick={onClose} aria-label={tt("Close")} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/[0.08]">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** The title: a text area that grows with it. Enter goes into the post. */
const TitleField = React.forwardRef<HTMLTextAreaElement, { value: string; onChange: (v: string) => void }>(function TitleField({ value, onChange }, outer) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null)
  React.useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  React.useEffect(() => {
    if (!value) ref.current?.focus()
    // Only on opening: a new post starts in its title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={200}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if ((e.key === "Enter" && !e.nativeEvent.isComposing) || (e.key === "ArrowDown" && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
          e.preventDefault()
          e.currentTarget.closest("[data-site-post-editor]")?.querySelector<HTMLElement>("[data-blog-editor] [data-rt], [data-blog-editor] input, [data-blog-editor] textarea")?.focus()
        }
      }}
      placeholder={tt("Post title")}
      aria-label={tt("Title")}
      data-blog-title=""
      className="block w-full resize-none overflow-hidden bg-transparent text-[30px] font-semibold leading-[1.2] tracking-[-0.022em] text-white outline-none placeholder:text-white/25 md:text-[40px]"
    />
  )
})
