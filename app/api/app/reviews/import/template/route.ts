import { IMPORT_TEMPLATE_CSV } from "@/lib/reviews/import-csv"

export const dynamic = "force-static"

/** Reviews › Import › Download the template: every column the import reads, with two example rows (lib/reviews/import-csv.ts). */
export function GET() {
  return new Response(`﻿${IMPORT_TEMPLATE_CSV}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="storelib-reviews-template.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  })
}
