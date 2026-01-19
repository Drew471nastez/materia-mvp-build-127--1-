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
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Upload,
  ExternalLink,
  Play,
  Pencil,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

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

export function DescriptionRichEditor({
  value,
  onChange,
  onClose,
  isMobile = false,
  textColor,
  className,
}: DescriptionRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentTextStyle, setCurrentTextStyle] = useState("Text")
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [showVideoDialog, setShowVideoDialog] = useState(false)
  const [showButtonDialog, setShowButtonDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [videoDisplayMode, setVideoDisplayMode] = useState<"embed" | "link">("embed")
  const [savedSelection, setSavedSelection] = useState<Range | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Button dialog state
  const [buttonText, setButtonText] = useState("Click me")
  const [buttonLink, setButtonLink] = useState("")
  const [buttonColor, setButtonColor] = useState("#7c3aed") // Default to purple
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff")
  const [buttonAlignment, setButtonAlignment] = useState<"left" | "center" | "right">("center")

  // Image upload ref
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && !isInitialized) {
      const htmlContent = textToHtml(value)
      editorRef.current.innerHTML = htmlContent
      setIsInitialized(true)
    }
  }, [value, isInitialized])

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
    saveContent()
  }, [saveContent])

  // Handle close with auto-save
  const handleClose = useCallback(() => {
    saveContent()
    onClose?.()
  }, [saveContent, onClose])

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

  // Execute command on the editor - single click handling
  const execCommand = useCallback((command: string, value?: string) => {
    // Use requestAnimationFrame to ensure proper event handling
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

        setShowLinkDialog(false)
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

    // For now, create a local URL. In production, this would upload to storage
    const reader = new FileReader()
    reader.onload = (event) => {
      const imageDataUrl = event.target?.result as string
      restoreSelection()
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus()
          document.execCommand("insertHTML", false, `<img src="${imageDataUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 7px;" />`)
          handleContentChange()
        }
      })
    }
    reader.readAsDataURL(file)

    // Reset input
    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
    setShowImageDialog(false)
  }, [restoreSelection, handleContentChange])

  // Insert image from URL
  const insertImage = useCallback(() => {
    restoreSelection()
    requestAnimationFrame(() => {
      if (editorRef.current && imageUrl) {
        editorRef.current.focus()
        document.execCommand("insertHTML", false, `<img src="${imageUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 7px;" />`)
        handleContentChange()
      }
    })

    setShowImageDialog(false)
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

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus()

          if (videoDisplayMode === "embed") {
            // Embed the video with responsive container
            const embedUrl = `https://www.youtube.com/embed/${videoId}`
            document.execCommand("insertHTML", false, `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 8px 0; border-radius: 7px;"><iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 7px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`)
          } else {
            // Insert as a link with thumbnail
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
            document.execCommand("insertHTML", false, `<a href="${videoUrl}" target="_blank" rel="noopener noreferrer" style="display: block; margin: 8px 0; position: relative;">
              <img src="${thumbnailUrl}" alt="YouTube Video" style="width: 100%; height: auto; border-radius: 7px;" />
              <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">
                <div style="background-color: #dc2626; border-radius: 50%; padding: 12px;">
                  <svg style="width: 24px; height: 24px; color: white;" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </a>`)
          }
          handleContentChange()
        }
      })
    }

    setShowVideoDialog(false)
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

    setShowButtonDialog(false)
    setButtonText("Click me")
    setButtonLink("")
    setButtonColor("#7c3aed") // Reset to purple
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
            setShowButtonDialog(true)
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
        "p-1.5 sm:p-2 rounded hover:bg-purple-100 transition-colors",
        active && "bg-purple-100 text-purple-700"
      )}
    >
      {children}
    </button>
  )

  const iconSize = isMobile ? "h-4 w-4" : "h-5 w-5"

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col border rounded-lg bg-white shadow-lg overflow-hidden", className)}
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
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 p-1.5 sm:p-2 border-b bg-white sticky top-0 z-10">
        {/* Text Style Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-purple-100 text-sm font-medium"
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
          title="Insert YouTube Video"
        >
          <Video className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Insert Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-purple-100 text-sm font-medium"
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <ToolbarButton onClick={() => execCommand("undo")} title="Undo">
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand("redo")} title="Redo">
          <Redo2 className={iconSize} />
        </ToolbarButton>

        {/* Close button - now with auto-save */}
        {onClose && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />
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
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2",
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2",
          "[&_p]:mb-2",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-purple-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2",
          "[&_a]:text-purple-600 [&_a]:underline",
          "[&_img]:rounded-[7px] [&_img]:max-w-full [&_img]:h-auto",
          "[&_iframe]:rounded-[7px]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:italic empty:before:pointer-events-none"
        )}
        style={{ color: textColor || "inherit" }}
        onInput={handleContentChange}
        onBlur={handleContentChange}
      />

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md mx-auto [&_button]:focus:ring-purple-500">
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
                className="focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={insertLink} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700">Insert Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Upload button */}
            <div className="space-y-2">
              <Label>Upload Image</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full h-20 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                onClick={() => imageInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-5 w-5 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Click to upload</span>
                </div>
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <p className="text-xs text-muted-foreground">Images will have a 7px border radius</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowImageDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={insertImage} disabled={!imageUrl} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300">Insert Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Dialog */}
      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Insert YouTube Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="video-url">YouTube Video URL</Label>
              <Input
                id="video-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-muted-foreground">Only YouTube URLs are supported</p>
            </div>

            <div className="space-y-3">
              <Label>Display Mode</Label>
              <RadioGroup value={videoDisplayMode} onValueChange={(v) => setVideoDisplayMode(v as "embed" | "link")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="embed" id="embed" className="text-purple-600 border-purple-600" />
                  <Label htmlFor="embed" className="flex items-center gap-2 cursor-pointer">
                    <Play className="h-4 w-4" />
                    Embed video player
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="link" id="link" className="text-purple-600 border-purple-600" />
                  <Label htmlFor="link" className="flex items-center gap-2 cursor-pointer">
                    <ExternalLink className="h-4 w-4" />
                    Show as thumbnail link
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowVideoDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={insertVideo} disabled={!videoUrl} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300">Insert Video</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Button Dialog */}
      <Dialog open={showButtonDialog} onOpenChange={setShowButtonDialog}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert Button</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="button-text">Button Text</Label>
              <Input
                id="button-text"
                placeholder="Click me"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                className="focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="button-link">Button Link (optional)</Label>
              <Input
                id="button-link"
                placeholder="https://example.com"
                value={buttonLink}
                onChange={(e) => setButtonLink(e.target.value)}
                className="focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="space-y-3">
              <Label>Alignment</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={buttonAlignment === "left" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlignment("left")}
                  className={cn("flex-1", buttonAlignment === "left" && "bg-purple-600 hover:bg-purple-700")}
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={buttonAlignment === "center" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlignment("center")}
                  className={cn("flex-1", buttonAlignment === "center" && "bg-purple-600 hover:bg-purple-700")}
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={buttonAlignment === "right" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlignment("right")}
                  className={cn("flex-1", buttonAlignment === "right" && "bg-purple-600 hover:bg-purple-700")}
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Button Color</Label>
              <div className="flex flex-wrap gap-2">
                {buttonColorPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setButtonColor(preset.value)
                      setButtonTextColor(preset.textColor)
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      buttonColor === preset.value ? "border-purple-600 scale-110 ring-2 ring-purple-300" : "border-transparent"
                    )}
                    style={{ backgroundColor: preset.value }}
                    title={preset.label}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="custom-bg-color" className="text-xs">Background</Label>
                  <Input
                    id="custom-bg-color"
                    type="color"
                    value={buttonColor}
                    onChange={(e) => setButtonColor(e.target.value)}
                    className="h-8 p-1"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="custom-text-color" className="text-xs">Text</Label>
                  <Input
                    id="custom-text-color"
                    type="color"
                    value={buttonTextColor}
                    onChange={(e) => setButtonTextColor(e.target.value)}
                    className="h-8 p-1"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className={cn(
                "p-4 border rounded-lg bg-gray-50",
                buttonAlignment === "center" ? "text-center" : buttonAlignment === "right" ? "text-right" : "text-left"
              )}>
                <span
                  className="inline-block px-6 py-3 font-medium"
                  style={{
                    backgroundColor: buttonColor,
                    color: buttonTextColor,
                    borderRadius: "8px"
                  }}
                >
                  {buttonText || "Button"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowButtonDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={insertButton} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700">Insert Button</Button>
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
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close and save
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking inside the wrapper or any dialog
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        // Check if clicked on a dialog
        const dialogs = document.querySelectorAll('[role="dialog"]')
        let clickedOnDialog = false
        dialogs.forEach(dialog => {
          if (dialog.contains(e.target as Node)) {
            clickedOnDialog = true
          }
        })

        if (!clickedOnDialog) {
          setIsEditing(false)
        }
      }
    }

    // Use mousedown for earlier detection
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing])

  if (!isEditorMode) {
    return <>{children}</>
  }

  if (isEditing) {
    return (
      <div ref={wrapperRef} className="mt-6" data-description-section>
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
            "px-2 py-1 rounded hover:bg-purple-100 hover:text-purple-700",
            "mt-1", // Align with description title
            isHovering
              ? "opacity-100 text-purple-600"
              : "opacity-70 text-gray-500"
          )}
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  )
}

// Component to render rich HTML description content
export function RichDescriptionContent({
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
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2",
        "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2",
        "[&_p]:mb-2",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2",
        "[&_a]:text-purple-600 [&_a]:underline [&_a]:hover:text-purple-700",
        "[&_img]:rounded-[7px] [&_img]:max-w-full [&_img]:h-auto",
        "[&_iframe]:rounded-[7px]",
        "[&_hr]:my-4 [&_hr]:border-gray-300",
        className
      )}
      style={{ color: textColor }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
