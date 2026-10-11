"use client"
import * as React from "react"
/* Counts mounts of a named piece on the window, for the probe. */
export function Mounts({ name }: { name: string }) {
  React.useEffect(() => {
    const w = window as unknown as { __mounts?: Record<string, number> }
    w.__mounts = w.__mounts || {}
    w.__mounts[name] = (w.__mounts[name] || 0) + 1
  }, [name])
  return null
}
