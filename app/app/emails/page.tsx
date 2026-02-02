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
  Zap,
  Play,
  Pause,
  ShoppingCart,
  UserPlus,
  ChevronRight,
  Settings,
  MailPlus,
  Timer,
  Sparkles,
  Type,
} from "lucide-react"
import Link from "next/link"
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

type TabType = "subscribers" | "flows" | "published" | "scheduled" | "drafts"
type ViewType = "list" | "editor" | "analytics" | "flow-editor"

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

interface EmailFlow {
  id: string
  name: string
  description?: string
  trigger_type: "purchase" | "new_subscriber" | "tag_added" | "manual"
  trigger_config?: Record<string, any>
  status: "active" | "paused" | "draft"
  steps: FlowStep[]
  created_at: string
  updated_at: string
  stats?: {
    emails_sent: number
    total_recipients: number
    open_rate: number
    click_rate: number
  }
}

interface FlowStep {
  id: string
  type: "email" | "delay" | "condition"
  order: number
  config: {
    // For email type
    subject?: string
    body?: string
    preview_text?: string
    // For delay type
    delay_value?: number
    delay_unit?: "minutes" | "hours" | "days"
    // For condition type
    condition_type?: string
    condition_value?: any
  }
}

const tabs = [
  { id: "subscribers" as const, label: "Subscribers", icon: Users },
  { id: "flows" as const, label: "Flows", icon: Zap },
  { id: "published" as const, label: "Sent", icon: Send },
  { id: "scheduled" as const, label: "Scheduled", icon: Clock },
  { id: "drafts" as const, label: "Drafts", icon: FileText },
]

