import { NextResponse } from "next/server"

export const runtime = "nodejs"

// Test endpoint to debug email sending
export async function GET(request: Request) {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ""
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ""
  const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net"
  const EMAIL_FROM = process.env.EMAIL_FROM || ""

  // Check configuration
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    return NextResponse.json({
      error: "Mailgun not configured",
      hasApiKey: !!MAILGUN_API_KEY,
      hasDomain: !!MAILGUN_DOMAIN,
      apiKeyLength: MAILGUN_API_KEY.length,
      domain: MAILGUN_DOMAIN,
    })
  }

  // Extract email from EMAIL_FROM
  const emailMatch = EMAIL_FROM.match(/<(.+)>/)
  const emailOnly = emailMatch ? emailMatch[1] : EMAIL_FROM
  const fromAddress = `Storelib <${emailOnly}>`

  // Test recipient - use a test email
  const testEmail = "test@example.com"

  const url = `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages`
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  console.log("[test-email] Testing Mailgun with:", {
    url,
    from: fromAddress,
    to: testEmail,
    domain: MAILGUN_DOMAIN,
    baseUrl: MAILGUN_BASE_URL,
    emailFrom: EMAIL_FROM,
  })

  try {
    // Build form data
    const formData = new FormData()
    formData.append("from", fromAddress)
    formData.append("to", testEmail)
    formData.append("subject", "Test Email from Storelib")
    formData.append("text", "This is a test email to verify Mailgun configuration.")

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authString}`,
      },
      body: formData,
    })

    const responseText = await response.text()
    let responseData: any = {}

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      response: responseData,
      config: {
        url,
        from: fromAddress,
        to: testEmail,
        domain: MAILGUN_DOMAIN,
        baseUrl: MAILGUN_BASE_URL,
        emailFrom: EMAIL_FROM,
        apiKeyPrefix: MAILGUN_API_KEY.substring(0, 10) + "...",
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Unknown error",
      stack: error.stack,
      config: {
        url,
        from: fromAddress,
        domain: MAILGUN_DOMAIN,
        baseUrl: MAILGUN_BASE_URL,
      },
    })
  }
}
