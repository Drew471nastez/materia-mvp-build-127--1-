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
 * PRESSING THE GROUND CLOSES IT, with no hit-testing. The panel used to be
 * exactly the size of the photograph, so everything around the image was the
 * overlay and the overlay already closes on a press. The panel is the whole
 * viewport now — it had to be, see the note on the close button — and
 * `pointer-events-none` on it keeps that behaviour unchanged: a press on
 * empty space passes through to the overlay underneath. Only the picture and
 * the close control take pointer events back.
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
        {/*
          ===================================================================
           THE PANEL IS THE WHOLE SCREEN, AND IT IS NOT TRANSFORMED
          ===================================================================
          It used to be exactly the size of the photograph, which made "press
          the ground to close" free: everything around the image was the
          overlay, and the overlay already closes on a press.

          THAT IS WHY THE CLOSE BUTTON LANDED ON THE PICTURE. DialogContent
          centres itself with `translate-x-[-50%] translate-y-[-50%]`, and a
          transformed element becomes the containing block for every `fixed`
          descendant — so `fixed right-4 top-4` on the button meant the top
          right of the PHOTO, not of the screen. On a phone that is the middle
          of somebody's face. No amount of adjusting the offsets fixes it;
          the anchor is wrong.

          So the transform goes. The panel is the viewport, centred with flex,
          and `pointer-events-none` on it keeps the press-the-ground behaviour
          exactly as it was: presses on empty space pass straight through to
          the overlay. The two things a visitor can actually hit turn their
          own pointer events back on.
        */}
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/80"
          className="pointer-events-none left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {name ? `${name}'s profile picture` : "Profile picture"}
          </DialogTitle>

          {/*
            THE CORNER OF THE SCREEN. `absolute` against the panel above,
            which is now the viewport itself — not `fixed`, which would be
            anchored to whichever ancestor happens to carry a transform and is
            how this ended up sitting on the photograph.

            44px, the smallest thing a thumb hits reliably, and clear of the
            notch and the rounded corner on both axes.
          */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="pointer-events-auto absolute z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
              right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
            }}
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
          {/*
            AND NOT THE WHOLE SCREEN. At 88vw the circle ran from edge to edge
            with the close control sitting on top of it, which is a picture
            that has taken the page over rather than one being shown. This is
            about twice the header's circle and still clearly a picture on a
            page: on a 390px phone, 296px; on a laptop, 420px.

            Measured by scripts/check-avatar-lightbox, which reads this very
            expression out of this file and lays it out at three sizes.
          */}
          <img
            src={src}
            alt={name ? `${name}'s profile picture` : "Profile picture"}
            className="pointer-events-auto aspect-square h-auto rounded-full object-cover"
            style={{ width: "min(76vw, 56vh, 420px)" }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
