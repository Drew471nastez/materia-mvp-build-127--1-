"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
  source: "onepage" | "store_builder"
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

const statsTimeframeOptions = [
  { value: "7d" as const, label: "Last 7 days" },
  { value: "30d" as const, label: "Last 30 days" },
  { value: "90d" as const, label: "Last 90 days" },
  { value: "all" as const, label: "All time" },
]

function TimeframeBottomSheet({
  isOpen,
  onClose,
  selectedValue,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  selectedValue: "7d" | "30d" | "90d" | "all"
  onSelect: (value: "7d" | "30d" | "90d" | "all") => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)))
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(onClose, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    startY.current = touch.clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) setDragY(diff * 0.9)
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-400 ease-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: "400ms" }}
        onClick={handleClose}
      />
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? "none" : "transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)",
        }}
      >
        <div className="pt-3 pb-2">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Select time period</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            {statsTimeframeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSelect(option.value)
                  handleClose()
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  selectedValue === option.value
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

const FLOW_TRIGGERS = [
  {
    id: "purchase",
    name: "Purchase",
    description: "When a customer purchases your product",
    icon: ShoppingCart,
    color: "bg-emerald-100 text-emerald-700",
    defaultSubject: "Thank you for your purchase!",
    defaultBody: `<p>Hi there!</p>
<p>Thank you so much for purchasing! I'm really excited for you to dive in and start your journey.</p>
<p>I created this product because I believe it can truly help you achieve your goals. I've put my heart into making this as valuable as possible, and I hope it serves you well.</p>
<p>If you have any questions at all, just reply to this email - I read every message personally!</p>
<p>Best,<br/>[Your name]</p>`,
  },
  {
    id: "new_subscriber",
    name: "New Subscriber",
    description: "When someone subscribes to your email list",
    icon: UserPlus,
    color: "bg-blue-100 text-blue-700",
    defaultSubject: "Welcome to the community!",
    defaultBody: `<p>Hey there!</p>
<p>Welcome! I'm so glad you decided to join.</p>
<p>I'm passionate about helping people like you succeed, and I'll be sharing my best tips, insights, and exclusive content with you.</p>
<p>Feel free to reply to this email and introduce yourself - I'd love to hear from you!</p>
<p>Talk soon,<br/>[Your name]</p>`,
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
  const [statsTimeRange, setStatsTimeRange] = useState<"7d" | "30d" | "90d" | "all">("30d")
  const [isStatsTimeframeSheetOpen, setIsStatsTimeframeSheetOpen] = useState(false)
  const [isMobileTopToastVisible, setIsMobileTopToastVisible] = useState(false)

  // Flows state
  const [flows, setFlows] = useState<EmailFlow[]>([])
  const [editingFlow, setEditingFlow] = useState<EmailFlow | null>(null)
  const [showCreateFlowDialog, setShowCreateFlowDialog] = useState(false)
  const [flowHasUnsavedChanges, setFlowHasUnsavedChanges] = useState(false)
  const [showFlowUnsavedDialog, setShowFlowUnsavedDialog] = useState(false)
  const [initialFlowState, setInitialFlowState] = useState<string>("")

  // Flow editor image/button menu state
  const [flowSelectedImage, setFlowSelectedImage] = useState<HTMLImageElement | null>(null)
  const [flowShowImageMenu, setFlowShowImageMenu] = useState(false)
  const [flowImageMenuPosition, setFlowImageMenuPosition] = useState({ x: 0, y: 0 })
  const [flowSelectedButton, setFlowSelectedButton] = useState<HTMLElement | null>(null)
  const [flowShowButtonMenu, setFlowShowButtonMenu] = useState(false)
  const [flowButtonMenuPosition, setFlowButtonMenuPosition] = useState({ x: 0, y: 0 })
  const [flowButtonText, setFlowButtonText] = useState("")
  const [flowButtonUrl, setFlowButtonUrl] = useState("")
  const [flowButtonColor, setFlowButtonColor] = useState("#2563eb")
  const [flowButtonAlign, setFlowButtonAlign] = useState<"left" | "center" | "right">("center")
  const [flowShowProductDialog, setFlowShowProductDialog] = useState(false)
  const [flowProducts, setFlowProducts] = useState<{ id: string; title: string; slug: string; price_cents: number; thumbnail_url?: string }[]>([])
  const [flowLoadingProducts, setFlowLoadingProducts] = useState(false)
  const [flowProductSearch, setFlowProductSearch] = useState("")
  const [flowIsUploadingImage, setFlowIsUploadingImage] = useState(false)
  const [flowShowLinkDialog, setFlowShowLinkDialog] = useState(false)
  const [flowLinkUrl, setFlowLinkUrl] = useState("")
  const [flowLinkText, setFlowLinkText] = useState("")
  const [flowShowSendTestModal, setFlowShowSendTestModal] = useState(false)
  const [flowTestEmail, setFlowTestEmail] = useState("")
  const [showFlowSaveNotification, setShowFlowSaveNotification] = useState(false)
  const [flowSaveNotificationMessage, setFlowSaveNotificationMessage] = useState("")
  const flowEditorInitialized = useRef(false)
  const [flowSavedSelection, setFlowSavedSelection] = useState<Range | null>(null)

  // Store checkout buyers count (for Store KPI)
  const [checkoutBuyersCount, setCheckoutBuyersCount] = useState(0)

  // Email usage tracking
  const [emailUsage, setEmailUsage] = useState({ sent: 0, limit: 3000 })

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "campaign" | "subscriber" | "flow"; id: string } | null>(null)

  useEffect(() => {
    const path = window.location.pathname
    const flowMatch = path.match(/^\/app\/emails\/flow\/([^/]+)$/)

    if (flowMatch?.[1]) {
      const flowId = flowMatch[1]
      setView("flow-editor")
      setActiveTab("flows")
      ;(async () => {
        const supabase = createClient()
        const { data } = await supabase.from("email_flows").select("*").eq("id", flowId).maybeSingle()
        if (data) {
          setEditingFlow(data)
          setInitialFlowState(JSON.stringify(data))
        } else {
          setView("list")
          window.history.replaceState({}, "", "/app/emails")
        }
      })()
      return
    }

    if (path === "/app/emails/new") {
      setView("editor")
    } else if (path.startsWith("/app/emails/edit/")) {
      const campaignId = path.split("/app/emails/edit/")[1]
      if (campaignId) {
        ;(async () => {
          const supabase = createClient()
          const { data } = await supabase.from("email_campaigns").select("*").eq("id", campaignId).maybeSingle()
          if (data) {
            setEditingCampaign(data as EmailCampaign)
            setSubject(data.subject || "")
            setBody(data.body || "")
            setPreviewText(data.preview_text || "")
            setAudienceType(data.audience_type || "all")
            setSelectedSegment(data.segment_id || "")
            setView("editor")
          }
        })()
      }
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [activeTab, statsTimeRange])

  // Initialize flow editor content when entering edit mode
  useEffect(() => {
    if (view === "flow-editor" && editingFlow && flowEditorRef.current && !flowEditorInitialized.current) {
      const step = (editingFlow.steps || []).find(s => s.type === "email")
      if (step?.config?.body) {
        flowEditorRef.current.innerHTML = step.config.body
      }
      flowEditorInitialized.current = true
    }
    // Reset flag when leaving flow editor
    if (view !== "flow-editor") {
      flowEditorInitialized.current = false
    }
  }, [view, editingFlow])

  const loadData = async (overrideTab?: string) => {
    // Use override tab if provided, otherwise use state
    const currentTab = overrideTab || activeTab

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
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })

      setFlows(data || [])
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
          ? `/api/email/stats?timeRange=${statsTimeRange}&_t=${timestamp}&_r=${randomId}`
          : `/api/email/campaigns?status=${status}&timeRange=${statsTimeRange}&_t=${timestamp}&_r=${randomId}`

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
    // Update URL to /emails/new without full page reload
    window.history.pushState({}, "", "/app/emails/new")
  }

  const handleEditCampaign = (campaign: EmailCampaign) => {
    setEditingCampaign(campaign)
    setSubject(campaign.subject)
    setBody(campaign.body)
    setPreviewText(campaign.preview_text || "")
    setAudienceType(campaign.audience_type)
    setSelectedSegment(campaign.segment_id || "")
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
        description: `Successfully resent to ${responseData.sent} subscriber${responseData.sent !== 1 ? "s" : ""}. A new copy was created in your sent list.`,
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

    // Check if flow of this type already exists
    const existingFlow = flows.find(f => f.trigger_type === triggerType)
    if (existingFlow) {
      const flowTypeName = triggerType === "purchase" ? "Purchase" : "New Subscriber"
      toast({
        title: `Already have a ${flowTypeName} flow added`,
        description: `You can only have one ${flowTypeName} flow. Edit the existing one instead.`,
        variant: "destructive"
      })
      setShowCreateFlowDialog(false)
      return
    }

    // Create default email step with preset content
    const defaultStep = {
      id: `step_${Date.now()}`,
      type: "email",
      order: 0,
      config: {
        subject: triggerInfo?.defaultSubject || "Thank you!",
        body: triggerInfo?.defaultBody || "<p>Thank you for being part of our community!</p>",
        delay_value: 0,
        delay_unit: "minutes",
      }
    }

    const { data: newFlow, error } = await supabase
      .from("email_flows")
      .insert({
        creator_id: creatorId,
        name: `${triggerInfo?.name || 'New'} Flow`,
        trigger_type: triggerType,
        status: "draft",
        steps: [defaultStep],
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
    setInitialFlowState(JSON.stringify(newFlow))
    setFlowHasUnsavedChanges(false)
    setView("flow-editor")
    window.history.pushState({}, "", `/app/emails/flow/${newFlow.id}`)
  }

  const handleEditFlow = (flow: EmailFlow) => {
    setEditingFlow(flow)
    setInitialFlowState(JSON.stringify(flow))
    setFlowHasUnsavedChanges(false)
    setView("flow-editor")
    window.history.pushState({}, "", `/app/emails/flow/${flow.id}`)
  }

  const handleToggleFlowStatus = async (flow: EmailFlow) => {
    const supabase = createClient()
    const newStatus = flow.status === "active" ? "paused" : "active"

    const { error } = await supabase
      .from("email_flows")
      .update({ status: newStatus })
      .eq("id", flow.id)

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update flow status",
        variant: "destructive"
      })
      return
    }

    // Update editingFlow state if we're editing this flow
    if (editingFlow && editingFlow.id === flow.id) {
      const updatedFlow = { ...editingFlow, status: newStatus as "active" | "paused" | "draft" }
      setEditingFlow(updatedFlow)
      // Update initial state to prevent false unsaved changes warning
      setInitialFlowState(JSON.stringify(updatedFlow))
    }

    loadData()
    toast({
      title: newStatus === "active" ? "Flow activated" : "Flow paused",
      description: newStatus === "active"
        ? "This flow will now send emails automatically"
        : "This flow has been paused",
    })
  }

  const [isFlowSaving, setIsFlowSaving] = useState(false)

  const handleSaveFlow = async (flowData: Partial<EmailFlow>) => {
    if (!editingFlow) return

    setIsFlowSaving(true)
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from("email_flows")
        .update({
          name: flowData.name,
          description: flowData.description,
          steps: flowData.steps,
          trigger_config: flowData.trigger_config,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFlow.id)

      if (error) throw error

      // Reset unsaved changes state after successful save
      const updatedFlow = { ...editingFlow, ...flowData }
      setInitialFlowState(JSON.stringify(updatedFlow))
      setFlowHasUnsavedChanges(false)

      // Show smooth notification at top of screen
      if (editingFlow.status === "active") {
        setFlowSaveNotificationMessage("Flow is active and running")
      } else {
        setFlowSaveNotificationMessage("Flow saved as draft")
      }
      setShowFlowSaveNotification(true)
      setTimeout(() => setShowFlowSaveNotification(false), 5000)

      setView("list")
      setEditingFlow(null)
      window.history.pushState({}, "", "/app/emails")
      loadData()
    } catch (error) {
      toast({
        title: "Error saving flow",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      })
    } finally {
      setIsFlowSaving(false)
    }
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

  // Flow Editor View - Rich text editor matching normal email editor
  const flowEditorRef = useRef<HTMLDivElement>(null)
  const [flowEditorContent, setFlowEditorContent] = useState("")

  // Rich text editor commands for flow editor
  const flowExecCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    flowEditorRef.current?.focus()
    if (flowEditorRef.current) {
      setFlowEditorContent(flowEditorRef.current.innerHTML)
    }
  }, [])

  const flowInsertHeading = () => flowExecCommand("formatBlock", "h2")
  const flowInsertBold = () => flowExecCommand("bold")
  const flowInsertItalic = () => flowExecCommand("italic")
  const flowInsertStrikethrough = () => flowExecCommand("strikeThrough")
  const flowInsertList = () => flowExecCommand("insertUnorderedList")
  const flowInsertOrderedList = () => flowExecCommand("insertOrderedList")
  const flowInsertQuote = () => flowExecCommand("formatBlock", "blockquote")
  const flowAlignLeft = () => flowExecCommand("justifyLeft")
  const flowAlignCenter = () => flowExecCommand("justifyCenter")
  const flowUndoAction = () => flowExecCommand("undo")
  const flowRedoAction = () => flowExecCommand("redo")

  const flowInsertLink = () => {
    const selection = window.getSelection()
    if (selection && selection.toString()) {
      setFlowLinkText(selection.toString())
    }
    setFlowShowLinkDialog(true)
  }

  const flowConfirmInsertLink = () => {
    if (flowLinkUrl) {
      const fullUrl = flowLinkUrl.startsWith("http") ? flowLinkUrl : `https://${flowLinkUrl}`
      if (flowLinkText) {
        flowExecCommand("insertHTML", `<a href="${fullUrl}" style="color: #2563eb; text-decoration: underline;">${flowLinkText}</a>`)
      } else {
        flowExecCommand("createLink", fullUrl)
      }
    }
    setFlowShowLinkDialog(false)
    setFlowLinkUrl("")
    setFlowLinkText("")
  }

  const flowInsertButton = () => {
    const buttonId = `btn-${Date.now()}`
    const buttonHtml = `
      <div style="text-align: center; margin: 20px 0;" class="email-button-wrapper" data-button-id="${buttonId}">
        <a href="#" class="email-cta-button" data-button-id="${buttonId}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; cursor: pointer;">Click to edit</a>
      </div>
    `
    flowExecCommand("insertHTML", buttonHtml)
    // Auto-select the button for editing
    setTimeout(() => {
      const btn = flowEditorRef.current?.querySelector(`[data-button-id="${buttonId}"]`) as HTMLElement
      if (btn) {
        flowSelectButton(btn)
      }
    }, 100)
  }

  const flowInsertDivider = () => {
    const dividerId = `divider-${Date.now()}`
    const dividerHtml = `<div style="margin: 24px 0; text-align: center;"><hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;" /></div><p id="${dividerId}"><br></p>`
    flowExecCommand("insertHTML", dividerHtml)
    // Move cursor to the paragraph after the divider
    setTimeout(() => {
      const newParagraph = flowEditorRef.current?.querySelector(`#${dividerId}`)
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

  const flowSelectButton = (btn: HTMLElement) => {
    setFlowSelectedButton(btn)
    const linkEl = btn.tagName === 'A' ? btn : btn.querySelector('a')
    if (linkEl) {
      setFlowButtonText(linkEl.textContent || "")
      setFlowButtonUrl(linkEl.getAttribute('href') || "")
      setFlowButtonColor(linkEl.style.backgroundColor || "#2563eb")
    }
    const wrapper = btn.closest('.email-button-wrapper') as HTMLElement
    const align = wrapper?.style.textAlign || "center"
    setFlowButtonAlign(align as "left" | "center" | "right")

    // Use viewport coordinates for fixed positioning
    const rect = btn.getBoundingClientRect()
    setFlowButtonMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setFlowShowButtonMenu(true)
  }

  const flowUpdateButton = () => {
    if (flowSelectedButton && flowButtonText && flowButtonUrl && editingFlow) {
      const linkEl = flowSelectedButton.tagName === 'A' ? flowSelectedButton : flowSelectedButton.querySelector('a')
      const wrapper = flowSelectedButton.closest('.email-button-wrapper') as HTMLElement

      if (linkEl) {
        const fullUrl = flowButtonUrl.startsWith("http") ? flowButtonUrl : `https://${flowButtonUrl}`
        linkEl.textContent = flowButtonText
        linkEl.setAttribute('href', fullUrl)
        ;(linkEl as HTMLElement).style.backgroundColor = flowButtonColor
      }
      if (wrapper) {
        wrapper.style.textAlign = flowButtonAlign
      }
      // Sync the updated content to state
      if (flowEditorRef.current) {
        const content = flowEditorRef.current.innerHTML
        setFlowEditorContent(content)
        // Update the editing flow steps directly
        const newSteps = (editingFlow.steps || []).map(s =>
          s.type === "email" ? { ...s, config: { ...s.config, body: content } } : s
        )
        editingFlow.steps = newSteps
      }
    }
    setFlowShowButtonMenu(false)
    setFlowSelectedButton(null)
  }

  const flowDeleteButton = () => {
    if (flowSelectedButton) {
      const wrapper = flowSelectedButton.closest('.email-button-wrapper')
      if (wrapper) {
        wrapper.remove()
      } else {
        flowSelectedButton.remove()
      }
      if (flowEditorRef.current) {
        setFlowEditorContent(flowEditorRef.current.innerHTML)
      }
    }
    setFlowShowButtonMenu(false)
    setFlowSelectedButton(null)
  }

  const flowInsertImage = async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setFlowIsUploadingImage(true)
        try {
          const formData = new FormData()
          formData.append("file", file)
          const response = await fetch("/api/email/upload-image", {
            method: "POST",
            body: formData,
          })
          const data = await response.json()
          if (response.ok) {
            const imgHtml = `<img src="${data.url}" class="email-image" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; cursor: pointer;" data-size="normal" />`
            flowExecCommand("insertHTML", imgHtml)
            toast({ title: "Image uploaded", description: "Image added to your email" })
          } else {
            throw new Error(data.error || "Upload failed")
          }
        } catch (err) {
          // Fallback to base64
          const reader = new FileReader()
          reader.onload = () => {
            const imgHtml = `<img src="${reader.result}" class="email-image" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px 0; cursor: pointer;" data-size="normal" />`
            flowExecCommand("insertHTML", imgHtml)
          }
          reader.readAsDataURL(file)
          toast({ title: "Using embedded image", description: "Image may not display properly in all email clients" })
        } finally {
          setFlowIsUploadingImage(false)
        }
      }
    }
    input.click()
  }

  const flowResizeImage = (size: 'small' | 'medium' | 'large' | 'normal') => {
    if (flowSelectedImage) {
      const sizes = {
        small: '200px',
        medium: '350px',
        large: '500px',
        normal: '100%'
      }
      flowSelectedImage.style.maxWidth = sizes[size]
      flowSelectedImage.setAttribute('data-size', size)
      if (flowEditorRef.current) {
        setFlowEditorContent(flowEditorRef.current.innerHTML)
      }
    }
    setFlowShowImageMenu(false)
  }

  const flowDeleteImage = () => {
    if (flowSelectedImage) {
      flowSelectedImage.remove()
      if (flowEditorRef.current) {
        setFlowEditorContent(flowEditorRef.current.innerHTML)
      }
    }
    setFlowShowImageMenu(false)
    setFlowSelectedImage(null)
  }

  // Handle editor click for image/button selection
  const handleFlowEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      e.preventDefault()
      const img = target as HTMLImageElement
      setFlowSelectedImage(img)
      // Use viewport coordinates for fixed positioning
      const rect = img.getBoundingClientRect()
      setFlowImageMenuPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      })
      setFlowShowImageMenu(true)
      setFlowShowButtonMenu(false)
      setFlowSelectedButton(null)
    } else if (target.classList.contains('email-cta-button') || target.closest('.email-cta-button')) {
      e.preventDefault()
      const btn = target.classList.contains('email-cta-button') ? target : target.closest('.email-cta-button') as HTMLElement
      if (btn) {
        flowSelectButton(btn)
        setFlowShowImageMenu(false)
        setFlowSelectedImage(null)
      }
    } else {
      setFlowShowImageMenu(false)
      setFlowSelectedImage(null)
      setFlowShowButtonMenu(false)
      setFlowSelectedButton(null)
    }
  }

  // Load products for flow editor
  const flowLoadProducts = async () => {
    if (!creatorId) return
    setFlowLoadingProducts(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("products")
      .select("id, title, slug, price_cents, thumbnail_url")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("title")
    setFlowProducts(data || [])
    setFlowLoadingProducts(false)
  }

  // Insert product link
  const flowInsertProductLink = (product: { id: string; title: string; slug: string }) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    const productUrl = `${baseUrl}/p/${product.slug}`
    const linkHtml = `<a href="${productUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${product.title}</a>`

    // Close dialog first
    setFlowShowProductDialog(false)
    setFlowProductSearch("")

    // Restore selection and insert at cursor position
    setTimeout(() => {
      flowEditorRef.current?.focus()

      // Restore the saved selection if we have one
      if (flowSavedSelection) {
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(flowSavedSelection)
        }
      }

      flowExecCommand("insertHTML", linkHtml + " ")
      setFlowSavedSelection(null)
    }, 50)
  }

  // Open product dialog
  const flowOpenProductDialog = () => {
    // Save the current selection before opening dialog
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      setFlowSavedSelection(selection.getRangeAt(0).cloneRange())
    }
    flowLoadProducts()
    setFlowShowProductDialog(true)
  }

  // Filter products for flow editor
  const flowFilteredProducts = flowProducts.filter((p) => p.title.toLowerCase().includes(flowProductSearch.toLowerCase()))

  // Click outside handler for menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flowShowImageMenu && !(e.target as HTMLElement).closest('.flow-image-menu')) {
        setFlowShowImageMenu(false)
        setFlowSelectedImage(null)
      }
      if (flowShowButtonMenu && !(e.target as HTMLElement).closest('.flow-button-menu')) {
        setFlowShowButtonMenu(false)
        setFlowSelectedButton(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [flowShowImageMenu, flowShowButtonMenu])

  // Track flow unsaved changes
  useEffect(() => {
    if (editingFlow && initialFlowState) {
      const currentState = JSON.stringify(editingFlow)
      setFlowHasUnsavedChanges(currentState !== initialFlowState)
    }
  }, [editingFlow, initialFlowState])

  // Flow editor browser back/refresh warning - ALWAYS show warning when in flow editor
  useEffect(() => {
    if (view !== "flow-editor" || !editingFlow) return

    // Always warn when trying to leave the flow editor
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?"
      return e.returnValue
    }

    // Handle browser back button - always show popup
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault()
      // Push state again to prevent navigation
      window.history.pushState({ flowEditor: true }, "", `/app/emails/flow/${editingFlow.id}`)
      setShowFlowUnsavedDialog(true)
    }

    // Initialize history state for flow editor
    window.history.pushState({ flowEditor: true }, "", `/app/emails/flow/${editingFlow.id}`)

    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [view, editingFlow])

  const handleFlowBack = () => {
    if (flowHasUnsavedChanges) {
      setShowFlowUnsavedDialog(true)
    } else {
      setView("list")
      setEditingFlow(null)
      window.history.pushState({}, "", "/app/emails")
    }
  }

  const [isFlowSendingTest, setIsFlowSendingTest] = useState(false)

  const openFlowSendTestModal = async () => {
    if (!editingFlow) return
    const emailStep = (editingFlow.steps || []).find(s => s.type === "email")
    if (!emailStep?.config.subject || !emailStep?.config.body) {
      toast({ title: "Missing content", description: "Please add a subject and body before sending a test", variant: "destructive" })
      return
    }

    // Pre-fill with user's email
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      setFlowTestEmail(user.email)
    }
    setFlowShowSendTestModal(true)
  }

  const handleFlowSendTest = async () => {
    if (!editingFlow || !flowTestEmail) return
    const emailStep = (editingFlow.steps || []).find(s => s.type === "email")
    if (!emailStep?.config.subject || !emailStep?.config.body) {
      toast({ title: "Missing content", description: "Please add a subject and body before sending a test", variant: "destructive" })
      return
    }

    setIsFlowSendingTest(true)

    try {
      const response = await fetch("/api/email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailStep.config.subject,
          body: emailStep.config.body,
          preview_text: emailStep.config.preview_text || "",
          test_email: flowTestEmail,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send test email")
      }

      toast({ title: "Test email sent!", description: `Check your inbox at ${flowTestEmail}` })
      setFlowShowSendTestModal(false)
      setFlowTestEmail("")
    } catch (error) {
      toast({
        title: "Failed to send test",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      })
    } finally {
      setIsFlowSendingTest(false)
    }
  }

  if (view === "flow-editor" && editingFlow) {
    const triggerInfo = getTriggerInfo(editingFlow.trigger_type)
    const TriggerIcon = triggerInfo.icon

    // Get or create the single email step
    const emailStep = (editingFlow.steps || []).find(s => s.type === "email") || {
      id: `step_${Date.now()}`,
      type: "email" as const,
      order: 0,
      config: { subject: "", body: "", delay_value: 1, delay_unit: "minutes" as const }
    }

    // Ensure we always have the email step in steps
    if (!(editingFlow.steps || []).some(s => s.type === "email")) {
      setEditingFlow({
        ...editingFlow,
        steps: [emailStep]
      })
    }

    const updateEmailStep = (updates: Partial<typeof emailStep.config>) => {
      const newSteps = (editingFlow.steps || []).map(s =>
        s.type === "email" ? { ...s, config: { ...s.config, ...updates } } : s
      )
      if (!newSteps.some(s => s.type === "email")) {
        newSteps.push({ ...emailStep, config: { ...emailStep.config, ...updates } })
      }
      setEditingFlow({ ...editingFlow, steps: newSteps })
    }

    // Sync flow editor content with step body - use debounced approach
    const handleFlowEditorInput = () => {
      if (flowEditorRef.current) {
        const content = flowEditorRef.current.innerHTML
        setFlowEditorContent(content)
        // Update state without causing re-render of the editor
        const newSteps = (editingFlow.steps || []).map(s =>
          s.type === "email" ? { ...s, config: { ...s.config, body: content } } : s
        )
        if (!newSteps.some(s => s.type === "email")) {
          newSteps.push({ ...emailStep, config: { ...emailStep.config, body: content } })
        }
        // Use a ref-based approach to avoid re-render
        editingFlow.steps = newSteps
      }
    }

    // Check if this is a preset flow (Purchase or New Subscriber) that shouldn't have name edited
    const isPresetFlow = editingFlow.trigger_type === "purchase" || editingFlow.trigger_type === "new_subscriber"

    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header - Matching email editor style */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-20">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={handleFlowBack} className="h-10 w-10 rounded-xl hover:bg-gray-100 cursor-pointer">
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </Button>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-violet-100">
                      <TriggerIcon className="h-4 w-4 text-violet-600" />
                    </div>
                    {isPresetFlow ? (
                      <span className="text-lg font-semibold text-gray-900">{editingFlow.name}</span>
                    ) : (
                      <Input
                        value={editingFlow.name}
                        onChange={(e) => setEditingFlow({ ...editingFlow, name: e.target.value })}
                        className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent w-auto min-w-[200px]"
                        placeholder="Flow name"
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{triggerInfo.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={openFlowSendTestModal} className="h-10 px-4 rounded-xl text-gray-600 hover:bg-gray-100 cursor-pointer">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Test
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleToggleFlowStatus(editingFlow)}
                  className={cn(
                    "h-10 px-4 rounded-xl cursor-pointer",
                    editingFlow.status === "active"
                      ? "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {editingFlow.status === "active" ? (
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
                </Button>
                <Button onClick={() => handleSaveFlow(editingFlow)} disabled={isFlowSaving} className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {isFlowSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Flow"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 sm:gap-6">
            {/* Editor Panel */}
            <div className="space-y-4 sm:space-y-5 overflow-x-hidden">
              {/* Timing Card */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-violet-100">
                    <Timer className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-900 block">Send Timing</label>
                    <p className="text-xs text-gray-500">When to send this email after the trigger</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={emailStep.config.delay_value === 0 || emailStep.config.delay_value === undefined ? "" : emailStep.config.delay_value}
                    onChange={(e) => updateEmailStep({ delay_value: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                    className="w-20 h-11 text-center rounded-xl"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-11 px-4 rounded-xl cursor-pointer">
                        {emailStep.config.delay_unit === "minutes" && "minutes"}
                        {emailStep.config.delay_unit === "hours" && "hours"}
                        {emailStep.config.delay_unit === "days" && "days"}
                        {!emailStep.config.delay_unit && "minutes"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="rounded-xl">
                      <DropdownMenuItem onClick={() => updateEmailStep({ delay_unit: "minutes" })} className="cursor-pointer">Minutes</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateEmailStep({ delay_unit: "hours" })} className="cursor-pointer">Hours</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateEmailStep({ delay_unit: "days" })} className="cursor-pointer">Days</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-sm text-gray-500">after {triggerInfo.name.toLowerCase()}</span>
                </div>
                {(emailStep.config.delay_value || 0) === 0 && (
                  <p className="text-xs text-violet-600 mt-2 flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Email will be sent immediately
                  </p>
                )}
              </div>

              {/* Subject Card */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <label className="text-sm font-medium text-gray-700 mb-3 block">Subject Line</label>
                <Input
                  value={emailStep.config.subject || ""}
                  onChange={(e) => updateEmailStep({ subject: e.target.value })}
                  placeholder="What's your email about?"
                  className="h-12 text-base rounded-xl border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>

              {/* Email Body Card with Rich Text Editor - EXACT same as EmailEditor */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                  <label className="text-sm font-medium text-gray-700">Email Content</label>
                </div>

                {/* Rich Text Toolbar - EXACT same as EmailEditor */}
                <div className="flex flex-wrap items-center gap-1 px-4 py-2.5 border-b border-gray-100 bg-white">
                  <div className="flex items-center gap-0.5 mr-2">
                    <Button variant="ghost" size="icon" onClick={flowUndoAction} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Undo">
                      <Undo className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={flowRedoAction} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Redo">
                      <Redo className="h-4 w-4 text-gray-500" />
                    </Button>
                  </div>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  <Button variant="ghost" size="icon" onClick={flowInsertHeading} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Heading">
                    <Type className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertBold} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Bold">
                    <Bold className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertItalic} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Italic">
                    <Italic className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertStrikethrough} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Strikethrough">
                    <Strikethrough className="h-4 w-4 text-gray-500" />
                  </Button>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  <Button variant="ghost" size="icon" onClick={flowAlignLeft} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Align Left">
                    <AlignLeft className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowAlignCenter} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Align Center">
                    <AlignCenter className="h-4 w-4 text-gray-500" />
                  </Button>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  <Button variant="ghost" size="icon" onClick={flowInsertList} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Bullet List">
                    <List className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertOrderedList} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Numbered List">
                    <ListOrdered className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertQuote} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Quote">
                    <Quote className="h-4 w-4 text-gray-500" />
                  </Button>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  <Button variant="ghost" size="icon" onClick={flowInsertLink} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Insert Link">
                    <Link2 className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertImage} disabled={flowIsUploadingImage} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Insert Image">
                    {flowIsUploadingImage ? <Loader2 className="h-4 w-4 text-gray-500 animate-spin" /> : <ImageIcon className="h-4 w-4 text-gray-500" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertButton} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Insert Button">
                    <MousePointer2 className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={flowInsertDivider} className="h-8 w-8 rounded-lg hover:bg-gray-100 cursor-pointer" title="Insert Divider">
                    <Minus className="h-4 w-4 text-gray-500" />
                  </Button>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  <Button variant="outline" size="sm" onClick={flowOpenProductDialog} className="h-8 px-3 rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 cursor-pointer">
                    <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Product Link
                  </Button>
                </div>

                {/* Editor Area */}
                <div className="relative">
                  <div
                    ref={flowEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleFlowEditorInput}
                    onClick={handleFlowEditorClick}
                    className="min-h-[400px] p-6 focus:outline-none text-base leading-relaxed text-gray-700"
                    style={{ wordBreak: "break-word" }}
                    data-placeholder="Start writing your email...

Use the toolbar above to format your text, add images, or insert product links.

Tips:
• Keep your message clear and concise
• Add a clear call-to-action
• Personalize with subscriber names"
                  />

                  {/* Image Edit Menu */}
                  {flowShowImageMenu && flowSelectedImage && (
                    <div
                      className="flow-image-menu fixed bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex items-center gap-1 z-[100]"
                      style={{ left: flowImageMenuPosition.x, top: flowImageMenuPosition.y, transform: 'translate(-50%, -100%)' }}
                    >
                      <Button variant="ghost" size="sm" onClick={() => flowResizeImage('small')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs cursor-pointer">
                        <Minimize2 className="h-3.5 w-3.5 mr-1" />Small
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => flowResizeImage('medium')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs cursor-pointer">
                        <Square className="h-3.5 w-3.5 mr-1" />Medium
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => flowResizeImage('large')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs cursor-pointer">
                        <Maximize2 className="h-3.5 w-3.5 mr-1" />Large
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => flowResizeImage('normal')} className="h-8 px-2 rounded-lg hover:bg-gray-100 text-xs cursor-pointer">
                        Full
                      </Button>
                      <div className="w-px h-5 bg-gray-200 mx-1" />
                      <Button variant="ghost" size="sm" onClick={flowDeleteImage} className="h-8 px-2 rounded-lg hover:bg-red-50 text-red-500 text-xs cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Inline Button Edit Menu - Modern UI Dialog */}
                  <Dialog open={flowShowButtonMenu} onOpenChange={(open) => { if (!open) { setFlowShowButtonMenu(false); setFlowSelectedButton(null); } }}>
                    <DialogContent className="sm:max-w-[380px] p-0 rounded-2xl overflow-hidden" showCloseButton={false} onClick={(e) => e.stopPropagation()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
                      {/* Header */}
                      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <DialogTitle className="text-sm font-semibold text-gray-900">Edit Button</DialogTitle>
                          <button onClick={flowDeleteButton} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                        {/* Live Preview */}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <div style={{ textAlign: flowButtonAlign }}>
                            <span
                              style={{
                                display: "inline-block",
                                backgroundColor: flowButtonColor,
                                color: "#ffffff",
                                padding: "10px 20px",
                                borderRadius: "8px",
                                fontWeight: 600,
                                fontSize: "13px",
                                maxWidth: "100%",
                                wordBreak: "break-word",
                              }}
                            >
                              {flowButtonText || "Button Text"}
                            </span>
                          </div>
                        </div>

                        {/* Button Text Input */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1.5">Button Text</label>
                          <Input
                            value={flowButtonText}
                            onChange={(e) => setFlowButtonText(e.target.value)}
                            placeholder="Click here"
                            className="h-10 text-sm rounded-xl border-gray-200 focus:border-violet-400 focus:ring-violet-400/20"
                          />
                        </div>

                        {/* URL Input */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1.5">Link URL</label>
                          <Input
                            value={flowButtonUrl}
                            onChange={(e) => setFlowButtonUrl(e.target.value)}
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
                                  onClick={() => setFlowButtonColor(color)}
                                  className={cn(
                                    "w-7 h-7 rounded-lg border-2 transition-all cursor-pointer hover:scale-110",
                                    flowButtonColor === color ? "border-gray-900 ring-2 ring-gray-900/20 scale-110" : "border-white shadow-sm"
                                  )}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <input
                              type="color"
                              value={flowButtonColor}
                              onChange={(e) => setFlowButtonColor(e.target.value)}
                              className="h-9 w-9 cursor-pointer rounded-lg border border-gray-200 p-0.5"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <Button
                          size="sm"
                          onClick={flowUpdateButton}
                          disabled={!flowButtonText || !flowButtonUrl}
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
            <div className="lg:sticky lg:top-4 lg:h-fit lg:self-start">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <label className="text-sm font-medium text-gray-700">Live Preview</label>
                </div>

                <div className="p-5 bg-gray-50/50 flex justify-center min-h-[500px]">
                  <div className="bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 border border-gray-100 w-full max-w-[480px]">
                    {/* Email Header Preview */}
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center overflow-hidden">
                          {sellerInfo?.avatarUrl ? (
                            <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-semibold text-violet-600">{sellerInfo?.name?.charAt(0) || "Y"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{sellerInfo?.name || "Your Name"}</p>
                          <p className="text-xs text-gray-500 truncate">{emailStep.config.subject || "Email subject..."}</p>
                        </div>
                      </div>
                    </div>

                    {/* Email Body Preview */}
                    <div className="p-5">
                      <div
                        className="prose prose-sm max-w-none text-gray-700"
                        style={{ fontSize: "15px", lineHeight: "1.7" }}
                        dangerouslySetInnerHTML={{ __html: emailStep.config.body || '<span class="text-gray-400 italic">Your email content will appear here...</span>' }}
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
                        <div className="text-[11px] text-gray-400 hover:text-gray-500">
                          <a href="#" className="underline">Unsubscribe</a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Unsaved Changes Dialog for Flows */}
        <Dialog open={showFlowUnsavedDialog} onOpenChange={setShowFlowUnsavedDialog}>
          <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
            <div className="p-6 text-center">
              <DialogTitle className="text-lg font-semibold text-gray-900 mb-2">Unsaved changes</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                You have unsaved changes in your flow. If you leave now, your changes will be lost.
              </DialogDescription>
            </div>
            <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowFlowUnsavedDialog(false)} className="flex-1 rounded-xl h-11 cursor-pointer">
                Keep editing
              </Button>
              <Button onClick={() => { setShowFlowUnsavedDialog(false); setView("list"); setEditingFlow(null); window.history.pushState({}, "", "/app/emails"); }} className="flex-1 rounded-xl h-11 bg-gray-900 hover:bg-gray-800 text-white cursor-pointer">
                Discard changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Product Link Dialog for Flow Editor */}
        <Dialog open={flowShowProductDialog} onOpenChange={setFlowShowProductDialog}>
          <DialogContent className="sm:max-w-[480px] rounded-2xl p-0 overflow-hidden">
            <DialogHeader className="p-5 pb-3 border-b border-gray-100">
              <DialogTitle className="text-lg font-semibold text-gray-900">Insert Product Link</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Select a product to insert a link to in your email
              </DialogDescription>
            </DialogHeader>
            <div className="p-4">
              <Input
                placeholder="Search products..."
                value={flowProductSearch}
                onChange={(e) => setFlowProductSearch(e.target.value)}
                className="h-10 rounded-lg mb-3"
              />
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {flowLoadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : flowFilteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {flowProducts.length === 0 ? "No published products found" : "No products match your search"}
                  </div>
                ) : (
                  flowFilteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => flowInsertProductLink(product)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors text-left cursor-pointer"
                    >
                      {product.thumbnail_url ? (
                        <img src={product.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <ShoppingCart className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{product.title}</p>
                        <p className="text-sm text-gray-500">${(product.price_cents / 100).toFixed(2)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Link Dialog for Flow Editor */}
        <Dialog open={flowShowLinkDialog} onOpenChange={setFlowShowLinkDialog}>
          <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
            <DialogHeader className="p-5 pb-3 border-b border-gray-100">
              <DialogTitle className="text-lg font-semibold text-gray-900">Insert Link</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Add a hyperlink to your email
              </DialogDescription>
            </DialogHeader>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Link Text</label>
                <Input
                  value={flowLinkText}
                  onChange={(e) => setFlowLinkText(e.target.value)}
                  placeholder="Click here"
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">URL</label>
                <Input
                  value={flowLinkUrl}
                  onChange={(e) => setFlowLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex gap-2">
              <Button variant="outline" onClick={() => { setFlowShowLinkDialog(false); setFlowLinkUrl(""); setFlowLinkText(""); }} className="flex-1 rounded-xl h-11 cursor-pointer">
                Cancel
              </Button>
              <Button onClick={flowConfirmInsertLink} disabled={!flowLinkUrl} className="flex-1 rounded-xl h-11 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
                Insert Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Send Test Modal */}
        <Dialog open={flowShowSendTestModal} onOpenChange={setFlowShowSendTestModal}>
          <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
            <DialogHeader className="p-5 pb-3 border-b border-gray-100">
              <DialogTitle className="text-lg font-semibold text-gray-900">Send Test Email</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Enter the email address where you want to receive the test
              </DialogDescription>
            </DialogHeader>
            <div className="p-5">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Email Address</label>
                <Input
                  type="email"
                  value={flowTestEmail}
                  onChange={(e) => setFlowTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex gap-2">
              <Button variant="outline" onClick={() => { setFlowShowSendTestModal(false); setFlowTestEmail(""); }} className="flex-1 rounded-xl h-11 cursor-pointer">
                Cancel
              </Button>
              <Button onClick={handleFlowSendTest} disabled={!flowTestEmail || isFlowSendingTest} className="flex-1 rounded-xl h-11 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {isFlowSendingTest ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Test
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* CSS for rich text editor */}
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
        `}</style>
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

        const campaignData = {
          creator_id: creatorId,
          subject: data.subject,
          body: data.body,
          preview_text: data.previewText || null,
          audience_type: audienceType,
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

        console.log("[emails page] Sending campaign:", campaignId)

        const response = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId }),
        })

        const responseData = await response.json()
        console.log("[emails page] Send response:", responseData)

        if (!response.ok) {
          throw new Error(responseData.error || "Failed to send campaign")
        }

        // Navigate to Sent tab first
        setView("list")
        setActiveTab("published")

        // Clear state to trigger loading state
        setCampaigns([])
        setOverviewStats(null)

        // Small delay to ensure database transaction is complete, then fetch fresh data
        await new Promise(resolve => setTimeout(resolve, 500))

        console.log("[emails page] Refreshing Sent tab data...")
        await loadData("published")

        triggerSuccessToast()
        if (window.innerWidth < 640) {
          setIsMobileTopToastVisible(true)
          window.setTimeout(() => setIsMobileTopToastVisible(false), 2500)
        }
      } catch (error) {
        console.error("[emails page] Send error:", error)
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

      const campaignData = {
        creator_id: creatorId,
        subject: data.subject,
        body: data.body,
        preview_text: data.previewText || null,
        status: "scheduled" as const,
        audience_type: audienceType,
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
        onBack={() => { setView("list"); window.history.pushState({}, "", "/app/emails"); }}
        onSave={handleBuilderSave}
        onSend={handleBuilderSend}
        onSchedule={handleBuilderSchedule}
        onSendTest={handleSendTest}
        initialSubject={subject}
        initialBody={body}
        initialPreviewText={previewText}
        audienceType={audienceType}
        onAudienceChange={setAudienceType}
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
      {showSuccessToast && (
        <div className="hidden sm:block fixed left-1/2 -translate-x-1/2 z-[220] top-[calc(env(safe-area-inset-top)+12px)] w-[calc(100%-24px)] max-w-sm sm:w-auto animate-in fade-in slide-in-from-top-2 duration-300 px-1 pointer-events-none">
          <div className="bg-black text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium text-center whitespace-normal">
            Email sent successfully
          </div>
        </div>
      )}
      {isMobileTopToastVisible && (
        <div className="sm:hidden fixed left-1/2 -translate-x-1/2 z-[220] top-[calc(env(safe-area-inset-top)+10px)] w-[calc(100%-24px)] max-w-[360px] animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
          <div className="rounded-xl border border-black/10 bg-black/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-xl backdrop-blur-sm">
            Email sent successfully
          </div>
        </div>
      )}
      {/* Global Save Notification - Shows across all views */}
      {showFlowSaveNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3">
            <Check className="h-5 w-5 text-green-400" />
            <span className="text-sm font-medium">{flowSaveNotificationMessage}</span>
          </div>
        </div>
      )}

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
          <div className="flex gap-1 mt-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

      <TimeframeBottomSheet
        isOpen={isStatsTimeframeSheetOpen}
        onClose={() => setIsStatsTimeframeSheetOpen(false)}
        selectedValue={statsTimeRange}
        onSelect={setStatsTimeRange}
      />

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
                    s.status === "subscribed" && s.unsubscribed_at ? "resubscribed" : s.status,
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
                <div>
                  <table className="w-full table-fixed sm:table-auto">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-3 sm:px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-left hidden sm:table-cell">Name</th>
                        <th className="px-2 sm:px-4 py-3 text-left">Source</th>
                        <th className="px-4 py-3 text-left hidden md:table-cell">Status</th>
                        <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                        <th className="px-2 sm:px-4 py-3 text-right w-[44px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredSubscribers.map((subscriber) => (
                        <tr key={subscriber.id} className="hover:bg-gray-50">
                          <td className="px-3 sm:px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-900 truncate max-w-[130px] sm:max-w-[220px]">{subscriber.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-gray-600">{subscriber.name || "-"}</span>
                          </td>
                          <td className="px-2 sm:px-4 py-3">
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
                            {(() => {
                              const isResubscribed = subscriber.status === "subscribed" && subscriber.unsubscribed_at
                              return (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                    isResubscribed
                                      ? "bg-amber-50 text-amber-700"
                                      : subscriber.status === "subscribed"
                                        ? "bg-green-50 text-green-700"
                                        : "bg-gray-100 text-gray-500",
                                  )}
                                >
                                  {isResubscribed ? (
                                    <RefreshCw className="h-3 w-3" />
                                  ) : subscriber.status === "subscribed" ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  {isResubscribed ? "resubscribed" : subscriber.status}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-gray-500">{formatDate(subscriber.subscribed_at)}</span>
                          </td>
                          <td className="px-2 sm:px-4 py-3 text-right">
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
                className="rounded-[8px] bg-violet-600 hover:bg-violet-700 cursor-pointer group"
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
                  className="rounded-[8px] bg-violet-600 hover:bg-violet-700 cursor-pointer group"
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
                  <>
                    <div className="hidden md:block">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="h-9 px-3 rounded-lg text-sm font-medium gap-2 cursor-pointer">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            {statsTimeRange === "7d" && "Last 7 days"}
                            {statsTimeRange === "30d" && "Last 30 days"}
                            {statsTimeRange === "90d" && "Last 90 days"}
                            {statsTimeRange === "all" && "All time"}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl min-w-[140px]">
                          {statsTimeframeOptions.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => setStatsTimeRange(option.value)}
                              className={cn("cursor-pointer", statsTimeRange === option.value && "bg-gray-100")}
                            >
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setIsStatsTimeframeSheetOpen(true)}
                      className="md:hidden h-9 px-3 rounded-lg text-sm font-medium gap-2 cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-gray-500" />
                      {statsTimeRange === "7d" && "Last 7 days"}
                      {statsTimeRange === "30d" && "Last 30 days"}
                      {statsTimeRange === "90d" && "Last 90 days"}
                      {statsTimeRange === "all" && "All time"}
                    </Button>
                  </>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
                  {/* Email Limit Progress */}
                  <div className="bg-white rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                      <Mail className="h-4 w-4" />
                      <span className="text-xs font-medium">Monthly Limit</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12">
                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-gray-100"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="none"
                            d="M18 2.0845
                              a 15.9155 15.9155 0 0 1 0 31.831
                              a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className={cn(
                              (emailUsage.sent / emailUsage.limit) > 0.9 ? "text-red-500" :
                              (emailUsage.sent / emailUsage.limit) > 0.7 ? "text-amber-500" : "text-violet-500"
                            )}
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            fill="none"
                            strokeDasharray={`${Math.min((emailUsage.sent / emailUsage.limit) * 100, 100)}, 100`}
                            d="M18 2.0845
                              a 15.9155 15.9155 0 0 1 0 31.831
                              a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-gray-700">{Math.round((emailUsage.sent / emailUsage.limit) * 100)}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{emailUsage.sent.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">of {emailUsage.limit.toLocaleString()}</p>
                      </div>
                    </div>
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
                          {(campaign.recipient_count || campaign.audience_count) > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {campaign.recipient_count || campaign.audience_count} recipients
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
