"use client"

/** Small pieces the Learn builder and the program editor share. */
import * as React from "react"
import { cn } from "@/lib/utils"

export function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

export async function learnRequest<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string } }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin", cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; field?: string }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: "You look offline. Try again." } as T & { error?: string } }
  }
}

export function StatusPill({ status }: { status: "draft" | "published" }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[1px] text-[11.5px] font-medium", status === "published" ? "bg-[#e9f6ef] text-[#1d6b45]" : "bg-[#fdf3dc] text-[#8a5a00]")} data-status={status}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", status === "published" ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
      {status === "published" ? "Published" : "Draft"}
    </span>
  )
}

