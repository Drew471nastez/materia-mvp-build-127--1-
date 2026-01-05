"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Type,
  Image,
  Square,
  Link2,
  Minus,
  GripVertical,
  Trash2,
  Plus,
  Send,
  Clock,
  FileText,
  Loader2,
  ChevronDown,
  Monitor,
  Smartphone,
  Eye,
  Settings,
  Palette,
  LayoutTemplate,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  X,
  ChevronUp,
  Copy,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Element types
type ElementType = "header" | "text" | "image" | "button" | "divider" | "spacer" | "columns" | "social" | "footer"

interface EmailElement {
  id: string
  type: ElementType
  content: Record<string, any>
}

interface EmailTemplate {
  id: string
  name: string
  description: string
  thumbnail: string
  elements: EmailElement[]
  styles: EmailStyles
}

interface EmailStyles {
  backgroundColor: string
  contentBackgroundColor: string
  primaryColor: string
  textColor: string
  secondaryTextColor: string
  fontFamily: string
  borderRadius: number
}

// Default styles
const defaultStyles: EmailStyles = {
  backgroundColor: "#f4f4f5",
  contentBackgroundColor: "#ffffff",
  primaryColor: "#000000",
  textColor: "#1f2937",
  secondaryTextColor: "#6b7280",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  borderRadius: 8,
}

