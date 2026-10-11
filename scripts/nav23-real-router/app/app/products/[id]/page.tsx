import { ProductEditor } from "../../../../fix/product-bits"
import { serverDelay } from "../../../../fix/delay"
export const dynamic = "force-dynamic"
export default async function P({ params }: { params: Promise<{ id: string }> }) { await serverDelay("product", 300); const { id } = await params; return <ProductEditor id={id} /> }
