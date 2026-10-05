"use client"

import { useEffect } from "react"
import { startCommunityFixedFootWatch } from "@/components/community/fixed-foot-chrome"

/** Keeps --community-fixed-foot-h in sync for pills, toasts, and other floats. */
export function CommunityFixedFootWatch() {
  useEffect(() => startCommunityFixedFootWatch(), [])
  return null
}
