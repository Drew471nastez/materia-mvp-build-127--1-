"use client"

import { useState } from "react"
import type { ComponentProps, ReactNode, CSSProperties } from "react"
import { useAvatarImage } from "@/lib/account/avatar-image"
import { useDrawnByServer } from "@/lib/ui/drawn-by-server"
import { AvatarMark } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"

/** The same photo loader in the editor, wizard and public profile. */
export function ProfileImage({ src, name = "", fallback, fallbackStyle, className, style, ...props }: Omit<ComponentProps<"img">, "src"> & { src?: string | null; name?: string; fallback?: ReactNode; fallbackStyle?: CSSProperties }) {
  const image = useAvatarImage(src)
  const fromServer = useDrawnByServer()
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (!image.src) return <span className={cn("inline-flex items-center justify-center overflow-hidden", className)} style={fallbackStyle ?? style}>{fallback ?? <AvatarMark name={name} size={64} />}</span>
  return <img {...props} src={image.src} className={className} style={{ ...style, opacity: failedSource === image.src ? 0 : image.loaded || fromServer ? style?.opacity ?? 1 : 0 }} referrerPolicy="no-referrer" onError={() => { setFailedSource(image.src ?? null); image.onError() }} onLoad={() => setFailedSource(null)} />
}
