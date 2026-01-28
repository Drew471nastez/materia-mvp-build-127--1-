"use client"

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react"
import ReactDOM from "react-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  ChevronDown,
  List,
  ListOrdered,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Sparkles,
  Twitter,
  Minus,
  ShoppingCart,
  Star,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Upload,
  ExternalLink,
  Play,
  Pencil,
  Trash2,
  MoveUp,
  MoveDown,
  Maximize2,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Check,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

interface ThemeColors {
  backgroundColor?: string
  foregroundColor?: string
  mutedColor?: string
  borderColor?: string
  accentColor?: string
  buttonColor?: string
  buttonTextColor?: string
  isDarkTheme?: boolean
}

interface DescriptionRichEditorProps {
  value: string
  onChange: (value: string) => void
  onClose?: () => void
  isMobile?: boolean
  textColor?: string
  className?: string
  themeColors?: ThemeColors
  disableAutoFocus?: boolean
}

// Stable unique ID generator for embeds
let embedIdCounter = 0
const generateEmbedId = () => `embed-${Date.now()}-${++embedIdCounter}`

// Text style options for the dropdown
const textStyleOptions = [
  { label: "Text", value: "p", icon: Type },
  { label: "Header", value: "h1", icon: Heading1 },
  { label: "Title", value: "h2", icon: Heading2 },
  { label: "Subtitle", value: "h3", icon: Heading3 },
  { label: "Bulleted list", value: "ul", icon: List },
  { label: "Numbered list", value: "ol", icon: ListOrdered },
]

// Insert options for the dropdown
const insertOptions = [
  { label: "Button", value: "button", icon: Sparkles },
  { label: "Divider", value: "divider", icon: Minus },
]

// Button color presets
const buttonColorPresets = [
  { label: "Blue", value: "#2563eb", textColor: "#ffffff" },
  { label: "Purple", value: "#7c3aed", textColor: "#ffffff" },
  { label: "Green", value: "#16a34a", textColor: "#ffffff" },
  { label: "Red", value: "#dc2626", textColor: "#ffffff" },
  { label: "Orange", value: "#ea580c", textColor: "#ffffff" },
  { label: "Black", value: "#000000", textColor: "#ffffff" },
  { label: "White", value: "#ffffff", textColor: "#000000" },
]

// Image sizing options
const imageSizeOptions = [
  { label: "Cover", value: "cover", icon: Maximize2, description: "Fill container" },
  { label: "Fit", value: "contain", icon: Square, description: "Show full image" },
  { label: "Wide", value: "wide", icon: RectangleHorizontal, description: "16:9 ratio" },
  { label: "Portrait", value: "portrait", icon: RectangleVertical, description: "3:4 ratio" },
  { label: "Square", value: "square", icon: Square, description: "1:1 ratio" },
  { label: "Standard", value: "standard", icon: RectangleHorizontal, description: "4:3 ratio" },
]

// Helper to check if a string looks like HTML
function isHtmlContent(str: string): boolean {
  if (!str) return false
  // Check for HTML tags
  return /<[a-z][\s\S]*>/i.test(str)
}

// Helper to convert plain text to HTML
function textToHtml(text: string): string {
  if (!text) return ""
  if (isHtmlContent(text)) return text
  return text
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("")
}

// Inline Popover Component for a modern, smooth experience
// Uses fixed positioning and portal to prevent clipping issues
interface InlinePopoverProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  anchorRef?: React.RefObject<HTMLElement | null>
  themeColors?: ThemeColors
  isMobile?: boolean
  triggerRef?: React.RefObject<HTMLElement | null>
}