// Email templates
const emailTemplates: EmailTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch",
    thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' fill='%23f4f4f5'%3E%3Crect width='200' height='150'/%3E%3Ctext x='100' y='75' text-anchor='middle' fill='%239ca3af' font-size='14'%3EBlank%3C/text%3E%3C/svg%3E",
    elements: [],
    styles: defaultStyles,
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "Share news and updates",
    thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' fill='%23fff'%3E%3Crect width='200' height='150'/%3E%3Crect x='20' y='10' width='160' height='30' fill='%23000'/%3E%3Crect x='20' y='50' width='160' height='60' fill='%23f4f4f5'/%3E%3Crect x='60' y='120' width='80' height='20' rx='4' fill='%23000'/%3E%3C/svg%3E",
    elements: [
      {
        id: "header-1",
        type: "header",
        content: {
          logoUrl: "",
          brandName: "Your Brand",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "center",
        },
      },
      {
        id: "spacer-1",
        type: "spacer",
        content: { height: 32 },
      },
      {
        id: "text-1",
        type: "text",
        content: {
          text: "INTRODUCING",
          fontSize: 12,
          fontWeight: "600",
          color: "#6b7280",
          alignment: "center",
          letterSpacing: "0.1em",
        },
      },
      {
        id: "text-2",
        type: "text",
        content: {
          text: "Our Latest Update",
          fontSize: 32,
          fontWeight: "700",
          color: "#1f2937",
          alignment: "center",
        },
      },
      {
        id: "spacer-2",
        type: "spacer",
        content: { height: 16 },
      },
      {
        id: "text-3",
        type: "text",
        content: {
          text: "We're excited to share some important news with you. This update brings new features and improvements that we think you'll love.",
          fontSize: 16,
          fontWeight: "400",
          color: "#6b7280",
          alignment: "center",
        },
      },
      {
        id: "spacer-3",
        type: "spacer",
        content: { height: 24 },
      },
      {
        id: "button-1",
        type: "button",
        content: {
          text: "Learn More",
          url: "#",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "center",
          borderRadius: 8,
          fullWidth: false,
        },
      },
      {
        id: "spacer-4",
        type: "spacer",
        content: { height: 32 },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {
          companyName: "Your Company",
          address: "123 Main St, City, Country",
          unsubscribeText: "Unsubscribe from these emails",
          textColor: "#9ca3af",
        },
      },
    ],
    styles: defaultStyles,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Regular content updates",
    thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' fill='%23fff'%3E%3Crect width='200' height='150'/%3E%3Crect x='20' y='10' width='160' height='25' fill='%23000'/%3E%3Crect x='20' y='45' width='160' height='40' fill='%23f4f4f5'/%3E%3Crect x='20' y='95' width='75' height='45' fill='%23e5e7eb'/%3E%3Crect x='105' y='95' width='75' height='45' fill='%23e5e7eb'/%3E%3C/svg%3E",
    elements: [
      {
        id: "header-1",
        type: "header",
        content: {
          logoUrl: "",
          brandName: "Newsletter",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "center",
        },
      },
      {
        id: "spacer-1",
        type: "spacer",
        content: { height: 24 },
      },
      {
        id: "text-1",
        type: "text",
        content: {
          text: "Hello {{name}},",
          fontSize: 20,
          fontWeight: "600",
          color: "#1f2937",
          alignment: "left",
        },
      },
      {
        id: "text-2",
        type: "text",
        content: {
          text: "Here's what's new this week. We've curated the best content just for you.",
          fontSize: 16,
          fontWeight: "400",
          color: "#6b7280",
          alignment: "left",
        },
      },
      {
        id: "divider-1",
        type: "divider",
        content: { color: "#e5e7eb", style: "solid" },
      },
      {
        id: "text-3",
        type: "text",
        content: {
          text: "Featured Article",
          fontSize: 14,
          fontWeight: "600",
          color: "#6b7280",
          alignment: "left",
          letterSpacing: "0.05em",
        },
      },
      {
        id: "text-4",
        type: "text",
        content: {
          text: "The Complete Guide to Growing Your Business",
          fontSize: 24,
          fontWeight: "700",
          color: "#1f2937",
          alignment: "left",
        },
      },
      {
        id: "text-5",
        type: "text",
        content: {
          text: "Learn proven strategies that help businesses scale effectively while maintaining quality and customer satisfaction.",
          fontSize: 16,
          fontWeight: "400",
          color: "#6b7280",
          alignment: "left",
        },
      },
      {
        id: "button-1",
        type: "button",
        content: {
          text: "Read Article",
          url: "#",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "left",
          borderRadius: 8,
          fullWidth: false,
        },
      },
      {
        id: "spacer-2",
        type: "spacer",
        content: { height: 32 },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {
          companyName: "Your Company",
          address: "123 Main St, City, Country",
          unsubscribeText: "Unsubscribe from these emails",
          textColor: "#9ca3af",
        },
      },
    ],
    styles: defaultStyles,
  },
  {
    id: "product",
    name: "Product Launch",
    description: "Showcase new products",
    thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' fill='%23000'%3E%3Crect width='200' height='150'/%3E%3Crect x='40' y='20' width='120' height='70' fill='%23333'/%3E%3Ctext x='100' y='115' text-anchor='middle' fill='%23fff' font-size='12'%3ENew Product%3C/text%3E%3Crect x='60' y='125' width='80' height='15' rx='4' fill='%23fff'/%3E%3C/svg%3E",
    elements: [
      {
        id: "header-1",
        type: "header",
        content: {
          logoUrl: "",
          brandName: "Your Brand",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "center",
        },
      },
      {
        id: "image-1",
        type: "image",
        content: {
          url: "",
          alt: "Product Image",
          alignment: "center",
          width: 100,
          borderRadius: 0,
        },
      },
      {
        id: "spacer-1",
        type: "spacer",
        content: { height: 24 },
      },
      {
        id: "text-1",
        type: "text",
        content: {
          text: "Introducing",
          fontSize: 14,
          fontWeight: "600",
          color: "#6b7280",
          alignment: "center",
          letterSpacing: "0.1em",
        },
      },
      {
        id: "text-2",
        type: "text",
        content: {
          text: "Our Latest Product",
          fontSize: 36,
          fontWeight: "700",
          color: "#1f2937",
          alignment: "center",
        },
      },
      {
        id: "text-3",
        type: "text",
        content: {
          text: "Experience the next generation of innovation. Built with care, designed for you.",
          fontSize: 18,
          fontWeight: "400",
          color: "#6b7280",
          alignment: "center",
        },
      },
      {
        id: "spacer-2",
        type: "spacer",
        content: { height: 24 },
      },
      {
        id: "button-1",
        type: "button",
        content: {
          text: "Shop Now",
          url: "#",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          alignment: "center",
          borderRadius: 8,
          fullWidth: false,
        },
      },
      {
        id: "spacer-3",
        type: "spacer",
        content: { height: 32 },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {
          companyName: "Your Company",
          address: "123 Main St, City, Country",
          unsubscribeText: "Unsubscribe from these emails",
          textColor: "#9ca3af",
        },
      },
    ],
    styles: {
      ...defaultStyles,
      backgroundColor: "#000000",
      contentBackgroundColor: "#ffffff",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean and simple",
    thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' fill='%23fff'%3E%3Crect width='200' height='150'/%3E%3Crect x='40' y='30' width='120' height='10' fill='%23e5e7eb'/%3E%3Crect x='30' y='55' width='140' height='8' fill='%23f4f4f5'/%3E%3Crect x='30' y='70' width='140' height='8' fill='%23f4f4f5'/%3E%3Crect x='30' y='85' width='100' height='8' fill='%23f4f4f5'/%3E%3Crect x='70' y='110' width='60' height='20' rx='4' fill='%23000'/%3E%3C/svg%3E",
    elements: [
      {
        id: "spacer-1",
        type: "spacer",
        content: { height: 40 },
      },
      {
        id: "text-1",
        type: "text",
        content: {
          text: "Hello {{name}},",
          fontSize: 18,
          fontWeight: "500",
          color: "#1f2937",
          alignment: "left",
        },
      },
      {
        id: "spacer-2",
        type: "spacer",
        content: { height: 16 },
      },
      {
        id: "text-2",
        type: "text",
        content: {
          text: "Thank you for being part of our community. We wanted to share a quick update with you.",
          fontSize: 16,
          fontWeight: "400",
          color: "#4b5563",
          alignment: "left",
        },
      },
      {
        id: "spacer-3",
        type: "spacer",
        content: { height: 24 },
      },
      {
        id: "text-3",
        type: "text",
        content: {
          text: "Best regards,\nThe Team",
          fontSize: 16,
          fontWeight: "400",
          color: "#4b5563",
          alignment: "left",
        },
      },
      {
        id: "spacer-4",
        type: "spacer",
        content: { height: 32 },
      },
      {
        id: "divider-1",
        type: "divider",
        content: { color: "#e5e7eb", style: "solid" },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {
          companyName: "Your Company",
          address: "",
          unsubscribeText: "Unsubscribe",
          textColor: "#9ca3af",
        },
      },
    ],
    styles: defaultStyles,
  },
]

