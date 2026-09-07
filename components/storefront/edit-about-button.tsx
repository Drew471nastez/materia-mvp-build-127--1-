"use client"

/**
 * The creator's own editor for the About section, on their public page.
 *
 * Everything the store builder can put in that block — the story headline, the
 * story itself, and the images and YouTube videos above it — with the same
 * dialog shape as Edit profile: header, scrolling body, footer that stays put.
 * It exists because the About is the one part of the page a creator is likely
 * to rewrite often, and sending them into the builder to change a sentence is
 * a page load, a canvas, a sidebar and a publish for something that is two
 * fields.
 *
 * It writes through /api/creator-profile, which already does the auth and the
 * ownership check and knows how to merge into both the draft and the published
 * config. A second route would have been a second copy of all of that.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageUpload } from "@/components/app/image-upload"
import { Loader2, Pencil, Plus, Trash2, Youtube } from "lucide-react"
import type { AboutMediaItem } from "@/lib/store-builder/types"
import { youTubeWatchUrl } from "@/lib/social/youtube"

const MAX_MEDIA = 8

function newId(): string {
  return `m-${Math.random().toString(36).slice(2, 10)}`
}

export interface EditAboutButtonProps {
  headline: string
  story: string
  media: AboutMediaItem[]
}

export function EditAboutButton({ headline, story, media }: EditAboutButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [title, setTitle] = React.useState(headline)
  const [text, setText] = React.useState(story)
  const [items, setItems] = React.useState<AboutMediaItem[]>(media)
  const [youtube, setYoutube] = React.useState("")

  // Reopening after a cancel shows what is saved, not what was abandoned.
  React.useEffect(() => {
    if (open) return
    setTitle(headline)
    setText(story)
    setItems(media)
    setYoutube("")
    setError(null)
  }, [open, headline, story, media])

  const addYouTube = () => {
    // The same function the API uses, so the field cannot accept something the
    // server will then silently drop.
    const url = youTubeWatchUrl(youtube)
    if (!url) {
      setError("That does not look like a YouTube link.")
      return
    }
    if (items.length >= MAX_MEDIA) return
    setError(null)
    setItems((list) => [...list, { id: newId(), type: "youtube", url }])
    setYoutube("")
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ about: { headline: title, aboutContent: text, mediaItems: items } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save. Try again.")
        return
      }
      if (data.storefront === false) {
        setError("Your storefront has not been set up yet — open the store builder once and publish, then this will show on your page.")
        return
      }
      setOpen(false)
      // The server re-renders and the new story appears without a reload.
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit your story"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Your story</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="ea-headline">Story headline</Label>
              <Input
                id="ea-headline"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What you want people to know first."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ea-story">Your story</Label>
              <Textarea
                id="ea-story"
                value={text}
                maxLength={2000}
                rows={6}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tell shoppers a little about your business."
              />
              <p className="text-xs text-muted-foreground">{text.length}/2000</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label>Photos and video</Label>
                <span className="text-xs text-muted-foreground">
                  {items.length}/{MAX_MEDIA}
                </span>
              </div>

              {items.length > 0 && (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      {item.type === "youtube" ? (
                        <Youtube className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.url}</span>
                      <button
                        type="button"
                        onClick={() => setItems((list) => list.filter((m) => m.id !== item.id))}
                        aria-label="Remove"
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {items.length < MAX_MEDIA && (
                <>
                  <ImageUpload
                    bucket="store-builder-images"
                    aspectRatio="video"
                    onChange={(url) => {
                      if (url) setItems((list) => [...list, { id: newId(), type: "image", url }])
                    }}
                  />
                  <div className="flex gap-2">
                    <Input
                      value={youtube}
                      maxLength={300}
                      onChange={(e) => setYoutube(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addYouTube()
                        }
                      }}
                      placeholder="Paste a YouTube link"
                    />
                    <Button type="button" variant="outline" onClick={addYouTube} disabled={!youtube.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Cancel left, Save right, equal columns — the same footer as Edit profile. */}
          <DialogFooter className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-6 py-4 sm:flex-none sm:justify-stretch">
            <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" className="w-full" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
