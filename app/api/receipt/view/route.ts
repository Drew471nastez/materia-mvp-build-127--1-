import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")
    const receiptToken = searchParams.get("receiptToken")

    if (!orderId || !receiptToken) {
      return new NextResponse("Missing orderId or receiptToken", { status: 400 })
    }

    const admin = createAdminClient()

    // Verify the order and token match
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select(`*, product:products(*)`)
      .eq("id", orderId)
      .eq("receipt_token", receiptToken)
      .single()

    if (orderError || !order) {
      return new NextResponse("Invalid order or token", { status: 404 })
    }

    const product = order.product
    const orderDate = new Date(order.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const total = order.amount_cents === 0 ? "Free" : `$${(order.amount_cents / 100).toFixed(2)}`

    // Return a simple HTML receipt page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt #${order.id.slice(0, 8)} - Materia</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 40px 20px; }
    .receipt { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: #000; color: white; padding: 24px; text-align: center; }
    .header h1 { font-size: 20px; font-weight: 600; }
    .content { padding: 32px; }
    .order-info { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee; }
    .order-info div { text-align: center; }
    .order-info label { font-size: 12px; color: #666; display: block; margin-bottom: 4px; }
    .order-info span { font-size: 14px; font-weight: 500; }
    .product { display: flex; gap: 16px; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee; }
    .product img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; background: #f5f5f5; }
    .product-info h2 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .product-info p { color: #666; font-size: 14px; }
    .total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 600; }
    .footer { text-align: center; padding: 24px; background: #f9fafb; color: #666; font-size: 12px; }
    @media print { body { background: white; padding: 0; } .receipt { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>Materia Receipt</h1>
    </div>
    <div class="content">
      <div class="order-info">
        <div>
          <label>Order ID</label>
          <span>#${order.id.slice(0, 8)}</span>
        </div>
        <div>
          <label>Date</label>
          <span>${orderDate}</span>
        </div>
        <div>
          <label>Email</label>
          <span>${order.buyer_email}</span>
        </div>
      </div>
      
      <div class="product">
        ${product?.thumbnail_url ? `<img src="${product.thumbnail_url}" alt="${product.title}" />` : '<div style="width:80px;height:80px;background:#f5f5f5;border-radius:8px;"></div>'}
        <div class="product-info">
          <h2>${product?.title || "Digital Product"}</h2>
          <p>Digital download</p>
        </div>
      </div>
      
      <div class="total">
        <span>Total</span>
        <span>${total}</span>
      </div>
    </div>
    <div class="footer">
      Thank you for your purchase!<br/>
      Questions? Contact support@storelib.com
    </div>
  </div>
</body>
</html>
    `

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error) {
    console.error("Error viewing receipt:", error)
    return new NextResponse("Failed to load receipt", { status: 500 })
  }
}
