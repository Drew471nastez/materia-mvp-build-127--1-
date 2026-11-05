"use client"

import { useEffect } from "react"

export default function BlogPostTracker({ postId }: { postId: string }) {
  useEffect(() => {
    fetch("/api/blog/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    }).catch(() => {})
  }, [postId])

  return null
}
