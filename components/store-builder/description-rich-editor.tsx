"use client"

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react"
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
  { label: "Twitter post", value: "twitter", icon: Twitter },
  { label: "Divider", value: "divider", icon: Minus },
  { label: "Upsell", value: "upsell", icon: ShoppingCart },
  { label: "Reviews", value: "reviews", icon: Star },
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
interface InlinePopoverProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  anchorRef?: React.RefObject<HTMLElement | null>
  themeColors?: ThemeColors
  isMobile?: boolean
}

function InlinePopover({ isOpen, onClose, children, className, anchorRef, themeColors, isMobile }: InlinePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState<{
    left?: string
    right?: string
    transform?: string
    top?: string
    bottom?: string
    marginTop?: string
    marginBottom?: string
    position?: "absolute" | "fixed"
  }>({})

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

    // Adjust position to keep popover within viewport
    const adjustPosition = () => {
      if (popoverRef.current) {
        const rect = popoverRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const padding = 16
        const popoverHeight = rect.height
        const popoverWidth = rect.width

        // On mobile, use fixed positioning centered on screen
        if (isMobile || viewportWidth < 640) {
          setAdjustedPosition({
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            marginTop: "0",
            marginBottom: "0",
          })
          return
        }

        // Desktop positioning
        const newPosition: typeof adjustedPosition = {}

        // Get parent element position for reference
        const parentRect = popoverRef.current.parentElement?.getBoundingClientRect()
        if (!parentRect) return

        // Check vertical overflow - if popover would go below viewport, position above
        const spaceBelow = viewportHeight - parentRect.bottom - padding
        const spaceAbove = parentRect.top - padding

        if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
          // Position above the trigger
          newPosition.top = "auto"
          newPosition.bottom = "100%"
          newPosition.marginTop = "0"
          newPosition.marginBottom = "12px"
        } else {
          // Position below the trigger (default)
          newPosition.top = "100%"
          newPosition.bottom = "auto"
          newPosition.marginTop = "12px"
          newPosition.marginBottom = "0"
        }

        // Check horizontal overflow
        if (rect.right > viewportWidth - padding) {
          // If popover goes off right edge, align to right
          newPosition.left = "auto"
          newPosition.right = "0"
        } else if (rect.left < padding) {
          // If popover goes off left edge, align to left
          newPosition.left = "0"
          newPosition.right = "auto"
        }

        setAdjustedPosition(newPosition)
      }
    }

    // Delay to allow popover to render first, then adjust
    const timeoutId = setTimeout(adjustPosition, 10)

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", adjustPosition)
    window.addEventListener("scroll", adjustPosition, true)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", adjustPosition)
      window.removeEventListener("scroll", adjustPosition, true)
    }
  }, [isOpen, onClose, isMobile])

  if (!isOpen) return null

  const isDark = themeColors?.isDarkTheme
  const isMobileView = isMobile || (typeof window !== "undefined" && window.innerWidth < 640)

  return (
    <>
      {/* Backdrop for mobile to prevent interaction with content behind */}
      {isMobileView && (
        <div
          className="fixed inset-0 bg-black/30 z-[999998] animate-in fade-in-0 duration-150"
          onClick={onClose}
        />
      )}
      <div
        ref={popoverRef}
        className={cn(
          "z-[999999] rounded-xl shadow-2xl border flex flex-col",
          "animate-in fade-in-0 duration-200",
          isDark ? "bg-[#1a1a1a] border-[#333]" : "bg-white border-gray-200",
          isMobileView ? "fixed slide-in-from-bottom-4" : "absolute slide-in-from-top-2",
          className
        )}
        style={{
          ...(isMobileView ? {
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "calc(100vw - 32px)",
            maxWidth: "340px",
            maxHeight: "calc(100vh - 48px)",
            overflow: "hidden",
          } : {
            position: adjustedPosition.position || "absolute",
            top: adjustedPosition.top ?? "100%",
            bottom: adjustedPosition.bottom ?? "auto",
            left: adjustedPosition.left,
            right: adjustedPosition.right,
            marginTop: adjustedPosition.marginTop ?? "12px",
            marginBottom: adjustedPosition.marginBottom ?? "0",
            transform: adjustedPosition.transform,
            maxHeight: "min(450px, calc(100vh - 100px))",
            overflow: "hidden",
          }),
        }}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  )
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

  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
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

      // Focus editor and place cursor at the end
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus()
          placeCursorAtEnd()
        }
      }, 50)
    }
  }, [value, isInitialized])

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
            document.execCommand("insertHTML", false, '<div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 7px; margin: 8px 0; background-color: #f9fafb;">[Twitter Post Embed]</div>')
            handleContentChange()
            break
          case "upsell":
            document.execCommand("insertHTML", false, '<div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 7px; margin: 8px 0; background-color: #f9fafb;">[Upsell Widget]</div>')
            handleContentChange()
            break
          case "reviews":
            document.execCommand("insertHTML", false, '<div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 7px; margin: 8px 0; background-color: #f9fafb;">[Reviews Widget]</div>')
            handleContentChange()
            break
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
          <DropdownMenuContent align="start" className="w-48">
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

        {/* Link - Inline Popover */}
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              closeAllPopovers()
              saveSelection()
              const selection = window.getSelection()
              if (selection && selection.toString()) {
                setLinkText(selection.toString())
              }
              setShowLinkPopover(true)
            }}
            title="Insert Link"
            active={showLinkPopover}
          >
            <LinkIcon className={iconSize} />
          </ToolbarButton>

          <InlinePopover isOpen={showLinkPopover} onClose={() => setShowLinkPopover(false)} themeColors={themeColors} isMobile={isMobile}>
            <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-72")} style={{ color: fgColor }}>
              <h3 className="font-semibold text-sm mb-4">Insert Link</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Link Text</Label>
                  <Input
                    placeholder="Enter link text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="h-10 text-sm"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="h-10 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        insertLink()
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLinkPopover(false)}
                    className="flex-1 h-10"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={insertLink}
                    className="flex-1 h-10 bg-purple-600 hover:bg-purple-700"
                  >
                    Insert
                  </Button>
                </div>
              </div>
            </div>
          </InlinePopover>
        </div>

        {/* Image - Inline Popover */}
        <div className="relative">
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

          <InlinePopover isOpen={showImagePopover} onClose={() => setShowImagePopover(false)} themeColors={themeColors} isMobile={isMobile}>
            <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-80")} style={{ color: fgColor }}>
              <h3 className="font-semibold text-sm mb-4">Insert Image</h3>
              <div className="space-y-4">
                {/* Upload button */}
                <button
                  type="button"
                  className="w-full h-20 border-2 border-dashed border-purple-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors flex flex-col items-center justify-center gap-1.5"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 text-purple-500" />
                  <span className="text-xs text-gray-500">Click to upload</span>
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className={cn("px-2", isDarkTheme ? "bg-[#1a1a1a] text-gray-400" : "bg-white text-gray-500")}>or</span>
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
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={insertImage}
                    disabled={!imageUrl}
                    className="flex-1 h-10 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300"
                  >
                    Insert
                  </Button>
                </div>
              </div>
            </div>
          </InlinePopover>
        </div>

        {/* Video - Inline Popover */}
        <div className="relative">
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

          <InlinePopover isOpen={showVideoPopover} onClose={() => setShowVideoPopover(false)} themeColors={themeColors} isMobile={isMobile}>
            <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-80")} style={{ color: fgColor }}>
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
                      <RadioGroupItem value="embed" id="embed" className="text-purple-600 border-purple-600" />
                      <Label htmlFor="embed" className="flex items-center gap-2 cursor-pointer text-sm">
                        <Play className="h-3.5 w-3.5" />
                        Embed video player
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="link" id="link" className="text-purple-600 border-purple-600" />
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
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={insertVideo}
                    disabled={!videoUrl}
                    className="flex-1 h-10 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300"
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
          <DropdownMenuContent align="start" className="w-48">
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

        {/* Button Popover (triggered from Insert menu) - Simplified UI */}
        <InlinePopover isOpen={showButtonPopover} onClose={() => setShowButtonPopover(false)} className="left-auto right-0" themeColors={themeColors} isMobile={isMobile}>
          <div className={cn("p-4 pb-5", isMobile ? "w-full" : "w-72")} style={{ color: fgColor }}>
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
                className={cn(
                  "p-3 rounded-lg border text-center",
                  isDarkTheme ? "border-[#333]" : "border-gray-200"
                )}
                style={{ backgroundColor: isDarkTheme ? "#0f0f0f" : "#f9fafb" }}
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
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={insertButton}
                  className="flex-1 h-10"
                  style={{ backgroundColor: accentColor }}
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
          "flex-1 p-3 sm:p-4 focus:outline-none min-h-[150px] sm:min-h-[200px] max-h-[300px] sm:max-h-[400px] overflow-y-auto",
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
      />


      {/* Selected Embed Controls */}
      {selectedEmbed && (
        <div className="fixed z-[999999]" style={{
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
                <DropdownMenuContent align="end" className="w-44 z-[9999999]">
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
        // Check if clicked on a dialog or dropdown
        const dialogs = document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper]')
        let clickedOnDialog = false
        dialogs.forEach(dialog => {
          if (dialog.contains(e.target as Node)) {
            clickedOnDialog = true
          }
        })

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
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-200">
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
      className="relative group/description animate-in fade-in-0 duration-200"
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
