/**
 * The video registered for a page (lib/marketing/videos), drawn on the
 * server: nothing at all when there is none. Pages render it unconditionally
 * with their own path, so adding a video to the registry is the whole job of
 * putting it on a page.
 */
import { absoluteUrl } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { videoForPath, videoJsonLd, type Video } from "@/lib/marketing/videos"
import { VideoPlayer } from "./video-player"

export function RelatedVideo({ path, video, className = "" }: { path: string; video?: Video | null; className?: string }) {
  const v = video === undefined ? videoForPath(path) : video
  if (!v) return null
  const ld = videoJsonLd(v, absoluteUrl(path))
  return (
    <section aria-labelledby="video-h" className={`border-t border-[#eef0f2] py-10 sm:py-14 ${className}`} data-related-video={v.youtubeId}>
      {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} /> : null}
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <VideoPlayer id={v.youtubeId} title={v.title} chapters={v.chapters} />
        <div>
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Video</p>
          <h2 id="video-h" className="mt-1.5 text-[20px] font-bold leading-[1.3] text-[#1a1a2e] sm:text-[22px]">{v.title}</h2>
          <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">{v.description}</p>
          {v.transcript?.trim() ? (
            <details className="mt-5 border-t border-[#eef0f2] pt-3">
              <summary className="cursor-pointer text-[14px] font-semibold text-[#1a1a2e]">Read the transcript</summary>
              <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-2 text-[14px] leading-[1.65] text-[#374151]">
                {v.transcript
                  .trim()
                  .split(/\n{2,}/)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  )
}
