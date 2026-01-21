"use client"

import type * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { useState } from "react"

import { cn } from "@/lib/utils"

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        "aspect-square",
        // Default to size-8 if no size class provided
        className?.includes("h-") || className?.includes("w-") || className?.includes("size-") ? "" : "size-8",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, onLoadingStatusChange, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image> & { onLoadingStatusChange?: (status: "loading" | "loaded" | "error") => void }) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      onLoadingStatusChange={onLoadingStatusChange}
      {...props}
    />
  )
}

function AvatarFallback({ className, delayMs, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback> & { delayMs?: number }) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      delayMs={delayMs}
      className={cn("bg-muted flex size-full items-center justify-center rounded-full", className)}
      {...props}
    />
  )
}

// Skeleton loader for avatar - shows pulse animation
function AvatarSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse",
        className
      )}
      style={{
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }}
    />
  )
}

// Enhanced Avatar with built-in loading skeleton
function AvatarWithSkeleton({
  src,
  alt,
  fallback,
  className,
  imageClassName,
  fallbackClassName,
  style,
}: {
  src?: string | null
  alt?: string
  fallback?: React.ReactNode
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  style?: React.CSSProperties
}) {
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error")

  return (
    <Avatar className={className} style={style}>
      {/* Skeleton - shows while loading */}
      {imageStatus === "loading" && src && (
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div
            className="size-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
            style={{
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Actual image */}
      {src && (
        <AvatarImage
          src={src}
          alt={alt}
          className={cn(
            "transition-opacity duration-300",
            imageStatus === "loaded" ? "opacity-100" : "opacity-0",
            imageClassName
          )}
          onLoadingStatusChange={setImageStatus}
        />
      )}

      {/* Fallback - shows when no image or on error */}
      <AvatarFallback delayMs={0} className={fallbackClassName}>
        {fallback}
      </AvatarFallback>
    </Avatar>
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarSkeleton, AvatarWithSkeleton }
