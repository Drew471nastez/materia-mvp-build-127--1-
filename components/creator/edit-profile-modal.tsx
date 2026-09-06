"use client"

import { useState } from "react"
import Image from "next/image"
import { ImageIcon, Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import type { SocialLinksConfig } from "@/lib/store-builder/types"

/**
 * Edit profile — the owner's way into their own header.
 *
 * TWO DESTINATIONS, ON PURPOSE.
 * Name, bio, avatar and cover are columns on `profiles`, written straight from
 * the client under the row-level policy that already lets somebody edit their
 * own profile — the same path /app/settings has always used.
 *
 * The social links are NOT there. They live in the store builder's shop header
 * config, which also holds the creator's theme, sections and everything else
 * they have arranged. So they go through a narrow endpoint that MERGES only
 * `headerSettings.socialLinks` — writing the whole config back from here would
 * mean this modal could quietly overwrite work done in the builder.
 */

const PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/you" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@you" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@you" },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/you" },
  { key: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/…" },
] as const

type Initial = {
  displayName: string
  bio: string | null
  avatarUrl: string | null
  coverUrl: string | null
  socialLinks?: SocialLinksConfig
}

export function EditProfileModal({
  open,
  onOpenChange,
  profileId,
  creatorId,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  profileId?: string
  creatorId?: string
  initial: Initial
  onSaved: (next: Partial<Initial>) => void
}) {
  const [displayName, setDisplayName] = useState(initial.displayName ?? "")
  const [bio, setBio] = useState(initial.bio ?? "")
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "")
  const [links, setLinks] = useState<Record<string, { enabled: boolean; url: string }>>(() => {
    const src = (initial.socialLinks ?? {}) as Record<string, { enabled?: boolean; url?: string }>
    const out: Record<string, { enabled: boolean; url: string }> = {}
    for (const p of PLATFORMS) out[p.key] = { enabled: !!src[p.key]?.enabled, url: src[p.key]?.url ?? "" }
    return out
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File, kind: "avatar" | "cover") => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error("Not signed in")
    const ext = file.name.split(".").pop() || "jpg"
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    // Never a transform URL: that endpoint is metered and over its allowance,
    // so it serves nothing. See lib/storage/image-url.ts.
    return toOriginalImageUrl(data.publicUrl)
  }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "cover") => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const url = await upload(file, kind)
      if (kind === "avatar") setAvatarUrl(url)
      else setCoverUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      e.target.value = ""
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      if (profileId) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            display_name: displayName.trim() || null,
            bio: bio.trim() || null,
            avatar_url: avatarUrl || null,
            cover_url: coverUrl || null,
          })
          .eq("id", profileId)
        if (pErr) throw pErr
      }

      // Only the links the creator actually filled in are enabled — an enabled
      // platform with no url renders an icon that goes nowhere.
      const socialLinks = Object.fromEntries(
        PLATFORMS.map((p) => [
          p.key,
          { enabled: !!links[p.key].url.trim() && links[p.key].enabled, url: links[p.key].url.trim() },
        ]),
      ) as unknown as SocialLinksConfig

      if (creatorId) {
        const res = await fetch("/api/creator-profile/social-links", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorId, socialLinks }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save links")
      }

      onSaved({ displayName: displayName.trim(), bio: bio.trim() || null, avatarUrl, coverUrl, socialLinks })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <Label>Cover</Label>
              <span className="text-xs text-muted-foreground">Recommended ratio: 3:1</span>
            </div>
            <label className="relative flex aspect-[3/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-muted transition-colors hover:bg-muted/80">
              {coverUrl ? (
                <Image src={coverUrl} alt="" fill sizes="560px" className="object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  Drag an image here or upload a file
                </span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e, "cover")} />
            </label>
          </div>

          <div className="flex items-center gap-4">
            <label className="relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full border bg-muted">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Add
                </span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e, "avatar")} />
            </label>
            <span className="text-sm text-muted-foreground">Profile photo</span>
          </div>

          <div>
            <Label htmlFor="epm-name">Name</Label>
            <Input id="epm-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="epm-bio">Bio</Label>
            <Textarea
              id="epm-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={280}
              className="mt-1.5 resize-none"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/280</p>
          </div>

          <div>
            <Label>Social links</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Only the ones you fill in are shown on your page.
            </p>
            <div className="mt-2 space-y-2">
              {PLATFORMS.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-[86px] shrink-0 text-sm text-muted-foreground">{p.label}</span>
                  <Input
                    value={links[p.key].url}
                    placeholder={p.placeholder}
                    onChange={(e) =>
                      setLinks((l) => ({ ...l, [p.key]: { enabled: true, url: e.target.value } }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
