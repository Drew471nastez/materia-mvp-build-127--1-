import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { creditNoteFilename, creditNoteFor, creditNotesForReceipt, renderCreditNotePdf } from "@/lib/checkout/credit-note"

export const runtime = "nodejs"

/**
 * GET /api/checkout/credit-note?token=<receipt token>&id=<credit note id>
 *
 * A refund's credit note as a PDF (lib/checkout/credit-note.ts), for the
 * buyer: the receipt token is the credential, as it is for the receipt and
 * its invoice, and the note must be one of that purchase's. Without `id`,
 * the latest. The refund email and the receipt page link here.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const token = q.get("token") || ""
  const id = q.get("id")
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || (id !== null && !/^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "Credit note not found." }, { status: 404 })
  }
  const limited = await rateLimit({
    bucket: "invoice",
    subjects: [addressSubject(request)],
    windows: [{ limit: 20, seconds: 600 }],
    message: "Too many documents just now. Try again in a few minutes.",
  })
  if (limited) return limited

  try {
    const db = createAdminClient()
    const { notes } = await creditNotesForReceipt(db, token)
    const note = id ? notes.find((n) => n.id === id) : notes[notes.length - 1]
    if (!note) return NextResponse.json({ error: "Credit note not found." }, { status: 404 })
    const data = await creditNoteFor(db, note)
    if (!data) return NextResponse.json({ error: "Credit note not found." }, { status: 404 })
    const pdf = await renderCreditNotePdf(data)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${creditNoteFilename(data)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("[credit-note]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "The credit note could not be made. Try again." }, { status: 500 })
  }
}
