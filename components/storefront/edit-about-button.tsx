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
import { useSavedValues } from "@/lib/store-builder/use-saved-values"
import { saveCreatorProfile } from "@/lib/storefront/creator-profile-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { EditorSheet, useSaveThenRefresh } from "@/components/storefront/editor-sheet"
import { ImageUpload } from "@/components/app/image-upload"
import { Pencil, Plus } from "lucide-react"
import type { AboutMediaItem } from "@/lib/store-builder/types"
import { parseVideoUrl } from "@/lib/social/video"
import { MediaItemsEditor } from "@/components/social/media-items-editor"
import { setStoryDraft } from "@/lib/storefront/story-draft"
import { storySignature, type StoryValues } from "@/lib/storefront/story"

const MAX_MEDIA = 8

function newId(): string {
  return `m-${Math.random().toString(36).slice(2, 10)}`
}

export interface EditAboutButtonProps {
  headline: string
  story: string
  media: AboutMediaItem[]
  /** The PUBLIC address, typed by the creator. Never their login email. */
  contactEmail?: string
}

export function EditAboutButton({ headline, story, media, contactEmail = "" }: EditAboutButtonProps) {
  const { markSaved, onClosed, toast } = useSaveThenRefresh()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [title, setTitle] = React.useState(headline)
  const [text, setText] = React.useState(story)
  const [items, setItems] = React.useState<AboutMediaItem[]>(media)
  const [video, setVideo] = React.useState("")
  const [email, setEmail] = React.useState(contactEmail)

  /**
   * Reopening shows what is saved. This watched `media`, which is a new array
   * on every render of the page above it, so it re-ran constantly while
   * closed — and it did not watch `contactEmail` at all, so that one field
   * could hold a stale value. One rule for all of them now; see
   * lib/store-builder/use-saved-values.
   */
  useSavedValues(open, { headline, story, media, contactEmail }, (saved) => {
    setTitle(saved.headline)
    setText(saved.story)
    setItems(saved.media)
    setEmail(saved.contactEmail)
    setVideo("")
    setError(null)
  })

  /*
    THE PAGE BEHIND SHOWS THE STORY AS IT IS TYPED, AND AS IT WAS SAVED
    (round 50, lib/storefront/story-draft). While the sheet is open the
    About block draws these fields. After a save it draws what the server
    stored until the page's own props say the same, so the owner never looks
    at the old story under a "Saved" toast while the refresh is on its way.
    Cancel puts back the last save, or the page's own values.
  */
  const savedRef = React.useRef<StoryValues | null>(null)
  React.useEffect(() => {
    if (!open) return
    setStoryDraft({ headline: title, aboutContent: text, mediaItems: items })
  }, [open, title, text, items])

  const propsSignature = storySignature({ headline, aboutContent: story, mediaItems: media })
  React.useEffect(() => {
    if (open || !savedRef.current) return
    if (storySignature(savedRef.current) === propsSignature) {
      savedRef.current = null
      setStoryDraft(null)
    }
  }, [open, propsSignature])
  /* Leaving the page leaves nothing behind for another page's About block. */
  React.useEffect(() => () => setStoryDraft(null), [])

  const cancel = () => {
    setOpen(false)
    setStoryDraft(savedRef.current)
  }

  const addVideo = () => {
    // The same parser the API uses, so the field cannot accept something the
    // server will then silently drop — and it understands Vimeo, which a
    // YouTube-only rule turned into a blank black rectangle on the page.
    const parsed = parseVideoUrl(video)
    if (!parsed) {
      setError("Paste a YouTube or Vimeo link.")
      return
    }
    if (items.length >= MAX_MEDIA) return
    setError(null)
    setItems((list) => [...list, { id: newId(), type: "video", url: parsed.url }])
    setVideo("")
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      /* Through saveCreatorProfile (round 50), so the save is one step of the editor's page-level undo and redo. */
      const { ok, data } = await saveCreatorProfile(
        {
          about: { headline: title, aboutContent: text, mediaItems: items },
          /** "" is a real value: it takes the Contact link off the page. */
          contactEmail: email.trim(),
        },
        "story",
      )
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save. Try again.")
        return
      }
      if (data.storefront === false) {
        setError("Your creator page has not been set up yet. Open Sections and theme once and publish, then this will show on your page.")
        return
      }
      /* What the server kept, cleaned, drawn at once (the route answers with it). */
      const kept = (data.about ?? {}) as Partial<StoryValues>
      const saved: StoryValues = {
        headline: kept.headline ?? title.trim(),
        aboutContent: kept.aboutContent ?? text,
        mediaItems: (kept.mediaItems as StoryValues["mediaItems"] | undefined) ?? items,
      }
      savedRef.current = saved
      setStoryDraft(saved)
      setTitle(saved.headline)
      setText(saved.aboutContent)
      setItems(saved.mediaItems as AboutMediaItem[])
      setOpen(false)
      // The server re-renders and the new story appears without a reload.
      /* The page changes once the sheet has gone, not underneath it on its
         way down. useSaveThenRefresh + onClosed in editor-sheet. */
      markSaved()
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

      <EditorSheet
        open={open}
        onClosed={onClosed}
        onClose={cancel}
        title="Your story"
        wide
        busy={saving}
        error={error}
        onSave={() => void save()}
        /* The spinner is the sheet's, beside the word. `busy` already says
           a save is in flight; a label that changes as well took the word
           away at the moment it was pressed. */
        saveLabel="Save"
      >
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

            {/*
              WRITING, RATHER THAN TYPING INTO A BOX.

              This was a six-row textarea, so the one block on a creator page
              that is actually PROSE — the paragraph about who they are — was
              the one place in the product with no headings, no emphasis and
              no lists. RichTextField is the control the website builder's
              rich text settings use; importing it rather than building a
              second one is the only way the two stay the same editor.

              Every value that leaves it has been through `sanitizeRichText`,
              and the API sanitises again on save because that is where the
              authority is.
            */}
            <div className="space-y-2">
              <Label htmlFor="ea-story">Your story</Label>
              <RichTextField
                value={text}
                onChange={setText}
                placeholder="Tell shoppers a little about your business."
                minHeight={150}
                maxHeight={320}
              />
            </div>

            {/*
              A PUBLIC ADDRESS, TYPED ON PURPOSE.

              The obvious implementation of "let people contact me" is to print
              the address somebody signs in with, and that is the wrong one:
              nobody agreed to publish it, and it is the address that resets
              their password. This is a separate field, empty until they fill
              it, and emptying it takes the link off the page again.
            */}
            <div className="space-y-2">
              <Label htmlFor="ea-contact">Contact email</Label>
              <Input
                id="ea-contact"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                Shown as a Contact link on your page. Leave empty to hide it.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label>Photos and video</Label>
                <span className="text-xs text-muted-foreground">
                  {items.length}/{MAX_MEDIA}
                </span>
              </div>

              {/*
                The shared editor: thumbnails, captions, drag-to-reorder, and
                an editable link on a video. This was a column of raw Supabase
                storage URLs — which tell a creator nothing they can act on,
                take the whole width doing it, and look like an error message.
              */}
              <MediaItemsEditor items={items} onChange={setItems} />

              {items.length < MAX_MEDIA && (
                <>
                  {/*
                    COMPACT. This is the "add another" affordance, not a
                    preview of anything: at 16:9 it was 290px of dashed box in
                    a 520px drawer, and most of a phone sheet, for a control
                    whose whole content is one line of text. The pictures
                    already added are shown above it, at their own size.
                  */}
                  <ImageUpload
                    bucket="store-builder-images"
                    aspectRatio="compact"
                    onChange={(url) => {
                      if (url) setItems((list) => [...list, { id: newId(), type: "image", url }])
                    }}
                  />
                  <div className="flex gap-2">
                    <Input
                      value={video}
                      maxLength={300}
                      onChange={(e) => setVideo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addVideo()
                        }
                      }}
                      placeholder="Paste a YouTube or Vimeo link"
                    />
                    <Button type="button" variant="outline" onClick={addVideo} disabled={!video.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
      </EditorSheet>
      {/* "Saved", once the sheet has gone (useSaveThenRefresh). */}
      {toast}
    </>
  )
}
