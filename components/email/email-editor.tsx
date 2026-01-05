"use client"

import { useState, useEffect } from "react"
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
  Package,
  UserCircle,
  Plus,
  Search,
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
}

interface Segment {
  id: string
  name: string
  subscriber_ids?: string[]
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

// Variable buttons for subject line
const subjectVariables = [
  { id: "my_name", label: "My Name", icon: User, placeholder: "{{my_name}}" },
  { id: "my_username", label: "My Username", icon: AtSign, placeholder: "{{my_username}}" },
  { id: "product_name", label: "Product Name", icon: Package, placeholder: "{{product_name}}" },
  { id: "customer_name", label: "Customer Name", icon: UserCircle, placeholder: "{{name}}" },
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
  const [subject, setSubject] = useState(initialSubject)
  const [previewText, setPreviewText] = useState(initialPreviewText)
  const [body, setBody] = useState(initialBody)
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  const [scheduledAt, setScheduledAt] = useState("")
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [showSegmentDialog, setShowSegmentDialog] = useState(false)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [selectedSubscriberIds, setSelectedSubscriberIds] = useState<string[]>([])
  const [segmentName, setSegmentName] = useState("")
  const [subscriberSearch, setSubscriberSearch] = useState("")
  const [loadingSubscribers, setLoadingSubscribers] = useState(false)

  useEffect(() => {
    if (showSegmentDialog && creatorId) {
      loadSubscribers()
    }
  }, [showSegmentDialog, creatorId])

  const loadSubscribers = async () => {
    if (!creatorId) return
    setLoadingSubscribers(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("subscribers")
      .select("id, email, name, source, status")
      .eq("creator_id", creatorId)
      .eq("status", "subscribed")
      .order("email")
    setSubscribers(data || [])
    setLoadingSubscribers(false)
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

  const generatePreviewHTML = () => {
    const previewSubject = subject
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")
      .replace(/\{\{product_name\}\}/g, "Product Name")
      .replace(/\{\{name\}\}/g, "Customer")

    const previewBody = body
      .replace(/\{\{my_name\}\}/g, sellerInfo?.name || "Your Name")
      .replace(/\{\{my_username\}\}/g, sellerInfo?.username || "username")
      .replace(/\{\{product_name\}\}/g, "Product Name")
      .replace(/\{\{name\}\}/g, "Customer")

    return { previewSubject, previewBody }
  }

  const generateEmailHTML = () => {
    return `<div style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.6; color: #333;">${body}</div>`
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
    await onSendTest({ subject, body: generateEmailHTML(), previewText, testEmail })
    setShowTestDialog(false)
    setTestEmail("")
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

  const { previewSubject, previewBody } = generatePreviewHTML()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 flex-shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold text-gray-900 truncate">New Email</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button variant={previewMode === "desktop" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setPreviewMode("desktop")}>
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button variant={previewMode === "mobile" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setPreviewMode("mobile")}>
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowTestDialog(true)} disabled={!subject.trim() || !body.trim()} className="h-9 hidden sm:flex">Send Test</Button>
              <Button variant="outline" onClick={handleSave} disabled={!subject.trim() || isSaving} className="h-9">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 sm:mr-2" />}
                <span className="hidden sm:inline">Save Draft</span>
              </Button>
              <Button variant="outline" onClick={() => setShowScheduleDialog(true)} disabled={!subject.trim() || !body.trim()} className="h-9 hidden sm:flex">
                <Clock className="h-4 w-4 mr-2" />Schedule
              </Button>
              <Button onClick={handleSend} disabled={!subject.trim() || !body.trim() || isSending} className="bg-gray-900 hover:bg-gray-800 text-white h-9">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 sm:mr-2" />}
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden lg:border-r">
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email-subject" className="text-sm font-medium">Email Subject</Label>
                <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter your email subject..." className="h-11" />
                <div className="flex flex-wrap gap-2">
                  {subjectVariables.map((variable) => {
                    const Icon = variable.icon
                    return (
                      <Button key={variable.id} variant="outline" size="sm" onClick={() => insertVariable(variable.placeholder)} className="h-8 text-xs gap-1.5">
                        <Icon className="h-3.5 w-3.5" />{variable.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preview-text" className="text-sm font-medium">Preview Text <span className="text-gray-400 font-normal">(shows in inbox)</span></Label>
                <Input id="preview-text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Brief preview shown in email clients..." className="h-11" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-body" className="text-sm font-medium">Email Body</Label>
                <textarea id="email-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your email content here..." className="w-full min-h-[300px] px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-y text-base leading-relaxed" />
                <p className="text-xs text-gray-500">Use {"{{name}}"} for subscriber name, {"{{email}}"} for subscriber email</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Audience</Label>
                <div className="flex gap-2">
                  <Select value={audienceType} onValueChange={onAudienceChange}>
                    <SelectTrigger className="flex-1 h-11"><SelectValue placeholder="Select audience" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subscribers</SelectItem>
                      <SelectItem value="store_builder">Store Builder Subscribers</SelectItem>
                      <SelectItem value="onepage">OnePage Subscribers</SelectItem>
                      {segments.map((segment) => (<SelectItem key={segment.id} value={`segment:${segment.id}`}>{segment.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowSegmentDialog(true)} className="h-11 px-3"><Plus className="h-4 w-4 mr-1" />Custom Segment</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex lg:w-[500px] flex-col bg-gray-100">
          <div className="p-4 border-b bg-white flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Email Preview</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Button variant={previewMode === "desktop" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setPreviewMode("desktop")}><Monitor className="h-3.5 w-3.5" /></Button>
              <Button variant={previewMode === "mobile" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setPreviewMode("mobile")}><Smartphone className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex justify-center">
            <div className={cn("bg-white shadow-lg rounded-lg overflow-hidden transition-all", previewMode === "mobile" ? "w-[375px]" : "w-full max-w-[500px]")}>
              <div className="px-4 py-3 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                    {sellerInfo?.avatarUrl ? <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" /> : <User className="h-4 w-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{sellerInfo?.name || "Your Name"}</p>
                    <p className="text-xs text-gray-500 truncate">{previewSubject || "Email subject..."}</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="prose prose-sm max-w-none" style={{ whiteSpace: "pre-wrap" }}>
                  {previewBody || <span className="text-gray-400 italic">Your email content will appear here...</span>}
                </div>
              </div>
              <div className="px-6 py-4 border-t bg-gray-50">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
                      {sellerInfo?.avatarUrl ? <img src={sellerInfo.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-300" />}
                    </div>
                    <span className="text-xs text-gray-600">{sellerInfo?.name || "Your Name"}</span>
                  </div>
                  <div className="text-xs text-gray-400"><span>Storelib</span><span className="mx-2">·</span><span>Powered by Storelib</span></div>
                  <a href="#" className="text-xs text-gray-400 underline" onClick={(e) => e.preventDefault()}>Unsubscribe</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Schedule Email</DialogTitle><DialogDescription>Choose when you want this email to be sent.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4"><div className="space-y-2"><Label>Date & Time</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="h-11" /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button><Button onClick={handleSchedule} disabled={!scheduledAt || isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Send Test Email</DialogTitle><DialogDescription>Send a test email to preview how it will look.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4"><div className="space-y-2"><Label>Email Address</Label><Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com" className="h-11" /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button><Button onClick={handleSendTest} disabled={!testEmail}>Send Test</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSegmentDialog} onOpenChange={setShowSegmentDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Create Custom Segment</DialogTitle><DialogDescription>Select subscribers to include in this segment.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2"><Label>Segment Name</Label><Input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g., VIP Customers, Early Adopters" className="h-11" /></div>
            <div className="space-y-2"><Label>Search Subscribers</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input value={subscriberSearch} onChange={(e) => setSubscriberSearch(e.target.value)} placeholder="Search by email or name..." className="pl-10 h-11" /></div></div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2"><Label className="text-sm">Subscribers ({selectedSubscriberIds.length} selected)</Label>{selectedSubscriberIds.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedSubscriberIds([])} className="text-xs h-7">Clear all</Button>}</div>
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {loadingSubscribers ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div> : filteredSubscribers.length === 0 ? <div className="text-center py-8 text-gray-500 text-sm">{subscribers.length === 0 ? "No subscribers found" : "No matching subscribers"}</div> : (
                  <div className="divide-y">
                    {filteredSubscribers.map((subscriber) => (
                      <label key={subscriber.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={selectedSubscriberIds.includes(subscriber.id)} onCheckedChange={() => toggleSubscriber(subscriber.id)} />
                        <div className="flex-1 min-w-0"><p className="text-sm text-gray-900 truncate">{subscriber.email}</p><div className="flex items-center gap-2 text-xs text-gray-500">{subscriber.name && <span>{subscriber.name}</span>}<span className={cn("px-1.5 py-0.5 rounded-full", subscriber.source === "onepage" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>{subscriber.source === "onepage" ? "OnePage" : "Store"}</span></div></div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowSegmentDialog(false)}>Cancel</Button><Button onClick={handleCreateSegment} disabled={!segmentName.trim() || selectedSubscriberIds.length === 0}>Create Segment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
