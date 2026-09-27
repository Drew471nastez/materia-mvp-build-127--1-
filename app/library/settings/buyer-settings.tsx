"use client"

import { keyboardInsetOrFloor } from "@/lib/ui/keyboard-safe-sheet"
import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, User, Shield, Loader2, CheckCircle, AlertCircle, LogOut, KeyRound, Camera, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { announceAvatar } from "@/lib/account/avatar-store"
import { nativeLogOut } from "@/lib/native-bridge"
import { ReturnLink } from "@/components/navigation/return-link"
import { EmailChangeFlow } from "@/components/app/settings/account-panels"

/**
 * Compresses an image using canvas to fit within 2MB.
 * Tries progressively lower quality/dimensions until the size fits.
 */
async function compressImageToLimit(file: File | Blob, maxBytes = 2 * 1024 * 1024): Promise<Blob> {
  const attempts = [
    { maxDim: 1200, quality: 0.85 },
    { maxDim: 900, quality: 0.80 },
    { maxDim: 700, quality: 0.75 },
    { maxDim: 500, quality: 0.70 },
  ]

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = rej
      img.src = src
    })

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    for (const { maxDim, quality } of attempts) {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality))
      if (blob && blob.size <= maxBytes) return blob
    }
  } finally {
    URL.revokeObjectURL(url)
  }

  // Return the file as-is if all attempts failed; caller checks size
  return file
}

interface BuyerSettingsProps {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  username: string
  createdAt: string
}

type Tab = "general" | "security"

