"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { X, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2 } from "lucide-react"
import { ImageUpload } from "@/components/app/image-upload"
import { isValidUsername } from "@/lib/reserved-words"
import { getStoreUrlDisplay } from "@/lib/url-helpers"
import { WelcomeModalWrapper } from "@/components/app/welcome-modal-wrapper"

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

const GOAL_OPTIONS = [
  { id: "digital", label: "Sell digital products", description: "Templates, guides, downloads" },
  { id: "course", label: "Sell online courses", description: "Video lessons, modules" },
  { id: "community", label: "Build a community", description: "Members-only content" },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [isCreator, setIsCreator] = useState<boolean | null>(null)
  const [username, setUsername] = useState("")
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [headline, setHeadline] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [brandColor, setBrandColor] = useState("#0066FF")
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [showOnExplore, setShowOnExplore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState("")
  const router = useRouter()

  const totalSteps = 6

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin)
    }

    const checkUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)

      // Check if already completed onboarding
      const { data: creator } = await supabase
        .from("creators")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .single()

      if (creator?.onboarding_completed) {
        router.push("/app")
        return
      }

      // Get profile data
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      if (profile) {
        setDisplayName(profile.display_name || "")
        if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
      }

      // Generate default username from email
      const emailUsername =
        user.email
          ?.split("@")[0]
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || ""
      setUsername(emailUsername)
    }
    checkUser()
  }, [router])

  const validateUsername = async (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setUsername(cleanValue)
    setUsernameError(null)

    if (cleanValue.length < 3) {
      return
    }

    // Local validation
    const validation = isValidUsername(cleanValue)
    if (!validation.valid) {
      setUsernameError(validation.error || "Invalid username")
      return
    }

    // Check if username is taken
    setCheckingUsername(true)
    const supabase = createClient()
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanValue)
      .neq("id", userId || "")
      .single()

    if (existing) {
      setUsernameError("This username is already taken")
    }
    setCheckingUsername(false)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 3 ? [...prev, tag] : prev,
    )
  }

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]))
  }

  const handleCreatorChoice = (choice: boolean) => {
    setIsCreator(choice)
    if (choice) {
      setStep(2)
    } else {
      router.push("/dashboard")
    }
  }

  const canProceed = () => {
    switch (step) {
      case 2:
        return displayName.length >= 2
      case 3:
        return selectedTags.length >= 1
      case 4:
        return username.length >= 3 && !usernameError && !checkingUsername
      case 5:
        return true // Avatar/cover are optional
      case 6:
        return selectedGoals.length >= 1
      default:
        return true
    }
  }

  const handleSubmit = async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "")

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_creator: true,
          username: cleanUsername,
          display_name: displayName,
          avatar_url: avatarUrl,
          cover_url: coverUrl,
        })
        .eq("id", userId)

      if (profileError) throw profileError

      // Check if creator record exists
      const { data: existingCreator } = await supabase.from("creators").select("id").eq("user_id", userId).single()

      if (existingCreator) {
        // Update existing creator
        const { error: creatorError } = await supabase
          .from("creators")
          .update({
            slug: cleanUsername,
            bio,
            headline,
            niche_tags: selectedTags,
            brand_color: brandColor,
            cover_url: coverUrl,
            goals: selectedGoals,
            show_on_explore: showOnExplore,
            store_published: true, // Always publish store
            onboarding_completed: true,
          })
          .eq("id", existingCreator.id)

        if (creatorError) throw creatorError
      } else {
        // Create new creator
        const { error: creatorError } = await supabase.from("creators").insert({
          user_id: userId,
          slug: cleanUsername,
          bio,
          headline,
          niche_tags: selectedTags,
          brand_color: brandColor,
          cover_url: coverUrl,
          goals: selectedGoals,
          show_on_explore: showOnExplore,
          store_published: true, // Always publish store
          onboarding_completed: true,
        })

        if (creatorError) throw creatorError
      }

      router.push("/app")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // Step 1: Creator or Buyer
  if (step === 1) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-white p-6">
        <div className="w-full max-w-md">
          <Card className="border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-semibold text-foreground">Welcome to Storelib</CardTitle>
              <CardDescription>Let's set up your account</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-center text-muted-foreground">Are you here to sell your knowledge?</p>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => handleCreatorChoice(false)}>
                  No, I'm a buyer
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => handleCreatorChoice(true)}>
                  Yes, I'm a creator
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Steps 2-6: Creator Onboarding
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white p-6">
      <WelcomeModalWrapper />
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{Math.round(((step - 1) / (totalSteps - 1)) * 100)}% complete</span>
          </div>
          <Progress value={((step - 1) / (totalSteps - 1)) * 100} className="h-2" />
        </div>

        <Card className="border-border">
          {/* Step 2: Display Name */}
          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">What's your name?</CardTitle>
                <CardDescription>This is how customers will see you</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="text-lg"
                  />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Niche Tags */}
          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">What do you create?</CardTitle>
                <CardDescription>Select up to 3 topics you create content about</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {NICHE_OPTIONS.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className={`cursor-pointer px-4 py-2 text-sm ${
                        selectedTags.includes(tag) ? "bg-blue-600 hover:bg-blue-700" : ""
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                      {selectedTags.includes(tag) && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="headline">Headline (optional)</Label>
                  <Input
                    id="headline"
                    placeholder="I help people learn to code"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bio">Bio (optional)</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell people about yourself..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Username/Slug */}
          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">Choose your username</CardTitle>
                <CardDescription>This will be your unique store URL</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <Input
                      id="username"
                      placeholder="yourname"
                      value={username}
                      onChange={(e) => validateUsername(e.target.value)}
                      className={usernameError ? "border-destructive" : ""}
                    />
                    {checkingUsername && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                    {!checkingUsername && !usernameError && username.length >= 3 && (
                      <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
                    )}
                  </div>
                  {username && !usernameError && (
                    <p className="text-sm text-muted-foreground">
                      Your store URL: <span className="font-mono">{getStoreUrlDisplay(username)}</span>
                    </p>
                  )}
                  {usernameError && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {usernameError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and dashes only. 3-30 characters.
                  </p>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 5: Branding */}
          {step === 5 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">Brand your store</CardTitle>
                <CardDescription>Add your profile picture and cover image</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label>Profile picture</Label>
                  <div className="flex items-start gap-4">
                    <div className="w-24">
                      <ImageUpload
                        bucket="avatars"
                        folder={userId || ""}
                        value={avatarUrl || undefined}
                        onChange={(url) => setAvatarUrl(url)}
                        aspectRatio="square"
                        maxSizeMB={5}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">Recommended: Square image, at least 200x200px</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Cover image (optional)</Label>
                  <ImageUpload
                    bucket="covers"
                    folder={userId || ""}
                    value={coverUrl || undefined}
                    onChange={(url) => setCoverUrl(url)}
                    aspectRatio="cover"
                    maxSizeMB={10}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brandColor">Brand color</Label>
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
            </>
          )}

          {/* Step 6: Goals */}
          {step === 6 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">What's your goal?</CardTitle>
                <CardDescription>Select what you plan to sell</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="space-y-3">
                  {GOAL_OPTIONS.map((goal) => (
                    <div
                      key={goal.id}
                      onClick={() => toggleGoal(goal.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors ${
                        selectedGoals.includes(goal.id)
                          ? "border-blue-600 bg-blue-50"
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{goal.label}</p>
                        <p className="text-sm text-muted-foreground">{goal.description}</p>
                      </div>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          selectedGoals.includes(goal.id) ? "border-blue-600 bg-blue-600" : "border-muted-foreground/50"
                        }`}
                      >
                        {selectedGoals.includes(goal.id) && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">Show on Explore</p>
                    <p className="text-sm text-muted-foreground">Let others discover your store</p>
                  </div>
                  <Switch checked={showOnExplore} onCheckedChange={setShowOnExplore} />
                </div>
              </CardContent>
            </>
          )}

          {/* Navigation */}
          <div className="border-t border-border p-6">
            {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 2}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {step < totalSteps ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading || !canProceed()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Complete setup
                      <Check className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
