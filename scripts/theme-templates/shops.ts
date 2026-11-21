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
    name: "Common Goods",
    products: [
      { title: "Aloe in a mint pot", price: "$28.00", image: "default-aloe-pot.webp", description: "A small aloe in a glazed ceramic pot." },
      { title: "Pendant lamp", price: "$89.00", image: "default-pendant-lamp.webp" },
      { title: "Everyday watch", price: "$120.00", image: "default-white-watch.webp" },
      { title: "Velvet sofa", price: "$940.00", image: "default-green-sofa.webp" },
    ],
  },
  clothing: {
    name: "North Atelier",
    products: [
      { title: "Fringed knit top", price: "$95.00", image: "clothing-knit-top.webp", description: "Open knit cotton with a fringed hem.", options: [{ name: "Size", values: ["S", "M", "L"] }] },
      { title: "Rust bomber jacket", price: "$180.00", image: "clothing-bomber.webp" },
      { title: "Printed wrap dress", price: "$140.00", image: "clothing-dress.webp" },
      { title: "Checked wool coat", price: "$260.00", image: "clothing-street-coat.webp" },
    ],
  },
  merch: {
    name: "Loud Club",
    products: [
      { title: "Heavyweight tee", price: "$32.00", image: "merch-hero-tee.webp", description: "240gsm cotton, printed to order.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Colour tee", price: "$32.00", image: "merch-folded-tees.webp" },
      { title: "Trucker cap", price: "$28.00", image: "merch-cap.webp" },
      { title: "Grey hoodie", price: "$65.00", image: "merch-hoodie.webp" },
      { title: "White crewneck", price: "$58.00", image: "merch-sweatshirt.webp" },
      { title: "Yellow sweat set", price: "$90.00", image: "merch-yellow-set.webp" },
      { title: "Logo tee, five colours", price: "$34.00", image: "merch-tees-rack.webp" },
      { title: "Sage tee", price: "$32.00", image: "merch-hangers.webp" },
    ],
  },
  digital: {
    name: "Signal Packs",
    products: [
      { title: "Club drums sample pack", price: "$29.00", image: "digital-decks.webp", kind: "digital", description: "120 one shots and 40 loops, WAV." },
      { title: "Warm film presets", price: "$19.00", image: "digital-camera.webp", kind: "digital" },
      { title: "Brand kit templates", price: "$39.00", image: "digital-swatches.webp", kind: "digital" },
      { title: "Home studio keys pack", price: "$24.00", image: "digital-studio-room.webp", kind: "digital" },
      { title: "Mixing reference pack", price: "$15.00", image: "digital-headphones.webp", kind: "digital" },
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
    name: "Your Course",
    products: [{ title: "The complete course", price: "$149.00", image: "landing-hero-dashboard.webp", kind: "digital", description: "Everything in one purchase." }],
  },
  streetwear: {
    name: "Off Hours",
    products: [
      { title: "Selvedge work jacket", price: "$240.00", image: "streetwear-denim-jacket.webp", description: "14oz selvedge denim with a cord collar. 150 made.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Cargo pant, washed black", price: "$165.00", image: "streetwear-cargo.webp" },
      { title: "Box tee, bone hand", price: "$60.00", image: "streetwear-skeleton-tee.webp" },
      { title: "Five panel cap", price: "$48.00", image: "streetwear-cap.webp" },
      { title: "Rider jacket", price: "$420.00", image: "streetwear-leather-jacket.webp" },
      { title: "Heavy hoodie, signal yellow", price: "$140.00", image: "streetwear-hoodie-back.webp" },
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
      { title: "Warehouse Drums", price: "$29.00", image: "samples-cover-ink.webp", kind: "digital", description: "310 one shots and 80 loops at 126 to 132 BPM. 24 bit WAV." },
      { title: "Soft Machines", price: "$24.00", image: "samples-cover-fluid.webp", kind: "digital" },
      { title: "Low End Kit", price: "$19.00", image: "samples-cover-ember.webp", kind: "digital" },
      { title: "Dusty Keys", price: "$24.00", image: "samples-cover-marble.webp", kind: "digital" },
      { title: "Night Bus Garage", price: "$29.00", image: "samples-cover-lava.webp", kind: "digital" },
      { title: "Tape Textures", price: "$15.00", image: "samples-cover-waves.webp", kind: "digital" },
    ],
  },
  workspace: {
    name: "Sunday Systems",
    products: [
      { title: "Weekly planner", price: "$12.00", image: "workspace-mock-planner.webp", kind: "digital", description: "A week on one page, with a daily log and a Sunday review." },
      { title: "Budget tracker", price: "$15.00", image: "workspace-mock-budget.webp", kind: "digital" },
      { title: "Content calendar", price: "$19.00", image: "workspace-mock-calendar.webp", kind: "digital" },
      { title: "Project board", price: "$15.00", image: "workspace-mock-board.webp", kind: "digital" },
    ],
  },
  skincare: {
    name: "Plain Day",
    products: [
      { title: "Barrier serum", price: "$32.00", image: "skincare-dropper-leaf.webp", description: "Niacinamide and squalane. 30ml." },
      { title: "Day cream", price: "$28.00", image: "skincare-jar-sun.webp" },
      { title: "Night balm", price: "$30.00", image: "skincare-pink-jar.webp" },
      { title: "Gel cleanser", price: "$22.00", image: "skincare-pump.webp" },
    ],
  },
}
