"use client"

/**
 * The editor: chat on the left, the site on the right.
 *
 * ONE COPY OF THE FILES, held here. The bundler reads it, Monaco writes it, the
 * autosave posts from it. The alternative — Monaco owning the text and this
 * asking for it — is how an editor ends up rebuilding a version of a file that
 * is one keystroke behind what is on screen.
 *
 * ---------------------------------------------------------------------------
 *  DARK, AND ONLY HERE
 * ---------------------------------------------------------------------------
 * The `dark` class is on this component's root rather than on <html>, so the
 * editor is dark whatever theme the rest of Storelib is in, and nothing outside
 * this subtree changes. A tool that frames somebody's website should recede;
 * the one bright rectangle on screen ought to be the site being built.
 *
 * The PREVIEW stays white — it is the site, not the chrome, and tinting it
 * would be lying about what a visitor sees.
 *
 * ---------------------------------------------------------------------------
 *  TWO LAYOUTS, NOT ONE THAT SHRINKS
 * ---------------------------------------------------------------------------
 * Above `md` the chat is a fixed column beside the work. Below it there is no
 * honest way to show both: a 360px chat next to a 320px preview is two useless
 * panes, so the panes become full-screen and the bottom bar switches between
 * them — Chat, Preview, Code. The desktop layout keeps Preview and Code as
 * tabs over ONE pane for the same reason: three columns on a 1440px screen
 * leaves the preview narrower than the phone frame it is meant to be
 * previewing at desktop width.
 */

import * as React from "react"
import {
  ArrowLeft,
  AlertCircle,
  Check,
  Code2,
  Download,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Maximize2,
  MessageSquare,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"
import { publishedUrl } from "@/lib/sites/public-host"
import {
  clearLocalDraft,
  readLocalDraft,
  unsavedIn,
  writeLocalDraft,
  type LocalDraft,
} from "@/lib/sites/local-draft"
import type { ProjectFiles, Site } from "@/lib/sites/types"
import { ChatPane } from "./chat-pane"
import { CodePane } from "./code-pane"
import { BuildStatus, PreviewPane, type Viewport } from "./preview-pane"
import { PublishButton, type PublishState } from "./publish-button"
import { HistoryPanel } from "./history-panel"
import { SiteSheet } from "./site-sheet"
import { useBundler } from "./use-bundler"
import { StorelibLogo } from "@/components/brand/storelib-logo"

type SaveState = "clean" | "dirty" | "saving" | "error"
type Pane = "chat" | "preview" | "code"


/**
 * "a moment ago", "12 minutes ago". Enough to tell somebody whether the work
 * being offered back is the thing they were just doing or something from
 * yesterday; no library, and no false precision.
 */
function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return "earlier"
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 45) return "a moment ago"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}

const AUTOSAVE_MS = 1200

