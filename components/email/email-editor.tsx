"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Send,
  Clock,
  FileText,
  Loader2,
  Monitor,
  Smartphone,
  User,
  AtSign,
  Plus,
  Search,
  Bold,
  Italic,
  Strikethrough,
  List,
  Image as ImageIcon,
  Link2,
  Type,
  ShoppingBag,
  Check,
  X,
  Mail,
  CheckCircle2,
  Trash2,
  Maximize2,
  Minimize2,
  Square,
  AlignLeft,
  AlignCenter,
  ListOrdered,
  Quote,
  Undo,
  Redo,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Subscriber {
  id: string
  email: string
  name?: string
  source: "onepage" | "store_builder"
  status: string
  subscribed_at?: string
}

interface Segment {
  id: string
  name: string
  subscriber_ids?: string[]
}

interface Product {
  id: string
  title: string
  slug: string
  price_cents: number
  thumbnail_url?: string
}

interface EmailEditorProps {
  onBack: () => void
  onSave: (data: { subject: string; body: string; previewText: string }) => Promise<void>
  onSend: (data: { subject: string; body: string; previewText: string }) => Promise<void>
  onSchedule: (data: { subject: string; body: string; previewText: string; scheduledAt: string }) => Promise<void>
  onSendTest?: (data: { subject: string; body: string; previewText: string; testEmail: string }) => Promise<void>
  initialSubject?: string
  initialBody?: string
  initialPreviewText?: string
  audienceType: string
  onAudienceChange: (value: string) => void
  segments: Segment[]
  onSegmentsChange?: (segments: Segment[]) => void
  isSaving?: boolean
  isSending?: boolean
  creatorId?: string
  sellerInfo?: {
    name: string
    username: string
    avatarUrl: string
  }
}

// Variable buttons for subject line - only My Name and My Username
const subjectVariables = [
  { id: "my_name", label: "My Name", icon: User, placeholder: "{{my_name}}" },
  { id: "my_username", label: "My Username", icon: AtSign, placeholder: "{{my_username}}" },
]

