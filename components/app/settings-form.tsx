"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, Copy, Check, ExternalLink, Globe, Loader2, AlertCircle } from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"

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

  const storeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/u/${username}`

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
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-white p-8">
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
                <p className="text-xs text-muted-foreground">Your unique URL: {storeUrl}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={profile.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
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
              <Input value={storeUrl} readOnly className="bg-muted font-mono text-sm" />
              <Button type="button" variant="outline" size="icon" onClick={copyStoreLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" asChild>
                <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
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
    </div>
  )
}
