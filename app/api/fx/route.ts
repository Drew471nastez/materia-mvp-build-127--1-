import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK: Record<string, number> = {
  ron_usd: 0.22,
  eur_usd: 1.08,
  gbp_usd: 1.27,
};

export async function GET(req: NextRequest) {
  const from = (req.nextUrl.searchParams.get("from") || "usd").toLowerCase();
  const to = (req.nextUrl.searchParams.get("to") || "usd").toLowerCase();

  if (from === to) return NextResponse.json({ rate: 1 });

  try {
    const r = await fetch(
      `https://api.frankfurter.app/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`,
      {
        next: { revalidate: 3600 },
      },
    );
    const json = await r.json();
    const rate = json?.rates?.[to.toUpperCase()];
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return NextResponse.json({ rate });
    }
  } catch {
    // fallback below
  }

  return NextResponse.json({ rate: FALLBACK[`${from}_${to}`] || 1 });
}
