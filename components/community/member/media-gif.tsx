"use client"

/**
 * ===========================================================================
 *  THE COMPOSER'S GIF BUTTON
 * ===========================================================================
 * A search over Giphy, through Storelib's own route (/api/community/<id>/gifs,
 * which holds the key): what is trending when the box is empty, results a
 * moment after typing stops. A popover under the button on a computer, the
 * shared sheet on a phone. A pick goes into the post as a GIF with its still.
 *
 * Without GIPHY_API_KEY the route answers `connected: false`: the button is
 * drawn quieter and opening it says GIFs are not connected, nothing more.
 */
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import type { PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"

interface Gif {
  id: string
  url: string
  still: string
  w: number
  h: number
  title: string
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/** The letters GIF, drawn like the toolbar's other icons. */
function GifMark() {
  return (
    <span aria-hidden className="text-[12px] font-bold leading-none tracking-[0.02em]">
      GIF
    </span>
  )
}

export function GifButton({ communityId, className, onPick, disabled = false }: { communityId: string; className: string; onPick: (gif: Extract<PostMedia, { type: "gif" }>) => void; disabled?: boolean }) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)

  /* Asked once while the editor is open, so the button knows whether GIFs are connected before it is pressed. */
  useEffect(() => {
    let stop = false
    void api<{ connected: boolean }>(`${apiBase(communityId)}/gifs`).then((r) => {
      if (!stop && r.ok) setConnected(r.data.connected)
    })
    return () => {
      stop = true
    }
  }, [communityId])

  const pick = (g: Gif) => {
    setOpen(false)
    onPick({ type: "gif", url: g.url, still: g.still, w: g.w, h: g.h, ...(g.title ? { title: g.title } : {}) })
  }

  const trigger = (
    <button
      type="button"
      aria-label={connected === false ? "GIFs (not connected)" : "Add a GIF"}
      title={connected === false ? "GIFs are not connected" : "Add a GIF"}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      data-composer-gif={connected === false ? "off" : "on"}
      onClick={() => setOpen((o) => !o)}
      className={`${className} ${connected === false ? "opacity-50" : ""}`}
    >
      <GifMark />
    </button>
  )

  const panel = <GifPanel communityId={communityId} active={open} connected={connected} onConnected={setConnected} onPick={pick} phone={phone} />

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} label="GIFs" height="min(70dvh, 560px)" maxHeight="min(70dvh, 560px)" fill aboveKeyboard>
          {panel}
        </BottomSheet>
      </>
    )
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>{trigger}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          data-gif-popover=""
          className="z-[2147483640] flex h-[420px] w-[360px] flex-col overflow-hidden rounded-xl border border-[#e3e4e8] bg-white shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
        >
          {panel}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function GifPanel({ communityId, active, connected, onConnected, onPick, phone }: { communityId: string; active: boolean; connected: boolean | null; onConnected: (c: boolean) => void; onPick: (g: Gif) => void; phone: boolean }) {
  const [q, setQ] = useState("")
  const [gifs, setGifs] = useState<Gif[] | null>(null)
  const [failed, setFailed] = useState(false)
  const ask = useRef(0)

  const load = useCallback(
    async (term: string) => {
      const n = ++ask.current
      setFailed(false)
      const r = await api<{ connected: boolean; gifs: Gif[] }>(`${apiBase(communityId)}/gifs?q=${encodeURIComponent(term)}`)
      if (n !== ask.current) return
      if (!r.ok) {
        setFailed(true)
        return
      }
      onConnected(r.data.connected)
      setGifs(r.data.gifs)
    },
    [communityId, onConnected],
  )

  useEffect(() => {
    if (!active || connected === false) return
    const t = window.setTimeout(() => void load(q.trim()), q ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [active, q, load, connected])

  if (connected === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center" data-gif-off="">
        <p className="text-[14.5px] font-medium text-[#1a1a2e]">GIFs are not connected</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">Storelib turns on GIF search once it is set up. Pictures and videos work as usual.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2.5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search GIFs"
            aria-label="Search GIFs"
            autoFocus={!phone}
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-transparent bg-[#f3f4f6] pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2.5" data-gif-results="">
        {failed ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-[#6b7280]">GIFs did not load. Try again.</p>
        ) : gifs === null ? (
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="h-[110px] animate-pulse rounded-lg bg-[#f1f2f4]" />
            ))}
          </div>
        ) : gifs.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-[#6b7280]">No GIFs for that.</p>
        ) : (
          <div className="columns-2 gap-1.5 [&>*]:mb-1.5">
            {gifs.map((g) => (
              <button key={g.id} type="button" onClick={() => onPick(g)} aria-label={g.title || "GIF"} className="block w-full overflow-hidden rounded-lg bg-[#f1f2f4] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25" style={{ aspectRatio: `${g.w} / ${g.h}` }} data-gif="">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <p className="pt-2 text-center text-[11px] text-[#9ca3af]">Powered by GIPHY</p>
      </div>
    </div>
  )
}
