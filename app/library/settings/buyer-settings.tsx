"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, User, Shield, Loader2, CheckCircle, AlertCircle, LogOut, KeyRound, Camera, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { nativeLogOut } from "@/lib/native-bridge"

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

export function BuyerSettings({ userId, email, displayName: initialName, avatarUrl, username: initialUsername, createdAt }: BuyerSettingsProps) {
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
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "code">("idle")
  const [deleteSending, setDeleteSending] = useState(false)
  const [deleteVerifying, setDeleteVerifying] = useState(false)
  const [deleteCode, setDeleteCode] = useState("")
  const [deleteError, setDeleteError] = useState("")

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
      let uploadBlob: Blob = file
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
      const path = `avatars/${userId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type || "image/jpeg" })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path)

      const url = `${publicUrl}?t=${Date.now()}`
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId)

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
    await supabase.auth.signOut()
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
    }
  }, [router])

  const handleSendDeleteCode = useCallback(async () => {
    setDeleteSending(true)
    setDeleteError("")
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-code" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send code")
      setDeleteStep("code")
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to send code. Please try again.")
    } finally {
      setDeleteSending(false)
    }
  }, [])

  const handleVerifyDeleteCode = useCallback(async () => {
    if (!deleteCode.trim()) {
      setDeleteError("Please enter the verification code.")
      return
    }
    setDeleteVerifying(true)
    setDeleteError("")
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: deleteCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Invalid code")
      // Account deleted — sign out and redirect
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/")
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account. Please try again.")
    } finally {
      setDeleteVerifying(false)
    }
  }, [deleteCode, router])

  const joinDate = new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
  ]

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Page header card — matches library main page visual language */}
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 flex items-center justify-center shadow-sm shrink-0">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-600" />
            </div>
            <Link
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-8 sm:mt-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </Link>
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
            </div>
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

          {/* Delete account card */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-200">
            <h3 className="text-[15px] font-semibold text-neutral-900 mb-2">Delete Account</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <Button
              onClick={() => { setDeleteStep("confirm"); setDeleteError("") }}
              variant="outline"
              className="h-11 rounded-xl border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-300 text-sm font-medium"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </div>
        </div>
      )}

      {/* Delete Account Modal — centered popup on all screen sizes */}
      {deleteStep !== "idle" && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => { setDeleteStep("idle"); setDeleteCode(""); setDeleteError("") }}
          />

          {/* Panel */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in-0 zoom-in-95 duration-200">
            <div
              className="bg-white w-full rounded-2xl max-w-md shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-5 pb-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <Trash2 className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-neutral-900">Delete Account</h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {deleteStep === "confirm" ? "Confirm your decision" : "Enter verification code"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setDeleteStep("idle"); setDeleteCode(""); setDeleteError("") }}
                    className="h-8 w-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors text-neutral-500 hover:text-neutral-700 shrink-0"
                    aria-label="Close"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                {/* Error */}
                {deleteError && (
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 flex items-center gap-2 mb-4">
                    <AlertCircle className="h-4 w-4 text-neutral-600 shrink-0" />
                    <p className="text-sm text-neutral-700">{deleteError}</p>
                  </div>
                )}

                {/* Step: confirm */}
                {deleteStep === "confirm" && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 space-y-2">
                      <p className="text-sm font-medium text-neutral-800">What will be deleted:</p>
                      <ul className="text-sm text-neutral-600 space-y-1">
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />Your account and profile</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />All purchases and download history</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />All associated data permanently</li>
                      </ul>
                    </div>
                    <p className="text-sm text-neutral-500">
                      A 6-digit verification code will be sent to <span className="font-medium text-neutral-700">{email}</span>.
                    </p>
                    <div className="flex flex-row gap-2 pt-1">
                      <Button
                        onClick={() => { setDeleteStep("idle"); setDeleteError("") }}
                        variant="outline"
                        className="h-11 flex-1 rounded-xl border-neutral-200 text-sm font-medium"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSendDeleteCode}
                        disabled={deleteSending}
                        className="h-11 flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
                      >
                        {deleteSending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Code...</>
                        ) : (
                          "Send Verification Code"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step: code */}
                {deleteStep === "code" && (
                  <div className="space-y-4">
                    <p className="text-sm text-neutral-600">
                      Enter the 6-digit code sent to <span className="font-medium text-neutral-700">{email}</span>.
                    </p>
                    <div className="flex justify-center">
                      <Input
                        value={deleteCode}
                        onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="h-14 border-neutral-200 rounded-xl text-2xl tracking-[0.5em] text-center w-48 font-mono"
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyDeleteCode()}
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-row gap-2 pt-1">
                      <Button
                        onClick={() => { setDeleteStep("idle"); setDeleteCode(""); setDeleteError("") }}
                        variant="outline"
                        className="h-11 flex-1 rounded-xl border-neutral-200 text-sm font-medium"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleVerifyDeleteCode}
                        disabled={deleteVerifying || deleteCode.length < 6}
                        className="h-11 flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm font-medium disabled:opacity-40"
                      >
                        {deleteVerifying ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting Account...</>
                        ) : (
                          "Confirm & Delete"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
