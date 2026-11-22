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
    name: "OKTAV",
    products: [
      { title: "Heavyweight hoodie, black", price: "$79.00", compare: "$95.00", image: "merch-hoodie-black.webp", description: "Brushed back fleece at 450 gsm, a double layer hood and a kangaroo pocket. Cut boxy with dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Loop trackpant, heather grey", price: "$59.00", compare: "$72.00", image: "merch-trackpant-grey.webp" },
      { title: "Oversized tee, black", price: "$38.00", image: "merch-tee-oversized-black.webp" },
      { title: "Cargo trackpant, bone", price: "$74.00", image: "merch-cargo-trackpant-ecru.webp" },
      { title: "Oversized tee, white", price: "$38.00", image: "merch-tee-oversized-white.webp" },
      { title: "Twill short, black", price: "$44.00", compare: "$55.00", image: "merch-short-black.webp" },
      { title: "Rib tank, white", price: "$29.00", image: "merch-tank-white.webp" },
      { title: "Fitted tee, black", price: "$34.00", image: "merch-tee-fitted-black.webp" },
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
  /* Templates round 19: digital art books, after the owner's Echoes reference. */
  artbooks: {
    name: "Ochre Editions",
    products: [
      { title: "Hokusai. Prints of Mount Fuji", price: "$22.00", image: "artbooks-hokusai.webp", kind: "digital", description: "A 168 page PDF of landscape prints, each plate on its own page with a short note on where it was made. Read it on a tablet or a large screen and zoom into the woodgrain.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }] },
      { title: "Sargent. Portraits in Black", price: "$28.00", compare: "$36.00", image: "artbooks-sargent.webp", kind: "digital", description: "A 144 page PDF of portraits and studies in oil, with close details of the brushwork." },
      { title: "British Algae. Anna Atkins Photographs", price: "$16.00", image: "artbooks-atkins.webp", kind: "digital", description: "A 96 page PDF of cyanotypes, seaweeds pressed and printed in sunlight." },
      { title: "Van Gogh. Self-Portraits and Flowers", price: "$24.00", image: "artbooks-van-gogh.webp", kind: "digital", description: "A 192 page PDF of self-portraits and flower paintings, with full page details." },
      { title: "Egypt. Tomb Paintings in Colour", price: "$26.00", image: "artbooks-egypt.webp", kind: "digital", description: "A 120 page PDF of tomb paintings copied by hand at full size." },
      { title: "Vermeer. Light at the Window", price: "$18.00", image: "artbooks-vermeer.webp", kind: "digital", description: "An 80 page PDF of interiors, with each painting shown whole and in detail." },
      { title: "Birds and Flowers. Japanese Prints on Black", price: "$20.00", image: "artbooks-birds.webp", kind: "digital", description: "A 64 page PDF of prints made on a black ground, birds and blossom in fine lines." },
      { title: "Cross. Watercolours of the South", price: "$22.00", image: "artbooks-cross.webp", kind: "digital", description: "A 72 page PDF of watercolours in dabs of pure colour, painted on the Mediterranean coast." },
    ],
  },
  ebooks: {
    name: "Plain Sight",
    products: [
      { title: "Plain Sight, the ebook", price: "$29.00", compare: "$49.00", image: "ebooks-product-book.webp", kind: "digital", description: "A field guide to local search for small businesses. 212 pages in PDF and EPUB, twelve chapters, forty checklists." },
      { title: "Plain Sight with the workbook", price: "$39.00", compare: "$64.00", image: "ebooks-product-bundle.webp", kind: "digital", description: "The ebook plus the printable workbook: every exercise and checklist on its own page, ready to fill in." },
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
      { title: "The Whole Edit", price: "$249.00", compare: "$594.00", image: "landing-cover-whole-edit.webp", kind: "digital", description: "All six courses in one bundle, with the raw footage and a monthly feedback call." },
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
    name: "Elio Marsh",
    products: [
      { title: "Night Swimmer, vinyl LP", price: "$32.00", image: "tour-vinyl-lp.webp", description: "The album on 180g black vinyl with a printed inner sleeve and the lyrics. Eleven songs, two sides.", options: [{ name: "Format", values: ["Black vinyl", "Signed black vinyl"] }] },
      { title: "Night Swimmer tour tee", price: "$35.00", image: "tour-tee-black.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Night Swimmer, CD", price: "$14.00", image: "tour-cd.webp" },
      { title: "Tour poster, spring 2027", price: "$20.00", image: "tour-poster.webp" },
      { title: "Night Swimmer crew sweatshirt", price: "$65.00", image: "tour-crew.webp" },
      { title: "Elio Marsh long sleeve", price: "$45.00", compare: "$52.00", image: "tour-longsleeve.webp" },
    ],
  },
  samples: {
    name: "Loudlib",
    products: [
      { title: "Serum Presets Vol 1", price: "$8.99", compare: "$22.47", image: "samples-pack-serum-presets.webp", kind: "digital", description: "Serum presets for tech house and deep house: basses, plucks, leads and pads, each named by what it does. Needs Xfer Serum." },
      { title: "Tech House Sample Pack, Master Bundle 2025", price: "$19.98", compare: "$49.96", image: "samples-pack-tech-house-master-bundle.webp", kind: "digital", description: "The tech house packs in one download: drum loops, one shots, basslines, vocal chops and MIDI, with key and BPM in every loop name. 24 bit WAV." },
      { title: "Tech House Drum Kit Vol I", price: "$4.99", image: "samples-pack-drums-one-shots.webp", kind: "digital", description: "Drum one shots for tech house: kicks, claps, snares, hats and percussion, trimmed to the transient. 24 bit WAV." },
      { title: "Free Ambience Sample Pack Vol I", price: "$0.00", image: "samples-pack-ambience-kit.webp", kind: "digital", description: "Pads, drones and textures for intros, breakdowns and film. Free to download and royalty free." },
      { title: "Deep House Production Suite I", price: "$14.99", image: "samples-pack-deep-house-production-suite.webp", kind: "digital", description: "Deep house chords, basslines, drum loops and MIDI at 120 to 124 BPM. 24 bit WAV." },
      { title: "Tech House Unitech Vol I", price: "$12.99", image: "samples-pack-tech-house-unitech.webp", kind: "digital", description: "Rolling basslines, top loops and percussion for peak time tech house at 125 to 128 BPM. 24 bit WAV and MIDI." },
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
  /* Templates round 19: product pictures are transparent cut-outs, as the template asks creators to upload them. */
  space: {
    name: "Nadir",
    products: [
      { title: "White Tee", price: "$55.00", image: "space-white-tee.webp", description: "Heavy cotton jersey, boxy through the body with a dropped shoulder. Washed once before it ships, so it keeps its size.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Denim Jacket", price: "$140.00", image: "space-denim-jacket.webp" },
      { title: "Rust Bomber", price: "$155.00", image: "space-bomber.webp" },
      { title: "Pink Bag", price: "$50.00", image: "space-pink-bag.webp" },
      { title: "Light Jeans", price: "$95.00", image: "space-light-jeans.webp" },
      { title: "Grey Beanie", price: "$35.00", image: "space-grey-beanie.webp" },
      { title: "Black Cap", price: "$40.00", image: "space-black-cap.webp" },
      { title: "Black Tee", price: "$55.00", image: "space-black-tee.webp" },
    ],
  },
  /* Templates round 19: poster designs drawn for the template, shown framed on a soft card. */
  posters: {
    name: "Daydream Prints",
    products: [
      { title: "Blue Hour print", price: "$32.00", image: "posters-blue-petals.webp", description: "A cobalt flower on warm cream, printed on thick matte paper. Sent flat, ready for a frame.", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }] },
      { title: "Good Morning print", price: "$32.00", image: "posters-sunburst.webp" },
      { title: "In Full Bloom print", price: "$28.00", compare: "$36.00", image: "posters-big-bloom.webp" },
      { title: "Squeeze the Day print", price: "$32.00", image: "posters-citrus.webp" },
      { title: "After the Rain print", price: "$28.00", image: "posters-rainbow-arches.webp" },
      { title: "Tulip Season print", price: "$32.00", image: "posters-tulips.webp" },
      { title: "Pick Me print", price: "$28.00", image: "posters-daisies.webp" },
      { title: "Slow Sundays print", price: "$32.00", image: "posters-wavy-checks.webp" },
    ],
  },
}
