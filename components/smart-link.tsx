"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"

/**
 * An anchor tag that strips `target="_blank"` in Capacitor native apps.
 *
 * In Capacitor, opening a link with target="_blank" opens the system
 * browser, which has no access to the native auth session. This wrapper
 * detects the native app and forces same-window navigation so auth
 * is preserved.
 */
export function SmartLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [inApp, setInApp] = useState(false)

  useEffect(() => {
    setInApp(isNativeApp())
  }, [])

  return (
    <a
      href={href}
      {...props}
      // In native apps: strip target and rel to keep navigation in-app
      target={inApp ? undefined : props.target}
      rel={inApp ? undefined : props.rel}
    >
      {children}
    </a>
  )
}
