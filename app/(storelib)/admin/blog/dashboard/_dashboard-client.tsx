"use client"

import * as React from "react"

import { Panel, Placeholder, Delayed } from "@/app/(storelib)/admin/_console/ui"

import { BlogBar } from "../_ui"

/**
 * The blog's readers: the last 5,000 views (blog_post_views), by country,
 * referrer, device and browser. One panel per list, divided by hairlines,
 * on the console's surface.
 */

type Item = { name: string; count: number }
interface Analytics {
  countries: Item[]
  devices: Item[]
  browsers: Item[]
  referrers: Item[]
  totalViews: number
}

const label = (panel: string, name: string) =>
  panel === "Referrers" ? name.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "Direct" : panel === "Countries" ? name : name.charAt(0).toUpperCase() + name.slice(1)

export default function BlogDashboardClient() {
  const [data, setData] = React.useState<Analytics | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/admin/blog/analytics")
      .then((r) => (r.status === 401 ? Promise.reject(new Error("Signed out")) : r.json()))
      .then((d) => (d && !d.error ? setData(d) : setError("The views could not be read.")))
      .catch((e: Error) => setError(e.message === "Signed out" ? "Signed out. Sign in again at /admin/blog." : "The views could not be read."))
  }, [])

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]">
      <BlogBar current="/admin/blog/dashboard" />
      <main className="mx-auto max-w-[1200px] space-y-3 px-4 pb-16 pt-6 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Traffic</h1>
          {data ? <p className="text-[12px] tabular-nums text-[#9b9ba6]">The last {data.totalViews.toLocaleString("en-US")} views</p> : null}
        </div>
        {error ? <p className="rounded-[10px] border border-[#f47067]/40 px-4 py-2.5 text-[13px] text-[#f47067]">{error}</p> : null}
        {!data && !error ? (
          <Delayed>
            <Placeholder rows={6} />
          </Delayed>
        ) : null}
        {data ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["Countries", data.countries],
                ["Referrers", data.referrers],
                ["Devices", data.devices],
                ["Browsers", data.browsers],
              ] as const
            ).map(([title, items]) => (
              <Panel key={title} title={title}>
                {items.length ? (
                  <ul className="divide-y divide-white/[0.06]">
                    {items.map((item) => (
                      <li key={item.name} className="relative flex items-center justify-between gap-3 px-4 py-2">
                        <span aria-hidden className="absolute inset-y-1 left-0 rounded-r-[3px] bg-white/[0.05]" style={{ width: `${Math.max(2, (item.count / items[0].count) * 100)}%` }} />
                        <span className="relative min-w-0 truncate text-[13px] text-[#c9c9d1]" title={item.name}>
                          {label(title, item.name)}
                        </span>
                        <span className="relative shrink-0 text-[13px] tabular-nums text-[#ededf0]">{item.count.toLocaleString("en-US")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-[13px] text-[#6b6b76]">No views yet.</p>
                )}
              </Panel>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  )
}
