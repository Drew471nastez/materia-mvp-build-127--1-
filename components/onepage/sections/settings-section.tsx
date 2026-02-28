"use client"

import { useOnePage } from "@/lib/onepage/context"
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

export function SettingsSection() {
  const { onepage, updateSettings } = useOnePage()

  if (!onepage) return null

  const { settings } = onepage

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure SEO and other options
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Show Storelib Branding</Label>
            <p className="text-xs text-muted-foreground">
              Display "Powered by Storelib" at the bottom
            </p>
          </div>
          <Toggle
            checked={settings.show_branding}
            onCheckedChange={(checked) => updateSettings({ show_branding: checked })}
          />
        </div>

      </div>

      <div className="border-t pt-6">
        <h3 className="font-medium mb-4">SEO Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Page Title</Label>
            <Input
              value={settings.seo_title || ""}
              onChange={(e) => updateSettings({ seo_title: e.target.value || null })}
              placeholder={onepage.title || "Your name"}
            />
            <p className="text-xs text-muted-foreground">
              Appears in browser tabs and search results
            </p>
          </div>

          <div className="space-y-2">
            <Label>Meta Description</Label>
            <Textarea
              value={settings.seo_description || ""}
              onChange={(e) => updateSettings({ seo_description: e.target.value || null })}
              placeholder="A brief description of your page..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Shown in search engine results. Keep under 160 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Social Image URL</Label>
            <Input
              value={settings.social_image_url || ""}
              onChange={(e) => updateSettings({ social_image_url: e.target.value || null })}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              Image shown when sharing on social media (1200x630px recommended)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
