"use client"

/**
 * The file tree and the code editor.
 *
 * Monaco is NOT bundled — VS Code's editor is ~5MB and every byte of it would
 * otherwise land in the app's main bundle, for a route most people using
 * Storelib never open. It is loaded at runtime from `public/sites/monaco`,
 * which scripts/copy-esbuild-wasm.mjs fills from node_modules at build time.
 *
 * From OUR origin, not jsDelivr, which is @monaco-editor/react's default.
 * Whether somebody can open the code tab today should not depend on a CDN we do
 * not control, and the version being served should be the one in
 * package.json rather than one written into a URL beside it.
 */

import * as React from "react"
import Editor, { loader } from "@monaco-editor/react"
import { FileCode, FileJson, FileText, Palette } from "lucide-react"

import { sortedPaths } from "@/lib/sites/starter"
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

export function CodePane({
  files,
  activePath,
  onSelect,
  onChange,
  dark,
}: {
  files: ProjectFiles
  activePath: string | null
  onSelect: (path: string) => void
  onChange: (path: string, content: string) => void
  dark: boolean
}) {
  const paths = React.useMemo(() => sortedPaths(files), [files])

  return (
    <div className="flex h-full min-h-0">
      <div className="w-56 shrink-0 overflow-auto border-r border-border bg-muted/30 py-2">
        {paths.map((path) => (
          <button
            key={path}
            type="button"
            onClick={() => onSelect(path)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
              path === activePath ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
            title={path}
          >
            <IconFor path={path} />
            <span className="truncate">{path}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {activePath ? (
          <Editor
            path={activePath}
            language={languageFor(activePath)}
            value={files[activePath] ?? ""}
            onChange={(value) => onChange(activePath, value ?? "")}
            theme={dark ? "vs-dark" : "light"}
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
