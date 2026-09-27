"use client"

import { useOnePage } from "@/lib/onepage/context"
import { typedSeoTitle } from "@/lib/account/identity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ChipFill } from "@/components/onepage/choice-marks"
import {
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  CreditCard,
  X,
  Loader2,
  Bell,
  Send,
} from "lucide-react"
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { secondaryDepth } from "@/components/ui/depth-button"
import { Switch } from "@/components/onepage/editor-kit"
import { getLinksUrl, getLinksUrlDisplay } from "@/lib/url-helpers"
import { PRO_CHECKOUT_PLAN_ID, offeredPlan, planDisplayName, planHighlights, type PlanId } from "@/lib/billing/plans"

/* The app's one switch (components/ui/switch-style through editor-kit), as the Links and Design tabs draw it. */
function Toggle({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label?: string }) {
  return <Switch checked={checked} onChange={onCheckedChange} label={label ?? ""} />
}

// Settings sections with Linktree-style icons
/* Words only: a row of stock icons beside six words said nothing the words did not. */
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic info" },
  { id: "seo", label: "SEO" },
  { id: "subscribe", label: "Subscribe" },
  { id: "share", label: "Share" },
  { id: "verified", label: "Verified badge" },
  { id: "billing", label: "Billing" },
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
  /**
   * Hands every field typed into this tab to the page, so the next save()
   * sends it. Makes no request of its own: the editor's save is the one that
   * writes, and the one that reports whether it worked.
   */
  saveAllSettings: () => Promise<void>
}

