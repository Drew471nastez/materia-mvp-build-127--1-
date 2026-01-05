"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Plus,
  Send,
  Clock,
  FileText,
  Users,
  Mail,
  Calendar,
  Eye,
  Trash2,
  MoreHorizontal,
  Search,
  Link2,
  Store,
  Loader2,
  ArrowLeft,
  ChevronDown,
  BarChart3,
  MousePointerClick,
  Check,
  X,
  Copy,
  Layout,
  Code,
  Sparkles,
  GripVertical,
  Type,
  ImageIcon,
  Square,
  Minus,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type TabType = "published" | "scheduled" | "drafts" | "subscribers"
type ViewType = "list" | "editor" | "analytics"
type EditorMode = "template" | "builder" | "code"

interface EmailCampaign {
  id: string
  subject: string
  body: string
  preview_text?: string
  status: "draft" | "scheduled" | "sending" | "sent" | "failed"
  audience_type: string
  audience_count: number
  segment_id?: string
  scheduled_at?: string
  sent_at?: string
  created_at: string
  from_name?: string
  reply_to?: string
  template_id?: string
}

interface Subscriber {
  id: string
  email: string
  name?: string
  source: "onepage" | "store_builder"
  source_id?: string
  subscribed_at: string
  status: string
  is_active: boolean
  tags?: string[]
}

interface EmailSegment {
  id: string
  name: string
  description?: string
  filters: Record<string, any>
  subscriber_count: number
}

interface CampaignStats {
  total_sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  open_rate: number
  click_rate: number
}

interface EmailBlock {
  id: string
  type: "text" | "image" | "button" | "divider" | "spacer"
  content: string
  styles?: Record<string, string>
}

const EMAIL_TEMPLATES = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean and simple design",
    thumbnail: "/minimal-email-template.png",
    body: `<p>Hi {{name}},</p>
<p>Your message here...</p>
<p>Best regards</p>`,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Perfect for updates and news",
    thumbnail: "/newsletter-email-template.png",
    body: `<h2 style="color: #333; margin-bottom: 16px;">Weekly Update</h2>
<p>Hi {{name}},</p>
<p>Here's what's new this week:</p>
<ul>
<li>Update 1</li>
<li>Update 2</li>
<li>Update 3</li>
</ul>
<p>Thanks for being part of our community!</p>`,
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "Big news and launches",
    thumbnail: "/announcement-email-template.png",
    body: `<div style="text-align: center; padding: 20px;">
<h1 style="color: #333; font-size: 28px; margin-bottom: 16px;">Big Announcement!</h1>
<p style="font-size: 18px; color: #666;">Hi {{name}},</p>
<p style="font-size: 16px; color: #666; max-width: 400px; margin: 0 auto;">We're excited to share something special with you...</p>
<a href="#" style="display: inline-block; background: #333; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-top: 24px;">Learn More</a>
</div>`,
  },
  {
    id: "product",
    name: "Product Launch",
    description: "Showcase your new product",
    thumbnail: "/product-launch-email-template.png",
    body: `<div style="text-align: center;">
<img src="/modern-tech-product.png" alt="Product" style="max-width: 100%; border-radius: 12px; margin-bottom: 20px;" />
<h2 style="color: #333; margin-bottom: 8px;">Introducing Our Latest Product</h2>
<p style="color: #666; margin-bottom: 20px;">Hi {{name}}, check out what we've been working on!</p>
<a href="#" style="display: inline-block; background: #333; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none;">Shop Now</a>
</div>`,
  },
]

const tabs = [
  { id: "published" as const, label: "Sent", icon: Send },
  { id: "scheduled" as const, label: "Scheduled", icon: Clock },
  { id: "drafts" as const, label: "Drafts", icon: FileText },
  { id: "subscribers" as const, label: "Subscribers", icon: Users },
]

