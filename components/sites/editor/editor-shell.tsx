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
import { ArrowLeft, Check, Code2, Eye, Globe, Loader2, MessageSquare, AlertCircle } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"
import type { ProjectFiles, Site } from "@/lib/sites/types"
import { ChatPane } from "./chat-pane"
import { CodePane } from "./code-pane"
import { PreviewPane } from "./preview-pane"
import { useBundler } from "./use-bundler"

type SaveState = "clean" | "dirty" | "saving" | "error"
type Pane = "chat" | "preview" | "code"

const AUTOSAVE_MS = 1200

export function EditorShell({ site, initialFiles }: { site: Site; initialFiles: ProjectFiles }) {
  const [files, setFiles] = React.useState<ProjectFiles>(initialFiles)
  const [pane, setPane] = React.useState<Pane>("preview")
  const [activePath, setActivePath] = React.useState<string | null>(
    initialFiles["src/App.tsx"] !== undefined ? "src/App.tsx" : (Object.keys(initialFiles)[0] ?? null),
  )
  const [saveState, setSaveState] = React.useState<SaveState>("clean")
  const [saveError, setSaveError] = React.useState<string | null>(null)

  /**
   * What has changed since the last successful save, by path.
   *
   * A ref rather than state: it must not re-render anything, and — more
   * importantly — it must be readable by the save that is in flight without
   * that save capturing a stale copy. A set that lives in state gives every
   * save the version of the set that existed when its timer was scheduled.
   */
  const dirtyPaths = React.useRef(new Set<string>())
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
    const body = (await response.json()) as { files?: ProjectFiles }
    if (!body.files) return
    setFiles((previous) => {
      const merged = { ...body.files }
      for (const path of dirtyPaths.current) merged[path] = previous[path]
      return merged
    })
  }, [site.id])

  const editFile = React.useCallback((path: string, content: string) => {
    setFiles((previous) => (previous[path] === content ? previous : { ...previous, [path]: content }))
    dirtyPaths.current.add(path)
    setSaveState("dirty")
  }, [])

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
        body: JSON.stringify({ files: payload }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        // Put them back: unsaved is the truth, and the next autosave should
        // try again rather than the change quietly ceasing to exist.
        for (const path of paths) dirtyPaths.current.add(path)
        setSaveState("error")
        setSaveError(body.error ?? "Could not save.")
        return
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
          <AddressChip site={site} />

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
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(320px,380px)_1fr]">
        <div className={cn("min-h-0 md:block", pane === "chat" ? "block" : "hidden")}>
          <ChatPane siteId={site.id} siteName={site.name} onFilesChanged={adoptAgentChanges} />
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
    </div>
  )
}

/**
 * Where the site lives, or that it does not live anywhere yet.
 *
 * Bolt puts a URL bar here. Ours would be a lie until Publish exists, so it
 * says the address it has reserved and that nothing is served from it — which
 * is the one thing somebody looking at this corner wants to know.
 */
function AddressChip({ site }: { site: Site }) {
  const published = site.status === "published"
  return (
    <span
      className="hidden items-center gap-1.5 rounded-[7px] border border-border px-2 py-1 text-[11px] text-muted-foreground lg:inline-flex"
      title={published ? "Live" : "Not published yet"}
    >
      <Globe className="h-3 w-3 shrink-0" />
      <span className="max-w-[220px] truncate">
        {site.slug ? `${site.slug}.storelib.site` : "No address yet"}
      </span>
      {!published && <span className="text-muted-foreground/60">· draft</span>}
    </span>
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
