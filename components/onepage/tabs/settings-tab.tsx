"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Globe,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Upload,
  Image as ImageIcon,
  CreditCard,
  FileText,
  Sparkles,
  X,
  Loader2,
  Bell,
  BadgeCheck,
  Send,
} from "lucide-react"
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getLinksUrl, getLinksUrlDisplay } from "@/lib/url-helpers"

// Toggle component using theme-checkbox (same as Links tab)
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="theme-checkbox"
    />
  )
}

// Settings sections with Linktree-style icons
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic Info", icon: FileText },
  { id: "seo", label: "SEO", icon: Globe },
  { id: "subscribe", label: "Subscribe", icon: Bell },
  { id: "share", label: "Share", icon: Send },
  { id: "verified", label: "Verified Badge", icon: BadgeCheck },
  { id: "billing", label: "Billing", icon: CreditCard },
]

// Badge type options
const BADGE_TYPES = [
  { id: "verified_creator", label: "Verified Creator" },
  { id: "verified_brand", label: "Verified Brand" },
  { id: "verified_business", label: "Verified Business" },
  { id: "official_page", label: "Official Page" },
  { id: "verified_artist", label: "Verified Artist" },
]

export interface SettingsTabRef {
  saveSeo: () => Promise<void>
  /** Sync ALL local settings state to context + API before global save */
  saveAllSettings: () => Promise<void>
}