export default function EmailsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("subscribers")
  const [view, setView] = useState<ViewType>("list")
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [segments, setSegments] = useState<EmailSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const { toast } = useToast()

  // Editor state
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>("template")
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [previewText, setPreviewText] = useState("")
  const [audienceType, setAudienceType] = useState("all")
  const [selectedSegment, setSelectedSegment] = useState<string>("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const [emailBlocks, setEmailBlocks] = useState<EmailBlock[]>([
    { id: "1", type: "text", content: "<p>Hi {{name}},</p><p>Your message here...</p>" },
  ])
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null)

  // Analytics state
  const [selectedCampaignStats, setSelectedCampaignStats] = useState<CampaignStats | null>(null)
  const [selectedCampaignForStats, setSelectedCampaignForStats] = useState<EmailCampaign | null>(null)

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "campaign" | "subscriber"; id: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

    if (!creator) {
      setLoading(false)
      return
    }

    setCreatorId(creator.id)

    // Load segments for audience selection
    const { data: segmentsData } = await supabase
      .from("email_segments")
      .select("*")
      .eq("creator_id", creator.id)
      .order("name")

    setSegments(segmentsData || [])

    if (activeTab === "subscribers") {
      const { data } = await supabase
        .from("subscribers")
        .select("*")
        .eq("creator_id", creator.id)
        .order("subscribed_at", { ascending: false })

      setSubscribers(data || [])
    } else {
      const statusMap: Record<string, string[]> = {
        published: ["sent"],
        scheduled: ["scheduled"],
        drafts: ["draft"],
      }

      const { data } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("creator_id", creator.id)
        .in("status", statusMap[activeTab] || ["draft"])
        .order("created_at", { ascending: false })

      setCampaigns(data || [])
    }

    setLoading(false)
  }

  const handleNewEmail = () => {
    setEditingCampaign(null)
    setSubject("")
    setBody("")
    setPreviewText("")
    setAudienceType("all")
    setSelectedSegment("")
    setScheduledAt("")
    setSelectedTemplate("")
    setEditorMode("template")
    setEmailBlocks([{ id: "1", type: "text", content: "<p>Hi {{name}},</p><p>Your message here...</p>" }])
    setView("editor")
  }

  const handleEditCampaign = (campaign: EmailCampaign) => {
    setEditingCampaign(campaign)
    setSubject(campaign.subject)
    setBody(campaign.body)
    setPreviewText(campaign.preview_text || "")
    setAudienceType(campaign.audience_type)
    setSelectedSegment(campaign.segment_id || "")
    setScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : "")
    setEditorMode("code")
    setView("editor")
  }

  const handleSelectTemplate = (templateId: string) => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === templateId)
    if (template) {
      setSelectedTemplate(templateId)
      setBody(template.body)
      setEditorMode("code")
    }
  }

  const addBlock = (type: EmailBlock["type"]) => {
    const newBlock: EmailBlock = {
      id: Date.now().toString(),
      type,
      content:
        type === "text"
          ? "<p>New text block</p>"
          : type === "image"
            ? "/email-icon.png"
            : type === "button"
              ? "Click Here"
              : type === "divider"
                ? ""
                : "",
      styles:
        type === "button" ? { backgroundColor: "#333", color: "#fff", padding: "12px 24px", borderRadius: "8px" } : {},
    }
    setEmailBlocks([...emailBlocks, newBlock])
  }

  const updateBlock = (id: string, content: string) => {
    setEmailBlocks((blocks) => blocks.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  const removeBlock = (id: string) => {
    setEmailBlocks((blocks) => blocks.filter((b) => b.id !== id))
  }

  const moveBlock = (fromIndex: number, toIndex: number) => {
    const newBlocks = [...emailBlocks]
    const [removed] = newBlocks.splice(fromIndex, 1)
    newBlocks.splice(toIndex, 0, removed)
    setEmailBlocks(newBlocks)
  }

  const buildBodyFromBlocks = useCallback(() => {
    return emailBlocks
      .map((block) => {
        switch (block.type) {
          case "text":
            return block.content
          case "image":
            return `<img src="${block.content}" alt="Image" style="max-width: 100%; border-radius: 8px; margin: 16px 0;" />`
          case "button":
            return `<a href="#" style="display: inline-block; background: ${block.styles?.backgroundColor || "#333"}; color: ${block.styles?.color || "#fff"}; padding: ${block.styles?.padding || "12px 24px"}; border-radius: ${block.styles?.borderRadius || "8px"}; text-decoration: none; margin: 16px 0;">${block.content}</a>`
          case "divider":
            return `<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />`
          case "spacer":
            return `<div style="height: 32px;"></div>`
          default:
            return ""
        }
      })
      .join("\n")
  }, [emailBlocks])

  // Sync builder blocks to body when in builder mode
  useEffect(() => {
    if (editorMode === "builder") {
      setBody(buildBodyFromBlocks())
    }
  }, [emailBlocks, editorMode, buildBodyFromBlocks])

  const handleSaveDraft = async () => {
    if (!creatorId || !subject.trim()) return

    setIsSaving(true)
    const supabase = createClient()

    const campaignData = {
      creator_id: creatorId,
      subject,
      body,
      preview_text: previewText || null,
      status: "draft" as const,
      audience_type: audienceType,
      segment_id: selectedSegment || null,
      template_id: selectedTemplate || null,
    }

    if (editingCampaign) {
      await supabase.from("email_campaigns").update(campaignData).eq("id", editingCampaign.id)
    } else {
      await supabase.from("email_campaigns").insert(campaignData)
    }

    setIsSaving(false)
    setView("list")
    setActiveTab("drafts")
    loadData()
    toast({ title: "Draft saved", description: "Your email draft has been saved." })
  }

  const handleSchedule = async () => {
    if (!creatorId || !subject.trim() || !scheduledAt) return

    setIsSaving(true)
    const supabase = createClient()

    const campaignData = {
      creator_id: creatorId,
      subject,
      body,
      preview_text: previewText || null,
      status: "scheduled" as const,
      audience_type: audienceType,
      segment_id: selectedSegment || null,
      scheduled_at: new Date(scheduledAt).toISOString(),
    }

    if (editingCampaign) {
      await supabase.from("email_campaigns").update(campaignData).eq("id", editingCampaign.id)
    } else {
      await supabase.from("email_campaigns").insert(campaignData)
    }

    setIsSaving(false)
    setView("list")
    setActiveTab("scheduled")
    loadData()
    toast({
      title: "Email scheduled",
      description: `Your email will be sent on ${new Date(scheduledAt).toLocaleString()}`,
    })
  }

  const handleSendNow = async () => {
    if (!creatorId || !subject.trim()) return

    setIsSending(true)
    const supabase = createClient()

    try {
      // First save/update the campaign
      let campaignId = editingCampaign?.id

      const campaignData = {
        creator_id: creatorId,
        subject,
        body,
        preview_text: previewText || null,
        audience_type: audienceType,
        segment_id: selectedSegment || null,
      }

      if (editingCampaign) {
        await supabase.from("email_campaigns").update(campaignData).eq("id", editingCampaign.id)
      } else {
        const { data: newCampaign } = await supabase
          .from("email_campaigns")
          .insert({ ...campaignData, status: "draft" })
          .select()
          .single()
        campaignId = newCampaign?.id
      }

      if (!campaignId) {
        throw new Error("Failed to create campaign")
      }

      // Send the campaign
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send campaign")
      }

      setView("list")
      setActiveTab("published")
      loadData()
      toast({
        title: "Email sent!",
        description: `Successfully sent to ${data.sent} subscriber${data.sent !== 1 ? "s" : ""}.${data.failed > 0 ? ` ${data.failed} failed.` : ""}`,
      })
    } catch (error) {
      console.error("Send error:", error)
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleResend = async (campaign: EmailCampaign) => {
    // Check if campaign has already been resent
    const supabase = createClient()
    const { data: sends } = await supabase
      .from("email_sends")
      .select("id")
      .eq("campaign_id", campaign.id)
      .gt("sent_at", campaign.sent_at || "")

    if (sends && sends.length > 0) {
      toast({
        title: "Cannot resend",
        description: "This email has already been resent once.",
        variant: "destructive",
      })
      return
    }

    setIsSending(true)
    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id, is_resend: true }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend campaign")
      }

      loadData()
      toast({
        title: "Email resent!",
        description: `Successfully resent to ${data.sent} subscriber${data.sent !== 1 ? "s" : ""}.`,
      })
    } catch (error) {
      toast({
        title: "Failed to resend",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    const supabase = createClient()

    if (deleteTarget.type === "campaign") {
      await supabase.from("email_campaigns").delete().eq("id", deleteTarget.id)
    } else {
      await supabase.from("subscribers").update({ is_active: false, status: "unsubscribed" }).eq("id", deleteTarget.id)
    }

    setShowDeleteDialog(false)
    setDeleteTarget(null)
    loadData()
    toast({ title: "Deleted", description: deleteTarget.type === "campaign" ? "Email deleted" : "Subscriber removed" })
  }

  const handleViewStats = async (campaign: EmailCampaign) => {
    setSelectedCampaignForStats(campaign)
    const supabase = createClient()

    // Get event counts
    const { data: events } = await supabase.from("email_events").select("event_type").eq("campaign_id", campaign.id)

    const counts = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
    }

    events?.forEach((event) => {
      const type = event.event_type as keyof typeof counts
      if (type in counts) counts[type]++
    })

    const totalSent = campaign.audience_count || counts.sent || 1
    setSelectedCampaignStats({
      total_sent: totalSent,
      delivered: counts.delivered || totalSent,
      opened: counts.opened,
      clicked: counts.clicked,
      bounced: counts.bounced,
      unsubscribed: counts.unsubscribed,
      open_rate: Math.round((counts.opened / totalSent) * 100),
      click_rate: Math.round((counts.clicked / totalSent) * 100),
    })

    setView("analytics")
  }

  const filteredSubscribers = subscribers.filter(
    (s) =>
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  // Analytics View
  if (view === "analytics" && selectedCampaignForStats && selectedCampaignStats) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 truncate">{selectedCampaignForStats.subject}</h1>
                <p className="text-sm text-gray-500">
                  Sent {formatDateTime(selectedCampaignForStats.sent_at || selectedCampaignForStats.created_at)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Send className="h-4 w-4" />
                <span className="text-xs font-medium">Sent</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{selectedCampaignStats.total_sent}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Eye className="h-4 w-4" />
                <span className="text-xs font-medium">Opens</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{selectedCampaignStats.opened}</p>
              <p className="text-xs text-green-600 font-medium">{selectedCampaignStats.open_rate}% rate</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <MousePointerClick className="h-4 w-4" />
                <span className="text-xs font-medium">Clicks</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{selectedCampaignStats.clicked}</p>
              <p className="text-xs text-blue-600 font-medium">{selectedCampaignStats.click_rate}% rate</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <X className="h-4 w-4" />
                <span className="text-xs font-medium">Unsubscribed</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{selectedCampaignStats.unsubscribed}</p>
            </div>
          </div>

          {/* Performance Indicators */}
          <div className="bg-white rounded-xl border p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Performance</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Open Rate</span>
                  <span className="font-medium">{selectedCampaignStats.open_rate}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.min(selectedCampaignStats.open_rate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedCampaignStats.open_rate >= 20
                    ? "Great! Above average"
                    : selectedCampaignStats.open_rate >= 10
                      ? "Good performance"
                      : "Consider improving subject line"}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Click Rate</span>
                  <span className="font-medium">{selectedCampaignStats.click_rate}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(selectedCampaignStats.click_rate * 5, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedCampaignStats.click_rate >= 5
                    ? "Excellent engagement!"
                    : selectedCampaignStats.click_rate >= 2
                      ? "Good click rate"
                      : "Add clearer CTAs"}
                </p>
              </div>
            </div>
          </div>

          {/* Campaign Preview */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-900">Email Preview</h3>
            </div>
            <div className="p-6">
              <div className="prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: selectedCampaignForStats.body }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Editor View
  if (view === "editor") {
    // Template Selection Mode
    if (editorMode === "template" && !editingCampaign) {
      return (
        <div className="min-h-screen bg-gray-50/50">
          <div className="bg-white border-b sticky top-0 z-10">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-semibold text-gray-900">Choose a Template</h1>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            {/* Editor Mode Options */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <button
                onClick={() => {
                  setEditorMode("code")
                  setBody("")
                }}
                className="bg-white rounded-xl border p-6 text-left hover:border-gray-300 transition-colors group"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                  <Code className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Custom HTML</h3>
                <p className="text-sm text-gray-500">Write your own HTML email</p>
              </button>
              <button
                onClick={() => setEditorMode("builder")}
                className="bg-white rounded-xl border p-6 text-left hover:border-gray-300 transition-colors group"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                  <Layout className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Drag & Drop Builder</h3>
                <p className="text-sm text-gray-500">Build visually with blocks</p>
              </button>
              <button
                onClick={() => {}}
                className="bg-white rounded-xl border p-6 text-left hover:border-gray-300 transition-colors group"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                  <Sparkles className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Use Template</h3>
                <p className="text-sm text-gray-500">Start with a pre-built design</p>
              </button>
            </div>

            {/* Templates Grid */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Templates</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {EMAIL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template.id)}
                  className="bg-white rounded-xl border overflow-hidden text-left hover:border-gray-300 hover:shadow-md transition-all group"
                >
                  <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                    <img
                      src={template.thumbnail || "/placeholder.svg"}
                      alt={template.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900">{template.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }

    // Builder Mode
    if (editorMode === "builder") {
      return (
        <div className="min-h-screen bg-gray-50/50">
          <div className="bg-white border-b sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="icon" onClick={() => setEditorMode("template")} className="h-9 w-9">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-xl font-semibold text-gray-900">Email Builder</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditorMode("code")}>
                    <Code className="h-4 w-4 mr-2" />
                    Edit HTML
                  </Button>
                  <Button onClick={() => setEditorMode("code")} className="bg-gray-900 hover:bg-gray-800 text-white">
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Blocks Panel */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl border p-4 sticky top-24">
                  <h3 className="font-medium text-gray-900 mb-4">Add Blocks</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => addBlock("text")}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <Type className="h-5 w-5 text-gray-600" />
                      <span className="text-xs text-gray-600">Text</span>
                    </button>
                    <button
                      onClick={() => addBlock("image")}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <ImageIcon className="h-5 w-5 text-gray-600" />
                      <span className="text-xs text-gray-600">Image</span>
                    </button>
                    <button
                      onClick={() => addBlock("button")}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <Square className="h-5 w-5 text-gray-600" />
                      <span className="text-xs text-gray-600">Button</span>
                    </button>
                    <button
                      onClick={() => addBlock("divider")}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <Minus className="h-5 w-5 text-gray-600" />
                      <span className="text-xs text-gray-600">Divider</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Builder Canvas */}
              <div className="col-span-6">
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Email Content</span>
                  </div>
                  <div className="p-6 min-h-[500px]">
                    {emailBlocks.map((block, index) => (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={() => setDraggedBlock(block.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedBlock && draggedBlock !== block.id) {
                            const fromIndex = emailBlocks.findIndex((b) => b.id === draggedBlock)
                            moveBlock(fromIndex, index)
                          }
                          setDraggedBlock(null)
                        }}
                        className={cn(
                          "relative group border-2 border-dashed border-transparent rounded-lg p-2 mb-2 transition-colors",
                          draggedBlock === block.id ? "opacity-50" : "",
                          "hover:border-gray-200",
                        )}
                      >
                        <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                          <GripVertical className="h-4 w-4 text-gray-400" />
                        </div>
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="absolute -right-2 -top-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        {block.type === "text" && (
                          <Textarea
                            value={block.content}
                            onChange={(e) => updateBlock(block.id, e.target.value)}
                            className="w-full min-h-[80px] border-0 focus-visible:ring-0 resize-none"
                            placeholder="Enter text..."
                          />
                        )}
                        {block.type === "image" && (
                          <div className="text-center">
                            <img
                              src={block.content || "/placeholder.svg"}
                              alt="Email"
                              className="max-w-full rounded-lg mx-auto"
                            />
                            <Input
                              value={block.content}
                              onChange={(e) => updateBlock(block.id, e.target.value)}
                              placeholder="Image URL"
                              className="mt-2 text-xs"
                            />
                          </div>
                        )}
                        {block.type === "button" && (
                          <div className="text-center">
                            <span className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg">
                              {block.content}
                            </span>
                            <Input
                              value={block.content}
                              onChange={(e) => updateBlock(block.id, e.target.value)}
                              placeholder="Button text"
                              className="mt-2 text-xs"
                            />
                          </div>
                        )}
                        {block.type === "divider" && <hr className="my-4 border-gray-200" />}
                        {block.type === "spacer" && (
                          <div className="h-8 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
                            Spacer
                          </div>
                        )}
                      </div>
                    ))}
                    {emailBlocks.length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <Layout className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Add blocks from the left panel</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="col-span-3">
                <div className="bg-white rounded-xl border overflow-hidden sticky top-24">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <span className="text-sm font-medium text-gray-700">Preview</span>
                  </div>
                  <div className="p-4 text-sm">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: buildBodyFromBlocks() }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Code Editor Mode (default)
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => (editingCampaign ? setView("list") : setEditorMode("template"))}
                  className="h-9 w-9"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-semibold text-gray-900">{editingCampaign ? "Edit Email" : "New Email"}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!subject.trim() || isSaving}
                  className="h-9 bg-transparent"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Save Draft
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={!subject.trim() || isSending}
                      className="bg-gray-900 hover:bg-gray-800 text-white h-9"
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleSendNow}>
                      <Send className="h-4 w-4 mr-2" />
                      Send Now
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        if (scheduledAt) handleSchedule()
                      }}
                      disabled={!scheduledAt}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      {scheduledAt ? `Schedule for ${formatDateTime(scheduledAt)}` : "Set schedule time first"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-6 space-y-6">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  placeholder="Enter your email subject..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="text-lg"
                />
                <p className="text-xs text-gray-500">Tip: Keep it under 50 characters for better open rates</p>
              </div>

              {/* Preview Text */}
              <div className="space-y-2">
                <Label htmlFor="preview">Preview Text (optional)</Label>
                <Input
                  id="preview"
                  placeholder="Brief preview shown in inbox..."
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                />
                <p className="text-xs text-gray-500">This appears next to the subject line in most email clients</p>
              </div>

              {/* Audience */}
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={audienceType} onValueChange={setAudienceType}>
                  <SelectTrigger>
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

              {/* Email Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Email Content</Label>
                  {!editingCampaign && (
                    <Button variant="ghost" size="sm" onClick={() => setEditorMode("builder")}>
                      <Layout className="h-4 w-4 mr-2" />
                      Use Builder
                    </Button>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="font-medium">Available variables:</p>
                  <p>
                    <code className="bg-gray-200 px-1 rounded">{"{{name}}"}</code> - Subscriber name
                  </p>
                  <p>
                    <code className="bg-gray-200 px-1 rounded">{"{{email}}"}</code> - Subscriber email
                  </p>
                  <p>
                    <code className="bg-gray-200 px-1 rounded">{"{{unsubscribe_url}}"}</code> - Unsubscribe link
                  </p>
                </div>
                <Textarea
                  id="body"
                  placeholder="Write your email content...

Example:
<p>Hi {{name}},</p>
<p>Your message here...</p>
<p>Best regards</p>"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>

              {/* Schedule */}
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="schedule">Schedule (optional)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="schedule"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="max-w-xs"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  {scheduledAt && (
                    <Button variant="outline" onClick={handleSchedule} disabled={!subject.trim() || isSaving}>
                      <Clock className="h-4 w-4 mr-2" />
                      Schedule
                    </Button>
                  )}
                </div>
              </div>

              {/* Deliverability Tips */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 mb-1">Tips for better deliverability</p>
                    <ul className="text-blue-700 space-y-1 text-xs">
                      <li>• Keep subject lines personal and avoid ALL CAPS or excessive punctuation</li>
                      <li>• Include plain text content, not just images</li>
                      <li>• Always include an unsubscribe link (added automatically)</li>
                      <li>• Avoid spam trigger words like "FREE", "BUY NOW", "URGENT"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List View
  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Emails</h1>
              <p className="text-sm text-gray-500 mt-0.5">Send updates and manage your subscribers</p>
            </div>
            <Button onClick={handleNewEmail} className="bg-gray-900 hover:bg-gray-800 text-white h-9 px-4 rounded-lg">
              <Plus className="h-4 w-4 mr-2" />
              New email
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-gray-900 text-gray-900 bg-gray-50"
                      : "border-transparent text-gray-500 hover:text-gray-700",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "subscribers" && (
          <div className="space-y-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.status === "subscribed").length}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">OnePage</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.source === "onepage" && s.status === "subscribed").length}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">Store</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.source === "store_builder" && s.status === "subscribed").length}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">Unsubscribed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.status === "unsubscribed").length}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search subscribers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 rounded-lg"
              />
            </div>

            {/* Subscribers List */}
            <div className="bg-white rounded-xl border overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : filteredSubscribers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">No subscribers yet</p>
                  <p className="text-gray-400 text-xs mt-1">Subscribers from your OnePage and Store will appear here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-left hidden sm:table-cell">Name</th>
                        <th className="px-4 py-3 text-left">Source</th>
                        <th className="px-4 py-3 text-left hidden md:table-cell">Status</th>
                        <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                        <th className="px-4 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredSubscribers.map((subscriber) => (
                        <tr key={subscriber.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-900 truncate max-w-[200px]">{subscriber.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-gray-600">{subscriber.name || "-"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                                subscriber.source === "onepage"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-purple-50 text-purple-700",
                              )}
                            >
                              {subscriber.source === "onepage" ? (
                                <Link2 className="h-3 w-3" />
                              ) : (
                                <Store className="h-3 w-3" />
                              )}
                              <span className="hidden sm:inline">
                                {subscriber.source === "onepage" ? "OnePage" : "Store"}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                subscriber.status === "subscribed"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-500",
                              )}
                            >
                              {subscriber.status === "subscribed" ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              {subscriber.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-gray-500">{formatDate(subscriber.subscribed_at)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    navigator.clipboard.writeText(subscriber.email)
                                    toast({ title: "Copied", description: "Email copied to clipboard" })
                                  }}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy email
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    setDeleteTarget({ type: "subscriber", id: subscriber.id })
                                    setShowDeleteDialog(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === "published" || activeTab === "scheduled" || activeTab === "drafts") && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl border p-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center">
                <Mail className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">
                  {activeTab === "published" && "No emails sent yet"}
                  {activeTab === "scheduled" && "No scheduled emails"}
                  {activeTab === "drafts" && "No draft emails"}
                </p>
                <Button variant="outline" className="mt-4 bg-transparent" onClick={handleNewEmail}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first email
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden divide-y">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{campaign.subject}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                          {campaign.sent_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Sent {formatDate(campaign.sent_at)}
                            </span>
                          )}
                          {campaign.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDateTime(campaign.scheduled_at)}
                            </span>
                          )}
                          {campaign.audience_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {campaign.audience_count} recipients
                            </span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {activeTab === "published" && (
                            <>
                              <DropdownMenuItem onClick={() => handleViewStats(campaign)}>
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResend(campaign)} disabled={isSending}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Resend (once only)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleEditCampaign(campaign)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {activeTab === "published" ? "View" : "Edit"}
                          </DropdownMenuItem>
                          {activeTab !== "published" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteTarget({ type: "campaign", id: campaign.id })
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "campaign"
                ? "Are you sure you want to delete this email? This action cannot be undone."
                : "Are you sure you want to remove this subscriber? They will be unsubscribed from future emails."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
