"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, X } from "lucide-react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { pickPhoto } from "@/lib/native-camera"
import { announceAvatar } from "@/lib/account/avatar-store"

/** The one photo, saved where it lives (app/api/account/avatar). */
async function savePhoto(url: string | null) {
  await fetch("/api/account/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => null)
  announceAvatar(url)
}

export function ProfileSection() {
  const { onepage, updateProfile, updateSlug } = useOnePage()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  if (!onepage) return null

  const handleAvatarPick = async () => {
    setUploadError(null)
    const photo = await pickPhoto("PROMPT")
    if (!photo) return

    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      /* One profile photo: the account's own avatars folder, saved through
         the same route Settings uses (lib/account/avatar-save). */
      const ext = photo.mimeType === "image/png" ? "png" : "jpg"
      const fileName = `${user.id}/avatar-${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, photo.blob, { upsert: true, contentType: photo.mimeType })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      await savePhoto(publicUrl)
      updateProfile({ avatar_url: publicUrl })
    } catch (err) {
      console.error("Avatar upload error:", err)
      setUploadError("Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = async () => {
    await savePhoto(null)
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
              type="button"
              onClick={handleAvatarPick}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={uploading}
              aria-label="Change profile picture"
            >
              <Camera className="h-6 w-6 text-white" />
            </button>
            {onepage.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                className="absolute -top-1 -right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove profile picture"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : "Tap to change"}
          </div>
        </div>
        {uploadError && (
          <p className="text-sm text-destructive">{uploadError}</p>
        )}
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
