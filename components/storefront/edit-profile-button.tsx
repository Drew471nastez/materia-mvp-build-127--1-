"use client"

/**
 * The creator's own controls, shown on their own public page: "Customize
 * page", which opens the creator page editor, and a pencil for the details
 * that are quicker to finish in place.
 *
 * It is rendered into UnifiedShopHeader's `ownerActions` slot by the storefront
 * page, which is the only thing that knows who is looking. The header itself
 * stays free of session logic, and there is exactly one place this button can
 * come from — it is not a second profile block bolted beside the real one.
 *
 * What the DIALOG edits is deliberately small: the name, the bio, the picture
 * and the social links. Everything else about the page belongs to the creator
 * page editor, and the dialog says so rather than growing into a worse copy
 * of it.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageUpload } from "@/components/app/image-upload"
import { Pencil, Loader2, Wand2 } from "lucide-react"
import { SocialLinksEditor } from "@/components/social/social-links-editor"
import { SchemePicker } from "@/components/storefront/scheme-picker"
import { notifyEditorSaved } from "@/lib/store-builder/editor-channel"
import type { SocialPlatformKey } from "@/lib/social/platforms"

// The platforms, their order and their icons all come from
// lib/social/platforms and components/social. This file used to carry its own
// list with its own placeholder text — one of five such lists.
type PlatformKey = SocialPlatformKey

export interface EditProfileButtonProps {
  /** True when this page is rendered inside /creator-page. */
  embedded?: boolean
  displayName: string
  bio: string
  username?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
  socialLinks: Partial<Record<PlatformKey, string>>
  /**
   * What the meta row under the name currently shows. Absent means true — every
   * stored config predates these, and a creator who has never opened the
   * control has not asked for anything to disappear.
   */
  display?: {
    showReviews?: boolean
    showFollowers?: boolean
    showTotalSalesBadge?: boolean
    showSocialMedia?: boolean
  }
  /**
   * THE COLOUR SCHEME IS EDITED HERE, not in the workspace's toolbar.
   *
   * It was a palette button up there, which put the one control that changes
   * how the whole page looks in the one place a creator only sees while the
   * page is inside an editor. It belongs with the rest of how the page
   * presents itself, which is this dialog.
   */
  themePreset?: string
}

