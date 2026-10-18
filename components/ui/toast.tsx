'use client'

import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitives.Provider

/**
 * ===========================================================================
 *  WHERE A TOAST SITS, AND HOW BIG IT GETS
 * ===========================================================================
 * "The toast notifications that appear on mobile devices can have too much
 * text, and that makes the toast feel too big instead of being adapted,
 * clean, shrunk text on mobile."
 *
 * Part of that was the words (every message now says one short thing), and
 * part was this box. On a phone the viewport was `left: 50%` with an auto
 * width, and a box placed that way can only grow into the half of the screen
 * to the right of its left edge: every toast was squeezed into 163px of a
 * 390px screen, so a sentence broke over three or four lines inside a pill.
 *
 * Now, below md (the shell's phone width):
 *
 *   ACROSS THE SCREEN BETWEEN 16px GUTTERS, as wide as its words need and
 *   never wider than 358px at 390;
 *
 *   JUST UNDER THE HEADER, 8px below it and the status bar: nowhere near
 *   the nav pill or the home indicator at the foot;
 *
 *   ONE LINE OF TITLE at 14px, and at most two lines of detail at 13px,
 *   with tight padding and a 12px corner, the same box as the app's other
 *   toasts (Settings, Products, the product editor);
 *
 *   NO CLOSE BUTTON: it was only ever shown on hover, which a finger never
 *   does, and it still took 34px of the width. A swipe up puts it away
 *   (the Toaster sets the direction), or it goes by itself.
 *
 * From md it sits at the bottom right, 24px in, 380px at most, where the
 * website builder's toasts already are (components/ui/editor-toaster.tsx):
 * not over the header's account and bell buttons, where it used to be, nor
 * over the page's own action at the top right of its bar. It swipes away
 * to the right.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    data-toast-viewport=""
    className={cn(
      'pointer-events-none fixed inset-x-0 top-[calc(68px+env(safe-area-inset-top,0px)+8px)] z-[2147483646] flex max-h-screen flex-col items-center gap-2 px-4 outline-none',
      'md:left-auto md:right-6 md:top-auto md:bottom-[calc(24px+env(safe-area-inset-bottom,0px))] md:w-[380px] md:items-end md:px-0',
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  [
    'group pointer-events-auto relative flex max-w-full items-center gap-2.5 overflow-hidden rounded-xl px-3.5 py-2.5 md:gap-3 md:px-4 md:py-3',
    'shadow-[0_1px_2px_rgba(0,0,0,0.18),0_4px_10px_-2px_rgba(0,0,0,0.16),0_14px_32px_-12px_rgba(0,0,0,0.42)] will-change-transform',
    'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
    'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:translate-y-0',
    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none',
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out',
    /* Leaving eases out of its place rather than snapping (round Z7: "disappearing very smooth"): a shorter, symmetric curve than the arrival. */
    'data-[state=closed]:duration-[260ms] data-[state=closed]:ease-[cubic-bezier(0.4,0,0.2,1)]',
    'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-4',
    'data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-4',
    'md:data-[state=closed]:slide-out-to-right-4 md:data-[state=open]:slide-in-from-right-4',
  ].join(' '),
  {
    variants: {
      variant: {
        /* One dark box for both, the app's #111113 with white words and a
           white mark: a toast says what happened, it is not a traffic light.
           What went wrong is said by the words and the mark (a circle with a
           bar in it), not by painting the box red or the mark green. */
        default: 'border border-white/10 bg-[#111113] text-white',
        destructive: 'destructive group border border-white/10 bg-[#111113] text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'hidden shrink-0 rounded-full p-1 text-white/60 opacity-0 transition-opacity hover:text-white focus:opacity-100 focus:outline-none group-hover:opacity-100 md:inline-flex',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('truncate text-[14px] font-medium leading-5', className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('line-clamp-2 text-[13px] leading-[18px] text-white/75', className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
