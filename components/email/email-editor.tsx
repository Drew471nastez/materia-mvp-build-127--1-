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
  Image,
  Link2,
  Heading1,
  Sparkles,
  ShoppingBag,
  Check,
  X,
  Mail,
  CheckCircle2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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

// Body personalization variables
const bodyVariables = [
  { id: "name", label: "Subscriber Name", placeholder: "{{name}}" },
  { id: "email", label: "Subscriber Email", placeholder: "{{email}}" },
  { id: "my_name", label: "My Name", placeholder: "{{my_name}}" },
  { id: "my_username", label: "My Username", placeholder: "{{my_username}}" },
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
  const [showPersonalizeMenu, setShowPersonalizeMenu] = useState(false)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && initialBody) {
      editorRef.current.innerHTML = initialBody
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
  }

  const insertHeading = () => {
    execCommand("formatBlock", "h2")
  }

  const insertBold = () => {
    execCommand("bold")
  }

  const insertItalic = () => {
    execCommand("italic")
  }

  const insertStrikethrough = () => {
    execCommand("strikeThrough")
  }

  const insertList = () => {
    execCommand("insertUnorderedList")
  }

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
        execCommand("insertHTML", `<a href="${fullUrl}" style="color: #6366f1; text-decoration: underline;">${linkText}</a>`)
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
        // For now, insert a placeholder - in production, you'd upload to storage
        const reader = new FileReader()
        reader.onload = () => {
          execCommand("insertHTML", `<img src="${reader.result}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />`)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const insertPersonalization = (variable: { label: string; placeholder: string }) => {
    const pillHtml = `<span contenteditable="false" style="display: inline-block; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); color: #4338ca; padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 500; margin: 0 2px; border: 1px solid #a5b4fc;">${variable.label}</span>`
    execCommand("insertHTML", pillHtml + " ")
    setShowPersonalizeMenu(false)
  }

  const insertProductLink = (product: Product) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    const productUrl = `${baseUrl}/p/${product.slug}`
    const linkHtml = `<a href="${productUrl}" style="color: #6366f1; text-decoration: underline; font-weight: 500;">${product.title}</a>`
    execCommand("insertHTML", linkHtml + " ")
    setShowProductDialog(false)
    setProductSearch("")
  }

  const getEditorContent = () => {
    return editorRef.current?.innerHTML || ""
  }

  const generatePreviewHTML = () => {
    const previewSubject = subject
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")

    let previewBody = getEditorContent()
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")
      .replace(/\{\{name\}\}/g, "Alex")
      .replace(/\{\{email\}\}/g, "alex@example.com")

    // Convert pills to their placeholder values for preview
    previewBody = previewBody.replace(/Subscriber Name/g, "Alex")
    previewBody = previewBody.replace(/Subscriber Email/g, "alex@example.com")
    previewBody = previewBody.replace(/My Name/g, sellerInfo?.name || "Your Name")
    previewBody = previewBody.replace(/My Username/g, sellerInfo?.username || "username")

    return { previewSubject, previewBody }
  }

  const generateEmailHTML = () => {
    let content = getEditorContent()
    // Replace pill HTML with actual placeholders
    content = content.replace(/<span[^>]*>Subscriber Name<\/span>/g, "{{name}}")
    content = content.replace(/<span[^>]*>Subscriber Email<\/span>/g, "{{email}}")
    content = content.replace(/<span[^>]*>My Name<\/span>/g, "{{my_name}}")
    content = content.replace(/<span[^>]*>My Username<\/span>/g, "{{my_username}}")
    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.7; color: #333;">${content}</div>`
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
  const selectAllSubscribers = () => {
    setSelectedSubscriberIds(subscribers.map((s) => s.id))
  }

  const selectPast7Days = () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const ids = subscribers
      .filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= sevenDaysAgo)
      .map((s) => s.id)
    setSelectedSubscriberIds(ids)
  }

  const selectPast30Days = () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const ids = subscribers
      .filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= thirtyDaysAgo)
      .map((s) => s.id)
    setSelectedSubscriberIds(ids)
  }

  const handleCreateSegment = async () => {
    if (!segmentName.trim() || selectedSubscriberIds.length === 0) {
      toast({
        title: "Invalid segment",
        description: "Please enter a segment name and select at least one subscriber",
        variant: "destructive",
      })
      return
    }

    const newSegment: Segment = {
      id: `custom_${Date.now()}`,
      name: segmentName,
      subscriber_ids: selectedSubscriberIds,
    }

    if (creatorId) {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("email_segments")
        .insert({
          creator_id: creatorId,
          name: segmentName,
          filters: { subscriber_ids: selectedSubscriberIds },
          subscriber_count: selectedSubscriberIds.length,
        })
        .select()
        .single()

      if (error) {
        toast({ title: "Error", description: "Failed to create segment", variant: "destructive" })
        return
      }

      if (data) {
        newSegment.id = data.id
      }
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

  const filteredProducts = products.filter(
    (p) => p.title.toLowerCase().includes(productSearch.toLowerCase())
  )

  const { previewSubject, previewBody } = generatePreviewHTML()

  const hasContent = subject.trim() && getEditorContent().trim()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 flex-shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-base sm:text-lg font-semibold text-gray-900 truncate">New Email</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button variant={previewMode === "desktop" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setPreviewMode("desktop")}>
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button variant={previewMode === "mobile" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setPreviewMode("mobile")}>
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowTestDialog(true)} disabled={!hasContent} className="h-9 px-2 sm:px-3 text-xs sm:text-sm">
                <Mail className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Test</span>
              </Button>
              <Button variant="outline" onClick={handleSave} disabled={!subject.trim() || isSaving} className="h-9 px-2 sm:px-3 text-xs sm:text-sm">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 sm:mr-1.5" />}
                <span className="hidden sm:inline">Draft</span>
              </Button>
              <Button variant="outline" onClick={() => setShowScheduleDialog(true)} disabled={!hasContent} className="h-9 px-2 sm:px-3 text-xs sm:text-sm hidden sm:flex">
                <Clock className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden md:inline">Schedule</span>
              </Button>
              <Button onClick={handleSend} disabled={!hasContent || isSending} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-3 sm:px-4 text-xs sm:text-sm">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 sm:mr-1.5" />}
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Editor Panel */}
        <div className="flex-1 flex flex-col overflow-hidden lg:border-r">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
              {/* Subject Line */}
              <div className="space-y-3">
                <Label htmlFor="email-subject" className="text-sm font-semibold text-gray-900">Email Subject</Label>
                <Input
                  id="email-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter your email subject..."
                  className="h-12 text-base border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-2">
                  {subjectVariables.map((variable) => {
                    const Icon = variable.icon
                    return (
                      <Button
                        key={variable.id}
                        variant="outline"
                        size="sm"
                        onClick={() => insertVariable(variable.placeholder)}
                        className="h-8 text-xs gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                      >
                        <Icon className="h-3.5 w-3.5" />{variable.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* Preview Text */}
              <div className="space-y-3">
                <Label htmlFor="preview-text" className="text-sm font-semibold text-gray-900">
                  Preview Text <span className="text-gray-400 font-normal text-xs">(shows in inbox preview)</span>
                </Label>
                <Input
                  id="preview-text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Brief preview shown in email clients..."
                  className="h-12 text-base border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>

              {/* Email Body Editor */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">Email Body</Label>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 p-2 sm:p-3 border-b bg-gray-50/80">
                    <Button variant="ghost" size="icon" onClick={insertHeading} className="h-9 w-9 hover:bg-gray-200" title="Heading">
                      <Heading1 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={insertBold} className="h-9 w-9 hover:bg-gray-200" title="Bold">
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={insertStrikethrough} className="h-9 w-9 hover:bg-gray-200" title="Strikethrough">
                      <Strikethrough className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={insertItalic} className="h-9 w-9 hover:bg-gray-200" title="Italic">
                      <Italic className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />
                    <Button variant="ghost" size="icon" onClick={insertList} className="h-9 w-9 hover:bg-gray-200" title="Bullet List">
                      <List className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={insertImage} className="h-9 w-9 hover:bg-gray-200" title="Insert Image">
                      <Image className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={insertLink} className="h-9 w-9 hover:bg-gray-200" title="Insert Link">
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPersonalizeMenu(!showPersonalizeMenu)}
                        className="h-9 px-3 gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span className="hidden sm:inline">+ Personalize</span>
                      </Button>
                      {showPersonalizeMenu && (
                        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg py-1 z-10 min-w-[180px]">
                          {bodyVariables.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => insertPersonalization(v)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowProductDialog(true)}
                      className="h-9 px-3 gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span className="hidden sm:inline">Add Product Link</span>
                    </Button>
                  </div>

                  {/* Editor Content Area */}
                  <div
                    ref={editorRef}
                    contentEditable
                    className="min-h-[350px] sm:min-h-[400px] p-4 sm:p-6 focus:outline-none text-base leading-relaxed prose prose-sm max-w-none"
                    style={{ wordBreak: "break-word" }}
                    onBlur={() => setShowPersonalizeMenu(false)}
                    data-placeholder="Hi {{name}}!

I'm so excited for you to take your first step on this journey.

[Insert a few lines introducing yourself and sharing your story here!]

Best,
{{my_name}}"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Use the <span className="text-indigo-600 font-medium">+ Personalize</span> button to insert dynamic fields that will be replaced with subscriber info.
                </p>
              </div>

              {/* Audience Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">Audience</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={audienceType} onValueChange={onAudienceChange}>
                    <SelectTrigger className="flex-1 h-12 border-gray-200">
                      <SelectValue placeholder="Select audience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subscribers</SelectItem>
                      <SelectItem value="store_builder">Store Builder Subscribers</SelectItem>
                      <SelectItem value="onepage">OnePage Subscribers</SelectItem>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={`segment:${segment.id}`}>{segment.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowSegmentDialog(true)} className="h-12 px-4 border-gray-200">
                    <Plus className="h-4 w-4 mr-2" />Custom Segment
                  </Button>
                </div>
              </div>

              {/* Mobile-only buttons */}
              <div className="flex sm:hidden gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowScheduleDialog(true)} disabled={!hasContent} className="flex-1 h-11">
                  <Clock className="h-4 w-4 mr-2" />Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col bg-gradient-to-b from-gray-100 to-gray-50">
          <div className="p-4 border-b bg-white/80 backdrop-blur flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Email Preview</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Button
                variant={previewMode === "desktop" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewMode("desktop")}
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={previewMode === "mobile" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewMode("mobile")}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex justify-center items-start">
            <div className={cn(
              "bg-white shadow-xl rounded-2xl overflow-hidden transition-all duration-300",
              previewMode === "mobile" ? "w-[320px]" : "w-full max-w-[460px]"
            )}>
              {/* Email Client Header */}
              <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm">
                    {sellerInfo?.avatarUrl ? (
                      <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-indigo-600">
                        {sellerInfo?.name?.charAt(0) || "Y"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{sellerInfo?.name || "Your Name"}</p>
                    <p className="text-xs text-gray-500 truncate">{previewSubject || "Email subject..."}</p>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className={cn(
                "p-4 sm:p-6",
                previewMode === "mobile" ? "p-4" : "p-6"
              )}>
                <div
                  className="prose prose-sm max-w-none text-gray-700"
                  style={{ fontSize: previewMode === "mobile" ? "14px" : "15px", lineHeight: "1.7" }}
                  dangerouslySetInnerHTML={{
                    __html: previewBody || '<span class="text-gray-400 italic">Your email content will appear here...</span>'
                  }}
                />
              </div>

              {/* Email Footer */}
              <div className={cn(
                "px-4 py-5 border-t bg-gradient-to-b from-gray-50 to-gray-100",
                previewMode === "mobile" ? "px-4 py-4" : "px-6 py-5"
              )}>
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden ring-1 ring-gray-200">
                      {sellerInfo?.avatarUrl ? (
                        <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-500">
                          {sellerInfo?.name?.charAt(0) || "Y"}
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-gray-700 font-medium">{sellerInfo?.name || "Your Name"}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    <span className="text-gray-500 font-medium">Storelib</span>
                    <span className="mx-2">·</span>
                    <span>Powered by Storelib</span>
                  </div>
                  <a href="#" className="text-xs text-gray-400 hover:text-gray-500 underline underline-offset-2" onClick={(e) => e.preventDefault()}>
                    Unsubscribe
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Email</DialogTitle>
            <DialogDescription>Choose when you want this email to be sent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={!scheduledAt || isSaving} className="bg-indigo-600 hover:bg-indigo-700">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="sm:max-w-md">
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
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-12"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
                <Button onClick={handleSendTest} disabled={!testEmail || isSendingTest} className="bg-indigo-600 hover:bg-indigo-700">
                  {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
            <DialogDescription>Add a link to your email content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Link Text</Label>
              <Input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Click here"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button onClick={confirmInsertLink} disabled={!linkUrl} className="bg-indigo-600 hover:bg-indigo-700">
              Insert Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Selector Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Product Link</DialogTitle>
            <DialogDescription>Select a product to insert a link into your email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-10 h-11"
              />
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingBag className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm">{products.length === 0 ? "No products found" : "No matching products"}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => insertProductLink(product)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left transition-colors"
                    >
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                        {product.thumbnail_url ? (
                          <img src={product.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Custom Segment</DialogTitle>
            <DialogDescription>Select subscribers to include in this segment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2">
              <Label>Segment Name</Label>
              <Input
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder="e.g., VIP Customers, Early Adopters"
                className="h-11"
              />
            </div>

            {/* Quick Select Buttons */}
            <div className="space-y-2">
              <Label className="text-sm">Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectAllSubscribers} className="h-9">
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={selectPast7Days} className="h-9">
                  Past 7 Days
                </Button>
                <Button variant="outline" size="sm" onClick={selectPast30Days} className="h-9">
                  Past 30 Days
                </Button>
                {selectedSubscriberIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSubscriberIds([])} className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50">
                    <X className="h-3.5 w-3.5 mr-1" />Clear All
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Search Subscribers</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  placeholder="Search by email or name..."
                  className="pl-10 h-11"
                />
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">
                  Subscribers
                  <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                    {selectedSubscriberIds.length} selected
                  </span>
                </Label>
              </div>
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {loadingSubscribers ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredSubscribers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <User className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm">{subscribers.length === 0 ? "No subscribers found" : "No matching subscribers"}</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredSubscribers.map((subscriber) => (
                      <label
                        key={subscriber.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition-colors",
                          selectedSubscriberIds.includes(subscriber.id) && "bg-indigo-50 hover:bg-indigo-50"
                        )}
                      >
                        <Checkbox
                          checked={selectedSubscriberIds.includes(subscriber.id)}
                          onCheckedChange={() => toggleSubscriber(subscriber.id)}
                          className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate font-medium">{subscriber.email}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            {subscriber.name && <span>{subscriber.name}</span>}
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-xs",
                              subscriber.source === "onepage" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                            )}>
                              {subscriber.source === "onepage" ? "OnePage" : "Store"}
                            </span>
                            {subscriber.subscribed_at && (
                              <span className="text-gray-400">
                                {new Date(subscriber.subscribed_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedSubscriberIds.includes(subscriber.id) && (
                          <Check className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setShowSegmentDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateSegment}
              disabled={!segmentName.trim() || selectedSubscriberIds.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Create Segment ({selectedSubscriberIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSS for placeholder */}
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
          margin: 0.5rem 0;
        }
        [contenteditable] a {
          color: #6366f1;
          text-decoration: underline;
        }
        [contenteditable] ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
      `}</style>
    </div>
  )
}
