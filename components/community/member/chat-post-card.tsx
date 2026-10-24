"use client"

/**
 * A post sent in a message (round 39), as a compact card inside the bubble:
 * who wrote it, its title (or its first words), two lines of it, its first
 * picture on the right, and the whole card opens the post. The server drew
 * it for this reader (lib/communities/server/chat-post.ts); a reader who may
 * not see it is told "Post not available" and nothing else.
 */
import type { ChatSharedPost } from "@/lib/communities/chat-people"
import { MemberAvatar } from "./member-avatar"

export function ChatPostCard({ post, mine }: { post: ChatSharedPost; mine: boolean }) {
  const box = mine ? "bg-white/10" : "bg-white"
  if (!post.available) {
    return (
      <div className={`my-1 flex min-h-[44px] w-[min(280px,64vw)] items-center rounded-xl px-3 text-[13px] ${box} ${mine ? "text-white/70" : "text-[#6b7280]"}`} data-chat-post="gone">
        Post not available
      </div>
    )
  }
  const lead = post.title ?? post.excerpt
  const rest = post.title ? post.excerpt : ""
  return (
    <a
      href={post.href}
      className={`my-1 flex w-[min(280px,64vw)] gap-2.5 rounded-xl p-2.5 text-left no-underline outline-none transition-colors focus-visible:ring-2 ${mine ? "bg-white/10 hover:bg-white/15 focus-visible:ring-white/40" : "bg-white hover:bg-[#fafafa] focus-visible:ring-[#1a1a2e]/15"}`}
      data-chat-post={post.postId}
    >
      <span className="min-w-0 flex-1">
        {post.author ? (
          <span className={`flex items-center gap-1.5 text-[12px] leading-4 ${mine ? "text-white/70" : "text-[#6b7280]"}`}>
            <MemberAvatar src={post.author.avatarUrl} name={post.author.name} alt="" size={16} lazy />
            <span className="truncate">{post.author.name}</span>
          </span>
        ) : null}
        <span className={`mt-1 line-clamp-2 text-[13.5px] font-semibold leading-[18px] ${mine ? "text-white" : "text-[#1a1a2e]"}`}>{lead || "Post"}</span>
        {rest ? <span className={`mt-0.5 line-clamp-2 text-[12.5px] leading-[17px] ${mine ? "text-white/70" : "text-[#6b7280]"}`}>{rest}</span> : null}
      </span>
      {post.image ? <img src={post.image} alt="" loading="lazy" decoding="async" draggable={false} className="h-14 w-14 shrink-0 rounded-lg bg-[#e9eaee] object-cover" /> : null}
    </a>
  )
}
