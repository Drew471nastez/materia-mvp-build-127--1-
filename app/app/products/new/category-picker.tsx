"use client"

/**
 * ===========================================================================
 *  THE CATEGORY PICKER
 * ===========================================================================
 * "Not a great UI. Smoother, cleaner, easy to navigate, not so complex. I
 * don't like those dots. I don't like the X button in the bottom sheet."
 *
 * Shaped like Shopify's own category picker: a search field on top, then the
 * groups as plain rows that open into their categories, and one tap on a
 * category chooses it and closes. The chosen one carries a check, as a
 * Polaris ChoiceList does. No dots, no emoji, no badge, and nothing to press
 * to confirm: choosing is the confirmation.
 *
 * On a phone it is the shared sheet (components/ui/bottom-sheet.tsx), so it
 * opens, drags and closes like every sheet in /app: the grabber, a pull down
 * or a tap outside close it, and there is no X. It has a fixed height, so
 * opening a group or typing a search never moves its top edge, and it sits
 * on the keyboard while the search is typed into.
 *
 * On a computer it is a popover under the field, with the search focused and
 * the arrow keys moving through the rows.
 *
 * 48px rows on a phone, 36px on a computer.
 */

import React, { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

export interface CategoryGroup {
  name: string
  categories: string[]
}

/* The groups and their categories, as the editor has always offered them. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: "Design & Creative",
    categories: [
      "Digital Art", "Graphics", "Illustrations", "Vector Art", "Icons", "Fonts",
      "Clip Art", "Photoshop Actions", "Photoshop Brushes", "Lightroom Presets", "Lightroom Profiles", "Procreate Brushes",
      "Procreate Stamps", "Design Systems", "UI Kits", "Wireframes", "Prototypes", "Brand Kits",
      "Brand Guidelines", "Logo Templates", "Logo Packs", "Pattern Designs", "Textures", "Backgrounds",
      "Overlays", "Filters", "Color Palettes", "Gradients", "Figma Templates", "Sketch Templates",
      "Adobe XD Templates", "Canva Templates",
    ],
  },
  {
    name: "VFX & Motion",
    categories: [
      "Motion Graphics", "After Effects Templates", "Premiere Pro Templates", "DaVinci Resolve Templates", "Transitions", "Lower Thirds",
      "Intros", "Outros", "Video Templates", "Video LUTs", "Visual Effects", "VFX Presets",
      "Animation Templates", "Animated Elements", "Title Templates", "Green Screen Assets", "Particle Effects", "Light Leaks",
      "Glitch Effects", "Cinematic LUTs",
    ],
  },
  {
    name: "Audio & Music",
    categories: [
      "Sample Packs", "Drum Kits", "Loops", "MIDI Files", "Presets", "Synth Presets",
      "Vocal Samples", "Beats", "Instrumentals", "Sound Effects", "Music Tracks", "Audio Files",
      "Sound Libraries", "Ableton Templates", "FL Studio Templates", "Logic Pro Templates", "Podcasts", "Audiobooks",
      "Podcast Templates", "Podcast Artwork", "Podcast Intros", "Audio Branding", "Voice Overs", "Jingles",
      "Ringtones", "Ambient Sounds",
    ],
  },
  {
    name: "Software & Development",
    categories: [
      "Software", "Plugins", "Extensions", "Code Snippets", "Scripts", "APIs",
      "SDKs", "Libraries", "Frameworks", "WordPress Themes", "WordPress Plugins", "Shopify Themes",
      "Shopify Apps", "Web Apps", "SaaS Products", "Mobile Apps", "Desktop Apps", "Source Code",
      "Databases", "Development Tools", "CLI Tools", "DevOps Tools", "Bots", "Automation Scripts",
      "Browser Extensions", "App Templates",
    ],
  },
  {
    name: "AI & Automation",
    categories: [
      "AI Tools", "AI Assistants", "AI Agents", "AI Models", "Machine Learning", "Datasets",
      "Algorithms", "GPT Templates", "ChatGPT Prompts", "Claude Prompts", "Gemini Prompts", "AI Prompts",
      "Midjourney Prompts", "Stable Diffusion Prompts", "DALL-E Prompts", "AI Workflows", "Automation Workflows", "Zapier Templates",
      "Make Templates", "n8n Workflows", "AI Art Generators", "AI Voice Tools", "Text to Speech", "Prompt Packs",
    ],
  },
  {
    name: "Gaming & Esports",
    categories: [
      "Games", "Game Assets", "Unity Assets", "Unreal Assets", "Sprites", "Tilesets",
      "Gaming Guides", "Strategy Guides", "Walkthroughs", "Cheat Codes", "Modding Tools", "Game Mods",
      "Esports Coaching", "Gaming Overlays", "Stream Overlays", "Twitch Panels", "Twitch Emotes", "Discord Assets",
      "Discord Bots", "Gaming Avatars", "Gaming Banners", "Gaming Templates", "Controller Skins", "Character Models",
      "Game UI Kits",
    ],
  },
  {
    name: "3D & Assets",
    categories: [
      "3D Assets", "3D Models", "3D Printing Files", "3D Characters", "3D Environments", "3D Props",
      "3D Textures", "3D Materials", "Blender Assets", "Maya Assets", "Cinema 4D Assets", "HDRI Images",
      "PBR Materials", "CAD Files", "Architectural Models",
    ],
  },
  {
    name: "Photography & Video",
    categories: [
      "Stock Photos", "Stock Videos", "Photo Presets", "Thumbnails", "YouTube Templates", "Instagram Reels Templates",
      "TikTok Templates", "Travel Photography", "Food Photography Presets", "Portrait Presets", "Landscape Presets", "Film Emulation",
      "Photo Overlays", "Photo Frames",
    ],
  },
  {
    name: "Templates & Mockups",
    categories: [
      "Templates", "Mockups", "Presentations", "Resume Templates", "Business Cards", "Flyers",
      "Posters", "Brochures", "Social Media Templates", "Website Templates", "Mobile App Templates", "Email Templates",
      "Newsletter Designs", "Notion Templates", "Notion Dashboards", "Notion Databases", "Notion Wikis", "Second Brain Templates",
      "PARA Templates", "GTD Templates",
    ],
  },
  {
    name: "Education & Courses",
    categories: [
      "Online Courses", "Video Courses", "Tutorials", "Workshops", "Masterclasses", "Video Lessons",
      "Webinars", "Educational Content", "Study Guides", "Cheat Sheets", "Flashcards", "Quizzes",
      "Language Learning", "Test Prep", "Certifications", "Training Materials", "Curriculum", "Homeschool Resources",
      "Learning Materials", "Educational Games",
    ],
  },
  {
    name: "Business & Marketing",
    categories: [
      "Business Plans", "Marketing Plans", "Sales Funnels", "Marketing Funnels", "Landing Pages", "Lead Magnets",
      "Case Studies", "White Papers", "Pitch Decks", "Reports", "Analytics Templates", "CRM Templates",
      "Project Management", "SOPs", "Spreadsheets", "Financial Models", "Invoices", "Contracts",
      "Legal Templates", "NDA Templates", "Proposal Templates", "Quotation Templates", "Business Proposals", "Business Model Canvas",
      "Lean Canvas",
    ],
  },
  {
    name: "Startup & Entrepreneurship",
    categories: [
      "Startup Templates", "Investor Decks", "Fundraising Guides", "Startup Playbooks", "Growth Hacking", "MVP Templates",
      "Product Roadmaps", "OKR Templates", "Venture Capital", "Angel Investing", "Pitch Templates", "Startup Guides",
    ],
  },
  {
    name: "Ecommerce & Sales",
    categories: [
      "Ecommerce Templates", "Dropshipping Guides", "Product Research", "Supplier Lists", "Store Setups", "Amazon FBA Guides",
      "Etsy Templates", "Gumroad Templates", "Product Descriptions", "Pricing Strategies", "Sales Playbooks", "CRM Setups",
      "HubSpot Templates", "Salesforce Templates", "Pipeline Templates", "Closing Scripts",
    ],
  },
  {
    name: "Writing & Content",
    categories: [
      "Ebooks", "Writing Templates", "Content Calendars", "Blog Posts", "Articles", "Ghostwriting",
      "Copywriting Templates", "Ad Copy", "Sales Scripts", "Email Sequences", "Cold Email Templates", "Newsletter Templates",
      "Documentation", "Guides", "Manuals",
    ],
  },
  {
    name: "Social Media",
    categories: [
      "Instagram Templates", "Pinterest Templates", "LinkedIn Posts", "Twitter Templates", "Social Media Planners", "Content Planners",
      "Hashtag Guides", "Bio Templates", "Link in Bio Templates", "Creator Toolkits", "Sponsorship Templates", "Media Kits",
      "Brand Deal Templates", "UGC Templates", "Influencer Contracts", "Rate Cards",
    ],
  },
  {
    name: "Email Marketing",
    categories: [
      "Email Funnels", "Drip Campaigns", "Welcome Sequences", "Launch Sequences", "Re-engagement Emails", "Substack Templates",
      "ConvertKit Templates", "Mailchimp Templates", "Beehiiv Templates", "Newsletter Growth", "Cold Outreach Templates",
    ],
  },
  {
    name: "No-Code & Tools",
    categories: [
      "No-Code Templates", "Bubble Templates", "Webflow Templates", "Airtable Bases", "Glide Apps", "Softr Templates",
      "Adalo Templates", "FlutterFlow Templates", "Retool Templates", "Xano Templates",
    ],
  },
  {
    name: "Finance & Investing",
    categories: [
      "Investment Templates", "Stock Analysis", "Portfolio Trackers", "Crypto Trackers", "Tax Templates", "Expense Trackers",
      "Savings Planners", "Debt Payoff", "Financial Literacy", "Money Guides", "Trading Strategies", "DeFi Guides",
      "Crypto Guides", "NFT Art", "NFT Collections",
    ],
  },
  {
    name: "Health & Fitness",
    categories: [
      "Workout Plans", "Meal Plans", "Nutrition Guides", "Recipe Books", "Diet Plans", "Fitness Programs",
      "Meditation Guides", "Wellness Journals", "Health Trackers", "Yoga Guides",
    ],
  },
  {
    name: "Personal Development",
    categories: [
      "Planners", "Journals", "Trackers", "Goal Setting", "Habit Trackers", "Budget Planners",
      "Mindmaps", "Note Taking", "Productivity Systems", "Life Coaching", "Self-Help Guides", "Affirmation Cards",
      "Vision Boards", "Gratitude Journals", "Daily Planners", "Weekly Reviews",
    ],
  },
  {
    name: "Spirituality & Mindfulness",
    categories: [
      "Tarot Guides", "Astrology Charts", "Horoscope Templates", "Crystal Guides", "Energy Healing", "Chakra Guides",
      "Manifestation Guides", "Law of Attraction", "Spiritual Journals", "Prayer Guides",
    ],
  },
  {
    name: "Art & Crafts",
    categories: [
      "Printables", "Coloring Pages", "Patterns", "SVG Files", "Cut Files", "Cricut Designs",
      "Embroidery Designs", "Knitting Patterns", "Sewing Patterns", "Craft Templates", "Stickers", "Labels",
      "Invitations", "Greeting Cards", "Wall Art", "Digital Planners",
    ],
  },
  {
    name: "Print on Demand",
    categories: [
      "T-Shirt Designs", "Mug Designs", "Phone Case Designs", "Poster Designs", "Tote Bag Designs", "Sticker Designs",
      "Print Designs", "Apparel Graphics", "Merchandise Templates",
    ],
  },
  {
    name: "Fashion & Beauty",
    categories: [
      "Fashion Lookbooks", "Outfit Guides", "Style Guides", "Fashion Illustrations", "Fashion Sketches", "Makeup Tutorials",
      "Beauty Guides", "Skincare Routines", "Hair Care Guides", "Nail Art Designs", "Fashion Presets", "Beauty Presets",
      "Fashion Templates", "Lookbook Templates",
    ],
  },
  {
    name: "Real Estate",
    categories: [
      "Real Estate Flyers", "Property Listings", "Real Estate Templates", "Property Management", "Rental Agreements", "Real Estate Guides",
      "Investment Guides", "Property Analysis", "Real Estate Marketing", "Open House Templates",
    ],
  },
  {
    name: "Events & Weddings",
    categories: [
      "Wedding Templates", "Wedding Invitations", "Save the Date", "Event Flyers", "Party Invitations", "Event Planning",
      "Wedding Planning", "Event Checklists", "Seating Charts", "Menu Templates", "RSVP Templates", "Thank You Cards",
      "Event Programs", "Wedding Programs",
    ],
  },
  {
    name: "Food & Cooking",
    categories: [
      "Cookbook", "Recipe Cards", "Meal Prep Guides", "Cooking Tutorials", "Baking Recipes", "Restaurant Menus",
      "Food Blogs", "Cocktail Recipes", "Smoothie Recipes",
    ],
  },
  {
    name: "Travel & Adventure",
    categories: [
      "Travel Guides", "Itinerary Templates", "Packing Lists", "Travel Journals", "Destination Guides", "Travel Presets",
      "Adventure Guides", "Hiking Guides", "Camping Guides",
    ],
  },
  {
    name: "Parenting & Family",
    categories: [
      "Parenting Guides", "Baby Planners", "Pregnancy Journals", "Family Budgets", "Chore Charts", "Kids Activities",
      "Childcare Templates",
    ],
  },
  {
    name: "Home & Interior",
    categories: [
      "Interior Design", "Home Decor", "Room Planners", "Floor Plans", "Furniture Layouts", "DIY Home Projects",
      "Organization Templates", "Cleaning Checklists", "Home Inventory", "Renovation Guides",
    ],
  },
  {
    name: "Career & Job Search",
    categories: [
      "Cover Letters", "Portfolio Templates", "LinkedIn Templates", "Interview Prep", "Career Guides", "Salary Negotiation",
      "Job Search Trackers", "Networking Templates", "Personal Branding", "Career Coaching",
    ],
  },
  {
    name: "Agency & Freelance",
    categories: [
      "Agency Templates", "Client Onboarding", "Project Briefs", "Scope of Work", "Retainer Agreements", "Freelance Contracts",
      "Rate Calculators", "Time Trackers", "Client Portals", "Service Packages",
    ],
  },
  {
    name: "Community & Membership",
    categories: [
      "Community Templates", "Membership Sites", "Circle Templates", "Skool Templates", "Mighty Networks", "Community Playbooks",
      "Engagement Strategies", "Onboarding Sequences", "Welcome Emails", "Community Guidelines",
    ],
  },
  {
    name: "Data & Analytics",
    categories: [
      "Dashboard Templates", "Data Visualization", "Excel Templates", "Google Sheets", "Power BI Templates", "Tableau Templates",
      "SQL Queries", "Data Analysis", "KPI Trackers", "Reporting Templates",
    ],
  },
  {
    name: "Pet & Animals",
    categories: [
      "Pet Care Guides", "Dog Training", "Cat Care", "Pet Health", "Animal Illustrations", "Pet Journals",
      "Vet Records", "Pet Planners",
    ],
  },
  {
    name: "Other",
    categories: [
      "Memberships", "Subscriptions", "Coaching", "Consulting", "Services", "Freelance Services",
      "Bundles", "Collections", "Preorders", "Gift Cards", "Licenses", "Other",
    ],
  },
]

/** Which group a category is in. */
const GROUP_OF = new Map(CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => [c, g.name] as const)))
const ALL = [...GROUP_OF.keys()].sort((a, b) => a.localeCompare(b))

