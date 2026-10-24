'use client'

import { SCRIM } from "@/components/ui/scrim"
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { tt } from "@/lib/i18n/text"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/*
  THE CURVE EVERY MODAL OPENS ON.

  `.animate-in` resolves its timing as var(--tw-ease, ease), and nothing in
  here was setting --tw-ease, so every dialog in the product ran its zoom and
  its fade on the browser's plain `ease`. That curve is symmetric: it creeps
  for the first few frames, which reads as the modal hesitating before it
  moves even when no frame is late. `ease-sheet` is the curve the phone sheet
  snaps on, defined once in globals.css, so the whole app arrives the same
  way.

  The panel also declares what is about to change. A centred dialog animates
  transform and opacity, both of which the compositor can do on its own, but
  only once the element is on a layer; without that the shadow underneath is
  repainted every frame of the zoom.
*/
function DialogOverlay({
  className,
  disableDefaultAnimations = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  disableDefaultAnimations?: boolean
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        disableDefaultAnimations
          ? `fixed inset-0 z-[2147483638] ${SCRIM}`
          : `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[2147483638] ${SCRIM} duration-200 ease-sheet transition-none`,
        className,
      )}
      {...props}
    />
  )
}

/*
  THE PAGE IS HELD ONLY WHILE THE DIALOG IS OPEN.

  This guard used to be an effect of DialogContent itself, and DialogContent
  is in the tree for as long as its <Dialog> is, open or closed: Radix mounts
  the panel only when it opens, but the wrapper around it is always there. So
  every closed dialog on a screen wrote `overscroll-behavior: none` onto html
  and body when the screen mounted. A style written on the root element makes
  the browser restyle the whole document, and the stuck layer supervisor
  (lib/website-builder/stuck-layer.ts) then took it back as a lock nobody
  open was holding: another whole document restyle, in the website builder on
  the first press of a section (scripts/check-editor-live-edit.mjs, "open
  section settings": 300ms at 1x, 1.9s at 4x CPU on a 44 section page).

  Rendered inside the panel, it runs when the panel mounts and lets go when it
  unmounts, which is exactly while the dialog is open or playing its exit.
*/
function OverscrollGuard({ portalRef }: { portalRef: React.RefObject<HTMLDivElement | null> }) {
  // Prevent pull-to-refresh ONLY inside the dialog portal (never blocks normal page interactions)
  React.useEffect(() => {
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior
    const prevBodyOverscroll = document.body.style.overscrollBehavior
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.style.overscrollBehavior = 'none'

    const portal = portalRef.current
    if (!portal) {
      return () => {
        // Delay restoration so any in-progress dismiss gesture completes
        // before the browser can trigger pull-to-refresh
        setTimeout(() => {
          document.documentElement.style.overscrollBehavior = prevHtmlOverscroll
          document.body.style.overscrollBehavior = prevBodyOverscroll
        }, 500)
      }
    }

    let startY = 0

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      const currentY = e.touches[0].clientY
      const deltaY = currentY - startY

      // Walk up DOM to find nearest scrollable ancestor
      let el: HTMLElement | null = target
      while (el && el !== portal && el !== document.documentElement) {
        const style = window.getComputedStyle(el)
        const overflowY = style.overflowY
        const isScrollable =
          (overflowY === 'auto' || overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        if (isScrollable) {
          if (deltaY > 0 && el.scrollTop <= 0) { e.preventDefault(); return }
          if (deltaY < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { e.preventDefault(); return }
          return // normal scroll
        }
        el = el.parentElement
      }
      e.preventDefault()
    }

    portal.addEventListener('touchstart', handleTouchStart, { passive: true })
    portal.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      portal.removeEventListener('touchstart', handleTouchStart)
      portal.removeEventListener('touchmove', handleTouchMove)
      // Delay restoration so any in-progress dismiss gesture completes
      // before the browser can trigger pull-to-refresh
      setTimeout(() => {
        document.documentElement.style.overscrollBehavior = prevHtmlOverscroll
        document.body.style.overscrollBehavior = prevBodyOverscroll
      }, 500)
    }
  }, [portalRef])
  return null
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  disableDefaultAnimations = false,
  disableOverlayDefaultAnimations,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  overlayClassName?: string
  disableDefaultAnimations?: boolean
  disableOverlayDefaultAnimations?: boolean
}) {
  /** The dialog's own content element: what scrolls, and what the guard watches. */
  const portalRef = React.useRef<HTMLDivElement>(null)


  return (
    /*
      =========================================================================
       NO WRAPPER IN HERE. IT WAS EATING EVERY DIALOG'S EXIT ANIMATION.
      =========================================================================
      Radix's Portal wraps EACH OF ITS CHILDREN in its own <Presence>, and a
      Presence keeps a node mounted past `open: false` only for as long as that
      node has an animation to finish. This used to pass ONE child — a
      `display: contents` div holding the overlay and the content — so the
      thing Radix was watching was a div with no animation at all. It was
      unmounted on the frame the state changed, and it took the overlay and
      the panel with it before either could play its `data-[state=closed]`
      animation.

      Every dialog in the product therefore closed by deletion: the enter was
      a curve and the exit was one frame, which is exactly the "it opens nice
      and then just disappears" that has been reported about the editors, the
      share card and the modals generally. Measured in
      scripts/check-editor-motion.mjs — the panel was gone from the DOM 40ms
      after Escape, with no animation ever having started.

      Overlay and content are direct children now, so each gets its own
      Presence and its own exit. The touch guard below moves onto the content
      element, which is the thing that actually scrolls.
    */
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay
        className={overlayClassName}
        disableDefaultAnimations={disableOverlayDefaultAnimations ?? disableDefaultAnimations}
      />
      <DialogPrimitive.Content
        /* The guard's ref is the component's own, so a caller passing one of
           its own gets it too rather than quietly replacing the guard. */
        ref={(node: HTMLDivElement | null) => {
          portalRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        data-slot="dialog-content"
        className={cn(
          disableDefaultAnimations
            ? 'bg-background fixed top-[50%] left-[50%] z-[2147483639] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg overscroll-contain'
            : 'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[2147483639] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 ease-sheet transition-none [will-change:transform,opacity] sm:max-w-lg overscroll-contain',
          className,
        )}
        {...props}
      >
        <OverscrollGuard portalRef={portalRef} />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">{tt("Close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
