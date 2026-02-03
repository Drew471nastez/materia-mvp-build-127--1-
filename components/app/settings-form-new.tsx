"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  X, Copy, Check, Loader2, AlertCircle, Mail, Lock,
  CreditCard, Users, Store, Star, Shield, Settings,
  Camera, Trash2, ExternalLink
} from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getStoreUrl, getStoreUrlDisplay } from "@/lib/url-helpers"
import Image from "next/image"

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "stores", label: "Manage Stores", icon: Store },
] as const

type TabId = typeof TABS[number]["id"]

interface SettingsFormProps {
  profile: Profile & {
    cover_url?: string
    first_name?: string
    last_name?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    display_name?: string
    username?: string
  }
  creator: Creator & {
    store_published?: boolean
    brand_color?: string
    cover_url?: string
    support_email?: string | null
    slug?: string
  }
}

export function SettingsFormNew({ profile, creator }: SettingsFormProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>("general")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  // Profile fields
  const [firstName, setFirstName] = useState(profile.first_name || profile.display_name?.split(" ")[0] || "")
  const [lastName, setLastName] = useState(profile.last_name || profile.display_name?.split(" ").slice(1).join(" ") || "")
  const [username, setUsername] = useState(profile.username || creator.slug || "")
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "")
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Email fields
  const [currentEmail, setCurrentEmail] = useState(profile.email || "")
  const [emailVerified] = useState(true) // Assume verified if logged in

  // Address fields
  const [addressLine1, setAddressLine1] = useState(profile.address_line1 || "")
  const [addressLine2, setAddressLine2] = useState(profile.address_line2 || "")
  const [city, setCity] = useState(profile.city || "")
  const [state, setState] = useState(profile.state || "")
  const [postalCode, setPostalCode] = useState(profile.postal_code || "")
  const [country, setCountry] = useState(profile.country || "")

  // Security
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null)

  // Email change modal
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailChangeStep, setEmailChangeStep] = useState<"input" | "verify">("input")
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""])
  const [emailChangeLoading, setEmailChangeLoading] = useState(false)
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null)
  const [emailChangeSuccess, setEmailChangeSuccess] = useState(false)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const storeUrl = getStoreUrl(username)
  const storeUrlDisplay = getStoreUrlDisplay(username)

  const validateUsername = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setUsername(cleanValue)
    setUsernameError(null)

    if (cleanValue.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      return
    }

    const validation = isValidUsername(cleanValue)
    if (!validation.valid) {
      setUsernameError(validation.error || "Invalid username")
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)
    const supabase = createClient()

    try {
      const fileExt = file.name.split(".").pop()
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath)

      setAvatarUrl(publicUrl)

      // Update profile immediately
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id)

      router.refresh()
    } catch (err) {
      console.error("Avatar upload error:", err)
      setError("Failed to upload image")
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleRemoveAvatar = async () => {
    const supabase = createClient()
    setAvatarUrl("")
    await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (usernameError) {
      setError(usernameError)
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "")
    const displayName = `${firstName} ${lastName}`.trim()

    try {
      // Check username availability
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", profile.id)
        .single()

      if (existingUser) {
        setError("This username is already taken")
        setIsLoading(false)
        return
      }

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          username: cleanUsername,
          first_name: firstName,
          last_name: lastName,
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
        })
        .eq("id", profile.id)

      if (profileError) throw profileError

      // Update creator slug
      const { error: creatorError } = await supabase
        .from("creators")
        .update({ slug: cleanUsername })
        .eq("id", creator.id)

      if (creatorError) throw creatorError

      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 3000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  // Password reset handler
  const handlePasswordReset = async () => {
    setPasswordResetLoading(true)
    setPasswordResetError(null)

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (response.ok) {
        setPasswordResetSent(true)
      } else {
        setPasswordResetError(data.error || "Failed to send reset email")
      }
    } catch {
      setPasswordResetError("An error occurred. Please try again.")
    } finally {
      setPasswordResetLoading(false)
    }
  }

  // Email change handlers
  const handleSendEmailChangeCode = async () => {
    if (!newEmail || newEmail === currentEmail) {
      setEmailChangeError("Please enter a different email address")
      return
    }

    setEmailChangeLoading(true)
    setEmailChangeError(null)

    try {
      const response = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      })

      const data = await response.json()

      if (response.ok) {
        setEmailChangeStep("verify")
        setVerificationCode(["", "", "", "", "", ""])
      } else {
        setEmailChangeError(data.error || "Failed to send verification code")
      }
    } catch {
      setEmailChangeError("An error occurred. Please try again.")
    } finally {
      setEmailChangeLoading(false)
    }
  }

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newCode = [...verificationCode]
    newCode[index] = value.slice(-1)
    setVerificationCode(newCode)

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyEmailChange = async () => {
    const code = verificationCode.join("")
    if (code.length !== 6) {
      setEmailChangeError("Please enter the complete 6-digit code")
      return
    }

    setEmailChangeLoading(true)
    setEmailChangeError(null)

    try {
      const response = await fetch("/api/auth/verify-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })

      const data = await response.json()

      if (response.ok) {
        setEmailChangeSuccess(true)
        setCurrentEmail(data.newEmail)
        setTimeout(() => {
          setShowEmailChangeModal(false)
          setEmailChangeStep("input")
          setNewEmail("")
          setVerificationCode(["", "", "", "", "", ""])
          setEmailChangeSuccess(false)
          router.refresh()
        }, 2000)
      } else {
        setEmailChangeError(data.error || "Invalid verification code")
      }
    } catch {
      setEmailChangeError("An error occurred. Please try again.")
    } finally {
      setEmailChangeLoading(false)
    }
  }

  const closeEmailChangeModal = () => {
    setShowEmailChangeModal(false)
    setEmailChangeStep("input")
    setNewEmail("")
    setVerificationCode(["", "", "", "", "", ""])
    setEmailChangeError(null)
    setEmailChangeSuccess(false)
  }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-white">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Account settings</h1>

        {/* Pill-shaped Tab Navigation */}
        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-full w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <form onSubmit={handleSubmit}>
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-8">
              {/* Profile Image */}
              <div className="flex items-start gap-4">
                <div className="relative">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile"
                      width={80}
                      height={80}
                      className="w-20 h-20 rounded-full object-cover bg-gray-100"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center text-white text-2xl font-bold">
                      {firstName?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">Change Profile Image</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                    >
                      <Camera className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-red-500 hover:text-red-600 text-sm font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-gray-900">First Name*</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    className="border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-gray-900">Last Name*</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                    className="border-gray-200"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="email" className="text-gray-900">Email address*</Label>
                  {emailVerified && (
                    <span className="text-green-600 text-sm font-medium">verified</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    value={currentEmail}
                    disabled
                    className="bg-gray-50 border-gray-200 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEmailChangeModal(true)}
                  >
                    Change
                  </Button>
                </div>
              </div>

              {/* Address Fields */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="addressLine1" className="text-gray-900">Address line 1</Label>
                  <Input
                    id="addressLine1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Enter Address line 1"
                    className="border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine2" className="text-gray-900">Address line 2</Label>
                  <Input
                    id="addressLine2"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Enter Address line 2"
                    className="border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-gray-900">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    className="border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state" className="text-gray-900">State/Province</Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Enter state"
                    className="border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="postalCode" className="text-gray-900">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Enter postal code"
                    className="border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-gray-900">Country</Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Enter country"
                    className="border-gray-200"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                {success && (
                  <span className="text-green-600 text-sm flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    Saved successfully
                  </span>
                )}
                {error && (
                  <span className="text-red-600 text-sm flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Password
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  Send a password reset link to your email address.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasswordReset}
                  disabled={passwordResetLoading || passwordResetSent}
                >
                  {passwordResetLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : passwordResetSent ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Email Sent
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Reset Link
                    </>
                  )}
                </Button>
                {passwordResetSent && (
                  <p className="mt-3 text-sm text-green-600">
                    Check your email for the password reset link.
                  </p>
                )}
                {passwordResetError && (
                  <p className="mt-3 text-sm text-red-600">{passwordResetError}</p>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Two-Factor Authentication
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  Add an extra layer of security to your account.
                </p>
                <Button type="button" variant="outline" disabled>
                  Coming Soon
                </Button>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Sign Out</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Sign out of your account on this device.
                </p>
                <Button type="button" variant="outline" onClick={handleSignOut}>
                  Sign Out
                </Button>
              </div>

              <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                <h3 className="font-semibold text-red-900 mb-4">Danger Zone</h3>
                <p className="text-red-700 text-sm mb-4">
                  Permanently delete your account and all associated data.
                </p>
                <Button type="button" variant="destructive" disabled>
                  Delete Account
                </Button>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === "billing" && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Plan
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Free Plan</p>
                    <p className="text-gray-600 text-sm">Basic features included</p>
                  </div>
                  <Button type="button" className="bg-blue-600 hover:bg-blue-700">
                    Upgrade
                  </Button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Payment Methods</h3>
                <p className="text-gray-600 text-sm mb-4">
                  No payment methods added yet.
                </p>
                <Button type="button" variant="outline">
                  Add Payment Method
                </Button>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Billing History</h3>
                <p className="text-gray-600 text-sm">
                  No billing history available.
                </p>
              </div>
            </div>
          )}

          {/* Manage Stores Tab */}
          {activeTab === "stores" && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Your Store
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{creator.headline || "My Store"}</p>
                    <p className="text-gray-600 text-sm">{storeUrlDisplay}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Visit Store
                    </a>
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-900">Store URL</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => validateUsername(e.target.value)}
                    placeholder="your-store-name"
                    className="border-gray-200"
                  />
                  {usernameError ? (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {usernameError}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">{storeUrlDisplay}</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Store Settings</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Customize your store appearance and settings.
                </p>
                <Button type="button" variant="outline" asChild>
                  <a href="/app/store-builder">
                    Open Store Builder
                  </a>
                </Button>
              </div>

              {/* Save Button for Stores Tab */}
              <div className="flex items-center gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={isLoading || !!usernameError}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                {success && (
                  <span className="text-green-600 text-sm flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    Saved successfully
                  </span>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Email Change Modal */}
      {showEmailChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {emailChangeStep === "input" ? "Change Email Address" : "Verify Your New Email"}
              </h2>
              <button
                onClick={closeEmailChangeModal}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {emailChangeSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Email Updated!</h3>
                <p className="text-gray-600">Your email has been successfully changed.</p>
              </div>
            ) : emailChangeStep === "input" ? (
              <>
                <p className="text-gray-600 mb-4">
                  Enter your new email address. We&apos;ll send a verification code to confirm it&apos;s yours.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentEmailDisplay">Current Email</Label>
                    <Input
                      id="currentEmailDisplay"
                      value={currentEmail}
                      disabled
                      className="bg-gray-50 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newEmailInput">New Email</Label>
                    <Input
                      id="newEmailInput"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email address"
                      className="mt-1"
                    />
                  </div>
                  {emailChangeError && (
                    <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                      {emailChangeError}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={handleSendEmailChangeCode}
                    disabled={emailChangeLoading || !newEmail}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {emailChangeLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending Code...
                      </>
                    ) : (
                      "Send Verification Code"
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-4">
                  Enter the 6-digit code we sent to <span className="font-medium">{newEmail}</span>
                </p>
                <div className="space-y-4">
                  <div className="flex justify-center gap-2">
                    {verificationCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { codeInputRefs.current[index] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleCodeInput(index, e.target.value)}
                        onKeyDown={(e) => handleCodeKeyDown(index, e)}
                        className="w-12 h-14 text-center text-2xl font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ))}
                  </div>
                  {emailChangeError && (
                    <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">
                      {emailChangeError}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={handleVerifyEmailChange}
                    disabled={emailChangeLoading || verificationCode.join("").length !== 6}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {emailChangeLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Change Email"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailChangeStep("input")
                      setEmailChangeError(null)
                    }}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                  >
                    Use a different email
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
