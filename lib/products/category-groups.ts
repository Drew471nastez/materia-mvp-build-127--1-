/**
 * ===========================================================================
 *  THE PRODUCT CATEGORIES
 * ===========================================================================
 * The groups and their categories, as the product editor has always offered
 * them. One list, read by the editor's field (app/app/products/new/
 * category-picker.tsx) and by the server route that suggests a category
 * (app/api/app/products/category-suggestion/route.ts), which may only ever
 * answer with a name from here.
 *
 * Plain data and plain functions, no React and no "use client", so a route
 * handler can import it.
 */

export interface CategoryGroup {
  name: string
  categories: string[]
}

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

/**
 * THINGS THAT SHIP. A physical product is offered these instead, grouped
 * the way a shop floor is (after Shopify's product taxonomy, its top levels
 * and the categories small stores sell most). No name here is also a
 * digital one, so a category says which kind it is.
 */
export const PHYSICAL_CATEGORY_GROUPS: CategoryGroup[] = [
  { name: "Apparel", categories: ["T-Shirts", "Hoodies & Sweatshirts", "Shirts & Tops", "Dresses", "Pants & Jeans", "Shorts", "Skirts", "Outerwear", "Activewear", "Swimwear", "Underwear & Socks", "Sleepwear", "Kids' Clothing", "Baby Clothing"] },
  { name: "Shoes", categories: ["Sneakers", "Boots", "Sandals", "Heels", "Flats", "Kids' Shoes", "Slippers"] },
  { name: "Accessories", categories: ["Bags & Backpacks", "Wallets", "Hats & Caps", "Scarves", "Belts", "Sunglasses", "Watches", "Phone Cases", "Keychains", "Hair Accessories"] },
  { name: "Jewelry", categories: ["Necklaces", "Rings", "Earrings", "Bracelets", "Anklets", "Jewelry Sets"] },
  { name: "Health & Beauty", categories: ["Skincare", "Makeup", "Hair Care", "Fragrance", "Bath & Body", "Nail Care", "Shaving & Grooming", "Vitamins & Supplements", "Oral Care"] },
  { name: "Home & Garden", categories: ["Decorative Accents", "Candles", "Wall Art & Prints", "Bedding", "Towels", "Rugs", "Lighting", "Furniture", "Storage & Organization", "Plants & Planters", "Garden Tools", "Cleaning Supplies"] },
  { name: "Kitchen & Dining", categories: ["Mugs & Cups", "Drinkware", "Cookware", "Bakeware", "Tableware", "Kitchen Tools", "Kitchen Textiles", "Food Storage"] },
  { name: "Food & Drink", categories: ["Coffee", "Tea", "Snacks", "Sweets & Chocolate", "Honey & Spreads", "Sauces & Condiments", "Spices", "Baked Goods", "Beverages", "Wine & Spirits", "Gift Baskets"] },
  { name: "Arts & Crafts", categories: ["Art Supplies", "Craft Kits", "Yarn & Knitting", "Sewing & Fabric", "Paper & Stickers", "Original Artwork", "Handmade Ceramics", "Beads & Jewelry Making"] },
  { name: "Stationery & Office", categories: ["Notebooks & Journals", "Planners & Calendars", "Pens & Pencils", "Printed Greeting Cards", "Postcards", "Desk Accessories", "Gift Wrap"] },
  { name: "Books & Media", categories: ["Printed Books", "Magazines & Zines", "Comics", "Vinyl Records", "CDs", "Printed Posters"] },
  { name: "Music Gear", categories: ["Instruments", "Guitar Accessories", "Studio Equipment", "Headphones", "Cables & Adapters", "Merch"] },
  { name: "Electronics", categories: ["Phone Accessories", "Computer Accessories", "Audio", "Cameras & Photo", "Smart Home", "Chargers & Batteries", "Gadgets"] },
  { name: "Toys & Games", categories: ["Toys", "Board Games", "Puzzles", "Card Games", "Plush Toys", "Building Sets", "Outdoor Play"] },
  { name: "Baby & Kids", categories: ["Baby Care", "Nursery", "Feeding", "Kids' Toys", "School Supplies"] },
  { name: "Sports & Outdoors", categories: ["Fitness Equipment", "Yoga", "Cycling", "Camping & Hiking", "Fishing", "Team Sports", "Water Sports", "Sports Apparel"] },
  { name: "Pet Supplies", categories: ["Dog Supplies", "Cat Supplies", "Pet Food & Treats", "Pet Beds", "Pet Toys", "Collars & Leashes", "Aquarium Supplies"] },
  { name: "Vehicles & Parts", categories: ["Car Accessories", "Bike Parts", "Motorcycle Gear"] },
  { name: "Gifts & Seasonal", categories: ["Gift Sets", "Holiday Decor", "Party Supplies", "Wedding", "Physical Gift Cards"] },
  { name: "Other Goods", categories: ["Bundles & Boxes", "Subscription Boxes", "Samples", "Other Physical Product"] },
]

export type CategoryKind = "physical" | "digital"

/** The groups a product of this kind is offered. */
export const categoryGroupsFor = (kind: CategoryKind = "digital"): CategoryGroup[] => (kind === "physical" ? PHYSICAL_CATEGORY_GROUPS : CATEGORY_GROUPS)

/** Which group a category is in. Every category name is in exactly one group, across both lists. */
const GROUP_OF = new Map([...CATEGORY_GROUPS, ...PHYSICAL_CATEGORY_GROUPS].flatMap((g) => g.categories.map((c) => [c, g.name] as const)))
const PHYSICAL = new Set(PHYSICAL_CATEGORY_GROUPS.flatMap((g) => g.categories))
const ALL = [...GROUP_OF.keys()].sort((a, b) => a.localeCompare(b))

/** Is this category one a product of this kind is offered? */
export const isCategoryFor = (category: unknown, kind: CategoryKind): category is string => typeof category === "string" && GROUP_OF.has(category) && PHYSICAL.has(category) === (kind === "physical")

export const groupOfCategory = (category: string | null | undefined): string | null => (category ? GROUP_OF.get(category) ?? null : null)

/** True for a name the list offers, and nothing else. */
export const isCategory = (category: unknown): category is string => typeof category === "string" && GROUP_OF.has(category)

/** Matches first where a word starts with the query, then anywhere, each alphabetical. */
export function searchCategories(query: string, kind: CategoryKind = "digital"): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const inside: string[] = []
  for (const c of ALL) {
    if (PHYSICAL.has(c) !== (kind === "physical")) continue
    const l = c.toLowerCase()
    if (l.startsWith(q) || l.includes(` ${q}`)) starts.push(c)
    else if (l.includes(q) || (GROUP_OF.get(c) ?? "").toLowerCase().includes(q)) inside.push(c)
  }
  return [...starts, ...inside]
}
