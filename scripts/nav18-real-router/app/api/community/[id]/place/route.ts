import { placeData } from "../../../../../fix/data"
export async function GET(req: Request) {
  const u = new URL(req.url); const key = u.searchParams.get("p") || ""
  await new Promise((r) => setTimeout(r, Number(u.searchParams.get("lat") || 300)))
  const data = placeData(key)
  return new Response(JSON.stringify(data ? { ok: true, key, data } : { ok: false, error: "not_found" }), { status: data ? 200 : 404, headers: { "Content-Type": "application/json" } })
}
