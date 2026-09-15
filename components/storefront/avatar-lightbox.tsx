"use client"

/**
 * ===========================================================================
 *  THE CREATOR'S PICTURE, FULL SIZE
 * ===========================================================================
 * A profile picture is the one image on the page a visitor might want to
 * actually look at, and it was a 150px circle with a crop. Pressing it opens
 * it: the whole photograph, uncropped, on a dark ground.
 *
 * IT IS A DIALOG, NOT A DIV. Escape, the focus trap, returning focus to the
 * avatar on close and stopping the page behind from scrolling are all things
 * a hand-rolled overlay gets wrong one at a time. This borrows the app's own
 * dialog, so it also arrives on the same curve as everything else.
 *
 * THE PANEL IS THE SIZE OF THE PHOTO. That is what makes "click away to
 * close" work without a single line of hit-testing: everything around the
 * image is the overlay, and the overlay already closes on a press. Sizing the
 * panel to the viewport instead would have made the empty space part of the
 * panel, and pressing it would do nothing.
 */
import * as React from "react"
import { X } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

export function AvatarLightbox({
  src,
  name,
  children,
  disabled = false,
}: {
  /** The full-size original, not the cropped thumbnail the header draws. */
  src?: string | null
  name?: string
  children: React.ReactNode
  /** True in the editor, where a press selects the section instead. */
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)

  if (!src || disabled) return <>{children}</>

  return (
    <>
      {/*
        A button around the circle rather than an onClick on it: this is a
        control, so it needs to answer the keyboard and say what it does.
        `contents` keeps it out of the layout entirely, so the header's
        measurements — the negative margin that straddles the cover, above
        all — are the same as when the avatar was bare.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `View ${name}'s profile picture` : "View profile picture"}
        /* A pointer, not a magnifier. This opens a picture, it does not zoom
           into the page, and the lupa read as a browser control. */
        className="contents cursor-pointer"
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/80"
          className="w-auto max-w-none gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {name ? `${name}'s profile picture` : "Profile picture"}
          </DialogTitle>

          {/*
            Fixed to the VIEWPORT, not to the panel. On a phone the panel is
            as wide as the photo and its corner is wherever the photo's corner
            is, which is not where a close control belongs; top right of the
            screen is. Sized for a thumb and clear of the notch.
          */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="fixed right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>

          {/*
            eslint-disable-next-line @next/next/no-img-element — deliberate.
            <Image> throws at render time on a host that is not in
            remotePatterns, and avatar_url is user data going back years. The
            header takes the same position for the same reason.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/*
            STILL A CIRCLE. It opened as whatever shape the file happened to
            be — usually a portrait rectangle — so pressing a round avatar
            produced a tall photograph of somebody's shoulders, and the crop
            a visitor had been looking at was gone.

            A square box with `object-cover` and a full radius is the same
            crop the header draws, just bigger: the picture is centred on the
            same point and nothing new appears at the edges. `min()` keeps it
            inside both the width and the height of a phone.
          */}
          <img
            src={src}
            alt={name ? `${name}'s profile picture` : "Profile picture"}
            className="aspect-square h-auto rounded-full object-cover"
            style={{ width: "min(88vw, 88vh, 560px)" }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
