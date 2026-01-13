"use client"

import { useOnePage } from "@/lib/onepage/context"
import { useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check } from "lucide-react"

export function ThemeSection() {
  const { onepage, updateTheme, templates, loadTemplates, applyTemplate } = useOnePage()

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  if (!onepage) return null

  const { theme } = onepage

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Theme</h2>
        <p className="text-sm text-muted-foreground">
          Choose a template or customize your colors
        </p>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => applyTemplate(template)}
                className={cn(
                  "relative p-3 rounded-lg border-2 text-left transition-all hover:border-primary/50",
                  theme.template_id === template.id
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                <div
                  className="h-24 rounded-md mb-2 flex items-center justify-center"
                  style={{
                    background: template.theme.background_type === "gradient"
                      ? template.theme.background_gradient || template.theme.background_color
                      : template.theme.background_color,
                  }}
                >
                  <div
                    className="w-16 h-6 rounded"
                    style={{
                      backgroundColor: template.theme.button_color,
                      borderRadius: template.theme.button_border_radius,
                      borderWidth: template.theme.button_border_width,
                      borderStyle: "solid",
                      borderColor: template.theme.button_border_color,
                    }}
                  />
                </div>
                <p className="text-sm font-medium">{template.name}</p>
                {theme.template_id === template.id && (
                  <div className="absolute top-2 right-2 p-1 bg-primary text-primary-foreground rounded-full">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custom" className="space-y-6 mt-4">
          <div className="space-y-3">
            <Label>Background Type</Label>
            <Select
              value={theme.background_type}
              onValueChange={(value: "solid" | "gradient") => updateTheme({ background_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid Color</SelectItem>
                <SelectItem value="gradient">Gradient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Background Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={theme.background_color}
                onChange={(e) => updateTheme({ background_color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={theme.background_color}
                onChange={(e) => updateTheme({ background_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Text Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={theme.text_color}
                onChange={(e) => updateTheme({ text_color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={theme.text_color}
                onChange={(e) => updateTheme({ text_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Button Style</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["filled", "outline", "glass"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateTheme({ button_style: style })}
                  className={cn(
                    "py-2 px-3 rounded-lg border text-sm capitalize transition-all",
                    theme.button_style === style
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Button Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={theme.button_color}
                onChange={(e) => updateTheme({ button_color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={theme.button_color}
                onChange={(e) => updateTheme({ button_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Button Text Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={theme.button_text_color}
                onChange={(e) => updateTheme({ button_text_color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={theme.button_text_color}
                onChange={(e) => updateTheme({ button_text_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Button Border Radius: {theme.button_border_radius}px</Label>
            <Slider
              value={[theme.button_border_radius]}
              onValueChange={([value]) => updateTheme({ button_border_radius: value })}
              min={0}
              max={24}
              step={2}
            />
          </div>

          <div className="space-y-3">
            <Label>Button Border Width: {theme.button_border_width}px</Label>
            <Slider
              value={[theme.button_border_width]}
              onValueChange={([value]) => updateTheme({ button_border_width: value })}
              min={0}
              max={4}
              step={1}
            />
          </div>

          <div className="space-y-3">
            <Label>Button Border Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={theme.button_border_color}
                onChange={(e) => updateTheme({ button_border_color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={theme.button_border_color}
                onChange={(e) => updateTheme({ button_border_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Font Family</Label>
            <Select
              value={theme.font_family}
              onValueChange={(value) => updateTheme({ font_family: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter">Inter</SelectItem>
                <SelectItem value="Plus Jakarta Sans">Plus Jakarta Sans</SelectItem>
                <SelectItem value="Space Grotesk">Space Grotesk</SelectItem>
                <SelectItem value="DM Sans">DM Sans</SelectItem>
                <SelectItem value="Poppins">Poppins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Content Width</Label>
            <Select
              value={theme.card_width}
              onValueChange={(value: "narrow" | "standard" | "wide") => updateTheme({ card_width: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Spacing</Label>
            <Select
              value={theme.spacing}
              onValueChange={(value: "compact" | "normal" | "comfortable") => updateTheme({ spacing: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
