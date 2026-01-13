"use client"

import { useState, useEffect } from "react"
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
  BarChart3,
  MousePointerClick,
  Check,
  X,
  Copy,
  RefreshCw,
  Download,
} from "lucide-react"
import { EmailEditor } from "@/components/email/email-editor"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type TabType = "published" | "scheduled" | "drafts" | "subscribers"
type ViewType = "list" | "editor" | "analytics"

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
  const [sellerInfo, setSellerInfo] = useState<{ name: string; username: string; avatarUrl: string } | null>(null)
  const { toast } = useToast()

  // Editor state
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [previewText, setPreviewText] = useState("")
  const [audienceType, setAudienceType] = useState("all")
  const [selectedSegment, setSelectedSegment] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Analytics state
  const [selectedCampaignStats, setSelectedCampaignStats] = useState<CampaignStats | null>(null)
  const [selectedCampaignForStats, setSelectedCampaignForStats] = useState<EmailCampaign | null>(null)
  const [overviewStats, setOverviewStats] = useState<{
    total_sent: number
    total_opened: number
    total_clicked: number
    total_unsubscribed: number
    open_rate: number
    click_rate: number
  } | null>(null)
  const [statsTimeRange, setStatsTimeRange] = useState<"7d" | "30d" | "90d" | "all">("30d")

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "campaign" | "subscriber"; id: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [activeTab, statsTimeRange])

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

    // Load profile info for seller preview
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    if (profile) {
      setSellerInfo({
        name: profile.display_name || profile.username || "Creator",
        username: profile.username || "username",
        avatarUrl: profile.avatar_url || "",
      })
    }

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

      // Load overview stats for Sent tab
      if (activeTab === "published") {
        const timeRangeDate = new Date()
        if (statsTimeRange === "7d") timeRangeDate.setDate(timeRangeDate.getDate() - 7)
        else if (statsTimeRange === "30d") timeRangeDate.setDate(timeRangeDate.getDate() - 30)
        else if (statsTimeRange === "90d") timeRangeDate.setDate(timeRangeDate.getDate() - 90)
        else timeRangeDate.setFullYear(2000)

        const { data: events } = await supabase
          .from("email_events")
          .select("event_type, campaign_id")
          .gte("created_at", timeRangeDate.toISOString())
          .in("campaign_id", (data || []).map(c => c.id))

        if (events) {
          const sent = events.filter(e => e.event_type === "sent").length
          const opened = events.filter(e => e.event_type === "opened").length
          const clicked = events.filter(e => e.event_type === "clicked").length
          const unsubscribed = events.filter(e => e.event_type === "unsubscribed").length
          setOverviewStats({
            total_sent: sent,
            total_opened: opened,
            total_clicked: clicked,
            total_unsubscribed: unsubscribed,
            open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            click_rate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          })
        }
      }
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
    setView("editor")
  }

  const handleEditCampaign = (campaign: EmailCampaign) => {
    setEditingCampaign(campaign)
    setSubject(campaign.subject)
    setBody(campaign.body)
    setPreviewText(campaign.preview_text || "")
    setAudienceType(campaign.audience_type)
    setSelectedSegment(campaign.segment_id || "")
    setView("editor")
  }

  const handleResend = async (campaign: EmailCampaign) => {
    if (!creatorId) return

    setIsSending(true)
    const supabase = createClient()

    try {
      // Create a new campaign as a copy with "(Resend)" in subject
      const { data: newCampaign, error: createError } = await supabase
        .from("email_campaigns")
        .insert({
          creator_id: creatorId,
          subject: campaign.subject.includes("(Resend)")
            ? campaign.subject
            : `${campaign.subject} (Resend)`,
          body: campaign.body,
          preview_text: campaign.preview_text,
          status: "draft",
          audience_type: campaign.audience_type,
          segment_id: campaign.segment_id,
        })
        .select()
        .single()

      if (createError || !newCampaign) {
        throw new Error("Failed to create resend copy")
      }

      // Now send the new campaign
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: newCampaign.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send resend campaign")
      }

      loadData()
      toast({
        title: "Email resent!",
        description: `Successfully resent to ${data.sent} subscriber${data.sent !== 1 ? "s" : ""}. A new copy was created in your sent list.`,
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

  // Editor View - Using the new EmailBuilder component
  if (view === "editor") {
    const handleBuilderSave = async (data: { subject: string; body: string; previewText: string }) => {
      if (!creatorId) return

      setIsSaving(true)
      const supabase = createClient()

      // Extract segment_id from audienceType if it's a segment
      const segmentId = audienceType.startsWith("segment:") ? audienceType.replace("segment:", "") : (selectedSegment || null)
      const actualAudienceType = audienceType.startsWith("segment:") ? "segment" : audienceType

      const campaignData = {
        creator_id: creatorId,
        subject: data.subject,
        body: data.body,
        preview_text: data.previewText || null,
        status: "draft" as const,
        audience_type: actualAudienceType,
        segment_id: segmentId,
      }

      if (editingCampaign) {
        await supabase
          .from("email_campaigns")
          .update(campaignData)
          .eq("id", editingCampaign.id)
      } else {
        await supabase.from("email_campaigns").insert(campaignData)
      }

      setIsSaving(false)
      setView("list")
      setActiveTab("drafts")
      loadData()
      toast({ title: "Draft saved", description: "Your email draft has been saved." })
    }

    const handleBuilderSend = async (data: { subject: string; body: string; previewText: string }) => {
      if (!creatorId) return

      setIsSending(true)
      const supabase = createClient()

      try {
        let campaignId = editingCampaign?.id

        // Extract segment_id from audienceType if it's a segment
        const segmentId = audienceType.startsWith("segment:") ? audienceType.replace("segment:", "") : (selectedSegment || null)
        const actualAudienceType = audienceType.startsWith("segment:") ? "segment" : audienceType

        const campaignData = {
          creator_id: creatorId,
          subject: data.subject,
          body: data.body,
          preview_text: data.previewText || null,
          audience_type: actualAudienceType,
          segment_id: segmentId,
        }

        if (editingCampaign) {
          await supabase
            .from("email_campaigns")
            .update(campaignData)
            .eq("id", editingCampaign.id)
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

        const response = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId }),
        })

        const responseData = await response.json()

        if (!response.ok) {
          throw new Error(responseData.error || "Failed to send campaign")
        }

        setView("list")
        setActiveTab("published")
        loadData()
        toast({
          title: "Email sent!",
          description: `Successfully sent to ${responseData.sent} subscribers.`,
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

    const handleBuilderSchedule = async (data: { subject: string; body: string; previewText: string; scheduledAt: string }) => {
      if (!creatorId) return

      setIsSaving(true)
      const supabase = createClient()

      // Extract segment_id from audienceType if it's a segment
      const segmentId = audienceType.startsWith("segment:") ? audienceType.replace("segment:", "") : (selectedSegment || null)
      const actualAudienceType = audienceType.startsWith("segment:") ? "segment" : audienceType

      const campaignData = {
        creator_id: creatorId,
        subject: data.subject,
        body: data.body,
        preview_text: data.previewText || null,
        status: "scheduled" as const,
        audience_type: actualAudienceType,
        segment_id: segmentId,
        scheduled_at: new Date(data.scheduledAt).toISOString(),
      }

      if (editingCampaign) {
        await supabase
          .from("email_campaigns")
          .update(campaignData)
          .eq("id", editingCampaign.id)
      } else {
        await supabase.from("email_campaigns").insert(campaignData)
      }

      setIsSaving(false)
      setView("list")
      setActiveTab("scheduled")
      loadData()
      toast({
        title: "Email scheduled",
        description: "Your email has been scheduled.",
      })
    }

    const handleSendTest = async (data: { subject: string; body: string; previewText: string; testEmail: string }) => {
      try {
        const response = await fetch("/api/email/send-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: data.subject,
            body: data.body,
            preview_text: data.previewText,
            test_email: data.testEmail,
          }),
        })

        const responseData = await response.json()

        if (!response.ok) {
          throw new Error(responseData.error || "Failed to send test email")
        }

        toast({
          title: "Test email sent!",
          description: `A test email has been sent to ${data.testEmail}`,
        })
      } catch (error) {
        toast({
          title: "Failed to send test",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        })
      }
    }

    return (
      <EmailEditor
        onBack={() => setView("list")}
        onSave={handleBuilderSave}
        onSend={handleBuilderSend}
        onSchedule={handleBuilderSchedule}
        onSendTest={handleSendTest}
        initialSubject={subject}
        initialBody={body}
        initialPreviewText={previewText}
        audienceType={audienceType}
        onAudienceChange={setAudienceType}
        segments={segments.map(s => ({ id: s.id, name: s.name }))}
        isSaving={isSaving}
        isSending={isSending}
        creatorId={creatorId || undefined}
        sellerInfo={sellerInfo || undefined}
      />
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

            {/* Search and Export */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search subscribers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-lg"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const activeSubscribers = subscribers.filter(s => s.status === "subscribed")
                  if (activeSubscribers.length === 0) {
                    toast({ title: "No subscribers", description: "There are no subscribers to export", variant: "destructive" })
                    return
                  }
                  const headers = ["Email", "Name", "Source", "Status", "Subscribed Date"]
                  const rows = activeSubscribers.map(s => [
                    s.email,
                    s.name || "",
                    s.source === "onepage" ? "OnePage" : "Store Builder",
                    s.status,
                    s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString() : ""
                  ])
                  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
                  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement("a")
                  link.href = url
                  link.download = `subscribers-${new Date().toISOString().split("T")[0]}.csv`
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  URL.revokeObjectURL(url)
                  toast({ title: "Export complete", description: `Exported ${activeSubscribers.length} subscribers to CSV` })
                }}
                className="h-10 px-4 rounded-lg"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
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
            {/* Analytics Overview for Sent Tab */}
            {activeTab === "published" && overviewStats && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-700">Overview</h2>
                  <select
                    value={statsTimeRange}
                    onChange={(e) => setStatsTimeRange(e.target.value as typeof statsTimeRange)}
                    className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Send className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Sent</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{overviewStats.total_sent}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Eye className="h-4 w-4" />
                      <span className="text-xs font-medium">Opens</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{overviewStats.total_opened}</p>
                    <p className="text-xs text-green-600 font-medium">{overviewStats.open_rate}% rate</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <MousePointerClick className="h-4 w-4" />
                      <span className="text-xs font-medium">Clicks</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{overviewStats.total_clicked}</p>
                    <p className="text-xs text-blue-600 font-medium">{overviewStats.click_rate}% rate</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <X className="h-4 w-4" />
                      <span className="text-xs font-medium">Unsubscribed</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{overviewStats.total_unsubscribed}</p>
                  </div>
                </div>
              </div>
            )}

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
                  <div
                    key={campaign.id}
                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => activeTab === "published" ? handleViewStats(campaign) : handleEditCampaign(campaign)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {campaign.subject}
                          {campaign.subject?.includes("(Resend)") && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Resent</span>
                          )}
                        </h3>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {activeTab === "published" && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewStats(campaign); }}>
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleResend(campaign); }} disabled={isSending}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Resend
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteTarget({ type: "campaign", id: campaign.id })
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          {activeTab !== "published" && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditCampaign(campaign); }}>
                                <Eye className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation()
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
