"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { EmailEditor } from "@/components/email/email-editor"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function NewEmailPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [audienceType, setAudienceType] = useState("all")
  const [sellerInfo, setSellerInfo] = useState<{ name: string; username: string; avatarUrl: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [hasSavedOrSent, setHasSavedOrSent] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!creator) {
        router.push("/app")
        return
      }

      setCreatorId(creator.id)

      // Load profile info
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

      setLoading(false)
    }

    loadData()
  }, [router])

  // Handle browser back/refresh warning - always warn unless saved/sent
  useEffect(() => {
    if (hasSavedOrSent) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?"
      return e.returnValue
    }

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault()
      window.history.pushState(null, "", "/app/emails/new")
      setShowUnsavedDialog(true)
      setPendingNavigation("/app/emails")
    }

    window.history.pushState(null, "", "/app/emails/new")
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [hasSavedOrSent])

  const handleBack = () => {
    if (!hasSavedOrSent) {
      setShowUnsavedDialog(true)
      setPendingNavigation("/app/emails")
    } else {
      router.push("/app/emails")
    }
  }

  const handleSave = async (data: { subject: string; body: string; previewText: string }) => {
    if (!creatorId) return

    setIsSaving(true)
    const supabase = createClient()

    await supabase.from("email_campaigns").insert({
      creator_id: creatorId,
      subject: data.subject,
      body: data.body,
      preview_text: data.previewText || null,
      status: "draft",
      audience_type: audienceType,
      segment_id: null,
    })

    setIsSaving(false)
    setHasSavedOrSent(true)
    router.push("/app/emails?tab=drafts")
    toast({ title: "Draft saved", description: "Your email draft has been saved." })
  }

  const handleSend = async (data: { subject: string; body: string; previewText: string }) => {
    if (!creatorId) {
      console.error("[emails/new] No creatorId found")
      toast({ title: "Error", description: "Creator not found", variant: "destructive" })
      return
    }

    console.log("[emails/new] Starting send with audienceType:", audienceType)
    setIsSending(true)
    const supabase = createClient()

    try {
      // Create campaign
      const { data: newCampaign, error: insertError } = await supabase
        .from("email_campaigns")
        .insert({
          creator_id: creatorId,
          subject: data.subject,
          body: data.body,
          preview_text: data.previewText || null,
          status: "draft",
          audience_type: audienceType,
          segment_id: null,
        })
        .select()
        .single()

      if (insertError) {
        console.error("[emails/new] Campaign insert error:", insertError)
        throw new Error(`Failed to create campaign: ${insertError.message}`)
      }

      if (!newCampaign) {
        console.error("[emails/new] No campaign returned after insert")
        throw new Error("Failed to create campaign - no data returned")
      }

      console.log("[emails/new] Campaign created:", newCampaign.id, "with audience_type:", newCampaign.audience_type)

      // Send campaign
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: newCampaign.id }),
      })

      const responseData = await response.json()
      console.log("[emails/new] Send API response:", responseData)

      if (!response.ok) {
        throw new Error(responseData.error || "Failed to send campaign")
      }

      setHasSavedOrSent(true)
      router.push("/app/emails?tab=published")
      toast({
        title: "Email sent!",
        description: `Successfully sent to ${responseData.sent} subscribers.`,
      })
    } catch (error) {
      console.error("[emails/new] Send error:", error)
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleSchedule = async (data: { subject: string; body: string; previewText: string; scheduledAt: string }) => {
    if (!creatorId) return

    setIsSaving(true)
    const supabase = createClient()

    await supabase.from("email_campaigns").insert({
      creator_id: creatorId,
      subject: data.subject,
      body: data.body,
      preview_text: data.previewText || null,
      status: "scheduled",
      audience_type: audienceType,
      segment_id: null,
      scheduled_at: new Date(data.scheduledAt).toISOString(),
    })

    setIsSaving(false)
    setHasSavedOrSent(true)
    router.push("/app/emails?tab=scheduled")
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <>
      <EmailEditor
        onBack={handleBack}
        onSave={handleSave}
        onSend={handleSend}
        onSchedule={handleSchedule}
        onSendTest={handleSendTest}
        initialSubject=""
        initialBody=""
        initialPreviewText=""
        audienceType={audienceType}
        onAudienceChange={setAudienceType}
        isSaving={isSaving}
        isSending={isSending}
        creatorId={creatorId || undefined}
        sellerInfo={sellerInfo || undefined}
      />

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
          <div className="p-6 text-center">
            <DialogTitle className="text-lg font-semibold text-gray-900 mb-2">Unsaved changes</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              You have unsaved changes. Would you like to save your email as a draft before leaving?
            </DialogDescription>
          </div>
          <div className="border-t border-gray-100 p-4 bg-gray-50/50 flex flex-col gap-2">
            <Button
              onClick={async () => {
                // Get current editor content from localStorage or state
                setShowUnsavedDialog(false)
                if (pendingNavigation) {
                  router.push(pendingNavigation)
                }
              }}
              className="w-full rounded-xl h-11 bg-gray-900 hover:bg-gray-800 text-white cursor-pointer"
            >
              Discard changes
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowUnsavedDialog(false)}
              className="w-full rounded-xl h-11 cursor-pointer"
            >
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
