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
  Users,
  Loader2,
  Monitor,
  Smartphone,
  User,
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
  MousePointer2,
  Minus,
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
  isSaving?: boolean
  isSending?: boolean
  creatorId?: string
  sellerInfo?: {
    name: string
    username: string
    avatarUrl: string
  }
}

// Variable buttons removed - no longer needed in subject line

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
  const [showButtonDialog, setShowButtonDialog] = useState(false)
  const [buttonText, setButtonText] = useState("")
  const [buttonUrl, setButtonUrl] = useState("")
  const [buttonColor, setButtonColor] = useState("#2563eb")
  const [buttonAlign, setButtonAlign] = useState<"left" | "center" | "right">("center")
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [selectedButton, setSelectedButton] = useState<HTMLElement | null>(null)
  const [showButtonMenu, setShowButtonMenu] = useState(false)
  const [buttonMenuPosition, setButtonMenuPosition] = useState({ x: 0, y: 0 })
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [imageMenuPosition, setImageMenuPosition] = useState({ x: 0, y: 0 })
  const [savedSelection, setSavedSelection] = useState<Range | null>(null)

  // Email campaign filtering for segments
  const [emailCampaigns, setEmailCampaigns] = useState<{ id: string; subject: string; sent_at: string }[]>([])
  const [selectedEmailFilter, setSelectedEmailFilter] = useState<string | null>(null)
  const [loadingEmailCampaigns, setLoadingEmailCampaigns] = useState(false)

  // Timeframe filter state for segment creation
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("")

  // Parent page handles unsaved changes - just delegate to onBack
  const handleBack = () => {
    onBack()
  }

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

  // Handle click outside image/button menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showImageMenu && !(e.target as HTMLElement).closest('.image-menu')) {
        setShowImageMenu(false)
        setSelectedImage(null)
      }
      if (showButtonMenu && !(e.target as HTMLElement).closest('.button-menu')) {
        setShowButtonMenu(false)
        setSelectedButton(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showImageMenu, showButtonMenu])

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

    // Also load email campaigns for filtering
    setLoadingEmailCampaigns(true)
    const { data: campaigns } = await supabase
      .from("email_campaigns")
      .select("id, subject, sent_at")
      .eq("creator_id", creatorId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
    setEmailCampaigns(campaigns || [])
    setLoadingEmailCampaigns(false)
  }

  // Filter subscribers by email campaign engagement
  const filterByEmailCampaign = async (campaignId: string) => {
    if (!creatorId) return
    setLoadingSubscribers(true)
    const supabase = createClient()

    // Get subscriber IDs who received this email
    const { data: sends } = await supabase
      .from("email_sends")
      .select("subscriber_id")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")

    if (sends && sends.length > 0) {
      const subscriberIds = sends.map(s => s.subscriber_id).filter(Boolean)
      setSelectedSubscriberIds(subscriberIds as string[])
    }
    setSelectedEmailFilter(campaignId)
    setLoadingSubscribers(false)
  }

  // Clear email filter
  const clearEmailFilter = () => {
    setSelectedEmailFilter(null)
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

  const insertDivider = () => {
    const dividerId = `divider-${Date.now()}`
    const dividerHtml = `<div style="margin: 24px 0; text-align: center;"><hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;" /></div><p id="${dividerId}"><br></p>`
    execCommand("insertHTML", dividerHtml)
    // Move cursor to the paragraph after the divider
    setTimeout(() => {
      const newParagraph = editorRef.current?.querySelector(`#${dividerId}`)
      if (newParagraph) {
        const range = document.createRange()
        const selection = window.getSelection()
        range.setStart(newParagraph, 0)
        range.collapse(true)
        selection?.removeAllRanges()
        selection?.addRange(range)
        newParagraph.removeAttribute('id')
      }
    }, 10)
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
        execCommand("insertHTML", `<a href="${fullUrl}" style="color: #2563eb; text-decoration: underline;">${linkText}</a>`)
      } else {
        execCommand("createLink", fullUrl)
      }
    }
    setShowLinkDialog(false)
    setLinkUrl("")
    setLinkText("")
  }

  const insertImage = async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setIsUploadingImage(true)
        try {
          // Upload via API endpoint for proper bucket handling
          const formData = new FormData()
          formData.append("file", file)

          const response = await fetch("/api/email/upload-image", {
            method: "POST",
            body: formData,
          })

          const data = await response.json()

          if (!response.ok) {
            throw new Error(data.error || "Upload failed")
          }

          // Insert image with the public URL
          const imgHtml = `<img src="${data.url}" class="email-image" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; cursor: pointer;" data-size="normal" />`
          execCommand("insertHTML", imgHtml)
          toast({ title: "Image uploaded", description: "Image added to your email" })
        } catch (err) {
          console.error("Image upload error:", err)
          // Fallback to base64 if upload fails (not ideal for email but better than nothing)
          const reader = new FileReader()
          reader.onload = () => {
            const imgHtml = `<img src="${reader.result}" class="email-image" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; cursor: pointer;" data-size="normal" />`
            execCommand("insertHTML", imgHtml)
          }
          reader.readAsDataURL(file)
          toast({
            title: "Using embedded image",
            description: "Image may not display properly in all email clients",
            variant: "default"
          })
        } finally {
          setIsUploadingImage(false)
        }
      }
    }
    input.click()
  }

  // Insert CTA button - inline without popup
  const insertButton = () => {
    const buttonId = `btn-${Date.now()}`
    const buttonHtml = `
      <div style="text-align: center; margin: 20px 0;" class="email-button-wrapper" data-button-id="${buttonId}">
        <a href="#" class="email-cta-button" data-button-id="${buttonId}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; cursor: pointer;">Click to edit</a>
      </div>
    `
    execCommand("insertHTML", buttonHtml)
    // Auto-select the button for editing
    setTimeout(() => {
      const btn = editorRef.current?.querySelector(`[data-button-id="${buttonId}"]`) as HTMLElement
      if (btn) {
        selectButton(btn)
      }
    }, 100)
  }

  const selectButton = (btn: HTMLElement) => {
    setSelectedButton(btn)
    // Get current button values
    const linkEl = btn.tagName === 'A' ? btn : btn.querySelector('a')
    if (linkEl) {
      setButtonText(linkEl.textContent || "")
      setButtonUrl(linkEl.getAttribute('href') || "")
      setButtonColor(linkEl.style.backgroundColor || "#2563eb")
    }
    const wrapper = btn.closest('.email-button-wrapper') as HTMLElement
    const align = wrapper?.style.textAlign || "center"
    setButtonAlign(align as "left" | "center" | "right")

    // Use viewport coordinates for fixed positioning
    const rect = btn.getBoundingClientRect()
    setButtonMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setShowButtonMenu(true)
  }

  const updateButton = () => {
    if (selectedButton && buttonText && buttonUrl) {
      const linkEl = selectedButton.tagName === 'A' ? selectedButton : selectedButton.querySelector('a')
      const wrapper = selectedButton.closest('.email-button-wrapper') as HTMLElement

      if (linkEl) {
        const fullUrl = buttonUrl.startsWith("http") ? buttonUrl : `https://${buttonUrl}`
        linkEl.textContent = buttonText
        linkEl.setAttribute('href', fullUrl)
        linkEl.style.backgroundColor = buttonColor
      }
      if (wrapper) {
        wrapper.style.textAlign = buttonAlign
      }
      handleEditorInput()
    }
    setShowButtonMenu(false)
    setSelectedButton(null)
  }

  const deleteButton = () => {
    if (selectedButton) {
      const wrapper = selectedButton.closest('.email-button-wrapper')
      if (wrapper) {
        wrapper.remove()
      } else {
        selectedButton.remove()
      }
      handleEditorInput()
    }
    setShowButtonMenu(false)
    setSelectedButton(null)
  }

  const confirmInsertButton = () => {
    if (buttonUrl && buttonText) {
      const fullUrl = buttonUrl.startsWith("http") ? buttonUrl : `https://${buttonUrl}`
      const alignStyle = buttonAlign === "center" ? "text-align: center;" : buttonAlign === "right" ? "text-align: right;" : "text-align: left;"
      const buttonHtml = `
        <div style="${alignStyle} margin: 20px 0;">
          <a href="${fullUrl}" style="display: inline-block; background-color: ${buttonColor}; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">${buttonText}</a>
        </div>
      `
      execCommand("insertHTML", buttonHtml)
    }
    setShowButtonDialog(false)
    setButtonText("")
    setButtonUrl("")
  }

  // Handle image and button click for menu
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      e.preventDefault()
      const img = target as HTMLImageElement
      setSelectedImage(img)
      // Use viewport coordinates for fixed positioning
      const rect = img.getBoundingClientRect()
      setImageMenuPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      })
      setShowImageMenu(true)
      setShowButtonMenu(false)
      setSelectedButton(null)
    } else if (target.classList.contains('email-cta-button') || target.closest('.email-cta-button')) {
      e.preventDefault()
      const btn = target.classList.contains('email-cta-button') ? target : target.closest('.email-cta-button') as HTMLElement
      if (btn) {
        selectButton(btn)
        setShowImageMenu(false)
        setSelectedImage(null)
      }
    } else {
      setShowImageMenu(false)
      setSelectedImage(null)
      setShowButtonMenu(false)
      setSelectedButton(null)
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

    // Close dialog first
    setShowProductDialog(false)
    setProductSearch("")

    // Restore selection and insert at cursor position
    setTimeout(() => {
      editorRef.current?.focus()

      // Restore the saved selection if we have one
      if (savedSelection) {
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(savedSelection)
        }
      }

      execCommand("insertHTML", linkHtml + " ")
      setSavedSelection(null)
    }, 50)
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
    try {
      console.log("[email-editor] Sending email with audienceType:", audienceType)
      await onSend({ subject, body: generateEmailHTML(), previewText })
    } catch (error) {
      console.error("[email-editor] Send error:", error)
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "An error occurred while sending",
        variant: "destructive",
      })
    }
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
  const selectPast24Hours = () => {
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)
    setSelectedSubscriberIds(subscribers.filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= twentyFourHoursAgo).map((s) => s.id))
  }
  const selectPast48Hours = () => {
    const fortyEightHoursAgo = new Date()
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)
    setSelectedSubscriberIds(subscribers.filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= fortyEightHoursAgo).map((s) => s.id))
  }
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
  const selectLastMonth = () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    setSelectedSubscriberIds(subscribers.filter((s) => s.subscribed_at && new Date(s.subscribed_at) >= lastMonth).map((s) => s.id))
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

    onAudienceChange(`segment:${newSegment.id}`)
    setShowSegmentDialog(false)
    setSegmentName("")
    setSelectedSubscriberIds([])
    setSelectedTimeframe("")
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
              <Button variant="ghost" size="icon" onClick={handleBack} className="h-10 w-10 rounded-xl hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">New Email</h1>
                <p className="text-xs text-gray-500">Create and send your email campaign</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setShowTestDialog(true)} disabled={!hasContent} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100 cursor-pointer">
                <Mail className="h-4 w-4 mr-2" />Send Test
              </Button>
              <Button variant="ghost" onClick={handleSave} disabled={!subject.trim() || isSaving} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100 cursor-pointer">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Save Draft
              </Button>
              <Button variant="ghost" onClick={() => setShowScheduleDialog(true)} disabled={!hasContent} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100 cursor-pointer">
                <Clock className="h-4 w-4 mr-2" />Schedule
              </Button>
              <Button onClick={handleSend} disabled={!hasContent || isSending} className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm cursor-pointer">
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
                <Button variant="ghost" size="icon" onClick={insertImage} disabled={isUploadingImage} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Insert Image">
                  {isUploadingImage ? <Loader2 className="h-4 w-4 text-gray-500 animate-spin" /> : <ImageIcon className="h-4 w-4 text-gray-500" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={insertButton} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Insert Button">
                  <MousePointer2 className="h-4 w-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" onClick={insertDivider} className="h-8 w-8 rounded-lg hover:bg-gray-100" title="Insert Divider">
                  <Minus className="h-4 w-4 text-gray-500" />
                </Button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <Button variant="outline" size="sm" onClick={() => {
                    // Save the current selection before opening dialog
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      setSavedSelection(selection.getRangeAt(0).cloneRange())
                    }
                    setShowProductDialog(true)
                  }} className="h-8 px-3 rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300">
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
                    className="image-menu fixed bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex items-center gap-1 z-[100]"
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

                {/* Inline Button Edit Menu - Modern UI Dialog */}
                <Dialog open={showButtonMenu} onOpenChange={(open) => { if (!open) { setShowButtonMenu(false); setSelectedButton(null); } }}>
                  <DialogContent className="sm:max-w-[380px] p-0 rounded-2xl overflow-hidden" showCloseButton={false} onClick={(e) => e.stopPropagation()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
                    {/* Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <DialogTitle className="text-sm font-semibold text-gray-900">Edit Button</DialogTitle>
                        <button onClick={deleteButton} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                      {/* Live Preview */}
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div style={{ textAlign: buttonAlign }}>
                          <span
                            style={{
                              display: "inline-block",
                              backgroundColor: buttonColor,
                              color: "#ffffff",
                              padding: "10px 20px",
                              borderRadius: "8px",
                              fontWeight: 600,
                              fontSize: "13px",
                              maxWidth: "100%",
                              wordBreak: "break-word",
                            }}
                          >
                            {buttonText || "Button Text"}
                          </span>
                        </div>
                      </div>

                      {/* Button Text Input */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1.5">Button Text</label>
                        <Input
                          value={buttonText}
                          onChange={(e) => setButtonText(e.target.value)}
                          placeholder="Click here"
                          className="h-10 text-sm rounded-xl border-gray-200 focus:border-violet-400 focus:ring-violet-400/20"
                        />
                      </div>

                      {/* URL Input */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1.5">Link URL</label>
                        <Input
                          value={buttonUrl}
                          onChange={(e) => setButtonUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="h-10 text-sm rounded-xl border-gray-200 focus:border-violet-400 focus:ring-violet-400/20"
                        />
                      </div>

                      {/* Color Picker */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-2">Color</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1.5">
                            {["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f59e0b", "#000000"].map((color) => (
                              <button
                                key={color}
                                onClick={() => setButtonColor(color)}
                                className={cn(
                                  "w-7 h-7 rounded-lg border-2 transition-all cursor-pointer hover:scale-110",
                                  buttonColor === color ? "border-gray-900 ring-2 ring-gray-900/20 scale-110" : "border-white shadow-sm"
                                )}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <input
                            type="color"
                            value={buttonColor}
                            onChange={(e) => setButtonColor(e.target.value)}
                            className="h-9 w-9 cursor-pointer rounded-lg border border-gray-200 p-0.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <Button
                        size="sm"
                        onClick={updateButton}
                        disabled={!buttonText || !buttonUrl}
                        className="w-full h-10 rounded-xl text-sm bg-violet-600 hover:bg-violet-700 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="h-4 w-4 mr-2" />Apply Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

          </div>

          {/* Preview Panel */}
          <div className="lg:sticky lg:top-24 lg:h-fit">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <Label className="text-sm font-medium text-gray-700">Live Preview</Label>
                <div className="flex items-center gap-2">
                  <Select value={audienceType} onValueChange={onAudienceChange}>
                    <SelectTrigger className="h-9 w-auto min-w-[180px] rounded-lg border-gray-200 text-sm cursor-pointer">
                      <SelectValue placeholder="Send to..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all" className="cursor-pointer">All Subscribers</SelectItem>
                      <SelectItem value="last_24h" className="cursor-pointer">Last 24 Hours</SelectItem>
                      <SelectItem value="last_7days" className="cursor-pointer">Last 7 Days</SelectItem>
                      <SelectItem value="last_30days" className="cursor-pointer">Last Month</SelectItem>
                      <SelectItem value="last_90days" className="cursor-pointer">Last 90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-5 bg-gray-50/50 flex justify-center min-h-[500px]">
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 border border-gray-100 w-full max-w-[480px]">
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
                  <div className="p-5">
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      style={{ fontSize: "15px", lineHeight: "1.7" }}
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
                        Powered by Storelib
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

      {/* Button Dialog */}
      <Dialog open={showButtonDialog} onOpenChange={setShowButtonDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Insert Button</DialogTitle>
            <DialogDescription>Add a call-to-action button to your email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Button Text</Label>
              <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Shop Now" className="h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Button URL</Label>
              <Input value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://example.com" className="h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Button Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-gray-200"
                />
                <Input
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                  className="w-28 h-11 font-mono rounded-xl"
                  maxLength={7}
                />
                <div className="flex gap-1">
                  {["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#000000"].map((color) => (
                    <button
                      key={color}
                      onClick={() => setButtonColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        buttonColor === color ? "border-gray-900 scale-110" : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-2 block">Alignment</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={buttonAlign === "left" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlign("left")}
                  className="h-9 px-4 rounded-lg"
                >
                  <AlignLeft className="h-4 w-4 mr-1" /> Left
                </Button>
                <Button
                  type="button"
                  variant={buttonAlign === "center" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlign("center")}
                  className="h-9 px-4 rounded-lg"
                >
                  <AlignCenter className="h-4 w-4 mr-1" /> Center
                </Button>
                <Button
                  type="button"
                  variant={buttonAlign === "right" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setButtonAlign("right")}
                  className="h-9 px-4 rounded-lg"
                >
                  Right
                </Button>
              </div>
            </div>
            {/* Button Preview */}
            {buttonText && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Label className="text-xs text-gray-500 mb-2 block">Preview</Label>
                <div style={{ textAlign: buttonAlign }}>
                  <span
                    style={{
                      display: "inline-block",
                      backgroundColor: buttonColor,
                      color: "#ffffff",
                      padding: "12px 24px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                  >
                    {buttonText}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowButtonDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={confirmInsertButton} disabled={!buttonUrl || !buttonText} className="bg-blue-500 hover:bg-blue-600 rounded-xl">Insert Button</Button>
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
        [contenteditable] .email-cta-button {
          cursor: pointer !important;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        [contenteditable] .email-cta-button:hover {
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
          transform: scale(1.02);
        }
        .prose img {
          border-radius: 12px;
        }
        .prose blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: #6b7280;
          font-style: italic;
        }
      `}</style>
    </div>
  )
}
