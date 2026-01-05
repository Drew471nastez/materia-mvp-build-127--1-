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
  Upload,
  Image as ImageIcon,
  CreditCard,
  FileText,
  Sparkles,
  X,
  Loader2,
  Bell,
} from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Custom Toggle Component
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-green-500" : "bg-gray-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

// Settings sections with Linktree-style icons
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic Info", icon: FileText },
  { id: "seo", label: "SEO", icon: Globe },
  { id: "subscribe", label: "Subscribe", icon: Bell },
  { id: "billing", label: "Billing", icon: CreditCard },
]

export function SettingsTab() {
  const { onepage, updateProfile, updateSettings, updateSlug, save, saveState } = useOnePage()
  const [activeSection, setActiveSection] = useState("basic")
  const [copied, setCopied] = useState(false)
  const [showOgImageModal, setShowOgImageModal] = useState(false)
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

  // Subscribe states
  const [subscribeEnabled, setSubscribeEnabled] = useState(onepage?.settings?.subscribe_enabled ?? true)
  const [subscribeStyle, setSubscribeStyle] = useState<"glass" | "white" | "black">(onepage?.settings?.subscribe_style || "glass")

  // Update local state when onepage changes
  useEffect(() => {
    if (onepage) {
      setPageName(onepage.title || "")
      setPageSlug(onepage.slug || "")
      setMetaTitle(onepage.settings?.seo_title || onepage.title || "")
      setMetaDescription(onepage.settings?.seo_description || onepage.bio || "")
      setOgImage(onepage.settings?.social_image_url || "")
      setSubscribeEnabled(onepage.settings?.subscribe_enabled ?? true)
      setSubscribeStyle(onepage.settings?.subscribe_style || "glass")
    }
  }, [onepage])

  if (!onepage) return null

  const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/l/${onepage.slug}`
  const hostUrl = typeof window !== "undefined" ? window.location.host : ""

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

  const handleSaveSeo = async () => {
    setLocalSaveState("saving")
    try {
      updateSettings({
        seo_title: metaTitle,
        seo_description: metaDescription,
        social_image_url: ogImage || null,
      })
      await save()
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } catch {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

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
    } catch (error) {
      console.error("Upload error:", error)
      alert("Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
      // Reset input
      if (e.target) e.target.value = ""
    }
  }

  const removeOgImage = () => {
    setOgImage("")
  }

  // Sidebar navigation item component
  const NavItem = ({ section }: { section: typeof SETTINGS_SECTIONS[0] }) => {
    const Icon = section.icon
    const isActive = activeSection === section.id

    return (
      <button
        onClick={() => setActiveSection(section.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
          isActive
            ? "bg-gray-100 text-gray-900"
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
          onChange={(e) => setPageName(e.target.value)}
          placeholder="My OnePage"
          className="h-10 rounded-lg border-gray-200 focus:border-gray-400 focus:ring-gray-400"
        />
      </div>

      {/* Public URL / Slug - Fixed with truncation */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Public URL</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-gray-50 rounded-lg border border-gray-200 h-10 min-w-0 overflow-hidden">
            <span
              className="text-sm text-gray-500 pl-3 flex-shrink-0 truncate max-w-[120px]"
              title={`${hostUrl}/l/`}
            >
              {hostUrl}/l/
            </span>
            <Input
              value={pageSlug}
              onChange={(e) => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="your-page"
              className="border-0 bg-transparent h-full px-1 focus-visible:ring-0 text-sm font-medium min-w-0 flex-1"
            />
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
        className="w-full h-10 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm text-white"
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
          onChange={(e) => setMetaTitle(e.target.value)}
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
          onChange={(e) => setMetaDescription(e.target.value)}
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
          <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200">
            <img src={ogImage} alt="Social preview" className="w-full h-full object-cover" />
            <button
              onClick={removeOgImage}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={() => setShowOgImageModal(true)}
              className="absolute bottom-2 right-2 px-3 py-1.5 bg-white/90 hover:bg-white rounded-lg text-sm font-medium transition-colors"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowOgImageModal(true)}
            className="w-full aspect-video rounded-lg border border-dashed border-gray-300 hover:border-blue-400 transition-colors flex flex-col items-center justify-center gap-2 bg-gray-50 hover:bg-blue-50/50"
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
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="aspect-video bg-gray-100 flex items-center justify-center">
            {ogImage ? (
              <img src={ogImage} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-300" />
            )}
          </div>
          <div className="p-3 bg-white">
            <p className="font-medium text-sm truncate text-gray-900">{metaTitle || "Page Title"}</p>
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{metaDescription || "Description..."}</p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSaveSeo}
        disabled={isSaving}
        className="w-full h-10 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm text-white"
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
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div>
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
                        ? "border-blue-500 bg-blue-50"
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
                      subscribeStyle === option.id ? "border-blue-500" : "border-gray-300"
                    )}>
                      {subscribeStyle === option.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
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
          className="w-full h-10 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm text-white"
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
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900">Pro Plan</p>
            <p className="text-xs text-gray-500">$9/month</p>
          </div>
        </div>
        <ul className="space-y-2 mb-4">
          {["Remove branding", "Custom domain", "Advanced analytics", "Priority support"].map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Check className="h-3.5 w-3.5 text-blue-500" />
              {feature}
            </li>
          ))}
        </ul>
        <Button className="w-full h-10 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm text-white">
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
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  activeSection === section.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600"
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
          {activeSection === "billing" && renderBilling()}
        </div>
      </div>

      {/* OG Image Upload Modal */}
      <Dialog open={showOgImageModal} onOpenChange={setShowOgImageModal}>
        <DialogContent className="w-[calc(100%-24px)] max-w-sm p-0 gap-0 overflow-hidden rounded-xl mx-auto">
          <DialogHeader className="p-3 border-b">
            <DialogTitle className="text-sm font-semibold">Upload Social Image</DialogTitle>
          </DialogHeader>
          <div className="p-3 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full aspect-[16/9] rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  <span className="text-xs text-gray-500">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-xs text-gray-500">Click to upload</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG up to 5MB</span>
                </>
              )}
            </button>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-lg h-8 text-xs"
              onClick={() => setShowOgImageModal(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
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
}