export function EditProfileButton({
  embedded = false,
  displayName,
  bio,
  username,
  avatarUrl,
  coverUrl,
  socialLinks,
  display,
  themePreset = "default",
}: EditProfileButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  /**
   * BELT AND BRACES FOR THE WORKSPACE. `embedded` arrives as a prop from the
   * query string; this also asks the window itself, so a frame that lost the
   * parameter to a rewrite still never shows a button that opens the editor
   * inside the editor. State rather than a bare read, so the server and the
   * first client render agree.
   */
  const [framed, setFramed] = React.useState(false)
  React.useEffect(() => {
    try {
      setFramed(window.self !== window.top)
    } catch {
      setFramed(true)
    }
  }, [])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [name, setName] = React.useState(displayName)
  const [about, setAbout] = React.useState(bio)
  const [avatar, setAvatar] = React.useState<string | null>(avatarUrl ?? null)
  const [cover, setCover] = React.useState<string | null>(coverUrl ?? null)
  const [links, setLinks] = React.useState<Record<string, string>>(() => ({ ...socialLinks }))
  const [shown, setShown] = React.useState<Record<string, boolean>>(() => ({
    showReviews: display?.showReviews ?? true,
    showFollowers: display?.showFollowers ?? true,
    showTotalSalesBadge: display?.showTotalSalesBadge ?? true,
    showSocialMedia: display?.showSocialMedia ?? true,
  }))
  const [scheme, setScheme] = React.useState(themePreset)

  // Reopening after a cancel should show what is saved, not what was abandoned.
  React.useEffect(() => {
    if (open) return
    setName(displayName)
    setAbout(bio)
    setAvatar(avatarUrl ?? null)
    setCover(coverUrl ?? null)
    setLinks({ ...socialLinks })
    setShown({
      showReviews: display?.showReviews ?? true,
      showFollowers: display?.showFollowers ?? true,
      showTotalSalesBadge: display?.showTotalSalesBadge ?? true,
      showSocialMedia: display?.showSocialMedia ?? true,
    })
    setScheme(themePreset)
    setError(null)
  }, [open, displayName, bio, avatarUrl, coverUrl, socialLinks, display, themePreset])

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
          display: shown,
          themePreset: scheme,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save. Try again.")
        return
      }
      /**
       * A SAVE THAT DID NOT REACH THE STOREFRONT SAYS SO.
       *
       * The route answers `{ ok: true, storefront: false }` in two cases — the
       * account is not a creator yet, or it has no store-builder config row —
       * and both used to close the dialog and refresh a page that had not
       * changed. The name and bio really were saved, so it is not an error;
       * but "I pressed Save and nothing happened" is exactly what that looks
       * like from the outside, and it is indistinguishable from the bug where
       * nothing saved at all.
       */
      if (data.storefront === false) {
        setError("Saved, but your storefront has not been set up yet — open the store builder once and publish, then this will show on your page.")
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
      /* Inside the workspace the frame around this reloads the page; at its
         own address the refresh below is the only thing that can. */
      notifyEditorSaved()
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/*
        TWO CONTROLS, AND THE BIGGER ONE IS THE PAGE.

        This used to be a single "Edit profile" button, which named the
        smallest thing on the screen. What somebody is looking at is not a
        profile: it is their page, with products, communities, a newsletter
        and a layout. So the primary action goes to the editor for all of
        that, and the dialog that edits the name, the picture and the links
        stays exactly where it was, behind the pencil, because finishing that
        in place is the whole reason it exists.
      */}
      <div className="flex items-center gap-2">
        {/* Not inside the workspace: there, this page already is the editor. */}
        {!embedded && !framed && (
        <a
          href="/creator-page"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/95 px-3 text-sm font-medium text-gray-900 no-underline shadow-md backdrop-blur transition-colors hover:bg-white sm:px-4"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Customize page</span>
        </a>
        )}
        {/*
          IT SAYS WHAT IT DOES AGAIN.

          This was reduced to a bare pencil when "Customize page" took the
          primary slot beside it. Inside the workspace that other button is
          hidden, so the pencil was left alone on a cover image with nothing
          to say what it opens — an icon with no label and no neighbour is a
          guess. The word is back; the icon stays as the thing you aim at.
        */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Edit profile"
          // rounded-lg (8px), not a pill. A fully rounded control reads as a
          // chip or a tag; this is a button, and it sits beside a card grid whose
          // corners are the same 8px.
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/95 px-3 text-sm font-medium text-gray-900 shadow-md backdrop-blur transition-colors hover:bg-white sm:px-4"
        >
          <Pencil className="h-3.5 w-3.5" />
          {/* The word on a desktop; on a phone the cover is 128px tall and a
              labelled button over it covers a quarter of the picture. */}
          <span className="hidden sm:inline">Edit profile</span>
        </button>
      </div>

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
            <DialogTitle>Profile details</DialogTitle>
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

            {/*
              THE COLOUR SCHEME, which paints the whole page rather than
              anything in this dialog. It is here because this is the only
              control a creator has for how their page PRESENTS itself, and
              because its previous home was a button in the workspace toolbar
              — visible only inside the editor, and nowhere near the thing it
              changes.
            */}
            <div className="space-y-3">
              <Label>Colour scheme</Label>
              <SchemePicker value={scheme} onChange={setScheme} />
            </div>

            <div className="space-y-3">
              <Label>Social links</Label>
              {/* Leave one empty to remove it — the icon disappears with it. */}
              <p className="text-xs text-muted-foreground">
                Only the ones you fill in appear on your page. A username or a full link both work.
              </p>
              <SocialLinksEditor
                value={links}
                onChange={(key, next) => setLinks((l) => ({ ...l, [key]: next }))}
              />
            </div>

            {/*
              WHAT THE LINE UNDER YOUR NAME SHOWS.
              
              There was one switch for all of it — `showStats` — so a creator
              who wanted their followers shown and their rating hidden had to
              choose between everything and nothing. Each item is its own now.

              Each row says what it does rather than naming the field, because
              "showTotalSalesBadge" is a column name and "Sales count" is what
              a person is deciding about.
            */}
            <div className="space-y-3">
              <Label>Show on your profile</Label>
              <div className="divide-y divide-border rounded-lg border border-border">
                {(
                  [
                    ["showReviews", "Rating and reviews"],
                    ["showFollowers", "Followers"],
                    ["showTotalSalesBadge", "Sales count"],
                    ["showSocialMedia", "Social links"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-sm"
                  >
                    <span>{label}</span>
                    <Switch
                      checked={shown[key] ?? true}
                      onCheckedChange={(next) => setShown((s) => ({ ...s, [key]: next }))}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Anything with nothing behind it stays hidden either way — no rating shows until
                somebody reviews you.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/*
            TWO EQUAL BUTTONS, Cancel on the left and Save on the right.

            DialogFooter's default is `sm:justify-end`, which put both of them
            in the right-hand corner sized to their own words — so "Cancel" was
            narrower than "Save", the pair sat in the corner of a 512px dialog
            with a stretch of empty white beside them, and the destructive
            choice was the one nearer the middle. A grid gives them the width
            and puts each at the end it belongs to: leaving on the left, the
            thing you came to do on the right, under your thumb on a phone.

            `sm:justify-*` is overridden explicitly because the footer applies
            it at that breakpoint and a grid quietly loses to it otherwise.
          */}
          <DialogFooter className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-6 py-4 sm:flex-none sm:justify-stretch">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full"
              onClick={save}
              disabled={saving || name.trim().length === 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
