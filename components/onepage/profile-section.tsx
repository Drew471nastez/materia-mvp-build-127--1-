"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Camera, X } from "lucide-react"
import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function ProfileSection() {
  const { onepage, updateProfile, updateSlug } = useOnePage()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!onepage) return null

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const fileExt = file.name.split(".").pop()
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from("onepage-assets")
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("onepage-assets")
        .getPublicUrl(fileName)

      updateProfile({ avatar_url: publicUrl })
    } catch (error) {
      console.error("Avatar upload error:", error)
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = () => {
    updateProfile({ avatar_url: null })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Customize how you appear on your page
        </p>
      </div>

      {/* Avatar */}
      <div className="space-y-3">
        <Label>Profile Picture</Label>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20">
              <AvatarImage src={onepage.avatar_url || undefined} />
              <AvatarFallback>{onepage.title?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={uploading}
            >
              <Camera className="h-6 w-6 text-white" />
            </button>
            {onepage.avatar_url && (
              <button
                onClick={removeAvatar}
                className="absolute -top-1 -right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : "Click to change"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="title">Display Name</Label>
        <Input
          id="title"
          value={onepage.title}
          onChange={(e) => updateProfile({ title: e.target.value })}
          placeholder="Your name"
        />
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={onepage.bio}
          onChange={(e) => updateProfile({ bio: e.target.value })}
          placeholder="Tell people about yourself"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          {onepage.bio?.length || 0} / 160 characters recommended
        </p>
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="slug">Page URL</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">materia.io/</span>
          <Input
            id="slug"
            value={onepage.slug}
            onChange={(e) => updateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="your-page"
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Only lowercase letters, numbers, and hyphens
        </p>
      </div>
    </div>
  )
}
