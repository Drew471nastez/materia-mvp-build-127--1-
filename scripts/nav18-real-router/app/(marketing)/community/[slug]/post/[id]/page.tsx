import { serverDelay } from "../../../../../../fix/delay"
export const dynamic = "force-dynamic"
export default async function Post({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await serverDelay("post", 500)
  return (
    <article data-fix-post={id} className="mx-auto max-w-[680px] rounded-2xl border border-[#e4e7ec] bg-white p-5">
      <h1 className="text-[18px] font-semibold text-[#1a1a2e]">Post {id}</h1>
      <p className="mt-2 text-[14px] text-[#4b5563]">The post, drawn by the server after its own time.</p>
    </article>
  )
}
