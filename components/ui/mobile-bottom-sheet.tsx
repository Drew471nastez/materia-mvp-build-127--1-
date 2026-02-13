'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileBottomSheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

interface MobileBottomSheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  children: React.ReactNode
  hideCloseButton?: boolean
  className?: string
}

const MobileBottomSheet = SheetPrimitive.Root

const MobileBottomSheetTrigger = SheetPrimitive.Trigger

const MobileBottomSheetClose = SheetPrimitive.Close

const MobileBottomSheetPortal = SheetPrimitive.Portal

const MobileBottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=open]:duration-300 data-[state=closed]:duration-200',
      className
    )}
    {...props}
  />
))
MobileBottomSheetOverlay.displayName = 'MobileBottomSheetOverlay'

const MobileBottomSheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  MobileBottomSheetContentProps
>(({ className, children, hideCloseButton = false, ...props }, ref) => {
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState(0)
  const [startY, setStartY] = React.useState(0)
  const [currentY, setCurrentY] = React.useState(0)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef<number>()

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    // Only allow dragging from the top area (first 60px) or the drag handle
    const target = e.target as HTMLElement
    const rect = contentRef.current?.getBoundingClientRect()
    const touchY = e.touches[0].clientY
    const isDragHandle = target.closest('[data-drag-handle]')
    const isTopArea = rect && touchY - rect.top < 60

    if (isDragHandle || isTopArea) {
      setIsDragging(true)
      setStartY(e.touches[0].clientY)
      setCurrentY(e.touches[0].clientY)
    }
  }, [])

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!isDragging) return

    const touch = e.touches[0]
    setCurrentY(touch.clientY)
    const delta = touch.clientY - startY

    // Only allow dragging down, not up
    if (delta > 0) {
      // Use RAF for smooth 60fps updates
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        setDragOffset(delta)
      })
    }
  }, [isDragging, startY])

  const handleTouchEnd = React.useCallback(() => {
    if (!isDragging) return

    const delta = currentY - startY
    const threshold = 100 // Threshold in pixels to close

    if (delta > threshold) {
      // Close the sheet
      const closeButton = contentRef.current?.querySelector('[data-radix-collection-item]') as HTMLButtonElement
      if (closeButton) {
        closeButton.click()
      } else {
        // Fallback: trigger close via context
        const event = new Event('closeSheet', { bubbles: true })
        contentRef.current?.dispatchEvent(event)
      }
    }

    // Reset with smooth animation
    setIsDragging(false)
    setDragOffset(0)
    setStartY(0)
    setCurrentY(0)

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
  }, [isDragging, currentY, startY])

  React.useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return (
    <MobileBottomSheetPortal>
      <MobileBottomSheetOverlay />
      <SheetPrimitive.Content
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          // Base styles with GPU acceleration
          'fixed inset-x-0 bottom-0 z-50',
          'w-full max-h-[60vh] h-auto',
          'bg-background',
          'border-t border-border',
          'rounded-t-[20px]',
          'flex flex-col',
          'shadow-[0_-4px_24px_rgba(0,0,0,0.12)]',
          // GPU acceleration and smooth transforms
          'will-change-transform',
          'transform-gpu',
          // Smooth animations
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          'data-[state=open]:duration-300 data-[state=closed]:duration-200',
          'data-[state=open]:ease-out data-[state=closed]:ease-in',
          className
        )}
        style={{
          transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
        {...props}
      >
        {/* Drag handle */}
        <div
          data-drag-handle
          className="w-full flex justify-center py-3 cursor-grab active:cursor-grabbing"
        >
          <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Content area with scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Close button */}
        {!hideCloseButton && (
          <SheetPrimitive.Close
            className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary z-10"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </MobileBottomSheetPortal>
  )
})
MobileBottomSheetContent.displayName = 'MobileBottomSheetContent'

const MobileBottomSheetHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn('flex flex-col space-y-2 px-6 pb-4', className)}
    {...props}
  />
)
MobileBottomSheetHeader.displayName = 'MobileBottomSheetHeader'

const MobileBottomSheetFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      'px-6 py-4 border-t border-border',
      className
    )}
    {...props}
  />
)
MobileBottomSheetFooter.displayName = 'MobileBottomSheetFooter'

const MobileBottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
))
MobileBottomSheetTitle.displayName = 'MobileBottomSheetTitle'

const MobileBottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
MobileBottomSheetDescription.displayName = 'MobileBottomSheetDescription'

export {
  MobileBottomSheet,
  MobileBottomSheetTrigger,
  MobileBottomSheetClose,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetFooter,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
}
