"use client"

import type React from "react"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { nativeLogOut } from "@/lib/native-bridge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, Copy, Check, ExternalLink, Globe, Loader2, AlertCircle, Mail, Lock } from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getStoreUrl, getStoreUrlDisplay } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"

const NICHE_OPTIONS = [
  "Design",
  "Development",
  "Marketing",
  "Business",
  "Photography",
  "Writing",
  "Music",
  "Fitness",
  "Finance",
  "Education",
  "Art",
  "Productivity",
]

interface SettingsFormProps {
  profile: Profile & { cover_url?: string }
  creator: Creator & {
    store_published?: boolean
    brand_color?: string
    cover_url?: string
    support_email?: string | null
  }
}

export function SettingsForm({ profile, creator }: SettingsFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState(profile.display_name || "")
  const [username, setUsername] = useState(profile.username || creator.slug)
  const [headline, setHeadline] = useState(creator.headline || "")
  const [bio, setBio] = useState(creator.bio || "")
  const [nicheTags, setNicheTags] = useState<string[]>(creator.niche_tags || [])
  const [brandColor, setBrandColor] = useState(creator.brand_color || "#0066FF")
  const [supportEmail, setSupportEmail] = useState<string>(creator.support_email || "")

  // Email change state
  const [currentEmail, setCurrentEmail] = useState(profile.email || "")
  const [newEmail, setNewEmail] = useState("")
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false)
  const [emailChangeStep, setEmailChangeStep] = useState<"input" | "verify">("input")
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""])
  const [emailChangeLoading, setEmailChangeLoading] = useState(false)
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null)
  const [emailChangeSuccess, setEmailChangeSuccess] = useState(false)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Password reset state
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null)

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

  const toggleTag = (tag: string) => {
    setNicheTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 3 ? [...prev, tag] : prev,
    )
  }

  const copyStoreLink = () => {
    navigator.clipboard.writeText(storeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

    try {
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

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          username: cleanUsername,
        })
        .eq("id", profile.id)

      if (profileError) throw profileError

      const supportEmailClean = supportEmail ? supportEmail.trim().toLowerCase() : null

      const { error: creatorError } = await supabase
        .from("creators")
        .update({
          slug: cleanUsername,
          headline,
          bio,
          niche_tags: nicheTags,
          brand_color: brandColor,
          support_email: supportEmailClean,
        })
        .eq("id", creator.id)

      if (creatorError) throw creatorError

      setSuccess(true)
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
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

    // Auto-focus next input
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

  return (
    <div className="h-full overflow-y-auto page-scroll bg-white p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and storefront</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Brand Color - keeping this here for global theming */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Brand Color</CardTitle>
            <CardDescription>Your primary brand color for the store</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="brandColor">Brand Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="brandColor"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer rounded border border-border"
                />
                <Input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-28 font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Info */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your public profile information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => validateUsername(e.target.value)}
                placeholder="yourname"
                className={usernameError ? "border-destructive" : ""}
              />
              {usernameError ? (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {usernameError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Your unique URL: {storeUrlDisplay}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2">
                <Input id="email" value={currentEmail} disabled className="bg-muted flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailChangeModal(true)}
                  className="whitespace-nowrap"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Change
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supportEmail">Support email (customers reply here)</Label>
              <Input
                id="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                When a customer replies to "Your download is ready", it goes to this email.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Store Link */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Your Store
            </CardTitle>
            <CardDescription>Share your store link with customers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={storeUrlDisplay} readOnly className="bg-muted font-mono text-sm" />
              <Button type="button" variant="outline" size="icon" onClick={copyStoreLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" asChild>
                <SmartLink href={storeUrl}>
                  <ExternalLink className="h-4 w-4" />
                </SmartLink>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Your store is always public. Anyone with this link can view your products.
            </p>
          </CardContent>
        </Card>

        {/* Storefront */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Storefront</CardTitle>
            <CardDescription>Customize how your storefront appears to customers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                placeholder="What do you help people with?"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label>Niche tags (up to 3)</Label>
              <div className="flex flex-wrap gap-2">
                {NICHE_OPTIONS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={nicheTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                    {nicheTags.includes(tag) && <X className="ml-1 h-3 w-3" />}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your password and account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Password</p>
                <p className="text-xs text-muted-foreground">Reset your account password</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePasswordReset}
                disabled={passwordResetLoading || passwordResetSent}
                className="whitespace-nowrap"
              >
                {passwordResetLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Sending...
                  </>
                ) : passwordResetSent ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Sent
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1" />
                    Reset Password
                  </>
                )}
              </Button>
            </div>
            {passwordResetSent && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                Password reset email sent! Check your inbox for the reset link.
              </p>
            )}
            {passwordResetError && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                {passwordResetError}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>

        {error && <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

        {success && (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600">Settings saved successfully!</div>
        )}

        <Button type="submit" disabled={isLoading || !!usernameError} className="bg-blue-600 hover:bg-blue-700">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </form>

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
                      className="bg-muted mt-1"
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
                    <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                      {emailChangeError}
                    </p>
                  )}
                  <Button
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
                    <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg text-center">
                      {emailChangeError}
                    </p>
                  )}
                  <Button
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
