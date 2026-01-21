"use client"

import { useOnePage } from "@/lib/onepage/context"
import type { OnePageBlock, OnePageBlockType, LinkButtonBlockData, TextBlockData, EmailCaptureBlockData, ImageBlockData, DividerBlockData, HeaderBlockData } from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
// Custom Toggle Component with theme-style design
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
} from "lucide-react"

const blockTypes: { type: OnePageBlockType; label: string; icon: typeof Link }[] = [
  { type: "link_button", label: "Link Button", icon: Link },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: Image },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "email_capture", label: "Email Capture", icon: Mail },
  { type: "header", label: "Header", icon: User },
]

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
              <DropdownMenuItem key={type} onSelect={() => addBlock(type)}>
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
      const data = block.data as EmailCaptureBlockData
      return (
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
            <Input
              value={data.button_text}
              onChange={(e) => updateData({ button_text: e.target.value })}
              placeholder="Subscribe"
            />
          </div>
          <div className="space-y-2">
            <Label>Success Message</Label>
            <Input
              value={data.success_message}
              onChange={(e) => updateData({ success_message: e.target.value })}
              placeholder="Thanks for subscribing!"
            />
          </div>
        </div>
      )
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
