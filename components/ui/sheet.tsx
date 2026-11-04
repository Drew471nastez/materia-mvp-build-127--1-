'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useNextFrameAutoFocus } from '@/lib/ui/dialog-focus'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:duration-[420ms] fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  hideCloseButton = false,
  overlayClassName,
  enableDragToClose = false,
  onDragClose,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  hideCloseButton?: boolean
  overlayClassName?: string
  enableDragToClose?: boolean
  onDragClose?: () => void
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const portalRef = React.useRef<HTMLDivElement>(null)
  const onDragCloseRef = React.useRef(onDragClose)
  onDragCloseRef.current = onDragClose
  /* Focus on the next frame without a touch screen (lib/ui/dialog-focus.ts), as the shared Dialog does. */
  const openAutoFocus = useNextFrameAutoFocus(contentRef, props.onOpenAutoFocus)

  // Drag-to-close for bottom sheets
  React.useEffect(() => {
    if (!enableDragToClose || side !== 'bottom') return
    const content = contentRef.current
    if (!content) return

    let startY = 0
    let startTime = 0
    let lastY = 0
    let lastTime = 0
    let currentDelta = 0
    let isDragging = false
    let isClosing = false

    const isDragHandle = (target: HTMLElement): boolean => {
      let el: HTMLElement | null = target
      while (el && el !== content) {
        if (el.dataset?.dragHandle === 'true') return true
        el = el.parentElement
      }
      return false
    }

    const canStartDrag = (target: HTMLElement): boolean => {
      // Always allow drag from handle/header area
      if (isDragHandle(target)) return true
      let el: HTMLElement | null = target
      while (el && el !== content) {
        const style = window.getComputedStyle(el)
        const isScrollable =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        if (isScrollable && el.scrollTop > 0) return false
        el = el.parentElement
      }
      return true
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (isClosing) return
      if (!canStartDrag(e.target as HTMLElement)) return
      startY = e.touches[0].clientY
      startTime = Date.now()
      lastY = startY
      lastTime = startTime
      currentDelta = 0
      isDragging = true
      content.style.transition = 'none'
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || isClosing) return
      const now = Date.now()
      const touchY = e.touches[0].clientY
      currentDelta = touchY - startY
      if (currentDelta < 0) currentDelta = 0

      // Slight resistance at the start for natural feel
      const resistance = currentDelta < 15 ? currentDelta * 0.7 : currentDelta - 4.5
      content.style.transform = `translateY(${Math.max(0, resistance)}px)`

      const overlay = portalRef.current?.querySelector('[data-slot="sheet-overlay"]') as HTMLElement
      if (overlay) {
        overlay.style.transition = 'none'
        overlay.style.opacity = String(Math.max(0, 1 - Math.max(0, resistance) / 280))
      }

      lastY = touchY
      lastTime = now
    }

    const handleTouchEnd = () => {
      if (!isDragging || isClosing) return
      isDragging = false

      const easing = 'cubic-bezier(0.32, 0.72, 0, 1)'
      const overlay = portalRef.current?.querySelector('[data-slot="sheet-overlay"]') as HTMLElement

      // If no movement (just a tap), clear inline styles immediately so Radix
      // close animation plays without interference
      if (currentDelta === 0) {
        content.style.transition = ''
        content.style.transform = ''
        if (overlay) {
          overlay.style.transition = ''
          overlay.style.opacity = ''
        }
        return
      }

      // Velocity-based close: px/ms — flick gesture threshold
      const elapsed = Math.max(Date.now() - lastTime, 1)
      const deltaFromLast = lastY - startY
      const velocity = (lastY - (startY + (currentDelta - (lastY - startY)))) / elapsed
      // Use simpler velocity: total delta / time since start, but weight recent movement
      const totalElapsed = Math.max(Date.now() - startTime, 1)
      const avgVelocity = currentDelta / totalElapsed // px/ms

      // Close if: dragged far enough OR fast flick (even short distance)
      const shouldClose = currentDelta > 45 || (avgVelocity > 0.35 && currentDelta > 12)

      if (shouldClose) {
        isClosing = true
        // Faster close animation for velocity-based closes
        const closeDuration = avgVelocity > 0.8 ? 220 : 280
        content.style.transition = `transform ${closeDuration}ms ${easing}`
        content.style.transform = 'translateY(110%)'
        if (overlay) {
          overlay.style.transition = `opacity ${closeDuration}ms ${easing}`
          overlay.style.opacity = '0'
        }
        setTimeout(() => {
          onDragCloseRef.current?.()
          isClosing = false
          content.style.transition = ''
          content.style.transform = ''
          if (overlay) {
            overlay.style.transition = ''
            overlay.style.opacity = ''
          }
        }, closeDuration)
      } else {
        // Smooth snap back with spring-like feel
        content.style.transition = `transform 0.42s ${easing}`
        content.style.transform = 'translateY(0)'
        if (overlay) {
          overlay.style.transition = `opacity 0.42s ${easing}`
          overlay.style.opacity = '1'
        }
        // Clean up inline styles after snap
        setTimeout(() => {
          if (!isClosing) {
            content.style.transition = ''
            content.style.transform = ''
            if (overlay) {
              overlay.style.transition = ''
              overlay.style.opacity = ''
            }
          }
        }, 440)
      }
    }

    content.addEventListener('touchstart', handleTouchStart, { passive: true })
    content.addEventListener('touchmove', handleTouchMove, { passive: true })
    content.addEventListener('touchend', handleTouchEnd, { passive: true })
    content.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      content.removeEventListener('touchstart', handleTouchStart)
      content.removeEventListener('touchmove', handleTouchMove)
      content.removeEventListener('touchend', handleTouchEnd)
      content.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [enableDragToClose, side])

  // Prevent pull-to-refresh ONLY inside the sheet portal (never blocks normal page interactions)
  React.useEffect(() => {
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior
    const prevBodyOverscroll = document.body.style.overscrollBehavior
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.style.overscrollBehavior = 'none'

    const restore = () => {
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll
      document.body.style.overscrollBehavior = prevBodyOverscroll
    }

    // Scoped touchmove handler - only prevents on the overlay (not inside scrollable content)
    const portal = portalRef.current
    if (!portal) {
      return restore
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
      restore()
    }
  }, [])

  return (
    <SheetPortal>
      <div ref={portalRef} style={{ display: 'contents' }}>
        <SheetOverlay className={overlayClassName} />
        <SheetPrimitive.Content
          ref={contentRef}
          data-slot="sheet-content"
          className={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg will-change-transform data-[state=open]:duration-300 data-[state=closed]:duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] overscroll-contain',
            side === 'right' &&
              'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
            side === 'left' &&
              'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
            side === 'top' &&
              'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
            side === 'bottom' &&
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
            className,
          )}
          {...props}
          onOpenAutoFocus={openAutoFocus}
        >
          {children}
          {!hideCloseButton && (
            <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Content>
      </div>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