function InlinePopover({ isOpen, onClose, children, className, anchorRef, themeColors, isMobile, triggerRef }: InlinePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
    transformOrigin: string
  }>({ top: 0, left: 0, transformOrigin: "top left" })

  // Create portal container on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      let container = document.getElementById("popover-portal-root")
      if (!container) {
        container = document.createElement("div")
        container.id = "popover-portal-root"
        container.style.position = "fixed"
        container.style.top = "0"
        container.style.left = "0"
        container.style.width = "0"
        container.style.height = "0"
        container.style.zIndex = "2147483647" // Max z-index
        container.style.pointerEvents = "none"
        document.body.appendChild(container)
      }
      setPortalContainer(container)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    // Calculate fixed position based on trigger element
    const calculatePosition = () => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const isMobileView = isMobile || viewportWidth < 640

      // On mobile, center on screen
      if (isMobileView) {
        setPosition({
          top: viewportHeight / 2,
          left: viewportWidth / 2,
          transformOrigin: "center center"
        })
        return
      }

      // Get the trigger element (parent of popover or anchorRef)
      const triggerElement = triggerRef?.current || anchorRef?.current || popoverRef.current?.parentElement
      if (!triggerElement) {
        // Default to center if no trigger found
        setPosition({
          top: viewportHeight / 2,
          left: viewportWidth / 2,
          transformOrigin: "center center"
        })
        return
      }

      const triggerRect = triggerElement.getBoundingClientRect()
      const popoverRect = popoverRef.current?.getBoundingClientRect()
      const popoverWidth = popoverRect?.width || 320
      const popoverHeight = popoverRect?.height || 300
      const padding = 16

      // Calculate position below the trigger by default
      let top = triggerRect.bottom + 12
      let left = triggerRect.left
      let transformOrigin = "top left"

      // Check if popover would go below viewport
      const spaceBelow = viewportHeight - triggerRect.bottom - padding
      const spaceAbove = triggerRect.top - padding

      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        // Position above
        top = triggerRect.top - popoverHeight - 12
        transformOrigin = "bottom left"
      }

      // Check horizontal overflow
      if (left + popoverWidth > viewportWidth - padding) {
        // Align to right edge of trigger
        left = triggerRect.right - popoverWidth
        transformOrigin = transformOrigin.replace("left", "right")
      }

      // Ensure left doesn't go off screen
      if (left < padding) {
        left = padding
      }

      setPosition({ top, left, transformOrigin })
    }

    // Initial position calculation
    const timeoutId = setTimeout(calculatePosition, 10)

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", calculatePosition)
    window.addEventListener("scroll", calculatePosition, true)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", calculatePosition)
      window.removeEventListener("scroll", calculatePosition, true)
    }
  }, [isOpen, onClose, isMobile, triggerRef, anchorRef])

  if (!isOpen) return null

  const isDark = themeColors?.isDarkTheme
  const isMobileView = isMobile || (typeof window !== "undefined" && window.innerWidth < 640)
  const bgColor = isDark ? "#1a1a1a" : "#ffffff"
  const borderColorValue = isDark ? "#444" : "#e5e7eb"
  const textColor = isDark ? "#fafafa" : "#1a1a1a"

  const popoverContent = (
    <>
      {/* Backdrop - very subtle fade */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: isMobileView ? "rgba(0,0,0,0.2)" : "transparent",
          zIndex: 2147483645,
          pointerEvents: "auto",
          opacity: 1,
          animation: "fadeIn 150ms ease-out forwards"
        }}
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        ref={popoverRef}
        className={cn(
          "shadow-lg border flex flex-col",
          className
        )}
        style={{
          position: "fixed",
          zIndex: 2147483646,
          pointerEvents: "auto",
          backgroundColor: bgColor,
          borderColor: borderColorValue,
          color: textColor,
          borderRadius: "17px", // +5px from default 12px
          // Subtle animation: gentle fade + very slight scale from 98%
          animation: "popoverIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          ...(isMobileView ? {
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            transformOrigin: "center center",
            width: "calc(100vw - 32px)",
            maxWidth: "380px",
            maxHeight: "calc(100vh - 32px)",
            overflow: "hidden",
          } : {
            top: position.top,
            left: position.left,
            transformOrigin: position.transformOrigin,
            maxHeight: "min(520px, calc(100vh - 80px))", // 15% taller (from 450px to ~518px)
            overflow: "hidden",
          }),
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
      {/* Inline keyframes for subtle animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popoverIn {
          from {
            opacity: 0;
            transform: ${isMobileView ? 'translate(-50%, -50%) scale(0.98)' : 'scale(0.98)'};
          }
          to {
            opacity: 1;
            transform: ${isMobileView ? 'translate(-50%, -50%) scale(1)' : 'scale(1)'};
          }
        }
      `}</style>
    </>
  )

  // Use portal to render outside the overflow:hidden container
  if (portalContainer && typeof window !== "undefined") {
    return ReactDOM.createPortal(popoverContent, portalContainer)
  }

  // Fallback for SSR
  return popoverContent
}

// Embed Controls Component
interface EmbedControlsProps {
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onSizeChange?: (size: string) => void
  currentSize?: string
  showSizeOptions?: boolean
  className?: string
}

function EmbedControls({
  onDelete,
  onMoveUp,
  onMoveDown,
  onSizeChange,
  currentSize = "cover",
  showSizeOptions = false,
  className,
}: EmbedControlsProps) {
  const [showSizeMenu, setShowSizeMenu] = useState(false)

  return (
    <div
      className={cn(
        "absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-1",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onMoveUp}
        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
        title="Move up"
      >
        <MoveUp className="h-4 w-4 text-gray-600" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
        title="Move down"
      >
        <MoveDown className="h-4 w-4 text-gray-600" />
      </button>
      {showSizeOptions && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSizeMenu(!showSizeMenu)}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Image size"
          >
            <Maximize2 className="h-4 w-4 text-gray-600" />
          </button>
          {showSizeMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-1 min-w-[140px] z-10">
              {imageSizeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onSizeChange?.(option.value)
                    setShowSizeMenu(false)
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors",
                    currentSize === option.value && "bg-purple-50 text-purple-700"
                  )}
                >
                  <option.icon className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-gray-500">{option.description}</div>
                  </div>
                  {currentSize === option.value && <Check className="h-4 w-4 ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="w-px h-5 bg-gray-200 mx-0.5" />
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 hover:bg-red-50 rounded transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4 text-red-500" />
      </button>
    </div>
  )
}

export function DescriptionRichEditor({
  value,
  onChange,
  onClose,
  isMobile = false,
  textColor,
  className,
  themeColors,
  disableAutoFocus = false,
}: DescriptionRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentTextStyle, setCurrentTextStyle] = useState("Text")

  // Theme-aware colors
  const isDarkTheme = themeColors?.isDarkTheme || false
  const bgColor = themeColors?.backgroundColor || (isDarkTheme ? "#1a1a1a" : "#ffffff")
  const fgColor = themeColors?.foregroundColor || textColor || (isDarkTheme ? "#fafafa" : "#000000")
  const mutedColor = themeColors?.mutedColor || (isDarkTheme ? "#a1a1aa" : "#6b7280")
  const borderColor = themeColors?.borderColor || (isDarkTheme ? "#333" : "#e5e7eb")
  const accentColor = themeColors?.accentColor || "#7c3aed"
  const hoverBgColor = isDarkTheme ? "rgba(255,255,255,0.1)" : "rgba(124,58,237,0.1)"

  // Popover states instead of modals
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [showImagePopover, setShowImagePopover] = useState(false)
  const [showVideoPopover, setShowVideoPopover] = useState(false)
  const [showButtonPopover, setShowButtonPopover] = useState(false)
  const [showXEmbedPopover, setShowXEmbedPopover] = useState(false)
  const [showTextSelectionLinkPopover, setShowTextSelectionLinkPopover] = useState(false)
  const [textSelectionLinkUrl, setTextSelectionLinkUrl] = useState("")
  const [textSelectionPosition, setTextSelectionPosition] = useState<{ top: number; left: number } | null>(null)

  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [xPostUrl, setXPostUrl] = useState("")
  const [videoDisplayMode, setVideoDisplayMode] = useState<"embed" | "link">("embed")
  const [savedSelection, setSavedSelection] = useState<Range | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Button popover state
  const [buttonText, setButtonText] = useState("Click me")
  const [buttonLink, setButtonLink] = useState("")
  const [buttonColor, setButtonColor] = useState("#7c3aed")
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff")
  const [buttonAlignment, setButtonAlignment] = useState<"left" | "center" | "right">("center")

  // Selected embed state
  const [selectedEmbed, setSelectedEmbed] = useState<HTMLElement | null>(null)

  // Image upload ref
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Trigger refs for popovers (for positioning)
  const imageButtonRef = useRef<HTMLDivElement>(null)
  const videoButtonRef = useRef<HTMLDivElement>(null)
  const insertButtonRef = useRef<HTMLDivElement>(null)

  // Undo/Redo history
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])
  const [lastContent, setLastContent] = useState("")

  // Inject dynamic styles for placeholder and theme-aware elements
  useEffect(() => {
    const styleId = "description-editor-dynamic-styles"
    let styleElement = document.getElementById(styleId) as HTMLStyleElement
    if (!styleElement) {
      styleElement = document.createElement("style")
      styleElement.id = styleId
      document.head.appendChild(styleElement)
    }
    styleElement.textContent = `
      [data-placeholder]:empty:before {
        content: attr(data-placeholder);
        color: ${mutedColor};
        font-style: italic;
        pointer-events: none;
      }
      [contenteditable] [data-embed-type]:hover {
        --tw-ring-color: ${accentColor}40;
      }
      [contenteditable] [data-embed-type]:focus-within {
        --tw-ring-color: ${accentColor};
      }
      [contenteditable] blockquote {
        border-left: 4px solid ${accentColor}60 !important;
        padding-left: 1rem;
        font-style: italic;
        margin: 0.75rem 0;
      }
      [contenteditable] a {
        color: ${accentColor} !important;
        text-decoration: underline;
      }
    `
    return () => {
      // Don't remove on unmount as other editors may use it
    }
  }, [mutedColor, accentColor])

  // Initialize editor content - only once when mounted
  useEffect(() => {
    if (editorRef.current && !isInitialized) {
      const htmlContent = textToHtml(value)
      editorRef.current.innerHTML = htmlContent
      setIsInitialized(true)
      setLastContent(htmlContent)

      // Focus editor and place cursor at the end (only if not disabled)
      if (!disableAutoFocus) {
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.focus({ preventScroll: true })
            placeCursorAtEnd()
          }
        }, 50)
      }
    }
  }, [value, isInitialized, disableAutoFocus])

  // Helper to place cursor at end of editor content
  const placeCursorAtEnd = useCallback(() => {
    if (!editorRef.current) return

    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editorRef.current)
    range.collapse(false) // collapse to end
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  // Helper to place cursor after a specific element
  const placeCursorAfterElement = useCallback((element: Element) => {
    if (!editorRef.current) return

    const selection = window.getSelection()
    if (!selection) return

    // Create a new paragraph after the element for text insertion
    const newParagraph = document.createElement('p')
    newParagraph.innerHTML = '<br>'

    if (element.nextSibling) {
      element.parentNode?.insertBefore(newParagraph, element.nextSibling)
    } else {
      element.parentNode?.appendChild(newParagraph)
    }

    // Place cursor in the new paragraph
    const range = document.createRange()
    range.setStart(newParagraph, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    editorRef.current.focus()
  }, [])

  // Save to undo stack
  const saveToUndoStack = useCallback(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML
      if (currentContent !== lastContent) {
        setUndoStack(prev => [...prev.slice(-50), lastContent])
        setRedoStack([])
        setLastContent(currentContent)
      }
    }
  }, [lastContent])

  // Save content as HTML (not plain text)
  const saveContent = useCallback(() => {
    if (editorRef.current) {
      const htmlContent = editorRef.current.innerHTML
      // Clean up empty content
      if (htmlContent === "<br>" || htmlContent === "<p><br></p>" || !htmlContent.trim()) {
        onChange("")
      } else {
        onChange(htmlContent)
      }
    }
  }, [onChange])

  // Handle content changes - save as HTML
  const handleContentChange = useCallback(() => {
    saveToUndoStack()
    saveContent()
  }, [saveContent, saveToUndoStack])

  // Undo function
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0 && editorRef.current) {
      const previousContent = undoStack[undoStack.length - 1]
      setRedoStack(prev => [...prev, editorRef.current!.innerHTML])
      setUndoStack(prev => prev.slice(0, -1))
      editorRef.current.innerHTML = previousContent
      setLastContent(previousContent)
      saveContent()
    }
  }, [undoStack, saveContent])

  // Redo function
  const handleRedo = useCallback(() => {
    if (redoStack.length > 0 && editorRef.current) {
      const nextContent = redoStack[redoStack.length - 1]
      setUndoStack(prev => [...prev, editorRef.current!.innerHTML])
      setRedoStack(prev => prev.slice(0, -1))
      editorRef.current.innerHTML = nextContent
      setLastContent(nextContent)
      saveContent()
    }
  }, [redoStack, saveContent])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey

    // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows)
    if (ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
      return
    }

    // Redo: Cmd+Shift+Z (Mac) or Ctrl+Y (Windows)
    if ((isMac && ctrlKey && e.shiftKey && e.key === 'z') || (!isMac && ctrlKey && e.key === 'y')) {
      e.preventDefault()
      handleRedo()
      return
    }

    // Handle Enter key to create proper new lines/paragraphs
    if (e.key === 'Enter' && !e.shiftKey) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const parentElement = range.startContainer.parentElement

        // Check if we're inside a contenteditable=false embed container
        const embedContainer = parentElement?.closest('[contenteditable="false"]')
        if (embedContainer) {
          e.preventDefault()
          // Insert a new paragraph after the embed
          const newParagraph = document.createElement('p')
          newParagraph.innerHTML = '<br>'

          if (embedContainer.nextSibling) {
            embedContainer.parentNode?.insertBefore(newParagraph, embedContainer.nextSibling)
          } else {
            embedContainer.parentNode?.appendChild(newParagraph)
          }

          // Move cursor to new paragraph
          const newRange = document.createRange()
          newRange.setStart(newParagraph, 0)
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)

          handleContentChange()
          return
        }
      }
    }

    // Handle Backspace on embeds
    if (e.key === 'Backspace') {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)

        // Check if we're at the start of an element following an embed
        if (range.startOffset === 0) {
          const currentElement = range.startContainer.parentElement
          const prevElement = currentElement?.previousElementSibling

          if (prevElement?.hasAttribute('data-embed-type')) {
            e.preventDefault()
            // Remove the embed
            prevElement.remove()
            handleContentChange()
            return
          }
        }

        // Check if we have selected an embed
        const parentElement = range.startContainer.parentElement
        const embedContainer = parentElement?.closest('[data-embed-type]')
        if (embedContainer) {
          e.preventDefault()
          embedContainer.remove()
          handleContentChange()
          return
        }
      }
    }

    // Handle Delete key
    if (e.key === 'Delete') {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const currentElement = range.startContainer.parentElement
        const nextElement = currentElement?.nextElementSibling

        if (nextElement?.hasAttribute('data-embed-type')) {
          e.preventDefault()
          nextElement.remove()
          handleContentChange()
          return
        }
      }
    }

    // Handle tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
      handleContentChange()
    }
  }, [handleContentChange, handleUndo, handleRedo])

  // Handle close with auto-save
  const handleClose = useCallback(() => {
    saveContent()
    onClose?.()
  }, [saveContent, onClose])

  // Save selection before opening popovers
  const saveSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0).cloneRange())
    }
  }, [])

  // Restore selection after popover closes
  const restoreSelection = useCallback(() => {
    if (savedSelection && editorRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedSelection)
      }
    }
  }, [savedSelection])

  // Execute command on the editor - single click handling
  const execCommand = useCallback((command: string, value?: string) => {
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus()
        document.execCommand(command, false, value)
        handleContentChange()
      }
    })
  }, [handleContentChange])

  // Apply text style
  const applyTextStyle = useCallback((styleValue: string) => {
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus()

        if (styleValue === "ul") {
          document.execCommand("insertUnorderedList", false)
        } else if (styleValue === "ol") {
          document.execCommand("insertOrderedList", false)
        } else {
          document.execCommand("formatBlock", false, `<${styleValue}>`)
        }

        const label = textStyleOptions.find((opt) => opt.value === styleValue)?.label || "Text"
        setCurrentTextStyle(label)
        handleContentChange()
      }
    })
  }, [handleContentChange])

  // Insert link
  const insertLink = useCallback(() => {
    restoreSelection()
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus()

        if (linkText && linkUrl) {
          document.execCommand("insertHTML", false, `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed; text-decoration: underline;">${linkText}</a>`)
        } else if (linkUrl) {
          document.execCommand("createLink", false, linkUrl)
        }

        setShowLinkPopover(false)
        setLinkUrl("")
        setLinkText("")
        handleContentChange()
      }
    })
  }, [linkUrl, linkText, restoreSelection, handleContentChange])

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const embedId = generateEmbedId()
    // Inline X button that shows on hover - positioned top-right corner
    const deleteButtonHtml = `<button data-delete-embed="true" style="position: absolute; top: 8px; right: 8px; z-index: 10; width: 28px; height: 28px; border-radius: 50%; background-color: rgba(0,0,0,0.7); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: auto;" onmouseenter="this.style.backgroundColor='#dc2626'" onmouseleave="this.style.backgroundColor='rgba(0,0,0,0.7)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`

    // For now, create a local URL. In production, this would upload to storage
    const reader = new FileReader()
    reader.onload = (event) => {
      const imageDataUrl = event.target?.result as string
      restoreSelection()
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus()
          // Wrap image in a div with contenteditable=false to prevent cursor issues, add paragraph after for text
          document.execCommand("insertHTML", false, `<div data-embed-id="${embedId}" data-embed-type="image" data-image-size="cover" contenteditable="false" class="embed-container" style="margin: 12px 0; user-select: none; position: relative;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'" onmouseleave="this.querySelector('[data-delete-embed]').style.opacity='0'">${deleteButtonHtml}<img src="${imageDataUrl}" alt="Image" style="max-width: 100%; height: auto; border-radius: 8px; display: block; object-fit: cover;" loading="lazy" /></div><p><br></p>`)
          handleContentChange()

          // Place cursor after the image
          setTimeout(() => {
            const embedElement = editorRef.current?.querySelector(`[data-embed-id="${embedId}"]`)
            if (embedElement) {
              const nextParagraph = embedElement.nextElementSibling
              if (nextParagraph) {
                const selection = window.getSelection()
                const range = document.createRange()
                range.setStart(nextParagraph, 0)
                range.collapse(true)
                selection?.removeAllRanges()
                selection?.addRange(range)
                editorRef.current?.focus()
              }
            }
          }, 50)
        }
      })
    }
    reader.readAsDataURL(file)

    // Reset input
    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
    setShowImagePopover(false)
  }, [restoreSelection, handleContentChange])

  // Insert image from URL
  const insertImage = useCallback(() => {
    const embedId = generateEmbedId()
    // Inline X button that shows on hover - positioned top-right corner
    const deleteButtonHtml = `<button data-delete-embed="true" style="position: absolute; top: 8px; right: 8px; z-index: 10; width: 28px; height: 28px; border-radius: 50%; background-color: rgba(0,0,0,0.7); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: auto;" onmouseenter="this.style.backgroundColor='#dc2626'" onmouseleave="this.style.backgroundColor='rgba(0,0,0,0.7)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`

    restoreSelection()
    requestAnimationFrame(() => {
      if (editorRef.current && imageUrl) {
        editorRef.current.focus()
        // Wrap image in a div with contenteditable=false to prevent cursor issues, add paragraph after
        document.execCommand("insertHTML", false, `<div data-embed-id="${embedId}" data-embed-type="image" data-image-size="cover" contenteditable="false" class="embed-container" style="margin: 12px 0; user-select: none; position: relative;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'" onmouseleave="this.querySelector('[data-delete-embed]').style.opacity='0'">${deleteButtonHtml}<img src="${imageUrl}" alt="Image" style="max-width: 100%; height: auto; border-radius: 8px; display: block; object-fit: cover;" loading="lazy" /></div><p><br></p>`)
        handleContentChange()

        // Place cursor after the image
        setTimeout(() => {
          const embedElement = editorRef.current?.querySelector(`[data-embed-id="${embedId}"]`)
          if (embedElement) {
            const nextParagraph = embedElement.nextElementSibling
            if (nextParagraph) {
              const selection = window.getSelection()
              const range = document.createRange()
              range.setStart(nextParagraph, 0)
              range.collapse(true)
              selection?.removeAllRanges()
              selection?.addRange(range)
              editorRef.current?.focus()
            }
          }
        }, 50)
      }
    })

    setShowImagePopover(false)
    setImageUrl("")
  }, [imageUrl, restoreSelection, handleContentChange])

  // Extract YouTube video ID
  const extractYouTubeId = useCallback((url: string) => {
    // Handle various YouTube URL formats
    const regexps = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
      /youtube\.com\/v\/([^&\?\/]+)/,
      /youtube\.com\/shorts\/([^&\?\/]+)/,
    ]

    for (const regex of regexps) {
      const match = url.match(regex)
      if (match && match[1]) {
        return match[1]
      }
    }
    return null
  }, [])

  // Insert video
  const insertVideo = useCallback(() => {
    restoreSelection()

    if (videoUrl) {
      const videoId = extractYouTubeId(videoUrl)

      if (!videoId) {
        alert("Please enter a valid YouTube URL")
        return
      }

      const embedId = generateEmbedId()
      // Inline X button that shows on hover - positioned top-right corner
      const deleteButtonHtml = `<button data-delete-embed="true" style="position: absolute; top: 8px; right: 8px; z-index: 10; width: 28px; height: 28px; border-radius: 50%; background-color: rgba(0,0,0,0.7); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: auto;" onmouseenter="this.style.backgroundColor='#dc2626'" onmouseleave="this.style.backgroundColor='rgba(0,0,0,0.7)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus()

          if (videoDisplayMode === "embed") {
            // Embed the video with responsive container - using data attributes for stability
            const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`
            // Wrap in a contenteditable=false container to prevent cursor issues, with hover-visible delete button
            document.execCommand("insertHTML", false, `<div data-embed-id="${embedId}" data-embed-type="youtube" contenteditable="false" class="embed-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: visible; margin: 12px 0; border-radius: 8px; user-select: none;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'" onmouseleave="this.querySelector('[data-delete-embed]').style.opacity='0'">${deleteButtonHtml}<iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 8px; pointer-events: auto;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><p><br></p>`)
          } else {
            // Insert as a link with thumbnail
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
            document.execCommand("insertHTML", false, `<div data-embed-id="${embedId}" data-embed-type="youtube-thumbnail" contenteditable="false" class="embed-container" style="margin: 12px 0; user-select: none; position: relative;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'" onmouseleave="this.querySelector('[data-delete-embed]').style.opacity='0'">${deleteButtonHtml}<a href="${videoUrl}" target="_blank" rel="noopener noreferrer" style="display: block; position: relative;">
              <img src="${thumbnailUrl}" alt="YouTube Video" style="width: 100%; height: auto; border-radius: 8px;" loading="lazy" />
              <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                <div style="background-color: #dc2626; border-radius: 50%; padding: 12px;">
                  <svg style="width: 24px; height: 24px; color: white;" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </a></div><p><br></p>`)
          }

          handleContentChange()

          // Place cursor in the new paragraph after the embed
          setTimeout(() => {
            const embedElement = editorRef.current?.querySelector(`[data-embed-id="${embedId}"]`)
            if (embedElement) {
              const nextParagraph = embedElement.nextElementSibling
              if (nextParagraph) {
                const selection = window.getSelection()
                const range = document.createRange()
                range.setStart(nextParagraph, 0)
                range.collapse(true)
                selection?.removeAllRanges()
                selection?.addRange(range)
                editorRef.current?.focus()
              }
            }
          }, 50)
        }
      })
    }

    setShowVideoPopover(false)
    setVideoUrl("")
    setVideoDisplayMode("embed")
  }, [videoUrl, videoDisplayMode, restoreSelection, handleContentChange, extractYouTubeId])

  // Insert styled button
  const insertButton = useCallback(() => {
    restoreSelection()

    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus()

        const alignStyle = buttonAlignment === "center" ? "text-align: center" : buttonAlignment === "right" ? "text-align: right" : "text-align: left"
        const buttonHtml = buttonLink
          ? `<div style="${alignStyle}; margin: 8px 0;"><a href="${buttonLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; font-weight: 500; text-decoration: none; background-color: ${buttonColor}; color: ${buttonTextColor}; border-radius: 8px;">${buttonText}</a></div>`
          : `<div style="${alignStyle}; margin: 8px 0;"><span style="display: inline-block; padding: 12px 24px; font-weight: 500; cursor: pointer; background-color: ${buttonColor}; color: ${buttonTextColor}; border-radius: 8px;">${buttonText}</span></div>`

        document.execCommand("insertHTML", false, buttonHtml)
        handleContentChange()
      }
    })

    setShowButtonPopover(false)
    setButtonText("Click me")
    setButtonLink("")
    setButtonColor("#7c3aed")
    setButtonTextColor("#ffffff")
    setButtonAlignment("center")
  }, [buttonText, buttonLink, buttonColor, buttonTextColor, buttonAlignment, restoreSelection, handleContentChange])

  // Extract X/Twitter post ID from URL
  const extractXPostId = useCallback((url: string) => {
    // Handle various X/Twitter URL formats
    const regexps = [
      /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
      /(?:twitter\.com|x\.com)\/\w+\/statuses\/(\d+)/,
    ]

    for (const regex of regexps) {
      const match = url.match(regex)
      if (match && match[1]) {
        return match[1]
      }
    }
    return null
  }, [])

  // Insert X/Twitter embed
  const insertXEmbed = useCallback(() => {
    restoreSelection()

    if (xPostUrl) {
      const postId = extractXPostId(xPostUrl)

      if (!postId) {
        alert("Please enter a valid X/Twitter post URL (e.g., https://x.com/user/status/123456)")
        return
      }

      const embedId = generateEmbedId()
      // Inline X button that shows on hover - positioned top-right corner
      const deleteButtonHtml = `<button data-delete-embed="true" style="position: absolute; top: 8px; right: 8px; z-index: 10; width: 28px; height: 28px; border-radius: 50%; background-color: rgba(0,0,0,0.7); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: auto;" onmouseenter="this.style.backgroundColor='#dc2626'" onmouseleave="this.style.backgroundColor='rgba(0,0,0,0.7)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus()

          // Create X embed using Twitter's embed format with blockquote (NO inline script - it won't execute)
          // Store the URL in a data attribute for the preview renderer to use
          const embedHtml = `<div data-embed-id="${embedId}" data-embed-type="x-post" data-x-url="${xPostUrl}" contenteditable="false" class="embed-container x-embed-container" style="margin: 12px 0; user-select: none; position: relative; min-height: 200px;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'" onmouseleave="this.querySelector('[data-delete-embed]').style.opacity='0'">${deleteButtonHtml}<blockquote class="twitter-tweet" data-dnt="true" data-theme="light"><a href="${xPostUrl}">Loading tweet...</a></blockquote></div><p><br></p>`

          document.execCommand("insertHTML", false, embedHtml)
          handleContentChange()

          // Load Twitter widgets script and render the embed
          const loadAndRenderTwitterWidget = () => {
            if (typeof window === 'undefined') return

            const renderEmbed = () => {
              const embedElement = editorRef.current?.querySelector(`[data-embed-id="${embedId}"]`)
              if (embedElement && (window as any).twttr?.widgets) {
                (window as any).twttr.widgets.load(embedElement)
              }
            }

            if (!(window as any).twttr) {
              // Load Twitter widgets script
              const script = document.createElement('script')
              script.src = 'https://platform.twitter.com/widgets.js'
              script.async = true
              script.onload = () => {
                // Wait for twttr to be ready
                if ((window as any).twttr?.ready) {
                  (window as any).twttr.ready(renderEmbed)
                } else {
                  setTimeout(renderEmbed, 500)
                }
              }
              document.head.appendChild(script)
            } else if ((window as any).twttr?.widgets) {
              renderEmbed()
            } else if ((window as any).twttr?.ready) {
              (window as any).twttr.ready(renderEmbed)
            }
          }

          // Render the embed after a small delay to ensure DOM is updated
          setTimeout(loadAndRenderTwitterWidget, 100)

          // Place cursor after the embed
          setTimeout(() => {
            const embedElement = editorRef.current?.querySelector(`[data-embed-id="${embedId}"]`)
            if (embedElement) {
              const nextParagraph = embedElement.nextElementSibling
              if (nextParagraph) {
                const selection = window.getSelection()
                const range = document.createRange()
                range.setStart(nextParagraph, 0)
                range.collapse(true)
                selection?.removeAllRanges()
                selection?.addRange(range)
                editorRef.current?.focus()
              }
            }
          }, 50)
        }
      })
    }

    setShowXEmbedPopover(false)
    setXPostUrl("")
  }, [xPostUrl, restoreSelection, handleContentChange, extractXPostId])

  // Insert link for selected text
  const insertTextSelectionLink = useCallback(() => {
    if (savedSelection && textSelectionLinkUrl && editorRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedSelection)
        editorRef.current.focus()
        document.execCommand("createLink", false, textSelectionLinkUrl)
        // Style the link
        const links = editorRef.current.querySelectorAll('a')
        links.forEach(link => {
          if (link.href === textSelectionLinkUrl) {
            link.style.color = accentColor
            link.style.textDecoration = 'underline'
            link.setAttribute('target', '_blank')
            link.setAttribute('rel', 'noopener noreferrer')
          }
        })
        handleContentChange()
      }
    }
    setShowTextSelectionLinkPopover(false)
    setTextSelectionLinkUrl("")
    setTextSelectionPosition(null)
  }, [savedSelection, textSelectionLinkUrl, accentColor, handleContentChange])

  // Handle insert options
  const handleInsert = useCallback((insertType: string) => {
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.focus()

        switch (insertType) {
          case "divider":
            document.execCommand("insertHTML", false, '<hr style="margin: 16px 0; border: 0; border-top: 1px solid #e5e7eb;" />')
            handleContentChange()
            break
          case "button":
            saveSelection()
            setShowButtonPopover(true)
            return
          case "twitter":
            saveSelection()
            setShowXEmbedPopover(true)
            return
        }
      }
    })
  }, [handleContentChange, saveSelection])

  // Handle embed click for selection and controls
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Check if the delete button (or its child SVG) was clicked
    const deleteButton = target.closest('[data-delete-embed]') as HTMLElement
    if (deleteButton) {
      e.preventDefault()
      e.stopPropagation()
      const embedContainer = deleteButton.closest('[data-embed-type]') as HTMLElement
      if (embedContainer) {
        embedContainer.remove()
        setSelectedEmbed(null)
        handleContentChange()
      }
      return
    }

    const embedContainer = target.closest('[data-embed-type]') as HTMLElement

    if (embedContainer) {
      setSelectedEmbed(embedContainer)
    } else {
      setSelectedEmbed(null)
    }
  }, [handleContentChange])

  // Delete selected embed
  const deleteEmbed = useCallback((embed: HTMLElement) => {
    embed.remove()
    setSelectedEmbed(null)
    handleContentChange()
  }, [handleContentChange])

  // Move embed up
  const moveEmbedUp = useCallback((embed: HTMLElement) => {
    const prevElement = embed.previousElementSibling
    if (prevElement) {
      embed.parentNode?.insertBefore(embed, prevElement)
      handleContentChange()
    }
  }, [handleContentChange])

  // Move embed down
  const moveEmbedDown = useCallback((embed: HTMLElement) => {
    const nextElement = embed.nextElementSibling
    if (nextElement) {
      embed.parentNode?.insertBefore(nextElement, embed)
      handleContentChange()
    }
  }, [handleContentChange])

  // Change image size
  const changeImageSize = useCallback((embed: HTMLElement, size: string) => {
    const img = embed.querySelector('img')
    if (img) {
      embed.setAttribute('data-image-size', size)

      // Apply size styles
      switch (size) {
        case 'cover':
          img.style.objectFit = 'cover'
          img.style.width = '100%'
          img.style.height = 'auto'
          img.style.aspectRatio = 'auto'
          break
        case 'contain':
          img.style.objectFit = 'contain'
          img.style.width = '100%'
          img.style.height = 'auto'
          img.style.aspectRatio = 'auto'
          break
        case 'wide':
          img.style.objectFit = 'cover'
          img.style.width = '100%'
          img.style.aspectRatio = '16/9'
          break
        case 'portrait':
          img.style.objectFit = 'cover'
          img.style.width = '60%'
          img.style.aspectRatio = '3/4'
          embed.style.textAlign = 'center'
          break
        case 'square':
          img.style.objectFit = 'cover'
          img.style.width = '70%'
          img.style.aspectRatio = '1/1'
          embed.style.textAlign = 'center'
          break
        case 'standard':
          img.style.objectFit = 'cover'
          img.style.width = '100%'
          img.style.aspectRatio = '4/3'
          break
      }

      handleContentChange()
    }
  }, [handleContentChange])

  // Toolbar button component - fixed for single click
  const ToolbarButton = ({
    onClick,
    active = false,
    children,
    title,
  }: {
    onClick: () => void
    active?: boolean
    children: React.ReactNode
    title?: string
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // Prevent focus loss from editor
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      title={title}
      className={cn(
        "p-1.5 sm:p-2 rounded transition-colors",
        !active && "hover:opacity-80"
      )}
      style={{
        backgroundColor: active ? hoverBgColor : "transparent",
        color: active ? accentColor : fgColor,
      }}
    >
      {children}
    </button>
  )

  const iconSize = isMobile ? "h-4 w-4" : "h-5 w-5"

  // Close all popovers
  const closeAllPopovers = useCallback(() => {
    setShowLinkPopover(false)
    setShowImagePopover(false)
    setShowVideoPopover(false)
    setShowButtonPopover(false)
    setShowXEmbedPopover(false)
    setShowTextSelectionLinkPopover(false)
  }, [])

  // Handle text selection for link button
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim() && editorRef.current?.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()

      if (containerRect) {
        setTextSelectionPosition({
          top: rect.top - containerRect.top - 40,
          left: rect.left - containerRect.left + rect.width / 2,
        })
        setSavedSelection(range.cloneRange())
      }
    } else {
      setTextSelectionPosition(null)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col border rounded-lg shadow-lg overflow-hidden", className)}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
      }}
    >
      {/* Hidden file input for image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Toolbar */}
      <div
        className="relative flex flex-wrap items-center gap-0.5 sm:gap-1 p-1.5 sm:p-2 border-b sticky top-0 z-10"
        style={{
          backgroundColor: bgColor,
          borderColor: borderColor,
        }}
      >
        {/* Text Style Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-sm font-medium transition-colors"
              style={{ color: fgColor }}
            >
              {currentTextStyle}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 z-[2147483640]">
            {textStyleOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextStyle(option.value)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: borderColor }} />

        {/* Formatting buttons */}
        <ToolbarButton onClick={() => execCommand("bold")} title="Bold">
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("italic")} title="Italic">
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("underline")} title="Underline">
          <Underline className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("strikeThrough")} title="Strikethrough">
          <Strikethrough className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: borderColor }} />

        {/* Alignment buttons */}
        <ToolbarButton onClick={() => execCommand("justifyLeft")} title="Align Left">
          <AlignLeft className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("justifyCenter")} title="Align Center">
          <AlignCenter className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("justifyRight")} title="Align Right">
          <AlignRight className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: borderColor }} />

        {/* Quote */}
        <ToolbarButton onClick={() => execCommand("formatBlock", "<blockquote>")} title="Quote">
          <Quote className={iconSize} />
        </ToolbarButton>

        {/* Image - Inline Popover */}
        <div className="relative" ref={imageButtonRef}>
          <ToolbarButton
            onClick={() => {
              closeAllPopovers()
              saveSelection()
              setShowImagePopover(true)
            }}
            title="Insert Image"
            active={showImagePopover}
          >
            <ImageIcon className={iconSize} />
          </ToolbarButton>

          <InlinePopover
            isOpen={showImagePopover}
            onClose={() => setShowImagePopover(false)}
            themeColors={themeColors}
            isMobile={isMobile}
            triggerRef={imageButtonRef}
          >
            <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-80")}>
              <h3 className="font-semibold text-sm mb-4">Insert Image</h3>
              <div className="space-y-4">
                {/* Upload button */}
                <button
                  type="button"
                  className={cn(
                    "w-full h-20 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center gap-1.5",
                    isDarkTheme
                      ? "border-purple-400/50 hover:border-purple-400 hover:bg-purple-500/10"
                      : "border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  )}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6" style={{ color: accentColor }} />
                  <span className="text-xs" style={{ color: mutedColor }}>Click to upload</span>
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" style={{ borderColor: borderColor }} />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span
                      className="px-2"
                      style={{
                        backgroundColor: isDarkTheme ? "#1a1a1a" : "#ffffff",
                        color: mutedColor
                      }}
                    >
                      or
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Image URL</Label>
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="h-10 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        insertImage()
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowImagePopover(false)}
                    className="flex-1 h-10"
                    style={{
                      borderColor: borderColor,
                      color: isDarkTheme ? "#fafafa" : "#1a1a1a",
                      backgroundColor: "transparent"
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={insertImage}
                    disabled={!imageUrl}
                    className="flex-1 h-10"
                    style={{
                      backgroundColor: accentColor,
                      color: "#ffffff",
                      opacity: !imageUrl ? 0.5 : 1
                    }}
                  >
                    Insert
                  </Button>
                </div>
              </div>
            </div>
          </InlinePopover>
        </div>

        {/* Video - Inline Popover */}
        <div className="relative" ref={videoButtonRef}>
          <ToolbarButton
            onClick={() => {
              closeAllPopovers()
              saveSelection()
              setShowVideoPopover(true)
            }}
            title="Insert YouTube Video"
            active={showVideoPopover}
          >
            <Video className={iconSize} />
          </ToolbarButton>

          <InlinePopover
            isOpen={showVideoPopover}
            onClose={() => setShowVideoPopover(false)}
            themeColors={themeColors}
            isMobile={isMobile}
            triggerRef={videoButtonRef}
          >
            <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-80")}>
              <h3 className="font-semibold text-sm mb-4">Insert YouTube Video</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">YouTube URL</Label>
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="h-10 text-sm"
                    autoFocus
                  />
                </div>

                <div className="space-y-2.5">
                  <Label className="text-xs font-medium">Display Mode</Label>
                  <RadioGroup value={videoDisplayMode} onValueChange={(v) => setVideoDisplayMode(v as "embed" | "link")} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="embed" id="embed" style={{ borderColor: accentColor, color: accentColor }} />
                      <Label htmlFor="embed" className="flex items-center gap-2 cursor-pointer text-sm">
                        <Play className="h-3.5 w-3.5" />
                        Embed video player
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="link" id="link" style={{ borderColor: accentColor, color: accentColor }} />
                      <Label htmlFor="link" className="flex items-center gap-2 cursor-pointer text-sm">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Show as thumbnail link
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowVideoPopover(false)}
                    className="flex-1 h-10"
                    style={{
                      borderColor: borderColor,
                      color: isDarkTheme ? "#fafafa" : "#1a1a1a",
                      backgroundColor: "transparent"
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={insertVideo}
                    disabled={!videoUrl}
                    className="flex-1 h-10"
                    style={{
                      backgroundColor: accentColor,
                      color: "#ffffff",
                      opacity: !videoUrl ? 0.5 : 1
                    }}
                  >
                    Insert
                  </Button>
                </div>
              </div>
            </div>
          </InlinePopover>
        </div>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: borderColor }} />

        {/* Insert Dropdown */}
        <div ref={insertButtonRef}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-sm font-medium transition-colors"
                style={{ color: fgColor }}
              >
                Insert
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 z-[2147483640]">
              {insertOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInsert(option.value)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Button Popover (triggered from Insert menu) - Simplified UI */}
        <InlinePopover
          isOpen={showButtonPopover}
          onClose={() => setShowButtonPopover(false)}
          themeColors={themeColors}
          isMobile={isMobile}
          triggerRef={insertButtonRef}
        >
          <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-72")}>
            <h3 className="font-semibold text-sm mb-4">Insert Button</h3>
            <div className="space-y-4">
              {/* Button Text */}
              <Input
                placeholder="Button text..."
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                className="h-10 text-sm"
                autoFocus
              />

              {/* Button Link */}
              <Input
                placeholder="Link URL (optional)"
                value={buttonLink}
                onChange={(e) => setButtonLink(e.target.value)}
                className="h-10 text-sm"
              />

              {/* Color presets - compact grid */}
              <div className="flex flex-wrap gap-2 justify-center py-1">
                {buttonColorPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setButtonColor(preset.value)
                      setButtonTextColor(preset.textColor)
                    }}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      buttonColor === preset.value ? "scale-110 ring-2" : "border-transparent hover:scale-105"
                    )}
                    style={{
                      backgroundColor: preset.value,
                      borderColor: buttonColor === preset.value ? accentColor : "transparent",
                      boxShadow: buttonColor === preset.value ? `0 0 0 2px ${accentColor}30` : undefined
                    }}
                    title={preset.label}
                  />
                ))}
              </div>

              {/* Preview - inline compact */}
              <div
                className="p-3 rounded-lg border text-center"
                style={{
                  borderColor: borderColor,
                  backgroundColor: isDarkTheme ? "#0f0f0f" : "#f9fafb"
                }}
              >
                <span
                  className="inline-block px-4 py-2 font-medium text-sm rounded-lg"
                  style={{
                    backgroundColor: buttonColor,
                    color: buttonTextColor,
                  }}
                >
                  {buttonText || "Button"}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowButtonPopover(false)}
                  className="flex-1 h-10"
                  style={{
                    borderColor: borderColor,
                    color: isDarkTheme ? "#fafafa" : "#1a1a1a",
                    backgroundColor: "transparent"
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={insertButton}
                  className="flex-1 h-10"
                  style={{ backgroundColor: accentColor, color: "#ffffff" }}
                >
                  Insert
                </Button>
              </div>
            </div>
          </div>
        </InlinePopover>

        {/* X Embed Popover (triggered from Insert menu) */}
        <InlinePopover
          isOpen={showXEmbedPopover}
          onClose={() => setShowXEmbedPopover(false)}
          themeColors={themeColors}
          isMobile={isMobile}
          triggerRef={insertButtonRef}
        >
          <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-80")}>
            <div className="flex items-center gap-2 mb-4">
              <Twitter className="h-5 w-5" />
              <h3 className="font-semibold text-sm">Insert post</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tweet URL</Label>
                <Input
                  placeholder="https://x.com/gumroad/status/..."
                  value={xPostUrl}
                  onChange={(e) => setXPostUrl(e.target.value)}
                  className="h-10 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      insertXEmbed()
                    }
                  }}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowXEmbedPopover(false)}
                  className="flex-1 h-10"
                  style={{
                    borderColor: borderColor,
                    color: "#1a1a1a",
                    backgroundColor: isDarkTheme ? "#fafafa" : "#ffffff"
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={insertXEmbed}
                  disabled={!xPostUrl}
                  className="flex-1 h-10"
                  style={{
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    opacity: !xPostUrl ? 0.5 : 1
                  }}
                >
                  Insert
                </Button>
              </div>
            </div>
          </div>
        </InlinePopover>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <ToolbarButton onClick={handleUndo} title="Undo (Ctrl/Cmd+Z)">
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={handleRedo} title="Redo (Ctrl+Y / Cmd+Shift+Z)">
          <Redo2 className={iconSize} />
        </ToolbarButton>

        {/* Close button - now with auto-save */}
        {onClose && (
          <>
            <div className="w-px h-5 mx-1" style={{ backgroundColor: borderColor }} />
            <ToolbarButton onClick={handleClose} title="Close & Save">
              <X className={iconSize} />
            </ToolbarButton>
          </>
        )}
      </div>

      {/* Editor Content Area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write your product description here..."
        className={cn(
          "flex-1 p-3 sm:p-4 focus:outline-none min-h-[150px] sm:min-h-[205px] max-h-[300px] sm:max-h-[400px] overflow-y-auto",
          "prose prose-sm max-w-none",
          isDarkTheme && "prose-invert",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3",
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3",
          "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2",
          "[&_p]:mb-3 [&_p]:min-h-[1.5em]",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3",
          "[&_img]:rounded-[8px] [&_img]:max-w-full [&_img]:h-auto",
          "[&_iframe]:rounded-[8px]",
          // Make embed containers clearly selectable but not editable
          "[&_[data-embed-type]]:cursor-default [&_[data-embed-type]]:select-none",
          "[&_[data-embed-type]]:ring-transparent [&_[data-embed-type]:hover]:ring-2",
          "[&_[data-embed-type]:focus-within]:ring-2"
        )}
        style={{
          color: fgColor,
          backgroundColor: bgColor,
          // Dynamic styles based on theme
          ["--tw-prose-body" as string]: fgColor,
          ["--tw-prose-headings" as string]: fgColor,
          ["--tw-prose-links" as string]: accentColor,
          ["--tw-prose-bold" as string]: fgColor,
          ["--tw-prose-quotes" as string]: fgColor,
          ["--tw-prose-quote-borders" as string]: accentColor,
        }}
        onInput={handleContentChange}
        onBlur={handleContentChange}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onMouseUp={handleTextSelection}
      />

      {/* Floating Link Button - appears when text is selected */}
      {textSelectionPosition && !showTextSelectionLinkPopover && (
        <div
          className="absolute"
          style={{
            top: textSelectionPosition.top,
            left: textSelectionPosition.left,
            transform: "translateX(-50%)",
            zIndex: 2147483640,
            animation: "fadeIn 120ms ease-out forwards"
          }}
        >
          <button
            type="button"
            onClick={() => {
              setShowTextSelectionLinkPopover(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-lg border text-sm font-medium transition-colors"
            style={{
              color: fgColor,
              backgroundColor: isDarkTheme ? "#1a1a1a" : "#ffffff",
              borderColor: borderColor,
            }}
          >
            <LinkIcon className="h-4 w-4" />
            Link
          </button>
        </div>
      )}

      {/* Text Selection Link Popover */}
      {textSelectionPosition && showTextSelectionLinkPopover && (
        <div
          className="absolute"
          style={{
            top: textSelectionPosition.top - 10,
            left: textSelectionPosition.left,
            transform: "translateX(-50%)",
            zIndex: 2147483641,
            animation: "popoverIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards"
          }}
        >
          <div
            className="rounded-xl shadow-2xl border p-4"
            style={{
              color: fgColor,
              minWidth: "260px",
              backgroundColor: isDarkTheme ? "#1a1a1a" : "#ffffff",
              borderColor: borderColor,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Add Link</h3>
              <button
                type="button"
                onClick={() => {
                  setShowTextSelectionLinkPopover(false)
                  setTextSelectionPosition(null)
                }}
                className="p-1 rounded transition-colors"
                style={{
                  color: mutedColor,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              placeholder="https://example.com"
              value={textSelectionLinkUrl}
              onChange={(e) => setTextSelectionLinkUrl(e.target.value)}
              className="h-9 text-sm mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  insertTextSelectionLink()
                }
                if (e.key === 'Escape') {
                  setShowTextSelectionLinkPopover(false)
                  setTextSelectionPosition(null)
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowTextSelectionLinkPopover(false)
                  setTextSelectionPosition(null)
                }}
                className="flex-1 h-9"
                style={{
                  borderColor: borderColor,
                  color: isDarkTheme ? "#fafafa" : "#1a1a1a",
                  backgroundColor: "transparent"
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={insertTextSelectionLink}
                disabled={!textSelectionLinkUrl}
                className="flex-1 h-9"
                style={{
                  backgroundColor: accentColor,
                  color: "#ffffff",
                  opacity: !textSelectionLinkUrl ? 0.5 : 1
                }}
              >
                Insert
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Embed Controls */}
      {selectedEmbed && (
        <div className="fixed" style={{
          zIndex: 2147483640,
          top: selectedEmbed.getBoundingClientRect().top + window.scrollY + 8,
          right: Math.max(8, window.innerWidth - selectedEmbed.getBoundingClientRect().right + 8),
        }}>
          <div
            className="flex items-center gap-1 backdrop-blur-sm rounded-lg shadow-lg border p-1"
            style={{
              backgroundColor: isDarkTheme ? "rgba(26,26,26,0.95)" : "rgba(255,255,255,0.95)",
              borderColor: borderColor,
            }}
          >
            <button
              type="button"
              onClick={() => moveEmbedUp(selectedEmbed)}
              className="p-1.5 rounded transition-colors"
              style={{ color: mutedColor }}
              title="Move up"
            >
              <MoveUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveEmbedDown(selectedEmbed)}
              className="p-1.5 rounded transition-colors"
              style={{ color: mutedColor }}
              title="Move down"
            >
              <MoveDown className="h-4 w-4" />
            </button>
            {selectedEmbed.getAttribute('data-embed-type') === 'image' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 rounded transition-colors"
                    style={{ color: mutedColor }}
                    title="Image size"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 z-[2147483640]">
                  {imageSizeOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => changeImageSize(selectedEmbed, option.value)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <option.icon className="h-4 w-4" />
                      <div>
                        <div className="text-sm">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                      {selectedEmbed.getAttribute('data-image-size') === option.value && (
                        <Check className="h-4 w-4 ml-auto" style={{ color: accentColor }} />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="w-px h-5 mx-0.5" style={{ backgroundColor: borderColor }} />
            <button
              type="button"
              onClick={() => deleteEmbed(selectedEmbed)}
              className="p-1.5 hover:bg-red-500/10 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline editing wrapper component for the preview canvas
interface DescriptionEditWrapperProps {
  children: React.ReactNode
  isEditorMode: boolean
  description: string
  onDescriptionChange: (value: string) => void
  isMobile?: boolean
  textColor?: string
  mutedTextColor?: string
  themeColors?: ThemeColors
}

export function DescriptionEditWrapper({
  children,
  isEditorMode,
  description,
  onDescriptionChange,
  isMobile = false,
  textColor,
  mutedTextColor,
  themeColors,
}: DescriptionEditWrapperProps) {
  const [isHovering, setIsHovering] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      setIsEditing(false)
      setIsAnimatingOut(false)
    }, 200) // Match animation duration
  }, [])

  // Handle click outside to close and save
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking inside the wrapper or any dialog
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        // Check if clicked on a dialog, dropdown, or popover portal
        const dialogs = document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper]')
        let clickedOnDialog = false
        dialogs.forEach(dialog => {
          if (dialog.contains(e.target as Node)) {
            clickedOnDialog = true
          }
        })

        // Also check if clicked inside the popover portal
        const popoverPortal = document.getElementById("popover-portal-root")
        if (popoverPortal && popoverPortal.contains(e.target as Node)) {
          clickedOnDialog = true
        }

        // Check for any fixed position elements that are part of the editor UI
        const target = e.target as HTMLElement
        const closestFixed = target.closest('[style*="position: fixed"][style*="z-index: 2147483"]')
        if (closestFixed) {
          clickedOnDialog = true
        }

        if (!clickedOnDialog) {
          handleClose()
        }
      }
    }

    // Use mousedown for earlier detection
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, handleClose])

  if (!isEditorMode) {
    return <>{children}</>
  }

  if (isEditing) {
    return (
      <div
        ref={wrapperRef}
        className={cn(
          "mt-6 transition-all duration-200 ease-out",
          isAnimatingOut
            ? "opacity-0 transform scale-[0.98]"
            : "opacity-100 transform scale-100"
        )}
        data-description-section
      >
        <h2
          className={cn("mb-3 font-semibold", isMobile ? "text-base" : "text-lg")}
          style={{ color: textColor }}
        >
          Description
        </h2>
        <div style={{ animation: "editorFadeIn 180ms ease-out forwards" }}>
          <style>{`
            @keyframes editorFadeIn {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <DescriptionRichEditor
            value={description}
            onChange={onDescriptionChange}
            onClose={handleClose}
            isMobile={isMobile}
            textColor={mutedTextColor}
            themeColors={themeColors}
          />
        </div>
      </div>
    )
  }

  const isDark = themeColors?.isDarkTheme
  const accentColor = themeColors?.accentColor || "#7c3aed"

  return (
    <div
      className="relative group/description"
      style={{ animation: "fadeIn 150ms ease-out forwards" }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-description-section
    >
      {/* The actual content */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Edit button - appears to the right, more visible */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium transition-all duration-200 whitespace-nowrap",
            "px-2 py-1 rounded",
            "mt-1", // Align with description title
            isHovering ? "opacity-100" : "opacity-70"
          )}
          style={{
            color: isHovering ? accentColor : (isDark ? "#a1a1aa" : "#6b7280"),
            backgroundColor: isHovering ? (isDark ? "rgba(255,255,255,0.1)" : `${accentColor}15`) : "transparent"
          }}
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  )
}

// Component to render rich HTML description content
// Memoized to prevent unnecessary re-renders that cause flashing
export const RichDescriptionContent = React.memo(function RichDescriptionContent({
  html,
  className,
  textColor
}: {
  html: string
  className?: string
  textColor?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Load Twitter widgets for any X embeds in the content
  useEffect(() => {
    if (!html || !containerRef.current) return

    // Check if there are any X embeds that need rendering
    const xEmbeds = containerRef.current.querySelectorAll('[data-embed-type="x-post"]')
    if (xEmbeds.length === 0) return

    const loadTwitterWidgets = () => {
      if (typeof window === 'undefined') return

      const renderEmbeds = () => {
        if ((window as any).twttr?.widgets && containerRef.current) {
          (window as any).twttr.widgets.load(containerRef.current)
        }
      }

      if (!(window as any).twttr) {
        // Check if script is already being loaded
        const existingScript = document.querySelector('script[src*="platform.twitter.com/widgets.js"]')
        if (existingScript) {
          // Script is loading, wait for it
          existingScript.addEventListener('load', () => {
            if ((window as any).twttr?.ready) {
              (window as any).twttr.ready(renderEmbeds)
            } else {
              setTimeout(renderEmbeds, 500)
            }
          })
          return
        }

        // Load Twitter widgets script
        const script = document.createElement('script')
        script.src = 'https://platform.twitter.com/widgets.js'
        script.async = true
        script.onload = () => {
          if ((window as any).twttr?.ready) {
            (window as any).twttr.ready(renderEmbeds)
          } else {
            setTimeout(renderEmbeds, 500)
          }
        }
        document.head.appendChild(script)
      } else if ((window as any).twttr?.widgets) {
        renderEmbeds()
      } else if ((window as any).twttr?.ready) {
        (window as any).twttr.ready(renderEmbeds)
      }
    }

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(loadTwitterWidgets, 100)
    return () => clearTimeout(timeoutId)
  }, [html])

  if (!html) return null

  // Check if it's plain text (no HTML tags)
  const isPlainText = !isHtmlContent(html)

  if (isPlainText) {
    return (
      <p
        className={cn("whitespace-pre-wrap leading-relaxed break-words", className)}
        style={{ color: textColor }}
      >
        {html}
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-sm max-w-none",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3",
        "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2",
        "[&_p]:mb-3",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3",
        "[&_a]:text-purple-600 [&_a]:underline [&_a]:hover:text-purple-700",
        "[&_img]:rounded-[8px] [&_img]:max-w-full [&_img]:h-auto",
        // Stable iframe/embed container styling to prevent flashing
        "[&_iframe]:rounded-[8px]",
        "[&_[data-embed-type]]:pointer-events-auto",
        "[&_[data-embed-type='youtube']]:relative [&_[data-embed-type='youtube']]:overflow-hidden",
        "[&_[data-embed-type='youtube']_iframe]:pointer-events-auto",
        // X/Twitter embed styling
        "[&_[data-embed-type='x-post']]:my-4 [&_[data-embed-type='x-post']]:min-h-[200px]",
        "[&_.twitter-tweet]:mx-auto",
        "[&_.twitter-tweet-rendered]:mx-auto",
        // Prevent hover state changes from causing re-renders/flashing
        "[&_div[style*='position: relative'][style*='padding-bottom']]:will-change-auto",
        "[&_div[style*='position: relative'][style*='padding-bottom']]:transform-gpu",
        "[&_hr]:my-4 [&_hr]:border-gray-300",
        className
      )}
      style={{ color: textColor }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
