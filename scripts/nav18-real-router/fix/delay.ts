import { cookies } from "next/headers"
/* Server time per piece, from a cookie the probe sets (ms), else the default. */
export async function serverDelay(name: string, fallback: number) {
  let ms = fallback
  try { const v = (await cookies()).get(`d_${name}`)?.value; if (v) ms = Number(v) } catch {}
  if (ms > 0) await new Promise((r) => setTimeout(r, ms))
}
