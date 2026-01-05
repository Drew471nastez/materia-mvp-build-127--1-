"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Globe,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  Mail,
  Phone,
  CreditCard,
  Settings2,
  Search as SearchIcon,
  Share2,
  FileText,
  Users,
  X,
} from "lucide-react"
import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Settings sections
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic Info", icon: FileText },
  { id: "seo", label: "SEO & Sharing", icon: SearchIcon },
  { id: "social", label: "Social & Contact", icon: Share2 },
  { id: "billing", label: "Billing", icon: CreditCard },
]

// Custom Toggle Component
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

export function SettingsTab() {
  const { onepage, updateProfile } = useOnePage()
  const [activeSection, setActiveSection] = useState("basic")
  const [copied, setCopied] = useState(false)
  const [showOgImageModal, setShowOgImageModal] = useState(false)

  // Form states
  const [pageName, setPageName] = useState(onepage?.title || "")
  const [pageSlug, setPageSlug] = useState(onepage?.slug || "")
  const [pageStatus, setPageStatus] = useState<"draft" | "published">("published")
  const [visibility, setVisibility] = useState<"public" | "private" | "password">("public")
  const [password, setPassword] = useState("")

  // SEO states
  const [metaTitle, setMetaTitle] = useState(onepage?.title || "")
  const [metaDescription, setMetaDescription] = useState(onepage?.bio || "")
  const [ogImage, setOgImage] = useState("")

  // Contact states
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!onepage) return null

  const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/l/${onepage.slug}`

  const copyUrl = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveBasicInfo = () => {
    updateProfile({ title: pageName })
    // Note: slug update would require backend API call
  }

  const handleSaveSeo = () => {
    // Save SEO settings - would require backend integration
    console.log("Saving SEO:", { metaTitle, metaDescription, ogImage })
  }

  const handleSaveContact = () => {
    // Save contact info - would require backend integration
    console.log("Saving Contact:", { contactEmail, contactPhone })
  }

  const renderBasicInfo = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Basic Page Info</h3>
        <p className="text-sm text-muted-foreground">Manage your page identity and visibility</p>
      </div>

      {/* Page Name */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Page Name</Label>
        <Input
          value={pageName}
          onChange={(e) => setPageName(e.target.value)}
          placeholder="My OnePage"
          className="h-11 rounded-xl"
        />
      </div>

      {/* Public URL / Slug */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Public URL</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-gray-50 rounded-xl border px-3 h-11">
            <span className="text-sm text-muted-foreground">{typeof window !== "undefined" ? window.location.origin : ""}/l/</span>
            <Input
              value={pageSlug}
              onChange={(e) => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="your-page"
              className="border-0 bg-transparent h-full px-0 focus-visible:ring-0 text-sm font-medium"
            />
          </div>
          <button
            onClick={copyUrl}
            className="h-11 w-11 rounded-xl border flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Page Status */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Page Status</Label>
        <div className="flex gap-2">
          <button
            onClick={() => setPageStatus("draft")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              pageStatus === "draft"
                ? "bg-amber-50 border-amber-500 text-amber-700"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            <EyeOff className="h-4 w-4 mx-auto mb-1" />
            Draft
          </button>
          <button
            onClick={() => setPageStatus("published")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              pageStatus === "published"
                ? "bg-green-50 border-green-500 text-green-700"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            <Eye className="h-4 w-4 mx-auto mb-1" />
            Published
          </button>
        </div>
      </div>

      {/* Visibility */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Visibility</Label>
        <div className="space-y-2">
          <button
            onClick={() => setVisibility("public")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
              visibility === "public"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <Globe className="h-5 w-5 text-blue-500" />
            <div>
              <p className="font-medium text-sm">Public</p>
              <p className="text-xs text-muted-foreground">Anyone can view your page</p>
            </div>
          </button>
          <button
            onClick={() => setVisibility("private")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
              visibility === "private"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <Lock className="h-5 w-5 text-gray-500" />
            <div>
              <p className="font-medium text-sm">Private</p>
              <p className="text-xs text-muted-foreground">Only you can view this page</p>
            </div>
          </button>
          <button
            onClick={() => setVisibility("password")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
              visibility === "password"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <Lock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-sm">Password Protected</p>
              <p className="text-xs text-muted-foreground">Visitors need a password to view</p>
            </div>
          </button>
        </div>

        {visibility === "password" && (
          <div className="mt-3">
            <Label className="text-sm font-medium">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-11 rounded-xl mt-2"
            />
          </div>
        )}
      </div>

      <Button
        onClick={handleSaveBasicInfo}
        className="w-full h-11 bg-blue-500 hover:bg-blue-600 rounded-xl"
      >
        Save Changes
      </Button>
    </div>
  )

  const renderSeo = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">SEO & Sharing</h3>
        <p className="text-sm text-muted-foreground">Optimize how your page appears in search and social media</p>
      </div>

      {/* Meta Title */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Page Title</Label>
        <Input
          value={metaTitle}
          onChange={(e) => setMetaTitle(e.target.value)}
          placeholder="My Awesome Page"
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">Appears in browser tabs and search results</p>
      </div>

      {/* Meta Description */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Meta Description</Label>
        <Textarea
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          placeholder="A brief description of your page..."
          className="rounded-xl resize-none"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters recommended</p>
      </div>

      {/* Social Share Image */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Social Share Image (OG Image)</Label>
        <button
          onClick={() => setShowOgImageModal(true)}
          className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 transition-colors flex flex-col items-center justify-center gap-2 bg-gray-50"
        >
          {ogImage ? (
            <img src={ogImage} alt="OG Preview" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <>
              <ImageIcon className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-muted-foreground">Click to upload image</span>
              <span className="text-xs text-muted-foreground">Recommended: 1200x630px</span>
            </>
          )}
        </button>
      </div>

      {/* Preview Card */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Preview</Label>
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="aspect-video bg-gray-100 flex items-center justify-center">
            {ogImage ? (
              <img src={ogImage} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="h-12 w-12 text-gray-300" />
            )}
          </div>
          <div className="p-3">
            <p className="font-medium text-sm truncate">{metaTitle || "Your Page Title"}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{metaDescription || "Your page description will appear here..."}</p>
            <p className="text-xs text-blue-600 mt-1">{pageUrl}</p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSaveSeo}
        className="w-full h-11 bg-blue-500 hover:bg-blue-600 rounded-xl"
      >
        Save SEO Settings
      </Button>
    </div>
  )

  const renderSocial = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Social & Contact</h3>
        <p className="text-sm text-muted-foreground">Default contact info used across your page</p>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@example.com"
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Phone Number</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      {/* Social Links Info */}
      <div className="bg-blue-50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Share2 className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-blue-900">Social Links</p>
            <p className="text-xs text-blue-700 mt-1">
              Manage your social links in the Links tab. They will be available across your entire page.
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSaveContact}
        className="w-full h-11 bg-blue-500 hover:bg-blue-600 rounded-xl"
      >
        Save Contact Info
      </Button>
    </div>
  )

  const renderBilling = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Billing</h3>
        <p className="text-sm text-muted-foreground">Manage your subscription and payment methods</p>
      </div>

      {/* Current Plan */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-300">Current Plan</span>
          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">Active</span>
        </div>
        <p className="text-2xl font-bold">Free Plan</p>
        <p className="text-sm text-gray-400 mt-1">Basic features for getting started</p>
      </div>

      {/* Upgrade Card */}
      <div className="border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="font-medium">Upgrade to Pro</p>
            <p className="text-sm text-muted-foreground">Unlock all features</p>
          </div>
        </div>
        <ul className="space-y-2 mb-4">
          <li className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            Remove branding
          </li>
          <li className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            Custom domain
          </li>
          <li className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            Advanced analytics
          </li>
          <li className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            Priority support
          </li>
        </ul>
        <Button className="w-full h-11 bg-violet-600 hover:bg-violet-700 rounded-xl">
          Upgrade to Pro - $9/mo
        </Button>
      </div>

      {/* Payment Method */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Payment Method</Label>
        <button className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-6 bg-gray-100 rounded flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-gray-500" />
            </div>
            <span className="text-sm text-muted-foreground">No payment method added</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Billing History */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Billing History</Label>
        <div className="text-center py-8 border rounded-xl">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No billing history yet</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Section Navigation - Horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
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

      {/* Section Content */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        {activeSection === "basic" && renderBasicInfo()}
        {activeSection === "seo" && renderSeo()}
        {activeSection === "social" && renderSocial()}
        {activeSection === "billing" && renderBilling()}
      </div>

      {/* OG Image Upload Modal */}
      <Dialog open={showOgImageModal} onOpenChange={setShowOgImageModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 sm:p-5 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">Upload Social Image</DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="aspect-video rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-muted-foreground">Click to upload</span>
              <span className="text-xs text-muted-foreground">PNG, JPG up to 5MB</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowOgImageModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-blue-500 hover:bg-blue-600 rounded-xl">
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
