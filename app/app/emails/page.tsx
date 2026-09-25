"use client"

import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Switch } from "@/components/ui/switch"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Send,
  Users,
  Mail,
  Eye,
  Trash2,
  Search,
  Link2,
  Loader2,
  ArrowLeft,
  MousePointerClick,
  Check,
  X,
  Zap,
  ShoppingCart,
  UserPlus,
  ChevronRight,
  Timer,
  Sparkles,
  Type,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Image as ImageIcon,
  Square,
  AlignLeft,
  AlignCenter,
  Undo,
  Redo,
  Quote,
  MousePointer2,
  Minimize2,
  Maximize2,
  Minus,
} from "lucide-react"
import Link from "next/link"
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile"
import { EmailsHome, type FlowRow, type FlowTotals } from "./emails-home"
import { useRouter } from "next/navigation"
import { sourceView } from "@/lib/contacts/contact-source"
import { EmailComposer } from "@/components/email/compose/composer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type TabType = "subscribers" | "flows" | "published" | "scheduled" | "drafts"
type ViewType = "list" | "editor" | "analytics"

interface EmailCampaign {
  id: string
  subject: string
  body: string
  preview_text?: string
  status: "draft" | "scheduled" | "sending" | "sent" | "failed"
  audience_type: string
  audience_count: number
  recipient_count?: number  // From stats API
  unique_opens?: number     // From stats API
  unique_clicks?: number    // From stats API
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
  source: string
  /** Where they joined (lib/contacts/contact-source). */
  source_detail?: unknown
  consent_text?: string | null
  source_id?: string
  subscribed_at: string
  status: string
  is_active: boolean
  tags?: string[]
  unsubscribed_at?: string | null
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

export default function EmailsPage() {
  const router = useRouter()
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
  /** The email the composer has open: null for a new one. */
  const [composeId, setComposeId] = useState<string | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [previewText, setPreviewText] = useState("")
  const [audienceType, setAudienceType] = useState("all")
  const [selectedSegment, setSelectedSegment] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const [showSuccessToast, setShowSuccessToast] = useState(false)

  const triggerSuccessToast = useCallback(() => {
    setShowSuccessToast(true)
    window.setTimeout(() => {
      setShowSuccessToast(false)
    }, 6000)
  }, [])

  // Analytics state
  const [selectedCampaignStats, setSelectedCampaignStats] = useState<CampaignStats | null>(null)
  const [selectedCampaignForStats, setSelectedCampaignForStats] = useState<EmailCampaign | null>(null)
  const [selectedCampaignRecipients, setSelectedCampaignRecipients] = useState<{
    id: string
    email: string
    name: string | null
    status: string
    sent_at: string | null
    opened_at: string | null
    clicked_at: string | null
    open_count: number
    click_count: number
    unsubscribed: boolean
  }[]>([])
  const [recipientSearch, setRecipientSearch] = useState("")
  const [overviewStats, setOverviewStats] = useState<{
    total_sent: number
    total_opened: number
    total_clicked: number
    total_unsubscribed: number
    open_rate: number
    click_rate: number
  } | null>(null)
  /* The date picker every page in /app shares. */
  const statsTimeZone = useMemo(() => viewerTimeZone(), [])
  const statsToday = todayIn(statsTimeZone, Date.now())
  const [statsPeriod, setStatsPeriod] = useState<RangeValue>(() => resolveValue({ preset: "last_30_days" }, statsToday, "last_30_days"))
  const statsTimeRange = `${statsPeriod.preset}:${statsPeriod.start}:${statsPeriod.end}`
  /** The period as the two instants the stats routes read. All time sends none. */
  const statsRangeQuery = () => {
    if (statsPeriod.preset === "all_time") return "timeRange=all"
    const b = boundsOf(statsPeriod, statsTimeZone, Date.now())
    return `start=${encodeURIComponent(new Date(b.start).toISOString())}&end=${encodeURIComponent(new Date(b.end).toISOString())}`
  }
  const [isMobileTopToastVisible, setIsMobileTopToastVisible] = useState(false)

  /* Automations: the list only. A flow opens on its own page,
     app/app/emails/flow/[id]. */
  const [flows, setFlows] = useState<FlowRow[]>([])

  // Store checkout buyers count (for Store KPI)
  const [checkoutBuyersCount, setCheckoutBuyersCount] = useState(0)

  // Email usage tracking
  const [emailUsage, setEmailUsage] = useState({ sent: 0, limit: 3000 })

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "campaign" | "subscriber" | "flow"; id: string } | null>(null)

