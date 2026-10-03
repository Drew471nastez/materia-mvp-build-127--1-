import { NextRequest, NextResponse } from "next/server"

import { DEFAULT_MODEL } from "@/lib/sites/agent/models"
import { openai } from "@/lib/sites/agent/openai-provider"
import { failureKind } from "@/lib/sites/agent/plain-errors"
import { createClient } from "@/lib/supabase/server"

// A product's meta description: ChatGPT when it can, the extraction below
// when it cannot.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  try {
    const { description, title } = await request.json()

    if (!description || description.length < 10) {
      return NextResponse.json(
        { error: "Description is too short" },
        { status: 400 }
      )
    }

    // Clean HTML tags and normalize whitespace
    const cleanText = description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

    // Try AI generation first, fallback to smart extraction
    const seoDescription = await generateWithAI(cleanText, title || '')
      || generateSmartSeoDescription(cleanText, title || '')

    return NextResponse.json({ seoDescription })
  } catch (error) {
    console.error("SEO generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate SEO description" },
      { status: 500 }
    )
  }
}

/**
 * The model's description, or null for the fallback below. ChatGPT now, on
 * the agent's OpenAI client and everyday model, like the rest of Storelib AI
 * (lib/sites/agent/provider.ts): this used to call Claude with its own
 * request. Signed in only, since every call is paid for.
 */
async function generateWithAI(text: string, title: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[AI SEO] No OPENAI_API_KEY configured, using fallback")
    return null
  }

  try {
    const prompt = `Write the meta description search results show for a digital product.

Product title: ${title}
Product description: ${text}

Rules:
- At most 155 characters.
- Say what the buyer gets, in plain specific words.
- No quotes around it, no em dashes, and none of these words: unlock, elevate, seamless, powerful, effortless, supercharge, transform.
- Reply with the description only.`

    const response = await openai().responses.create(
      {
        model: DEFAULT_MODEL,
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: 1024,
      },
      { timeout: 20_000, maxRetries: 1 },
    )

    const responseText = response.output_text?.trim() || null

    if (responseText && responseText.length > 0 && responseText.length <= 160) {
      return responseText
    }

    // If response is too long, truncate smartly
    if (responseText && responseText.length > 160) {
      return truncateSmart(responseText, 155)
    }

    return null
  } catch (error) {
    /* Logged by kind and status, never shown: the fallback answers instead. */
    console.error("[AI SEO] OpenAI call failed:", failureKind(error) ?? "error", (error as { status?: unknown } | null)?.status ?? "")
    return null
  }
}

function generateSmartSeoDescription(text: string, title: string): string {
  // Extract key phrases and create an optimized description
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)

  // Keywords that indicate value propositions
  const valueKeywords = [
    'includes', 'features', 'get', 'receive', 'access', 'download',
    'instant', 'professional', 'premium', 'high-quality', 'ultimate',
    'complete', 'comprehensive', 'easy', 'perfect', 'best', 'top',
    'exclusive', 'unique', 'powerful', 'essential', 'must-have'
  ]

  // Keywords that indicate product benefits
  const benefitKeywords = [
    'save', 'boost', 'improve', 'enhance', 'level up', 'transform',
    'create', 'design', 'build', 'grow', 'increase', 'maximize',
    'streamline', 'simplify', 'automate', 'optimize'
  ]

  // Find the most relevant sentences
  let bestSentences: { sentence: string; score: number }[] = []

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase()
    let score = 0

    // Score based on value keywords
    for (const keyword of valueKeywords) {
      if (lowerSentence.includes(keyword)) {
        score += 2
      }
    }

    // Score based on benefit keywords
    for (const keyword of benefitKeywords) {
      if (lowerSentence.includes(keyword)) {
        score += 3
      }
    }

    // Bonus for sentences with numbers (often indicate value)
    if (/\d+/.test(sentence)) {
      score += 2
    }

    // Prefer shorter, punchier sentences
    if (sentence.length < 100) {
      score += 1
    }

    // Prefer sentences that start with action words
    const actionStarts = ['get', 'create', 'build', 'access', 'download', 'includes', 'features', 'this']
    for (const action of actionStarts) {
      if (lowerSentence.trim().startsWith(action)) {
        score += 2
        break
      }
    }

    bestSentences.push({ sentence: sentence.trim(), score })
  }

  // Sort by score descending
  bestSentences.sort((a, b) => b.score - a.score)

  // Build the SEO description
  let seoDescription = ''

  // Add best sentences until we hit ~155 characters
  for (const item of bestSentences) {
    const testDescription = seoDescription
      ? `${seoDescription} ${item.sentence}`
      : item.sentence

    if (testDescription.length <= 155) {
      seoDescription = testDescription
    } else if (!seoDescription) {
      // If first sentence is too long, truncate it smartly
      seoDescription = truncateSmart(item.sentence, 155)
      break
    } else {
      break
    }
  }

  // If we still have nothing, just use the first part of the text
  if (!seoDescription) {
    seoDescription = truncateSmart(text, 155)
  }

  // Ensure proper ending
  seoDescription = seoDescription.trim()
  if (!seoDescription.endsWith('.') && !seoDescription.endsWith('!') && !seoDescription.endsWith('?')) {
    if (seoDescription.length < 152) {
      seoDescription += '.'
    }
  }

  return seoDescription
}

function truncateSmart(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  // Try to cut at a sentence boundary
  const truncated = text.substring(0, maxLength)

  // Find last complete sentence
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  )

  if (lastSentenceEnd > maxLength * 0.6) {
    return truncated.substring(0, lastSentenceEnd + 1)
  }

  // Otherwise, cut at last word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated.substring(0, maxLength - 3) + '...'
}
