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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { EditorSheet, useSaveThenRefresh } from "@/components/storefront/editor-sheet"
import type { FocalPointConfig as FocalPoint } from "@/lib/store-builder/types"
import { DEFAULT_COVER_CROP, coverEditorSrc, cropFromSettings, isDefaultCrop, type CoverCrop } from "@/lib/images/cover-crop"
import { useCoverAspect } from "@/components/storefront/use-cover-aspect"
import { useSavedValues } from "@/lib/store-builder/use-saved-values"
import { ImageUpload } from "@/components/app/image-upload"
import { announceAvatar } from "@/lib/account/avatar-store"
import { Pencil, Wand2 } from "lucide-react"
import { SocialLinksEditor } from "@/components/social/social-links-editor"
import { SchemePicker } from "@/components/storefront/scheme-picker"
import { OWNER_CONTROL_DEPTH } from "@/components/storefront/owner-actions-menu"
import { useSchemePreview } from "@/components/storefront/use-scheme-preview"
import type { RootPaint } from "@/lib/store-builder/scheme-preview"
import type { SocialPlatformKey } from "@/lib/social/platforms"

/**
 * THE HEAVY PARTS OF THE FORM DRAW ONLY WHEN THEIR OWN VALUES CHANGE. The
 * name and the bio re-render this component on every keystroke, and each of
 * those used to redraw the cover frame, the picture, eight schemes and eight
 * social fields as well. With stable handlers below, these skip that work,
 * and a keystroke redraws the field it went into.
 */
const MemoImageUpload = React.memo(ImageUpload)
const MemoSchemePicker = React.memo(SchemePicker)
const MemoSocialLinksEditor = React.memo(SocialLinksEditor)

