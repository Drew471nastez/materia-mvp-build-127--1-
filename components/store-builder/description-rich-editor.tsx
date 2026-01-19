"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
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
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DescriptionRichEditorProps {
  value: string
  onChange: (value: string) => void
  onClose?: () => void
  isMobile?: boolean
  textColor?: string
  className?: string
}

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

export function DescriptionRichEditor({
  value,
  onChange,
  onClose,
  isMobile = false,
  textColor,
  className,
}: DescriptionRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [currentTextStyle, setCurrentTextStyle] = useState("Text")
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [showVideoDialog, setShowVideoDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [savedSelection, setSavedSelection] = useState<Range | null>(null)

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && value) {
      // Convert plain text with newlines to HTML
      const htmlContent = value
        .split("\n")
        .map((line) => `<p>${line || "<br>"}</p>`)
        .join("")
      editorRef.current.innerHTML = htmlContent
    }
  }, [])

  // Save selection before opening dialogs
  const saveSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0).cloneRange())
    }
  }, [])

  // Restore selection after dialog closes
  const restoreSelection = useCallback(() => {
    if (savedSelection && editorRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedSelection)
      }
    }
  }, [savedSelection])

  // Execute command on the editor
  const execCommand = useCallback((command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    handleContentChange()
  }, [])

  // Handle content changes
  const handleContentChange = useCallback(() => {
    if (editorRef.current) {
      // Convert HTML back to plain text for storage
      const plainText = editorRef.current.innerText
      onChange(plainText)
    }
  }, [onChange])

  // Apply text style
  const applyTextStyle = useCallback((styleValue: string) => {
    editorRef.current?.focus()

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
  }, [handleContentChange])

  // Insert link
  const insertLink = useCallback(() => {
    restoreSelection()
    editorRef.current?.focus()

    if (linkText && linkUrl) {
      document.execCommand("insertHTML", false, `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${linkText}</a>`)
    } else if (linkUrl) {
      document.execCommand("createLink", false, linkUrl)
    }

    setShowLinkDialog(false)
    setLinkUrl("")
    setLinkText("")
    handleContentChange()
  }, [linkUrl, linkText, restoreSelection, handleContentChange])

  // Insert image
  const insertImage = useCallback(() => {
    restoreSelection()
    editorRef.current?.focus()

    if (imageUrl) {
      document.execCommand("insertHTML", false, `<img src="${imageUrl}" alt="Image" class="max-w-full h-auto rounded-lg my-2" />`)
    }

    setShowImageDialog(false)
    setImageUrl("")
    handleContentChange()
  }, [imageUrl, restoreSelection, handleContentChange])

  // Insert video embed
  const insertVideo = useCallback(() => {
    restoreSelection()
    editorRef.current?.focus()

    if (videoUrl) {
      // Convert YouTube URL to embed URL
      let embedUrl = videoUrl
      if (videoUrl.includes("youtube.com/watch?v=")) {
        const videoId = videoUrl.split("v=")[1]?.split("&")[0]
        embedUrl = `https://www.youtube.com/embed/${videoId}`
      } else if (videoUrl.includes("youtu.be/")) {
        const videoId = videoUrl.split("youtu.be/")[1]?.split("?")[0]
        embedUrl = `https://www.youtube.com/embed/${videoId}`
      }

      document.execCommand("insertHTML", false, `<div class="aspect-video my-2"><iframe src="${embedUrl}" class="w-full h-full rounded-lg" frameborder="0" allowfullscreen></iframe></div>`)
    }

    setShowVideoDialog(false)
    setVideoUrl("")
    handleContentChange()
  }, [videoUrl, restoreSelection, handleContentChange])

  // Handle insert options
  const handleInsert = useCallback((insertType: string) => {
    editorRef.current?.focus()

    switch (insertType) {
      case "divider":
        document.execCommand("insertHTML", false, '<hr class="my-4 border-t border-gray-300" />')
        break
      case "button":
        document.execCommand("insertHTML", false, '<button class="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg">Button</button>')
        break
      case "twitter":
        // Placeholder for Twitter embed
        document.execCommand("insertHTML", false, '<div class="p-4 border rounded-lg my-2 bg-gray-50">[Twitter Post Embed]</div>')
        break
      case "upsell":
        document.execCommand("insertHTML", false, '<div class="p-4 border rounded-lg my-2 bg-gray-50">[Upsell Widget]</div>')
        break
      case "reviews":
        document.execCommand("insertHTML", false, '<div class="p-4 border rounded-lg my-2 bg-gray-50">[Reviews Widget]</div>')
        break
    }

    handleContentChange()
  }, [handleContentChange])

  // Toolbar button component
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
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 sm:p-2 rounded hover:bg-gray-100 transition-colors",
        active && "bg-gray-100"
      )}
    >
      {children}
    </button>
  )

  const iconSize = isMobile ? "h-4 w-4" : "h-5 w-5"

  return (
    <div className={cn("flex flex-col border rounded-lg bg-white shadow-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 p-1.5 sm:p-2 border-b bg-white sticky top-0 z-10">
        {/* Text Style Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-100 text-sm font-medium"
            >
              {currentTextStyle}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {textStyleOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => applyTextStyle(option.value)}
                className="flex items-center gap-2"
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-gray-200 mx-1" />

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

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Quote */}
        <ToolbarButton onClick={() => execCommand("formatBlock", "<blockquote>")} title="Quote">
          <Quote className={iconSize} />
        </ToolbarButton>

        {/* Link */}
        <ToolbarButton
          onClick={() => {
            saveSelection()
            const selection = window.getSelection()
            if (selection && selection.toString()) {
              setLinkText(selection.toString())
            }
            setShowLinkDialog(true)
          }}
          title="Insert Link"
        >
          <LinkIcon className={iconSize} />
        </ToolbarButton>

        {/* Image */}
        <ToolbarButton
          onClick={() => {
            saveSelection()
            setShowImageDialog(true)
          }}
          title="Insert Image"
        >
          <ImageIcon className={iconSize} />
        </ToolbarButton>

        {/* Video */}
        <ToolbarButton
          onClick={() => {
            saveSelection()
            setShowVideoDialog(true)
          }}
          title="Insert Video"
        >
          <Video className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Insert Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-100 text-sm font-medium"
            >
              Insert
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {insertOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleInsert(option.value)}
                className="flex items-center gap-2"
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <ToolbarButton onClick={() => execCommand("undo")} title="Undo">
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("redo")} title="Redo">
          <Redo2 className={iconSize} />
        </ToolbarButton>

        {/* Close button */}
        {onClose && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton onClick={onClose} title="Close Editor">
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
        className={cn(
          "flex-1 p-3 sm:p-4 focus:outline-none min-h-[150px] max-h-[400px] overflow-y-auto",
          "prose prose-sm max-w-none",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2",
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2",
          "[&_p]:mb-2",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2",
          "[&_a]:text-blue-600 [&_a]:underline"
        )}
        style={{ color: textColor || "inherit" }}
        onInput={handleContentChange}
        onBlur={handleContentChange}
      />

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-text">Link Text</Label>
              <Input
                id="link-text"
                placeholder="Enter link text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
            <Button onClick={insertLink}>Insert Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>
              Cancel
            </Button>
            <Button onClick={insertImage}>Insert Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Dialog */}
      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="video-url">YouTube Video URL</Label>
              <Input
                id="video-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVideoDialog(false)}>
              Cancel
            </Button>
            <Button onClick={insertVideo}>Insert Video</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
}

export function DescriptionEditWrapper({
  children,
  isEditorMode,
  description,
  onDescriptionChange,
  isMobile = false,
  textColor,
  mutedTextColor,
}: DescriptionEditWrapperProps) {
  const [isHovering, setIsHovering] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  if (!isEditorMode) {
    return <>{children}</>
  }

  if (isEditing) {
    return (
      <div className="mt-6">
        <h2
          className={cn("mb-3 font-semibold", isMobile ? "text-base" : "text-lg")}
          style={{ color: textColor }}
        >
          Description
        </h2>
        <DescriptionRichEditor
          value={description}
          onChange={onDescriptionChange}
          onClose={() => setIsEditing(false)}
          isMobile={isMobile}
          textColor={mutedTextColor}
        />
      </div>
    )
  }

  return (
    <div
      className="relative group/description"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {children}

      {/* Edit button overlay */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-200 pointer-events-none",
          isHovering ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute inset-0 bg-black/5 rounded-lg" />
        <Button
          variant="secondary"
          size="sm"
          className="relative pointer-events-auto shadow-md bg-white hover:bg-gray-50 text-gray-900 font-medium"
          onClick={() => setIsEditing(true)}
        >
          Edit Description
        </Button>
      </div>
    </div>
  )
}
