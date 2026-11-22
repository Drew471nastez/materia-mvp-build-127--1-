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
    name: "Sundry",
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
      { title: "Wool overcoat, camel", price: "$420.00", image: "clothing-wool-overcoat.webp", description: "Double faced wool, cut long and straight with a single vent. Unlined, so it packs flat.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }], soldOut: ["XL"] },
      { title: "Merino half zip, black", price: "$145.00", image: "clothing-merino-half-zip.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Linen overshirt, chestnut", price: "$160.00", image: "clothing-linen-overshirt.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Long blazer, black", price: "$290.00", image: "clothing-long-blazer.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Boxy tee, olive", price: "$55.00", image: "clothing-boxy-tee.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Wool blazer, charcoal", price: "$260.00", image: "clothing-wool-blazer.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
    ],
  },
  merch: {
    name: "OKTAV",
    products: [
      { title: "Heavyweight hoodie, black", price: "$79.00", compare: "$95.00", image: "merch-hoodie-black.webp", description: "Brushed back fleece at 450 gsm, a double layer hood and a kangaroo pocket. Cut boxy with dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }], soldOut: ["XS"] },
      { title: "Loop trackpant, heather grey", price: "$59.00", compare: "$72.00", image: "merch-trackpant-grey.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Oversized tee, black", price: "$38.00", image: "merch-tee-oversized-black.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Cargo trackpant, bone", price: "$74.00", image: "merch-cargo-trackpant-ecru.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Oversized tee, white", price: "$38.00", image: "merch-tee-oversized-white.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Twill short, black", price: "$44.00", compare: "$55.00", image: "merch-short-black.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Rib tank, white", price: "$29.00", image: "merch-tank-white.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L"] }] },
      { title: "Fitted tee, black", price: "$34.00", image: "merch-tee-fitted-black.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
    ],
  },
  digital: {
    name: "Plainfile",
    products: [
      { title: "Pricing your work, a guide", price: "$24.00", image: "digital-guide.webp", kind: "digital", description: "A 64 page PDF guide with a pricing worksheet and three proposal templates. Work out a day rate, price a project and say the number with confidence.", options: [{ name: "Edition", values: ["Guide", "Guide and worksheets"] }], add: { "Guide and worksheets": 10 } },
      { title: "Social post templates", price: "$29.00", image: "digital-templates.webp", kind: "digital", description: "40 square posts and a business card, for Figma and Canva.", options: [{ name: "Licence", values: ["Personal", "Commercial"] }], add: { Commercial: 20 } },
      { title: "Line icons, 240", price: "$19.00", image: "digital-icons.webp", kind: "digital", description: "240 icons on a 24 px grid, as SVG and a Figma library.", options: [{ name: "Licence", values: ["Personal", "Commercial"] }], add: { Commercial: 20 } },
      { title: "Soft Film presets", price: "$22.00", image: "digital-presets.webp", kind: "digital", description: "12 Lightroom presets for warm, quiet colour." },
      { title: "Marlow, a display serif", price: "$39.00", image: "digital-font.webp", kind: "digital", description: "OTF, TTF and WOFF2 with a desktop licence.", options: [{ name: "Licence", values: ["Desktop", "Desktop and web", "Desktop, web and app"] }], add: { "Desktop and web": 30, "Desktop, web and app": 80 } },
      { title: "Weekly planner, printable", price: "$8.00", image: "digital-planner.webp", kind: "digital", description: "A4 and US Letter PDFs to print at home.", options: [{ name: "Paper", values: ["A4", "US Letter"] }] },
      { title: "Coast LUTs for video", price: "$26.00", image: "digital-luts.webp", kind: "digital", description: "8 .cube LUTs for log footage." },
      { title: "The starter bundle", price: "$79.00", compare: "$112.00", image: "digital-bundle.webp", kind: "digital", description: "The guide, the icons, the presets and Marlow in one download." },
    ],
  },
  /* Templates round 19: digital art books, after the owner's Echoes reference. */
  artbooks: {
    name: "Ochre Editions",
    products: [
      { title: "Hokusai. Prints of Mount Fuji", price: "$22.00", image: "artbooks-hokusai.webp", kind: "digital", description: "A 168 page PDF of landscape prints, each plate on its own page with a short note on where it was made. Read it on a tablet or a large screen and zoom into the woodgrain.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Sargent. Portraits in Black", price: "$28.00", compare: "$36.00", image: "artbooks-sargent.webp", kind: "digital", description: "A 144 page PDF of portraits and studies in oil, with close details of the brushwork.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "British Algae. Anna Atkins Photographs", price: "$16.00", image: "artbooks-atkins.webp", kind: "digital", description: "A 96 page PDF of cyanotypes, seaweeds pressed and printed in sunlight.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Van Gogh. Self-Portraits and Flowers", price: "$24.00", image: "artbooks-van-gogh.webp", kind: "digital", description: "A 192 page PDF of self-portraits and flower paintings, with full page details.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Egypt. Tomb Paintings in Colour", price: "$26.00", image: "artbooks-egypt.webp", kind: "digital", description: "A 120 page PDF of tomb paintings copied by hand at full size." },
      { title: "Vermeer. Light at the Window", price: "$18.00", image: "artbooks-vermeer.webp", kind: "digital", description: "An 80 page PDF of interiors, with each painting shown whole and in detail." },
      { title: "Birds and Flowers. Japanese Prints on Black", price: "$20.00", image: "artbooks-birds.webp", kind: "digital", description: "A 64 page PDF of prints made on a black ground, birds and blossom in fine lines." },
      { title: "Cross. Watercolours of the South", price: "$22.00", image: "artbooks-cross.webp", kind: "digital", description: "A 72 page PDF of watercolours in dabs of pure colour, painted on the Mediterranean coast." },
    ],
  },
  ebooks: {
    name: "Plain Sight",
    products: [
      { title: "Plain Sight, the ebook", price: "$29.00", compare: "$49.00", image: "ebooks-product-book.webp", kind: "digital", description: "A field guide to local search for small businesses. 212 pages in PDF and EPUB, twelve chapters, forty checklists.", options: [{ name: "Edition", values: ["Ebook", "Ebook and workbook"] }], add: { "Ebook and workbook": 10 } },
      { title: "Plain Sight with the workbook", price: "$39.00", compare: "$64.00", image: "ebooks-product-bundle.webp", kind: "digital", description: "The ebook plus the printable workbook: every exercise and checklist on its own page, ready to fill in." },
    ],
  },
  fitness: {
    name: "Iron Habit",
    products: [
      { title: "Foundation strength, 12 weeks", price: "$49.00", image: "fitness-deadlift.webp", kind: "digital", description: "Three sessions a week, with video for every lift.", options: [{ name: "Plan", values: ["Self guided", "With form checks"] }], add: { "With form checks": 40 } },
      { title: "Conditioning, 8 weeks", price: "$39.00", image: "fitness-ropes.webp", kind: "digital", options: [{ name: "Plan", values: ["Self guided", "With form checks"] }], add: { "With form checks": 30 } },
      { title: "Daily mobility", price: "$19.00", image: "fitness-stretch.webp", kind: "digital" },
    ],
  },
  landing: {
    name: "Cutroom",
    products: [
      { title: "The Whole Edit", price: "$249.00", compare: "$594.00", image: "landing-cover-whole-edit.webp", kind: "digital", description: "All six courses in one bundle, with the raw footage and a monthly feedback call.", options: [{ name: "Seats", values: ["1 person", "Team of 3"] }], add: { "Team of 3": 250 } },
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
    name: "Ines Hart",
    products: [
      { title: "Draw Before Breakfast", price: "$24.00", image: "creator-book.webp", description: "The book. Forty drawing exercises of ten minutes each, for mornings before work.", options: [{ name: "Format", values: ["Paperback", "PDF"] }], add: { PDF: -10 } },
      { title: "Sketchbook Basics", price: "$129.00", image: "creator-course.webp", kind: "digital", description: "A six week video course for adults who have not drawn since school.", options: [{ name: "Access", values: ["Course", "Course and feedback"] }], add: { "Course and feedback": 60 } },
      { title: "The Drawing Table, monthly", price: "$9.00", image: "creator-community.webp", kind: "digital", description: "A members club with a live drawing session every month." },
      { title: "100 drawing prompts", price: "$18.00", image: "creator-prompts.webp", kind: "digital", description: "A printable deck of prompts for days with no ideas." },
      { title: "Light on Dark Paper", price: "$49.00", image: "creator-dark-paper.webp", kind: "digital", description: "A short video course on drawing pale flowers and light with coloured pencil on dark paper." },
      { title: "Line by Line workbook", price: "$12.00", image: "creator-workbook.webp", kind: "digital", description: "A printable workbook of line exercises." },
    ],
  },
  streetwear: {
    name: "Solano",
    products: [
      { title: "Linen popover, navy", price: "$120.00", image: "streetwear-linen-popover-navy.webp", description: "Washed linen with a short placket and a split hem. Cut loose through the body, so it moves in the heat.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }], soldOut: ["XL"] },
      { title: "Band collar shirt, sky", price: "$135.00", image: "streetwear-band-collar-shirt-sky.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Linen tee, stone", price: "$95.00", image: "streetwear-linen-tee-stone.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Linen henley, white", price: "$95.00", image: "streetwear-linen-henley-white.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Gathered hem top, ecru", price: "$125.00", image: "streetwear-gathered-hem-top-ecru.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L"] }] },
    ],
  },
  samples: {
    name: "Loudlib",
    /* Templates round 20: Loudlib's own catalogue, as loudlib.net lists it (names, prices, contents and box art from its Payhip store). The prices there are euros; this preview draws dollars. */
    products: [
      { title: "Serum Presets Vol 1", price: "$8.99", compare: "$22.47", image: "samples-pack-serum-presets.webp", kind: "digital", description: "26 ready to use bass presets for Xfer Serum, made for tech house, deep house, melodic house and afro house. Needs Serum 1.368 or later, which is not included. Also part of the Tech House Master Bundle and the Deep House Production Suite.", options: [{ name: "Download", values: ["ZIP", "RAR"] }] },
      { title: "Tech House Sample Pack, Master Bundle 2025", price: "$19.98", compare: "$49.96", image: "samples-pack-tech-house-master-bundle.webp", kind: "digital", description: "Over 1,000 tech house sounds, 1.7 GB unzipped: drum one shots and loops, 100 bass loops, 26 Serum bass presets, FX, vocals and melody loops. Released in limited runs, twice a year. Plug and play in every major DAW.", options: [{ name: "Download", values: ["ZIP, 1 GB", "RAR, 930 MB"] }] },
      { title: "Tech House Drum Kit Vol I", price: "$0.00", image: "samples-pack-drum-kit.webp", kind: "digital", description: "280 hand picked one shots for tech house: 35 kicks, 43 claps, 31 hats, 35 open hats, 63 percs, 21 crashes, 11 rides, 21 shakers and 20 snares. 71.9 MB unzipped.", options: [{ name: "Pack", values: ["Full pack", "Free preview pack"] }] },
      { title: "Free Ambience Sample Pack Vol I", price: "$0.00", image: "samples-pack-ambience-kit.webp", kind: "digital", description: "16 atmospheric loops: calm drones, soft textures and gentle tunes for intros, breakdowns and film. ZIP 59 MB or RAR 45 MB.", options: [{ name: "Download", values: ["ZIP", "RAR"] }] },
      { title: "Deep House Production Suite, Serenade", price: "$9.98", compare: "$24.94", image: "samples-pack-deep-house-production-suite.webp", kind: "digital", description: "223 sounds for deep house, 311 MB unzipped: 64 drum one shots, 64 drum loops, 52 bass sounds with Serum bass presets, 12 FX and 47 melody, ambience and instrument sounds. One ZIP, 246 MB." },
      { title: "Tech House Sample Pack, Unitech", price: "$6.20", image: "samples-pack-tech-house-unitech.webp", kind: "digital", description: "165 WAV files for the new wave of tech house, inspired by John Summit, Fisher, Matroda and Dom Dolla: kicks, top loops, full drum loops, hats, claps, percs, 20 Serum bass presets, FX and buildups. One RAR, about 104 MB." },
      { title: "Tech House Drums Collection Vol I", price: "$5.00", compare: "$10.00", image: "samples-pack-drums-collection.webp", kind: "digital", description: "177 drum loops for tech house: 122 top loops and 55 full drum loops, 620 MB unzipped. One ZIP, 517 MB." },
      { title: "Tech House Bass Collection Vol I", price: "$4.00", compare: "$10.00", image: "samples-pack-bass-collection.webp", kind: "digital", description: "Over 100 bass loops for tech house, 238 MB unzipped. One ZIP, 169 MB." },
    ],
  },
  workspace: {
    name: "Wellkept",
    products: [
      { title: "Freelance desk", price: "$29.00", image: "workspace-freelance-desk.webp", kind: "digital", description: "Clients, projects, invoices and hours in one Notion page, with a board for the week and a list of who still owes you.", options: [{ name: "Licence", values: ["Personal", "Team of 5"] }], add: { "Team of 5": 30 } },
      { title: "Meal planner", price: "$12.00", image: "workspace-meal-planner.webp", kind: "digital" },
      { title: "Reading log", price: "$9.00", image: "workspace-reading-log.webp", kind: "digital" },
      { title: "Home budget", price: "$15.00", image: "workspace-home-budget.webp", kind: "digital" },
      { title: "Habit tracker", price: "$9.00", image: "workspace-habit-tracker.webp", kind: "digital" },
      { title: "Study planner", price: "$12.00", image: "workspace-study-planner.webp", kind: "digital" },
    ],
  },
  /* Templates round 19: product pictures are transparent cut-outs, as the template asks creators to upload them. */
  space: {
    name: "Nadir",
    products: [
      { title: "White Tee", price: "$55.00", image: "space-white-tee.webp", description: "Heavy cotton jersey, boxy through the body with a dropped shoulder. Washed once before it ships, so it keeps its size.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }], soldOut: ["S"] },
      { title: "Denim Jacket", price: "$140.00", image: "space-denim-jacket.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Rust Bomber", price: "$155.00", image: "space-bomber.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Pink Bag", price: "$50.00", image: "space-pink-bag.webp" },
      { title: "Light Jeans", price: "$95.00", image: "space-light-jeans.webp", options: [{ name: "Waist", values: ["28", "30", "32", "34"] }] },
      { title: "Grey Beanie", price: "$35.00", image: "space-grey-beanie.webp" },
      { title: "Black Cap", price: "$40.00", image: "space-black-cap.webp" },
      { title: "Black Tee", price: "$55.00", image: "space-black-tee.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
    ],
  },
  /* Templates round 19: poster designs drawn for the template, shown framed on a soft card. */
  posters: {
    name: "Daydream Prints",
    products: [
      { title: "Blue Hour print", price: "$32.00", image: "posters-blue-petals.webp", description: "A cobalt flower on warm cream, printed on thick matte paper. Sent flat, ready for a frame.", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 }, pictures: { Unframed: "posters-blue-petals-unframed.webp", "Black frame": "posters-blue-petals.webp", "Oak frame": "posters-blue-petals-oak.webp" } },
      { title: "Good Morning print", price: "$32.00", image: "posters-sunburst.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "In Full Bloom print", price: "$28.00", compare: "$36.00", image: "posters-big-bloom.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Squeeze the Day print", price: "$32.00", image: "posters-citrus.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "After the Rain print", price: "$28.00", image: "posters-rainbow-arches.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Tulip Season print", price: "$32.00", image: "posters-tulips.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Pick Me print", price: "$28.00", image: "posters-daisies.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Slow Sundays print", price: "$32.00", image: "posters-wavy-checks.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
    ],
  },
}