export const SettingsTab = forwardRef<SettingsTabRef>(function SettingsTab(_, ref) {
  const { onepage, updateProfile, updateSettings, updateSlug, save, saveState, markDirty, getLatestOnePage } = useOnePage()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState("basic")
  const [copied, setCopied] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [localSaveState, setLocalSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Billing state
  const [userPlan, setUserPlan] = useState<"free" | "growth" | "pro" | null>(null)
  const [planLoading, setPlanLoading] = useState(true)

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then(r => r.json())
      .then(data => {
        const plan = (data.subscription?.plan_id || data.currentPlan?.id) as "free" | "growth" | "pro" | undefined
        setUserPlan(plan || "free")
      })
      .catch(() => setUserPlan("free"))
      .finally(() => setPlanLoading(false))
  }, [])

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

  /**
   * A FIELD IS ONLY REFILLED FROM THE PAGE WHEN THE PAGE'S VALUE FOR IT MOVED,
   * AND NOBODY IS TYPING IN IT.
   *
   * This used to copy every field back from the page whenever anything on
   * the page changed. The toggles below write to the page as they are
   * flipped, so typing an SEO title and then turning Share on put the old
   * title back over the new one. Now each field remembers the value it last
   * took from the page (`syncedFromPageRef`). When the page's value is still
   * that, nothing happens. When it has moved (an undo, a save that came
   * back), the field follows it only if what is in the field is still what it
   * took last time; if it differs, somebody typed there, and the typing wins.
   */
  const fromPage = onepage
    ? {
        pageName: onepage.title || "",
        pageSlug: onepage.slug || "",
        metaTitle: onepage.settings?.seo_title || onepage.title || "",
        metaDescription: onepage.settings?.seo_description || onepage.bio || "",
        ogImage: onepage.settings?.social_image_url || "",
        ogPosX: onepage.settings?.social_image_position_x ?? 50,
        ogPosY: onepage.settings?.social_image_position_y ?? 50,
        subscribeEnabled: onepage.settings?.subscribe_enabled ?? true,
        subscribeStyle: onepage.settings?.subscribe_style || "glass",
        shareEnabled: onepage.settings?.share_enabled ?? true,
        shareStyle: onepage.settings?.share_style || "white",
        verifiedEnabled: (onepage.settings as any)?.verified_badge_enabled ?? false,
        verifiedType: (onepage.settings as any)?.verified_badge_type || "verified_creator",
      }
    : null
  const inFields: Record<string, unknown> = {
    pageName, pageSlug, metaTitle, metaDescription, ogImage, ogPosX, ogPosY,
    subscribeEnabled, subscribeStyle, shareEnabled, shareStyle, verifiedEnabled, verifiedType,
  }
  const setField: Record<string, (value: any) => void> = {
    pageName: setPageName, pageSlug: setPageSlug, metaTitle: setMetaTitle, metaDescription: setMetaDescription,
    ogImage: setOgImage, ogPosX: setOgPosX, ogPosY: setOgPosY,
    subscribeEnabled: setSubscribeEnabled, subscribeStyle: setSubscribeStyle,
    shareEnabled: setShareEnabled, shareStyle: setShareStyle,
    verifiedEnabled: setVerifiedEnabled, verifiedType: setVerifiedType,
  }
  const syncedFromPageRef = useRef<Record<string, unknown> | null>(null)
  const fromPageKey = JSON.stringify(fromPage)
  useEffect(() => {
    if (!fromPage) return
    const synced = syncedFromPageRef.current
    if (!synced) {
      // The fields were just filled from this same page by their useState
      syncedFromPageRef.current = { ...fromPage }
      return
    }
    for (const [key, incoming] of Object.entries(fromPage)) {
      if (Object.is(synced[key], incoming)) continue
      const typedIn = !Object.is(inFields[key], synced[key])
      synced[key] = incoming
      if (!typedIn) setField[key](incoming)
    }
    // Keyed on the page's values for these fields, not on the whole page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPageKey])

  /** Whether a field holds something typed since it last took the page's value. */
  const typedSinceSync = (key: string, value: unknown) => {
    const synced = syncedFromPageRef.current
    return !!synced && !Object.is(synced[key], value)
  }

  if (!onepage) return null

  // Use subdomain-based URLs for the links page
  const pageUrl = getLinksUrl(onepage.slug)
  const pageUrlDisplay = getLinksUrlDisplay(onepage.slug)

  const copyUrl = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Every Save button in this tab ends here. save() answers whether the page
   * was saved; "Saved!" is shown only when it was, and a failure is put on
   * screen by the editor, which watches every save.
   */
  const finishSave = async () => {
    const result = await save()
    if (result.ok) {
      setLocalSaveState("saved")
      setTimeout(() => setLocalSaveState("idle"), 2000)
    } else {
      setLocalSaveState("error")
      setTimeout(() => setLocalSaveState("idle"), 3000)
    }
  }

  const handleSaveBasicInfo = async () => {
    setLocalSaveState("saving")
    /* The page's title and address are written before save() reads the page.
       They used to reach it only after a render, so this saved the old ones. */
    updateProfile({ title: pageName })
    if (pageSlug !== onepage.slug) {
      updateSlug(pageSlug)
    }
    await finishSave()
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

  /*
    SEO IS SAVED LIKE EVERYTHING ELSE. It used to PUT `{ ...onepage }` itself,
    the whole page as this tab last rendered it, to get around save() reading
    the page before updateSettings had reached it. That copy carried the
    archived blocks the editor opened with, so a block archived during the
    visit came back in the database. The context now writes the page before
    save() reads it, so the settings go to the page and save() sends them.
  */
  const handleSaveSeo = async () => {
    setLocalSaveState("saving")
    updateSettings({
      /*
        THE BOX SHOWS THE PAGE NAME UNTIL SOMEBODY TYPES OVER IT, and this
        used to save what it was showing. That wrote a second copy of the
        creator's name into the page, and a copy that outranked everything:
        renaming yourself changed the page and the tab still read the old
        name, because the tab title starts from this field. Only a title
        that says something the page name does not is stored
        (lib/account/identity typedSeoTitle).
      */
      seo_title: typedSeoTitle(metaTitle, pageName || onepage?.title),
      seo_description: metaDescription,
      social_image_url: ogImage || null,
      social_image_position_x: ogImage ? ogPosX : null,
      social_image_position_y: ogImage ? ogPosY : null,
    } as any)
    await finishSave()
  }

  /*
    WHAT THE HEADER'S SAVE, AND LEAVING THIS TAB, TAKE FROM HERE: the fields
    somebody typed in, and nothing else. The toggles and styles below already
    write to the page as they change. This used to make its own PUT of the
    whole page and throw if it failed, with nobody catching it, and it wrote
    every field whether touched or not, so an SEO title that was only
    showing the page title as its placeholder value was saved as a title of
    its own.
  */
  const handleSaveAllSettings = async () => {
    if (typedSinceSync("pageName", pageName)) {
      updateProfile({ title: pageName })
    }
    if (typedSinceSync("pageSlug", pageSlug) && pageSlug !== onepage.slug) {
      updateSlug(pageSlug)
    }
    const typedSettings: Record<string, unknown> = {}
    if (typedSinceSync("metaTitle", metaTitle)) typedSettings.seo_title = typedSeoTitle(metaTitle, pageName || onepage?.title)
    if (typedSinceSync("metaDescription", metaDescription)) typedSettings.seo_description = metaDescription
    if (typedSinceSync("ogPosX", ogPosX) || typedSinceSync("ogPosY", ogPosY)) {
      typedSettings.social_image_position_x = ogImage ? ogPosX : null
      typedSettings.social_image_position_y = ogImage ? ogPosY : null
    }
    if (Object.keys(typedSettings).length > 0) {
      updateSettings(typedSettings as any)
    }
  }

  // Expose save methods so the global Save button in the editor can call them
  useImperativeHandle(ref, () => ({
    saveSeo: handleSaveSeo,
    saveAllSettings: handleSaveAllSettings,
  }))

  const handleSaveSubscribe = async () => {
    setLocalSaveState("saving")
    updateSettings({
      subscribe_enabled: subscribeEnabled,
      subscribe_style: subscribeStyle,
    })
    await finishSave()
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
    updateSettings({
      share_enabled: shareEnabled,
      share_style: shareStyle,
    })
    await finishSave()
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
    updateSettings({
      verified_badge_enabled: verifiedEnabled,
      verified_badge_type: verifiedType,
    } as any)
    await finishSave()
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

      /*
        WRITTEN AT ONCE, AND ONLY WHAT CHANGED. The picture is stored straight
        away so it survives a refresh without a Save. The request used to send
        `{ ...onepage }`, the whole page as it was when this tab rendered,
        including the archived blocks the editor opened with, so a block
        archived since then came back in the database. It sends the page's id
        and these three settings now; the server merges settings into what it
        has. Once that worked the page is told quietly (it is already saved);
        if it did not, it is told as an ordinary edit, so the next Save sends
        it.
      */
      const latestSettings = (getLatestOnePage()?.settings as any) || {}
      const imageSettings = {
        social_image_url: publicUrl,
        // Preserve existing focal point if already set
        social_image_position_x: latestSettings.social_image_position_x ?? 50,
        social_image_position_y: latestSettings.social_image_position_y ?? 50,
      }
      const res = await fetch("/api/onepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: onepage.id, settings: imageSettings }),
      }).catch(() => null)
      updateSettings(imageSettings as any, { silent: !!res?.ok })
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
    // Also clear from the database immediately: the id and the three settings
    // that change, never the whole page (see handleImageUpload)
    const clearedSettings = {
      social_image_url: null,
      social_image_position_x: null,
      social_image_position_y: null,
    }
    const res = await fetch("/api/onepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: onepage.id, settings: clearedSettings }),
    }).catch(() => null)
    updateSettings(clearedSettings as any, { silent: !!res?.ok })
  }

  // Sidebar navigation item component
  const NavItem = ({ section }: { section: typeof SETTINGS_SECTIONS[0] }) => {
    const isActive = activeSection === section.id

    return (
      <button
        onClick={() => setActiveSection(section.id)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "w-full flex items-center px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors text-left cursor-pointer",
          isActive
            ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-[#e5e7eb]"
            : "text-[#6b7280] hover:bg-white/70 hover:text-[#1a1a2e]"
        )}
      >
        {section.label}
      </button>
    )
  }

  const getSaveButtonText = () => {
    if (localSaveState === "saving" || saveState === "saving") return "Saving..."
    if (localSaveState === "error" || saveState === "error") return "Not saved. Try again"
    if (localSaveState === "saved" || saveState === "saved") return "Saved!"
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
        className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white"
      >
        {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {getSaveButtonText()}
      </Button>
    </div>
  )

  /*
    SEO, AS ONE CARD. It used to be two fields, an upload box with an image
    icon, a modal with a cloud icon, and then a second picture of the same
    image under "Preview". Now the card IS the preview: the image as it will
    be cropped when the link is shared, with the title and description under
    it, and two plain buttons. Add image opens the file picker straight away;
    there is nothing a modal in between was adding. Drag on the image to set
    the focal point, the same as before.
  */
  const renderSeo = () => (
    <div className="space-y-5" data-onepage-seo="">
      <div>
        <h3 className="text-base font-semibold text-[#1a1a2e]">Search and sharing</h3>
        <p className="mt-0.5 text-[13px] text-[#6b7280]">What people see on Google and when your link is shared.</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label className="text-[13px] font-medium text-[#374151]">Title</Label>
          <span className={cn("text-[12px] tabular-nums", metaTitle.length > 60 ? "text-amber-600" : "text-[#9ca3af]")}>{metaTitle.length}/60</span>
        </div>
        <Input
          value={metaTitle}
          onChange={(e) => { setMetaTitle(e.target.value); markDirty() }}
          placeholder={pageName || "My page"}
          className="h-10 rounded-lg border-gray-200"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label className="text-[13px] font-medium text-[#374151]">Description</Label>
          <span className={cn("text-[12px] tabular-nums", metaDescription.length > 160 ? "text-amber-600" : "text-[#9ca3af]")}>{metaDescription.length}/160</span>
        </div>
        <Textarea
          value={metaDescription}
          onChange={(e) => { setMetaDescription(e.target.value); markDirty() }}
          placeholder="One or two lines about you and what you share here"
          className="rounded-lg resize-none border-gray-200"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[13px] font-medium text-[#374151]">Share preview</Label>
        <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-og-card="">
          {ogImage ? (
            <div
              ref={focalContainerRef}
              className="relative aspect-[1200/630] cursor-crosshair select-none touch-none overflow-hidden bg-[#f3f4f6]"
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
                alt="Share preview"
                className="h-full w-full object-cover pointer-events-none"
                style={{ objectPosition: `${ogPosX}% ${ogPosY}%` }}
                draggable={false}
              />
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${ogPosX}%`, top: `${ogPosY}%` }}
              >
                <div className={cn(
                  "h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] transition-transform duration-150",
                  isDraggingFocal ? "scale-125" : "scale-100"
                )} />
              </div>
            </div>
          ) : (
            <div className="relative flex aspect-[1200/630] items-center justify-center overflow-hidden bg-[#f3f4f6]">
              {onepage?.avatar_url ? (
                <img src={onepage.avatar_url} alt="" className="h-full w-full object-cover opacity-90" />
              ) : (
                <span className="text-[13px] text-[#9ca3af]">No image yet</span>
              )}
            </div>
          )}
          <div className="border-t border-[#f0f0f2] px-3.5 py-3">
            <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{metaTitle || pageName || "Your page"}</p>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#6b7280]">{metaDescription || "Your description shows here."}</p>
            <p className="mt-1 truncate text-[12px] text-[#9ca3af]">{getLinksUrlDisplay(pageSlug)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            disabled={isUploading}
            data-og-pick=""
            className={cn(secondaryDepth, "h-9 rounded-lg px-3.5 text-[13px]")}
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isUploading ? "Uploading" : ogImage ? "Change image" : "Add image"}
          </button>
          {ogImage && !isUploading && (
            <button
              type="button"
              onClick={removeOgImage}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
            >
              Remove
            </button>
          )}
          <span className="ml-auto text-[12px] text-[#9ca3af]">
            {ogImage ? "Drag on the image to move the crop" : "1200 x 630, up to 5 MB"}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => { void handleImageUpload(e); e.target.value = "" }}
          className="hidden"
        />
      </div>

      <Button
        onClick={handleSaveSeo}
        disabled={isSaving}
        className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white"
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
          <Toggle label="Let visitors subscribe"
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
                        ? "border-[#1a1a2e] bg-[#f4f4f6]"
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
                      subscribeStyle === option.id ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {subscribeStyle === option.id && <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />}
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
          className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white"
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
          <Toggle label="Enable Share button"
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
                        ? "border-[#1a1a2e] bg-[#f4f4f6]"
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
                      shareStyle === option.id ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {shareStyle === option.id && <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />}
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
          className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white"
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
          <Toggle label="Enable Verified Badge"
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
          className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {getSaveButtonText()}
        </Button>
      </div>
    )
  }

  // Internal "growth" is sold as Pro; the earlier "pro" plan is also Pro.
  // Each plan is described by its fee, from the same table that charges it.
  const currentPlanKey: PlanId = userPlan === "growth" || userPlan === "pro" ? userPlan : "free"
  const currentPlanInfo = {
    name: planDisplayName(currentPlanKey),
    description: planHighlights(currentPlanKey)[0],
  }
  const isPaid = userPlan === "growth" || userPlan === "pro"
  const proOffer = offeredPlan(PRO_CHECKOUT_PLAN_ID)

  const renderBilling = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Billing</h3>
        <p className="text-sm text-gray-500">Manage your subscription and billing</p>
      </div>

      {/* Current Plan */}
      <div className="bg-gray-900 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-400">Current Plan</span>
          <span className="px-2 py-0.5 bg-white/10 text-white text-xs font-medium rounded-full">Active</span>
        </div>
        {planLoading ? (
          <div className="h-7 w-24 bg-white/10 rounded animate-pulse" />
        ) : (
          <>
            <p className="text-xl font-bold">{currentPlanInfo.name}</p>
            <p className="text-sm text-gray-400 mt-1">{currentPlanInfo.description}</p>
          </>
        )}
      </div>

      {/* Pro offer: only for Free. Pro is the top plan on sale. */}
      {!isPaid && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="font-medium text-sm text-gray-900">{proOffer.name} plan</p>
            <p className="text-sm text-gray-600">{proOffer.price}{proOffer.period}</p>
          </div>
          <ul className="space-y-2 mb-4">
            {proOffer.features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                <Check className="h-3.5 w-3.5 text-[#1a1a2e]" />
                {feature}
              </li>
            ))}
          </ul>
          <Button
            className="w-full h-10 bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg text-sm text-white cursor-pointer"
            onClick={() => router.push("/app/settings/billing/upgrade")}
          >
            Upgrade to {proOffer.name}
          </Button>
        </div>
      )}

      {/* Manage Billing Link */}
      <Link
        href="/app/settings/billing"
        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <CreditCard className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">Manage billing & invoices</span>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </Link>
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
        <div className="flex gap-2 overflow-x-auto p-px pb-1 no-scrollbar">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              aria-pressed={activeSection === section.id}
              className="relative px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer bg-white ring-1 ring-[#e5e7eb] [-webkit-tap-highlight-color:transparent]"
            >
              {/* The chosen chip's dark fill fades in as the last one's fades out (components/onepage/choice-marks). */}
              <ChipFill on={activeSection === section.id} />
              <span className={cn("relative transition-colors duration-[180ms]", activeSection === section.id ? "text-white" : "text-[#4b5563]")}>{section.label}</span>
            </button>
          ))}
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