const FLOW_TRIGGERS = [
  {
    id: "purchase",
    name: "Purchase",
    description: "When a customer purchases your product",
    icon: ShoppingCart,
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "new_subscriber",
    name: "New Subscriber",
    description: "When someone subscribes to your email list",
    icon: UserPlus,
    color: "bg-blue-100 text-blue-700",
  },
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

  // Flows state
  const [flows, setFlows] = useState<EmailFlow[]>([])
  const [editingFlow, setEditingFlow] = useState<EmailFlow | null>(null)
  const [showCreateFlowDialog, setShowCreateFlowDialog] = useState(false)

  // Store checkout buyers count (for Store KPI)
  const [checkoutBuyersCount, setCheckoutBuyersCount] = useState(0)

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "campaign" | "subscriber" | "flow"; id: string } | null>(null)

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

      // Also count unique checkout buyers for Store KPI
      const { data: products } = await supabase
        .from("products")
        .select("id")
        .eq("creator_id", creator.id)

      if (products && products.length > 0) {
        const productIds = products.map(p => p.id)
        const { data: orders } = await supabase
          .from("orders")
          .select("buyer_email")
          .in("product_id", productIds)
          .eq("status", "completed")

        // Count unique buyer emails that are not already in subscribers
        const subscriberEmails = new Set((data || []).map(s => s.email.toLowerCase()))
        const uniqueBuyerEmails = new Set(
          (orders || [])
            .map(o => o.buyer_email?.toLowerCase())
            .filter(email => email && !subscriberEmails.has(email))
        )
        setCheckoutBuyersCount(uniqueBuyerEmails.size)
      } else {
        setCheckoutBuyersCount(0)
      }
    } else if (activeTab === "flows") {
      const { data } = await supabase
        .from("email_flows")
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })

      setFlows(data || [])
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
    } else if (deleteTarget.type === "flow") {
      await supabase.from("email_flows").delete().eq("id", deleteTarget.id)
    } else {
      await supabase.from("subscribers").update({ is_active: false, status: "unsubscribed" }).eq("id", deleteTarget.id)
    }

    setShowDeleteDialog(false)
    setDeleteTarget(null)
    loadData()
    toast({
      title: "Deleted",
      description: deleteTarget.type === "campaign"
        ? "Email deleted"
        : deleteTarget.type === "flow"
          ? "Flow deleted"
          : "Subscriber removed"
    })
  }

  const handleCreateFlow = async (triggerType: string) => {
    if (!creatorId) return

    const supabase = createClient()
    const triggerInfo = FLOW_TRIGGERS.find(t => t.id === triggerType)

    const { data: newFlow, error } = await supabase
      .from("email_flows")
      .insert({
        creator_id: creatorId,
        name: `${triggerInfo?.name || 'New'} Flow`,
        trigger_type: triggerType,
        status: "draft",
        steps: [],
      })
      .select()
      .single()

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create flow",
        variant: "destructive"
      })
      return
    }

    setShowCreateFlowDialog(false)
    setEditingFlow(newFlow)
    setView("flow-editor")
  }

  const handleEditFlow = (flow: EmailFlow) => {
    setEditingFlow(flow)
    setView("flow-editor")
  }

  const handleToggleFlowStatus = async (flow: EmailFlow) => {
    const supabase = createClient()
    const newStatus = flow.status === "active" ? "paused" : "active"

    await supabase
      .from("email_flows")
      .update({ status: newStatus })
      .eq("id", flow.id)

    loadData()
    toast({
      title: newStatus === "active" ? "Flow activated" : "Flow paused",
      description: newStatus === "active"
        ? "This flow will now send emails automatically"
        : "This flow has been paused",
    })
  }

  const handleSaveFlow = async (flowData: Partial<EmailFlow>) => {
    if (!editingFlow) return

    const supabase = createClient()

    await supabase
      .from("email_flows")
      .update({
        name: flowData.name,
        description: flowData.description,
        steps: flowData.steps,
        trigger_config: flowData.trigger_config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingFlow.id)

    setView("list")
    loadData()
    toast({ title: "Flow saved", description: "Your flow has been updated." })
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

  const getTriggerInfo = (triggerType: string) => {
    return FLOW_TRIGGERS.find(t => t.id === triggerType) || FLOW_TRIGGERS[0]
  }

  // Flow Editor View
  if (view === "flow-editor" && editingFlow) {
    const triggerInfo = getTriggerInfo(editingFlow.trigger_type)
    const TriggerIcon = triggerInfo.icon

    return (
      <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <Input
                  value={editingFlow.name}
                  onChange={(e) => setEditingFlow({ ...editingFlow, name: e.target.value })}
                  className="text-xl font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                  placeholder="Flow name"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleToggleFlowStatus(editingFlow)}
                  className={cn(
                    "rounded-lg cursor-pointer",
                    editingFlow.status === "active"
                      ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                      : "border-violet-200 text-violet-600 hover:bg-violet-50"
                  )}
                >
                  {editingFlow.status === "active" ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Flow
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Activate Flow
                    </>
                  )}
                </Button>
                <Button onClick={() => handleSaveFlow(editingFlow)} className="rounded-lg bg-violet-600 hover:bg-violet-700 cursor-pointer">
                  Save Flow
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Left Sidebar - Flow Steps List */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden h-fit">
              <div className="p-4 border-b border-[#e5e7eb]/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-gray-400 rotate-90" />
                  <span className="font-medium text-[#1a1a2e]">Email {(editingFlow.steps || []).filter(s => s.type === "email").length > 0 ? "1" : "0"} of {(editingFlow.steps || []).filter(s => s.type === "email").length}</span>
                </div>
              </div>
              <div className="p-3 space-y-2">
                {/* Trigger Item */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <div className={cn("p-1.5 rounded-lg", triggerInfo.color)}>
                    <TriggerIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm text-violet-600">{triggerInfo.name}</span>
                </div>

                {/* Email Steps */}
                {(editingFlow.steps || []).filter(s => s.type === "email").map((step, idx) => (
                  <div key={step.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <Mail className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1a1a2e] truncate font-medium">
                        {step.config.subject || "Untitled email"}
                      </p>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Draft</span>
                    </div>
                  </div>
                ))}

                {/* Add Email Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const newStep: FlowStep = {
                      id: `step_${Date.now()}`,
                      type: "email",
                      order: (editingFlow.steps || []).length,
                      config: { subject: "", body: "", delay_value: 1, delay_unit: "minutes" }
                    }
                    setEditingFlow({
                      ...editingFlow,
                      steps: [...(editingFlow.steps || []), newStep]
                    })
                  }}
                  className="w-full rounded-lg border-violet-300 text-violet-600 hover:bg-violet-50 hover:border-violet-400 h-10 mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Email
                </Button>
              </div>
            </div>

            {/* Right Side - Email Editor */}
            <div className="space-y-4">
              {/* Connector Line */}
            <div className="flex justify-center">
              <div className="w-0.5 h-8 bg-[#e5e7eb]"></div>
            </div>

            {/* Steps */}
            {(editingFlow.steps || []).map((step, index) => (
              <div key={step.id}>
                {step.type === "delay" ? (
                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                        <Timer className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[11px] uppercase tracking-wider text-amber-600 font-semibold mb-0.5">Wait</div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={step.config.delay_value || 1}
                            onChange={(e) => {
                              const newSteps = [...(editingFlow.steps || [])]
                              newSteps[index].config.delay_value = parseInt(e.target.value) || 1
                              setEditingFlow({ ...editingFlow, steps: newSteps })
                            }}
                            className="w-20 h-9"
                          />
                          <select
                            value={step.config.delay_unit || "days"}
                            onChange={(e) => {
                              const newSteps = [...(editingFlow.steps || [])]
                              newSteps[index].config.delay_unit = e.target.value as "minutes" | "hours" | "days"
                              setEditingFlow({ ...editingFlow, steps: newSteps })
                            }}
                            className="h-9 px-3 border rounded-lg bg-white text-sm"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-500"
                        onClick={() => {
                          const newSteps = (editingFlow.steps || []).filter((_, i) => i !== index)
                          setEditingFlow({ ...editingFlow, steps: newSteps })
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                            <Mail className="h-5 w-5" />
                          </div>
                          <div className="text-[11px] uppercase tracking-wider text-blue-600 font-semibold">Send Email</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-red-500 h-8 w-8"
                          onClick={() => {
                            const newSteps = (editingFlow.steps || []).filter((_, i) => i !== index)
                            setEditingFlow({ ...editingFlow, steps: newSteps })
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Timing */}
                      <div className="mb-4">
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Timing</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={step.config.delay_value || 1}
                            onChange={(e) => {
                              const newSteps = [...(editingFlow.steps || [])]
                              newSteps[index].config.delay_value = parseInt(e.target.value) || 1
                              setEditingFlow({ ...editingFlow, steps: newSteps })
                            }}
                            className="w-20 h-10"
                          />
                          <select
                            value={step.config.delay_unit || "minutes"}
                            onChange={(e) => {
                              const newSteps = [...(editingFlow.steps || [])]
                              newSteps[index].config.delay_unit = e.target.value as "minutes" | "hours" | "days"
                              setEditingFlow({ ...editingFlow, steps: newSteps })
                            }}
                            className="h-10 px-3 border rounded-lg bg-white text-sm"
                          >
                            <option value="minutes">minutes</option>
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                          </select>
                          <span className="text-sm text-gray-500">after purchase</span>
                        </div>
                      </div>

                      {/* Email Subject */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Email Subject</label>
                        </div>
                        <Input
                          value={step.config.subject || ""}
                          onChange={(e) => {
                            const newSteps = [...(editingFlow.steps || [])]
                            newSteps[index].config.subject = e.target.value
                            setEditingFlow({ ...editingFlow, steps: newSteps })
                          }}
                          placeholder="Customer Name, how did you like Product Name?"
                          className="h-10"
                        />
                        <div className="flex items-center justify-between mt-2">
                          <button className="text-xs text-violet-600 font-medium hover:text-violet-700">+ Personalize</button>
                          <button className="text-xs text-violet-600 font-medium hover:text-violet-700">Restore Default</button>
                        </div>
                      </div>

                      {/* Email Body */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Email Body</label>
                        <div className="border rounded-lg overflow-hidden">
                          {/* Toolbar */}
                          <div className="flex items-center gap-1 px-3 py-2 border-b bg-gray-50/50">
                            <button className="p-1.5 rounded hover:bg-gray-100" title="Heading">
                              <Type className="h-4 w-4 text-gray-500" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-gray-100 font-bold text-gray-500" title="Bold">B</button>
                            <button className="p-1.5 rounded hover:bg-gray-100 line-through text-gray-500" title="Strikethrough">S</button>
                            <button className="p-1.5 rounded hover:bg-gray-100 italic text-gray-500" title="Italic">I</button>
                            <button className="p-1.5 rounded hover:bg-gray-100" title="List">
                              <FileText className="h-4 w-4 text-gray-500" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-gray-100" title="Image">
                              <Settings className="h-4 w-4 text-gray-500" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-gray-100" title="Link">
                              <Link2 className="h-4 w-4 text-gray-500" />
                            </button>
                            <div className="flex-1" />
                            <button className="text-xs text-violet-600 font-medium hover:text-violet-700 px-2 py-1 rounded border border-violet-200 bg-violet-50">+ Personalize</button>
                            <button className="text-xs text-violet-600 font-medium hover:text-violet-700 px-2 py-1 rounded border border-violet-200 bg-violet-50 flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              Add Product Link
                            </button>
                          </div>
                          <textarea
                            value={step.config.body || ""}
                            onChange={(e) => {
                              const newSteps = [...(editingFlow.steps || [])]
                              newSteps[index].config.body = e.target.value
                              setEditingFlow({ ...editingFlow, steps: newSteps })
                            }}
                            placeholder="Hi Customer Name!

I'm so excited for you to take your first step on this journey. Product Name is a great place to start! I went through the same exact journey myself, and this is an accumulation of all of my lessons learned and what I wish I knew in achieving my goals.

[Insert a few lines introducing yourself and sharing your story here!].

So as you think about your own goals - do you have any questions for me? I'm here for you, just reply to this email!"
                            className="w-full min-h-[200px] p-4 text-sm resize-none focus:outline-none"
                          />
                        </div>
                        <div className="flex justify-end mt-2">
                          <button className="text-xs text-violet-600 font-medium hover:text-violet-700">Restore Default</button>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="px-5 py-4 border-t bg-gray-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="rounded-lg text-gray-500 hover:text-gray-700 cursor-pointer">
                          <Mail className="h-4 w-4 mr-2" />
                          Send Test Email
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium",
                          step.config.subject && step.config.body
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {step.config.subject && step.config.body ? (
                            <>
                              <Check className="h-3 w-3" />
                              Ready
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              Draft
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Connector */}
                <div className="flex justify-center">
                  <div className="w-0.5 h-8 bg-[#e5e7eb]"></div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Analytics View
  if (view === "analytics" && selectedCampaignForStats && selectedCampaignStats) {
    return (
      <div className="h-full overflow-y-auto page-scroll bg-gray-50/50">
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
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
      {/* Announcement Bar - Pro */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
            <span className="text-[12px] md:text-[14px] text-white/90">
              <span className="font-semibold text-white">Try Pro free</span>
              <span className="hidden md:inline"> — our most popular plan for content creators and businesses.</span>
            </span>
            <Link
              href="/upgrade"
              className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
            >
              <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
              <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
              <span className="relative z-10">Upgrade</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Emails</h1>
              <p className="text-sm text-gray-500 mt-0.5">Send updates and manage your subscribers</p>
            </div>
            <Button onClick={handleNewEmail} className="bg-violet-600 hover:bg-violet-700 text-white h-9 px-4 rounded-lg group cursor-pointer">
              <Plus className="h-4 w-4 mr-2 transition-transform duration-300 group-hover:rotate-90" />
              New email
            </Button>
          </div>

          {/* Tabs - Pill Style */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap cursor-pointer",
                    activeTab === tab.id
                      ? "bg-[#f3f4f6] text-[#1a1a2e]"
                      : "text-[#6b7280] hover:text-[#1a1a2e] hover:bg-[#f9fafb]",
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
                  {subscribers.filter((s) => s.status === "subscribed").length + checkoutBuyersCount}
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
                  {subscribers.filter((s) => s.source !== "onepage" && s.status === "subscribed").length + checkoutBuyersCount}
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
                className="h-10 px-4 rounded-lg cursor-pointer hover:bg-gray-50"
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
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#f3f4f6] text-[#6b7280]"
                            >
                              {subscriber.source === "onepage" ? (
                                <Link2 className="h-3 w-3 text-violet-500" />
                              ) : (
                                <Store className="h-3 w-3 text-violet-500" />
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

        {activeTab === "flows" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Email Automations</h2>
                <p className="text-[13px] text-[#6b7280]">Create automated email sequences triggered by events</p>
              </div>
              <Button
                onClick={() => setShowCreateFlowDialog(true)}
                className="rounded-xl bg-violet-600 hover:bg-violet-700 cursor-pointer group"
              >
                <Plus className="h-4 w-4 mr-2 transition-transform duration-300 group-hover:rotate-90" />
                Create Flow
              </Button>
            </div>

            {/* Flows List */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
              </div>
            ) : flows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-violet-600" />
                </div>
                <h3 className="font-semibold text-[#1a1a2e] mb-2">No flows yet</h3>
                <p className="text-[13px] text-[#6b7280] max-w-sm mx-auto mb-6">
                  Create automated email sequences that trigger when customers make purchases or subscribe to your list.
                </p>
                <Button
                  onClick={() => setShowCreateFlowDialog(true)}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700 cursor-pointer group"
                >
                  <Plus className="h-4 w-4 mr-2 transition-transform duration-300 group-hover:rotate-90" />
                  Create your first flow
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {flows.map((flow) => {
                  const triggerInfo = getTriggerInfo(flow.trigger_type)
                  const TriggerIcon = triggerInfo.icon
                  return (
                    <div
                      key={flow.id}
                      className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleEditFlow(flow)}
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("p-2.5 rounded-xl", triggerInfo.color)}>
                              <TriggerIcon className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-[#1a1a2e]">{flow.name}</h3>
                              <p className="text-[13px] text-[#6b7280] mt-0.5">{triggerInfo.description}</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditFlow(flow); }}>
                                <Settings className="h-4 w-4 mr-2" />
                                Edit Flow
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleFlowStatus(flow); }}>
                                {flow.status === "active" ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pause
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteTarget({ type: "flow", id: flow.id })
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="px-5 py-3 bg-[#f9fafb] border-t border-[#e5e7eb]/60 flex items-center justify-between">
                        <div className="flex items-center gap-4 text-[12px] text-[#6b7280]">
                          <span>{(flow.steps || []).length} step{(flow.steps || []).length !== 1 ? "s" : ""}</span>
                          {flow.stats && (
                            <>
                              <span>{flow.stats.emails_sent} emails sent</span>
                              <span>{flow.stats.open_rate}% opens</span>
                            </>
                          )}
                        </div>
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium",
                          flow.status === "active"
                            ? "bg-green-100 text-green-700"
                            : flow.status === "paused"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        )}>
                          {flow.status === "active" && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                          {flow.status.charAt(0).toUpperCase() + flow.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "campaign"
                ? "Are you sure you want to delete this email? This action cannot be undone."
                : deleteTarget?.type === "flow"
                  ? "Are you sure you want to delete this flow? This action cannot be undone."
                  : "Are you sure you want to remove this subscriber? They will be unsubscribed from future emails."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="rounded-lg">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-lg">
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Flow Dialog */}
      <Dialog open={showCreateFlowDialog} onOpenChange={setShowCreateFlowDialog}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-600" />
              Create a new flow
            </DialogTitle>
            <DialogDescription>
              Choose a trigger to start your automated email sequence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {FLOW_TRIGGERS.map((trigger) => {
              const TriggerIcon = trigger.icon
              return (
                <button
                  key={trigger.id}
                  onClick={() => handleCreateFlow(trigger.id)}
                  className="w-full flex items-center gap-4 p-4 bg-white hover:bg-violet-50 rounded-xl border border-[#e5e7eb] hover:border-violet-300 transition-all text-left cursor-pointer group"
                >
                  <div className={cn("p-3 rounded-xl transition-transform group-hover:scale-105", trigger.color)}>
                    <TriggerIcon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#1a1a2e] group-hover:text-violet-700 transition-colors">{trigger.name}</h3>
                    <p className="text-[13px] text-[#6b7280]">{trigger.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#9ca3af] group-hover:text-violet-600 group-hover:translate-x-1 transition-all" />
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