export const SettingsTab = forwardRef<SettingsTabRef>(function SettingsTab(_, ref) {
  const { onepage, updateProfile, updateSettings, updateSlug, save, saveState, markDirty } = useOnePage()
  const [activeSection, setActiveSection] = useState("basic")
  const [copied, setCopied] = useState(false)
  const [showOgImageModal, setShowOgImageModal] = useState(false)
  const [seoPreviewTab, setSeoPreviewTab] = useState<"google" | "facebook" | "x">("google")
  const [isUploading, setIsUploading] = useState(false)
  const [localSaveState, setLocalSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form states
  const [pageName, setPageName] = useState(onepage?.title || "")
  const [pageSlug, setPageSlug] = useState(onepage?.slug || "")

  // SEO states
  const [metaTitle, setMetaTitle] = useState(onepage?.settings?.seo_title || onepage?.title || "")
  const [metaDescription, setMetaDescription] = useState(onepage?.settings?.seo_description || onepage?.bio || "")
  const [ogImage, setOgImage] = useState(onepage?.settings?.social_image_url || "")
  const [ogPosX, setOgPosX] = useState<number>(onepage?.settings?.social_image_position_x ?? 50)
  const [ogPosY, setOgPosY] = useState<number>(onepage?.settings?.social_image_position_y ?? 50)
  const [isDraggingFocal, setIsDraggingFocal] = useState(false)
  const focalContainerRef = useRef<HTMLDivElement>(null)

  // Subscribe states
  const [subscribeEnabled, setSubscribeEnabled] = useState(onepage?.settings?.subscribe_enabled ?? true)
  const [subscribeStyle, setSubscribeStyle] = useState<"glass" | "white" | "black">(onepage?.settings?.subscribe_style || "glass")

  // Share states
  const [shareEnabled, setShareEnabled] = useState(onepage?.settings?.share_enabled ?? true)
  const [shareStyle, setShareStyle] = useState<"glass" | "white" | "black">(onepage?.settings?.share_style || "white")

  // Verified badge states
  const [verifiedEnabled, setVerifiedEnabled] = useState((onepage?.settings as any)?.verified_badge_enabled ?? false)
  const [verifiedType, setVerifiedType] = useState<string>((onepage?.settings as any)?.verified_badge_type || "verified_creator")
  const [showBadgeDropdown, setShowBadgeDropdown] = useState(false)

  // Update local state when onepage changes
  useEffect(() => {
    if (onepage) {
      setPageName(onepage.title || "")
      setPageSlug(onepage.slug || "")
      setMetaTitle(onepage.settings?.seo_title || onepage.title || "")
      setMetaDescription(onepage.settings?.seo_description || onepage.bio || "")
      setOgImage(onepage.settings?.social_image_url || "")
      setOgPosX(onepage.settings?.social_image_position_x ?? 50)
      setOgPosY(onepage.settings?.social_image_position_y ?? 50)
      setSubscribeEnabled(onepage.settings?.subscribe_enabled ?? true)
      setSubscribeStyle(onepage.settings?.subscribe_style || "glass")
      setShareEnabled(onepage.settings?.share_enabled ?? true)
      setShareStyle(onepage.settings?.share_style || "white")
      setVerifiedEnabled((onepage.settings as any)?.verified_badge_enabled ?? false)
      setVerifiedType((onepage.settings as any)?.verified_badge_type || "verified_creator")
    }
  }, [onepage])

  if (!onepage) return null

  // Use subdomain-based URLs for the links page
  const pageUrl = getLinksUrl(onepage.slug)
  const pageUrlDisplay = getLinksUrlDisplay(onepage.slug)

  const copyUrl = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveBasicInfo = async () => {
    setLocalSaveState("saving")
    try {
      updateProfile({ title: pageName })
      if (pageSlug !== onepage.slug) {
        updateSlug(pageSlug)
      }
      await save()
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  const computeFocalFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!focalContainerRef.current) return
    const rect = focalContainerRef.current.getBoundingClientRect()
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)))
    setOgPosX(x)
    setOgPosY(y)
    markDirty()
  }, [])

  const handleSaveSeo = async () => {
    setLocalSaveState("saving")
    try {
      // Build the complete updated settings inline, using current local state values
      // This avoids any async React state timing issues with updateSettings + save()
      const updatedSettings = {
        ...((onepage?.settings as any) || {}),
        seo_title: metaTitle,
        seo_description: metaDescription,
        social_image_url: ogImage || null,
        social_image_position_x: ogImage ? ogPosX : null,
        social_image_position_y: ogImage ? ogPosY : null,
      }

      // Persist directly to the API with explicit values
      const res = await fetch("/api/onepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...onepage, settings: updatedSettings }),
      })
      if (!res.ok) throw new Error("Failed to save")

      // Also update context state so live preview and other handlers stay in sync
      updateSettings({
        seo_title: metaTitle,
        seo_description: metaDescription,
        social_image_url: ogImage || null,
        social_image_position_x: ogImage ? ogPosX : null,
        social_image_position_y: ogImage ? ogPosY : null,
      } as any)

      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  // Sync ALL local settings state to context + API so the global Save button
  // persists every section (basic info, SEO, subscribe, share, verified badge)
  const handleSaveAllSettings = async () => {
    // 1. Basic info — update context (slug + title)
    updateProfile({ title: pageName })
    if (pageSlug !== onepage.slug) {
      updateSlug(pageSlug)
    }

    // 2. Merge every settings section into one object and persist via API
    const mergedSettings = {
      ...((onepage?.settings as any) || {}),
      // SEO
      seo_title: metaTitle,
      seo_description: metaDescription,
      social_image_url: ogImage || null,
      social_image_position_x: ogImage ? ogPosX : null,
      social_image_position_y: ogImage ? ogPosY : null,
      // Subscribe
      subscribe_enabled: subscribeEnabled,
      subscribe_style: subscribeStyle,
      // Share
      share_enabled: shareEnabled,
      share_style: shareStyle,
      // Verified badge
      verified_badge_enabled: verifiedEnabled,
      verified_badge_type: verifiedType,
    }

    const res = await fetch("/api/onepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...onepage, settings: mergedSettings }),
    })
    if (!res.ok) throw new Error("Failed to save settings")

    // Keep context in sync so live preview reflects persisted values
    updateSettings({
      seo_title: metaTitle,
      seo_description: metaDescription,
      social_image_url: ogImage || null,
      social_image_position_x: ogImage ? ogPosX : null,
      social_image_position_y: ogImage ? ogPosY : null,
      subscribe_enabled: subscribeEnabled,
      subscribe_style: subscribeStyle,
      share_enabled: shareEnabled,
      share_style: shareStyle,
      verified_badge_enabled: verifiedEnabled,
      verified_badge_type: verifiedType,
    } as any)
  }

  // Expose save methods so the global Save button in the editor can call them
  useImperativeHandle(ref, () => ({
    saveSeo: handleSaveSeo,
    saveAllSettings: handleSaveAllSettings,
  }))

  const handleSaveSubscribe = async () => {
    setLocalSaveState("saving")
    try {
      updateSettings({
        subscribe_enabled: subscribeEnabled,
        subscribe_style: subscribeStyle,
      })
      await save()
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  // Live update subscribe settings (instant preview)
  const updateSubscribeSettings = (enabled?: boolean, style?: "glass" | "white" | "black") => {
    if (enabled !== undefined) setSubscribeEnabled(enabled)
    if (style !== undefined) setSubscribeStyle(style)
    updateSettings({
      subscribe_enabled: enabled ?? subscribeEnabled,
      subscribe_style: style ?? subscribeStyle,
    })
  }

  const handleSaveShare = async () => {
    setLocalSaveState("saving")
    try {
      updateSettings({
        share_enabled: shareEnabled,
        share_style: shareStyle,
      })
      await save()
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  // Live update share settings (instant preview)
  const updateShareSettings = (enabled?: boolean, style?: "glass" | "white" | "black") => {
    if (enabled !== undefined) setShareEnabled(enabled)
    if (style !== undefined) setShareStyle(style)
    updateSettings({
      share_enabled: enabled ?? shareEnabled,
      share_style: style ?? shareStyle,
    })
  }

  // Verified badge handlers
  const handleSaveVerified = async () => {
    setLocalSaveState("saving")
    try {
      updateSettings({
        verified_badge_enabled: verifiedEnabled,
        verified_badge_type: verifiedType,
      } as any)
      await save()
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  // Live update verified badge settings (instant preview)
  const updateVerifiedSettings = (enabled?: boolean, type?: string) => {
    if (enabled !== undefined) setVerifiedEnabled(enabled)
    if (type !== undefined) setVerifiedType(type)
    updateSettings({
      verified_badge_enabled: enabled ?? verifiedEnabled,
      verified_badge_type: type ?? verifiedType,
    } as any)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB")
      return
    }

    setIsUploading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/og-image-${Date.now()}.${fileExt}`

      const { error } = await supabase.storage
        .from("onepage-assets")
        .upload(fileName, file, { upsert: true })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from("onepage-assets")
        .getPublicUrl(fileName)

      setOgImage(publicUrl)
      setShowOgImageModal(false)

      // Immediately persist the new image URL to the database so it survives
      // a page refresh — don't wait for the user to manually click "Save".
      const updatedSettings = {
        ...((onepage?.settings as any) || {}),
        social_image_url: publicUrl,
        // Preserve existing focal point if already set
        social_image_position_x: (onepage?.settings as any)?.social_image_position_x ?? 50,
        social_image_position_y: (onepage?.settings as any)?.social_image_position_y ?? 50,
      }
      await fetch("/api/onepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...onepage, settings: updatedSettings }),
      })
      updateSettings({
        social_image_url: publicUrl,
        social_image_position_x: updatedSettings.social_image_position_x,
        social_image_position_y: updatedSettings.social_image_position_y,
      } as any)
    } catch (error: any) {
      console.error("Upload error:", error)
      const msg = error?.message || error?.error_description || JSON.stringify(error)
      alert(`Upload failed: ${msg}`)
    } finally {
      setIsUploading(false)
      // Reset input
      if (e.target) e.target.value = ""
    }
  }

  const removeOgImage = async () => {
    setOgImage("")
    // Also clear from the database immediately
    const updatedSettings = {
      ...((onepage?.settings as any) || {}),
      social_image_url: null,
      social_image_position_x: null,
      social_image_position_y: null,
    }
    await fetch("/api/onepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...onepage, settings: updatedSettings }),
    })
    updateSettings({
      social_image_url: null,
      social_image_position_x: null,
      social_image_position_y: null,
    } as any)
  }

  // Sidebar navigation item component
  const NavItem = ({ section }: { section: typeof SETTINGS_SECTIONS[0] }) => {
    const Icon = section.icon
    const isActive = activeSection === section.id

    return (
      <button
        onClick={() => setActiveSection(section.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
          isActive
            ? "bg-white text-gray-900 shadow-sm border border-gray-200"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{section.label}</span>
        {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
      </button>
    )
  }

  const getSaveButtonText = () => {
    if (localSaveState === "saving" || saveState === "saving") return "Saving..."
    if (localSaveState === "saved" || saveState === "saved") return "Saved!"
    if (localSaveState === "error" || saveState === "error") return "Error"
    return "Save Changes"
  }

  const isSaving = localSaveState === "saving" || saveState === "saving"

  const renderBasicInfo = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Basic Info</h3>
        <p className="text-sm text-gray-500">Manage your page settings</p>
      </div>

      {/* Page Name */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Page Name</Label>
        <Input
          value={pageName}
          onChange={(e) => { setPageName(e.target.value); markDirty() }}
          placeholder="My OnePage"
          className="h-10 rounded-lg border-gray-200 focus:border-gray-400 focus:ring-gray-400"
        />
      </div>

      {/* Page Slug */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Page Slug</Label>
        <Input
          value={pageSlug}
          onChange={(e) => { setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); markDirty() }}
          placeholder="your-page"
          className="h-10 rounded-lg border-gray-200 focus:border-gray-400 focus:ring-gray-400"
        />
      </div>

      {/* Public URL Display */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Public URL</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-gray-50 rounded-lg border border-gray-200 h-10 min-w-0 overflow-hidden px-3">
            <span
              className="text-sm text-gray-700 font-mono truncate"
              title={getLinksUrlDisplay(pageSlug)}
            >
              {getLinksUrlDisplay(pageSlug)}
            </span>
          </div>
          <button
            onClick={copyUrl}
            className="h-10 w-10 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </button>
        </div>
      </div>

      <Button
        onClick={handleSaveBasicInfo}
        disabled={isSaving}
        className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white"
      >
        {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {getSaveButtonText()}
      </Button>
    </div>
  )

  const renderSeo = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">SEO</h3>
        <p className="text-sm text-gray-500">Optimize for search engines</p>
      </div>

      {/* Meta Title */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Page Title</Label>
        <Input
          value={metaTitle}
          onChange={(e) => { setMetaTitle(e.target.value); markDirty() }}
          placeholder="My Page Title"
          className="h-10 rounded-lg border-gray-200"
        />
        <p className="text-xs text-gray-500">Appears in browser tabs and search results</p>
      </div>

      {/* Meta Description */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Meta Description</Label>
        <Textarea
          value={metaDescription}
          onChange={(e) => { setMetaDescription(e.target.value); markDirty() }}
          placeholder="A brief description..."
          className="rounded-lg resize-none border-gray-200"
          rows={3}
        />
        <p className="text-xs text-gray-500">{metaDescription.length}/160 characters</p>
      </div>

      {/* Social Share Image */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Social Image</Label>
        {ogImage ? (
          <div className="space-y-2">
            {/* Draggable focal-point container */}
            <div
              ref={focalContainerRef}
              className="relative aspect-video rounded-lg overflow-hidden border border-gray-200 cursor-crosshair select-none touch-none"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsDraggingFocal(true)
                computeFocalFromEvent(e.clientX, e.clientY)
              }}
              onMouseMove={(e) => {
                if (!isDraggingFocal) return
                computeFocalFromEvent(e.clientX, e.clientY)
              }}
              onMouseUp={() => setIsDraggingFocal(false)}
              onMouseLeave={() => setIsDraggingFocal(false)}
              onTouchStart={(e) => {
                setIsDraggingFocal(true)
                computeFocalFromEvent(e.touches[0].clientX, e.touches[0].clientY)
              }}
              onTouchMove={(e) => {
                if (!isDraggingFocal) return
                e.preventDefault()
                computeFocalFromEvent(e.touches[0].clientX, e.touches[0].clientY)
              }}
              onTouchEnd={() => setIsDraggingFocal(false)}
            >
              <img
                src={ogImage}
                alt="Social preview"
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: `${ogPosX}% ${ogPosY}%` }}
                draggable={false}
              />
              {/* Crosshair focal indicator */}
              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${ogPosX}%`, top: `${ogPosY}%` }}
              >
                {/* Outer ring */}
                <div className={cn(
                  "w-7 h-7 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)] transition-transform",
                  isDraggingFocal ? "scale-125" : "scale-100"
                )} />
                {/* Center dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                </div>
              </div>
              {/* Drag hint */}
              {!isDraggingFocal && (
                <div className="absolute bottom-2 left-2 pointer-events-none">
                  <span className="text-[11px] bg-black/55 text-white px-2 py-1 rounded-md font-medium">
                    Drag to set focal point
                  </span>
                </div>
              )}
              {/* Top-right controls */}
              <button
                onClick={(e) => { e.stopPropagation(); removeOgImage() }}
                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowOgImageModal(true) }}
                className="absolute bottom-2 right-2 px-3 py-1.5 bg-white/90 hover:bg-white rounded-lg text-sm font-medium transition-colors"
              >
                Change
              </button>
            </div>
            <p className="text-xs text-gray-400">Click or drag anywhere on the image to set the focal point for cropping.</p>
          </div>
        ) : (
          <button
            onClick={() => setShowOgImageModal(true)}
            className="w-full aspect-video rounded-lg border border-dashed border-gray-300 hover:border-violet-400 transition-colors flex flex-col items-center justify-center gap-2 bg-gray-50 hover:bg-violet-50/50"
          >
            <ImageIcon className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-500">Upload image</span>
            <span className="text-xs text-gray-400">1200x630px recommended</span>
          </button>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Preview</Label>
        {/* Platform tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {([
            { id: "google" as const, label: "Google" },
            { id: "facebook" as const, label: "Facebook" },
            { id: "x" as const, label: "𝕏" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSeoPreviewTab(tab.id)}
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors cursor-pointer",
                seoPreviewTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Google Preview */}
        {seoPreviewTab === "google" && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white p-4">
            <div className="space-y-1">
              <p className="text-xs text-green-700 truncate">{pageUrlDisplay || "storelib.com"}</p>
              <p className="text-base font-medium text-blue-700 truncate hover:underline cursor-pointer">{metaTitle || "Page Title"}</p>
              <p className="text-xs text-gray-600 line-clamp-2">{metaDescription || "Description..."}</p>
            </div>
          </div>
        )}

        {/* Facebook Preview */}
        {seoPreviewTab === "facebook" && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-[#f0f2f5]">
            {/* Facebook post wrapper */}
            <div className="bg-white rounded-lg m-2 shadow-sm border border-gray-200">
              {/* Post header */}
              <div className="flex items-center gap-2 p-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {(onepage?.title || "P").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">{onepage?.title || "Page"}</p>
                  <p className="text-[11px] text-gray-500">Just now</p>
                </div>
              </div>
              {/* Link card */}
              <div className="border-t border-gray-100">
                <div className="aspect-[1.91/1] bg-gray-100 flex items-center justify-center">
                  {ogImage ? (
                    <img src={ogImage} alt="Preview" className="w-full h-full object-cover" style={{ objectPosition: `${ogPosX}% ${ogPosY}%` }} />
                  ) : onepage?.avatar_url ? (
                    <img src={onepage.avatar_url} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                <div className="px-3 py-2.5 bg-[#f2f3f5] border-t border-gray-200">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide truncate">{pageUrlDisplay || "storelib.com"}</p>
                  <p className="text-[14px] font-semibold text-gray-900 truncate mt-0.5">{metaTitle || "Page Title"}</p>
                  <p className="text-[12px] text-gray-500 line-clamp-1 mt-0.5">{metaDescription || "Description..."}</p>
                </div>
              </div>
              {/* Facebook reactions bar */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200">
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-0.5">
                    <div className="w-[18px] h-[18px] rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                    </div>
                    <div className="w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                  </div>
                  <span className="text-[12px] text-gray-500 ml-1">24</span>
                </div>
                <span className="text-[12px] text-gray-500">3 comments</span>
              </div>
            </div>
          </div>
        )}

        {/* X/Twitter Preview */}
        {seoPreviewTab === "x" && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-black">
            {/* X post wrapper */}
            <div className="p-3">
              {/* Post header */}
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  {onepage?.avatar_url ? (
                    <img src={onepage.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-bold">
                      {(onepage?.title || "P").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] font-bold text-white truncate">{onepage?.title || "Page"}</span>
                    <svg viewBox="0 0 22 22" className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>
                    <span className="text-[13px] text-gray-500 truncate">@{onepage?.slug || "page"}</span>
                    <span className="text-gray-600 text-[13px]">·</span>
                    <span className="text-[13px] text-gray-500">1h</span>
                  </div>
                  {/* Post text */}
                  <p className="text-[14px] text-white mt-1 mb-2.5">Check out my page 🔗</p>
                  {/* Link card */}
                  <div className="rounded-2xl border border-gray-700 overflow-hidden">
                    <div className="aspect-[1.91/1] bg-gray-800 flex items-center justify-center">
                      {ogImage ? (
                        <img src={ogImage} alt="Preview" className="w-full h-full object-cover" style={{ objectPosition: `${ogPosX}% ${ogPosY}%` }} />
                      ) : onepage?.avatar_url ? (
                        <img src={onepage.avatar_url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-gray-600" />
                      )}
                    </div>
                    <div className="px-3 py-2 bg-black border-t border-gray-700">
                      <p className="text-[13px] text-gray-500 truncate">{pageUrlDisplay || "storelib.com"}</p>
                      <p className="text-[14px] text-white truncate">{metaTitle || "Page Title"}</p>
                      <p className="text-[13px] text-gray-500 line-clamp-2 mt-0.5">{metaDescription || "Description..."}</p>
                    </div>
                  </div>
                  {/* X action bar */}
                  <div className="flex items-center justify-between mt-2.5 pr-8">
                    <div className="flex items-center gap-1 text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"/></svg>
                      <span className="text-[13px]">5</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"/></svg>
                      <span className="text-[13px]">12</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>
                      <span className="text-[13px]">48</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Button
        onClick={handleSaveSeo}
        disabled={isSaving}
        className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white"
      >
        {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {getSaveButtonText()}
      </Button>
    </div>
  )

  const renderSubscribe = () => {
    const styleOptions = [
      {
        id: "glass" as const,
        label: "Glassmorphism",
        desc: "Modern frosted glass effect",
        preview: "rgba(255, 255, 255, 0.15)",
        border: "rgba(255, 255, 255, 0.2)"
      },
      {
        id: "white" as const,
        label: "White",
        desc: "Clean white transparency",
        preview: "rgba(255, 255, 255, 0.85)",
        border: "rgba(255, 255, 255, 0.9)"
      },
      {
        id: "black" as const,
        label: "Black",
        desc: "Dark sleek style",
        preview: "rgba(0, 0, 0, 0.7)",
        border: "rgba(255, 255, 255, 0.1)"
      },
    ]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Subscribe</h3>
          <p className="text-sm text-gray-500">Let visitors subscribe to your updates</p>
        </div>

        {/* Enable Subscribe Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900">Let visitors subscribe</p>
            <p className="text-xs text-gray-500 mt-0.5">Add a button so visitors can subscribe to your page</p>
          </div>
          <Toggle
            checked={subscribeEnabled}
            onCheckedChange={(checked) => updateSubscribeSettings(checked, undefined)}
          />
        </div>

        {subscribeEnabled && (
          <>
            {/* Style Options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Button Style</Label>
              <div className="grid gap-3">
                {styleOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => updateSubscribeSettings(undefined, option.id)}
                    className={cn(
                      "w-full flex items-center gap-4 p-3 rounded-xl border transition-all text-left",
                      subscribeStyle === option.id
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {/* Preview circle */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: option.preview,
                        border: `1px solid ${option.border}`,
                        backdropFilter: option.id === "glass" ? "blur(8px)" : undefined,
                      }}
                    >
                      <Bell className={cn(
                        "h-4 w-4",
                        option.id === "black" ? "text-white/80" : "text-gray-600"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.desc}</p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      subscribeStyle === option.id ? "border-violet-500" : "border-gray-300"
                    )}>
                      {subscribeStyle === option.id && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Info box */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-500">
                Turning off this feature will not affect your current subscriber count.
                The subscribe button appears in the top-right corner of your page.
              </p>
            </div>
          </>
        )}

        <Button
          onClick={handleSaveSubscribe}
          disabled={isSaving}
          className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {getSaveButtonText()}
        </Button>
      </div>
    )
  }

  const renderShare = () => {
    const styleOptions = [
      {
        id: "glass" as const,
        label: "Glassmorphism",
        desc: "Modern frosted glass effect",
        preview: "rgba(255, 255, 255, 0.15)",
        border: "rgba(255, 255, 255, 0.2)"
      },
      {
        id: "white" as const,
        label: "White",
        desc: "Clean white style (default)",
        preview: "rgba(255, 255, 255, 0.95)",
        border: "rgba(0, 0, 0, 0.1)"
      },
      {
        id: "black" as const,
        label: "Black",
        desc: "Dark sleek style",
        preview: "rgba(0, 0, 0, 0.75)",
        border: "rgba(255, 255, 255, 0.1)"
      },
    ]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Share</h3>
          <p className="text-sm text-gray-500">Let visitors share your page</p>
        </div>

        {/* Enable Share Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900">Enable Share button</p>
            <p className="text-xs text-gray-500 mt-0.5">Show a share button so visitors can share your page</p>
          </div>
          <Toggle
            checked={shareEnabled}
            onCheckedChange={(checked) => updateShareSettings(checked, undefined)}
          />
        </div>

        {shareEnabled && (
          <>
            {/* Style Options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Button Style</Label>
              <div className="grid gap-3">
                {styleOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => updateShareSettings(undefined, option.id)}
                    className={cn(
                      "w-full flex items-center gap-4 p-3 rounded-xl border transition-all text-left",
                      shareStyle === option.id
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {/* Preview circle */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: option.preview,
                        border: `1px solid ${option.border}`,
                        backdropFilter: option.id === "glass" ? "blur(8px)" : undefined,
                      }}
                    >
                      <Send className={cn(
                        "h-4 w-4",
                        option.id === "black" ? "text-white/80" : "text-gray-600"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.desc}</p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      shareStyle === option.id ? "border-violet-500" : "border-gray-300"
                    )}>
                      {shareStyle === option.id && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Info box */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-500">
                The share button appears in the top-left corner of your page.
                Visitors can share your page via social media, copy link, or messaging apps.
              </p>
            </div>
          </>
        )}

        <Button
          onClick={handleSaveShare}
          disabled={isSaving}
          className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {getSaveButtonText()}
        </Button>
      </div>
    )
  }

  const renderVerified = () => {
    const selectedBadge = BADGE_TYPES.find(b => b.id === verifiedType) || BADGE_TYPES[0]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Verified Badge</h3>
          <p className="text-sm text-gray-500">Show a verification badge next to your name</p>
        </div>

        {/* Enable Verified Badge Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900">Enable Verified Badge</p>
            <p className="text-xs text-gray-500 mt-0.5">Display a blue checkmark next to your page name</p>
          </div>
          <Toggle
            checked={verifiedEnabled}
            onCheckedChange={(checked) => updateVerifiedSettings(checked, undefined)}
          />
        </div>

        {verifiedEnabled && (
          <>
            {/* Badge Type Dropdown */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Badge Type</Label>
              <div className="relative">
                <button
                  onClick={() => setShowBadgeDropdown(!showBadgeDropdown)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg viewBox="0 0 22 22" className="w-5 h-5 text-blue-500" fill="currentColor">
                        <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
                      </svg>
                    </div>
                    <span className="font-medium text-sm text-gray-900">{selectedBadge.label}</span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", showBadgeDropdown && "rotate-180")} />
                </button>

                {showBadgeDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
                    {BADGE_TYPES.map((badge) => (
                      <button
                        key={badge.id}
                        onClick={() => {
                          updateVerifiedSettings(undefined, badge.id)
                          setShowBadgeDropdown(false)
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left",
                          verifiedType === badge.id && "bg-blue-50"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          verifiedType === badge.id ? "bg-blue-100" : "bg-gray-100"
                        )}>
                          <svg viewBox="0 0 22 22" className={cn("w-5 h-5", verifiedType === badge.id ? "text-blue-500" : "text-gray-400")} fill="currentColor">
                            <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
                          </svg>
                        </div>
                        <span className={cn(
                          "font-medium text-sm",
                          verifiedType === badge.id ? "text-blue-600" : "text-gray-900"
                        )}>{badge.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-500 mb-3">Preview</p>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{onepage.title || "Your Name"}</span>
                <div className="group relative">
                  <svg viewBox="0 0 22 22" className="w-4 h-4 text-blue-500 cursor-pointer" fill="currentColor">
                    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {selectedBadge.label}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <Button
          onClick={handleSaveVerified}
          disabled={isSaving}
          className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {getSaveButtonText()}
        </Button>
      </div>
    )
  }

  const renderBilling = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Billing</h3>
        <p className="text-sm text-gray-500">Manage your subscription</p>
      </div>

      {/* Current Plan */}
      <div className="bg-gray-900 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-400">Current Plan</span>
          <span className="px-2 py-0.5 bg-white/10 text-white text-xs font-medium rounded-full">Active</span>
        </div>
        <p className="text-xl font-bold">Free</p>
        <p className="text-sm text-gray-400 mt-1">Basic features</p>
      </div>

      {/* Upgrade Card */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900">Pro Plan</p>
            <p className="text-xs text-gray-500">$9/month</p>
          </div>
        </div>
        <ul className="space-y-2 mb-4">
          {["Remove branding", "Custom domain", "Advanced analytics", "Priority support"].map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Check className="h-3.5 w-3.5 text-violet-500" />
              {feature}
            </li>
          ))}
        </ul>
        <Button className="w-full h-10 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm text-white">
          Upgrade to Pro
        </Button>
      </div>

      {/* Payment Method */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Payment Method</Label>
        <button className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">No payment method</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar Navigation - Hidden on mobile, shown inline */}
      <div className="hidden md:block w-48 flex-shrink-0">
        <nav className="space-y-1 sticky top-0">
          {SETTINGS_SECTIONS.map((section) => (
            <NavItem key={section.id} section={section} />
          ))}
        </nav>
      </div>

      {/* Mobile Navigation - Horizontal scroll */}
      <div className="md:hidden -mx-4 px-4 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                  activeSection === section.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                <Icon className="h-4 w-4" />
                {section.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {activeSection === "basic" && renderBasicInfo()}
          {activeSection === "seo" && renderSeo()}
          {activeSection === "subscribe" && renderSubscribe()}
          {activeSection === "share" && renderShare()}
          {activeSection === "verified" && renderVerified()}
          {activeSection === "billing" && renderBilling()}
        </div>
      </div>

      {/* OG Image Upload Modal */}
      <Dialog open={showOgImageModal} onOpenChange={setShowOgImageModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b">
            <DialogTitle className="text-lg font-semibold text-center">Upload Social Image</DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-12 w-12 text-violet-500 animate-spin mb-4" />
                  <p className="font-medium text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-300 mb-4" />
                  <p className="font-medium text-gray-600">Select file to upload,</p>
                  <p className="font-medium text-gray-600">or drag-and-drop file</p>
                  <p className="text-sm text-gray-400 mt-2">1200×630px recommended · PNG, JPG up to 5MB</p>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add custom scrollbar hiding CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  )
})