  useEffect(() => {
    const path = window.location.pathname
    if (path === "/app/emails/new") {
      setComposeId(null)
      setView("editor")
    } else if (path.startsWith("/app/emails/edit/")) {
      const campaignId = path.split("/app/emails/edit/")[1]
      if (campaignId) {
        /* The composer reads the email itself, through /api/email/campaigns. */
        setComposeId(campaignId)
        setView("editor")
      }
    } else {
      /* ?tab=drafts and friends, from the composer's way back. */
      const wanted = new URLSearchParams(window.location.search).get("tab")
      if (wanted === "drafts" || wanted === "scheduled" || wanted === "published" || wanted === "flows" || wanted === "subscribers") {
        setActiveTab(wanted)
        window.history.replaceState(window.history.state, "", "/app/emails")
      }
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [activeTab, statsTimeRange])

  const loadData = async (overrideTab?: string) => {
    // Use override tab if provided, otherwise use state
    const currentTab = overrideTab || activeTab

    setLoading(true)
    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

      if (!creator) return

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

    if (currentTab === "subscribers") {
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
        const productIds = products.map((p: { id: string }) => p.id)
        const { data: orders } = await supabase
          .from("orders")
          .select("buyer_email")
          .in("product_id", productIds)
          .eq("status", "completed")

        // Count unique buyer emails that are not already in subscribers
        const subscriberEmails = new Set((data || []).map((s: { email: string }) => s.email.toLowerCase()))
        const uniqueBuyerEmails = new Set(
          (orders || [])
            .map((o: { buyer_email?: string }) => o.buyer_email?.toLowerCase())
            .filter((email: string | undefined) => email && !subscriberEmails.has(email))
        )
        setCheckoutBuyersCount(uniqueBuyerEmails.size)
      } else {
        setCheckoutBuyersCount(0)
      }
    } else if (currentTab === "flows") {
      const { data } = await supabase
        .from("email_flows")
        .select("id, name, trigger_type, trigger_config, status, steps, updated_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })

      /* What each has sent, from the engine's own records. Before its SQL
         has run there are none, and the columns read a dash. */
      const { data: totals } = await supabase.rpc("email_flow_totals").then(
        (r: { data: unknown }) => r,
        () => ({ data: null }),
      )
      const byFlow = new Map<string, FlowTotals>(
        (Array.isArray(totals) ? totals : []).map((t: FlowTotals & { flow_id: string }) => [t.flow_id, t]),
      )
      setFlows((data || []).map((f: FlowRow) => ({ ...f, totals: byFlow.get(f.id) ?? null })))
    } else {
      // Use stats API to fetch campaigns and stats (bypasses RLS issues)
      const statusMap: Record<string, string> = {
        published: "sent",
        scheduled: "scheduled",
        drafts: "draft",
      }
      const status = statusMap[currentTab] || "draft"

      try {
        // Use the stats endpoint for Sent tab (includes tracking data), campaigns endpoint for others
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(7)
        const endpoint = currentTab === "published"
          ? `/api/email/stats?${statsRangeQuery()}&_t=${timestamp}&_r=${randomId}`
          : `/api/email/campaigns?status=${status}&${statsRangeQuery()}&_t=${timestamp}&_r=${randomId}`

        console.log("[emails page] Fetching:", endpoint)

        const response = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })

        if (response.ok) {
          const result = await response.json()
          console.log("[emails page] Received:", {
            endpoint,
            campaignCount: result.campaigns?.length || 0,
            stats: result.stats,
            monthly: result.monthlyUsage,
            debug: result.debug
          })

          // Update campaigns list
          setCampaigns(result.campaigns || [])

          // Set stats for Sent tab
          if (currentTab === "published") {
            setOverviewStats({
              total_sent: result.stats?.totalSent || 0,
              total_opened: result.stats?.totalOpens || 0,
              total_clicked: result.stats?.totalClicks || 0,
              total_unsubscribed: result.stats?.totalUnsubscribed || 0,
              open_rate: result.stats?.openRate || 0,
              click_rate: result.stats?.clickRate || 0,
            })

            setEmailUsage({
              sent: result.monthlyUsage?.sent || 0,
              limit: result.monthlyUsage?.limit || 3000,
            })
          }
        } else {
          const errorText = await response.text()
          console.error("[emails page] Fetch failed:", response.status, errorText)
          setCampaigns([])
        }
      } catch (err) {
        console.error("[emails page] Fetch error:", err)
        setCampaigns([])
      }
    }
    } catch (err) {
      console.error("[emails page] loadData failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleNewEmail = () => {
    setEditingCampaign(null)
    setComposeId(null)
    setView("editor")
    // Update URL to /emails/new without full page reload
    window.history.pushState({}, "", "/app/emails/new")
  }

  const handleEditCampaign = (campaign: EmailCampaign) => {
    setEditingCampaign(campaign)
    setComposeId(campaign.id)
    setView("editor")
    // Update URL to /emails/edit/id without full page reload
    window.history.pushState({}, "", `/app/emails/edit/${campaign.id}`)
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

      console.log("[emails page] Resending campaign:", newCampaign.id)

      // Send the new campaign
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: newCampaign.id }),
      })

      const responseData = await response.json()
      console.log("[emails page] Resend response:", responseData)

      if (!response.ok) {
        throw new Error(responseData.error || "Failed to send resend campaign")
      }

      // Clear state to trigger loading
      setCampaigns([])
      setOverviewStats(null)

      // Small delay then fetch fresh data
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log("[emails page] Refreshing after resend...")
      await loadData("published")

      toast({
        title: "Email resent!",
        description: responseData.recipients
          ? `Sending to ${responseData.recipients} subscriber${responseData.recipients !== 1 ? "s" : ""}. The copy is in your sent list.`
          : "The copy is in your sent list.",
      })
    } catch (error) {
      console.error("[emails page] Resend error:", error)
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
      /* Through the server, which takes everyone out of it first. */
      await fetch(`/api/automations/flows/${deleteTarget.id}`, { method: "DELETE" }).catch(() => null)
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

  const handleEditFlow = (flow: FlowRow) => {
    router.push(`/app/emails/flow/${flow.id}`)
  }

  /**
   * The list's switch. The server checks a flow is complete before it goes
   * on, and turning one off takes out everyone partway through, so both are
   * its answer to give (app/api/automations/flows/[id]/status).
   */
  const handleToggleFlowStatus = async (flow: FlowRow) => {
    const on = flow.status !== "active"
    const res = await fetch(`/api/automations/flows/${flow.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).catch(() => null)
    const out = res ? await res.json().catch(() => ({})) : {}
    if (!res || !res.ok) {
      const first = Array.isArray(out.problems) && out.problems[0]?.message
      toast({ title: on ? "Not turned on" : "Not turned off", description: first || out.error || "Try again.", variant: "destructive" })
      return
    }
    loadData()
    toast({
      title: on ? "On" : "Off",
      description: on
        ? "It starts for people who trigger it from now on."
        : out.stopped > 0
          ? `${out.stopped} ${out.stopped === 1 ? "person" : "people"} partway through will get nothing more.`
          : "Nobody new starts it. Sign-ups and orders are still recorded.",
    })
  }

  const handleViewStats = async (campaign: EmailCampaign) => {
    setSelectedCampaignForStats(campaign)
    setSelectedCampaignRecipients([])
    setRecipientSearch("")

    // Use stats from campaign object if available (from stats API)
    const totalSent = campaign.recipient_count || campaign.audience_count || 1
    const opened = campaign.unique_opens || 0
    const clicked = campaign.unique_clicks || 0

    // Fetch detailed stats and recipients from API
    let counts = {
      sent: totalSent,
      delivered: totalSent,
      opened: opened,
      clicked: clicked,
      bounced: 0,
      unsubscribed: 0,
    }

    try {
      const statsRes = await fetch(`/api/email/stats?campaignId=${campaign.id}&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        console.log("[handleViewStats] Received:", statsData)

        if (statsData.stats) {
          counts.sent = statsData.stats.sent || counts.sent
          counts.delivered = statsData.stats.delivered || counts.delivered
          counts.opened = statsData.stats.opened || counts.opened
          counts.clicked = statsData.stats.clicked || counts.clicked
          counts.bounced = statsData.stats.bounced || 0
          counts.unsubscribed = statsData.stats.unsubscribed || 0
        }

        // Get recipients list
        if (statsData.recipients && Array.isArray(statsData.recipients)) {
          setSelectedCampaignRecipients(statsData.recipients)
        }

        // Update campaign with body if returned
        if (statsData.campaign?.body && !campaign.body) {
          setSelectedCampaignForStats({ ...campaign, body: statsData.campaign.body })
        }
      }
    } catch (err) {
      console.error("Failed to fetch campaign stats:", err)
    }

    setSelectedCampaignStats({
      total_sent: counts.sent,
      delivered: counts.delivered,
      opened: counts.opened,
      clicked: counts.clicked,
      bounced: counts.bounced,
      unsubscribed: counts.unsubscribed,
      open_rate: counts.sent > 0 ? Math.round((counts.opened / counts.sent) * 100) : 0,
      click_rate: counts.sent > 0 ? Math.round((counts.clicked / counts.sent) * 100) : 0,
    })

    setView("analytics")
  }

  /** Every subscribed address as a CSV, named for today. */
  const exportSubscribers = () => {
    const activeSubscribers = subscribers.filter((s) => s.status === "subscribed")
    if (activeSubscribers.length === 0) {
      toast({ title: "No subscribers", description: "There are no subscribers to export", variant: "destructive" })
      return
    }
    const headers = ["Email", "Name", "Source", "Source detail", "Status", "Subscribed Date"]
    const rows = activeSubscribers.map((s) => [
      s.email,
      s.name || "",
      sourceView(s.source_detail, s.source).label,
      sourceView(s.source_detail, s.source).detail,
      s.status === "subscribed" && s.unsubscribed_at ? "resubscribed" : s.status,
      s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString() : "",
    ])
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
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
      <div className="h-full overflow-y-auto page-scroll bg-gray-50/50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => { setView("list"); window.history.pushState({}, "", "/app/emails"); }} className="h-9 w-9 cursor-pointer">
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

          {/* Email Preview */}
          <div className="bg-white rounded-xl border overflow-hidden mb-6">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-900">Email Preview</h3>
            </div>
            <div className="p-6 bg-gray-100">
              <div className="max-w-[600px] mx-auto bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Email header */}
                <div className="px-6 py-4 border-b bg-gray-50">
                  <p className="text-sm text-gray-500">Subject</p>
                  <p className="font-semibold text-gray-900">{selectedCampaignForStats.subject}</p>
                  {selectedCampaignForStats.preview_text && (
                    <p className="text-sm text-gray-500 mt-1">{selectedCampaignForStats.preview_text}</p>
                  )}
                </div>
                {/* Email body */}
                <div className="p-6">
                  <div
                    className="prose prose-sm max-w-none"
                    style={{
                      color: '#374151',
                      lineHeight: '1.7',
                      fontSize: '16px'
                    }}
                    dangerouslySetInnerHTML={{ __html: selectedCampaignForStats.body || '<p class="text-gray-400 italic">No content</p>' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Recipients List */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                <h3 className="font-medium text-gray-900">Recipients ({selectedCampaignRecipients.length})</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search recipients..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border rounded-lg w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              {selectedCampaignRecipients.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>No recipients found</p>
                  <p className="text-sm">Recipients will appear here after the email is sent</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Opened</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Clicked</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Unsubscribed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedCampaignRecipients
                      .filter(r =>
                        r.email.toLowerCase().includes(recipientSearch.toLowerCase()) ||
                        (r.name && r.name.toLowerCase().includes(recipientSearch.toLowerCase()))
                      )
                      .slice(0, 100)
                      .map((recipient) => (
                        <tr key={recipient.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{recipient.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{recipient.name || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              recipient.status === 'sent' ? 'bg-green-100 text-green-800' :
                              recipient.status === 'bounced' ? 'bg-red-100 text-red-800' :
                              recipient.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {recipient.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {recipient.opened_at ? (
                              <div className="flex flex-col items-center">
                                <Eye className="h-4 w-4 text-green-500" />
                                <span className="text-xs text-gray-500">{recipient.open_count || 1}x</span>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {recipient.clicked_at ? (
                              <div className="flex flex-col items-center">
                                <MousePointerClick className="h-4 w-4 text-blue-500" />
                                <span className="text-xs text-gray-500">{recipient.click_count || 1}x</span>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {recipient.unsubscribed ? (
                              <X className="h-4 w-4 text-red-500 mx-auto" />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {selectedCampaignRecipients.length > 100 && (
                <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-500 text-center">
                  Showing first 100 of {selectedCampaignRecipients.length} recipients
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Editor View: the composer owns the email, its saving and its sending.
  if (view === "editor") {
    return (
      <EmailComposer
        key={composeId ?? "new"}
        campaignId={composeId}
        onExit={(tab) => {
          setView("list")
          setComposeId(null)
          window.history.pushState({}, "", "/app/emails")
          const next = tab ?? activeTab
          setActiveTab(next)
          if (next === activeTab) loadData(next)
        }}
      />
    )
  }

  // List View
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      {showSuccessToast && (
        <div className="hidden md:block fixed left-1/2 -translate-x-1/2 z-[220] top-4 w-auto animate-in fade-in slide-in-from-top-2 duration-300 px-1 pointer-events-none">
          <div className="bg-black text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium text-center whitespace-nowrap">
            Email sent successfully
          </div>
        </div>
      )}
      {isMobileTopToastVisible && (
        <div className="md:hidden fixed left-1/2 -translate-x-1/2 z-[220] top-[calc(68px+env(safe-area-inset-top)+10px)] w-[calc(100%-24px)] max-w-[360px] animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
          <div className="rounded-xl border border-black/10 bg-black/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-xl backdrop-blur-sm whitespace-nowrap">
            Email sent successfully
          </div>
        </div>
      )}
      {/* Announcement Bar — fixed above black header on mobile */}
      <AnnouncementBarMobile>
        <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
          <span className="text-[12px] md:text-[14px] text-white/90">
            <span className="font-semibold text-white">Try Pro</span>
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
      </AnnouncementBarMobile>

      <EmailsHome
        tab={activeTab}
        onTab={setActiveTab}
        loading={loading}
        onNewEmail={handleNewEmail}
        subscribers={subscribers}
        checkoutBuyersCount={checkoutBuyersCount}
        search={searchQuery}
        onSearch={setSearchQuery}
        onExportSubscribers={exportSubscribers}
        onCopyEmail={(email) => {
          navigator.clipboard.writeText(email)
          toast({ title: "Copied", description: "Email copied to clipboard" })
        }}
        onRemoveSubscriber={(id) => {
          setDeleteTarget({ type: "subscriber", id })
          setShowDeleteDialog(true)
        }}
        flows={flows}
        onCreateFlow={() => router.push("/app/emails/flow/new")}
        onEditFlow={handleEditFlow}
        onToggleFlow={handleToggleFlowStatus}
        onDeleteFlow={(id) => {
          setDeleteTarget({ type: "flow", id })
          setShowDeleteDialog(true)
        }}
        campaigns={campaigns}
        onOpenCampaign={(c) => (activeTab === "published" && (c as EmailCampaign).status === "sent" ? handleViewStats(c as EmailCampaign) : handleEditCampaign(c as EmailCampaign))}
        onViewStats={(c) => handleViewStats(c as EmailCampaign)}
        onResend={(c) => handleResend(c as EmailCampaign)}
        onEditCampaign={(c) => handleEditCampaign(c as EmailCampaign)}
        onDeleteCampaign={(id) => {
          setDeleteTarget({ type: "campaign", id })
          setShowDeleteDialog(true)
        }}
        isSending={isSending}
        overview={overviewStats}
        usage={emailUsage}
        period={statsPeriod}
        onPeriod={setStatsPeriod}
        today={statsToday}
      />

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

    </div>
  )
}
