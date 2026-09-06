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
  socialLinks: Partial<Record<PlatformKey, string>>
}

export function EditProfileButton({ displayName, bio, username, socialLinks }: EditProfileButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [name, setName] = React.useState(displayName)
  const [about, setAbout] = React.useState(bio)
  const [links, setLinks] = React.useState<Record<string, string>>(() => ({ ...socialLinks }))

  // Reopening after a cancel should show what is saved, not what was abandoned.
  React.useEffect(() => {
    if (open) return
    setName(displayName)
    setAbout(bio)
    setLinks({ ...socialLinks })
    setError(null)
  }, [open, displayName, bio, socialLinks])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, bio: about, socialLinks: links }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save. Try again.")
        return
      }
      setOpen(false)
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
        className="h-9 gap-2 rounded-full bg-white/95 px-4 text-gray-900 shadow-md backdrop-blur hover:bg-white"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit profile
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
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

          <DialogFooter>
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
