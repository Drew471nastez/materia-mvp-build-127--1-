import { NextResponse } from "next/server"

export const runtime = "nodejs"

// Test endpoint to debug email sending
export async function GET(request: Request) {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ""
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ""
  const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net"
  const EMAIL_FROM = process.env.EMAIL_FROM || ""
  const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || ""

  // Check configuration
  const configCheck = {
    hasApiKey: !!MAILGUN_API_KEY,
    hasDomain: !!MAILGUN_DOMAIN,
    hasEmailFrom: !!EMAIL_FROM,
    hasEmailReplyTo: !!EMAIL_REPLY_TO,
    apiKeyLength: MAILGUN_API_KEY.length,
    apiKeyPrefix: MAILGUN_API_KEY.substring(0, 8) + "...",
    domain: MAILGUN_DOMAIN,
    baseUrl: MAILGUN_BASE_URL,
    emailFrom: EMAIL_FROM,
    emailReplyTo: EMAIL_REPLY_TO,
  }

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    return NextResponse.json({
      error: "Mailgun not configured",
      config: configCheck,
    })
  }

  // Extract email from EMAIL_FROM
  const emailMatch = EMAIL_FROM.match(/<(.+)>/)
  const emailOnly = emailMatch ? emailMatch[1] : EMAIL_FROM
  const fromAddress = `Storelib <${emailOnly}>`

  // Get test email from query param or use the EMAIL_REPLY_TO
  const url = new URL(request.url)
  const testEmail = url.searchParams.get("to") || EMAIL_REPLY_TO || "test@example.com"

  const apiUrl = `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages`
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  console.log("[test-email] Testing Mailgun with:", {
    apiUrl,
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
    formData.append("html", "<h1>Test Email</h1><p>This is a test email to verify Mailgun configuration.</p>")
    formData.append("text", "Test Email - This is a test email to verify Mailgun configuration.")

    const response = await fetch(apiUrl, {
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
      mailgunResponse: responseData,
      config: configCheck,
      requestDetails: {
        apiUrl,
        from: fromAddress,
        to: testEmail,
        extractedEmail: emailOnly,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Unknown error",
      stack: error.stack,
      config: configCheck,
      requestDetails: {
        apiUrl,
        from: fromAddress,
      },
    })
  }
}
