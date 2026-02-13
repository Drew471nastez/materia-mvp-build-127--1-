'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileBottomSheetProps extends React.ComponentProps<typeof SheetPrimitive.Root> {
  children: React.ReactNode
}

function MobileBottomSheet({ children, ...props }: MobileBottomSheetProps) {
  return <SheetPrimitive.Root data-slot="mobile-sheet" {...props}>{children}</SheetPrimitive.Root>
}

function MobileBottomSheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="mobile-sheet-trigger" {...props} />
}

function MobileBottomSheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="mobile-sheet-portal" {...props} />
}

function MobileBottomSheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="mobile-sheet-overlay"
      className={cn(
        // GPU acceleration for smooth animations
        'will-change-[opacity] transform-gpu',
        // Smooth fade animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        // Quick durations matching timeframe selector
        'data-[state=closed]:duration-200 data-[state=open]:duration-300',
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  )
}

interface MobileBottomSheetContentProps extends React.ComponentProps<typeof SheetPrimitive.Content> {
  hideCloseButton?: boolean
  overlayClassName?: string
  showHandle?: boolean
}

function MobileBottomSheetContent({
  className,
  children,
  hideCloseButton = false,
  overlayClassName,
  showHandle = true,
  ...props
}: MobileBottomSheetContentProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState(0)
  const [startY, setStartY] = React.useState(0)
  const [velocity, setVelocity] = React.useState(0)
  const [lastMoveTime, setLastMoveTime] = React.useState(0)
  const contentRef = React.useRef<HTMLDivElement>(null)

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    // Only start drag from the handle or top area
    const target = e.target as HTMLElement
    const isHandle = target.closest('[data-mobile-sheet-handle]')
    const isTopArea = target.closest('[data-mobile-sheet-header]')

    if (isHandle || isTopArea) {
      setIsDragging(true)
      setStartY(e.touches[0].clientY)
      setDragOffset(0)
      setVelocity(0)
      setLastMoveTime(Date.now())
    }
  }, [])

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const diff = currentY - startY
    const now = Date.now()
    const timeDiff = now - lastMoveTime

    // Only allow dragging down
    if (diff > 0) {
      // Calculate velocity for momentum
      if (timeDiff > 0) {
        setVelocity((diff - dragOffset) / timeDiff)
      }

      setDragOffset(diff)
      setLastMoveTime(now)

      // Prevent body scroll while dragging
      e.preventDefault()
    }
  }, [isDragging, startY, dragOffset, lastMoveTime])

  const handleTouchEnd = React.useCallback(() => {
    if (!isDragging) return

    setIsDragging(false)

    // Close if dragged more than 80px OR with high velocity (fast swipe)
    const shouldClose = dragOffset > 80 || velocity > 0.5

    if (shouldClose) {
      // Trigger close
      const closeButton = contentRef.current?.querySelector('[data-mobile-sheet-close]') as HTMLButtonElement
      closeButton?.click()
    }

    // Reset drag offset with smooth animation
    setDragOffset(0)
    setVelocity(0)
  }, [isDragging, dragOffset, velocity])

  return (
    <MobileBottomSheetPortal>
      <MobileBottomSheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        ref={contentRef}
        data-slot="mobile-sheet-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          // GPU acceleration for maximum performance
          'will-change-transform transform-gpu',
          // Base styles
          'bg-background fixed z-50 flex flex-col',
          // Full width, 60% height mobile-optimized
          'inset-x-0 bottom-0 w-full',
          'h-[60vh] max-h-[60vh]',
          // Rounded top corners
          'rounded-t-[24px]',
          // Shadow for depth
          'shadow-[0_-4px_24px_rgba(0,0,0,0.12)]',
          // Border top
          'border-t border-border',
          // Smooth slide animations matching timeframe selector
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          // Quick, smooth durations
          'data-[state=closed]:duration-200 data-[state=open]:duration-300',
          // Smooth easing
          'ease-out',
          className,
        )}
        style={{
          transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
        {...props}
      >
        {/* Drag Handle */}
        {showHandle && (
          <div
            data-mobile-sheet-handle
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
          >
            <div className="w-12 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {children}

        {!hideCloseButton && (
          <SheetPrimitive.Close
            data-mobile-sheet-close
            className="ring-offset-background focus:ring-ring absolute top-6 right-4 rounded-full p-2 opacity-70 transition-all hover:opacity-100 hover:bg-accent focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </MobileBottomSheetPortal>
  )
}

function MobileBottomSheetHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="mobile-sheet-header"
      data-mobile-sheet-header
      className={cn(
        'flex flex-col gap-1.5 px-6 pb-4',
        'border-b border-border',
        className
      )}
      {...props}
    />
  )
}

function MobileBottomSheetBody({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const bodyRef = React.useRef<HTMLDivElement>(null)

  // Prevent touch events from bubbling to parent when scrolling
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const target = bodyRef.current
    if (!target) return

    const isScrollable = target.scrollHeight > target.clientHeight
    const isAtTop = target.scrollTop === 0
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1

    // Allow parent to handle drag only if at top and scrollable
    if (isScrollable && !isAtTop) {
      e.stopPropagation()
    }
  }, [])

  return (
    <div
      ref={bodyRef}
      data-slot="mobile-sheet-body"
      onTouchStart={handleTouchStart}
      className={cn(
        'flex-1 overflow-y-auto overscroll-contain px-6 py-4',
        // Smooth scrolling with GPU acceleration
        'scroll-smooth transform-gpu',
        // Momentum scrolling on iOS
        '[-webkit-overflow-scrolling:touch]',
        // Hide scrollbar on mobile for cleaner look
        '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
        className
      )}
      {...props}
    />
  )
}

function MobileBottomSheetFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="mobile-sheet-footer"
      className={cn(
        'flex flex-col gap-2 p-6 border-t border-border bg-background',
        className
      )}
      {...props}
    />
  )
}

function MobileBottomSheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="mobile-sheet-title"
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function MobileBottomSheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="mobile-sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  MobileBottomSheet,
  MobileBottomSheetTrigger,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetBody,
  MobileBottomSheetFooter,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
}
