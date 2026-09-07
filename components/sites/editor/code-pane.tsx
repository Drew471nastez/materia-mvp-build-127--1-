"use client"

/**
 * The file tree and the code editor.
 *
 * Monaco is NOT bundled — VS Code's editor is ~5MB and every byte of it would
 * otherwise land in the app's main bundle, for a route most people using
 * Storelib never open. It is loaded at runtime from `public/sites/monaco`,
 * which scripts/build-sites-assets.mjs fills from node_modules at build time.
 *
 * From OUR origin, not jsDelivr, which is @monaco-editor/react's default.
 * Whether somebody can open the code tab today should not depend on a CDN we do
 * not control, and the version being served should be the one in package.json
 * rather than one written into a URL beside it.
 */

import * as React from "react"
import Editor, { loader } from "@monaco-editor/react"
import { FileCode, FileJson, FileText, Folder, Palette } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ProjectFiles } from "@/lib/sites/types"

loader.config({ paths: { vs: "/sites/monaco/vs" } })

function languageFor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
  if (path.endsWith(".jsx") || path.endsWith(".js") || path.endsWith(".mjs")) return "javascript"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".html")) return "html"
  return "plaintext"
}

function IconFor({ path }: { path: string }) {
  const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground"
  if (path.endsWith(".css")) return <Palette className={className} />
  if (path.endsWith(".json")) return <FileJson className={className} />
  if (/\.(tsx?|jsx?|mjs)$/.test(path)) return <FileCode className={className} />
  return <FileText className={className} />
}

/**
 * Grouped by directory, showing basenames.
 *
 * A flat list of full paths does not fit a phone: `truncate` cuts
 * "src/components/Hero.tsx" down to "src/component…", which removes the only
 * part that identifies the file. Reversing the truncation with `dir="rtl"`
 * fixed the ellipsis and flipped the row — icons on the right, text
 * right-aligned — which was worse.
 *
 * A tree does not have the problem at all: the directory is said once, in its
 * own row, and every file below it is a short name.
 */
function groupByDirectory(files: ProjectFiles): Array<[string, string[]]> {
  const byDirectory = new Map<string, string[]>()
  for (const path of Object.keys(files).sort()) {
    const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
    const bucket = byDirectory.get(directory)
    if (bucket) bucket.push(path)
    else byDirectory.set(directory, [path])
  }
  // Root files first — index.html and package.json are what somebody opening
  // an unfamiliar project looks for — then directories alphabetically.
  return [...byDirectory.entries()].sort(([a], [b]) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  )
}

export function CodePane({
  files,
  activePath,
  onSelect,
  onChange,
}: {
  files: ProjectFiles
  activePath: string | null
  onSelect: (path: string) => void
  onChange: (path: string, content: string) => void
}) {
  const groups = React.useMemo(() => groupByDirectory(files), [files])

  return (
    <div className="flex h-full min-h-0">
      <div className="w-40 shrink-0 overflow-auto border-r border-border bg-sidebar py-2 sm:w-56">
        {groups.map(([directory, paths]) => (
          <div key={directory || "/"} className="mb-1">
            {directory !== "" && (
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground/70">
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">{directory}</span>
              </div>
            )}
            {paths.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => onSelect(path)}
                title={path}
                className={cn(
                  "flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors",
                  directory === "" ? "pl-3" : "pl-6",
                  path === activePath
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <IconFor path={path} />
                <span className="truncate">{path.slice(path.lastIndexOf("/") + 1)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {activePath ? (
          <Editor
            path={activePath}
            language={languageFor(activePath)}
            value={files[activePath] ?? ""}
            onChange={(value) => onChange(activePath, value ?? "")}
            theme="vs-dark"
            loading={<div className="p-4 text-xs text-muted-foreground">Loading the editor…</div>}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 12 },
              // The editor is a pane, not a page. Without this it keeps its
              // own scrollbars and the layout fights itself on resize.
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">Pick a file</div>
        )}
      </div>
    </div>
  )
}