export function EmailEditor({
  onBack,
  onSave,
  onSend,
  onSchedule,
  onSendTest,
  initialSubject = "",
  initialBody = "",
  initialPreviewText = "",
  audienceType,
  onAudienceChange,
  segments,
  onSegmentsChange,
  isSaving = false,
  isSending = false,
  creatorId,
  sellerInfo,
}: EmailEditorProps) {
  const { toast } = useToast()
  const editorRef = useRef<HTMLDivElement>(null)
  const [subject, setSubject] = useState(initialSubject)
  const [previewText, setPreviewText] = useState(initialPreviewText)
  const [editorContent, setEditorContent] = useState("")
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  const [scheduledAt, setScheduledAt] = useState("")
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testEmailSent, setTestEmailSent] = useState(false)
  const [showSegmentDialog, setShowSegmentDialog] = useState(false)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [selectedSubscriberIds, setSelectedSubscriberIds] = useState<string[]>([])
  const [segmentName, setSegmentName] = useState("")
  const [subscriberSearch, setSubscriberSearch] = useState("")
  const [loadingSubscribers, setLoadingSubscribers] = useState(false)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [imageMenuPosition, setImageMenuPosition] = useState({ x: 0, y: 0 })

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && initialBody) {
      editorRef.current.innerHTML = initialBody
      setEditorContent(initialBody)
    }
  }, [])

  // Real-time content sync
  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      setEditorContent(editorRef.current.innerHTML)
    }
  }, [])

  useEffect(() => {
    if (showSegmentDialog && creatorId) {
      loadSubscribers()
    }
  }, [showSegmentDialog, creatorId])

  useEffect(() => {
    if (showProductDialog && creatorId) {
      loadProducts()
    }
  }, [showProductDialog, creatorId])

  // Handle click outside image menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showImageMenu && !(e.target as HTMLElement).closest('.image-menu')) {
        setShowImageMenu(false)
        setSelectedImage(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showImageMenu])

  const loadSubscribers = async () => {
    if (!creatorId) return
    setLoadingSubscribers(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("subscribers")
      .select("id, email, name, source, status, subscribed_at")
      .eq("creator_id", creatorId)
      .eq("status", "subscribed")
      .order("subscribed_at", { ascending: false })
    setSubscribers(data || [])
    setLoadingSubscribers(false)
  }

  const loadProducts = async () => {
    if (!creatorId) return
    setLoadingProducts(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("products")
      .select("id, title, slug, price_cents, thumbnail_url")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("title")
    setProducts(data || [])
    setLoadingProducts(false)
  }

  const insertVariable = (placeholder: string) => {
    const input = document.getElementById("email-subject") as HTMLInputElement
    if (input) {
      const start = input.selectionStart || 0
      const end = input.selectionEnd || 0
      const newValue = subject.slice(0, start) + placeholder + subject.slice(end)
      setSubject(newValue)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + placeholder.length, start + placeholder.length)
      }, 0)
    } else {
      setSubject(subject + placeholder)
    }
  }

  // Rich text editor commands
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleEditorInput()
  }

  const insertHeading = () => execCommand("formatBlock", "h2")
  const insertBold = () => execCommand("bold")
  const insertItalic = () => execCommand("italic")
  const insertStrikethrough = () => execCommand("strikeThrough")
  const insertList = () => execCommand("insertUnorderedList")
  const insertOrderedList = () => execCommand("insertOrderedList")
  const insertQuote = () => execCommand("formatBlock", "blockquote")
  const alignLeft = () => execCommand("justifyLeft")
  const alignCenter = () => execCommand("justifyCenter")
  const undoAction = () => execCommand("undo")
  const redoAction = () => execCommand("redo")

  const insertLink = () => {
    const selection = window.getSelection()
    if (selection && selection.toString()) {
      setLinkText(selection.toString())
    }
    setShowLinkDialog(true)
  }

  const confirmInsertLink = () => {
    if (linkUrl) {
      const fullUrl = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`
      if (linkText) {
        execCommand("insertHTML", `<a href="${fullUrl}" style="color: #2563eb; text-decoration: underline;">${linkText}</a>`)
      } else {
        execCommand("createLink", fullUrl)
      }
    }
    setShowLinkDialog(false)
    setLinkUrl("")
    setLinkText("")
  }

  const insertImage = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => {
          const imgHtml = `<img src="${reader.result}" class="email-image" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; cursor: pointer;" data-size="normal" />`
          execCommand("insertHTML", imgHtml)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  // Handle image click for menu
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      e.preventDefault()
      const img = target as HTMLImageElement
      setSelectedImage(img)
      const rect = img.getBoundingClientRect()
      const editorRect = editorRef.current?.getBoundingClientRect()
      if (editorRect) {
        setImageMenuPosition({
          x: rect.left - editorRect.left + rect.width / 2,
          y: rect.top - editorRect.top - 10
        })
      }
      setShowImageMenu(true)
    } else {
      setShowImageMenu(false)
      setSelectedImage(null)
    }
  }

  const resizeImage = (size: 'small' | 'medium' | 'large' | 'normal') => {
    if (selectedImage) {
      const sizes = {
        small: '200px',
        medium: '350px',
        large: '500px',
        normal: '100%'
      }
      selectedImage.style.maxWidth = sizes[size]
      selectedImage.setAttribute('data-size', size)
      handleEditorInput()
    }
    setShowImageMenu(false)
  }

  const deleteImage = () => {
    if (selectedImage) {
      selectedImage.remove()
      handleEditorInput()
    }
    setShowImageMenu(false)
    setSelectedImage(null)
  }

  const insertProductLink = (product: Product) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    const productUrl = `${baseUrl}/p/${product.slug}`
    const linkHtml = `<a href="${productUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${product.title}</a>`
    execCommand("insertHTML", linkHtml + " ")
    setShowProductDialog(false)
    setProductSearch("")
  }

  const getEditorContent = () => {
    return editorRef.current?.innerHTML || editorContent
  }

  const generatePreviewHTML = useCallback(() => {
    const previewSubject = subject
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")

    let previewBody = (editorRef.current?.innerHTML || editorContent)
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")
      .replace(/\{\{name\}\}/g, "Alex")
      .replace(/\{\{email\}\}/g, "alex@example.com")

    return { previewSubject, previewBody }
  }, [subject, editorContent, sellerInfo])

  const generateEmailHTML = () => {
    let content = getEditorContent()
    content = content.replace(/<span[^>]*>Subscriber Name<\/span>/g, "{{name}}")
    content = content.replace(/<span[^>]*>Subscriber Email<\/span>/g, "{{email}}")
    content = content.replace(/<span[^>]*>My Name<\/span>/g, "{{my_name}}")
    content = content.replace(/<span[^>]*>My Username<\/span>/g, "{{my_username}}")
    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.7; color: #374151;">${content}</div>`
  }

  const handleSave = async () => {
    await onSave({ subject, body: generateEmailHTML(), previewText })
  }

  const handleSend = async () => {
    await onSend({ subject, body: generateEmailHTML(), previewText })
  }

  const handleSchedule = async () => {
    if (!scheduledAt) return
    await onSchedule({ subject, body: generateEmailHTML(), previewText, scheduledAt })
    setShowScheduleDialog(false)
  }

  const handleSendTest = async () => {
    if (!testEmail || !onSendTest) return
    setIsSendingTest(true)
    try {
      await onSendTest({ subject, body: generateEmailHTML(), previewText, testEmail })
      setTestEmailSent(true)
      setTimeout(() => {
        setShowTestDialog(false)
        setTestEmail("")
        setTestEmailSent(false)
      }, 2500)
    } finally {
      setIsSendingTest(false)
    }
  }

  // Segment quick select functions
  const selectAllSubscribers = () => setSelectedSubscriberIds(subscribers.map((s) => s.id))
  const selectPast7Days = () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    setSelectedSubscriberIds(subscribers.filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= sevenDaysAgo).map((s) => s.id))
  }
  const selectPast30Days = () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    setSelectedSubscriberIds(subscribers.filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= thirtyDaysAgo).map((s) => s.id))
  }

  const handleCreateSegment = async () => {
    if (!segmentName.trim() || selectedSubscriberIds.length === 0) {
      toast({ title: "Invalid segment", description: "Please enter a segment name and select at least one subscriber", variant: "destructive" })
      return
    }

    const newSegment: Segment = { id: `custom_${Date.now()}`, name: segmentName, subscriber_ids: selectedSubscriberIds }

    if (creatorId) {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("email_segments")
        .insert({ creator_id: creatorId, name: segmentName, filters: { subscriber_ids: selectedSubscriberIds }, subscriber_count: selectedSubscriberIds.length })
        .select()
        .single()

      if (error) {
        toast({ title: "Error", description: "Failed to create segment", variant: "destructive" })
        return
      }
      if (data) newSegment.id = data.id
    }

    onSegmentsChange?.([...segments, newSegment])
    onAudienceChange(`segment:${newSegment.id}`)
    setShowSegmentDialog(false)
    setSegmentName("")
    setSelectedSubscriberIds([])
    toast({ title: "Segment created", description: `Created segment "${segmentName}" with ${selectedSubscriberIds.length} subscribers` })
  }

  const toggleSubscriber = (id: string) => {
    setSelectedSubscriberIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  const filteredSubscribers = subscribers.filter(
    (s) => s.email.toLowerCase().includes(subscriberSearch.toLowerCase()) || (s.name && s.name.toLowerCase().includes(subscriberSearch.toLowerCase()))
  )

  const filteredProducts = products.filter((p) => p.title.toLowerCase().includes(productSearch.toLowerCase()))

  const { previewSubject, previewBody } = generatePreviewHTML()
  const hasContent = subject.trim() && getEditorContent().trim()

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 rounded-xl hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">New Email</h1>
                <p className="text-xs text-gray-500">Create and send your email campaign</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setShowTestDialog(true)} disabled={!hasContent} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100">
                <Mail className="h-4 w-4 mr-2" />Send Test
              </Button>
              <Button variant="ghost" onClick={handleSave} disabled={!subject.trim() || isSaving} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Save Draft
              </Button>
              <Button variant="ghost" onClick={() => setShowScheduleDialog(true)} disabled={!hasContent} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100">
                <Clock className="h-4 w-4 mr-2" />Schedule
              </Button>
              <Button onClick={handleSend} disabled={!hasContent || isSending} className="h-10 px-5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-sm">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}Send Email
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor Panel */}
          <div className="space-y-5">
            {/* Subject Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <Label className="text-sm font-medium text-gray-700 mb-3 block">Subject Line</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's your email about?"
                className="h-12 text-base rounded-xl border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
              <div className="flex gap-2 mt-3">
                {subjectVariables.map((variable) => {
                  const Icon = variable.icon
                  return (
                    <Button key={variable.id} variant="outline" size="sm" onClick={() => insertVariable(variable.placeholder)} className="h-8 rounded-lg border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300">
                      <Icon className="h-3.5 w-3.5 mr-1.5" />{variable.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Preview Text Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Preview Text <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Brief text shown in inbox preview..."
                className="h-12 text-base rounded-xl border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>

            {/* Email Body Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <Label className="text-sm font-medium text-gray-700">Email Content</Label>
              </div>

              {/* Rich Text Toolbar */}
              <div className="flex flex-wrap items-center gap-1 px-4 py-2.5 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-0.5 mr-2">
                  <Button variant="ghost" size="icon" onClick={undoAction} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Undo">
                    <Undo className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={redoAction} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Redo">
                    <Redo className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="ghost" size="icon" onClick={insertHeading} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Heading">
                  <Type className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertBold} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Bold">
                  <Bold className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertItalic} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Italic">
                  <Italic className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertStrikethrough} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Strikethrough">
                  <Strikethrough className="h-4 w-4 text-gray-500" />
                </Button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="ghost" size="icon" onClick={alignLeft} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Align Left">
                  <AlignLeft className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={alignCenter} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Align Center">
                  <AlignCenter className="h-4 w-4 text-gray-500" />
                </Button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="ghost" size="icon" onClick={insertList} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Bullet List">
                  <List className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertOrderedList} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Numbered List">
                  <ListOrdered className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertQuote} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Quote">
                  <Quote className="h-4 w-4 text-gray-500" />
                </Button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="ghost" size="icon" onClick={insertLink} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Insert Link">
                  <Link2 className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertImage} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Insert Image">
                  <ImageIcon className="h-4 w-4 text-gray-500" />
                </Button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="outline" size="sm" onClick={() => setShowProductDialog(true)} className="h-8 px-3 rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300">
                  <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />Product Link
                </Button>
              </div>

              {/* Editor Area */}
              <div className="relative">
                <div
                  ref={editorRef}
                  contentEditable
                  className="min-h-[400px] p-6 focus:outline-none text-base leading-relaxed text-gray-700"
                  style={{ wordBreak: "break-word" }}
                  onInput={handleEditorInput}
                  onClick={handleEditorClick}
                  data-placeholder="Start writing your email...