// Available elements for adding
const availableElements = [
  { type: "header" as ElementType, label: "Header", icon: LayoutTemplate },
  { type: "text" as ElementType, label: "Text", icon: Type },
  { type: "image" as ElementType, label: "Image", icon: Image },
  { type: "button" as ElementType, label: "Button", icon: Square },
  { type: "divider" as ElementType, label: "Divider", icon: Minus },
  { type: "spacer" as ElementType, label: "Spacer", icon: ChevronUp },
  { type: "social" as ElementType, label: "Social Links", icon: Link2 },
  { type: "footer" as ElementType, label: "Footer", icon: FileText },
]

interface EmailBuilderProps {
  onBack: () => void
  onSave: (data: { subject: string; body: string; previewText: string }) => Promise<void>
  onSend: (data: { subject: string; body: string; previewText: string }) => Promise<void>
  onSchedule: (data: { subject: string; body: string; previewText: string; scheduledAt: string }) => Promise<void>
  initialSubject?: string
  initialBody?: string
  initialPreviewText?: string
  audienceType: string
  onAudienceChange: (value: string) => void
  segments: Array<{ id: string; name: string }>
  isSaving?: boolean
  isSending?: boolean
}

export function EmailBuilder({
  onBack,
  onSave,
  onSend,
  onSchedule,
  initialSubject = "",
  initialBody = "",
  initialPreviewText = "",
  audienceType,
  onAudienceChange,
  segments,
  isSaving = false,
  isSending = false,
}: EmailBuilderProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [previewText, setPreviewText] = useState(initialPreviewText)
  const [elements, setElements] = useState<EmailElement[]>([])
  const [styles, setStyles] = useState<EmailStyles>(defaultStyles)
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  const [activePanel, setActivePanel] = useState<"elements" | "design" | "settings">("elements")
  const [showTemplates, setShowTemplates] = useState(true)
  const [scheduledAt, setScheduledAt] = useState("")
  const [draggedElement, setDraggedElement] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Generate HTML from elements
  const generateHTML = useCallback(() => {
    const renderElement = (element: EmailElement): string => {
      switch (element.type) {
        case "header":
          return `
            <div style="background-color: ${element.content.backgroundColor || "#000000"}; padding: 20px; text-align: ${element.content.alignment || "center"};">
              ${element.content.logoUrl ? `<img src="${element.content.logoUrl}" alt="${element.content.brandName}" style="max-height: 40px; margin-bottom: 8px;" />` : ""}
              <div style="color: ${element.content.textColor || "#ffffff"}; font-size: 18px; font-weight: 600;">${element.content.brandName || "Your Brand"}</div>
            </div>
          `
        case "text":
          return `
            <div style="padding: 8px 24px; text-align: ${element.content.alignment || "left"};">
              <p style="margin: 0; font-size: ${element.content.fontSize || 16}px; font-weight: ${element.content.fontWeight || 400}; color: ${element.content.color || styles.textColor}; line-height: 1.6; letter-spacing: ${element.content.letterSpacing || "normal"}; white-space: pre-wrap;">${element.content.text || ""}</p>
            </div>
          `
        case "image":
          return `
            <div style="padding: 8px 24px; text-align: ${element.content.alignment || "center"};">
              ${element.content.url ? `<img src="${element.content.url}" alt="${element.content.alt || ""}" style="max-width: ${element.content.width || 100}%; border-radius: ${element.content.borderRadius || 0}px;" />` : `<div style="background: #f4f4f5; padding: 40px; text-align: center; color: #9ca3af;">Image placeholder</div>`}
            </div>
          `
        case "button":
          return `
            <div style="padding: 16px 24px; text-align: ${element.content.alignment || "center"};">
              <a href="${element.content.url || "#"}" style="display: inline-block; background-color: ${element.content.backgroundColor || styles.primaryColor}; color: ${element.content.textColor || "#ffffff"}; padding: 14px 28px; border-radius: ${element.content.borderRadius || 8}px; text-decoration: none; font-weight: 600; font-size: 14px; ${element.content.fullWidth ? "display: block; text-align: center;" : ""}">${element.content.text || "Button"}</a>
            </div>
          `
        case "divider":
          return `
            <div style="padding: 16px 24px;">
              <hr style="border: none; border-top: 1px ${element.content.style || "solid"} ${element.content.color || "#e5e7eb"}; margin: 0;" />
            </div>
          `
        case "spacer":
          return `<div style="height: ${element.content.height || 24}px;"></div>`
        case "social":
          return `
            <div style="padding: 16px 24px; text-align: center;">
              ${element.content.instagram ? `<a href="${element.content.instagram}" style="display: inline-block; margin: 0 8px; color: ${styles.textColor};">Instagram</a>` : ""}
              ${element.content.twitter ? `<a href="${element.content.twitter}" style="display: inline-block; margin: 0 8px; color: ${styles.textColor};">Twitter</a>` : ""}
              ${element.content.facebook ? `<a href="${element.content.facebook}" style="display: inline-block; margin: 0 8px; color: ${styles.textColor};">Facebook</a>` : ""}
              ${element.content.linkedin ? `<a href="${element.content.linkedin}" style="display: inline-block; margin: 0 8px; color: ${styles.textColor};">LinkedIn</a>` : ""}
            </div>
          `
        case "footer":
          return `
            <div style="padding: 24px; text-align: center; color: ${element.content.textColor || "#9ca3af"}; font-size: 12px;">
              <p style="margin: 0 0 8px 0;">${element.content.companyName || "Your Company"}</p>
              ${element.content.address ? `<p style="margin: 0 0 8px 0;">${element.content.address}</p>` : ""}
              <p style="margin: 0;"><a href="{{unsubscribe_url}}" style="color: ${element.content.textColor || "#9ca3af"};">${element.content.unsubscribeText || "Unsubscribe"}</a></p>
            </div>
          `
        default:
          return ""
      }
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${styles.fontFamily}; background-color: ${styles.backgroundColor};">
  <div style="max-width: 600px; margin: 0 auto; background-color: ${styles.contentBackgroundColor};">
    ${elements.map(renderElement).join("")}
  </div>
</body>
</html>
    `.trim()

    return html
  }, [elements, styles, subject])

  // Load template
  const loadTemplate = (template: EmailTemplate) => {
    setElements(template.elements.map((el) => ({ ...el, id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })))
    setStyles(template.styles)
    setShowTemplates(false)
  }

  // Add element
  const addElement = (type: ElementType) => {
    const newElement: EmailElement = {
      id: `${type}-${Date.now()}`,
      type,
      content: getDefaultContent(type),
    }
    setElements([...elements, newElement])
    setSelectedElement(newElement.id)
  }

  // Get default content for element type
  const getDefaultContent = (type: ElementType): Record<string, any> => {
    switch (type) {
      case "header":
        return { logoUrl: "", brandName: "Your Brand", backgroundColor: "#000000", textColor: "#ffffff", alignment: "center" }
      case "text":
        return { text: "Enter your text here...", fontSize: 16, fontWeight: "400", color: styles.textColor, alignment: "left" }
      case "image":
        return { url: "", alt: "", alignment: "center", width: 100, borderRadius: 0 }
      case "button":
        return { text: "Click Here", url: "#", backgroundColor: styles.primaryColor, textColor: "#ffffff", alignment: "center", borderRadius: 8 }
      case "divider":
        return { color: "#e5e7eb", style: "solid" }
      case "spacer":
        return { height: 24 }
      case "social":
        return { instagram: "", twitter: "", facebook: "", linkedin: "" }
      case "footer":
        return { companyName: "Your Company", address: "", unsubscribeText: "Unsubscribe", textColor: "#9ca3af" }
      default:
        return {}
    }
  }

  // Update element
  const updateElement = (id: string, content: Record<string, any>) => {
    setElements(elements.map((el) => (el.id === id ? { ...el, content: { ...el.content, ...content } } : el)))
  }

  // Delete element
  const deleteElement = (id: string) => {
    setElements(elements.filter((el) => el.id !== id))
    if (selectedElement === id) setSelectedElement(null)
  }

  // Duplicate element
  const duplicateElement = (id: string) => {
    const index = elements.findIndex((el) => el.id === id)
    if (index === -1) return
    const element = elements[index]
    const newElement = { ...element, id: `${element.type}-${Date.now()}` }
    const newElements = [...elements]
    newElements.splice(index + 1, 0, newElement)
    setElements(newElements)
  }

  // Move element
  const moveElement = (id: string, direction: "up" | "down") => {
    const index = elements.findIndex((el) => el.id === id)
    if (index === -1) return
    if (direction === "up" && index === 0) return
    if (direction === "down" && index === elements.length - 1) return

    const newElements = [...elements]
    const newIndex = direction === "up" ? index - 1 : index + 1
    ;[newElements[index], newElements[newIndex]] = [newElements[newIndex], newElements[index]]
    setElements(newElements)
  }

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedElement(id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!draggedElement) return

    const draggedIndex = elements.findIndex((el) => el.id === draggedElement)
    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedElement(null)
      setDragOverIndex(null)
      return
    }

    const newElements = [...elements]
    const [removed] = newElements.splice(draggedIndex, 1)
    newElements.splice(targetIndex > draggedIndex ? targetIndex - 1 : targetIndex, 0, removed)
    setElements(newElements)
    setDraggedElement(null)
    setDragOverIndex(null)
  }

  // Handle save
  const handleSave = async () => {
    await onSave({ subject, body: generateHTML(), previewText })
  }

  // Handle send
  const handleSend = async () => {
    await onSend({ subject, body: generateHTML(), previewText })
  }

  // Handle schedule
  const handleSchedule = async () => {
    if (!scheduledAt) return
    await onSchedule({ subject, body: generateHTML(), previewText, scheduledAt })
  }

  // Get selected element
  const selectedEl = elements.find((el) => el.id === selectedElement)

  // Template selection view
  if (showTemplates) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Choose a Template</h1>
                <p className="text-sm text-gray-500">Select a template to start building your email</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {emailTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => loadTemplate(template)}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-gray-400 hover:shadow-lg transition-all"
              >
                <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center overflow-hidden">
                  <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="w-64 sm:w-80 font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* Preview toggle */}
              <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button
                  variant={previewMode === "desktop" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreviewMode("desktop")}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewMode === "mobile" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreviewMode("mobile")}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="outline" onClick={handleSave} disabled={!subject.trim() || isSaving} className="h-9">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 sm:mr-2" />}
                <span className="hidden sm:inline">Save</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!subject.trim() || isSending} className="bg-gray-900 hover:bg-gray-800 text-white h-9">
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 sm:mr-2" />}
                    <span className="hidden sm:inline">Send</span>
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSend}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => document.getElementById("schedule-input")?.focus()}>
                    <Clock className="h-4 w-4 mr-2" />
                    Schedule
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Elements/Settings */}
        <div className="w-72 bg-white border-r flex-shrink-0 flex flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b">
            <button
              onClick={() => setActivePanel("elements")}
              className={cn("flex-1 py-3 text-sm font-medium transition-colors", activePanel === "elements" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-500 hover:text-gray-700")}
            >
              <Plus className="h-4 w-4 mx-auto mb-1" />
              Add
            </button>
            <button
              onClick={() => setActivePanel("design")}
              className={cn("flex-1 py-3 text-sm font-medium transition-colors", activePanel === "design" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-500 hover:text-gray-700")}
            >
              <Palette className="h-4 w-4 mx-auto mb-1" />
              Design
            </button>
            <button
              onClick={() => setActivePanel("settings")}
              className={cn("flex-1 py-3 text-sm font-medium transition-colors", activePanel === "settings" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-500 hover:text-gray-700")}
            >
              <Settings className="h-4 w-4 mx-auto mb-1" />
              Settings
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === "elements" && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Drag or click to add</p>
                <div className="grid grid-cols-2 gap-2">
                  {availableElements.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.type}
                        onClick={() => addElement(item.type)}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-sm"
                      >
                        <Icon className="h-5 w-5 text-gray-600" />
                        <span className="text-gray-700">{item.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="pt-4">
                  <Button variant="outline" className="w-full" onClick={() => setShowTemplates(true)}>
                    <LayoutTemplate className="h-4 w-4 mr-2" />
                    Choose Template
                  </Button>
                </div>
              </div>
            )}

            {activePanel === "design" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Background Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      value={styles.backgroundColor}
                      onChange={(e) => setStyles({ ...styles, backgroundColor: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input value={styles.backgroundColor} onChange={(e) => setStyles({ ...styles, backgroundColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Content Background</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      value={styles.contentBackgroundColor}
                      onChange={(e) => setStyles({ ...styles, contentBackgroundColor: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input value={styles.contentBackgroundColor} onChange={(e) => setStyles({ ...styles, contentBackgroundColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Primary Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      value={styles.primaryColor}
                      onChange={(e) => setStyles({ ...styles, primaryColor: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input value={styles.primaryColor} onChange={(e) => setStyles({ ...styles, primaryColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Text Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      value={styles.textColor}
                      onChange={(e) => setStyles({ ...styles, textColor: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input value={styles.textColor} onChange={(e) => setStyles({ ...styles, textColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
              </div>
            )}

            {activePanel === "settings" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Preview Text</Label>
                  <Input
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Shows in inbox preview..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Audience</Label>
                  <Select value={audienceType} onValueChange={onAudienceChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select audience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subscribers</SelectItem>
                      <SelectItem value="onepage">OnePage Subscribers</SelectItem>
                      <SelectItem value="store_builder">Store Subscribers</SelectItem>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={`segment:${segment.id}`}>
                          {segment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Schedule</Label>
                  <Input
                    id="schedule-input"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-1"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  {scheduledAt && (
                    <Button variant="outline" className="w-full mt-2" onClick={handleSchedule} disabled={isSaving}>
                      <Clock className="h-4 w-4 mr-2" />
                      Schedule Send
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Email preview */}
        <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: styles.backgroundColor }}>
          <div
            className={cn("mx-auto bg-white shadow-lg transition-all", previewMode === "mobile" ? "max-w-[375px]" : "max-w-[600px]")}
            style={{ backgroundColor: styles.contentBackgroundColor }}
          >
            {elements.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 mb-2">Your email is empty</p>
                <p className="text-sm text-gray-400">Add elements from the left panel or choose a template</p>
              </div>
            ) : (
              elements.map((element, index) => (
                <div
                  key={element.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, element.id)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => {
                    setDraggedElement(null)
                    setDragOverIndex(null)
                  }}
                  onClick={() => setSelectedElement(element.id)}
                  className={cn(
                    "relative group cursor-pointer transition-all",
                    selectedElement === element.id && "ring-2 ring-blue-500",
                    dragOverIndex === index && "border-t-2 border-blue-500"
                  )}
                >
                  {/* Element toolbar */}
                  <div className={cn("absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity", selectedElement === element.id && "opacity-100")}>
                    <button className="p-1 bg-white rounded shadow hover:bg-gray-50" title="Drag to reorder">
                      <GripVertical className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                  <div className={cn("absolute -right-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity", selectedElement === element.id && "opacity-100")}>
                    <button onClick={(e) => { e.stopPropagation(); moveElement(element.id, "up") }} className="p-1 bg-white rounded shadow hover:bg-gray-50">
                      <ChevronUp className="h-4 w-4 text-gray-600" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveElement(element.id, "down") }} className="p-1 bg-white rounded shadow hover:bg-gray-50">
                      <ChevronDown className="h-4 w-4 text-gray-600" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateElement(element.id) }} className="p-1 bg-white rounded shadow hover:bg-gray-50">
                      <Copy className="h-4 w-4 text-gray-600" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteElement(element.id) }} className="p-1 bg-white rounded shadow hover:bg-red-50">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>

                  {/* Render element */}
                  <ElementPreview element={element} styles={styles} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel - Element editor */}
        {selectedEl && (
          <div className="w-80 bg-white border-l flex-shrink-0 overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-medium capitalize">{selectedEl.type} Settings</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedElement(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <ElementEditor element={selectedEl} onUpdate={(content) => updateElement(selectedEl.id, content)} styles={styles} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Element preview component
function ElementPreview({ element, styles }: { element: EmailElement; styles: EmailStyles }) {
  switch (element.type) {
    case "header":
      return (
        <div
          style={{ backgroundColor: element.content.backgroundColor, padding: "20px", textAlign: element.content.alignment }}
        >
          {element.content.logoUrl && (
            <img src={element.content.logoUrl} alt="" style={{ maxHeight: 40, marginBottom: 8 }} />
          )}
          <div style={{ color: element.content.textColor, fontSize: 18, fontWeight: 600 }}>
            {element.content.brandName}
          </div>
        </div>
      )
    case "text":
      return (
        <div style={{ padding: "8px 24px", textAlign: element.content.alignment }}>
          <p
            style={{
              margin: 0,
              fontSize: element.content.fontSize,
              fontWeight: element.content.fontWeight,
              color: element.content.color,
              lineHeight: 1.6,
              letterSpacing: element.content.letterSpacing,
              whiteSpace: "pre-wrap",
            }}
          >
            {element.content.text}
          </p>
        </div>
      )
    case "image":
      return (
        <div style={{ padding: "8px 24px", textAlign: element.content.alignment }}>
          {element.content.url ? (
            <img
              src={element.content.url}
              alt={element.content.alt}
              style={{ maxWidth: `${element.content.width}%`, borderRadius: element.content.borderRadius }}
            />
          ) : (
            <div className="bg-gray-100 p-10 text-center text-gray-400">
              <Image className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Add an image URL</p>
            </div>
          )}
        </div>
      )
    case "button":
      return (
        <div style={{ padding: "16px 24px", textAlign: element.content.alignment }}>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{
              display: element.content.fullWidth ? "block" : "inline-block",
              backgroundColor: element.content.backgroundColor,
              color: element.content.textColor,
              padding: "14px 28px",
              borderRadius: element.content.borderRadius,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {element.content.text}
          </a>
        </div>
      )
    case "divider":
      return (
        <div style={{ padding: "16px 24px" }}>
          <hr style={{ border: "none", borderTop: `1px ${element.content.style} ${element.content.color}`, margin: 0 }} />
        </div>
      )
    case "spacer":
      return <div style={{ height: element.content.height, backgroundColor: "transparent" }} />
    case "social":
      return (
        <div style={{ padding: "16px 24px", textAlign: "center" }}>
          {(element.content.instagram || element.content.twitter || element.content.facebook || element.content.linkedin) ? (
            <div className="flex justify-center gap-4">
              {element.content.instagram && <span className="text-gray-600">Instagram</span>}
              {element.content.twitter && <span className="text-gray-600">Twitter</span>}
              {element.content.facebook && <span className="text-gray-600">Facebook</span>}
              {element.content.linkedin && <span className="text-gray-600">LinkedIn</span>}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Add social links</p>
          )}
        </div>
      )
    case "footer":
      return (
        <div style={{ padding: 24, textAlign: "center", color: element.content.textColor, fontSize: 12 }}>
          <p style={{ margin: "0 0 8px 0" }}>{element.content.companyName}</p>
          {element.content.address && <p style={{ margin: "0 0 8px 0" }}>{element.content.address}</p>}
          <p style={{ margin: 0 }}>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: element.content.textColor }}>
              {element.content.unsubscribeText}
            </a>
          </p>
        </div>
      )
    default:
      return null
  }
}

// Element editor component
function ElementEditor({
  element,
  onUpdate,
  styles,
}: {
  element: EmailElement
  onUpdate: (content: Record<string, any>) => void
  styles: EmailStyles
}) {
  switch (element.type) {
    case "header":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Brand Name</Label>
            <Input
              value={element.content.brandName}
              onChange={(e) => onUpdate({ brandName: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Logo URL</Label>
            <Input
              value={element.content.logoUrl}
              onChange={(e) => onUpdate({ logoUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Background Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input
                value={element.content.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Text Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.textColor}
                onChange={(e) => onUpdate({ textColor: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input value={element.content.textColor} onChange={(e) => onUpdate({ textColor: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1 mt-1">
              {["left", "center", "right"].map((align) => (
                <Button
                  key={align}
                  variant={element.content.alignment === align ? "secondary" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onUpdate({ alignment: align })}
                >
                  {align === "left" && <AlignLeft className="h-4 w-4" />}
                  {align === "center" && <AlignCenter className="h-4 w-4" />}
                  {align === "right" && <AlignRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )
    case "text":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Text Content</Label>
            <Textarea
              value={element.content.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              rows={4}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Font Size</Label>
            <Select value={String(element.content.fontSize)} onValueChange={(v) => onUpdate({ fontSize: Number(v) })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Font Weight</Label>
            <Select value={element.content.fontWeight} onValueChange={(v) => onUpdate({ fontWeight: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="400">Regular</SelectItem>
                <SelectItem value="500">Medium</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Text Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input value={element.content.color} onChange={(e) => onUpdate({ color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1 mt-1">
              {["left", "center", "right"].map((align) => (
                <Button
                  key={align}
                  variant={element.content.alignment === align ? "secondary" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onUpdate({ alignment: align })}
                >
                  {align === "left" && <AlignLeft className="h-4 w-4" />}
                  {align === "center" && <AlignCenter className="h-4 w-4" />}
                  {align === "right" && <AlignRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )
    case "image":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Image URL</Label>
            <Input
              value={element.content.url}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Alt Text</Label>
            <Input
              value={element.content.alt}
              onChange={(e) => onUpdate({ alt: e.target.value })}
              placeholder="Image description"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Width (%)</Label>
            <Input
              type="number"
              value={element.content.width}
              onChange={(e) => onUpdate({ width: Number(e.target.value) })}
              min={10}
              max={100}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Border Radius</Label>
            <Input
              type="number"
              value={element.content.borderRadius}
              onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
              min={0}
              max={50}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1 mt-1">
              {["left", "center", "right"].map((align) => (
                <Button
                  key={align}
                  variant={element.content.alignment === align ? "secondary" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onUpdate({ alignment: align })}
                >
                  {align === "left" && <AlignLeft className="h-4 w-4" />}
                  {align === "center" && <AlignCenter className="h-4 w-4" />}
                  {align === "right" && <AlignRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )
    case "button":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Button Text</Label>
            <Input value={element.content.text} onChange={(e) => onUpdate({ text: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Link URL</Label>
            <Input
              value={element.content.url}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Background Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input
                value={element.content.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Text Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.textColor}
                onChange={(e) => onUpdate({ textColor: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input value={element.content.textColor} onChange={(e) => onUpdate({ textColor: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Border Radius</Label>
            <Input
              type="number"
              value={element.content.borderRadius}
              onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
              min={0}
              max={50}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1 mt-1">
              {["left", "center", "right"].map((align) => (
                <Button
                  key={align}
                  variant={element.content.alignment === align ? "secondary" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onUpdate({ alignment: align })}
                >
                  {align === "left" && <AlignLeft className="h-4 w-4" />}
                  {align === "center" && <AlignCenter className="h-4 w-4" />}
                  {align === "right" && <AlignRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fullWidth"
              checked={element.content.fullWidth}
              onChange={(e) => onUpdate({ fullWidth: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="fullWidth" className="text-xs">
              Full Width
            </Label>
          </div>
        </div>
      )
    case "divider":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input value={element.content.color} onChange={(e) => onUpdate({ color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Style</Label>
            <Select value={element.content.style} onValueChange={(v) => onUpdate({ style: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="dotted">Dotted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    case "spacer":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Height (px)</Label>
            <Input
              type="number"
              value={element.content.height}
              onChange={(e) => onUpdate({ height: Number(e.target.value) })}
              min={8}
              max={200}
              className="mt-1"
            />
          </div>
        </div>
      )
    case "social":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Instagram URL</Label>
            <Input
              value={element.content.instagram}
              onChange={(e) => onUpdate({ instagram: e.target.value })}
              placeholder="https://instagram.com/..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Twitter URL</Label>
            <Input
              value={element.content.twitter}
              onChange={(e) => onUpdate({ twitter: e.target.value })}
              placeholder="https://twitter.com/..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Facebook URL</Label>
            <Input
              value={element.content.facebook}
              onChange={(e) => onUpdate({ facebook: e.target.value })}
              placeholder="https://facebook.com/..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">LinkedIn URL</Label>
            <Input
              value={element.content.linkedin}
              onChange={(e) => onUpdate({ linkedin: e.target.value })}
              placeholder="https://linkedin.com/..."
              className="mt-1"
            />
          </div>
        </div>
      )
    case "footer":
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input
              value={element.content.companyName}
              onChange={(e) => onUpdate({ companyName: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input
              value={element.content.address}
              onChange={(e) => onUpdate({ address: e.target.value })}
              placeholder="123 Main St, City"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Unsubscribe Text</Label>
            <Input
              value={element.content.unsubscribeText}
              onChange={(e) => onUpdate({ unsubscribeText: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Text Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={element.content.textColor}
                onChange={(e) => onUpdate({ textColor: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input value={element.content.textColor} onChange={(e) => onUpdate({ textColor: e.target.value })} className="flex-1" />
            </div>
          </div>
        </div>
      )
    default:
      return null
  }
}
