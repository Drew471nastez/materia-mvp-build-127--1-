import { NextRequest, NextResponse } from "next/server"

// AI-powered SEO description generator
// Uses intelligent text analysis to create optimized meta descriptions

export async function POST(request: NextRequest) {
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

    // Extract key information for SEO
    const seoDescription = generateSmartSeoDescription(cleanText, title || '')

    return NextResponse.json({ seoDescription })
  } catch (error) {
    console.error("SEO generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate SEO description" },
      { status: 500 }
    )
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

  // Start with title context if available
  if (title && title.length > 3) {
    const titleWords = title.split(' ').slice(0, 3).join(' ')
    if (!bestSentences[0]?.sentence.toLowerCase().includes(titleWords.toLowerCase())) {
      // Don't add title prefix if the first sentence already mentions it
    }
  }

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
