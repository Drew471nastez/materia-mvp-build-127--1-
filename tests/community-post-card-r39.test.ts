/**
 * A post sent in a message, drawn (round 39): components/community/member/
 * chat-post-card.tsx rendered to markup, for a reader who may see the post
 * and for one who may not.
 *
 *   AVAILABLE   one link to the post, its author, its title, two lines of it
 *               and its first picture; nothing else is a link
 *   NOT         "Post not available" and nothing of the post: no title, no
 *               words, no picture, no link
 *   MINE        the card on the sender's dark bubble keeps light text
 *
 * Run with: npx tsx tests/community-post-card-r39.test.ts
 */
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { sharedPostCard } from "@/lib/communities/chat-people"
import { ChatPostCard } from "@/components/community/member/chat-post-card"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}

const ID = "00000000-0000-4000-a000-000000000201"
const card = sharedPostCard({
  postId: ID,
  visible: true,
  title: "Dovetail jig",
  bodyText: "How I cut the tails with a cheap dozuki, step by step.",
  image: "https://placeholder.supabase.co/storage/v1/object/public/community/jig.jpg",
  author: { name: "Dan Wu", avatarUrl: null },
  href: "/community/club/post/dovetail-jig-00000000",
  space: "General",
})
const gone = sharedPostCard({ postId: ID, visible: false, title: "Members only plan", bodyText: "The secret schedule", image: "https://x/y.jpg", author: { name: "Olivia", avatarUrl: null }, href: "/community/club/post/x", space: "Inner" })

console.log("\nThe card a reader who may see it reads")
{
  const html = renderToStaticMarkup(React.createElement(ChatPostCard, { post: card, mine: false }))
  check("one link, to the post", (html.match(/<a /g) ?? []).length === 1 && html.includes('href="/community/club/post/dovetail-jig-00000000"'), html)
  check("its author, its title and its words", html.includes("Dan Wu") && html.includes("Dovetail jig") && html.includes("cheap dozuki"))
  check("its first picture, small, beside the words", /<img [^>]*src="https:\/\/placeholder\.supabase\.co\/storage\/v1\/object\/public\/community\/jig\.jpg"/.test(html) && /h-14 w-14/.test(html))
  check("two lines at most of each", (html.match(/line-clamp-2/g) ?? []).length === 2)
  const mine = renderToStaticMarkup(React.createElement(ChatPostCard, { post: card, mine: true }))
  check("on the sender's own dark bubble the words stay light", /text-white/.test(mine) && !/text-\[#1a1a2e\]/.test(mine))
  const untitled = renderToStaticMarkup(React.createElement(ChatPostCard, { post: { ...card, title: null } as never, mine: false }))
  check("a post with no title leads with its words", untitled.includes("cheap dozuki") && (untitled.match(/line-clamp-2/g) ?? []).length === 1)
}

console.log("\nThe card a reader who may not see it reads")
{
  const html = renderToStaticMarkup(React.createElement(ChatPostCard, { post: gone, mine: false }))
  check("Post not available", html.includes("Post not available"))
  check("and nothing of the post: no title, words, picture, author or link", !/Members only|secret|<img|<a |Olivia|href=/.test(html), html)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
