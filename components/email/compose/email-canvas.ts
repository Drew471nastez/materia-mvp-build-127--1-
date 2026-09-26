/**
 * The email's own type, for writing in: the sizes, weights, colours and
 * spaces lib/email-campaigns/rich.ts sends each element with, so what is
 * written in the composer looks like what arrives. One place, read by the
 * text blocks (./text-block.tsx) and the blocks around them
 * (./block-editor.tsx).
 *
 *   paragraph    16/26 #1f2937, 16px under it
 *   heading      22/30 bold #111827, 8px over and 12px under
 *   subheading   18/26 semibold #111827
 *   list         24px in, 6px between items
 *   quote        a 3px rule on the left, #4b5563
 *   link         the brand's link colour (--email-link), underlined
 *   rule         1px #e5e7eb, 24px either side
 */
export { FONT as EMAIL_FONT } from "@/lib/email-campaigns/rich"

export const EMAIL_TYPE = [
  "text-[16px] leading-[26px] text-[#1f2937]",
  "[&_p]:mb-4 [&_p]:mt-0",
  "[&_h1]:mb-3 [&_h1]:mt-2 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-[30px] [&_h1]:text-[#111827]",
  "[&_h2]:mb-3 [&_h2]:mt-2 [&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:leading-[30px] [&_h2]:text-[#111827]",
  "[&_h3]:mb-2.5 [&_h3]:mt-1 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:leading-[26px] [&_h3]:text-[#111827]",
  "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5 [&_li]:pl-1 [&_li>p]:mb-0",
  "[&_blockquote]:mb-4 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#e5e7eb] [&_blockquote]:py-0.5 [&_blockquote]:pl-4 [&_blockquote]:text-[#4b5563] [&_blockquote>p]:mb-2",
  "[&_a]:text-[var(--email-link,#111827)] [&_a]:underline",
  "[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#e5e7eb]",
  "[&_strong]:font-bold [&_b]:font-bold",
].join(" ")
