"use client"

/**
 * Is this a phone-width screen. One hook rather than a `matchMedia` in every
 * component that has to pick a sheet or a dialog, and STATE rather than a
 * bare read so the server render and the first client render agree — a
 * dialog rendered on the server and a sheet rendered on the client is a
 * hydration error on every page that has an editor on it.
 *
 * 767px is the boundary the workspace and the website builder already use.
 */

import { useEffect, useState } from "react"

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}
