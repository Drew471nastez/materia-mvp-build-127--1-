"use client"

/**
 * The creator's own "Edit profile" control, shown on their public page.
 *
 * It is rendered into UnifiedShopHeader's `ownerActions` slot by the storefront
 * page, which is the only thing that knows who is looking. The header itself
 * stays free of session logic, and there is exactly one place this button can
 * come from — it is not a second profile block bolted beside the real one.
 *
 * What it edits is deliberately small: the name, the bio, and the social links.
 * Everything else about the page is the store builder's job, and the dialog
 * says so rather than growing into a worse copy of it.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageUpload } from "@/components/app/image-upload"
import { Pencil, Loader2 } from "lucide-react"

const PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/yourhandle" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@yourhandle" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@yourchannel" },
  { key: "twitter", label: "X / Twitter", placeholder: "x.com/yourhandle" },
  { key: "spotify", label: "Spotify", placeholder: "open.spotify.com/artist/…" },
] as const

type PlatformKey = (typeof PLATFORMS)[number]["key"]

export interface EditProfileButtonProps {
  displayName: string
  bio: string
  username?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
  socialLinks: Partial<Record<PlatformKey, string>>
}

export function EditProfileButton({
  displayName,
  bio,
  username,
  avatarUrl,
  coverUrl,
  socialLinks,
}: EditProfileButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [name, setName] = React.useState(displayName)
  const [about, setAbout] = React.useState(bio)
  const [avatar, setAvatar] = React.useState<string | null>(avatarUrl ?? null)
  const [cover, setCover] = React.useState<string | null>(coverUrl ?? null)
  const [links, setLinks] = React.useState<Record<string, string>>(() => ({ ...socialLinks }))

  // Reopening after a cancel should show what is saved, not what was abandoned.
  React.useEffect(() => {
    if (open) return
    setName(displayName)
    setAbout(bio)
    setAvatar(avatarUrl ?? null)
    setCover(coverUrl ?? null)
    setLinks({ ...socialLinks })
    setError(null)
  }, [open, displayName, bio, avatarUrl, coverUrl, socialLinks])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          bio: about,
          avatarUrl: avatar,
          coverUrl: cover,
          socialLinks: links,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save. Try again.")
        return
      }
      setOpen(false)
      /**
       * The server re-renders and the new name, bio, picture and links appear
       * without a reload. This only actually works because /u/:username* is no
       * longer served with `public, s-maxage=300` — the refreshed RSC payload
       * used to come straight back from the edge, unchanged, which is why the
       * page had to be hard-reloaded to show a save. See next.config.mjs.
       */
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        // rounded-lg (8px), not a pill. A fully rounded control reads as a
        // chip or a tag; this is a button, and it sits beside a card grid whose
        // corners are the same 8px.
        className="h-9 gap-2 rounded-lg bg-white/95 px-4 text-gray-900 shadow-md backdrop-blur hover:bg-white"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit profile
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/*
          THE FOOTER IS STICKY, and that is why the scroll moved.

          The whole dialog used to scroll, so on a short window Save was below
          the fold and you had to scroll a form you had already filled in just
          to submit it. Now the dialog is a column — header, scrolling body,
          footer — and only the middle moves. `gap-0` and `p-0` because the
          padding has to belong to the three parts separately, or the header
          keeps its padding while the body scrolls under it.
        */}
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/*
              Cover first, then the avatar sitting half over it — the same
              relationship they have on the page, so what you are editing looks
              like what you will get.
            */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label>Cover</Label>
                <span className="text-xs text-muted-foreground">Recommended ratio 3:1</span>
              </div>
              <ImageUpload
                bucket="covers"
                aspectRatio="cover"
                value={cover || undefined}
                onChange={(url) => setCover(url)}
                replaceOnly
                allowRemove
                replaceLabel="Change banner"
              />
            </div>

            <div className="space-y-2">
              <Label>Profile picture</Label>
              <div className="w-28">
                <ImageUpload
                  bucket="avatars"
                  aspectRatio="square"
                  value={avatar || undefined}
                  onChange={(url) => setAvatar(url)}
                  replaceOnly
                  replaceLabel="Change"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              {username && (
                <p className="text-xs text-muted-foreground">
                  Your page lives at <span className="font-medium">@{username}</span>. Change the handle in settings.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ep-bio">Bio</Label>
              <Textarea
                id="ep-bio"
                value={about}
                maxLength={500}
                rows={3}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="What you make, and who it is for."
              />
              <p className="text-xs text-muted-foreground">{about.length}/500</p>
            </div>

            <div className="space-y-3">
              <Label>Social links</Label>
              {/* Leave one empty to remove it — the icon disappears with it. */}
              <p className="text-xs text-muted-foreground">
                Only the ones you fill in appear on your page. Clear a field to remove it.
              </p>
              {PLATFORMS.map((platform) => (
                <div key={platform.key} className="grid grid-cols-[92px_1fr] items-center gap-3">
                  <span className="text-sm text-muted-foreground">{platform.label}</span>
                  <Input
                    value={links[platform.key] || ""}
                    maxLength={300}
                    placeholder={platform.placeholder}
                    onChange={(e) => setLinks((l) => ({ ...l, [platform.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || name.trim().length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
