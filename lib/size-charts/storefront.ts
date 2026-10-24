/**
 * ===========================================================================
 *  THE SIZE CHART A PRODUCT PAGE SHOWS, READ FOR THAT PRODUCT
 * ===========================================================================
 * One read for every product page, whoever draws it: Storelib's own product
 * section (lib/products/product-section-data.ts, live and in the builder's
 * canvas) and an imported Shopify theme's page (through the page facts,
 * lib/storelib-theme/compat/product-facts-server.ts). So switching the
 * product shown always switches the chart with it.
 *
 * The product's link says which chart; the chart is read only when it is
 * the same store's as the link, so a row pointing across stores draws
 * nothing. Before SQL part 283 has run neither table exists, and the page
 * simply has no chart: never an error.
 *
 * Takes the server's client from its caller, and imports nothing that is
 * server only, so the tests can hand it a stand-in.
 */
import { readSizeChart, type SizeChart } from "./model"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The chart for one product, or null: none chosen, the tables not there yet, or a read that failed. */
export async function sizeChartForProduct(db: Db, productId: string, creatorId?: string | null): Promise<SizeChart | null> {
  if (!productId) return null
  try {
    let link = db.from("product_size_charts").select("size_chart_id, creator_id").eq("product_id", productId)
    if (creatorId) link = link.eq("creator_id", creatorId)
    const { data: row, error } = await link.maybeSingle()
    if (error || !row?.size_chart_id) return null
    const { data: chart, error: chartError } = await db
      .from("size_charts")
      .select("name, unit, columns, rows, notes, image_url")
      .eq("id", row.size_chart_id)
      .eq("creator_id", row.creator_id)
      .maybeSingle()
    if (chartError || !chart) return null
    /* No id on what a visitor is handed: it is the chart's content, nothing else. */
    const read = readSizeChart(chart)
    if (!read) return null
    const { id: _id, ...shown } = read
    return shown
  } catch {
    return null
  }
}
