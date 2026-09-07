"use client"

/**
 * The editor: chat on the left, the site on the right.
 *
 * ONE COPY OF THE FILES, held here. The bundler reads it, Monaco writes it, the
 * autosave posts from it. The alternative — Monaco owning the text and this
 * asking for it — is how an editor ends up rebuilding a version of a file that
 * is one keystroke behind what is on screen.
 *
 * The preview and the code are TABS OVER ONE PANE, not two panes. Three columns
 * on a 1440px screen leaves the preview about 500px wide, which is narrower
 * than the phone frame it is supposed to be previewing at desktop width.
 */

import * as React from "react"
import { ArrowLeft, Check, Code2, Eye, Loader2 } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ProjectFiles, Site } from "@/lib/sites/types"
import { ChatPane } from "./chat-pane"
import { CodePane } from "./code-pane"
import { PreviewPane } from "./preview-pane"
import { useBundler } from "./use-bundler"

type SaveState = "clean" | "dirty" | "saving" | "error"

const AUTOSAVE_MS = 1200

export function EditorShell({ site, initialFiles }: { site: Site; initialFiles: ProjectFiles }) {
  const [files, setFiles] = React.useState<ProjectFiles>(initialFiles)
  const [tab, setTab] = React.useState<"preview" | "code">("preview")
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

  const [isDark, setIsDark] = React.useState(false)
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const read = () => setIsDark(document.documentElement.classList.contains("dark") || media.matches)
    read()
    media.addEventListener("change", read)
    return () => media.removeEventListener("change", read)
  }, [])

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground">
            <SmartLink href="/app/sites">
              <ArrowLeft className="h-4 w-4" />
              Sites
            </SmartLink>
          </Button>
          <span className="truncate text-sm font-medium">{site.name}</span>
          <SaveBadge state={saveState} error={saveError} />
        </div>

        <div className="flex items-center gap-1 rounded-[8px] bg-muted p-0.5">
          {([["preview", "Preview", Eye], ["code", "Code", Code2]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-xs transition-colors",
                tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[360px_1fr]">
        {/* The chat pane is the tool's primary control, so it keeps its width
            and the preview takes the remainder — but below md there is not room
            for both, and a 360px column beside a 320px preview helps nobody. */}
        <div className="hidden min-h-0 md:block">
          <ChatPane siteName={site.name} />
        </div>

        <div className="min-h-0">
          {tab === "preview" ? (
            <PreviewPane build={build} html={files["index.html"]} />
          ) : (
            <CodePane files={files} activePath={activePath} onSelect={setActivePath} onChange={editFile} dark={isDark} />
          )}
        </div>
      </div>
    </div>
  )
}

function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving
      </span>
    )
  }
  if (state === "dirty") return <span className="text-xs text-muted-foreground">Unsaved</span>
  if (state === "error") return <span className="text-xs text-destructive">{error ?? "Not saved"}</span>
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3 w-3" />
      Saved
    </span>
  )
}