export function EditorShell({
  site,
  initialFiles,
  initialRevision,
  initiallyBehind,
  openingBrief,
}: {
  site: Site
  initialFiles: ProjectFiles
  /** The version these files came from. See `revision` below. */
  initialRevision: number
  /** The live build is behind the current draft — computed from the site's
   *  revision against the one the last publish was built from. */
  initiallyBehind: boolean
  /** From the New Site flow: sent as the first message, once. */
  openingBrief?: string
}) {
  const [files, setFiles] = React.useState<ProjectFiles>(initialFiles)
  const [pane, setPane] = React.useState<Pane>("preview")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [activePath, setActivePath] = React.useState<string | null>(
    initialFiles["src/App.tsx"] !== undefined ? "src/App.tsx" : (Object.keys(initialFiles)[0] ?? null),
  )
  const [saveState, setSaveState] = React.useState<SaveState>("clean")
  const [saveError, setSaveError] = React.useState<string | null>(null)
  /**
   * Work this device kept that the server never heard about, found on open.
   * Null when there is none, which is the ordinary case.
   */
  const [recovered, setRecovered] = React.useState<LocalDraft | null>(null)
  /** The device refused to keep a draft. Said out loud rather than assumed. */
  const [noLocalNet, setNoLocalNet] = React.useState(false)

  /**
   * What is live, and whether it still matches what is on screen.
   *
   * `stale` is set by any edit — typed or made by the agent — because the
   * moment a file changes, the published page and the editor disagree, and a
   * button that still said "Live" would be telling the creator their change
   * is online when it is not.
   */
  const [publishState, setPublishState] = React.useState<PublishState>(
    site.status === "published" && site.slug
      ? // `initiallyBehind` compares the site's current revision against the
        // one the last publish was built from. Hard-coding `false` here meant
        // reopening a site with unpublished edits showed "Live" over a draft
        // the live page had never seen.
        { kind: "live", url: publishedUrl(site.slug), stale: initiallyBehind }
      : { kind: "unpublished" },
  )

  const markStale = React.useCallback(() => {
    setPublishState((previous) =>
      previous.kind === "live" && !previous.stale ? { ...previous, stale: true } : previous,
    )
  }, [])

  const publish = React.useCallback(async () => {
    setPublishState({ kind: "publishing" })
    try {
      const response = await fetch(`/api/sites/${site.id}/publish`, { method: "POST" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setPublishState({
          kind: "failed",
          message: body.error ?? "Could not publish.",
          details: body.details,
        })
        return
      }
      setPublishState({ kind: "live", url: body.url, stale: false })
    } catch {
      setPublishState({ kind: "failed", message: "Could not reach the server." })
    }
  }, [site.id])

  /**
   * What has changed since the last successful save, by path.
   *
   * A ref rather than state: it must not re-render anything, and — more
   * importantly — it must be readable by the save that is in flight without
   * that save capturing a stale copy. A set that lives in state gives every
   * save the version of the set that existed when its timer was scheduled.
   */
  const dirtyPaths = React.useRef(new Set<string>())

  /**
   * The version of the site these files came from.
   *
   * Sent on every save so the database can refuse a write built on a stale
   * read — the compare-and-swap in `site_commit_files`. A ref, because the
   * save closure must read the CURRENT value rather than the one captured
   * when its timer was scheduled, which is the same reason `dirtyPaths` is
   * one.
   */
  const revision = React.useRef(initialRevision)
  const [conflict, setConflict] = React.useState(false)
  const build = useBundler(files)

  /**
   * The agent writes to the database, not to this copy — so after a run the
   * editor has to go and look.
   *
   * Locally dirty paths are kept. Somebody who typed in the Code tab while the
   * agent was working has unsaved edits, and overwriting them with the
   * server's version would delete work that is on screen in front of them.
   */
  const adoptAgentChanges = React.useCallback(async () => {
    const response = await fetch(`/api/sites/${site.id}/files`)
    if (!response.ok) return
    const body = (await response.json()) as { files?: ProjectFiles; revision?: number }
    if (!body.files) return
    // The agent wrote, so the editor's revision is behind by exactly that
    // write. Adopting the new one is what lets the next autosave succeed
    // instead of conflicting with an edit the same person just asked for.
    if (typeof body.revision === "number") revision.current = body.revision
    setFiles((previous) => {
      const merged = { ...body.files }
      for (const path of dirtyPaths.current) merged[path] = previous[path]
      return merged
    })
    markStale()
  }, [markStale, site.id])

  const editFile = React.useCallback(
    (path: string, content: string) => {
      setFiles((previous) => (previous[path] === content ? previous : { ...previous, [path]: content }))
      dirtyPaths.current.add(path)
      setSaveState("dirty")
      markStale()
      /**
       * WRITTEN BEFORE THE SERVER HEARS ABOUT IT, which is the point. The
       * autosave is 1.2s away and may fail; this is what is left when the tab
       * does not live that long. Only the unsaved paths, never the project.
       */
      const draft: ProjectFiles = {}
      for (const dirty of dirtyPaths.current) {
        draft[dirty] = dirty === path ? content : (files[dirty] ?? "")
      }
      const kept = writeLocalDraft(site.id, {
        revision: revision.current,
        savedAt: new Date().toISOString(),
        files: draft,
      })
      setNoLocalNet(!kept)
    },
    [files, markStale, site.id],
  )

  const save = React.useCallback(async () => {
    const paths = [...dirtyPaths.current]
    if (paths.length === 0) return

    /**
     * Cleared BEFORE the request, not after. An edit made while the request is
     * in flight has to land in the NEXT save, and clearing afterwards would
     * throw it away — the file would look saved and would not be.
     */
    dirtyPaths.current.clear()
    setSaveState("saving")
    setSaveError(null)

    const payload: ProjectFiles = {}
    for (const path of paths) payload[path] = files[path] ?? ""

    try {
      const response = await fetch(`/api/sites/${site.id}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payload, revision: revision.current }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        // Put them back: unsaved is the truth, and the next autosave should
        // try again rather than the change quietly ceasing to exist.
        for (const path of paths) dirtyPaths.current.add(path)
        setSaveState("error")
        setSaveError(body.error ?? "Could not save.")
        /**
         * A conflict is NOT retried. Somebody else — another tab, an agent run
         * — has written since this editor last read, so retrying would be
         * exactly the overwrite the revision exists to prevent. The banner
         * below asks the person to reload, which is the only safe resolution
         * without a merge UI.
         */
        if (response.status === 409 || body.conflict) setConflict(true)
        return
      }
      const saved = await response.json().catch(() => ({}))
      if (typeof saved.revision === "number") revision.current = saved.revision
      /**
       * The device's copy goes when, and only when, the server has the work.
       * Anything still dirty is re-kept under the new revision rather than
       * dropped, because a save landing is not the same as everything having
       * been sent: an edit made while the request was in flight is still only
       * here.
       */
      if (dirtyPaths.current.size === 0) {
        clearLocalDraft(site.id)
      } else {
        const remaining: ProjectFiles = {}
        for (const path of dirtyPaths.current) remaining[path] = files[path] ?? ""
        writeLocalDraft(site.id, {
          revision: revision.current,
          savedAt: new Date().toISOString(),
          files: remaining,
        })
      }
      setSaveState(dirtyPaths.current.size > 0 ? "dirty" : "clean")
    } catch {
      for (const path of paths) dirtyPaths.current.add(path)
      setSaveState("error")
      setSaveError("Could not reach the server.")
    }
  }, [files, site.id])

  React.useEffect(() => {
    if (saveState !== "dirty") return
    const timer = setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [saveState, save])

  /**
   * Closing the tab with unsaved work is the one moment a browser will let us
   * interrupt, and autosave being 1.2s away is not a reason to skip it: the
   * save that has not fired yet is exactly the one at risk.
   *
   * A WARNING IS NOT A SAVE, though, and this is the only thing that used to
   * happen. `beforeunload` does not fire at all when iOS kills a backgrounded
   * page, so on a phone the dialog somebody is relying on is often never
   * shown and the work goes with the tab.
   */
  React.useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtyPaths.current.size === 0) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  /** A hidden-tab flush went out and we do not know whether it landed. */
  const flushedWhileHidden = React.useRef(false)

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  GOING AWAY IS WHEN TO SAVE, NOT WHEN TO ASK
   * ═══════════════════════════════════════════════════════════════════════
   * `visibilitychange` to hidden is the last event a browser reliably gives a
   * page it is about to background or discard, and `keepalive` is what lets a
   * request outlive the document. Together they are the save that the 1.2s
   * timer was never going to reach.
   *
   * NOT CLEARED FROM THE DIRTY SET. Nothing here can know the request landed,
   * and a path removed from the queue on a guess is a change that quietly
   * ceases to exist. Re-sending the same content is free; losing it is not.
   *
   * WHICH LEAVES THE REVISION. If the flush DID land, the server moved on and
   * this editor's revision is one behind, so the next ordinary autosave would
   * come back 409 and tell somebody their own tab conflicted with itself. So
   * coming back into view after a flush re-reads the project — the same call
   * an agent run uses, which keeps locally dirty paths and adopts the new
   * revision.
   *
   * `keepalive` bodies are capped at 64KB by the fetch spec. Over that, the
   * request would be rejected outright, so it is not sent: the device's own
   * copy is the net for a save that large, and the banner on the way back in
   * is how it is offered.
   */
  React.useEffect(() => {
    const flush = () => {
      const paths = [...dirtyPaths.current]
      if (paths.length === 0) return
      const payload: ProjectFiles = {}
      for (const path of paths) payload[path] = files[path] ?? ""
      const body = JSON.stringify({ files: payload, revision: revision.current })
      if (body.length > 64_000) return
      try {
        void fetch(`/api/sites/${site.id}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {})
        flushedWhileHidden.current = true
      } catch {
        /* A browser that refuses the request still has the device's copy. */
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush()
        return
      }
      if (flushedWhileHidden.current) {
        flushedWhileHidden.current = false
        void adoptAgentChanges()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", flush)
    }
  }, [adoptAgentChanges, files, site.id])

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  WHAT THE LAST SESSION DID NOT MANAGE TO SEND
   * ═══════════════════════════════════════════════════════════════════════
   * Read once, on open, against the files the server just handed us. A draft
   * whose contents already match the server is not an offer, it is a prompt
   * about nothing — that happens whenever a save landed and the tab closed
   * before it could be cleared — so it is dropped quietly.
   */
  React.useEffect(() => {
    const draft = readLocalDraft(site.id)
    if (!draft) return
    const missing = unsavedIn(draft, initialFiles)
    if (Object.keys(missing).length === 0) {
      clearLocalDraft(site.id)
      return
    }
    setRecovered({ ...draft, files: missing })
    // Runs for the site this editor opened on, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  /** Put the recovered work back into the editor, which queues it to save. */
  const restoreRecovered = React.useCallback(() => {
    const draft = recovered
    if (!draft) return
    setFiles((previous) => ({ ...previous, ...draft.files }))
    for (const path of Object.keys(draft.files)) dirtyPaths.current.add(path)
    setSaveState("dirty")
    markStale()
    setRecovered(null)
  }, [markStale, recovered])

  const discardRecovered = React.useCallback(() => {
    clearLocalDraft(site.id)
    setRecovered(null)
  }, [site.id])

  /**
   * The preview's own controls, owned here so the top bar can drive them —
   * a device switcher and a reload belong beside the address they act on,
   * not stacked in a second strip underneath it.
   */
  const [viewport, setViewport] = React.useState<Viewport>("desktop")
  const [previewNonce, setPreviewNonce] = React.useState(0)
  const [chatCollapsed, setChatCollapsed] = React.useState(false)

  /**
   * The site's address, without the scheme — it is read, not clicked, in the
   * bar. Null until the site has a slug, because a site that has never been
   * published has no address to show and inventing one would be a promise.
   */
  const publishedAddress = site.slug ? publishedUrl(site.slug).replace(/^https:\/\//, "") : null

  const workPane = pane === "code" ? "code" : "preview"

  return (
    <div
      className={cn(
        "dark flex h-dvh flex-col overflow-hidden bg-background text-foreground",
        // The editor is a fixed surface. Without this an iOS rubber-band drag
        // moves the whole tool and reveals the page behind it.
        "overscroll-none",
      )}
    >
      {/* ─────────────────────────── top bar ───────────────────────────
        *
        * Four groups, left to right: WHERE YOU ARE (mark, name, save state),
        * WHAT YOU ARE LOOKING AT (history, chat toggle, Preview/Code), THE
        * PAGE ITSELF (its address and the controls that act on it), and WHAT
        * YOU CAN DO WITH IT (download, publish).
        *
        * The device switcher and the reload used to sit in a second strip
        * under this one, above the frame. They belong beside the address they
        * act on — that is the row a person reads when they want to know what
        * they are looking at and how to change it.
        */}
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:gap-2 sm:px-3">
        {/* ── where you are ── */}
        <SmartLink
          href="/app/sites"
          aria-label="Back to Sites"
          className="flex shrink-0 items-center rounded-[8px] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 sm:hidden" />
          {/* The logo, not a letter. */}
          <StorelibLogo size={24} alt="" className="hidden sm:block" />
        </SmartLink>

        <span className="hidden text-sm text-muted-foreground sm:inline">/</span>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{site.name}</span>
          <SaveBadge state={saveState} error={saveError} />
        </div>

        {/* ── what you are looking at ── */}
        <div className="ml-1 hidden items-center gap-0.5 md:flex">
          <BarButton
            icon={History}
            label="Version history"
            onClick={() => setHistoryOpen(true)}
          />
          <BarButton
            icon={chatCollapsed ? PanelLeftOpen : PanelLeftClose}
            label={chatCollapsed ? "Show the chat" : "Hide the chat"}
            onClick={() => setChatCollapsed((v) => !v)}
          />
        </div>

        <div className="ml-1 hidden items-center gap-0.5 rounded-[9px] bg-muted p-0.5 md:flex">
          {([["preview", "Preview", Eye], ["code", "Code", Code2]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              aria-pressed={workPane === key}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs transition-colors",
                workPane === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── the page itself ──
          * The address is the site's own, and it is only a link once there is
          * something at the other end: an anchor pointing at a site that has
          * never been published is a promise the product cannot keep.
          */}
        <div className="ml-2 hidden min-w-0 flex-1 items-center gap-1 rounded-[9px] border border-border bg-muted/40 pl-3 pr-1 md:flex">
          <span className="truncate text-xs text-muted-foreground" title={publishedAddress ?? undefined}>
            {publishedAddress ?? "Not published yet"}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <BuildStatus build={build} />

            <BarButton
              icon={RefreshCw}
              label="Reload the preview"
              onClick={() => setPreviewNonce((n) => n + 1)}
              disabled={workPane !== "preview"}
            />

            {/* The device switcher acts on the preview, so it is dimmed when
                the Code pane is showing rather than silently doing nothing. */}
            <span className="mx-0.5 hidden h-4 w-px bg-border lg:block" />
            <div className="hidden items-center gap-0.5 lg:flex">
              {([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(
                ([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPane("preview")
                      setViewport(key)
                    }}
                    aria-label={key}
                    aria-pressed={viewport === key}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors",
                      viewport === key && workPane === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ),
              )}
            </div>

            <BarButton
              icon={Maximize2}
              label="Full screen preview"
              onClick={() => {
                setPane("preview")
                setChatCollapsed(true)
              }}
            />

            {publishedAddress && publishState.kind === "live" ? (
              <a
                href={publishState.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the live site"
                title="Open the live site"
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        {/* ── what you can do with it ── */}
        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          <a
            href={`/api/sites/${site.id}/export`}
            aria-label="Download project"
            title="Download as a Vite project"
            className="hidden h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Phone: the control opens the sheet, where the address and the
              48px publish button live. Desktop: it acts directly. */}
          <span className="md:hidden">
            <PublishButton state={publishState} onPublish={() => setSheetOpen(true)} compact />
          </span>
          <span className="hidden md:block">
            <PublishButton state={publishState} onPublish={() => void publish()} />
          </span>
        </div>
      </header>

      {/* ─────────────────────────── the work ─────────────────────────── */}
      {/*
        * WORK THIS DEVICE KEPT, OFFERED BACK.
        *
        * Above the conflict banner on purpose: if both are up, the reload the
        * conflict asks for would take the recovered files with it, so the
        * thing that can be lost is the one nearer the top.
        */}
      {recovered && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sky-500/30 bg-sky-500/10 px-3 py-2">
          <p className="text-xs text-sky-100">
            {Object.keys(recovered.files).length === 1
              ? "1 file changed here and never reached the server."
              : `${Object.keys(recovered.files).length} files changed here and never reached the server.`}{" "}
            <span className="text-sky-200/70">Kept on this device {relativeTime(recovered.savedAt)}.</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={discardRecovered}
              className="rounded-[7px] px-2.5 py-1 text-xs text-sky-200/70 hover:text-sky-100"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={restoreRecovered}
              className="rounded-[7px] border border-sky-500/40 px-2.5 py-1 text-xs text-sky-50"
            >
              Put it back
            </button>
          </div>
        </div>
      )}

      {/*
        * The device cannot keep anything — a private window, or storage that
        * is full. Said once, quietly, because the editor still works and the
        * only thing missing is the net under it.
        */}
      {noLocalNet && !recovered && (
        <div className="shrink-0 border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            This browser will not keep a local copy of unsaved edits. Your work still saves to
            Storelib as you type.
          </p>
        </div>
      )}

      {conflict && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            This site changed somewhere else. Reload to get the latest version — saving now would
            overwrite it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-[7px] border border-amber-500/40 px-2.5 py-1 text-xs text-amber-100"
          >
            Reload
          </button>
        </div>
      )}

      {/*
        * Collapsing the chat gives the preview the whole width, which is what
        * somebody wants the moment they stop describing and start looking. The
        * column is removed from the grid rather than hidden, so the preview
        * actually reflows into the space instead of leaving a gap where the
        * chat used to be.
        *
        * Desktop only: on a phone the two are separate screens already, and
        * the bottom bar is how you move between them.
        */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          chatCollapsed ? "md:grid-cols-[1fr]" : "md:grid-cols-[minmax(320px,380px)_1fr]",
        )}
      >
        <div
          className={cn(
            "min-h-0",
            chatCollapsed ? "md:hidden" : "md:block",
            pane === "chat" ? "block" : "hidden",
          )}
        >
          <ChatPane
            siteId={site.id}
            siteName={site.name}
            openingBrief={openingBrief}
            onFilesChanged={adoptAgentChanges}
          />
        </div>

        <div className={cn("min-h-0", pane === "chat" ? "hidden md:block" : "block")}>
          {workPane === "preview" ? (
            <PreviewPane build={build} html={files["index.html"]} viewport={viewport} nonce={previewNonce} />
          ) : (
            <CodePane files={files} activePath={activePath} onSelect={setActivePath} onChange={editFile} />
          )}
        </div>
      </div>

      {/* ───────────────────── mobile: one pane at a time ───────────────────── */}
      <nav
        className="flex h-14 shrink-0 items-stretch border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Editor panes"
      >
        {([["chat", "Chat", MessageSquare], ["preview", "Preview", Eye], ["code", "Code", Code2]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              aria-pressed={pane === key}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                pane === key ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ),
        )}
      </nav>

      <SiteSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        siteName={site.name}
        siteId={site.id}
        state={publishState}
        onPublish={() => void publish()}
        onHistory={() => {
          setSheetOpen(false)
          setHistoryOpen(true)
        }}
      />

      <HistoryPanel
        siteId={site.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={() => void adoptAgentChanges()}
      />
    </div>
  )
}

/**
 * One icon button in the top bar.
 *
 * Six of these, and writing the same seven Tailwind classes six times is how
 * one of them ends up a pixel taller than its neighbours after somebody edits
 * it in a hurry.
 */
function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors",
        "hover:bg-background hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Saving</span>
      </span>
    )
  }
  if (state === "dirty") {
    return <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Unsaved</span>
  }
  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-destructive" title={error ?? undefined}>
        <AlertCircle className="h-3 w-3" />
        <span className="hidden sm:inline">Not saved</span>
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3" />
      <span className="hidden sm:inline">Saved</span>
    </span>
  )
}
