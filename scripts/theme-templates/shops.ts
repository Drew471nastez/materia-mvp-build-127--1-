/**
 * The shop on each template's cover: a name and a few products with
 * pictures, as a creator's store has them. Only the cover script draws
 * these. A template carries no products: on a creator's website their own
 * products take these places, and a store with none yet shows the theme's
 * empty cards. Each picture is a file in the template's own assets/.
 */
import type { SampleProduct } from "./site"

export const SAMPLE_SHOPS: Record<string, { name: string; products: SampleProduct[] }> = {
  default: {
    name: "Arden",
    products: [
      { title: "Stoneware mug", price: "$28.00", image: "default-mug.webp", description: "A wide, heavy mug in white stoneware. Holds 350 ml and goes in the dishwasher.", options: [{ name: "Colour", values: ["White", "Sand"] }] },
      { title: "Cotton cap, mustard", price: "$32.00", image: "default-cap.webp" },
      { title: "Desk Planner, printable PDF", price: "$12.00", image: "default-planner.webp", kind: "digital", description: "A week on one page, with a column for notes." },
      { title: "Steel bottle, 600 ml", price: "$34.00", image: "default-bottle.webp" },
      { title: "Canvas tote", price: "$24.00", image: "default-tote.webp", description: "Heavy natural cotton with long handles." },
      { title: "Linen notebook, A5", price: "$18.00", image: "default-notebook.webp", description: "160 pages of ruled cream paper." },
    ],
  },
  clothing: {
    name: "Halde",
    products: [
      { title: "Wool overcoat, camel", price: "$420.00", image: "clothing-wool-overcoat.webp", description: "Double faced wool, cut long and straight with a single vent. Unlined, so it packs flat.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Merino half zip, black", price: "$145.00", image: "clothing-merino-half-zip.webp" },
      { title: "Linen overshirt, chestnut", price: "$160.00", image: "clothing-linen-overshirt.webp" },
      { title: "Long blazer, black", price: "$290.00", image: "clothing-long-blazer.webp" },
      { title: "Boxy tee, olive", price: "$55.00", image: "clothing-boxy-tee.webp" },
      { title: "Wool blazer, charcoal", price: "$260.00", image: "clothing-wool-blazer.webp" },
    ],
  },
  merch: {
    name: "Soup Season",
    products: [
      { title: "Stir Clockwise tee", price: "$34.00", image: "merch-stir-tee.webp", description: "Bone white organic cotton with the clockwise ladle on the front.", options: [{ name: "Size", values: ["S", "M", "L", "XL", "XXL"] }] },
      { title: "Soup Season hoodie, tomato", price: "$68.00", image: "merch-wordmark-hoodie.webp" },
      { title: "Ladle cap", price: "$30.00", image: "merch-ladle-cap.webp" },
      { title: "Slurp test mug", price: "$24.00", image: "merch-slurp-mug.webp" },
      { title: "Taste It First tee, navy", price: "$34.00", image: "merch-taste-tee.webp" },
      { title: "Sticker sheet No. 4", price: "$8.00", image: "merch-sticker-sheet.webp" },
      { title: "Sunday Broth print", price: "$28.00", image: "merch-broth-print.webp" },
      { title: "Season 4 apron", price: "$46.00", image: "merch-season-apron.webp" },
    ],
  },
  digital: {
    name: "Plainfile",
    products: [
      { title: "Pricing your work, a guide", price: "$24.00", image: "digital-guide.webp", kind: "digital", description: "A 64 page PDF guide with a pricing worksheet and three proposal templates. Work out a day rate, price a project and say the number with confidence.", options: [{ name: "Edition", values: ["Guide", "Guide and worksheets"] }] },
      { title: "Social post templates", price: "$29.00", image: "digital-templates.webp", kind: "digital", description: "40 square posts and a business card, for Figma and Canva." },
      { title: "Line icons, 240", price: "$19.00", image: "digital-icons.webp", kind: "digital", description: "240 icons on a 24 px grid, as SVG and a Figma library." },
      { title: "Soft Film presets", price: "$22.00", image: "digital-presets.webp", kind: "digital", description: "12 Lightroom presets for warm, quiet colour." },
      { title: "Marlow, a display serif", price: "$39.00", image: "digital-font.webp", kind: "digital", description: "OTF, TTF and WOFF2 with a desktop licence." },
      { title: "Weekly planner, printable", price: "$8.00", image: "digital-planner.webp", kind: "digital", description: "A4 and US Letter PDFs to print at home." },
      { title: "Coast LUTs for video", price: "$26.00", image: "digital-luts.webp", kind: "digital", description: "8 .cube LUTs for log footage." },
      { title: "The starter bundle", price: "$79.00", compare: "$112.00", image: "digital-bundle.webp", kind: "digital", description: "The guide, the icons, the presets and Marlow in one download." },
    ],
  },
  ebooks: {
    name: "Your Name",
    products: [
      { title: "Book title one", price: "$12.00", image: "ebooks-book-stack.webp", kind: "digital", description: "A short line about this book." },
      { title: "Book title two", price: "$9.00", image: "ebooks-library-curve.webp", kind: "digital" },
      { title: "Book title three", price: "$9.00", image: "ebooks-book-tunnel.webp", kind: "digital" },
    ],
  },
  fitness: {
    name: "Iron Habit",
    products: [
      { title: "Foundation strength, 12 weeks", price: "$49.00", image: "fitness-deadlift.webp", kind: "digital", description: "Three sessions a week, with video for every lift." },
      { title: "Conditioning, 8 weeks", price: "$39.00", image: "fitness-ropes.webp", kind: "digital" },
      { title: "Daily mobility", price: "$19.00", image: "fitness-stretch.webp", kind: "digital" },
    ],
  },
  landing: {
    name: "Cutroom",
    products: [
      { title: "The Whole Edit", price: "$249.00", compare: "$594.00", image: "landing-cover-whole-edit.webp", kind: "digital", description: "All six courses in one box, with the raw footage and a monthly feedback call." },
      { title: "Cutting 101", price: "$47.00", compare: "$97.00", image: "landing-cover-cutting.webp", kind: "digital", description: "Beginner. 24 lessons. Go from a folder of clips to a cut that holds attention." },
      { title: "Colour Grading", price: "$97.00", compare: "$147.00", image: "landing-cover-colour.webp", kind: "digital", description: "Intermediate. 30 lessons. Balance, match and build a look that lasts a whole video." },
      { title: "Sound for Video", price: "$67.00", compare: "$97.00", image: "landing-cover-sound.webp", kind: "digital", description: "Intermediate. 18 lessons. Clean dialogue, music that sits under it, and a final mix." },
      { title: "Motion Titles", price: "$67.00", compare: "$97.00", image: "landing-cover-titles.webp", kind: "digital", description: "Intermediate. 16 lessons. Titles, lower thirds and captions that move well." },
      { title: "Short Form", price: "$47.00", compare: "$87.00", image: "landing-cover-short-form.webp", kind: "digital", description: "Beginner. 20 lessons. Vertical edits with a hook in the first two seconds." },
      { title: "Documentary Cuts", price: "$97.00", compare: "$147.00", image: "landing-cover-documentary.webp", kind: "digital", description: "Advanced. 22 lessons. Shape hours of interviews into a story." },
      { title: "7 Day Starter", price: "$27.00", compare: "$49.00", image: "landing-cover-starter.webp", kind: "digital", description: "New to editing. Seven short lessons and a finished one minute video by Sunday." },
    ],
  },
  creator: {
    name: "Robin Avery",
    products: [
      { title: "Draw Before Breakfast", price: "$24.00", image: "creator-book.webp", description: "The book. Forty drawing exercises of ten minutes each, for mornings before work.", options: [{ name: "Format", values: ["Paperback", "PDF"] }] },
      { title: "Sketchbook Basics", price: "$129.00", image: "creator-course.webp", kind: "digital", description: "A six week video course for adults who have not drawn since school." },
      { title: "The Drawing Table, monthly", price: "$9.00", image: "creator-community.webp", kind: "digital", description: "A members club with a live drawing session every month." },
      { title: "100 drawing prompts", price: "$18.00", image: "creator-prompts.webp", kind: "digital", description: "A printable deck of prompts for days with no ideas." },
      { title: "Watercolour on the Go", price: "$49.00", image: "creator-watercolour.webp", kind: "digital", description: "A short video course on painting outdoors with a small kit." },
      { title: "Line by Line workbook", price: "$12.00", image: "creator-workbook.webp", kind: "digital", description: "A printable workbook of line exercises." },
    ],
  },
  streetwear: {
    name: "Solano",
    products: [
      { title: "Linen popover, navy", price: "$120.00", image: "streetwear-linen-popover-navy.webp", description: "Washed linen with a short placket and a split hem. Cut loose through the body, so it moves in the heat.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Band collar shirt, sky", price: "$135.00", image: "streetwear-band-collar-shirt-sky.webp" },
      { title: "Linen tee, stone", price: "$95.00", image: "streetwear-linen-tee-stone.webp" },
      { title: "Linen henley, white", price: "$95.00", image: "streetwear-linen-henley-white.webp" },
      { title: "Gathered hem top, ecru", price: "$125.00", image: "streetwear-gathered-hem-top-ecru.webp" },
    ],
  },
  tour: {
    name: "Vela Moon",
    products: [
      { title: "Slow Lights, 180g vinyl", price: "$34.00", image: "tour-vinyl-hand.webp", description: "The album on heavyweight black vinyl, with a printed inner sleeve." },
      { title: "Tour tee, white", price: "$35.00", image: "tour-tee-hanger.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Tour hoodie, rust", price: "$70.00", image: "tour-hoodie.webp" },
      { title: "Canvas tote", price: "$18.00", image: "tour-tote.webp" },
      { title: "Tour tee, flat lay", price: "$35.00", image: "tour-tee-flat.webp" },
      { title: "Night hoodie, black", price: "$70.00", image: "tour-hoodie-dark.webp" },
    ],
  },
  samples: {
    name: "Tape Room",
    products: [
      { title: "Night Bus Garage", price: "$29.00", compare: "$39.00", image: "samples-pack-night-bus-garage.webp", kind: "digital", description: "UK garage, 214 sounds at 130 to 134 BPM: shuffled hats, organ stabs, subs and drum loops. 24 bit WAV and MIDI." },
      { title: "Factory Floor", price: "$29.00", compare: "$39.00", image: "samples-pack-factory-floor.webp", kind: "digital", description: "Techno drums, 310 one shots and 80 loops at 126 to 132 BPM. 24 bit WAV." },
      { title: "Low End Kit", price: "$19.00", image: "samples-pack-low-end-kit.webp", kind: "digital", description: "Trap 808s, kicks and sub hits, 120 sounds tuned to their note. 24 bit WAV." },
      { title: "Dusty Keys", price: "$24.00", image: "samples-pack-dusty-keys.webp", kind: "digital", description: "Lo-fi keys, 96 Rhodes and piano loops at 70 to 90 BPM, with MIDI." },
      { title: "Cold Concrete", price: "$27.00", image: "samples-pack-cold-concrete.webp", kind: "digital", description: "Drill, 180 sounds at 140 to 144 BPM: slides, hats, bells and dark pads, with MIDI." },
      { title: "Sunday Club", price: "$24.00", image: "samples-pack-sunday-club.webp", kind: "digital", description: "House, 250 sounds at 122 to 125 BPM: organ bass, chords and swung drums." },
      { title: "Tape Textures", price: "$15.00", image: "samples-pack-tape-textures.webp", kind: "digital", description: "Ambient, 160 textures of hiss, hum, room tone and worn tape loops." },
      { title: "Soft Machines", price: "$24.00", image: "samples-pack-soft-machines.webp", kind: "digital", description: "Synth, 140 one shots and MIDI from analogue polys and a bass synth." },
    ],
  },
  workspace: {
    name: "Wellkept",
    products: [
      { title: "Freelance desk", price: "$29.00", image: "workspace-freelance-desk.webp", kind: "digital", description: "Clients, projects, invoices and hours in one Notion page, with a board for the week and a list of who still owes you." },
      { title: "Meal planner", price: "$12.00", image: "workspace-meal-planner.webp", kind: "digital" },
      { title: "Reading log", price: "$9.00", image: "workspace-reading-log.webp", kind: "digital" },
      { title: "Home budget", price: "$15.00", image: "workspace-home-budget.webp", kind: "digital" },
      { title: "Habit tracker", price: "$9.00", image: "workspace-habit-tracker.webp", kind: "digital" },
      { title: "Study planner", price: "$12.00", image: "workspace-study-planner.webp", kind: "digital" },
    ],
  },
}
