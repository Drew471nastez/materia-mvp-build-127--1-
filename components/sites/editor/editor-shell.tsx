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
import { ArrowLeft, AlertCircle, Check, Code2, Download, Eye, History, Loader2, MessageSquare } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"
import { publishedUrl } from "@/lib/sites/public-host"
import type { ProjectFiles, Site } from "@/lib/sites/types"
import { ChatPane } from "./chat-pane"
import { CodePane } from "./code-pane"
import { PreviewPane } from "./preview-pane"
import { PublishButton, type PublishState } from "./publish-button"
import { HistoryPanel } from "./history-panel"
import { SiteSheet } from "./site-sheet"
import { useBundler } from "./use-bundler"

type SaveState = "clean" | "dirty" | "saving" | "error"
type Pane = "chat" | "preview" | "code"

const AUTOSAVE_MS = 1200

export function EditorShell({
  site,
  initialFiles,
  initialRevision,
  openingBrief,
}: {
  site: Site
  initialFiles: ProjectFiles
  /** The version these files came from. See `revision` below. */
  initialRevision: number
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
   * What is live, and whether it still matches what is on screen.
   *
   * `stale` is set by any edit — typed or made by the agent — because the
   * moment a file changes, the published page and the editor disagree, and a
   * button that still said "Live" would be telling the creator their change
   * is online when it is not.
   */
  const [publishState, setPublishState] = React.useState<PublishState>(
    site.status === "published" && site.slug
      ? { kind: "live", url: publishedUrl(site.slug), stale: false }
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
    },
    [markStale],
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
      {/* ─────────────────────────── top bar ─────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-3">
        <SmartLink
          href="/app/sites"
          aria-label="Back to Sites"
          className="flex shrink-0 items-center gap-1.5 rounded-[8px] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 sm:hidden" />
          {/*
            The mark, not a letter. `img` rather than next/image: it is a fixed
            24px SVG from our own public folder, so there is nothing for an
            optimizer to do and a remotePatterns entry to maintain would be a
            cost with no return.
          */}
          <img
            src="/storelib-mark.svg"
            alt=""
            width={24}
            height={24}
            className="hidden h-6 w-6 rounded-[6px] sm:block"
          />
        </SmartLink>

        <span className="hidden text-sm text-muted-foreground sm:inline">/</span>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{site.name}</span>
          <SaveBadge state={saveState} error={saveError} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Desktop only: on a phone these live in the sheet, where they
              have room for a label and a real tap target. */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Version history"
            title="Version history"
            className="hidden h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          >
            <History className="h-4 w-4" />
          </button>
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

          {/* Desktop: Preview / Code over one pane. Mobile has the bottom bar. */}
          <div className="hidden items-center gap-0.5 rounded-[8px] bg-muted p-0.5 md:flex">
            {([["preview", "Preview", Eye], ["code", "Code", Code2]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPane(key)}
                aria-pressed={workPane === key}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-xs transition-colors",
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
        </div>
      </header>

      {/* ─────────────────────────── the work ─────────────────────────── */}
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

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(320px,380px)_1fr]">
        <div className={cn("min-h-0 md:block", pane === "chat" ? "block" : "hidden")}>
          <ChatPane
            siteId={site.id}
            siteName={site.name}
            openingBrief={openingBrief}
            onFilesChanged={adoptAgentChanges}
          />
        </div>

        <div className={cn("min-h-0", pane === "chat" ? "hidden md:block" : "block")}>
          {workPane === "preview" ? (
            <PreviewPane build={build} html={files["index.html"]} />
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
