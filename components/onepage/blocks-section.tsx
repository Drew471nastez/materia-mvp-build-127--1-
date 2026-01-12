"use client"

import { useOnePage } from "@/lib/onepage/context"
import type { OnePageBlock, OnePageBlockType, LinkButtonBlockData, TextBlockData, EmailCaptureBlockData, ImageBlockData, DividerBlockData, HeaderBlockData, EmailCaptureButtonPreset, EmailCaptureLayoutType } from "@/lib/onepage/types"
import { buttonPresetLabels } from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Plus,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link,
  Type,
  Image,
  Minus,
  Mail,
  User,
  Eye,
  EyeOff,
  ChevronRight,
  Settings,
  Layout,
  Gift,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react"

// Custom Toggle Component
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}

const blockTypes: { type: OnePageBlockType; label: string; icon: typeof Link }[] = [
  { type: "link_button", label: "Link Button", icon: Link },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: Image },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "email_capture", label: "Email Capture", icon: Mail },
  { type: "header", label: "Header", icon: User },
]

// Product type for free products dropdown
interface FreeProduct {
  id: string
  title: string
  slug: string
  thumbnail_url: string | null
  price_cents: number | null
}

export function BlocksSection() {
  const { onepage, selectedBlockId, setSelectedBlockId, addBlock, removeBlock, moveBlockUp, moveBlockDown, toggleBlockEnabled } = useOnePage()

  if (!onepage) return null

  const { draft_blocks } = onepage
  const sortedBlocks = [...draft_blocks].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Blocks</h2>
          <p className="text-sm text-muted-foreground">
            Add and arrange your content
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {blockTypes.map(({ type, label, icon: Icon }) => (
              <DropdownMenuItem key={type} onClick={() => addBlock(type)}>
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        {sortedBlocks.map((block, index) => (
          <div
            key={block.id}
            className={cn(
              "border rounded-lg transition-all",
              selectedBlockId === block.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              !block.enabled && "opacity-50"
            )}
          >
            <div
              className="flex items-center gap-2 p-3 cursor-pointer"
              onClick={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {getBlockLabel(block)}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {block.type.replace("_", " ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); toggleBlockEnabled(block.id) }}
                >
                  {block.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); moveBlockUp(block.id) }}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); moveBlockDown(block.id) }}
                  disabled={index === sortedBlocks.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeBlock(block.id) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedBlockId === block.id && (
              <div className="border-t p-4">
                <BlockEditor block={block} />
              </div>
            )}
          </div>
        ))}

        {sortedBlocks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No blocks yet</p>
            <p className="text-sm">Click "Add Block" to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

function getBlockLabel(block: OnePageBlock): string {
  switch (block.type) {
    case "link_button":
      return (block.data as LinkButtonBlockData).label || "Link Button"
    case "text":
      return (block.data as TextBlockData).content?.slice(0, 30) || "Text"
    case "email_capture":
      return (block.data as EmailCaptureBlockData).headline || "Email Capture"
    case "header":
      return "Header"
    case "image":
      return "Image"
    case "divider":
      return "Divider"
    default:
      return block.type
  }
}

function BlockEditor({ block }: { block: OnePageBlock }) {
  const { updateBlock } = useOnePage()

  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    updateBlock(block.id, { data: { ...block.data, ...updates } })
  }

  switch (block.type) {
    case "link_button": {
      const data = block.data as LinkButtonBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Button Text</Label>
            <Input
              value={data.label}
              onChange={(e) => updateData({ label: e.target.value })}
              placeholder="My Link"
            />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={data.url}
              onChange={(e) => updateData({ url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      )
    }

    case "text": {
      const data = block.data as TextBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Text Content</Label>
            <Textarea
              value={data.content}
              onChange={(e) => updateData({ content: e.target.value })}
              placeholder="Enter your text..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Alignment</Label>
            <Select
              value={data.alignment}
              onValueChange={(value: "left" | "center" | "right") => updateData({ alignment: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    }

    case "image": {
      const data = block.data as ImageBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input
              value={data.image_url}
              onChange={(e) => updateData({ image_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Alt Text</Label>
            <Input
              value={data.alt_text || ""}
              onChange={(e) => updateData({ alt_text: e.target.value })}
              placeholder="Describe the image"
            />
          </div>
          <div className="space-y-2">
            <Label>Link URL (optional)</Label>
            <Input
              value={data.link_url || ""}
              onChange={(e) => updateData({ link_url: e.target.value || null })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select
              value={data.aspect_ratio || "auto"}
              onValueChange={(value: "auto" | "square" | "video" | "wide") => updateData({ aspect_ratio: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="square">Square (1:1)</SelectItem>
                <SelectItem value="video">Video (16:9)</SelectItem>
                <SelectItem value="wide">Wide (2:1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    }

    case "divider": {
      const data = block.data as DividerBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Style</Label>
            <Select
              value={data.style}
              onValueChange={(value: "line" | "space" | "dots") => updateData({ style: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="space">Space</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="dots">Dots</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Height: {data.height}px</Label>
            <Slider
              value={[data.height]}
              onValueChange={([value]) => updateData({ height: value })}
              min={8}
              max={64}
              step={4}
            />
          </div>
        </div>
      )
    }

    case "email_capture": {
      return <EmailCaptureEditor block={block} updateData={updateData} />
    }

    case "header": {
      const data = block.data as HeaderBlockData
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Show Avatar</Label>
            <Toggle
              checked={data.show_avatar}
              onCheckedChange={(checked) => updateData({ show_avatar: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Show Name</Label>
            <Toggle
              checked={data.show_name}
              onCheckedChange={(checked) => updateData({ show_name: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Show Bio</Label>
            <Toggle
              checked={data.show_bio}
              onCheckedChange={(checked) => updateData({ show_bio: checked })}
            />
          </div>
        </div>
      )
    }

    default:
      return <p className="text-sm text-muted-foreground">No settings available</p>
  }
}

// Email Capture Editor Component with Tabs (Settings & Layout)
function EmailCaptureEditor({ 
  block, 
  updateData 
}: { 
  block: OnePageBlock
  updateData: (updates: Partial<EmailCaptureBlockData>) => void 
}) {
  const data = block.data as EmailCaptureBlockData
  const [activeTab, setActiveTab] = useState<"settings" | "layout">("settings")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [products, setProducts] = useState<FreeProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data.enable_digital_product) {
      fetchProducts()
    }
  }, [data.enable_digital_product])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchProducts = async () => {
    setLoadingProducts(true)
    try {
      const response = await fetch("/api/onepage/free-products")
      const result = await response.json()
      if (result.products) {
        setProducts(result.products)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setLoadingProducts(false)
    }
  }

  const selectProduct = (product: FreeProduct) => {
    updateData({
      digital_product_id: product.id,
      digital_product_title: product.title,
      digital_product_thumbnail: product.thumbnail_url,
    })
    setShowProductDropdown(false)
  }

  const clearProduct = () => {
    updateData({
      digital_product_id: null,
      digital_product_title: null,
      digital_product_thumbnail: null,
    })
  }

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === "settings"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          onClick={() => setActiveTab("layout")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === "layout"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Layout className="h-4 w-4" />
          Layout
        </button>
      </div>

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Headline</Label>
            <Input
              value={data.headline}
              onChange={(e) => updateData({ headline: e.target.value })}
              placeholder="Join my newsletter"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={data.description || ""}
              onChange={(e) => updateData({ description: e.target.value })}
              placeholder="Get updates and exclusive content"
            />
          </div>

          <div className="space-y-2">
            <Label>Input Placeholder</Label>
            <Input
              value={data.placeholder}
              onChange={(e) => updateData({ placeholder: e.target.value })}
              placeholder="Enter your email"
            />
          </div>

          <div className="space-y-2">
            <Label>Button Text</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(buttonPresetLabels) as EmailCaptureButtonPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    updateData({ 
                      button_preset: preset,
                      button_text: buttonPresetLabels[preset],
                      custom_button_text: "",
                    })
                  }}
                  className={cn(
                    "px-2 py-2 text-xs font-medium rounded-lg border transition-all text-center",
                    (data.button_preset === preset && !data.custom_button_text)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {buttonPresetLabels[preset]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Custom Button Text</Label>
            <Input
              value={data.custom_button_text || ""}
              onChange={(e) => {
                updateData({ 
                  custom_button_text: e.target.value,
                  button_text: e.target.value || buttonPresetLabels[data.button_preset || "subscribe"],
                })
              }}
              placeholder="Enter custom text..."
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the preset above</p>
          </div>

          <div className="space-y-2">
            <Label>Success Message</Label>
            <Input
              value={data.success_message}
              onChange={(e) => updateData({ success_message: e.target.value })}
              placeholder="Thanks for subscribing!"
            />
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Enable Digital Product</Label>
              </div>
              <Toggle
                checked={data.enable_digital_product || false}
                onCheckedChange={(checked) => {
                  updateData({ enable_digital_product: checked })
                  if (!checked) clearProduct()
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Offer a free digital product in exchange for email signup
            </p>

            {data.enable_digital_product && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                {data.digital_product_id ? (
                  <div className="flex items-center gap-3 p-2 bg-background rounded-lg border">
                    {data.digital_product_thumbnail ? (
                      <img src={data.digital_product_thumbnail} alt="" className="w-10 h-10 rounded-md object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                        <Gift className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{data.digital_product_title || "Selected Product"}</p>
                      <p className="text-xs text-muted-foreground">Free download</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearProduct} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowProductDropdown(!showProductDropdown)}
                      className="w-full flex items-center justify-between p-3 bg-background border border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">Select a free product...</span>
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showProductDropdown && "rotate-90")} />
                    </button>

                    {showProductDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                        {loadingProducts ? (
                          <div className="p-4 text-center">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                            <p className="text-xs text-muted-foreground mt-2">Loading products...</p>
                          </div>
                        ) : products.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-sm text-muted-foreground mb-2">No free products found</p>
                            <a href="/app/products/new" target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              Create a free product <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ) : (
                          products.map((product) => (
                            <button
                              key={product.id}
                              onClick={() => selectProduct(product)}
                              className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                            >
                              {product.thumbnail_url ? (
                                <img src={product.thumbnail_url} alt="" className="w-10 h-10 rounded-md object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                  <Gift className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{product.title}</p>
                                <p className="text-xs text-muted-foreground">Free</p>
                              </div>
                              {data.digital_product_id === product.id && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {data.digital_product_id && (
                  <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <Mail className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      When someone subscribes, they'll automatically receive an email with the download link. The button will change to "Download" after submission.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Layout Tab */}
      {activeTab === "layout" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose how your email capture form looks</p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateData({ layout_type: "default" })}
              className={cn(
                "relative p-3 rounded-xl border-2 transition-all text-left",
                (!data.layout_type || data.layout_type === "default") ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
            >
              <div className="aspect-[4/3] bg-muted rounded-lg mb-2 p-3 flex flex-col gap-1.5">
                <div className="h-2.5 bg-foreground/20 rounded w-3/4 mx-auto" />
                <div className="h-2 bg-foreground/10 rounded w-1/2 mx-auto" />
                <div className="flex-1" />
                <div className="h-6 bg-foreground/10 rounded w-full" />
                <div className="h-6 bg-foreground/30 rounded w-full" />
              </div>
              <p className="text-sm font-medium">Default</p>
              <p className="text-xs text-muted-foreground">Simple email input with button</p>
              {(!data.layout_type || data.layout_type === "default") && (
                <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
              )}
            </button>

            <button
              onClick={() => updateData({ layout_type: "pro" })}
              className={cn(
                "relative p-3 rounded-xl border-2 transition-all text-left",
                data.layout_type === "pro" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
            >
              <div className="aspect-[4/3] bg-muted rounded-lg mb-2 p-2 flex flex-col gap-1.5">
                <div className="flex gap-2 flex-1">
                  <div className="w-10 h-10 bg-foreground/20 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-foreground/20 rounded w-3/4" />
                    <div className="h-1.5 bg-foreground/10 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-5 bg-foreground/10 rounded w-full" />
                <div className="h-5 bg-foreground/30 rounded w-full" />
              </div>
              <p className="text-sm font-medium">Pro</p>
              <p className="text-xs text-muted-foreground">With product thumbnail</p>
              {data.layout_type === "pro" && (
                <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
              )}
            </button>
          </div>

          {data.layout_type === "pro" && !data.enable_digital_product && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <Gift className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Pro layout works best with a digital product. Enable "Digital Product" in Settings to show a product thumbnail.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
