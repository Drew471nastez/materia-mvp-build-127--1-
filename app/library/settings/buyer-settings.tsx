"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, User, Shield, Loader2, CheckCircle, AlertCircle, LogOut, KeyRound, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient, isNativePlatform } from "@/lib/supabase/client"

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
    if (file.size > 2 * 1024 * 1024) {
      setSaveError("Image must be under 2MB")
      return
    }

    setUploadingAvatar(true)
    setSaveError("")
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop()
      const path = `avatars/${userId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true })

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
    window.location.assign("/login")
  }, [router])

  const joinDate = new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
  ]

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/library"
          className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to library
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage your account preferences</p>
      </div>

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
                <p className="text-xs text-neutral-500">JPG, PNG or GIF. Max 2MB.</p>
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
        </div>
      )}
    </div>
  )
}