/*
  THE /app FIELDS, NOT THE LIBRARY'S (round 41). The name and the bio were the
  component library's own boxes and labels, a different grey and height from
  every other form a creator fills in. These are the coupon and collection
  editors' measures: 16px type on a phone so iOS does not zoom, 44px to
  press, a quiet ring on focus.
*/
const LABEL = "text-[13px] font-medium text-[#4b5563]"
const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] shadow-none outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus-visible:border-[#c9ccd3] focus-visible:ring-0 focus-visible:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"

// The platforms, their order and their icons all come from
// lib/social/platforms and components/social. This file used to carry its own
// list with its own placeholder text — one of five such lists.
type PlatformKey = SocialPlatformKey

export interface EditProfileButtonProps {
  /** True when this page is rendered inside /creator-page. */
  embedded?: boolean
  displayName: string
  bio: string
  /** Where the cover sits in its band, if the creator has moved it. */
  coverFocalPoint?: FocalPoint | null
  /** How close it is drawn, if the creator has zoomed it. Absent is 1. */
  coverZoom?: number | null
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
  /**
   * What each offered scheme paints the page's root with, prepared by the
   * page from this creator's own stored colours, so pressing a scheme shows
   * on the page at once. See lib/store-builder/scheme-preview.
   */
  schemeRoots?: Record<string, RootPaint>
}

export function EditProfileButton({
  embedded = false,
  displayName,
  bio,
  coverFocalPoint,
  coverZoom,
  username,
  avatarUrl,
  coverUrl,
  socialLinks,
  display,
  themePreset = "default",
  schemeRoots,
}: EditProfileButtonProps) {
  const { markSaved, onClosed, toast } = useSaveThenRefresh()
  /* The page behind the sheet shows the scheme being tried; Save keeps it, anything else puts it back. */
  const preview = useSchemePreview(themePreset, schemeRoots)
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
  /* Saved, but not on the page yet: said in grey beside Save, never as an error (round 41). */
  const [notice, setNotice] = React.useState<string | null>(null)

  const [name, setName] = React.useState(displayName)
  const [about, setAbout] = React.useState(bio)
  const [avatar, setAvatar] = React.useState<string | null>(avatarUrl ?? null)
  const [cover, setCover] = React.useState<string | null>(coverUrl ?? null)
  /* Position and zoom together, as the page draws them (lib/images/cover-crop). */
  const [crop, setCrop] = React.useState<CoverCrop>(() => cropFromSettings(coverFocalPoint, coverZoom))
  const [links, setLinks] = React.useState<Record<string, string>>(() => ({ ...socialLinks }))
  const [shown, setShown] = React.useState<Record<string, boolean>>(() => ({
    showReviews: display?.showReviews ?? true,
    showTotalSalesBadge: display?.showTotalSalesBadge ?? true,
    showSocialMedia: display?.showSocialMedia ?? true,
  }))
  const [scheme, setScheme] = React.useState(themePreset)
  /* On a phone, a scheme press lowers the sheet so the page it is changing shows above it. */
  const [peeking, setPeeking] = React.useState(false)

  /**
   * The shape of the band on the page behind this drawer, so the frame that
   * positions the cover crops it the same way the page will. Measured while
   * the drawer is open; see use-cover-aspect.
   */
  const coverAspect = useCoverAspect(open)

  /* Stable handlers and props for the memoised parts above. */
  const onCoverChange = React.useCallback((url: string | null) => {
    setCover(url)
    setCrop(DEFAULT_COVER_CROP)
  }, [])
  const onAvatarChange = React.useCallback((url: string | null) => setAvatar(url), [])
  const coverReposition = React.useMemo(
    () => ({ value: crop, onChange: setCrop, aspect: coverAspect, editable: !!cover }),
    [crop, coverAspect, cover],
  )
  const { show: showScheme } = preview
  const onPickScheme = React.useCallback((next: string) => {
    setScheme(next)
    showScheme(next)
    setPeeking(true)
  }, [showScheme])
  const onLinkChange = React.useCallback(
    (key: SocialPlatformKey, next: string) => setLinks((l) => ({ ...l, [key]: next })),
    [],
  )

  /**
   * Reopening shows what is SAVED, not what was abandoned — and not what was
   * saved a moment ago either. See lib/store-builder/use-saved-values: the
   * old version watched `open` alone, so it put back the pre-save props and
   * never heard about the refreshed ones.
   */
  const savedValues = {
      displayName,
      bio,
      avatarUrl: avatarUrl ?? null,
      coverUrl: coverUrl ?? null,
      coverFocalPoint: coverFocalPoint ?? null,
      coverZoom: coverZoom ?? null,
      socialLinks,
      display,
      themePreset,
  }
  const applySaved = (saved: typeof savedValues) => {
      setName(saved.displayName)
      setAbout(saved.bio)
      setAvatar(saved.avatarUrl)
      setCover(saved.coverUrl)
      setCrop(cropFromSettings(saved.coverFocalPoint, saved.coverZoom))
      setLinks({ ...saved.socialLinks })
      setShown({
        showReviews: saved.display?.showReviews ?? true,
        showTotalSalesBadge: saved.display?.showTotalSalesBadge ?? true,
        showSocialMedia: saved.display?.showSocialMedia ?? true,
      })
      setScheme(saved.themePreset)
      setError(null)
      setNotice(null)
  }
  useSavedValues(open, savedValues, applySaved)

  /**
   * CLOSED WITHOUT SAVING IS CLOSED WITHOUT SAVING. The re-sync above only
   * fires when the saved values change, so a Cancel left the abandoned edits
   * in the form for next time, a scheme among them: reopened, the picker
   * showed a scheme the page was not in, and Save would have kept it. The
   * form is put back to what is saved once the sheet has finished leaving,
   * so nothing changes in it on the way out.
   */
  /**
   * WHAT SAVE WOULD CHANGE (round 41). Save dims while the form is what is
   * saved, as the other editors' Save does, so pressing it always does
   * something. And a message from the last try goes the moment the form is
   * touched again: it was about that try, not this one.
   */
  const formNow = JSON.stringify([name, about, avatar, cover, crop, links, shown, scheme])
  const formSaved = JSON.stringify([
    displayName,
    bio,
    avatarUrl ?? null,
    coverUrl ?? null,
    cropFromSettings(coverFocalPoint, coverZoom),
    { ...socialLinks },
    { showReviews: display?.showReviews ?? true, showTotalSalesBadge: display?.showTotalSalesBadge ?? true, showSocialMedia: display?.showSocialMedia ?? true },
    themePreset,
  ])
  const dirty = formNow !== formSaved
  const lastForm = React.useRef(formNow)
  React.useEffect(() => {
    if (lastForm.current === formNow) return
    lastForm.current = formNow
    setError(null)
    setNotice(null)
  }, [formNow])

  const abandoned = React.useRef(false)
  const restoreRef = React.useRef(() => applySaved(savedValues))
  restoreRef.current = () => applySaved(savedValues)

  /**
   * THE COVER IS DECODED BEFORE THE SHEET MOVES. The press starts it, at the
   * exact URL the frame will ask for (coverEditorSrc), so by the time the
   * sheet is sliding the picture is a decoded bitmap and not a download and a
   * decode landing in the middle of the slide. The sheet also waits a moment
   * for anything still decoding (BottomSheet `waitForImages`).
   */
  const warmCover = React.useCallback(() => {
    if (!cover || typeof window === "undefined") return
    const img = new window.Image()
    img.decoding = "async"
    img.src = coverEditorSrc(cover)
    img.decode?.().catch(() => {})
  }, [cover])

  const save = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          bio: about,
          avatarUrl: avatar,
          coverUrl: cover,
          /* Nothing stored for a cover nobody moved, so the settings stay as
             they were for every page that never touched this. */
          coverFocalPoint: isDefaultCrop(crop) ? null : { x: crop.x, y: crop.y },
          coverZoom: crop.zoom > 1 ? crop.zoom : null,
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
      /* One photo: the shell's avatar, in this tab and the others, is this
         one now rather than on the next load (lib/account/avatar-store). */
      if ((avatarUrl ?? null) !== (avatar ?? null)) announceAvatar(avatar ?? null)
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
        setNotice("Saved. It shows on your page once your store is published from the store builder.")
        return
      }
      setOpen(false)
      setPeeking(false)
      /* The scheme on the page is the saved one now; only the address still says "preview". */
      preview.settle(scheme)
      /**
       * The server re-renders and the new name, bio, picture and links appear
       * without a reload. This only actually works because /u/:username* is no
       * longer served with `public, s-maxage=300` — the refreshed RSC payload
       * used to come straight back from the edge, unchanged, which is why the
       * page had to be hard-reloaded to show a save. See next.config.mjs.
       */
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
          onPointerDown={warmCover}
          onFocus={warmCover}
          onClick={() => {
            abandoned.current = false
            setOpen(true)
          }}
          aria-label="Edit profile"
          // rounded-lg (8px), not a pill. A fully rounded control reads as a
          // chip or a tag; this is a button, and it sits beside a card grid whose
          // corners are the same 8px.
          /* 36px to the eye over the cover, 44px to a thumb (the ::before). */
          /* Raised a little more on a phone, where it sits on the banner alone (OWNER_CONTROL_DEPTH). */
          className={`relative inline-flex h-9 items-center gap-2 rounded-lg bg-white/95 px-3 text-sm font-medium text-gray-900 backdrop-blur transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-white sm:px-4 ${OWNER_CONTROL_DEPTH}`}
        >
          <Pencil className="h-3.5 w-3.5" />
          {/* The word on a desktop; on a phone the cover is 128px tall and a
              labelled button over it covers a quarter of the picture. */}
          <span className="hidden sm:inline">Edit profile</span>
        </button>
      </div>

      <EditorSheet
        open={open}
        onClosed={() => {
          if (abandoned.current) {
            abandoned.current = false
            restoreRef.current()
          }
          onClosed()
        }}
        onClose={() => {
          abandoned.current = true
          setOpen(false)
          setPeeking(false)
          /* Closed without saving: the page goes back to the scheme it has. */
          preview.reset()
        }}
        peek={peeking ? "[data-scheme-picker]" : null}
        onPeekEnd={() => setPeeking(false)}
        title="Profile details"
        wide
        busy={saving}
        error={error}
        notice={notice}
        onSave={() => void save()}
        saveDisabled={name.trim().length === 0 || !dirty}
        /* The spinner is the sheet's, beside the word. `busy` already says
           a save is in flight; a label that changes as well took the word
           away at the moment it was pressed. */
        saveLabel="Save"
      >
            {/*
              Cover first, then the avatar sitting half over it — the same
              relationship they have on the page, so what you are editing looks
              like what you will get.
            */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label className={LABEL}>Cover</Label>
                {/* What the frame does, said once, in place of a pill over the picture. */}
                {cover ? (
                  <span className="text-right text-xs text-muted-foreground">
                    <span className="pointer-fine:hidden">Drag to move, pinch to zoom</span>
                    <span className="hidden pointer-fine:inline">Drag to move, pinch or ctrl + scroll to zoom</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Recommended ratio 3:1</span>
                )}
              </div>
              {/*
                ONE BOX. The cover and the control that positions it were two
                3:1 frames stacked on each other, both showing the same
                photograph, with a slider and a percentage readout under the
                second one. Four pieces of UI for "which part of this shows".

                Now the frame that shows the cover is the frame you drag it
                in, and `reposition` only reaches it when there is a cover to
                move: with none, this is the ordinary upload box.
              */}
              <MemoImageUpload
                bucket="covers"
                aspectRatio="cover"
                value={cover || undefined}
                /* A new picture starts from the middle, at its own size. */
                onChange={onCoverChange}
                replaceOnly
                allowRemove
                livePreview
                replaceLabel="Change banner"
                /*
                  ANY COVER CAN BE PLACED. The owner asked for pinch and drag
                  to work on the banner that is there, not only on a new one.
                  A graze no longer costs anything: the frame is the only
                  surface with touch-action none and data-sheet-no-drag, so a
                  finger on it never drags the sheet, and nothing is kept until
                  Save. The frame always draws the saved crop, so it shows
                  what the page shows. Position and zoom come back from the
                  frame once per gesture, when the finger lifts.
                */
                reposition={coverReposition}
              />
            </div>

            <div className="space-y-2">
              <Label className={LABEL}>Profile photo</Label>
              <div className="w-28">
                <MemoImageUpload
                  bucket="avatars"
                  aspectRatio="square"
                  value={avatar || undefined}
                  onChange={onAvatarChange}
                  replaceOnly
                  livePreview
                  replaceLabel="Change"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={LABEL} htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={FIELD} />
              {username && (
                <p className="text-xs text-muted-foreground">
                  Your page lives at <span className="font-medium">@{username}</span>. Change the handle in settings.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className={LABEL} htmlFor="ep-bio">Bio</Label>
              <Textarea
                id="ep-bio"
                value={about}
                maxLength={500}
                rows={3}
                onChange={(e) => setAbout(e.target.value)}
                className={cn(FIELD, "h-auto min-h-[88px] resize-none py-2.5 leading-[1.45]")}
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
            <div className="space-y-3" data-scheme-picker="">
              <Label className={LABEL}>Colour scheme</Label>
              <MemoSchemePicker
                value={scheme}
                onChange={onPickScheme}
                onIntent={preview.prefetch}
              />
            </div>

            <div className="space-y-3">
              <Label className={LABEL}>Social links</Label>
              {/* Leave one empty to remove it — the icon disappears with it. */}
              <p className="text-xs text-muted-foreground">
                Only the ones you fill in appear on your page. A username or a full link both work.
              </p>
              <MemoSocialLinksEditor
                value={links}
                onChange={onLinkChange}
              />
            </div>

            {/*
              WHAT THE LINE UNDER YOUR NAME SHOWS.
              
              There was one switch for all of it — `showStats` — so a creator
              who wanted their followers shown and their rating hidden had to
              choose between everything and nothing. Each item is its own now.

              No Followers switch (round 38): a creator page never shows
              followers or following, so there is nothing to switch.

              Each row says what it does rather than naming the field, because
              "showTotalSalesBadge" is a column name and "Sales count" is what
              a person is deciding about.
            */}
            <div className="space-y-3">
              <Label className={LABEL}>Show on your profile</Label>
              <div className="divide-y divide-border rounded-lg border border-border">
                {(
                  [
                    ["showReviews", "Rating and reviews"],
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
                Anything with nothing behind it stays hidden either way. No rating shows until
                somebody reviews you.
              </p>
            </div>
      </EditorSheet>
      {/* "Saved", once the sheet has gone (useSaveThenRefresh). */}
      {toast}
    </>
  )
}
