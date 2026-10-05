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
 * PRESSING THE GROUND CLOSES IT, and it does so by saying so. This used to
 * put `pointer-events-none` on the panel and trust presses to fall through
 * to the overlay, which closes on a press. That class never applied. Radix
 * writes `pointer-events: auto` as an INLINE STYLE on the content of a modal
 * dialog, and an inline style beats a class, so the panel — which is the
 * whole viewport — quietly swallowed every press on empty space. Measured:
 *
 *     inline pointer-events on the panel: "auto"
 *     press on the ground -> dialog-content, state after: open
 *
 * So the ground is handled here instead, on the element the press actually
 * reaches. Pressing down AND releasing on the panel itself, rather than on
 * the picture or the close control, closes it. Both halves are checked so
 * that dragging off the photograph and releasing does not count as a press
 * on the ground.
 *
 * ===========================================================================
 *  IT OPENS OUT OF THE CIRCLE IT WAS, AND CLOSES BACK INTO IT
 * ===========================================================================
 * "Make sure it is more smooth and clean on open and on close, when I click
 * away or click the X button."
 *
 * The dialog's own entrance is `zoom-in-95` on the panel, and this panel is
 * the whole viewport (see below), so the zoom scaled the SCREEN: the X in the
 * corner grew with the photograph, and the photograph itself arrived from
 * nowhere in particular.
 *
 * The panel's default animations are off now and it only fades, which is what
 * carries the X. The photograph gets the move: it rises and grows out of the
 * circle in the page, from the rectangle that circle actually occupies on the
 * press, and on the way out it goes back into it. One state change drives
 * both ends, so the X, a press on the ground and Escape all close the same
 * way. Transform and opacity only. The keyframes, and why the panel's fade
 * outlasts the picture's move, are in app/globals.css.
 */
import * as React from "react"
import { X } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/**
 * Where the picture comes from and how much it has to grow, as the three
 * numbers the keyframes read. Null when there is nothing to measure, and the
 * stylesheet's own defaults (a small rise and a scale) then stand.
 */
type Origin = { dx: number; dy: number; scale: number }

/**
 * The circle in the page, as a transform from the open picture's final
 * place. The open picture is centred in the viewport by the panel's flex, so
 * its centre is the viewport's centre and the move is the difference between
 * the two centres plus the ratio of the two widths.
 *
 * THE BUTTON HAS NO BOX OF ITS OWN. It is `display: contents` so the
 * header's measurements are unchanged by it (see below), and an element with
 * no box measures as nothing at all, so the thing measured is the avatar
 * inside it.
 */
function originOf(trigger: HTMLElement | null, openWidth: number): Origin | null {
  if (!trigger || typeof window === "undefined") return null
  const box = (trigger.firstElementChild as HTMLElement | null) ?? trigger
  const r = box.getBoundingClientRect()
  if (r.width < 1 || r.height < 1 || openWidth < 1) return null
  const dx = Math.round(r.left + r.width / 2 - window.innerWidth / 2)
  const dy = Math.round(r.top + r.height / 2 - window.innerHeight / 2)
  /* Clamped: a 24px avatar beside a 320px picture is a scale that reads as
     the photograph arriving from a point rather than from the circle. */
  const scale = Math.min(1, Math.max(0.3, Math.round((r.width / openWidth) * 1000) / 1000))
  return { dx, dy, scale }
}

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
  const [origin, setOrigin] = React.useState<Origin | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const photoRef = React.useRef<HTMLImageElement>(null)
  /**
   * Whether the press that is in progress began on empty ground.
   *
   * A click fires on the nearest common ancestor of where the press went
   * down and where it came up, so pressing on the photograph and releasing
   * beside it reports the panel as the target. Without this, letting go of
   * a drag anywhere outside the picture would close it.
   */
  const pressStartedOnGround = React.useRef(false)

  /**
   * MEASURED ON THE PRESS, not after the dialog has mounted. The circle is
   * where it is on the frame the press lands; once the dialog is up the page
   * behind it has been locked and the scrollbar may be gone, which moves it.
   * The open picture's own width is read off the picture when there is one to
   * read (a second opening), and from the same `min()` the style below sets
   * on the first.
   */
  function openFrom() {
    const measured = photoRef.current?.getBoundingClientRect().width ?? 0
    const openWidth = measured > 1 ? measured : Math.min(window.innerWidth * 0.72, window.innerHeight * 0.56, 320)
    setOrigin(originOf(triggerRef.current, openWidth))
    setOpen(true)
  }

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
        ref={triggerRef}
        type="button"
        onClick={openFrom}
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

          So the transform goes and the panel is the viewport, centred with
          flex.

          `inset-0`, NOT `w-screen`. `w-screen` is `100vw`, and `100vw`
          includes the scrollbar; a fixed element's `right: 0` does not. So
          the panel was wider than the overlay by exactly the width of the
          gutter, and the close control, pinned to the panel's right edge,
          was pushed into it. In the creator page editor, where the framed
          page has a visible scrollbar, that is the X sitting half under it.
          Measured on a 1200px window with a 15px scrollbar:

              overlay right 1185   panel right 1200   close right 1188

          `inset-0` is measured against the same box the overlay uses, so the
          two now agree and the corner is a corner.

          NO DEFAULT ANIMATIONS ON THE PANEL, AND THE OVERLAY KEEPS ITS OWN.
          `disableDefaultAnimations` takes the dialog's zoom off a panel that
          is the size of the screen; `disableOverlayDefaultAnimations={false}`
          leaves the dark ground fading in and out as every other dialog's
          does. What replaces the zoom is declared on `data-avatar-lightbox`
          in app/globals.css, which is also what keeps a closing dialog
          mounted long enough for the picture to leave.
        */}
        <DialogContent
          showCloseButton={false}
          disableDefaultAnimations
          disableOverlayDefaultAnimations={false}
          overlayClassName="bg-black/80"
          data-avatar-lightbox=""
          className="inset-0 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 border-0 bg-transparent p-0 shadow-none [will-change:opacity] sm:max-w-none"
          style={
            origin
              ? ({
                  "--lightbox-dx": `${origin.dx}px`,
                  "--lightbox-dy": `${origin.dy}px`,
                  "--lightbox-scale": String(origin.scale),
                } as React.CSSProperties)
              : undefined
          }
          onPointerDown={(e) => {
            pressStartedOnGround.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            if (pressStartedOnGround.current && e.target === e.currentTarget) setOpen(false)
          }}
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
            that has taken the page over rather than one being shown.

            420px was still too big — reported from the creator page editor,
            where the frame is shorter than a window and the circle filled it.
            The cap is 320px now, a little over twice the 150px circle in the
            header, which is enough to be worth opening and little enough to
            read as a picture on a page. The phone barely moves: 296px to
            281px, because nobody complained about the phone.

            Measured by scripts/check-avatar-lightbox, which reads this very
            expression out of this file and lays it out at five sizes.
          */}
          <img
            ref={photoRef}
            data-avatar-lightbox-photo=""
            src={src}
            alt={name ? `${name}'s profile picture` : "Profile picture"}
            className="pointer-events-auto aspect-square h-auto rounded-full object-cover [will-change:transform,opacity]"
            style={{ width: "min(72vw, 56vh, 320px)" }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
