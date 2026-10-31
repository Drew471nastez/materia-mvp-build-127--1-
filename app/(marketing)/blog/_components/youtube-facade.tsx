"use client"

/**
 * A YOUTUBE VIDEO THAT COSTS NOTHING UNTIL SOMEBODY PRESSES PLAY.
 *
 * The page draws YouTube's own thumbnail and a play button; the player (an
 * iframe from youtube-nocookie.com, with its megabyte of script) is added
 * only on a press. So an article with three videos loads no YouTube script
 * at all for a reader who scrolls past them.
 *
 * CHAPTERS are links to youtube.com at their time (&t=), so they work with
 * no script and in a feed reader. With script, a press seeks the player on
 * the page instead: through the IFrame API's postMessage commands
 * (enablejsapi=1), which need no YouTube script on Storelib's side. Before
 * the player exists, a chapter starts it at that time.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { Chapter } from "@/lib/blog/article"

interface Props {
  videoId: string
  title: string
  chapters: Chapter[]
  /** Pass `watchUrl` links in; they are the no-script fallback. */
  chapterHrefs: string[]
}

const ORIGIN = "https://www.youtube-nocookie.com"

export function YouTubeFacade({ videoId, title, chapters, chapterHrefs }: Props) {
  const [start, setStart] = useState<number | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const command = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), ORIGIN)
  }, [])

  /* Once loaded, the frame starts sending events after it is told someone is listening. */
  useEffect(() => {
    if (start === null) return
    const el = frame.current
    if (!el) return
    const hello = () => el.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), ORIGIN)
    el.addEventListener("load", hello)
    return () => el.removeEventListener("load", hello)
  }, [start, videoId])

  const seek = (i: number) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setActive(i)
    const seconds = chapters[i].seconds
    if (start === null) setStart(seconds)
    else {
      command("seekTo", [seconds, true])
      command("playVideo")
    }
    frame.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  return (
    <>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#0e0e10]">
        {start === null ? (
          <button
            type="button"
            onClick={() => setStart(0)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 flex h-full w-full items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              width={480}
              height={360}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span aria-hidden className="relative flex h-[56px] w-[80px] items-center justify-center rounded-[14px] bg-[#16161a]/85 transition-colors group-hover:bg-[#ff0033]">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 fill-white">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </button>
        ) : (
          <iframe
            ref={frame}
            src={`${ORIGIN}/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1${start ? `&start=${start}` : ""}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
      {chapters.length > 0 ? (
        <nav aria-label="Chapters" className="mt-4">
          <p className="text-[13px] font-semibold text-[#1a1a2e]">Chapters</p>
          <ol className="mt-1.5 divide-y divide-[#eef0f2] border-y border-[#eef0f2]">
            {chapters.map((c, i) => (
              <li key={`${c.seconds}-${i}`}>
                <a
                  href={chapterHrefs[i]}
                  onClick={seek(i)}
                  aria-current={active === i ? "true" : undefined}
                  className="flex min-h-[44px] items-center gap-4 py-2 text-[15px] text-[#4b5563] no-underline transition-colors hover:text-[#1a1a2e] aria-[current=true]:text-[#1a1a2e]"
                >
                  <span className="w-[52px] shrink-0 font-medium tabular-nums text-[#1a1a2e]">{c.stamp}</span>
                  <span className="min-w-0">{c.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </>
  )
}
