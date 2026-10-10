import { topBar } from "../../../../../../fix/data"
export async function GET() { return new Response(JSON.stringify({ topBar: topBar() }), { headers: { "Content-Type": "application/json" } }) }