export function BuyerSettings({ userId, email: initialEmail, displayName: initialName, avatarUrl, username: initialUsername, createdAt }: BuyerSettingsProps) {
  /* The account's email, which a receipt's Resend sends to for an order on
     this account. Changed with a code to each address (EmailChangeFlow,
     app/api/auth/change-email), the same flow as the seller's settings. */
  const [email, setEmail] = useState(initialEmail)
  const [changingEmail, setChangingEmail] = useState(false)
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("general")

  // General form state
  const [name, setName] = useState(initialName)
  const [username, setUsername] = useState(initialUsername)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(avatarUrl)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Password state
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState("")

  // Sign out state
  const [signingOut, setSigningOut] = useState(false)

  // Delete account state
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "verify">("idle")
  const [deleteVerificationCode, setDeleteVerificationCode] = useState(["", "", "", "", "", ""])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteCodeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const pageRef = useRef<HTMLDivElement>(null)

  // When the software keyboard opens on mobile, the visual viewport shrinks
  // but the layout viewport stays the same. This causes:
  //   1. Blank space at the bottom (scroll container extends past visual viewport)
  //   2. Content sliding under the fixed header (browser auto-scroll overshoots)
  //
  // Fix strategy:
  //   a) Clamp <main>.scrollTop after every keyboard-height change so no blank
  //      space is visible while the keyboard is open.
  //   b) Scroll the focused element into the visible area within <main> (not the
  //      document) so the header stays fixed. The CSS scroll-margin-top on
  //      inputs (globals.css) handles the browser's built-in scroll hint;
  //      this JS handler catches any residual offset after CSS applies.
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return
    const vv = window.visualViewport
    const measureKeyboard = () =>
      keyboardInsetOrFloor(Math.max(0, window.innerHeight - vv!.offsetTop - vv!.height))
    let prevKeyboard = measureKeyboard()

    function onResize() {
      /*
        The guard used to be on visualViewport's own height, which changes on
        a rotation as well as a keyboard and does not change at all on a
        platform that reports no keyboard. Guarding on the keyboard itself
        covers both: a rotation moves innerHeight and the viewport together,
        so the keyboard reads the same and this still returns.
      */
      const kbHeight = measureKeyboard()
      if (Math.abs(kbHeight - prevKeyboard) < 50) return
      prevKeyboard = kbHeight

      // Two rAFs: first for KeyboardGuard's CSS (height: var(--vvh)) to apply,
      // second to read the updated clientHeight and act on correct geometry.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const scrollContainer = pageRef.current?.closest("main") as HTMLElement | null
        if (!scrollContainer) return

        // (a) Clamp scrollTop so no blank space shows at the bottom
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight
        if (scrollContainer.scrollTop > maxScroll) {
          scrollContainer.scrollTop = Math.max(0, maxScroll)
        }

        // (b) If keyboard is open, ensure the focused element is visible below
        // the fixed header and above the keyboard edge
        if (kbHeight > 0) {
          const active = document.activeElement as HTMLElement | null
          if (!active || !pageRef.current?.contains(active)) return

          const containerRect = scrollContainer.getBoundingClientRect()
          const activeRect = active.getBoundingClientRect()

          // Header height matches the pt-[calc(3.5rem+1px+...)] on <main>
          const headerH = containerRect.top // <main> top is just below the header
          const visibleTop = headerH + 8 // small breathing room below header
          const visibleBottom = containerRect.top + scrollContainer.clientHeight - 8

          if (activeRect.top < visibleTop || activeRect.bottom > visibleBottom) {
            // Scroll so the active element lands in the upper third of the visible area
            const relativeTop = activeRect.top - containerRect.top + scrollContainer.scrollTop
            const targetScroll = relativeTop - scrollContainer.clientHeight / 3
            scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" })
          }
        }
      }))
    }

    vv.addEventListener("resize", onResize)
    return () => vv.removeEventListener("resize", onResize)
  }, [])

  const handleSaveProfile = useCallback(async () => {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name, username })
        .eq("id", userId)

      if (error) throw error
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      router.refresh()
    } catch {
      setSaveError("Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }, [name, username, userId, router])

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    setSaveError("")
    try {
      // Auto-compress images that exceed 2MB (common with camera captures)
      // A photo that goes up as it came loses its location metadata first
      let uploadBlob: Blob = await withoutMetadata(file)
      let ext = file.name.split(".").pop() || "jpg"

      if (file.size > 2 * 1024 * 1024) {
        uploadBlob = await compressImageToLimit(file)
        ext = "jpg"
        if (uploadBlob.size > 2 * 1024 * 1024) {
          setSaveError("Image must be under 2MB")
          setUploadingAvatar(false)
          return
        }
      }

      const supabase = createClient()
      const path = `${userId}/avatar.${ext}` // the owner's folder first: storage only lets a person write there

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type || "image/jpeg" })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path)

      const url = `${publicUrl}?t=${Date.now()}`
      /* Saved as Settings saves it (app/api/account/avatar): the choice marked
         on the account, the profile read back, the creator page following,
         and every avatar in this browser told (lib/account/avatar-store). */
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error("not saved")
      announceAvatar(url)

      setAvatarPreview(url)
      router.refresh()
    } catch {
      setSaveError("Failed to upload. Please try again.")
    } finally {
      setUploadingAvatar(false)
    }
  }, [userId, router])

  const handlePasswordReset = useCallback(async () => {
    setResetSending(true)
    setResetError("")
    setResetSent(false)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://storelib.com/reset-password",
      })
      if (error) throw error
      setResetSent(true)
    } catch {
      setResetError("Failed to send reset link. Please try again.")
    } finally {
      setResetSending(false)
    }
  }, [email])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
    }
  }, [router])

  const handleSendDeleteCode = useCallback(async () => {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-code" }),
      })
      const data = await response.json()
      if (response.ok) {
        setDeleteStep("verify")
        setDeleteVerificationCode(["", "", "", "", "", ""])
      } else {
        setDeleteError(data.error || "Failed to send verification code")
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }, [])

  const handleDeleteCodeInput = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newCode = [...deleteVerificationCode]
    newCode[index] = value.slice(-1)
    setDeleteVerificationCode(newCode)
    if (value && index < 5) {
      deleteCodeInputRefs.current[index + 1]?.focus()
    }
  }, [deleteVerificationCode])

  const handleDeleteCodeKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !deleteVerificationCode[index] && index > 0) {
      deleteCodeInputRefs.current[index - 1]?.focus()
    }
  }, [deleteVerificationCode])

  const handleConfirmDelete = useCallback(async () => {
    const code = deleteVerificationCode.join("")
    if (code.length !== 6) {
      setDeleteError("Please enter the complete verification code")
      return
    }
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      })
      const data = await response.json()
      if (response.ok) {
        const supabase = createClient()
        await supabase.auth.signOut({ scope: "local" })
        if (isNativePlatform()) {
          nativeLogOut()
        } else {
          router.push("/")
        }
      } else {
        setDeleteError(data.error || "Invalid verification code")
        setDeleteLoading(false)
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
      setDeleteLoading(false)
    }
  }, [deleteVerificationCode, router])

  const joinDate = new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
  ]

  return (
    <div ref={pageRef} className="max-w-2xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Page header card — matches library main page visual language */}
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 flex items-center justify-center shadow-sm shrink-0">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-600" />
            </div>
            <ReturnLink
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-8 sm:mt-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </ReturnLink>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Settings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage your account preferences</p>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                isActive
                  ? "bg-neutral-100 text-neutral-900 border-neutral-300"
                  : "bg-white text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 border-transparent"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          {/* Avatar card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">Profile Photo</h3>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-neutral-200 overflow-hidden shrink-0">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-neutral-900 text-white text-xl font-bold">
                      {(name || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <label className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-neutral-900 text-white flex items-center justify-center cursor-pointer hover:bg-black transition-colors shadow-sm">
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900">{name || "Your name"}</p>
                <p className="text-xs text-neutral-500">JPG, PNG or GIF. Auto-compressed if needed.</p>
              </div>
            </div>
          </div>

          {/* Profile info card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">Profile Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-[13px] font-medium text-neutral-700">Display Name</Label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-11 border-neutral-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-[13px] font-medium text-neutral-700">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="h-11 border-neutral-200 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          {/* Email card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">Email</h3>
            <div className="flex items-center gap-3">
              <Input value={email} disabled className="h-11 border-neutral-200 rounded-xl text-sm bg-neutral-50 flex-1" />
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 shrink-0">
                <CheckCircle className="h-3 w-3" />
                Verified
              </span>
              <button
                type="button"
                onClick={() => setChangingEmail((v) => !v)}
                aria-expanded={changingEmail}
                data-change-email=""
                className="h-11 shrink-0 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
              >
                {changingEmail ? "Close" : "Change"}
              </button>
            </div>
            {changingEmail ? (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <EmailChangeFlow
                  currentEmail={email}
                  onChanged={(next) => {
                    setEmail(next)
                    router.refresh()
                  }}
                />
              </div>
            ) : null}
          </div>

          {/* Save button */}
          {saveError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}
          <Button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full h-11 rounded-xl bg-neutral-900 text-white hover:bg-black text-sm font-medium"
          >
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
            ) : saveSuccess ? (
              <><CheckCircle className="mr-2 h-4 w-4" />Saved!</>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          {/* Password card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-2">Password</h3>
            <p className="text-sm text-neutral-500 mb-4">Send a password reset link to your email address.</p>
            {resetError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <p className="text-sm text-red-700">{resetError}</p>
              </div>
            )}
            <Button
              onClick={handlePasswordReset}
              disabled={resetSending || resetSent}
              variant="outline"
              className="h-11 rounded-xl border-neutral-200 text-sm font-medium"
            >
              {resetSending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
              ) : resetSent ? (
                <><CheckCircle className="mr-2 h-4 w-4 text-green-600" />Reset link sent!</>
              ) : (
                <><KeyRound className="mr-2 h-4 w-4" />Send Reset Link</>
              )}
            </Button>
          </div>

          {/* Sessions card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-2">Sessions</h3>
            <p className="text-sm text-neutral-500 mb-4">Manage your active sessions and sign out from all devices.</p>
            <Button
              onClick={handleSignOut}
              disabled={signingOut}
              variant="outline"
              className="h-11 rounded-xl border-neutral-200 text-sm font-medium"
            >
              {signingOut ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing out...</>
              ) : (
                <><LogOut className="mr-2 h-4 w-4" />Sign Out</>
              )}
            </Button>
          </div>

          {/* Account info card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-2">Account</h3>
            <div className="space-y-2 text-sm text-neutral-500">
              <p>Email: <span className="text-neutral-900">{email}</span></p>
              <p>Member since: <span className="text-neutral-900">{joinDate}</span></p>
            </div>
          </div>

          {/* Delete Account card — fully inline, no modal */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            {/* Always-visible header row */}
            <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
              <div>
                <h3 className="text-[15px] font-semibold text-red-600 mb-1">Delete Account</h3>
                <p className="text-sm text-neutral-500">Permanently delete your account and all associated data. This cannot be undone.</p>
              </div>
              {deleteStep === "idle" && (
                <Button
                  onClick={() => { setDeleteStep("confirm"); setDeleteError(null) }}
                  variant="outline"
                  className="h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-sm font-medium shrink-0 cursor-pointer"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>

            {/* Step 1 — confirm, send code */}
            {deleteStep === "confirm" && (
              <div className="border-t border-red-100 px-5 sm:px-6 pb-5 sm:pb-6 pt-4 space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                  <p className="text-sm font-medium text-red-700 mb-2">This will permanently:</p>
                  <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                    <li>Delete your account and profile</li>
                    <li>Remove all your purchases and library items</li>
                    <li>Cannot be reversed</li>
                  </ul>
                </div>
                <p className="text-sm text-neutral-500">
                  A 6-digit verification code will be sent to{" "}
                  <span className="font-medium text-neutral-900">{email}</span>.
                </p>
                {deleteError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <p className="text-sm text-red-700">{deleteError}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <Button
                    onClick={() => { setDeleteStep("idle"); setDeleteError(null) }}
                    disabled={deleteLoading}
                    variant="outline"
                    className="flex-1 h-11 rounded-xl border-neutral-200 text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendDeleteCode}
                    disabled={deleteLoading}
                    className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium cursor-pointer"
                  >
                    {deleteLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                    ) : (
                      "Send Code"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2 — enter verification code */}
            {deleteStep === "verify" && (
              <div className="border-t border-red-100 px-5 sm:px-6 pb-5 sm:pb-6 pt-4 space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <p className="text-sm text-neutral-500">
                  Enter the 6-digit code sent to{" "}
                  <span className="font-medium text-neutral-900">{email}</span>.
                </p>
                <div className="flex gap-2">
                  {deleteVerificationCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { deleteCodeInputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDeleteCodeInput(i, e.target.value)}
                      onKeyDown={(e) => handleDeleteCodeKeyDown(i, e)}
                      onFocus={(e) => {
                        // Scroll the focused OTP box into the visible area
                        // within <main> (not the document) once the keyboard
                        // is fully open (VisualViewport settles after ~350 ms).
                        const target = e.target
                        const delay = window.visualViewport ? 380 : 100
                        setTimeout(() => {
                          const main = target.closest("main") as HTMLElement | null
                          if (!main) return
                          const mainRect = main.getBoundingClientRect()
                          const elRect = target.getBoundingClientRect()
                          // Only scroll if element is outside the visible area
                          if (elRect.top < mainRect.top + 8 || elRect.bottom > mainRect.bottom - 8) {
                            const relTop = elRect.top - mainRect.top + main.scrollTop
                            main.scrollTo({ top: Math.max(0, relTop - main.clientHeight / 3), behavior: "smooth" })
                          }
                        }, delay)
                      }}
                      className="flex-1 min-w-0 h-12 text-center text-lg font-semibold border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 bg-neutral-50"
                    />
                  ))}
                </div>
                {deleteError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <p className="text-sm text-red-700">{deleteError}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <Button
                    onClick={() => { setDeleteStep("confirm"); setDeleteError(null); setDeleteVerificationCode(["", "", "", "", "", ""]) }}
                    disabled={deleteLoading}
                    variant="outline"
                    className="flex-1 h-11 rounded-xl border-neutral-200 text-sm font-medium cursor-pointer"
                  >
                    Go Back
                  </Button>
                  <Button
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading || deleteVerificationCode.join("").length !== 6}
                    className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {deleteLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                    ) : (
                      "Delete Account"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
