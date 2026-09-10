"use client"

import { useEffect, useState, useCallback, useMemo, useRef, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, File, Folder, FolderOpen,
  ChevronRight, X, AlertCircle, Check, RotateCcw, Code2,
  RefreshCw, Search, Copy, Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ThemeInstall, ThemeFileNode } from "@/lib/website-builder/types"
import { buildThemeFileTree, flattenTree } from "@/lib/website-builder/theme-file-tree"
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
  narrow = false,
}: {
  node: ThemeFileNode
  depth?: number
  openFolders: Set<string>
  onToggleFolder: (path: string) => void
  selectedPath: string | null
  onSelectFile: (node: ThemeFileNode) => void
  dirtyPaths: Set<string>
  /** A finger needs about forty-four points; a mouse needs about twenty. */
  narrow?: boolean
}) {
  const isOpen = openFolders.has(node.path)
  const isSelected = selectedPath === node.path
  const isDirty = dirtyPaths.has(node.path)

  if (node.type === "folder") {
    return (
      <div>
        <button
          className={cn(
            "w-full flex items-center gap-1 px-2 hover:bg-white/5 text-left transition-colors rounded",
            narrow ? "py-2.5" : "py-1",
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onToggleFolder(node.path)}
        >
          {isOpen ? (
            <FolderOpen className={cn("text-amber-400 shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5")} />
          ) : (
            <Folder className={cn("text-amber-400 shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5")} />
          )}
          <span className={cn("text-neutral-300", narrow ? "text-[14px]" : "text-[12px]")}>{node.name}</span>
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
            narrow={narrow}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      className={cn(
        "w-full flex items-center gap-1.5 hover:bg-white/5 text-left transition-colors rounded",
        narrow ? "py-2.5" : "py-1",
        isSelected && "bg-white/10",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelectFile(node)}
    >
      <File className={cn("shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5", node.isCustomized ? "text-blue-400" : "text-neutral-500")} />
      <span className={cn("flex-1 truncate", narrow ? "text-[14px]" : "text-[12px]", isSelected ? "text-white" : "text-neutral-300")}>
        {node.name}
      </span>
      {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mr-1" />}
      {node.isCustomized && !isDirty && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0 mr-1" />}
    </button>
  )
}

/**
 * ONE METRIC, TWO LAYERS.
 *
 * The editor is a transparent textarea over a rendered copy of the same text.
 * They only line up while their font size and line height are identical, so
 * the numbers live here and both layers read them — a size changed in one
 * place and not the other is a caret that drifts a line further from its
 * character with every line down the file.
 *
 * Sixteen pixels on a phone is not a style choice. Safari zooms the page when
 * a field with text under 16px takes focus, and a code editor that zooms the
 * moment you tap it cannot be typed in.
 */
const CODE_TEXT = "text-[16px] leading-6 md:text-[12px] md:leading-5"

// ── Syntax: very simple line coloring for JSON ────────────────
function CodeLine({ line, lineNumber }: { line: string; lineNumber: number }) {
  return (
    <div className="flex hover:bg-white/[0.02] group">
      <span className={cn("w-10 shrink-0 text-right pr-4 text-neutral-600 select-none group-hover:text-neutral-500", CODE_TEXT)}>
        {lineNumber}
      </span>
      <span className={cn("flex-1 font-mono whitespace-pre text-neutral-200", CODE_TEXT)}>
        {line}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function CodeEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  const { installId } = use(params)
  const router = useRouter()
  // `?embedded=1` is the theme editor framing this page over its canvas.
  const embedded =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embedded") === "1"

  /**
   * Framed inside the editor, this page's own document must not scroll and
   * must be black to its edges. It is the DOCUMENT that showed as a white
   * column down the right of the code card: the root div is dark, but the
   * html and body behind it were white, and a document scrollbar painted its
   * gutter in that white. Nothing here scrolls at the document level; the
   * panels scroll themselves.
   */
  useEffect(() => {
    if (!embedded) return
    const html = document.documentElement
    const body = document.body
    const prev = [html.style.overflow, html.style.background, body.style.overflow, body.style.background]
    html.style.overflow = "hidden"
    html.style.background = "#0e0e0e"
    body.style.overflow = "hidden"
    body.style.background = "#0e0e0e"
    return () => {
      ;[html.style.overflow, html.style.background, body.style.overflow, body.style.background] = prev
    }
  }, [embedded])

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
  /** Filter over the tree. Sixty-one files is too many to hunt through. */
  const [filter, setFilter] = useState("")

  /**
   * =========================================================================
   *  ONE THING AT A TIME ON A PHONE
   * =========================================================================
   * A 224px explorer beside an editor works on a desktop and leaves neither
   * usable at 390px: a third of the screen is a file list you are not reading
   * and the rest is a column of code four words wide.
   *
   * So on a narrow screen they take turns. The files ARE the screen until you
   * pick one; then the code is the screen, with a way back to the files. That
   * is the shape every phone file editor has, and it is the only one that
   * fits.
   */
  const [narrow, setNarrow] = useState(false)
  const [showFiles, setShowFiles] = useState(true)
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const sync = () => setNarrow(mql.matches)
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  /**
   * THE TWO LAYERS THAT HAVE TO SCROLL TOGETHER.
   *
   * The editor is a transparent <textarea> over a rendered copy of the same
   * text with line numbers — the usual trick. It only works while the two are
   * scrolled to the same place, and nothing was keeping them there: the
   * textarea scrolled and the visible layer did not, so on any file longer
   * than the window the caret walked away from the text under it. Every
   * section file is two hundred lines.
   */
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)

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
    // On a phone, picking a file is the gesture that means "show me the code".
    setShowFiles(false)

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

  /**
   * The tree, filtered.
   *
   * Sixty-one files across six folders, and no way to find one but scrolling.
   * A folder survives the filter when any file under it matches, so typing
   * "faq" leaves `sections` open with one file in it rather than emptying the
   * panel and looking broken.
   */
  const visibleTree = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return fileTree

    const prune = (nodes: ThemeFileNode[]): ThemeFileNode[] =>
      nodes
        .map((node) => {
          if (node.type === "file") {
            return node.path.toLowerCase().includes(needle) ? node : null
          }
          const children = prune(node.children ?? [])
          return children.length > 0 ? { ...node, children } : null
        })
        .filter((node): node is ThemeFileNode => node !== null)

    return prune(fileTree)
  }, [fileTree, filter])

  /**
   * A filter that leaves every folder shut has found nothing, as far as
   * anybody can see. Searching opens them.
   */
  useEffect(() => {
    if (!filter.trim()) return
    setOpenFolders((previous) => {
      const next = new Set(previous)
      for (const node of visibleTree) if (node.type === "folder") next.add(node.path)
      return next
    })
  }, [filter, visibleTree])

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

  /**
   * ⌘S / Ctrl+S.
   *
   * `preventDefault` first: without it the browser opens its own Save-page
   * dialog, which is the single most jarring thing a code editor on the web
   * can do. The ref is read inside the handler rather than captured, so the
   * listener does not need re-binding on every keystroke.
   */
  const saveRef = useRef(saveFile)
  saveRef.current = saveFile

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /**
   * LEAVING WITH UNSAVED WORK.
   *
   * Nothing here autosaves — a code file is not a draft — so closing the tab
   * threw the edit away silently. The browser's own confirmation is the only
   * one that can block a navigation it initiated.
   */
  useEffect(() => {
    if (!isDirty && dirtyPaths.size === 0) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [isDirty, dirtyPaths])

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

  /**
   * The file, out of the editor. Copy for a paste somewhere else; Download
   * for a copy on disk with the file's own name. Both act on what is in the
   * editor now, saved or not, because that is the version you can see.
   */
  const [copied, setCopied] = useState(false)
  const copyFile = async () => {
    try {
      await navigator.clipboard.writeText(fileContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.")
    }
  }
  const downloadFile = () => {
    if (!selectedFile) return
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = selectedFile.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
      <div className="h-svh flex items-center justify-center bg-[#0e0e0e]">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="h-svh flex flex-col bg-[#0e0e0e] text-neutral-200 overflow-hidden">
      {/* ── Top bar ── */}
      {/* Inside the editor's own frame the bar above is the editor's, and a
          second one saying the same things is a second header. */}
      {!embedded && (
      <header
        className="h-11 bg-[#141414] border-b border-white/10 flex items-center px-4 gap-3 shrink-0 box-content"
        // Opened on its own rather than inside the editor's frame, this is the
        // topmost bar on the screen — so on a phone it is the one that lands
        // under the status bar. `box-content` so the padding adds to the 44px
        // rather than eating it.
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
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
      </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── File explorer ── */}
        <aside
          className={cn(
            "bg-[#141414] flex flex-col overflow-hidden",
            narrow
              ? showFiles
                ? "w-full flex-1 min-w-0"
                : "hidden"
              : "w-56 shrink-0 border-r border-white/10",
          )}
        >
          <div className="px-3 py-2.5 border-b border-white/10 space-y-2">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Explorer</p>
            {/* Sixty-one files. Scrolling for one is not a way to find it. */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a file…"
                spellCheck={false}
                className="w-full rounded-md border border-white/10 bg-black/30 py-1 pl-7 pr-6 text-[11.5px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/25"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear the filter"
                  className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            {filter.trim() && (
              <p className="text-[10px] text-neutral-600">
                {flattenTree(visibleTree).length} of {flattenTree(fileTree).length} files
              </p>
            )}
          </div>
          <div className="wb-thin-scroll flex-1 overflow-y-auto py-1 px-1">
            {visibleTree.map(node => (
              <FileTreeNode
                key={node.path}
                node={node}
                openFolders={openFolders}
                onToggleFolder={toggleFolder}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={openFile}
                dirtyPaths={dirtyPaths}
                narrow={narrow}
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
        <div className={cn("flex-1 flex flex-col overflow-hidden min-w-0", narrow && showFiles && "hidden")}>
          {/* Tabs */}
          {openTabs.length > 0 && (
            <div className="wb-thin-scroll flex items-end bg-[#141414] border-b border-white/10 overflow-x-auto shrink-0">
              {openTabs.map(tab => {
                const isActive = selectedFile?.path === tab.path
                const isTabDirty = dirtyPaths.has(tab.path)
                return (
                  <button
                    key={tab.path}
                    className={cn(
                      "flex items-center gap-2 px-3 border-r border-white/10 whitespace-nowrap hover:bg-white/5 transition-colors relative",
                      narrow ? "py-2.5 text-[13px]" : "py-2 text-[12px]",
                      isActive ? "bg-[#0e0e0e] text-white border-t-2 border-t-indigo-500" : "text-neutral-500",
                    )}
                    onClick={() => openFile(tab)}
                  >
                    <File className="h-3 w-3 shrink-0" />
                    {tab.name}
                    {isTabDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    <span
                      role="button"
                      aria-label={`Close ${tab.name}`}
                      className={cn(
                        "rounded hover:bg-white/10 flex items-center justify-center ml-1 shrink-0",
                        narrow ? "h-7 w-7 -mr-1.5" : "h-4 w-4",
                      )}
                      onClick={e => { e.stopPropagation(); closeTab(tab.path) }}
                    >
                      <X className={narrow ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Where the file is, how to get back to the list, and the two
              things that can be done to it. Save and Revert live HERE rather
              than on the page's top bar, because that bar is hidden whenever
              the theme editor frames this page — which left them unreachable
              exactly where they are needed, since a phone has no Cmd-S. */}
          {selectedFile && (
            <div className="flex items-center gap-2 border-b border-white/5 bg-[#0e0e0e] px-2 py-1.5 md:px-4">
              {narrow && (
                <button
                  type="button"
                  onClick={() => setShowFiles(true)}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Files
                </button>
              )}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px] text-neutral-500">
                {narrow ? (
                  <span className="truncate text-[12px] text-neutral-300">{selectedFile.name}</span>
                ) : (
                  selectedFile.path.split("/").map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                      <span className={i === arr.length - 1 ? "text-neutral-300" : ""}>{part}</span>
                    </span>
                  ))
                )}
                {customizedPaths.has(selectedFile.path) && (
                  <span className="ml-2 shrink-0 text-[10px] text-blue-400">● Modified</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copyFile()}
                aria-label="Copy file content"
                title="Copy file content"
                className="h-8 w-8 shrink-0 px-0 text-neutral-400 hover:text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={downloadFile}
                aria-label="Download this file"
                title="Download this file"
                className="h-8 w-8 shrink-0 px-0 text-neutral-400 hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {customizedPaths.has(selectedFile.path) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={revertFile}
                  className="h-8 shrink-0 gap-1.5 px-2.5 text-[12px] text-neutral-400 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Revert</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={saveFile}
                disabled={saving || !isDirty}
                className={cn(
                  "h-8 shrink-0 gap-1.5 px-3 text-[12px]",
                  isDirty
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-white/5 text-neutral-500 cursor-default",
                )}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isDirty ? "Save" : "Saved"}
              </Button>
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
                ref={textareaRef}
                className={cn(
                  "wb-thin-scroll absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono resize-none focus:outline-none px-[2.75rem] py-2 z-10",
                  CODE_TEXT,
                )}
                value={fileContent}
                onChange={e => handleContentChange(e.target.value)}
                /*
                  The scroll position of the layer somebody TYPES in is the one
                  that matters; the rendered copy follows it. Doing it the other
                  way round fights the browser, which scrolls a textarea itself
                  to keep the caret visible.
                */
                onScroll={e => {
                  const display = displayRef.current
                  if (!display) return
                  display.scrollTop = e.currentTarget.scrollTop
                  display.scrollLeft = e.currentTarget.scrollLeft
                }}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              {/* Visual display with line numbers */}
              <div ref={displayRef} className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="py-2 min-h-full">
                  {lines.map((line, i) => (
                    <CodeLine key={i} line={line} lineNumber={i + 1} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="h-6 bg-[#141414] border-t border-white/10 px-4 flex items-center gap-4 shrink-0">
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