export const groupOfCategory = (category: string | null): string | null => (category ? GROUP_OF.get(category) ?? null : null)

/** Matches first where a word starts with the query, then anywhere, each alphabetical. */
function search(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const inside: string[] = []
  for (const c of ALL) {
    const l = c.toLowerCase()
    if (l.startsWith(q) || l.includes(` ${q}`)) starts.push(c)
    else if (l.includes(q) || (GROUP_OF.get(c) ?? "").toLowerCase().includes(q)) inside.push(c)
  }
  return [...starts, ...inside]
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

type Level = { group: string | null; query: string }

/**
 * The rows: groups, a group's categories, or what a search found. `phone`
 * sets the size: 48px rows and 16px text on a phone, 36px and 14px on a
 * computer.
 */
function CategoryRows({
  value,
  suggested,
  level,
  phone,
  onGroup,
  onBack,
  onPick,
}: {
  value: string | null
  suggested: string | null
  level: Level
  phone: boolean
  onGroup: (group: string) => void
  onBack: () => void
  onPick: (category: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const levelKey = level.query.trim() ? "search" : level.group ?? ""
  const prevKey = useRef(levelKey)

  /* Into a group slides in from the right, back from the left; a search just appears. */
  useLayoutEffect(() => {
    const from = prevKey.current
    prevKey.current = levelKey
    if (from === levelKey) return
    const el = listRef.current
    if (!el || typeof el.animate !== "function" || reducedMotion()) return
    const dx = levelKey === "search" || from === "search" ? 0 : levelKey ? 16 : -16
    el.animate(
      [{ opacity: 0, transform: `translate3d(${dx}px, 0, 0)` }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
      { duration: 200, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    )
  }, [levelKey])

  const row = phone
    ? "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] leading-5 active:bg-[#f1f2f4]"
    : "flex min-h-[36px] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] leading-5 hover:bg-[#f1f2f4] focus-visible:bg-[#f1f2f4]"
  const common = "cursor-pointer select-none text-[#1a1a2e] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]"
  const label = phone ? "px-4 pb-1 pt-3 text-[13px] font-medium text-[#6b7280]" : "px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#6b7280]"

  const option = (category: string, detail?: string | null) => {
    const on = category === value
    return (
      <button
        key={category}
        type="button"
        data-category-row=""
        data-category-option={category}
        aria-current={on ? "true" : undefined}
        onClick={() => onPick(category)}
        className={cn(row, common, on && "font-medium")}
      >
        <span className="min-w-0 flex-1 truncate">{category}</span>
        {detail ? <span className="max-w-[45%] shrink-0 truncate text-[13px] text-[#9ca3af]">{detail}</span> : null}
        <Check aria-hidden className={cn("h-4 w-4 shrink-0 text-[#1a1a2e]", on ? "opacity-100" : "opacity-0")} strokeWidth={2.5} />
      </button>
    )
  }

  let body: React.ReactNode
  if (level.query.trim()) {
    const found = search(level.query)
    body = found.length ? (
      <div>{found.map((c) => option(c, GROUP_OF.get(c)))}</div>
    ) : (
      <div>
        <p className={cn(label, "pt-4")}>No category matches “{level.query.trim()}”</p>
        {option("Other")}
      </div>
    )
  } else if (level.group) {
    const group = CATEGORY_GROUPS.find((g) => g.name === level.group)
    body = (
      <div>
        <button type="button" data-category-row="" data-category-back="" onClick={onBack} className={cn(row, common, "font-semibold", phone ? "pl-2" : "pl-1")}>
          <ChevronLeft aria-hidden className="h-5 w-5 shrink-0 text-[#6b7280]" />
          <span className="min-w-0 flex-1 truncate">{level.group}</span>
        </button>
        <div>{group?.categories.map((c) => option(c))}</div>
      </div>
    )
  } else {
    const current = groupOfCategory(value)
    body = (
      <div>
        {suggested && suggested !== value ? (
          <>
            <p className={label}>Suggested</p>
            {option(suggested, GROUP_OF.get(suggested))}
          </>
        ) : null}
        <p className={label}>All categories</p>
        <div>
          {CATEGORY_GROUPS.map((g) => (
            <button key={g.name} type="button" data-category-row="" data-category-group={g.name} onClick={() => onGroup(g.name)} className={cn(row, common)}>
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {current === g.name ? <span className="max-w-[45%] shrink-0 truncate text-[13px] text-[#6b7280]">{value}</span> : null}
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      data-category-list=""
      className={phone ? "pb-2" : "p-1.5"}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
        const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-category-row]") ?? [])]
        const i = rows.indexOf(document.activeElement as HTMLElement)
        if (i < 0) return
        e.preventDefault()
        rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus()
      }}
    >
      {body}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  phone,
  autoFocus,
  onEnter,
  onDown,
}: {
  value: string
  onChange: (next: string) => void
  phone: boolean
  autoFocus?: boolean
  onEnter?: () => void
  onDown?: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <label className={cn("flex cursor-text items-center gap-2 bg-[#f1f2f4] px-3", phone ? "h-11 rounded-[10px]" : "h-9 rounded-lg")}>
      <Search aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
      <input
        ref={ref}
        type="search"
        data-category-search=""
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="Search categories"
        placeholder="Search categories"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onEnter?.() }
          if (e.key === "ArrowDown") { e.preventDefault(); onDown?.() }
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden",
          phone ? "text-[16px]" : "text-[14px]",
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { onChange(""); ref.current?.focus() }}
          className="relative -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6b7280] outline-none after:absolute after:-inset-2 after:content-[''] hover:text-[#1a1a2e]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  )
}

export function CategoryPicker({
  value,
  onChange,
  suggested,
  isPhone,
}: {
  value: string | null
  onChange: (category: string) => void
  /** The editor's guess from the title and description, offered first. */
  suggested: string | null
  /** The editor's own reading of the width (under 640px), so the two agree. */
  isPhone: boolean
}) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<Level>({ group: null, query: "" })
  const rowsRef = useRef<HTMLDivElement>(null)
  const group = groupOfCategory(value)

  const show = (next: boolean) => {
    setOpen(next)
    if (next) setLevel({ group: null, query: "" })
  }
  const pick = (category: string) => {
    if (isPhone) hapticTap("soft")
    onChange(category)
    setOpen(false)
  }
  const levelKey = useMemo(() => (level.query.trim() ? `q:${level.query.trim()}` : `g:${level.group ?? ""}`), [level])
  /* A new level starts at its top (the phone sheet does this itself, from scrollKey). */
  useLayoutEffect(() => {
    if (rowsRef.current) rowsRef.current.scrollTop = 0
  }, [levelKey])

  const rows = (phone: boolean) => (
    <CategoryRows
      value={value}
      suggested={suggested}
      level={level}
      phone={phone}
      onGroup={(g) => setLevel({ group: g, query: "" })}
      onBack={() => setLevel({ group: null, query: "" })}
      onPick={pick}
    />
  )

  const trigger = (
    <button
      type="button"
      data-category-trigger=""
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={isPhone ? () => show(true) : undefined}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center gap-2 rounded-[10px] border border-[#d9dbe0] bg-white px-3 text-left text-[15px] outline-none transition-colors duration-100 hover:border-[#c4c7ce] focus-visible:border-[#1a1a2e] sm:h-10 sm:rounded-lg sm:text-[14px] [-webkit-tap-highlight-color:transparent]",
        open && "border-[#1a1a2e]",
      )}
    >
      {value ? (
        <>
          <span className="min-w-0 truncate text-[#1a1a2e]">{value}</span>
          {group ? <span className="min-w-0 flex-1 truncate text-[#9ca3af] max-sm:hidden">in {group}</span> : <span className="flex-1" />}
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[#9ca3af]">Choose a category</span>
      )}
      <ChevronDown aria-hidden className={cn("ml-auto h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-200 motion-reduce:transition-none", open && !isPhone && "rotate-180")} />
    </button>
  )

  if (isPhone) {
    return (
      <>
        {trigger}
        <BottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          label="Category"
          aboveKeyboard
          height="min(78dvh, 680px)"
          maxHeight="min(78dvh, 680px)"
          scrollKey={levelKey}
          header={
            <div data-category-sheet="" className="px-4 pb-2 pt-2">
              <p className="pb-3 text-[17px] font-semibold leading-6 text-[#1a1a2e]">Category</p>
              <SearchField value={level.query} onChange={(q) => setLevel({ group: null, query: q })} phone />
            </div>
          }
        >
          {rows(true)}
        </BottomSheet>
      </>
    )
  }

  /* The field's own width, 240px at least: from lg it sits in the editor's side column, near the window's right edge, where a wider list would be pushed off its left edge. */
  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={16}
        data-category-popover=""
        onOpenAutoFocus={(e) => {
          /* The search takes focus, not the first row. */
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("[data-category-search]")?.focus()
        }}
        className="flex w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[440px] flex-col overflow-hidden rounded-xl border border-[#e3e4e8] bg-white p-0 text-[#1a1a2e] shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)]"
        style={{ maxHeight: "min(340px, var(--radix-popover-content-available-height))" }}
      >
        <div className="shrink-0 border-b border-[#eef0f2] p-2">
          <SearchField
            value={level.query}
            onChange={(q) => setLevel({ group: null, query: q })}
            phone={false}
            onEnter={() => {
              const first = level.query.trim() ? search(level.query)[0] : null
              if (first) pick(first)
            }}
            onDown={() => rowsRef.current?.querySelector<HTMLElement>("[data-category-row]")?.focus()}
          />
        </div>
        <div ref={rowsRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows(false)}
        </div>
      </PopoverContent>
    </Popover>
  )
}
