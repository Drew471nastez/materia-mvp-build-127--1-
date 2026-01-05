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
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type TabType = "published" | "scheduled" | "drafts" | "subscribers"

interface EmailCampaign {
  id: string
  subject: string
  body: string
  preview_text?: string
  status: "draft" | "scheduled" | "sending" | "sent" | "failed"
  audience_type: string
  audience_count: number
  scheduled_at?: string
  sent_at?: string
  created_at: string
}

interface Subscriber {
  id: string
  email: string
  source: "onepage" | "store_builder"
  source_id?: string
  subscribed_at: string
  is_active: boolean
}

const tabs = [
  { id: "published" as const, label: "Published", icon: Send },
  { id: "scheduled" as const, label: "Scheduled", icon: Clock },
  { id: "drafts" as const, label: "Drafts", icon: FileText },
  { id: "subscribers" as const, label: "Subscribers", icon: Users },
]

export default function EmailsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("subscribers")
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showNewEmailModal, setShowNewEmailModal] = useState(false)
  const [creatorId, setCreatorId] = useState<string | null>(null)

  // New email form state
  const [newSubject, setNewSubject] = useState("")
  const [newBody, setNewBody] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    const supabase = createClient()

    // Get current user's creator ID
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

    if (activeTab === "subscribers") {
      const { data } = await supabase
        .from("subscribers")
        .select("*")
        .eq("creator_id", creator.id)
        .eq("is_active", true)
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

  const handleSaveDraft = async () => {
    if (!creatorId || !newSubject.trim()) return

    setIsSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("email_campaigns")
      .insert({
        creator_id: creatorId,
        subject: newSubject,
        body: newBody,
        status: "draft",
        audience_type: "all",
      })

    if (!error) {
      setShowNewEmailModal(false)
      setNewSubject("")
      setNewBody("")
      if (activeTab === "drafts") {
        loadData()
      }
    }

    setIsSaving(false)
  }

  const handleDeleteCampaign = async (id: string) => {
    const supabase = createClient()
    await supabase.from("email_campaigns").delete().eq("id", id)
    loadData()
  }

  const handleDeleteSubscriber = async (id: string) => {
    const supabase = createClient()
    await supabase.from("subscribers").update({ is_active: false }).eq("id", id)
    loadData()
  }

  const filteredSubscribers = subscribers.filter(
    (s) =>
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.source.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

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
              onClick={() => setShowNewEmailModal(true)}
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
                    <div className="col-span-5">Email</div>
                    <div className="col-span-3">Source</div>
                    <div className="col-span-3">Subscribed</div>
                    <div className="col-span-1"></div>
                  </div>

                  {/* Rows */}
                  {filteredSubscribers.map((subscriber) => (
                    <div
                      key={subscriber.id}
                      className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors"
                    >
                      <div className="col-span-5">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900 truncate">
                            {subscriber.email}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-3">
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
                          {subscriber.source === "onepage"
                            ? "OnePage"
                            : "Store Builder"}
                        </span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm text-gray-500">
                          {formatDate(subscriber.subscribed_at)}
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() =>
                                handleDeleteSubscriber(subscriber.id)
                              }
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

        {(activeTab === "published" ||
          activeTab === "scheduled" ||
          activeTab === "drafts") && (
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
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowNewEmailModal(true)}
                >
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
                              Scheduled {formatDate(campaign.scheduled_at)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {campaign.audience_count} recipients
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          {activeTab !== "published" && (
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
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

      {/* New Email Modal */}
      <Dialog open={showNewEmailModal} onOpenChange={setShowNewEmailModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Enter email subject..."
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Write your email content..."
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={8}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowNewEmailModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDraft}
                disabled={!newSubject.trim() || isSaving}
                className="bg-gray-900 hover:bg-gray-800"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Save as Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
