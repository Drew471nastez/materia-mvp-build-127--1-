"use client"

import { keyboardInsetOrFloor } from "@/lib/ui/keyboard-safe-sheet"
import * as React from "react"
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef, use } from "react"
import { FullScreenLock } from "@/components/website-builder/full-screen-lock"
import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, File, Folder, FolderOpen, ChevronRight, X, AlertCircle, Check, RotateCcw, Code2, RefreshCw, Search, Copy, Download, Sun, Moon, FilePlus, Pencil, Files, Trash2, History, MoreHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { completionsAt, documentationAt, undeclaredNames } from "@/lib/website-builder/storelib-complete"
import type { ThemeInstall, ThemeFileNode } from "@/lib/website-builder/types"
import { DRAWER_EASING, drawerRelease } from "@/lib/website-builder/drawer-drag"
import { buildThemeFileTree, flattenTree, detectLanguage, shownPath } from "@/lib/website-builder/theme-file-tree"
import { toast } from "sonner"
import { reviveScroller } from "@/lib/website-builder/canvas-scroll"
import { watchKeyboard } from "@/lib/website-builder/keyboard-watch"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { ThemeError } from "@/lib/storelib-theme/types"
import { WAIT_MS, fetchWithDeadline } from "@/lib/net/request"

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
            "w-full flex items-center gap-1 px-2 hover:bg-[var(--code-hover)] text-left transition-colors rounded",
            narrow ? "py-2.5" : "py-1",
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onToggleFolder(node.path)}
        >
          {isOpen ? (
            <FolderOpen className={cn("text-amber-500 shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5")} />
          ) : (
            <Folder className={cn("text-amber-500 shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5")} />
          )}
          <span className={cn("text-[var(--code-text)]", narrow ? "text-[14px]" : "text-[12px]")}>{node.name}</span>
          <ChevronRight className={cn("h-3 w-3 text-[var(--code-muted)] ml-auto transition-transform", isOpen && "rotate-90")} />
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
        "w-full flex items-center gap-1.5 hover:bg-[var(--code-hover)] text-left transition-colors rounded",
        narrow ? "py-2.5" : "py-1",
        isSelected && "bg-[var(--code-active)]",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelectFile(node)}
    >
      <File className={cn("shrink-0", narrow ? "h-4 w-4" : "h-3.5 w-3.5", node.isCustomized ? "text-blue-600" : "text-[var(--code-muted)]")} />
      <span className={cn("flex-1 truncate", narrow ? "text-[14px]" : "text-[12px]", isSelected ? "text-[var(--code-text)]" : "text-[var(--code-text)]")}>
        {node.name}
      </span>
      {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mr-1" />}
      {node.isCustomized && !isDirty && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 mr-1" />}
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
/**
 * A line, its number, and how it is doing. An ERROR is the compiler's: the
 * file did not save. A WARNING is a name the schema does not declare, found
 * while typing — the compiler will refuse it too, but knowing now beats
 * knowing on save.
 */
function CodeLine({ line, lineNumber, hasError, hasWarning }: { line: string; lineNumber: number; hasError?: boolean; hasWarning?: boolean }) {
  return (
    <div
      className={cn("flex hover:bg-[var(--code-hover)] group", hasError && "bg-red-500/10", !hasError && hasWarning && "bg-amber-500/10")}
      data-error-line={hasError ? "" : undefined}
      data-warning-line={!hasError && hasWarning ? "" : undefined}
    >
      <span className={cn("w-10 shrink-0 text-right pr-4 select-none", hasError ? "text-red-500" : hasWarning ? "text-amber-500" : "text-[var(--code-faint)] group-hover:text-[var(--code-muted)]", CODE_TEXT)}>
        {lineNumber}
      </span>
      <span className={cn("flex-1 font-mono whitespace-pre text-[var(--code-text)] [font-variant-ligatures:none] [tab-size:2]", CODE_TEXT)}>
        {line}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
/**
 * The bar's buttons are written out rather than borrowed from the button
 * component. `variant="ghost"` was the original bug — its hover is
 * `bg-accent` / `text-accent-foreground`, and on the near-black bar this
 * editor used to have, that turned Copy and Download into a white pill with
 * a white glyph, the icon vanishing into its own background. The editor is a
 * light surface now, but the lesson stands: one string, stated for the
 * surface it is on, beats a variant that assumes a different one.
 */
/**
 * One tooltip, stated once. Opens after 300ms rather than the browser's
 * second and a half, and a disabled control still gets one — Radix will not
 * hear a pointer over a disabled button, so the trigger wraps a span that
 * can. Without that, "Saved" is the one control on the bar that explains
 * nothing, and it is the one people ask about.
 */
function BarTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * ===========================================================================
 *  THE ROW OF ICONS, ON A SCREEN THE ROW DOES NOT FIT
 * ===========================================================================
 * The file bar carries Files, the file's name, nine icons and Save. Measured
 * on a 390px phone that row needs about 480px, and the flexbox answer to not
 * enough room is to put the overflow past the right edge — where Save was,
 * behind the edge of the screen, on a surface whose whole point is saving.
 *
 * So on a narrow screen the bar keeps the three things somebody came for —
 * back to the files, which file this is, and Save — and everything else
 * moves behind one button. The same actions, in the same order, with their
 * names now written out rather than guessed from an icon.
 *
 * `position: fixed`, measured from the trigger: the bar sits inside a column
 * with `overflow: hidden`, which clips an absolutely positioned menu and
 * does not clip a fixed one.
 */
interface CodeAction {
  id: string
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  active?: boolean
  /** Shown beside the icon on a wide screen, where there is room for it. */
  wideLabel?: string
}

function CodeActionMenu({ actions }: { actions: CodeAction[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (document.getElementById("wb-code-more")?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="More actions for this file"
        aria-expanded={open}
        className={cn(CODE_BAR_ICON_BUTTON, "h-9 w-9", open && "bg-[var(--code-hover)] text-[var(--code-text)]")}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && pos && (
        <div
          id="wb-code-more"
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-panel)] p-1 shadow-2xl"
          style={{
            top: pos.top,
            right: pos.right,
            animation: "wb-code-more-in 160ms cubic-bezier(0.32,0.72,0,1) both",
          }}
        >
          <style>{`@keyframes wb-code-more-in{from{opacity:0;transform:translateY(-4px) scale(0.98)}to{opacity:1;transform:none}}`}</style>
          {actions.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setOpen(false); a.onClick() }}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] transition-colors",
                a.danger
                  ? "text-red-500 hover:bg-red-500/10"
                  : "text-[var(--code-text)] hover:bg-[var(--code-hover)]",
                a.active && "bg-[var(--code-hover)]",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

const CODE_BAR_ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--code-muted)] " +
  "transition-[background-color,color,scale] duration-150 " +
  "hover:bg-[var(--code-hover)] hover:text-[var(--code-text)] active:scale-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--code-focus)]"

/**
 * ===========================================================================
 *  YOU NAME THE SECTION. THE PATH IS THE PATH.
 * ===========================================================================
 * This field used to hold "sections/my-section.storelib" and ask somebody to
 * edit the middle of it, which meant the two parts that are not theirs to
 * choose — the folder a section has to live in, and the extension that makes
 * it a section — were the two parts easiest to break. Delete a character
 * from either and the file stops being a section, with nothing said.
 *
 * So the folder and the extension are printed either side of the field and
 * cannot be typed into, and what is typed is the name. It is put into the
 * shape a file name has to have AS it is typed, rather than refused after
 * the fact: spaces become hyphens, capitals become lower case, and anything
 * that is not a letter, a digit, a hyphen or an underscore is dropped.
 */
export function fileNameOf(path: string): { dir: string; name: string; ext: string } {
  const slash = path.lastIndexOf("/")
  const dir = slash === -1 ? "" : path.slice(0, slash + 1)
  const rest = path.slice(slash + 1)
  const dot = rest.indexOf(".")
  return dot === -1 ? { dir, name: rest, ext: "" } : { dir, name: rest.slice(0, dot), ext: rest.slice(dot) }
}

export function asFileName(typed: string): string {
  return typed
    .toLowerCase()
    .replace(/[\s.]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
}


function NameField({
  path,
  onChange,
  label,
  className,
}: {
  path: string
  onChange: (path: string) => void
  label: string
  /**
   * The whole of the field's look, written at the call site as one string.
   * The two sizes it is drawn at are different, and both are measured by
   * scripts/check-code-mobile.mjs, so they read where they are set rather
   * than being assembled here out of pieces.
   */
  className: string
}) {
  const { dir, name, ext } = fileNameOf(path)
  return (
    <div className={cn("flex items-center focus-within:border-[var(--code-text)]/30", className)}>
      {/* The folder as the tree names it (original/ for an imported theme's own files); the path written back keeps the stored one. */}
      {dir ? <span className="shrink-0 select-none text-[var(--code-faint)]">{shownPath(dir)}</span> : null}
      <input
        autoFocus
        value={name}
        onChange={(e) => onChange(`${dir}${asFileName(e.target.value)}${ext}`)}
        className="min-w-0 flex-1 bg-transparent px-0 text-inherit text-[var(--code-text)] focus:outline-none"
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
      />
      {ext ? <span className="shrink-0 select-none text-[var(--code-faint)]">{ext}</span> : null}
    </div>
  )
}

export default function CodeEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  const { installId } = use(params)
  const router = useRouter()
  // `?embedded=1` is the theme editor framing this page over its canvas.
  const embedded =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embedded") === "1"
  /**
   * `?back=editor` is the builder on a phone, where this page is reached by
   * navigation rather than framed: Back goes to the builder, not the list.
   */
  const fromEditor =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("back") === "editor"
  const backHref = fromEditor ? `/website-builder/editor/${installId}` : "/app/website-builder"
  /** Set the instant Back is pressed, so the arrow can say the page is coming. */
  const [goingBack, setGoingBack] = useState(false)
  /**
   * `?path=` opens straight onto one file. Used when the assistant has just
   * written a section: "Open it" should land on the file, not on the tree with
   * the file somewhere in it.
   */
  const wantedPath =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("path") : null

  /**
   * Framed inside the editor, this page's own document must not scroll and
   * must be black to its edges. It is the DOCUMENT that showed as a white
   * column down the right of the code card: the root div is dark, but the
   * html and body behind it were white, and a document scrollbar painted its
   * gutter in that white. Nothing here scrolls at the document level; the
   * panels scroll themselves.
   */
  /**
   * Light or dark, the reader's choice, remembered. Code is the one screen
   * where the preference is about eye strain over an hour rather than about
   * matching the app, so it is the editor's own setting and not the app's.
   */
  const [codeTheme, setCodeTheme] = useState<"light" | "dark">("light")
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wb:code-theme")
      if (saved === "dark" || saved === "light") setCodeTheme(saved)
    } catch {
      /* storage blocked: light is the default */
    }
  }, [])
  const toggleCodeTheme = () => {
    setCodeTheme((t) => {
      const next = t === "dark" ? "light" : "dark"
      try {
        window.localStorage.setItem("wb:code-theme", next)
      } catch {
        /* storage blocked: it still applies for this session */
      }
      return next
    })
  }

  /**
   * THE FRAME AROUND THIS PAGE WEARS THE SAME THEME.
   *
   * On a phone the code editor is a full-screen page with a bar of its own,
   * and that bar belongs to the BUILDER, not to this page: it is outside the
   * frame. So it was `bg-neutral-50` whatever happened in here — a white bar
   * with a back button sitting on top of a #0e0e0e editor, which is the one
   * seam in the whole screen.
   *
   * Same origin, so the two can just talk. This page stays the source of
   * truth (it owns the setting and the storage); it says what the theme is
   * whenever that changes, and accepts being told to change it. The bar's
   * button posts the second message, this effect answers with the first, and
   * neither side keeps a copy that can drift.
   */
  useEffect(() => {
    if (!embedded || typeof window === "undefined") return
    try {
      window.parent?.postMessage({ type: "storelib:code-theme", theme: codeTheme }, window.location.origin)
    } catch {
      /* a parent on another origin cannot be told, and does not need to be */
    }
  }, [embedded, codeTheme])

  /**
   * WHICH OF THESE CONTROLS THE FRAME IS ALREADY SHOWING.
   *
   * On a phone the builder puts its own bar above this page, and that bar
   * carries a light-and-dark switch. This page has one too, so both were on
   * screen at once, eight millimetres apart, doing the same thing. The frame
   * says what it is showing; whatever it shows, this page does not repeat.
   */
  const [frameChrome, setFrameChrome] = useState<{ themeToggle: boolean }>({ themeToggle: false })

  useEffect(() => {
    if (!embedded || typeof window === "undefined") return
    const onMessage = (e: MessageEvent) => {
      // Same origin only. A message from anywhere else is not the builder.
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; theme?: string; themeToggle?: boolean } | null
      if (!data) return
      if (data.type === "storelib:code-chrome") {
        setFrameChrome({ themeToggle: data.themeToggle === true })
        return
      }
      if (data.type !== "storelib:set-code-theme") return
      if (data.theme !== "dark" && data.theme !== "light") return
      setCodeTheme(data.theme)
      try {
        window.localStorage.setItem("wb:code-theme", data.theme)
      } catch {
        /* storage blocked: it still applies for this session */
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [embedded])

  /**
   * HOW MUCH OF THE SCREEN THE KEYBOARD IS OVER.
   *
   * The page is `height: 100%` inside a document that does not scroll, which
   * is right for an editor and wrong for the one row pinned to its bottom:
   * iOS does not shrink the layout viewport for the keyboard, so the path
   * field's own action bar ended up underneath it. `visualViewport` is what
   * reports the covered strip, and it reports it inside a frame too.
   *
   * Published as a variable rather than applied to one element, so the bar
   * that needs it and anything else pinned down there agree on the number.
   */
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined
    if (!vv) return
    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      /* Rounded away from a sub-pixel, and falling back to the published
         floor on a platform that reports no keyboard at all. */
      setKeyboardInset(keyboardInsetOrFloor(covered))
    }
    measure()
    vv.addEventListener("resize", measure)
    vv.addEventListener("scroll", measure)
    return () => {
      vv.removeEventListener("resize", measure)
      vv.removeEventListener("scroll", measure)
    }
  }, [])

  useEffect(() => {
    if (!embedded) return
    const html = document.documentElement
    const body = document.body
    const prev = [html.style.overflow, html.style.background, body.style.overflow, body.style.background]
    // The document behind the editor takes the editor's own background, or
    // the frame shows a white margin around a dark panel.
    const surface = codeTheme === "dark" ? "#0e0e0e" : "#ffffff"
    html.style.overflow = "hidden"
    html.style.background = surface
    body.style.overflow = "hidden"
    body.style.background = surface
    return () => {
      ;[html.style.overflow, html.style.background, body.style.overflow, body.style.background] = prev
    }
  }, [embedded, codeTheme])

  const [install, setInstall] = useState<ThemeInstall | null>(null)
  const [fileTree, setFileTree] = useState<ThemeFileNode[]>([])
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["config", "templates", "sections"]))
  const [selectedFile, setSelectedFile] = useState<ThemeFileNode | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  /** In flight right now, read synchronously: state is a render behind a second Cmd+S. */
  const savingRef = useRef(false)
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
  /** Escape closes the drawer, like every other layer in the product. */
  useEffect(() => {
    if (!narrow || !showFiles) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowFiles(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [narrow, showFiles])

  /**
   * =========================================================================
   *  THE DRAWER MOVES LIKE THE REST OF THE PRODUCT
   * =========================================================================
   * The bottom sheet in the builder is dragged: the panel is under the thumb
   * while the finger is down, and when it lifts it carries on at the speed it
   * was going. A drawer that only knows "open" and "closed" next to it feels
   * like a different product, and a 280ms slide with no way to push it around
   * is what "not smooth" means.
   *
   * So: the same curve and the same idea. While a finger is on it the
   * transform is written straight to the element and the transition is off,
   * because React re-rendering sixty times a second to move one element is
   * both slower and jerkier than setting the property. When the finger lifts,
   * the transition goes back on for as long as the remaining distance and the
   * speed it was released at say it should — a flick finishes quickly, a slow
   * push finishes gently, and a fixed duration does neither.
   *
   * A gesture that is mostly vertical is the file list's, and is left alone.
   */
  const drawerRef = useRef<HTMLElement>(null)
  const backdropRef = useRef<HTMLButtonElement>(null)
  const showFilesRef = useRef(showFiles)
  useEffect(() => { showFilesRef.current = showFiles }, [showFiles])

  /**
   * Nothing animates until the phone layout has been painted once. Arriving
   * on a file — the assistant's "open it" link does exactly that — closes the
   * drawer during mount, and without this the first thing the screen does is
   * play a slide nobody asked for.
   */
  const [drawerReady, setDrawerReady] = useState(false)
  useEffect(() => {
    if (!narrow) { setDrawerReady(false); return }
    const id = requestAnimationFrame(() => setDrawerReady(true))
    return () => cancelAnimationFrame(id)
  }, [narrow])

  useEffect(() => {
    const el = drawerRef.current
    if (!el || !narrow) return

    let active = false
    let decided = false
    let startX = 0
    let startY = 0
    let width = 0
    let x = 0
    let lastX = 0
    let lastT = 0
    let velocity = 0

    const paint = (px: number) => {
      el.style.transform = `translateX(${px}px)`
      const b = backdropRef.current
      if (b && width) b.style.opacity = String(Math.max(0, Math.min(1, 1 + px / width)))
    }

    const onStart = (e: TouchEvent) => {
      if (!showFilesRef.current || e.touches.length !== 1) return
      active = true
      decided = false
      width = el.getBoundingClientRect().width || 1
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      x = 0
      lastX = startX
      lastT = e.timeStamp
      velocity = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (!decided) {
        // Under eight pixels nobody has said which way they meant yet.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dy) >= Math.abs(dx)) { active = false; return }
        decided = true
        el.style.transition = "none"
        const b = backdropRef.current
        if (b) b.style.transition = "none"
      }
      // Leftward closes. Pulling right does nothing: the drawer is already
      // against the edge, and stretching it past that is a rubber band with
      // nothing behind it.
      x = Math.min(0, dx)
      const dt = e.timeStamp - lastT
      if (dt > 0) {
        velocity = (t.clientX - lastX) / dt
        lastX = t.clientX
        lastT = e.timeStamp
      }
      paint(x)
      // The page must not scroll sideways under the drawer while it moves.
      e.preventDefault()
    }

    const onEnd = () => {
      if (!active) return
      active = false
      if (!decided) return
      // Where it goes and how long it takes: lib/website-builder/drawer-drag.ts,
      // so the thresholds are numbers the suite can argue with.
      const { closing, target, ms } = drawerRelease({ offset: x, width, velocity })
      el.style.transition = `transform ${ms}ms ${DRAWER_EASING}`
      const b = backdropRef.current
      if (b) b.style.transition = `opacity ${ms}ms ${DRAWER_EASING}`
      paint(target)
      window.setTimeout(() => {
        // The class says the same thing the inline style does by now, so
        // handing it back is invisible. State first, then the handover on the
        // frame after React has painted it, or the drawer flicks open for one
        // frame on its way to being closed.
        if (closing) setShowFiles(false)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.transform = ""
          el.style.transition = ""
          if (b) { b.style.opacity = ""; b.style.transition = "" }
        }))
      }, ms)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    // Not passive: `preventDefault` is what stops the browser scrolling the
    // page sideways while the drawer is under a finger.
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [narrow])
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

  /**
   * THE KEYBOARD LEAVES THE WINDOW SCROLLED, and this page owns its own
   * window: when the builder frames it, the iframe's document is the one
   * iOS scrolls to lift the textarea above the keyboard, and the builder
   * outside cannot see or fix that. So the code editor puts itself right
   * when the keyboard goes: window back to the top, and the textarea's
   * scrolling layer re-created, which is what stops it going dead after a
   * focus. See lib/website-builder/keyboard-watch.ts.
   */
  useEffect(() => watchKeyboard(window, document, () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0)
    const area = textareaRef.current
    if (area) reviveScroller(area, (cb) => window.requestAnimationFrame(cb))
  }), [])

  const displayRef = useRef<HTMLDivElement>(null)

  const isDirty = fileContent !== originalContent

  /**
   * WHAT THE COMPILER SAID. A .storelib file is compiled on the server when
   * it is saved; if it does not compile it is not saved and the errors come
   * back with their lines. They are shown under the editor, each one a
   * button that puts the caret on its line, and the line is marked in the
   * gutter. Cleared by a save that goes through or by opening another file.
   */
  /**
   * ===========================================================================
   *  EDITS THAT HAVE NOT BEEN SAVED YET
   * ===========================================================================
   * Held per path while the editor is open, so moving between files loses
   * nothing, and mirrored into this browser's storage so that closing the tab
   * or losing the container does not either. It is NOT an autosave: nothing
   * reaches the account until Save, because a file that does not compile must
   * not be stored and a half-written section is the normal state of one being
   * written. It is a recovery copy, and it is offered rather than applied,
   * since the file on the account may have moved on in the meantime.
   */
  const [drafts, setDrafts] = useState<Record<string, { content: string; saved: string }>>({})
  /** What the file's row said when it was loaded, for spotting a conflict. */
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<{ path: string; content: string } | null>(null)
  /** A save refused because the file had moved on. Both versions are kept. */
  const [conflict, setConflict] = useState<{ path: string; theirs: string; at: string } | null>(null)

  /**
   * ===========================================================================
   *  EVERY SAVE OF THIS FILE, AND WHETHER IT IS LIVE YET
   * ===========================================================================
   * A save goes into the file's draft half and the site keeps showing what
   * was published, the same way a section's settings do. Two things follow
   * from that, and both have to be visible: whether this file has an edit
   * waiting to be published, and what it looked like before each save.
   *
   * Restoring is not a button that overwrites anything. The old version is
   * loaded into the editor as an unsaved change, so it goes back out through
   * the same compile and the same conflict check as anything typed by hand.
   */
  const [unpublished, setUnpublished] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<{ id: string; content: string; kind: string; created_at: string }[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const loadVersions = async () => {
    if (!selectedFile) return
    setLoadingVersions(true)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/files?versions=1&path=${encodeURIComponent(selectedFile.path)}`)
      const d = await res.json().catch(() => ({}))
      setVersions(Array.isArray(d.versions) ? d.versions : [])
    } finally {
      setLoadingVersions(false)
    }
  }

  const draftKey = `wb:code-drafts:${installId}`

  const [compileErrors, setCompileErrors] = useState<ThemeError[]>([])
  const errorLines = new Set(compileErrors.map((e) => e.line).filter((l): l is number => typeof l === "number"))
  const goToLine = (line: number) => {
    const ta = textareaRef.current
    if (!ta) return
    const offset = fileContent.split("\n").slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    ta.focus()
    ta.setSelectionRange(offset, offset)
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = Math.max(0, (line - 4) * lineHeight)
  }

  /** New, rename, duplicate: one inline path field, not a dialog. */
  const [pendingAction, setPendingAction] = useState<{ kind: "new" | "rename" | "duplicate"; path: string } | null>(null)
  /** The starter is being written. A press that shows nothing gets pressed again. */
  const [creating, setCreating] = useState(false)
  /** The delete the server refused, with the pages that use the section. */
  const [deleteBlocked, setDeleteBlocked] = useState<{ path: string; usedBy: string[] } | null>(null)
  /** The rename it refused, for the same reason. */
  const [renameBlocked, setRenameBlocked] = useState<{ from: string; to: string; usedBy: string[] } | null>(null)

  const loadInstall = useCallback(async () => {
    /* Every way out ends the spinner: a refusal, a dropped connection or a server that never answered used to leave the
       whole editor on its loading screen for good (a bare `return` before setLoadingInstall). */
    try {
      const res = await fetchWithDeadline(`/api/website-builder/themes/${installId}`, {}, WAIT_MS.read)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setInstall(data.install)

      // Load customized paths list
      const filesRes = await fetchWithDeadline(`/api/website-builder/themes/${installId}/files`, {}, WAIT_MS.read).catch(() => null)
      if (filesRes?.ok) {
        const filesData = await filesRes.json()
        const paths = new Set<string>(filesData.customized_paths ?? [])
        setCustomizedPaths(paths)
        setFileTree(buildThemeFileTree(Array.from(paths)))
      } else {
        setFileTree(buildThemeFileTree([]))
      }
    } catch {
      toast.error("Could not open this theme", { action: { label: "Try again", onClick: () => { setLoadingInstall(true); void loadInstall() } } })
    } finally {
      setLoadingInstall(false)
    }
  }, [installId])

  useEffect(() => { loadInstall() }, [loadInstall])

  /**
   * And straight onto the file the URL named, once the tree is there. Only
   * the first time: after that it is whatever the person has open.
   */
  const openedWanted = useRef(false)
  useEffect(() => {
    if (!wantedPath || openedWanted.current || loadingInstall) return
    openedWanted.current = true
    void openFile({
      path: wantedPath,
      name: wantedPath.split("/").pop() ?? wantedPath,
      type: "file",
      isCustomized: true,
      language: detectLanguage(wantedPath),
    })
  }, [wantedPath, loadingInstall])

  const openFile = async (node: ThemeFileNode) => {
    if (node.type !== "file") return

    /**
     * UNSAVED WORK IS KEPT, NOT THROWN AWAY OR ASKED ABOUT.
     *
     * This used to read "in production you'd show a confirm dialog; for now
     * just save silently", and it did neither: clicking another file in the
     * tree discarded everything typed into this one, with no dialog and no
     * save. A dialog would have been the wrong fix anyway. The edit is put
     * aside under its own path, so switching away and back brings it straight
     * back, and the tab keeps its dirty dot the whole time. Nothing to decide
     * and nothing lost.
     */
    if (selectedFile && selectedFile.path !== node.path && fileContent !== originalContent) {
      setDrafts(prev => ({ ...prev, [selectedFile.path]: { content: fileContent, saved: originalContent } }))
    }

    setSelectedFile(node)
    setCompileErrors([])
    setHistoryOpen(false)
    setVersions([])
    // On a phone, picking a file is the gesture that means "show me the code".
    setShowFiles(false)

    const held = drafts[node.path]
    if (held) {
      setFileContent(held.content)
      setOriginalContent(held.saved)
      setLoadingFile(false)
      setOpenTabs(prev => (prev.find(t => t.path === node.path) ? prev : [...prev, node]))
      return
    }

    setLoadingFile(true)
    let opened = false
    try {
      const res = await fetchWithDeadline(`/api/website-builder/themes/${installId}/files?path=${encodeURIComponent(node.path)}`, {}, WAIT_MS.read)
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.content ?? "")
        setOriginalContent(data.content ?? "")
        setSavedAt(typeof data.updated_at === "string" ? data.updated_at : null)
        setUnpublished(data.unpublished === true)
        opened = true
      }
    } catch {
      /* the same as a refusal, below */
    } finally {
      setLoadingFile(false)
    }
    /* NOT OPENED, SO NOT SELECTED. The editor still holds the previous file's text; left selected under this file's name,
       a save would have written it here. Back to the file whose text it is. */
    if (!opened) {
      setSelectedFile(selectedFile)
      toast.error(`Could not open ${node.name}. Try again.`)
      return
    }

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

  /**
   * ===========================================================================
   *  THE ERRORS, OUT OF THE STRIP
   * ===========================================================================
   * Every line in the error list is a button, so the text in it cannot be
   * selected: there was no way to copy what the compiler said except to read
   * it off the screen and type it somewhere else. This is the whole list, as
   * text, with the file it is about at the top.
   */
  const [copiedErrors, setCopiedErrors] = useState(false)
  const copyErrors = async () => {
    const text = [
      selectedFile?.path ?? "",
      ...compileErrors.map((e) => `${typeof e.line === "number" ? `line ${e.line}: ` : `${e.stage}: `}${e.message}`),
    ]
      .filter(Boolean)
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopiedErrors(true)
      window.setTimeout(() => setCopiedErrors(false), 1600)
    } catch {
      toast.error("Could not copy")
    }
  }

  /**
   * ===========================================================================
   *  SOLVE WITH AI
   * ===========================================================================
   * The file and the errors go to the assistant, and what comes back is the
   * same file with those errors gone, compiled on the server before it is
   * handed over. It lands in the editor as an edit — unsaved, reviewable,
   * undoable — rather than being written to the account: a repair nobody read
   * is not better than the error it replaced, and the file did not compile, so
   * there was never anything saved for it to overwrite.
   */
  const [solving, setSolving] = useState(false)
  /** Which file is open right now, for the answer that arrives later. */
  const openPathRef = useRef<string | null>(null)
  openPathRef.current = selectedFile?.path ?? null
  const solveWithAi = async () => {
    if (solving || !selectedFile) return
    const path = selectedFile.path
    if (!path.endsWith(".storelib")) return
    setSolving(true)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/sections/code/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          source: fileContent,
          errors: compileErrors.map((e) => ({ line: e.line, message: e.message, stage: e.stage })),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { source?: string; error?: string }
      if (!res.ok || typeof d.source !== "string") {
        toast.error(d.error ?? "Could not fix it")
        return
      }
      // The file the answer is for may not be the file that is open any more.
      // A slow answer must not land in whatever file is open by then.
      if (openPathRef.current !== path) {
        toast.message("Fix not applied", { description: `You moved off ${shownPath(path)}.` })
        return
      }
      setFileContent(d.source)
      setCompileErrors([])
      toast.success("Fixed. Check it, then save.")
    } catch {
      toast.error("Could not reach Storelib AI")
    } finally {
      setSolving(false)
    }
  }

  const saveFile = async () => {
    if (!selectedFile || !isDirty) return
    /* One save at a time. Cmd+S calls this directly, past the button's disabled state, and a second save while the first
       was in flight came back as a conflict with this editor's own save. */
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await saveFileOnce(selectedFile)
    } catch {
      /* No answer in time, or the connection dropped: the edit is still here, and still marked unsaved. */
      toast.error("Not saved. Your edit is still here.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const saveFileOnce = async (selectedFile: ThemeFileNode) => {
    const res = await fetchWithDeadline(`/api/website-builder/themes/${installId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // What this editor loaded, so the server can tell whether the file has
      // moved on since. See the conflict answer below.
      body: JSON.stringify({ path: selectedFile.path, content: fileContent, base_updated_at: savedAt ?? undefined }),
    }, WAIT_MS.write)

    if (res.ok) {
      const saved = await res.json().catch(() => ({}))
      if (saved?.file?.updated_at) setSavedAt(saved.file.updated_at as string)
      // `drafted: false` means this install has no draft column yet and the
      // save went straight to the live site. Saying so beats implying it did
      // not.
      setUnpublished(saved?.drafted !== false)
      if (historyOpen) void loadVersions()
      /* An imported theme's section keeps the builder's settings made from its own schema: the editor shows the file as kept, so the next save starts from it. */
      if (typeof saved?.stored === "string") {
        setFileContent(saved.stored)
        setOriginalContent(saved.stored)
      } else {
        setOriginalContent(fileContent)
      }
      setCompileErrors([])
      // Saved is saved: the recovery copy for this file has done its job.
      setDrafts(prev => { const n = { ...prev }; delete n[selectedFile.path]; return n })
      setRecovered(null)
      setDirtyPaths(prev => { const n = new Set(prev); n.delete(selectedFile.path); return n })
      setCustomizedPaths(prev => new Set([...prev, selectedFile.path]))
      setFileTree(buildThemeFileTree([...customizedPaths, selectedFile.path]))
      toast.success(saved?.drafted === false ? "Saved and live" : "Saved. Publish to go live")
      announceFileChange(selectedFile.path)
    } else {
      const d = await res.json().catch(() => ({}))
      if (res.status === 422 && Array.isArray(d.errors)) {
        setCompileErrors(d.errors as ThemeError[])
        toast.error("Did not compile. Not saved.", { description: selectedFile.name })
      } else if (res.status === 409 && d.conflict) {
        /**
         * Somebody else's save landed while this one was being written.
         * Neither version is thrown away: this one stays in the editor, the
         * other is offered, and whoever is here decides. Overwriting quietly
         * is how an hour's work disappears with nobody able to say when.
         */
        setConflict({ path: selectedFile.path, theirs: String(d.conflict.content ?? ""), at: String(d.conflict.updated_at ?? "") })
        toast.error("This file changed while you edited it")
      } else {
        toast.error(d.error ?? "Could not save")
      }
    }
  }

  /**
   * THE CANVAS FINDS OUT. Inside the editor's frame, a saved, reverted,
   * renamed or deleted section file changes what the canvas should draw;
   * the editor listens for this and reloads its sources. Same-origin only,
   * like the dirty flag it sits beside.
   */
  const announceFileChange = (path: string) => {
    if (!embedded || typeof window === "undefined") return
    try {
      window.parent?.postMessage({ type: "storelib:file-saved", path }, window.location.origin)
    } catch {
      /* a parent on another origin cannot be told, and does not need to be */
    }
  }

  /** What a new file starts as: a section that compiles, or an empty object. */
  /**
   * ===========================================================================
   *  WHAT A NEW SECTION STARTS AS
   * ===========================================================================
   * Not the smallest thing that compiles. The starter is the only example most
   * people will ever read closely, so it is the shape a section should have,
   * and everything it demonstrates is something that was routinely missing
   * from sections written from the old one:
   *
   *   IT TAKES THE SITE'S COLOUR SCHEME. A section that hardcodes its colours
   *   ignores the theme, so changing the site's palette leaves it behind and
   *   the page stops looking like one site. `color_scheme` is a setting and
   *   `scheme.*` is where its colours come from.
   *
   *   IT IS RESPONSIVE. Container queries, not viewport ones: a section is as
   *   wide as the column it is in, and in the builder's phone preview that is
   *   not the width of the screen.
   *
   *   ITS SPACING IS A SETTING, so the person who adds it can change it
   *   without opening the code.
   */
  const starterFor = (path: string): string => {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (m) {
      const type = m[1]
      const name = type.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
      return [
        "{# " + name + " — yours. Everything below is a starting point. #}",
        "<template>",
        `<section class="${type}" style="--bg: {{ scheme.bg }}; --text: {{ scheme.paragraph }}; --heading: {{ scheme.heading }}; --accent: {{ scheme.accent }}; --pt: {{ settings.padding_top }}px; --pb: {{ settings.padding_bottom }}px;">`,
        `  <div class="${type}__in">`,
        `    {% if settings.eyebrow %}<p class="${type}__eyebrow">{{ settings.eyebrow }}</p>{% endif %}`,
        `    <h2 class="${type}__h">{{ settings.heading }}</h2>`,
        `    {% if settings.body %}<p class="${type}__body">{{ settings.body }}</p>{% endif %}`,
        "  </div>",
        "</section>",
        "</template>",
        "",
        "<style>",
        `.${type} {`,
        "  /* container-type lets the rules below ask how wide THIS section is,",
        "     rather than how wide the browser window is. */",
        "  container-type: inline-size;",
        "  background: var(--bg);",
        "  color: var(--text);",
        "  padding: var(--pt) var(--theme-padding-x, 24px) var(--pb);",
        "}",
        `.${type}__in { max-width: 720px; margin: 0 auto; text-align: center; }`,
        `.${type}__eyebrow {`,
        "  margin: 0 0 12px;",
        "  font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;",
        "  color: var(--accent);",
        "}",
        `.${type}__h {`,
        "  margin: 0;",
        "  font-size: 28px; line-height: 1.15; font-weight: 700;",
        "  color: var(--heading);",
        "  /* A bare family name falls back to the browser's serif: give it a stack. */",
        "  font-family: var(--theme-font-heading, {{ theme.typography.heading }}), ui-sans-serif, system-ui, sans-serif;",
        "}",
        `.${type}__body { margin: 14px 0 0; font-size: 16px; line-height: 1.6; }`,
        "",
        "/* Tablet, then desktop. Phone is what the rules above already are. */",
        `@container (min-width: 640px) { .${type}__h { font-size: 34px; } }`,
        `@container (min-width: 1024px) { .${type}__h { font-size: 40px; } }`,
        "</style>",
        "",
        "<schema>",
        JSON.stringify({
          language_version: 1,
          type,
          name,
          category: "content",
          settings: [
            { type: "color_scheme", id: "color_scheme", label: "Color scheme", default: "white" },
            { type: "text", id: "eyebrow", label: "Eyebrow", placeholder: "Short label above the heading" },
            { type: "text", id: "heading", label: "Heading", default: name },
            { type: "textarea", id: "body", label: "Text" },
            { type: "header", id: "hdr_spacing", label: "Spacing" },
            { type: "range", id: "padding_top", label: "Padding top", min: 0, max: 160, step: 4, unit: "px", default: 64 },
            { type: "range", id: "padding_bottom", label: "Padding bottom", min: 0, max: 160, step: 4, unit: "px", default: 64 },
          ],
          presets: [{ name }],
        }, null, 2),
        "</schema>",
        "",
      ].join("\n")
    }
    if (path.endsWith(".storelib")) return "<template>\n</template>\n\n<style scoped>\n</style>\n"
    if (path.endsWith(".json")) return "{}\n"
    return ""
  }

  /** Create, rename or duplicate, once the path field is submitted. */
  const runPendingAction = async (force = false) => {
    if (!pendingAction) return
    const to = pendingAction.path.trim()
    if (!to || to.includes("..") || to.startsWith("/") || to.includes("\\")) { toast.error("That is not a path inside the theme"); return }
    const node: ThemeFileNode = { path: to, name: to.split("/").pop()!, type: "file", isCustomized: false, language: detectLanguage(to) }
    if (pendingAction.kind === "new") {
      if (flattenTree(fileTree).includes(to)) { toast.error(`${shownPath(to)} already exists`); return }
      /**
       * CREATE WRITES THE FILE. It used to only open a tab: the starter was
       * put in the textarea, the tree drew the name, the preview found the
       * section — and none of it was anywhere but this browser. Refresh and
       * the whole thing was gone, with no warning and nothing to recover,
       * because it had never been saved in the first place.
       *
       * Now the starter is saved before the tab opens, so a file that exists
       * on screen exists in the account. The starter compiles, so this
       * cannot fail on its own content; if the server refuses it anyway the
       * tab does not open and the reason is shown.
       */
      const starter = starterFor(to)
      if (creating) return
      setCreating(true)
      let res: Response
      let d: { error?: string; errors?: unknown }
      try {
        res = await fetch(`/api/website-builder/themes/${installId}/files`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: to, content: starter }),
        })
        d = await res.json().catch(() => ({}))
      } catch {
        toast.error("Could not reach the server")
        return
      } finally {
        setCreating(false)
      }
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(d.errors)) setCompileErrors(d.errors as ThemeError[])
        toast.error(d.error ?? "Could not create that file")
        return
      }
      setPendingAction(null)
      setSelectedFile({ ...node, isCustomized: true })
      setCompileErrors([])
      setFileContent(starter)
      setOriginalContent(starter)
      setCustomizedPaths(prev => new Set([...prev, to]))
      setFileTree(buildThemeFileTree([...customizedPaths, to]))
      setOpenTabs(prev => (prev.find(t => t.path === to) ? prev : [...prev, { ...node, isCustomized: true }]))
      setShowFiles(false)
      announceFileChange(to)
      toast.success(`${node.name} created`)
      return
    }
    if (!selectedFile) return
    if (pendingAction.kind === "duplicate") {
      const res = await fetch(`/api/website-builder/themes/${installId}/files`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: to, content: fileContent }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? "Could not duplicate"); return }
      setPendingAction(null)
      setCustomizedPaths(prev => new Set([...prev, to]))
      setFileTree(buildThemeFileTree([...customizedPaths, to]))
      announceFileChange(to)
      await openFile({ ...node, isCustomized: true })
      return
    }
    if (pendingAction.kind === "rename") {
      const res = await fetch(`/api/website-builder/themes/${installId}/files${force ? "?force=1" : ""}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selectedFile.path, to }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(d.errors)) setCompileErrors(d.errors as ThemeError[])
        // A rename that takes a section's type with it empties the pages that
        // use it, so it asks first — the same answer, and the same choice, as
        // a delete.
        if (res.status === 409 && Array.isArray(d.used_by)) { setRenameBlocked({ from: selectedFile.path, to, usedBy: d.used_by as string[] }); return }
        toast.error(d.error ?? "Could not rename")
        return
      }
      setPendingAction(null)
      const from = selectedFile.path
      setCustomizedPaths(prev => { const n = new Set(prev); n.delete(from); n.add(to); return n })
      setFileTree(buildThemeFileTree([...customizedPaths].filter(p => p !== from).concat(to)))
      setOpenTabs(prev => prev.filter(t => t.path !== from))
      announceFileChange(from)
      announceFileChange(to)
      await openFile({ ...node, isCustomized: true })
    }
  }

  /**
   * Delete a file the default theme does not have. The server refuses with
   * the pages that use the section; a second call with force goes through.
   */
  const deleteFile = async (force = false) => {
    if (!selectedFile) return
    const res = await fetch(
      `/api/website-builder/themes/${installId}/files?path=${encodeURIComponent(selectedFile.path)}${force ? "&force=1" : ""}`,
      { method: "DELETE" },
    )
    const d = await res.json().catch(() => ({}))
    if (res.status === 409 && Array.isArray(d.used_by)) { setDeleteBlocked({ path: selectedFile.path, usedBy: d.used_by as string[] }); return }
    if (!res.ok) { toast.error(d.error ?? "Could not delete"); return }
    setDeleteBlocked(null)
    const gone = selectedFile.path
    setCustomizedPaths(prev => { const n = new Set(prev); n.delete(gone); return n })
    setFileTree(buildThemeFileTree([...customizedPaths].filter(p => p !== gone)))
    setOpenTabs(prev => prev.filter(t => t.path !== gone))
    setSelectedFile(null)
    setFileContent("")
    setOriginalContent("")
    announceFileChange(gone)
    toast.success(`Deleted ${gone.split("/").pop()}`)
  }
  /** A file the default theme has can be reverted, not deleted. */
  const isOwnFile = (path: string) => !flattenTree(buildThemeFileTree([])).includes(path)

  /**
   * THE THEME'S OWN SOURCE STAYS IN STORELIB. A file the theme ships with can
   * be read and changed here, but its text is not copied, cut or dragged out
   * of the editor. Typing, deleting and replacing a selection still work, so
   * editing is untouched; exporting the theme is the deliberate way to take
   * a copy. A file the creator made is theirs, and copies like any text.
   */
  const protectedSource = !!selectedFile && !isOwnFile(selectedFile.path)
  const refuseCopy = (e: React.ClipboardEvent | React.DragEvent) => {
    if (!protectedSource) return
    e.preventDefault()
    toast("This code cannot be copied", { id: "protected-source", description: "Export the theme to keep a copy." })
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
  /**
   * THE RECOVERY COPY. Written a beat after typing stops, so a crashed tab, a
   * closed laptop or a container that went away leaves the work findable. It
   * is this browser's storage, so it never leaves the machine and never
   * reaches the account: only Save does that, and only a file that compiles.
   */
  useEffect(() => {
    if (!selectedFile || typeof window === "undefined") return
    const t = setTimeout(() => {
      const all = { ...drafts }
      if (fileContent !== originalContent) all[selectedFile.path] = { content: fileContent, saved: originalContent }
      else delete all[selectedFile.path]
      try {
        if (Object.keys(all).length === 0) window.localStorage.removeItem(draftKey)
        else window.localStorage.setItem(draftKey, JSON.stringify(all))
      } catch {
        /* a full or blocked store is not a reason to stop editing */
      }
    }, 700)
    return () => clearTimeout(t)
  }, [fileContent, originalContent, selectedFile, drafts, draftKey])

  /**
   * And found again on the way back in. OFFERED, not applied: the file on the
   * account may have been saved from somewhere else since, and quietly
   * replacing it with an older draft is the same bug in the other direction.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !selectedFile || loadingFile) return
    if (recovered || fileContent !== originalContent) return
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const all = JSON.parse(raw) as Record<string, { content: string; saved: string }>
      const held = all[selectedFile.path]
      if (!held || held.content === fileContent) return
      setRecovered({ path: selectedFile.path, content: held.content })
    } catch {
      /* unreadable is the same as none */
    }
  }, [selectedFile, loadingFile, fileContent, originalContent, recovered, draftKey])

  const codeDirty = isDirty || dirtyPaths.size > 0

  useEffect(() => {
    /**
     * NOT WHILE THE BUILDER IS FRAMING THIS PAGE.
     *
     * A browser fires `beforeunload` for every frame when the top document
     * navigates, so this handler was putting Chrome's own "Leave site?" box
     * in front of somebody who had pressed Back in the builder. That dialog
     * is written by the browser, cannot say what is unsaved, and appears
     * over a screen that was already asking the question properly.
     *
     * Embedded, the parent owns leaving; the message below tells it whether
     * there is anything here to lose so it can say so in its own words.
     * Standalone this is still the only thing that can stop a tab closing.
     */
    if (embedded || !codeDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [embedded, codeDirty])

  /** Tell the builder framing this page whether a file here is unsaved. */
  useEffect(() => {
    if (!embedded || typeof window === "undefined") return
    try {
      window.parent?.postMessage({ type: "storelib:code-dirty", dirty: codeDirty }, window.location.origin)
    } catch {
      /* a parent on another origin cannot be told, and does not need to be */
    }
  }, [embedded, codeDirty])

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
      announceFileChange(selectedFile.path)
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
      toast.error("Could not copy", { description: "Select the text and copy it." })
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

  /**
   * ===========================================================================
   *  THE EDITOR KNOWS WHAT IS IN THE FILE IN FRONT OF IT
   * ===========================================================================
   * Completions, the names the schema does not declare, and a line about
   * whatever the caret is sitting on. All of it comes from the file's own
   * `<schema>`, read out of the text as it is typed, so the list is this
   * section's settings and not a generic one.
   *
   * The popup is placed by arithmetic over a MEASURED character: the layer is
   * monospace, so one character's width and one line's height are enough to
   * put a box under the caret, and both are read from the rendered element
   * rather than assumed. A guessed 8px is how a popup ends up under the wrong
   * word at a different zoom.
   */
  const [caret, setCaret] = useState(0)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeIndex, setCompleteIndex] = useState(0)
  const [charBox, setCharBox] = useState({ w: 7.2, h: 20 })

  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const probe = document.createElement("span")
    const cs = window.getComputedStyle(ta)
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`
    probe.textContent = "0".repeat(50)
    document.body.append(probe)
    const w = probe.getBoundingClientRect().width / 50
    probe.remove()
    const h = parseFloat(cs.lineHeight) || 20
    if (w > 0) setCharBox({ w, h })
  }, [selectedFile?.path, loadingFile])

  const completion = useMemo(
    () => (selectedFile?.path.endsWith(".storelib") ? completionsAt(fileContent, caret) : { items: [], from: caret, to: caret }),
    [fileContent, caret, selectedFile?.path],
  )
  const docs = useMemo(
    () => (selectedFile?.path.endsWith(".storelib") ? documentationAt(fileContent, caret) : null),
    [fileContent, caret, selectedFile?.path],
  )
  /**
   * The same answer the compiler gives on save, while typing. Recomputed on
   * every keystroke because it is string work over one file, and measured at
   * well under a frame for the largest section in the theme.
   */
  const warnings = useMemo(
    () => (selectedFile?.path.endsWith(".storelib") ? undeclaredNames(fileContent) : []),
    [fileContent, selectedFile?.path],
  )
  const warningLines = useMemo(() => new Set(warnings.map((w) => w.line)), [warnings])

  const visibleCompletions = completeOpen ? completion.items.slice(0, 8) : []

  /** Where the caret is on screen, for the popup. */
  const caretPoint = useMemo(() => {
    const upto = fileContent.slice(0, completion.from)
    const line = upto.split("\n").length
    const col = completion.from - (upto.lastIndexOf("\n") + 1)
    return { line, col }
  }, [fileContent, completion.from])

  const applyCompletion = (value: string) => {
    const next = fileContent.slice(0, completion.from) + value + fileContent.slice(completion.to)
    handleContentChange(next)
    setCompleteOpen(false)
    const at = completion.from + value.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (visibleCompletions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCompleteIndex((i) => (i + 1) % visibleCompletions.length); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setCompleteIndex((i) => (i - 1 + visibleCompletions.length) % visibleCompletions.length); return }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyCompletion(visibleCompletions[completeIndex]?.value ?? ""); return }
      if (e.key === "Escape") { e.preventDefault(); setCompleteOpen(false); return }
    }
    // Ctrl/Cmd+Space asks for the list where typing alone would not offer it.
    if (e.key === " " && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCompleteOpen(true); setCompleteIndex(0) }
  }

  const syncCaret = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart)
    setCompleteIndex(0)
  }

  const lines = fileContent.split("\n")

  if (loadingInstall) {
    return (
      <div
        className="wb-code h-full flex items-center justify-center bg-[var(--code-bg)]"
        data-code-theme={codeTheme}
      >
        <BuilderLoader tone={codeTheme === "dark" ? "dark" : "light"} lines={["Opening the code", "Reading your theme files"]} />
      </div>
    )
  }

  return (
    <div
      className="wb-code h-full flex flex-col bg-[var(--code-bg)] text-[var(--code-text)] overflow-hidden"
      data-code-theme={codeTheme}
      /**
       * NOT THE BOUNCE GUARD'S SCREEN EITHER.
       *
       * This page locks its document with `.wb-fullscreen` — html and body
       * at `overflow: hidden` — and the guard's last branch cancels EVERY
       * vertical touchmove on a document that cannot scroll. On this screen
       * that is three bugs in one: the code will not scroll when the file is
       * short enough to fit, a selection handle cannot be dragged because
       * dragging it is a touchmove, and the file list freezes the moment a
       * touch lands between two of its rows.
       *
       * The panels here scroll themselves, with `overscroll-behavior`
       * keeping each flick inside the panel that started it, which is every
       * job the guard was going to do.
       */
      data-wb-no-bounce-guard=""
    >
      <FullScreenLock />
      {/* ── Top bar ── */}
      {/* Inside the editor's own frame the bar above is the editor's, and a
          second one saying the same things is a second header. */}
      {!embedded && (
      <header
        className="h-11 bg-[var(--code-panel)] border-b border-[var(--code-border)] flex items-center px-4 gap-3 shrink-0 box-content"
        // Opened on its own rather than inside the editor's frame, this is the
        // topmost bar on the screen — so on a phone it is the one that lands
        // under the status bar. `box-content` so the padding adds to the 44px
        // rather than eating it.
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <button
          className="flex items-center gap-1.5 text-[13px] text-[var(--code-muted)] hover:text-[var(--code-text)] mr-1 disabled:opacity-100"
          // No question on the way out: an unsaved edit is held in this
          // browser and offered back the next time the file is opened.
          //
          // THE BUTTON SAYS IT IS GOING. The builder takes a moment to come
          // back, and a back arrow that does nothing visible for a second
          // reads as a press that missed. The arrow becomes a spinner in the
          // same place, at the same size, so nothing moves.
          onClick={() => {
            if (goingBack) return
            setGoingBack(true)
            // The same ceiling the builder has on its way out: soft first,
            // and a real load if this page is still here. See
            // lib/website-builder/navigate-ceiling.ts.
            navigateWithCeiling(
              () => router.push(backHref),
              () => window.location.assign(backHref),
              (cb, ms) => window.setTimeout(cb, ms),
              (id) => window.clearTimeout(id),
            )
          }}
          disabled={goingBack}
          aria-busy={goingBack}
        >
          {goingBack ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeft className="h-4 w-4" />
          )}
          <span className={cn("text-[12px]", fromEditor ? "inline" : "hidden sm:inline")}>
            {goingBack ? (fromEditor ? "Opening the editor" : "Going back") : fromEditor ? "Editor" : "Website Builder"}
          </span>
        </button>

        <div className="h-4 w-px bg-[var(--code-active)]" />

        <Code2 className="h-4 w-4 text-[var(--code-muted)]" />
        <span className="text-[13px] text-[var(--code-text)] font-medium">{install?.name}</span>
        {install?.status === "published" && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-400/10 px-1.5 py-0.5 rounded uppercase tracking-wide">Live</span>
        )}

        <div className="flex-1" />
      </header>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        {/*
          THE FILES ARE A DRAWER ON A PHONE, NOT THE WHOLE SCREEN.

          They used to take turns with the code: the list WAS the screen until
          you picked a file, and then the code was. Two things were wrong with
          that. Close the last tab and there is no file selected, so the bar
          that carries the way back to the list is not rendered either — a
          dead end with an empty editor and no files, which is what a
          screenshot of it showed. And taking turns means the list is a
          navigation rather than a glance: every look at another file threw
          the code off the screen.

          A drawer over the code answers both. It is always reachable, it
          never replaces what you were reading, and it closes the moment you
          pick something.
        */}
        {narrow && (
          <button
            ref={backdropRef}
            type="button"
            aria-label="Close the file list"
            tabIndex={showFiles ? 0 : -1}
            onClick={() => setShowFiles(false)}
            className={cn(
              "absolute inset-0 z-30 bg-black/40",
              drawerReady && "transition-opacity duration-[360ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              showFiles ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
        )}
        {/* ── File explorer ── */}
        <aside
          ref={drawerRef}
          aria-hidden={narrow && !showFiles}
          className={cn(
            "bg-[var(--code-panel)] flex flex-col overflow-hidden",
            narrow
              ? [
                  "absolute inset-y-0 left-0 z-40 w-[86%] max-w-[320px] border-r border-[var(--code-border)] shadow-2xl",
                  // One property, on the compositor, for the whole 360ms. The
                  // transition waits for the first painted frame so arriving
                  // on a file does not play a slide nobody asked for.
                  "will-change-transform [touch-action:pan-y]",
                  drawerReady && "transition-transform duration-[360ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                  showFiles ? "translate-x-0" : "-translate-x-full",
                ]
              : "w-56 shrink-0 border-r border-[var(--code-border)]",
          )}
        >
          <div className="px-3 py-2.5 border-b border-[var(--code-border)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-[var(--code-muted)] uppercase tracking-widest">Explorer</p>
              <div className="flex items-center gap-1">
                {/*
                  NEW FILE BELONGS WHERE THE FILES ARE. It used to be a button
                  in the middle of the empty editor, with its form laid out as
                  one row of a label, a field and two buttons — about 250px
                  before the field had a pixel, so on a phone the field ran off
                  both edges of the screen and Cancel was past the right one.
                */}
                <button
                  type="button"
                  onClick={() => {
                    // On a phone the list is over the editor; step back to it
                    // so the field it opens is the thing in front of you.
                    if (narrow) setShowFiles(false)
                    setPendingAction({ kind: "new", path: "sections/my-section.storelib" })
                  }}
                  aria-label="New file"
                  className={cn(CODE_BAR_ICON_BUTTON, narrow ? "h-9 w-9" : "h-7 w-7")}
                >
                  <FilePlus className={narrow ? "h-4 w-4" : "h-3.5 w-3.5"} />
                </button>
                {narrow && (
                  <button
                    type="button"
                    onClick={() => setShowFiles(false)}
                    aria-label="Close the file list"
                    className={cn(CODE_BAR_ICON_BUTTON, "h-9 w-9")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Sixty-one files. Scrolling for one is not a way to find it. */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--code-faint)]" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a file…"
                spellCheck={false}
                className="w-full rounded-md border border-[var(--code-border)] bg-[var(--code-bg)] py-1.5 pl-7 pr-6 text-[16px] md:py-1 md:text-[11.5px] text-[var(--code-text)] outline-none placeholder:text-[var(--code-faint)] focus:border-[var(--code-focus)]"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear the filter"
                  className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-[var(--code-muted)] hover:bg-[var(--code-active)] hover:text-[var(--code-text)]"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            {filter.trim() && (
              <p className="text-[10px] text-[var(--code-faint)]">
                {flattenTree(visibleTree).length} of {flattenTree(fileTree).length} files
              </p>
            )}
          </div>
          <div className="wb-slim-scroll flex-1 overflow-y-auto py-1 px-1">
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

          {/* Legend. Not on a phone: two lines of 10px text explaining two
              dots, holding a strip of a 390px screen that the file list
              needs more. The dots are still there and still mean the same
              thing; what goes is the caption. */}
          <div className={cn("px-3 py-2 border-t border-[var(--code-border)] space-y-1", narrow && "hidden")}>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
              <span className="text-[10px] text-[var(--code-muted)]">Customized</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[10px] text-[var(--code-muted)]">Unsaved changes</span>
            </div>
          </div>
        </aside>

        {/* ── Editor area ── */}
        {/* Always here, drawer or no drawer: the code is what this screen is. */}
        <div className="relative flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tabs */}
          {openTabs.length > 0 && (
            <div className="wb-slim-scroll flex items-end bg-[var(--code-panel)] border-b border-[var(--code-border)] overflow-x-auto shrink-0">
              {openTabs.map(tab => {
                const isActive = selectedFile?.path === tab.path
                const isTabDirty = dirtyPaths.has(tab.path)
                return (
                  <button
                    key={tab.path}
                    className={cn(
                      "flex items-center gap-2 px-3 border-r border-[var(--code-border)] whitespace-nowrap hover:bg-[var(--code-hover)] transition-colors relative",
                      narrow ? "py-2.5 text-[13px]" : "py-2 text-[12px]",
                      isActive ? "bg-[var(--code-bg)] text-[var(--code-text)] border-t-2 border-t-[#8B56FA]" : "text-[var(--code-muted)]",
                    )}
                    onClick={() => openFile(tab)}
                  >
                    <File className="h-3 w-3 shrink-0" />
                    {tab.name}
                    {isTabDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    <span
                      role="button"
                      aria-label={`Close ${tab.name}`}
                      className={cn(
                        "rounded hover:bg-[var(--code-active)] flex items-center justify-center ml-1 shrink-0",
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
          {selectedFile && (() => {
            const own = customizedPaths.has(selectedFile.path) && isOwnFile(selectedFile.path)
            const modified = customizedPaths.has(selectedFile.path)
            const folder = selectedFile.path.split("/").slice(0, -1).join("/") || "sections"
            const ext = selectedFile.path.endsWith(".storelib") ? ".storelib" : ".json"
            /**
             * Every action the bar offers, named once. The wide bar draws
             * them as icons with a tooltip; the narrow bar puts the same
             * list behind one button, with the names written out.
             */
            const actions: CodeAction[] = [
              // Not when the builder's own bar above is already showing one.
              ...(frameChrome.themeToggle
                ? []
                : [{
                    id: "theme",
                    icon: codeTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />,
                    label: codeTheme === "dark" ? "Light editor" : "Dark editor",
                    onClick: toggleCodeTheme,
                  }]),
              {
                id: "copy",
                icon: copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />,
                label: copied ? "Copied" : "Copy file content",
                onClick: () => void copyFile(),
              },
              { id: "download", icon: <Download className="h-3.5 w-3.5" />, label: "Download this file", onClick: downloadFile },
              {
                id: "new",
                icon: <FilePlus className="h-3.5 w-3.5" />,
                label: "New file",
                onClick: () => { setShowFiles(true); setPendingAction({ kind: "new", path: `${folder}/new-file${ext}` }) },
              },
              {
                id: "duplicate",
                icon: <Files className="h-3.5 w-3.5" />,
                label: "Duplicate this file",
                onClick: () => setPendingAction({ kind: "duplicate", path: selectedFile.path.replace(/(\.[a-z]+)$/, "-copy$1") }),
              },
              ...(own
                ? [
                    {
                      id: "rename",
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      label: "Rename this file",
                      onClick: () => setPendingAction({ kind: "rename", path: selectedFile.path }),
                    },
                    {
                      id: "delete",
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      label: "Delete this file",
                      onClick: () => void deleteFile(false),
                      danger: true,
                    },
                  ]
                : []),
              ...(modified
                ? [{
                    id: "revert",
                    icon: <RotateCcw className="h-3.5 w-3.5" />,
                    label: "Put this file back to the theme's original",
                    onClick: revertFile,
                    wideLabel: "Revert",
                  }]
                : []),
              {
                id: "history",
                icon: <History className="h-3.5 w-3.5" />,
                label: "Every save of this file",
                onClick: () => { const next = !historyOpen; setHistoryOpen(next); if (next) void loadVersions() },
                active: historyOpen,
                wideLabel: "History",
              },
            ]
            return (
            <div className="flex items-center gap-2 border-b border-[var(--code-border)] bg-[var(--code-bg)] px-2 py-1.5 md:px-4">
              {narrow && (
                <button
                  type="button"
                  onClick={() => setShowFiles(true)}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-[var(--code-text)] transition-colors hover:bg-[var(--code-active)] hover:text-[var(--code-text)] active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Files
                </button>
              )}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px] text-[var(--code-muted)]">
                {narrow ? (
                  <span className="truncate text-[12px] text-[var(--code-text)]">{selectedFile.name}</span>
                ) : (
                  shownPath(selectedFile.path).split("/").map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                      <span className={i === arr.length - 1 ? "text-[var(--code-text)]" : ""}>{part}</span>
                    </span>
                  ))
                )}
                {modified && (
                  <span className="ml-2 shrink-0 text-[10px] text-blue-600">● Modified</span>
                )}
              </div>

              {/*
                A PLAIN BUTTON, NOT `variant="ghost"`.
                Ghost's hover is `hover:bg-accent hover:text-accent-foreground`,
                and on the near-black bar this editor used to have that turned
                the button into a white pill whose glyph vanished into its own
                background. The surface is light now, but the rule that fixed
                it stands: state the colours for the surface you are on rather
                than borrow a variant that assumes a different one.
              */}
              {/* The app's own tooltip, not the browser's `title`. A native
                  tooltip waits a second and a half, arrives as an OS box in
                  the OS's own font, and cannot be styled or timed — on a row
                  of unlabelled icons that is the difference between a control
                  you can identify and one you have to click to find out.

                  On a phone there is no pointer to hover with and no room for
                  the row, so the same actions are a menu instead. */}
              {narrow ? (
                <CodeActionMenu actions={actions} />
              ) : (
                actions.map(a => (
                  <BarTip key={a.id} label={a.label}>
                    <button
                      type="button"
                      onClick={a.onClick}
                      aria-label={a.label}
                      className={cn(
                        CODE_BAR_ICON_BUTTON,
                        a.wideLabel && "w-auto gap-1.5 px-2.5 text-[12px]",
                        a.danger && "hover:text-red-600",
                        a.active && "bg-[var(--code-hover)] text-[var(--code-text)]",
                      )}
                    >
                      {a.icon}
                      {a.wideLabel && <span className="hidden sm:inline">{a.wideLabel}</span>}
                    </button>
                  </BarTip>
                ))
              )}

              {/* Saved and waiting for Publish, which is what a draft is. */}
              {unpublished && !isDirty && (
                <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] text-blue-600 sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Not published yet
                </span>
              )}
              <BarTip label={isDirty ? "Save this file" : "No changes to save"}>
                <Button
                  size="sm"
                  onClick={saveFile}
                  disabled={saving || !isDirty}
                  className={cn(
                    "shrink-0 gap-1.5 px-3 text-[12px]",
                    narrow ? "h-9" : "h-8",
                    isDirty
                      ? "bg-[#8B56FA] hover:bg-[#7b46ec] text-white"
                      : "bg-[var(--code-hover)] text-[var(--code-muted)] cursor-default",
                  )}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isDirty ? "Save" : "Saved"}
                </Button>
              </BarTip>
            </div>
            )
          })()}

          {/* Code area */}
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center px-6 text-[var(--code-faint)]">
              <div className="text-center">
                <Code2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-[14px]">Select a file to start editing</p>
                <p className="text-[12px] mt-1 opacity-60">Customized files are highlighted in blue</p>
                {/*
                  THE WAY BACK TO THE FILES, from the one state that had none.
                  With no file selected the bar above is not rendered, and the
                  bar is where the Files button lives — so closing the last tab
                  on a phone left an empty editor with no list and no way to
                  reach one.
                */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {narrow && (
                    <button
                      type="button"
                      onClick={() => setShowFiles(true)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--code-border)] px-3 text-[13px] text-[var(--code-text)] hover:bg-[var(--code-hover)]"
                    >
                      <Folder className="h-4 w-4" />
                      Browse files
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingAction({ kind: "new", path: "sections/my-section.storelib" })}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--code-border)] px-3 text-[13px] text-[var(--code-text)] hover:bg-[var(--code-hover)] md:h-8 md:text-[12px]"
                  >
                    <FilePlus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                    New file
                  </button>
                </div>
              </div>
            </div>
          ) : loadingFile ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--code-muted)]" />
            </div>
          ) : (
            /**
             * THE KEYBOARD TAKES THE BOTTOM OF THIS BOX, not the bottom of a
             * page that scrolls. The document is locked to the viewport, so
             * iOS never moves anything out from under the keyboard: the last
             * quarter of the file sat beneath it, the caret with it, and
             * scrolling further did nothing because the textarea had already
             * reached its end. The covered strip becomes the box's height,
             * so the text ends where the keyboard begins and the last line
             * can be scrolled to like any other.
             */
            <div
              className="flex-1 overflow-hidden relative"
              style={{
                marginBottom: keyboardInset,
                transition: "margin-bottom 160ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            >
              {/* Editable textarea overlaid on the line display */}
              <textarea
                ref={textareaRef}
                className={cn(
                  /**
                   * `select-text` and `touch-pan-*` are stated rather than
                   * inherited: this is the one surface in the app where a
                   * long press has to offer Select All, Copy and Paste, and
                   * where a drag has to move a selection handle rather than
                   * be read as a page gesture and cancelled.
                   */
                  /*
                   * EXACTLY OVER THE TEXT IT TYPES. The visible layer never
                   * wraps and starts after a 40px gutter; this one wrapped long
                   * lines and started at 44px, so after the first long line
                   * every row, every selection and every tap landed somewhere
                   * else than the words under it. Same start, no wrapping, no
                   * ligatures, the same tab width.
                   */
                  "wb-slim-scroll absolute inset-0 w-full h-full bg-transparent text-transparent caret-[var(--code-text)] font-mono resize-none focus:outline-none pl-10 pr-4 py-2 z-10 whitespace-pre overflow-auto [font-variant-ligatures:none] [tab-size:2] selection:bg-[#3b82f6]/30 selection:text-transparent",
                  "select-text overscroll-contain [touch-action:pan-x_pan-y]",
                  CODE_TEXT,
                )}
                value={fileContent}
                onChange={e => {
                  handleContentChange(e.target.value)
                  setCaret(e.target.selectionStart)
                  setCompleteIndex(0)
                  setCompleteOpen(true)
                }}
                onKeyDown={onEditorKeyDown}
                onCopy={refuseCopy}
                onCut={refuseCopy}
                onDragStart={refuseCopy}
                data-protected-source={protectedSource ? "" : undefined}
                onKeyUp={e => syncCaret(e.currentTarget)}
                onClick={e => { syncCaret(e.currentTarget); setCompleteOpen(false) }}
                onBlur={() => setCompleteOpen(false)}
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
                wrap="off"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              {/*
                * WHAT COULD GO HERE. Placed under the caret by arithmetic over
                * a measured character, because the layer is monospace: see
                * charBox. The list is this file's own settings, its own block
                * settings, the roots, the filters and the tags.
                */}
              {visibleCompletions.length > 0 && (
                <div
                  data-completions=""
                  className="absolute z-30 w-[19rem] max-w-[calc(100%-3rem)] overflow-hidden rounded-lg border border-[var(--code-border)] bg-[var(--code-panel)] shadow-xl"
                  style={{
                    top: caretPoint.line * charBox.h + 8 + charBox.h,
                    left: Math.min(caretPoint.col * charBox.w + 40, 520),
                  }}
                >
                  {visibleCompletions.map((c, i) => (
                    <button
                      key={c.value}
                      type="button"
                      // mousedown, not click: the textarea blurs on click and
                      // the popup would be gone before the click landed.
                      onMouseDown={e => { e.preventDefault(); applyCompletion(c.value) }}
                      onMouseEnter={() => setCompleteIndex(i)}
                      className={cn(
                        "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left font-mono text-[12px]",
                        i === completeIndex ? "bg-[var(--code-hover)]" : "",
                      )}
                    >
                      <span className="shrink-0 text-[var(--code-text)]">{c.label}</span>
                      <span className="truncate text-[11px] text-[var(--code-faint)]">{c.detail}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Visual display with line numbers */}
              <div ref={displayRef} className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                <div className="py-2 min-h-full">
                  {lines.map((line, i) => (
                    <CodeLine key={i} line={line} lineNumber={i + 1} hasError={errorLines.has(i + 1)} hasWarning={warningLines.has(i + 1)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── One path field for new, rename and duplicate ──
              Enter runs it, Esc drops it.

              THE ROW WAS A SINGLE LINE THAT COULD NOT BE ONE. A label that
              does not shrink ("Duplicate as"), two buttons that do not
              shrink, three gaps and the padding come to about 250px before
              the field has a pixel — so on a 390px phone the field was down
              to a hundred and something, and on anything narrower the
              buttons were pushed into each other. That is the overlap.

              It stacks instead: label and field on one line, the actions on
              their own, each half the width so both are a real target. One
              row again from `md` up, where there has always been room.

              AND IT CLEARS WHAT IS UNDER IT. The field autofocuses, which
              means the keyboard is up the moment this appears — and the page
              is `height: 100%` in a document that does not scroll, so iOS
              never moves it: the bar was simply behind the keyboard. The
              covered strip is measured from `visualViewport` and added here,
              along with the home indicator's inset for when no keyboard is
              up. `padding-bottom` rather than a transform, so the bar grows
              into the gap instead of floating over the editor. */}
          {pendingAction && pendingAction.kind !== "new" && selectedFile && (
            <form
              className="flex flex-col gap-2 border-t border-[var(--code-border)] bg-[var(--code-panel)] px-3 py-2 md:flex-row md:items-center md:px-4"
              style={{
                paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 8px + ${keyboardInset}px)`,
                transition: "padding-bottom 160ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onSubmit={e => { e.preventDefault(); void runPendingAction() }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-[11px] text-[var(--code-muted)]">
                  {pendingAction.kind === "rename" ? "Rename to" : "Duplicate as"}
                </span>
                <div className="flex min-w-0 flex-1" onKeyDown={e => { if (e.key === "Escape") setPendingAction(null) }}>
                  <NameField
                    path={pendingAction.path}
                    onChange={path => setPendingAction({ ...pendingAction, path })}
                    label={pendingAction.kind === "rename" ? "New name" : "Name"}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[var(--code-border)] bg-[var(--code-bg)] px-2 font-mono text-[16px] md:h-7 md:text-[12px]"
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="submit"
                  disabled={!fileNameOf(pendingAction.path).name}
                  className="h-10 flex-1 rounded-md bg-[#111114] px-3 text-[13px] font-[550] text-white transition-colors hover:bg-[#26262c] active:bg-black disabled:opacity-40 disabled:pointer-events-none md:h-7 md:flex-none md:px-2.5 md:text-[12px]"
                >
                  {pendingAction.kind === "rename" ? "Rename" : "Duplicate"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="h-10 flex-1 rounded-md border border-[var(--code-border)] px-3 text-[13px] font-[550] text-[var(--code-muted)] transition-colors hover:text-[var(--code-text)] md:h-7 md:flex-none md:border-0 md:px-2 md:text-[12px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* The rename it refused, for the same reason and with the same choice. */}
          {renameBlocked && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--code-border)] bg-amber-500/10 px-4 py-2 text-[12px] text-[var(--code-text)]">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>
                Renaming {renameBlocked.from.split("/").pop()} changes its type. {renameBlocked.usedBy.length === 1 ? "The" : `${renameBlocked.usedBy.length} pages:`} {renameBlocked.usedBy.join(", ")}
                {renameBlocked.usedBy.length === 1 ? " page uses it" : " use it"}, and those sections would render nothing.
              </span>
              <button type="button" onClick={() => { setRenameBlocked(null); void runPendingAction(true) }} className="h-7 rounded-md bg-amber-600 px-2.5 text-[12px] text-white hover:bg-amber-700">Rename anyway</button>
              <button type="button" onClick={() => { setRenameBlocked(null); setPendingAction(null) }} className="h-7 rounded-md px-2 text-[12px] text-[var(--code-muted)] hover:text-[var(--code-text)]">Keep the name</button>
            </div>
          )}

          {/* The delete the server refused: which pages use the section, and the choice. */}
          {deleteBlocked && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--code-border)] bg-amber-500/10 px-4 py-2 text-[12px] text-[var(--code-text)]">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>
                {deleteBlocked.path.split("/").pop()} is on {deleteBlocked.usedBy.length === 1 ? "the" : `${deleteBlocked.usedBy.length} pages:`} {deleteBlocked.usedBy.join(", ")}
                {deleteBlocked.usedBy.length === 1 ? " page" : ""}. Delete it and those sections render nothing.
              </span>
              <button type="button" onClick={() => void deleteFile(true)} className="h-7 rounded-md bg-red-600 px-2.5 text-[12px] text-white hover:bg-red-700">Delete anyway</button>
              <button type="button" onClick={() => setDeleteBlocked(null)} className="h-7 rounded-md px-2 text-[12px] text-[var(--code-muted)] hover:text-[var(--code-text)]">Keep it</button>
            </div>
          )}

          {/*
            * THE NAMES THIS SECTION DOES NOT HAVE, found while typing rather
            * than on save, and one line about whatever the caret is on. Both
            * come out of the file's own schema.
            */}
          {selectedFile?.path.endsWith(".storelib") && (warnings.length > 0 || docs) && compileErrors.length === 0 && (
            <div className="shrink-0 border-t border-[var(--code-border)] bg-[var(--code-panel)] px-4 py-1.5">
              {warnings.length > 0 ? (
                <button
                  type="button"
                  onClick={() => goToLine(warnings[0].line)}
                  className="flex w-full items-center gap-2 text-left text-[11px] text-amber-600"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {warnings.length === 1 ? "" : `${warnings.length} names not in this schema — `}
                    line {warnings[0].line}: {warnings[0].message}
                  </span>
                </button>
              ) : docs ? (
                <p className="truncate text-[11px] text-[var(--code-muted)]">
                  <span className="font-mono text-[var(--code-text)]">{docs.title}</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  {docs.detail}
                </p>
              ) : null}
            </div>
          )}

          {/* Every save of this file, newest first. */}
          {historyOpen && selectedFile && (
            <div className="max-h-56 shrink-0 overflow-y-auto border-t border-[var(--code-border)] bg-[var(--code-panel)]">
              {loadingVersions ? (
                <p className="px-4 py-3 text-[12px] text-[var(--code-muted)]">Reading this file's history…</p>
              ) : versions.length === 0 ? (
                <p className="px-4 py-3 text-[12px] text-[var(--code-muted)]">
                  No saves recorded for this file yet. Every save from here on is kept.
                </p>
              ) : (
                <ul>
                  {versions.map((v, i) => (
                    <li key={v.id} className="flex items-center gap-3 border-b border-[var(--code-border)] px-4 py-2 last:border-b-0">
                      <span className="w-[5.5rem] shrink-0 text-[11px] text-[var(--code-muted)]">
                        {v.kind === "publish" ? "Published" : v.kind === "restore" ? "Restored" : "Saved"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--code-text)]">
                        {new Date(v.created_at).toLocaleString()}
                        {i === 0 && <span className="ml-2 text-[11px] text-[var(--code-faint)]">most recent</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--code-faint)]">
                        {(v.content.length / 1024).toFixed(1)}KB
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Into the editor as an unsaved change, not over the
                          // file: it goes back out through the same compile and
                          // the same conflict check as anything typed by hand.
                          handleContentChange(v.content)
                          setHistoryOpen(false)
                          toast.success("Loaded. Save to keep it.")
                        }}
                        disabled={v.content === fileContent}
                        className="h-7 shrink-0 rounded-md border border-[var(--code-border)] px-2 text-[11px] font-[550] text-[var(--code-text)] transition-colors hover:bg-[var(--code-hover)] disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {v.content === fileContent ? "This one" : "Open it"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Two versions of one file, and nobody's work thrown away. */}
          {conflict && conflict.path === selectedFile?.path && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--code-border)] bg-amber-500/10 px-4 py-2 text-[12px] text-[var(--code-text)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>Saved somewhere else while you were editing. Your version is still here.</span>
              <button
                type="button"
                onClick={() => { handleContentChange(conflict.theirs); setSavedAt(conflict.at); setConflict(null) }}
                className="h-7 shrink-0 rounded-md border border-[var(--code-border)] px-2.5 text-[12px] font-[550] text-[var(--code-text)] hover:bg-[var(--code-hover)]"
              >
                Show theirs
              </button>
              <button
                type="button"
                onClick={() => { setSavedAt(conflict.at); setConflict(null); void saveFile() }}
                className="h-7 shrink-0 rounded-md bg-[#111114] px-2.5 text-[12px] font-[550] text-white hover:bg-[#26262c]"
              >
                Keep mine and save
              </button>
            </div>
          )}

          {/* An edit that outlived the tab it was typed in. */}
          {recovered && recovered.path === selectedFile?.path && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--code-border)] bg-blue-500/10 px-4 py-2 text-[12px] text-[var(--code-text)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span>There are unsaved changes to this file from a previous visit.</span>
              <button
                type="button"
                onClick={() => { handleContentChange(recovered.content); setRecovered(null) }}
                className="h-7 shrink-0 rounded-md bg-[#111114] px-2.5 text-[12px] font-[550] text-white hover:bg-[#26262c]"
              >
                Restore them
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecovered(null)
                  setDrafts(prev => { const n = { ...prev }; delete n[recovered.path]; return n })
                  try {
                    const raw = window.localStorage.getItem(draftKey)
                    if (raw) {
                      const all = JSON.parse(raw) as Record<string, unknown>
                      delete all[recovered.path]
                      window.localStorage.setItem(draftKey, JSON.stringify(all))
                    }
                  } catch { /* nothing to clear */ }
                }}
                className="h-7 shrink-0 rounded-md px-2 text-[12px] font-[550] text-[var(--code-muted)] hover:text-[var(--code-text)]"
              >
                Discard them
              </button>
            </div>
          )}

          {/* What the compiler said, one line each, each one a jump to its line. */}
          {compileErrors.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-t border-red-500/30 bg-red-500/5 px-4 py-2" data-compile-errors="">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] font-semibold text-red-600">
                  {compileErrors.length === 1 ? "1 error" : `${compileErrors.length} errors`} — the file was not saved
                </p>
                {/*
                  TWO THINGS TO DO WITH A LIST OF ERRORS, and until now
                  neither was possible. The list was buttons, so dragging
                  across it selected nothing and there was no way to get the
                  text out — you retyped it, from a strip four lines tall,
                  into wherever you were asking for help.
                */}
                <button
                  type="button"
                  onClick={() => void copyErrors()}
                  className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-[550] text-[var(--code-muted)] transition-colors hover:bg-red-500/10 hover:text-[var(--code-text)]"
                >
                  {copiedErrors ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedErrors ? "Copied" : "Copy all"}
                </button>
                <button
                  type="button"
                  onClick={() => void solveWithAi()}
                  disabled={solving || !selectedFile?.path.endsWith(".storelib")}
                  aria-busy={solving}
                  className="flex h-6 shrink-0 items-center gap-1.5 rounded bg-[#111114] px-2 text-[11px] font-[550] text-white transition-colors hover:bg-[#26262c] active:bg-black disabled:opacity-40 disabled:pointer-events-none"
                >
                  {solving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <StorelibLogo size={12} alt="" />}
                  {solving ? "Solving" : "Solve with AI"}
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {compileErrors.map((err, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => { if (typeof err.line === "number") goToLine(err.line) }}
                      className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left font-mono text-[12px] text-[var(--code-text)] hover:bg-red-500/10"
                    >
                      <span className="w-14 shrink-0 text-red-600">{typeof err.line === "number" ? `line ${err.line}` : err.stage}</span>
                      <span className="min-w-0 flex-1 break-words">{err.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Status bar */}
          <div className="h-6 bg-[var(--code-panel)] border-t border-[var(--code-border)] px-4 flex items-center gap-4 shrink-0">
            <span className="text-[10px] text-[var(--code-faint)]">
              {selectedFile?.language ?? "—"}
            </span>
            {selectedFile && (
              <span className="text-[10px] text-[var(--code-faint)]">
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
              <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                <Check className="h-2.5 w-2.5" />
                Saved
              </span>
            )}
          </div>
          {/**
            * =============================================================
            *  NEW FILE IS ASKED IN THE MIDDLE, THE WAY IT USED TO BE
            * =============================================================
            * It was a row in the explorer, so the question arrived in a
            * different column from the one being looked at, and on a phone it
            * threw the file list over the editor to ask it. Then it was a
            * band across the top of the code area: nearer, and still a strip
            * of chrome. It is a card in the middle of the code area now. One
            * question, in the place the answer lands, with the files still
            * there behind it.
            *
            * Sized inside the pane rather than against the screen, so the
            * same card is a comfortable dialog on a desktop and a full-width
            * sheet at 390px without a second layout.
            */}
          {pendingAction?.kind === "new" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--code-bg)]/80 p-4 backdrop-blur-[2px]">
              <div className="w-full max-w-[440px]">
                <form
                className="mb-1 rounded-md border border-[var(--code-focus)] bg-[var(--code-bg)] p-1.5"
                onSubmit={e => { e.preventDefault(); void runPendingAction() }}
                onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setPendingAction(null) } }}
                >
                <NameField
                path={pendingAction.path}
                onChange={path => setPendingAction({ kind: "new", path })}
                label="Name of the new section"
                className="h-9 w-full min-w-0 rounded border border-[var(--code-border)] bg-[var(--code-panel)] px-1.5 font-mono text-[16px] md:h-7 md:text-[11.5px]"
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                <button
                type="submit"
                disabled={!fileNameOf(pendingAction.path).name || creating}
                aria-busy={creating}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-[#8B56FA] px-2 text-[12px] font-[550] text-white transition-colors hover:bg-[#7b46ec] active:bg-[#6d3ade] disabled:opacity-40 disabled:pointer-events-none md:h-7"
                >
                {creating && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                {creating ? "Creating" : "Create"}
                </button>
                <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="h-8 rounded border border-[var(--code-border)] px-2 text-[12px] font-[550] text-[var(--code-muted)] transition-colors hover:text-[var(--code-text)] md:h-7"
                >
                Cancel
                </button>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--code-faint)]">
                It starts as a section that compiles, so you can open it and change one thing at a time.
                </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
