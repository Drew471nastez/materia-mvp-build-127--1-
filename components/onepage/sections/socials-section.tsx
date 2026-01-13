"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Instagram, Youtube, Twitter, Globe, Music2, Mail } from "lucide-react"

const socialPlatforms = [
  { key: "instagram" as const, label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/username" },
  { key: "tiktok" as const, label: "TikTok", icon: Globe, placeholder: "https://tiktok.com/@username" },
  { key: "youtube" as const, label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@channel" },
  { key: "twitter" as const, label: "X (Twitter)", icon: Twitter, placeholder: "https://x.com/username" },
  { key: "spotify" as const, label: "Spotify", icon: Music2, placeholder: "https://open.spotify.com/artist/..." },
  { key: "website" as const, label: "Website", icon: Globe, placeholder: "https://yourwebsite.com" },
  { key: "email" as const, label: "Email", icon: Mail, placeholder: "mailto:you@email.com" },
]

export function SocialsSection() {
  const { onepage, updateSocialLinks } = useOnePage()

  if (!onepage) return null

  const { social_links } = onepage

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Social Links</h2>
        <p className="text-sm text-muted-foreground">
          Add your social media profiles
        </p>
      </div>

      <div className="space-y-4">
        {socialPlatforms.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="space-y-2">
            <Label className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </Label>
            <Input
              value={social_links[key] || ""}
              onChange={(e) => updateSocialLinks({ [key]: e.target.value || null })}
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>

      <div className="p-3 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          Tip: You can also add a Social Row block to display these links on your page.
        </p>
      </div>
    </div>
  )
}
