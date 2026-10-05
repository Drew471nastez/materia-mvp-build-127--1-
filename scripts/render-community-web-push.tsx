/**
 * The post join prompt (components/notifications/web-push-prompt.tsx), for
 * scripts/check-community-web-push.mjs: the real component above a plain
 * feed column on Storelib's page grey, as the community frame mounts it.
 * ?floating=1 draws the floating variant over the page's foot instead;
 * ?old=1 is a member who joined long ago.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { WebPushPrompt } from "@/components/notifications/web-push-prompt"

const q = new URLSearchParams(location.search)
const floating = q.get("floating") === "1"
const joinedAt = q.get("old") === "1" ? new Date(Date.now() - 40 * 86_400_000).toISOString() : new Date(Date.now() - 60_000).toISOString()

function Post({ i }: { i: number }) {
  return (
    <article className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-post={i}>
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-full bg-[#e5e7eb]" />
        <div>
          <p className="text-[14px] font-medium text-[#1a1a2e]">Member {i + 1}</p>
          <p className="text-[12px] text-[#6b7280]">{i + 2}h</p>
        </div>
      </div>
      <p className="mt-3 text-[14px] leading-[1.5] text-[#374151]">A roll of Portra 400 from the weekend walk, scanned at home. Notes on the exposure inside.</p>
    </article>
  )
}

function Page() {
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <main className="mx-auto max-w-[680px] px-4 py-6">
        <h1 className="mb-4 text-[22px] font-bold text-[#1a1a2e]">Film Loft</h1>
        {floating ? null : <WebPushPrompt communityName="Film Loft" joinedAt={joinedAt} className="mb-4" />}
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Post key={i} i={i} />
          ))}
        </div>
      </main>
      {floating ? <WebPushPrompt communityName="Film Loft" joinedAt={joinedAt} placement="floating" bottom={24} /> : null}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
