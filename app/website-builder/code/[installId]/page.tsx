"use client"

import { useEffect, useState, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, File, Folder, FolderOpen,
  ChevronRight, X, AlertCircle, Check, RotateCcw, Code2,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ThemeInstall, ThemeFileNode } from "@/lib/website-builder/types"
import { buildThemeFileTree } from "@/lib/website-builder/theme-file-tree"
import { toast } from "sonner"

// ── File tree node ────────────────────────────────────────────
function FileTreeNode({
  node,
  depth = 0,
  openFolders,
  onToggleFolder,
  selectedPath,
  onSelectFile,
  dirtyPaths,
}: {
  node: ThemeFileNode
  depth?: number
  openFolders: Set<string>
  onToggleFolder: (path: string) => void
  selectedPath: string | null
  onSelectFile: (node: ThemeFileNode) => void
  dirtyPaths: Set<string>
}) {
  const isOpen = openFolders.has(node.path)
  const isSelected = selectedPath === node.path
  const isDirty = dirtyPaths.has(node.path)

  if (node.type === "folder") {
    return (
      <div>
        <button
          className="w-full flex items-center gap-1 px-2 py-1 hover:bg-white/5 text-left transition-colors rounded"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onToggleFolder(node.path)}
        >
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          )}
          <span className="text-[12px] text-neutral-300">{node.name}</span>
          <ChevronRight className={cn("h-3 w-3 text-neutral-500 ml-auto transition-transform", isOpen && "rotate-90")} />
        </button>
        {isOpen && node.children?.map(child => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            dirtyPaths={dirtyPaths}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      className={cn(
        "w-full flex items-center gap-1.5 py-1 hover:bg-white/5 text-left transition-colors rounded",
        isSelected && "bg-white/10",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelectFile(node)}
    >
      <File className={cn("h-3.5 w-3.5 shrink-0", node.isCustomized ? "text-blue-400" : "text-neutral-500")} />
      <span className={cn("text-[12px] flex-1 truncate", isSelected ? "text-white" : "text-neutral-300")}>
        {node.name}
      </span>
      {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mr-1" />}
      {node.isCustomized && !isDirty && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0 mr-1" />}
    </button>
  )
}

// ── Syntax: very simple line coloring for JSON ────────────────
function CodeLine({ line, lineNumber }: { line: string; lineNumber: number }) {
  return (
    <div className="flex hover:bg-white/[0.02] group">
      <span className="w-10 shrink-0 text-right pr-4 text-neutral-600 text-[12px] select-none group-hover:text-neutral-500">
        {lineNumber}
      </span>
      <span className="flex-1 text-[12px] font-mono whitespace-pre text-neutral-200 leading-5">
        {line}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function CodeEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  const { installId } = use(params)
  const router = useRouter()

  const [install, setInstall] = useState<ThemeInstall | null>(null)
  const [fileTree, setFileTree] = useState<ThemeFileNode[]>([])
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["config", "templates", "sections"]))
  const [selectedFile, setSelectedFile] = useState<ThemeFileNode | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingInstall, setLoadingInstall] = useState(true)
  const [customizedPaths, setCustomizedPaths] = useState<Set<string>>(new Set())
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set())
  const [openTabs, setOpenTabs] = useState<ThemeFileNode[]>([])

  const isDirty = fileContent !== originalContent

  const loadInstall = useCallback(async () => {
    const res = await fetch(`/api/website-builder/themes/${installId}`)
    if (!res.ok) return
    const data = await res.json()
    setInstall(data.install)

    // Load customized paths list
    const filesRes = await fetch(`/api/website-builder/themes/${installId}/files`)
    if (filesRes.ok) {
      const filesData = await filesRes.json()
      const paths = new Set<string>(filesData.customized_paths ?? [])
      setCustomizedPaths(paths)
      setFileTree(buildThemeFileTree(Array.from(paths)))
    } else {
      setFileTree(buildThemeFileTree([]))
    }

    setLoadingInstall(false)
  }, [installId])

  useEffect(() => { loadInstall() }, [loadInstall])

  const openFile = async (node: ThemeFileNode) => {
    if (node.type !== "file") return

    // Warn if current file is dirty
    if (isDirty && selectedFile?.path !== node.path) {
      // In production you'd show a confirm dialog; for now just save silently
    }

    setSelectedFile(node)
    setLoadingFile(true)

    const res = await fetch(`/api/website-builder/themes/${installId}/files?path=${encodeURIComponent(node.path)}`)
    if (res.ok) {
      const data = await res.json()
      setFileContent(data.content ?? "")
      setOriginalContent(data.content ?? "")
    }
    setLoadingFile(false)

    // Add to open tabs
    setOpenTabs(prev => {
      if (prev.find(t => t.path === node.path)) return prev
      return [...prev, node]
    })
  }

  const saveFile = async () => {
    if (!selectedFile || !isDirty) return
    setSaving(true)

    const res = await fetch(`/api/website-builder/themes/${installId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile.path, content: fileContent }),
    })

    if (res.ok) {
      setOriginalContent(fileContent)
      setDirtyPaths(prev => { const n = new Set(prev); n.delete(selectedFile.path); return n })
      setCustomizedPaths(prev => new Set([...prev, selectedFile.path]))
      setFileTree(buildThemeFileTree([...customizedPaths, selectedFile.path]))
      toast.success("File saved")
    } else {
      const d = await res.json()
      toast.error(d.error ?? "Failed to save")
    }
    setSaving(false)
  }

  const revertFile = async () => {
    if (!selectedFile) return

    const res = await fetch(
      `/api/website-builder/themes/${installId}/files?path=${encodeURIComponent(selectedFile.path)}`,
      { method: "DELETE" },
    )

    if (res.ok) {
      setCustomizedPaths(prev => { const n = new Set(prev); n.delete(selectedFile.path); return n })
      setFileTree(buildThemeFileTree(Array.from(customizedPaths).filter(p => p !== selectedFile.path)))
      // Reload default content
      await openFile(selectedFile)
      toast.success("Reverted to default")
    }
  }

  const closeTab = (path: string) => {
    setOpenTabs(prev => prev.filter(t => t.path !== path))
    if (selectedFile?.path === path) {
      const remaining = openTabs.filter(t => t.path !== path)
      if (remaining.length > 0) openFile(remaining[remaining.length - 1])
      else { setSelectedFile(null); setFileContent(""); setOriginalContent("") }
    }
  }

  const toggleFolder = (path: string) => {
    setOpenFolders(prev => {
      const n = new Set(prev)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })
  }

  const handleContentChange = (val: string) => {
    setFileContent(val)
    if (selectedFile) {
      if (val !== originalContent) {
        setDirtyPaths(prev => new Set([...prev, selectedFile.path]))
      } else {
        setDirtyPaths(prev => { const n = new Set(prev); n.delete(selectedFile.path); return n })
      }
    }
  }

  const lines = fileContent.split("\n")

  if (loadingInstall) {
    return (
      <div className="h-svh flex items-center justify-center bg-[#1a1a2e]">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="h-svh flex flex-col bg-[#1a1a2e] text-neutral-200 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="h-11 bg-[#12121e] border-b border-white/10 flex items-center px-4 gap-3 shrink-0">
        <button
          className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-200 mr-1"
          onClick={() => router.push("/app/website-builder")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-[12px]">Website Builder</span>
        </button>

        <div className="h-4 w-px bg-white/10" />

        <Code2 className="h-4 w-4 text-neutral-500" />
        <span className="text-[13px] text-neutral-300 font-medium">{install?.name}</span>
        {install?.status === "published" && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded uppercase tracking-wide">Live</span>
        )}

        <div className="flex-1" />

        {selectedFile && (
          <div className="flex items-center gap-2">
            {customizedPaths.has(selectedFile.path) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={revertFile}
                className="h-7 px-2.5 text-[12px] text-neutral-400 hover:text-white gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                Revert
              </Button>
            )}
            <Button
              size="sm"
              onClick={saveFile}
              disabled={saving || !isDirty}
              className={cn(
                "h-7 px-3 text-[12px] gap-1.5",
                isDirty
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-white/5 text-neutral-500 cursor-default",
              )}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {isDirty ? "Save" : "Saved"}
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── File explorer ── */}
        <aside className="w-56 bg-[#13131f] border-r border-white/10 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2.5 border-b border-white/10">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Explorer</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1 px-1">
            {fileTree.map(node => (
              <FileTreeNode
                key={node.path}
                node={node}
                openFolders={openFolders}
                onToggleFolder={toggleFolder}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={openFile}
                dirtyPaths={dirtyPaths}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="px-3 py-2 border-t border-white/10 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-[10px] text-neutral-500">Customized</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] text-neutral-500">Unsaved changes</span>
            </div>
          </div>
        </aside>

        {/* ── Editor area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          {openTabs.length > 0 && (
            <div className="flex items-end bg-[#12121e] border-b border-white/10 overflow-x-auto shrink-0">
              {openTabs.map(tab => {
                const isActive = selectedFile?.path === tab.path
                const isTabDirty = dirtyPaths.has(tab.path)
                return (
                  <button
                    key={tab.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-[12px] border-r border-white/10 whitespace-nowrap hover:bg-white/5 transition-colors relative",
                      isActive ? "bg-[#1a1a2e] text-white border-t-2 border-t-indigo-500" : "text-neutral-500",
                    )}
                    onClick={() => openFile(tab)}
                  >
                    <File className="h-3 w-3 shrink-0" />
                    {tab.name}
                    {isTabDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    <span
                      className="h-4 w-4 rounded hover:bg-white/10 flex items-center justify-center ml-1"
                      onClick={e => { e.stopPropagation(); closeTab(tab.path) }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* File path breadcrumb */}
          {selectedFile && (
            <div className="px-4 py-1.5 bg-[#1a1a2e] border-b border-white/5 flex items-center gap-1 text-[11px] text-neutral-500">
              {selectedFile.path.split("/").map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                  <span className={i === arr.length - 1 ? "text-neutral-300" : ""}>{part}</span>
                </span>
              ))}
              {customizedPaths.has(selectedFile.path) && (
                <span className="ml-2 text-blue-400 text-[10px]">● Modified</span>
              )}
            </div>
          )}

          {/* Code area */}
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-neutral-600">
              <div className="text-center">
                <Code2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-[14px]">Select a file to start editing</p>
                <p className="text-[12px] mt-1 opacity-60">Customized files are highlighted in blue</p>
              </div>
            </div>
          ) : loadingFile ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden relative">
              {/* Editable textarea overlaid on the line display */}
              <textarea
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono text-[12px] leading-5 resize-none focus:outline-none px-[2.75rem] py-0 z-10"
                value={fileContent}
                onChange={e => handleContentChange(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              {/* Visual display with line numbers */}
              <div className="absolute inset-0 overflow-auto pointer-events-none">
                <div className="py-2 min-h-full">
                  {lines.map((line, i) => (
                    <CodeLine key={i} line={line} lineNumber={i + 1} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="h-6 bg-[#12121e] border-t border-white/10 px-4 flex items-center gap-4 shrink-0">
            <span className="text-[10px] text-neutral-600">
              {selectedFile?.language ?? "—"}
            </span>
            {selectedFile && (
              <span className="text-[10px] text-neutral-600">
                {lines.length} lines
              </span>
            )}
            {isDirty && (
              <span className="text-[10px] text-amber-500 flex items-center gap-1">
                <AlertCircle className="h-2.5 w-2.5" />
                Unsaved changes
              </span>
            )}
            {!isDirty && selectedFile && (
              <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                <Check className="h-2.5 w-2.5" />
                Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
