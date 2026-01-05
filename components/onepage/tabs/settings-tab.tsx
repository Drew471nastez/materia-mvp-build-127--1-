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
  Copy,
  Check,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  Mail,
  Phone,
  CreditCard,
  FileText,
  Share2,
  Search as SearchIcon,
  BarChart3,
  Sparkles,
} from "lucide-react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Settings sections with Linktree-style icons
const SETTINGS_SECTIONS = [
  { id: "basic", label: "Basic Info", icon: FileText },
  { id: "seo", label: "SEO", icon: SearchIcon },
  { id: "social", label: "Social & Contact", icon: Share2 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "billing", label: "Billing", icon: CreditCard },
]

export function SettingsTab() {
  const { onepage, updateProfile, updateSettings } = useOnePage()
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

  if (!onepage) return null

  const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/l/${onepage.slug}`

  const copyUrl = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveBasicInfo = () => {
    updateProfile({ title: pageName })
  }

  const handleSaveSeo = () => {
    if (updateSettings) {
      updateSettings({
        seo_title: metaTitle,
        seo_description: metaDescription,
        social_image_url: ogImage || undefined,
      })
    }
  }

  const handleSaveContact = () => {
    console.log("Saving Contact:", { contactEmail, contactPhone })
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

      {/* Public URL / Slug */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Public URL</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 h-10">
            <span className="text-sm text-gray-500">{typeof window !== "undefined" ? window.location.host : ""}/l/</span>
            <Input
              value={pageSlug}
              onChange={(e) => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="your-page"
              className="border-0 bg-transparent h-full px-1 focus-visible:ring-0 text-sm font-medium"
            />
          </div>
          <button
            onClick={copyUrl}
            className="h-10 w-10 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-gray-700" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Page Status */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Page Status</Label>
        <div className="flex gap-2">
          <button
            onClick={() => setPageStatus("draft")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border",
              pageStatus === "draft"
                ? "bg-gray-900 border-gray-900 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Draft
          </button>
          <button
            onClick={() => setPageStatus("published")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border",
              pageStatus === "published"
                ? "bg-gray-900 border-gray-900 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Published
          </button>
        </div>
      </div>

      {/* Visibility */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Visibility</Label>
        <div className="space-y-2">
          {[
            { id: "public", label: "Public", desc: "Anyone can view", icon: Globe },
            { id: "private", label: "Private", desc: "Only you", icon: Lock },
            { id: "password", label: "Password", desc: "Requires password", icon: Lock },
          ].map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                onClick={() => setVisibility(option.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  visibility === option.id
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <Icon className="h-4 w-4 text-gray-500" />
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.desc}</p>
                </div>
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                  visibility === option.id ? "border-gray-900" : "border-gray-300"
                )}>
                  {visibility === option.id && <div className="w-2 h-2 rounded-full bg-gray-900" />}
                </div>
              </button>
            )
          })}
        </div>

        {visibility === "password" && (
          <div className="mt-3">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-10 rounded-lg border-gray-200"
            />
          </div>
        )}
      </div>

      <Button
        onClick={handleSaveBasicInfo}
        className="w-full h-10 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm"
      >
        Save Changes
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
        <button
          onClick={() => setShowOgImageModal(true)}
          className="w-full aspect-video rounded-lg border border-dashed border-gray-300 hover:border-gray-400 transition-colors flex flex-col items-center justify-center gap-2 bg-gray-50"
        >
          {ogImage ? (
            <img src={ogImage} alt="OG Preview" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <>
              <ImageIcon className="h-6 w-6 text-gray-400" />
              <span className="text-sm text-gray-500">Upload image</span>
              <span className="text-xs text-gray-400">1200x630px recommended</span>
            </>
          )}
        </button>
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
        className="w-full h-10 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm"
      >
        Save SEO Settings
      </Button>
    </div>
  )

  const renderSocial = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Social & Contact</h3>
        <p className="text-sm text-gray-500">Contact information</p>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@example.com"
            className="h-10 rounded-lg pl-10 border-gray-200"
          />
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Phone</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="h-10 rounded-lg pl-10 border-gray-200"
          />
        </div>
      </div>

      {/* Info box */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-start gap-3">
          <Share2 className="h-4 w-4 text-gray-500 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-gray-900">Social Links</p>
            <p className="text-xs text-gray-500 mt-1">
              Manage your social links in the Links tab.
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSaveContact}
        className="w-full h-10 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm"
      >
        Save Contact Info
      </Button>
    </div>
  )

  const renderAnalytics = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Analytics</h3>
        <p className="text-sm text-gray-500">Track your page performance</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">0</p>
          <p className="text-xs text-gray-500 mt-1">Total Views</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">0</p>
          <p className="text-xs text-gray-500 mt-1">Link Clicks</p>
        </div>
      </div>

      {/* Enable Analytics Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <p className="font-medium text-sm text-gray-900">Enable Analytics</p>
          <p className="text-xs text-gray-500 mt-0.5">Track views and clicks</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" defaultChecked className="sr-only peer" />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gray-900"></div>
        </label>
      </div>

      {/* Coming Soon */}
      <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
        <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500">Detailed analytics coming soon</p>
      </div>
    </div>
  )

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
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900">Pro Plan</p>
            <p className="text-xs text-gray-500">$9/month</p>
          </div>
        </div>
        <ul className="space-y-2 mb-4">
          {["Remove branding", "Custom domain", "Advanced analytics", "Priority support"].map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Check className="h-3.5 w-3.5 text-gray-400" />
              {feature}
            </li>
          ))}
        </ul>
        <Button className="w-full h-10 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm">
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
                    ? "bg-gray-900 text-white"
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
          {activeSection === "social" && renderSocial()}
          {activeSection === "analytics" && renderAnalytics()}
          {activeSection === "billing" && renderBilling()}
        </div>
      </div>

      {/* OG Image Upload Modal */}
      <Dialog open={showOgImageModal} onOpenChange={setShowOgImageModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base font-semibold">Upload Image</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="aspect-video rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
              <Upload className="h-6 w-6 text-gray-400" />
              <span className="text-sm text-gray-500">Click to upload</span>
              <span className="text-xs text-gray-400">PNG, JPG up to 5MB</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-lg h-10" onClick={() => setShowOgImageModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-gray-900 hover:bg-gray-800 rounded-lg h-10">
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add custom scrollbar hiding CSS */}
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}
