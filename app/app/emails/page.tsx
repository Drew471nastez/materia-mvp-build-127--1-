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
  Edit,
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
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  { id: "published" as const, label: "Published", icon: Send },
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

  // Editor state
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [previewText, setPreviewText] = useState("")
  const [audienceType, setAudienceType] = useState("all")
  const [selectedSegment, setSelectedSegment] = useState<string>("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

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
    setView("editor")
  }

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

      // Send the campaign
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to send campaign")
      }

      setView("list")
      setActiveTab("published")
      loadData()
    } catch (error) {
      console.error("Send error:", error)
      alert(error instanceof Error ? error.message : "Failed to send email")
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
      await supabase
        .from("subscribers")
        .update({ is_active: false, status: "unsubscribed" })
        .eq("id", deleteTarget.id)
    }

    setShowDeleteDialog(false)
    setDeleteTarget(null)
    loadData()
  }

  const handleViewStats = async (campaign: EmailCampaign) => {
    setSelectedCampaignForStats(campaign)
    const supabase = createClient()

    // Get event counts
    const { data: events } = await supabase
      .from("email_events")
      .select("event_type")
      .eq("campaign_id", campaign.id)

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
      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("list")}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {selectedCampaignForStats.subject}
                </h1>
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
              <p className="text-2xl font-bold text-gray-900">
                {selectedCampaignStats.total_sent}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Eye className="h-4 w-4" />
                <span className="text-xs font-medium">Opens</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {selectedCampaignStats.opened}
              </p>
              <p className="text-xs text-gray-500">
                {selectedCampaignStats.open_rate}% rate
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <MousePointerClick className="h-4 w-4" />
                <span className="text-xs font-medium">Clicks</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {selectedCampaignStats.clicked}
              </p>
              <p className="text-xs text-gray-500">
                {selectedCampaignStats.click_rate}% rate
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <X className="h-4 w-4" />
                <span className="text-xs font-medium">Unsubscribed</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {selectedCampaignStats.unsubscribed}
              </p>
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
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView("list")}
                  className="h-9 w-9"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-semibold text-gray-900">
                  {editingCampaign ? "Edit Email" : "New Email"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!subject.trim() || isSaving}
                  className="h-9"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
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
                        const modal = document.getElementById("schedule-modal")
                        if (modal) modal.click()
                      }}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Schedule
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
                <p className="text-xs text-gray-500">
                  This text appears next to the subject line in most email clients
                </p>
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
                <Label htmlFor="body">Email Content</Label>
                <div className="text-xs text-gray-500 mb-2">
                  Use {"{{name}}"} for subscriber name, {"{{unsubscribe_url}}"} for unsubscribe link
                </div>
                <Textarea
                  id="body"
                  placeholder="Write your email content...

You can use HTML for formatting:
<p>Hello {{name}},</p>
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
                    <Button
                      variant="outline"
                      onClick={handleSchedule}
                      disabled={!subject.trim() || isSaving}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Schedule for {formatDateTime(scheduledAt)}
                    </Button>
                  )}
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
              <p className="text-sm text-gray-500 mt-0.5">
                Send updates and manage your subscribers
              </p>
            </div>
            <Button
              onClick={handleNewEmail}
              className="bg-gray-900 hover:bg-gray-800 text-white h-9 px-4 rounded-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              New email
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2",
                    activeTab === tab.id
                      ? "border-gray-900 text-gray-900 bg-gray-50"
                      : "border-transparent text-gray-500 hover:text-gray-700"
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
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">Total Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.status === "subscribed").length}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">From OnePage</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.source === "onepage" && s.status === "subscribed").length}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-sm text-gray-500">From Store</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscribers.filter((s) => s.source === "store_builder" && s.status === "subscribed").length}
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
                  <p className="text-gray-400 text-xs mt-1">
                    Subscribers from your OnePage and Store will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="col-span-4">Email</div>
                    <div className="col-span-2">Name</div>
                    <div className="col-span-2">Source</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-1">Date</div>
                    <div className="col-span-1"></div>
                  </div>

                  {/* Rows */}
                  {filteredSubscribers.map((subscriber) => (
                    <div
                      key={subscriber.id}
                      className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors"
                    >
                      <div className="col-span-4">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900 truncate">
                            {subscriber.email}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-600">
                          {subscriber.name || "-"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                            subscriber.source === "onepage"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          )}
                        >
                          {subscriber.source === "onepage" ? (
                            <Link2 className="h-3 w-3" />
                          ) : (
                            <Store className="h-3 w-3" />
                          )}
                          {subscriber.source === "onepage" ? "OnePage" : "Store"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                            subscriber.status === "subscribed"
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          {subscriber.status === "subscribed" ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {subscriber.status}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-gray-500">
                          {formatDate(subscriber.subscribed_at)}
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                      </div>
                    </div>
                  ))}
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
                <Button variant="outline" className="mt-4" onClick={handleNewEmail}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first email
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden divide-y">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {campaign.subject}
                        </h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          {campaign.sent_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Sent {formatDate(campaign.sent_at)}
                            </span>
                          )}
                          {campaign.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              Scheduled {formatDateTime(campaign.scheduled_at)}
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
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {activeTab === "published" && (
                            <DropdownMenuItem onClick={() => handleViewStats(campaign)}>
                              <BarChart3 className="h-4 w-4 mr-2" />
                              View Analytics
                            </DropdownMenuItem>
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