Use the toolbar above to format your text, add images, or insert product links.

Tips:
• Keep your message clear and concise
• Add a clear call-to-action
• Personalize with subscriber names"
                />

                {/* Image Edit Menu */}
                {showImageMenu && selectedImage && (
                  <div
                    className="image-menu absolute bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex items-center gap-1 z-10"
                    style={{ left: imageMenuPosition.x, top: imageMenuPosition.y, transform: 'translate(-50%, -100%)' }}
                  >
                    <Button variant="ghost" size="sm" onClick={() => resizeImage('small')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs">
                      <Minimize2 className="h-3.5 w-3.5 mr-1" />Small
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resizeImage('medium')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs">
                      <Square className="h-3.5 w-3.5 mr-1" />Medium
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resizeImage('large')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs">
                      <Maximize2 className="h-3.5 w-3.5 mr-1" />Large
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resizeImage('normal')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs">
                      Full
                    </Button>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <Button variant="ghost" size="sm" onClick={deleteImage} className="h-8 px-2 rounded-lg hover:bg-red-50 text-red-500 text-xs">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Audience Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <Label className="text-sm font-medium text-gray-700 mb-3 block">Send To</Label>
              <div className="flex gap-3">
                <Select value={audienceType} onValueChange={onAudienceChange}>
                  <SelectTrigger className="flex-1 h-12 rounded-xl border-gray-200">
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Subscribers</SelectItem>
                    <SelectItem value="store_builder">Store Builder Subscribers</SelectItem>
                    <SelectItem value="onepage">OnePage Subscribers</SelectItem>
                    {segments.map((segment) => (
                      <SelectItem key={segment.id} value={`segment:${segment.id}`}>{segment.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setShowSegmentDialog(true)} className="h-12 px-4 rounded-xl border-gray-200 hover:bg-gray-50">
                  <Plus className="h-4 w-4 mr-2" />Custom
                </Button>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:sticky lg:top-24 lg:h-fit">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <Label className="text-sm font-medium text-gray-700">Live Preview</Label>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <Button
                    variant={previewMode === "desktop" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-7 px-3 rounded-md text-xs", previewMode === "desktop" ? "bg-white shadow-sm" : "")}
                    onClick={() => setPreviewMode("desktop")}
                  >
                    <Monitor className="h-3.5 w-3.5 mr-1.5" />Desktop
                  </Button>
                  <Button
                    variant={previewMode === "mobile" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-7 px-3 rounded-md text-xs", previewMode === "mobile" ? "bg-white shadow-sm" : "")}
                    onClick={() => setPreviewMode("mobile")}
                  >
                    <Smartphone className="h-3.5 w-3.5 mr-1.5" />Mobile
                  </Button>
                </div>
              </div>

              <div className="p-5 bg-gray-50/50 flex justify-center min-h-[500px]">
                <div className={cn(
                  "bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 border border-gray-100",
                  previewMode === "mobile" ? "w-[320px]" : "w-full max-w-[480px]"
                )}>
                  {/* Email Header Preview */}
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center overflow-hidden">
                        {sellerInfo?.avatarUrl ? (
                          <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-blue-600">{sellerInfo?.name?.charAt(0) || "Y"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{sellerInfo?.name || "Your Name"}</p>
                        <p className="text-xs text-gray-500 truncate">{previewSubject || "Email subject..."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Email Body Preview */}
                  <div className={cn("p-5", previewMode === "mobile" ? "p-4" : "p-5")}>
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      style={{ fontSize: previewMode === "mobile" ? "14px" : "15px", lineHeight: "1.7" }}
                      dangerouslySetInnerHTML={{
                        __html: previewBody || '<span class="text-gray-400 italic">Your email content will appear here...</span>'
                      }}
                    />
                  </div>

                  {/* Email Footer Preview */}
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/80">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
                          {sellerInfo?.avatarUrl ? (
                            <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-500">
                              {sellerInfo?.name?.charAt(0) || "Y"}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-600 font-medium">{sellerInfo?.name || "Your Name"}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        <span className="text-gray-500">Storelib</span>
                        <span className="mx-1.5">·</span>
                        <span>Powered by Storelib</span>
                      </div>
                      <a href="#" className="text-xs text-gray-400 hover:text-gray-500 underline" onClick={(e) => e.preventDefault()}>
                        Unsubscribe
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Schedule Email</DialogTitle>
            <DialogDescription>Choose when you want this email to be sent.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm text-gray-600 mb-2 block">Date & Time</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="h-12 rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSchedule} disabled={!scheduledAt || isSaving} className="bg-blue-500 hover:bg-blue-600 rounded-xl">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>Send a test email to preview how it will look.</DialogDescription>
          </DialogHeader>
          {testEmailSent ? (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">Test email sent!</p>
                <p className="text-sm text-gray-500 mt-1">Check your inbox at {testEmail}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="py-4">
                <Label className="text-sm text-gray-600 mb-2 block">Email Address</Label>
                <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com" className="h-12 rounded-xl" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowTestDialog(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={handleSendTest} disabled={!testEmail || isSendingTest} className="bg-blue-500 hover:bg-blue-600 rounded-xl">
                  {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}Send Test
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
            <DialogDescription>Add a link to your email content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Link Text</Label>
              <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Click here" className="h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" className="h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={confirmInsertLink} disabled={!linkUrl} className="bg-blue-500 hover:bg-blue-600 rounded-xl">Insert Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Selector Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Product Link</DialogTitle>
            <DialogDescription>Select a product to insert a link into your email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products..." className="pl-10 h-11 rounded-xl" />
            </div>
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 min-h-0">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingBag className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm">{products.length === 0 ? "No products found" : "No matching products"}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredProducts.map((product) => (
                    <button key={product.id} onClick={() => insertProductLink(product)} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                        {product.thumbnail_url ? <img src={product.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-5 w-5 text-gray-400" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                        <p className="text-xs text-gray-500">${(product.price_cents / 100).toFixed(2)}</p>
                      </div>
                      <Link2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Segment Dialog */}
      <Dialog open={showSegmentDialog} onOpenChange={setShowSegmentDialog}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Segment</DialogTitle>
            <DialogDescription>Select subscribers to include in this segment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Segment Name</Label>
              <Input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g., VIP Customers" className="h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectAllSubscribers} className="h-8 rounded-lg">Select All</Button>
                <Button variant="outline" size="sm" onClick={selectPast7Days} className="h-8 rounded-lg">Past 7 Days</Button>
                <Button variant="outline" size="sm" onClick={selectPast30Days} className="h-8 rounded-lg">Past 30 Days</Button>
                {selectedSubscriberIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSubscriberIds([])} className="h-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50">
                    <X className="h-3.5 w-3.5 mr-1" />Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={subscriberSearch} onChange={(e) => setSubscriberSearch(e.target.value)} placeholder="Search subscribers..." className="pl-10 h-11 rounded-xl" />
            </div>
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 min-h-0">
              {loadingSubscribers ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : filteredSubscribers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <User className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm">{subscribers.length === 0 ? "No subscribers found" : "No matching subscribers"}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredSubscribers.map((subscriber) => (
                    <label key={subscriber.id} className={cn("flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition-colors", selectedSubscriberIds.includes(subscriber.id) && "bg-blue-50 hover:bg-blue-50")}>
                      <Checkbox checked={selectedSubscriberIds.includes(subscriber.id)} onCheckedChange={() => toggleSubscriber(subscriber.id)} className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate font-medium">{subscriber.email}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          {subscriber.name && <span>{subscriber.name}</span>}
                          <span className={cn("px-1.5 py-0.5 rounded-full text-xs", subscriber.source === "onepage" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
                            {subscriber.source === "onepage" ? "OnePage" : "Store"}
                          </span>
                        </div>
                      </div>
                      {selectedSubscriberIds.includes(subscriber.id) && <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={() => setShowSegmentDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleCreateSegment} disabled={!segmentName.trim() || selectedSubscriberIds.length === 0} className="bg-blue-500 hover:bg-blue-600 rounded-xl">
              Create Segment ({selectedSubscriberIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSS for placeholder and editor styles */}
      <style jsx global>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          display: block;
          white-space: pre-wrap;
        }
        [contenteditable] h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.75rem 0;
          color: #1f2937;
        }
        [contenteditable] a {
          color: #2563eb;
          text-decoration: underline;
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 1.5rem;
          margin: 0.75rem 0;
        }
        [contenteditable] li {
          margin-bottom: 0.25rem;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          cursor: pointer;
          transition: box-shadow 0.2s;
        }
        [contenteditable] img:hover {
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }
        [contenteditable] blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: #6b7280;
          font-style: italic;
        }
        .prose img {
          border-radius: 12px;
        }
      `}</style>
    </div>
  )
}
