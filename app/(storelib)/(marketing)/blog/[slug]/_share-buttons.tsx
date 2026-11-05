"use client"

/**
 * SHARE: Facebook, LinkedIn and X by their own share addresses (real links,
 * so they work with no script and open in a new tab), and Copy link. Each
 * has a name a screen reader says; Copy link says "Link copied" in a live
 * region when it worked, and nothing it did not do.
 */
import { useState } from "react"

const BTN =
  "flex h-11 w-11 items-center justify-center rounded-full text-[#4b5563] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]"

export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url)
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    x: `https://x.com/intent/tweet?url=${u}&text=${encodeURIComponent(title)}`,
  }
}

export default function ShareButtons({ url, title, label = "Share" }: { url: string; title: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const links = shareLinks(url, title)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-1" data-blog-share="">
      {label ? <span className="mr-1 text-[15px] text-[#4b5563]">{label}</span> : null}
      <a href={links.facebook} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" className={BTN}>
        <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z" />
        </svg>
      </a>
      <a href={links.linkedin} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" className={BTN}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
        </svg>
      </a>
      <a href={links.x} target="_blank" rel="noopener noreferrer" aria-label="Share on X" className={BTN}>
        <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <button type="button" onClick={copy} aria-label={copied ? "Link copied" : "Copy link"} className={BTN}>
        {copied ? (
          <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  )
}
