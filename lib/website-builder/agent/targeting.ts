/**
 * ===========================================================================
 *  WHICH SECTION A REQUEST IS ABOUT, DECIDED BEFORE THE MODEL READS THE PAGE
 * ===========================================================================
 * The owner: "When I select a section, or I don't select it, it should be
 * smart, and learn when to code a new section or edit a current existing
 * section."
 *
 * Before this, a selected section was read by ./selection-intent.ts (edit,
 * new, replace, or a question back), and with nothing selected the model was
 * handed the whole page and the sentence, and found the section itself: by
 * reading sections one by one, which cost turns and time, and sometimes by
 * picking the wrong one or building a second testimonials section beside the
 * first. English only, too: "añade una sección de testimonios debajo del
 * hero" reached it as words it had to work out.
 *
 * Now one pure function decides, in code, from the words and the page:
 *
 *   A SECTION IS SELECTED
 *     the request is about it ("make this bigger", "add a button here"):
 *       edit that section only
 *     the request asks for something new ("add a testimonials section
 *     below"): a new section, placed relative to the selection
 *     the words name another section on the page ("make the footer darker"):
 *       that section, not the selection left open by mistake
 *
 *   NOTHING IS SELECTED
 *     the section(s) the words refer to, by type ("the hero"), by the name
 *     the creator gave it, by the text it shows ("the one that says Fresh
 *     bread"), or by position ("the second section", "the last one"):
 *       edited, when found and the request is an edit
 *     "add", "new", "another", or nothing on the page fits: a new section,
 *       placed where the words say, else at the end of the page
 *
 *   AMBIGUOUS
 *     the most likely reading, with `confidence: "guess"`, said in the reply
 *     (./targeting.ts `changeHeadline`), with Undo one tap away. Never a
 *     question back unless a cheap model call cannot settle it either.
 *
 * And SETTINGS BEFORE CODE: when the section's own schema has a setting for
 * what the words ask (a colour, a size, its spacing, its alignment), the run
 * is told to change that setting rather than write code.
 *
 * Words in English, Spanish, French, German, Portuguese, Italian and Dutch.
 * The model decides nothing here; `classifyTarget` is an optional cheap model
 * call, injected, asked only when the rules can only guess.
 */

import { readSelection, selectedShapeOf, type SelectionRead } from "./selection-intent"

export type TargetAction = "edit" | "add" | "replace" | "remove" | "wide" | "question"
export type TargetVia = "selection" | "lock" | "name" | "type" | "text" | "position" | "follow-up" | "model" | "default" | "words"

export interface TargetSection {
  id: string
  type: string
  name: string
}

export interface TargetDecision {
  action: TargetAction
  /** The sections to change (edit, replace, remove). Empty: the model finds it. */
  sections: TargetSection[]
  /** What to add: a section type the theme already has, when one fits. */
  kind?: string
  /** The kind in the words ("testimonials"), when they name one. */
  kindWord?: string
  /** Where a new section goes: add_section's index, and the section it is placed by. */
  placement?: { index: number; where: "after" | "before" | "top" | "end"; anchor?: TargetSection }
  /** Settings of the target's own schema that already do what was asked. */
  settings?: string[]
  confidence: "sure" | "likely" | "guess"
  via: TargetVia
  reason: string
}

export interface TargetPageSection {
  id: string
  type: string
  name?: string | null
  label?: string | null
  group?: string | null
  hidden?: boolean
  settings?: Record<string, unknown>
  blocks?: unknown[] | null
}

export interface TargetInput {
  prompt: string
  sections: readonly TargetPageSection[]
  selectedId?: string | null
  /** The creator's chip: only the selection may change. */
  locked?: boolean
  /** Code a section with the selection open. */
  codeFocus?: boolean
  /** Section types the theme can add, with their names. */
  addable?: readonly { type: string; name?: string }[]
  /** A type's display name and its settings (id and label), for names and SETTINGS BEFORE CODE. */
  schema?: (type: string) => { name?: string; fields?: readonly { id?: string; label?: string; type?: string }[]; blocks?: readonly { type?: string }[] } | undefined
  /** The sections the last run changed, by id, for "make it bigger" with nothing selected. */
  lastChanged?: readonly string[]
  images?: number
}

/* ── words ─────────────────────────────────────────────────────────────── */

/** Lower case, accents gone, punctuation spaces: "Añade una sección" reads as "anade una seccion". */
export function normalizeWords(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `
}

const alt = (words: readonly string[]) => words.map((w) => w.replace(/\s+/g, " ").trim()).sort((a, b) => b.length - a.length).join("|")
const re = (body: string) => new RegExp(body)

/** "Section" in the seven languages, and the words people use for one. */
const SECTION_WORDS = ["section", "sections", "band", "strip", "area", "row", "part of the page", "seccion", "secciones", "apartado", "bloque de la pagina", "abschnitt", "abschnitte", "sektion", "bereich", "secao", "secoes", "sessao", "sezione", "sezioni", "sectie", "secties", "onderdeel"]
const SECTION = `(?:${alt(SECTION_WORDS)})`

/** Add, in the seven languages. "Make" and "create" count only before "a", "new" and the like. */
const ADD_VERBS = ["add", "adding", "insert", "include", "anade", "anadir", "agrega", "agregar", "agregue", "inserta", "insertar", "incluye", "ajoute", "ajouter", "ajoutez", "insere", "inserer", "fuge", "fugen", "hinzu", "hinzufugen", "erganze", "adicione", "adicionar", "adiciona", "insira", "inserir", "aggiungi", "aggiungere", "inserisci", "voeg", "toevoegen"]
/** Wanting one: a new section when the page has none of the kind, more of the one it has otherwise. */
const WANT_VERBS = ["i need", "i want", "we need", "we want", "give me", "quiero", "necesito", "je veux", "il me faut", "ich mochte", "ich will", "ich brauche", "quero", "preciso", "voglio", "ik wil"]
const MAKE_VERBS = ["create", "build", "make", "design", "write", "code", "crea", "crear", "cree", "creer", "creez", "construye", "erstelle", "erstellen", "baue", "bau", "mach", "crie", "criar", "construa", "costruisci", "maak", "bouw"]
const INDEFINITE = ["a", "an", "one", "some", "me a", "me an", "us a", "un", "una", "uno", "une", "ein", "eine", "einen", "einem", "um", "uma", "een"]
const NEW_WORDS = ["new", "another", "extra", "a second", "separate", "additional", "one more", "fresh", "nueva", "nuevo", "otra", "otro", "adicional", "nouvelle", "nouveau", "une autre", "un autre", "supplementaire", "neue", "neuen", "neuer", "neues", "weitere", "weiteren", "zusatzliche", "noch eine", "noch einen", "nova", "novo", "outra", "outro", "nuova", "nuovo", "un altra", "un altro", "nieuwe", "nog een"]
const REMOVE_VERBS = ["delete", "remove", "get rid of", "take out", "elimina", "eliminar", "borra", "borrar", "quita", "quitar", "supprime", "supprimer", "enleve", "enlever", "retire", "retirer", "losche", "loschen", "entferne", "entfernen", "remova", "remover", "exclua", "apague", "rimuovi", "rimuovere", "togli", "verwijder", "verwijderen"]
const REPLACE_VERBS = ["replace", "swap", "switch", "reemplaza", "reemplazar", "sustituye", "sustituir", "remplace", "remplacer", "ersetze", "ersetzen", "tausche", "substitua", "substituir", "sostituisci", "sostituire", "vervang", "vervangen"]
const TURN_INTO = ["turn (?:this|it|that)(?: section| one)? into", "convert (?:this|it)(?: section)? (?:in)?to", "change (?:this|it)(?: section)? (?:in)?to", "make (?:this|it) (?:in)?to", "convierte (?:esta|este|esto|la seccion)? ?en", "transforma (?:esta|este|cette|cette section|isto|questa)? ?(?:en|em|in)", "verwandle (?:diesen|diese|das)? ?in", "mach (?:daraus|das zu)"]

/** A word between a verb and "section" that is not where the thing goes: "a new button to the hero section" is not a new section. */
const W = "(?:(?!(?:to|in|into|on|inside|within|for|of|from|al|en|dans|zu|zum|zur|im|no|na|ao|nel|nella|aan|para|pour|fur|per|voor) )[a-z0-9]+ )"
const ADD = re(` (?:${alt(ADD_VERBS)}) `)
const MAKE_A = re(` (?:${alt(MAKE_VERBS)}) (?:${alt(INDEFINITE)}|${alt(NEW_WORDS)}) `)
const WANT_A = re(` (?:${alt(WANT_VERBS)}) (?:${alt(INDEFINITE)}|${alt(NEW_WORDS)}) `)
/** "Other" after "the" is one already there: "la otra seccion", "the other section". */
const OTHER_THERE = / (?:la|el|los|las|the|l|le|die|der|das|o|a|il|lo|de|het) (?:otra|otro|other|autre|andere|outra|outro|altra|altro) /
const NEW = re(` (?:${alt(NEW_WORDS)}) ${W}{0,3}?${SECTION} `)
const REMOVE = re(` (?:${alt(REMOVE_VERBS)}) `)
const REPLACE = re(` (?:${alt(REPLACE_VERBS)}) | (?:${TURN_INTO.join("|")}) `)

/** Here, this, it: the open section. */
const THIS = re(` (?:this|it|here|the selected|esta|este|esto|aqui|cette|celle ci|ici|diese|diesen|dieser|dieses|hier|isto|aqui|questa|questo|qui|deze|dit) `)
/** "Into this", "to it", "here": into the open section, not beside it. */
const INTO_THIS = re(` (?:to|in|into|inside|within|on) (?:this|it|here|the selected)(?: section| one)? | here | (?:a|en|dentro de) (?:esta|este|esto) | aqui | (?:a|dans) (?:cette|celle ci) | ici | (?:in|zu) (?:diese|diesen|dieser|dieses) | hier | (?:nesta|neste|nisto) | (?:a|in) (?:questa|questo) | qui | (?:aan|in) (?:deze|dit) `)

/* Where. Each captures what follows, so "below the hero" can be placed by the hero. */
const AFTER_WORDS = ["below", "after", "under", "beneath", "underneath", "following", "next to", "debajo de", "debajo del", "abajo de", "despues de", "despues del", "bajo", "en dessous de", "en dessous du", "sous", "apres", "unter", "unterhalb", "nach", "abaixo de", "abaixo do", "abaixo da", "depois de", "depois do", "depois da", "sotto", "dopo", "onder", "na"]
const BEFORE_WORDS = ["above", "before", "on top of", "over", "encima de", "encima del", "arriba de", "antes de", "antes del", "au dessus de", "au dessus du", "avant", "uber", "oberhalb", "vor", "acima de", "acima do", "acima da", "sopra", "prima di", "prima del", "prima della", "boven", "voor"]
const AFTER = re(` (?:${alt(AFTER_WORDS)}) ((?:[a-z0-9]+ ){1,6})`)
const BEFORE = re(` (?:${alt(BEFORE_WORDS)}) ((?:[a-z0-9]+ ){1,6})`)
const AT_TOP = re(` (?:at the (?:very )?top(?: of the page)?|first thing on the page|al principio|arriba del todo|en haut de la page|tout en haut|ganz oben|no topo|in cima) `)
const AT_END = re(` (?:at the (?:very )?(?:bottom|end)(?: of the page)?|al final(?: de la pagina)?|en bas de la page|a la fin|ganz unten|am ende|no final|in fondo|alla fine|onderaan) `)

/** First, second ... last, in the seven languages. */
const ORDINALS: [string, number][] = [
  ["first|1st|top|primera|primer|primero|premiere|premier|erste|ersten|erster|primeira|primeiro|prima|primo|eerste|bovenste", 1],
  ["second|2nd|segunda|segundo|deuxieme|seconde|zweite|zweiten|seconda|secondo|tweede", 2],
  ["third|3rd|tercera|tercer|troisieme|dritte|dritten|terceira|terza|terzo|derde", 3],
  ["fourth|4th|cuarta|quatrieme|vierte|quarta|vierde", 4],
  ["fifth|5th|quinta|cinquieme|funfte|vijfde", 5],
  ["last|bottom|final|ultima|ultimo|derniere|dernier|letzte|letzten|letzter|laatste|onderste", -1],
]

/** The whole page or the whole site: the model decides, nothing is narrowed. */
const WIDE = re(` (?:whole|entire|full) (?:page|site|website|store|shop|theme) | (?:all|every) (?:the )?sections? | everything on (?:the|this) page | every page | all (?:the )?pages | site wide | everywhere | (?:the|my) theme | (?:toda|todo) (?:la pagina|el sitio|la web) | todas las secciones | (?:toute la page|tout le site|toutes les sections) | (?:ganze|gesamte|ganzen) (?:seite|website|webseite) | alle (?:abschnitte|sektionen|bereiche) | (?:toda a pagina|todo o site|todas as secoes) | (?:tutta la pagina|tutto il sito|tutte le sezioni) | (?:hele pagina|hele site|alle secties) `)
/** The site's look as a whole, with no section named: fonts, palette, brand colours. */
const SITE_LOOK = re(` (?:fonts?|typography|typeface|palette|brand colou?rs?|colou?r scheme|tipografia|fuente|police|schrift|schriftart|fonte|carattere) `)
/** A question about the page, not a change. */
const QUESTION = /^\s*(?:what|why|how|which|who|where|when|can you explain|is there|are there|does|do i|qu[eé]|por qu[eé]|c[oó]mo|pourquoi|comment|quel|warum|wie|welche|por que|como|perch[eé]|come|waarom|hoe)\b[^.!]*\?\s*$/i

/** Words about how a section LOOKS that a schema often has a setting for, and the setting ids or labels that do them. */
const SETTING_HINTS: { words: RegExp; fields: RegExp }[] = [
  { words: / (?:colou?rs?|background|darker|lighter|dark|light|color|farbe|couleur|cor|colore|kleur|fondo|fond|hintergrund) /, fields: /colou?r|scheme|background|bg/i },
  { words: / (?:bigger|smaller|larger|taller|shorter|size|height|grande|mas grande|plus grand|grosser|maior|piu grande|groter|kleiner|pequeno|petit) /, fields: /size|height|scale|width/i },
  { words: / (?:spacing|padding|space|margin|tighter|looser|espacio|espacement|abstand|espaco|spaziatura|ruimte) /, fields: /padding|spacing|margin|gap/i },
  { words: / (?:center|centre|centered|centred|align|left|right|centrar|centrer|zentrieren|centralizar|centrare|centreren) /, fields: /align|position|justify/i },
  { words: / (?:columns?|columnas|colonnes|spalten|colunas|colonne|kolommen) /, fields: /column/i },
  { words: / (?:hide|show|visible|ocultar|cacher|ausblenden|esconder|nascondere|verbergen) /, fields: /show|hide|visible|enable/i },
  { words: / (?:full width|full screen|full bleed|ancho completo|pleine largeur|volle breite|largura total|larghezza piena) /, fields: /full|width|bleed/i },
]

/* ── kinds of section ──────────────────────────────────────────────────── */

interface Kind {
  id: string
  /** What people call it, normalised. Weak words count only beside a section word, or after "add". */
  words: string[]
  weak?: string[]
  /** Section types (or names) that are this kind. */
  types: RegExp
  /** The theme's own types for it, best first, when it has several. */
  prefer?: string[]
}

const KINDS: Kind[] = [
  { id: "header", words: ["header", "navbar", "nav bar", "navigation bar", "top bar", "menu bar", "encabezado", "cabecera", "en tete", "entete", "kopfzeile", "kopfbereich", "cabecalho", "intestazione", "koptekst"], types: /^header$|(?:^|_)header(?:$|_)/ },
  { id: "footer", words: ["footer", "pie de pagina", "pied de page", "fusszeile", "rodape", "pie di pagina", "pie pagina", "voettekst", "fußzeile"], types: /^footer$|(?:^|_)footer(?:$|_)/ },
  { id: "announcement", words: ["announcement bar", "announcement", "promo bar", "barra de anuncios", "barra de anuncio", "barre d annonce", "ankundigungsleiste", "barra de anuncio"], types: /announcement|promo_bar/ },
  { id: "hero", words: ["hero", "banner", "hero banner", "hero section", "top banner", "main banner", "portada", "banner principal", "seccion principal", "banniere", "bandeau", "titelbild", "heldenbereich", "destaque principal"], types: /hero|banner|slideshow|cover|splash|image_banner/, prefer: ["hero_centered", "hero_split"] },
  { id: "testimonials", words: ["testimonials", "testimonial", "reviews", "customer reviews", "quotes from customers", "customer quotes", "testimonios", "testimonio", "resenas", "opiniones", "temoignages", "temoignage", "avis clients", "avis", "erfahrungsberichte", "bewertungen", "kundenstimmen", "depoimentos", "avaliacoes", "testimonianze", "recensioni", "beoordelingen", "ervaringen"], types: /testimonial|proof_featured|proof_testimonials|review/, prefer: ["proof_testimonials", "proof_featured", "reviews_carousel"] },
  { id: "faq", words: ["faq", "faqs", "frequently asked questions", "questions section", "preguntas frecuentes", "foire aux questions", "questions frequentes", "haufige fragen", "haufig gestellte fragen", "perguntas frequentes", "domande frequenti", "veelgestelde vragen", "veel gestelde vragen"], weak: ["questions", "preguntas", "fragen", "perguntas", "domande", "vragen"], types: /faq|accordion|collapsible|question/, prefer: ["faq_accordion", "faq_columns"] },
  { id: "pricing", words: ["pricing", "pricing table", "price table", "price list", "plans", "tiers", "precios", "tabla de precios", "planes", "tarifs", "grille tarifaire", "formules", "preise", "preisen", "preisliste", "preistabelle", "tarife", "precos", "tabela de precos", "planos", "prezzi", "listino", "piani", "prijzen", "prijslijst", "abonnementen"], weak: ["prices", "price"], types: /pricing|plans?(?:$|_)|tier/ },
  { id: "gallery", words: ["gallery", "image gallery", "photo gallery", "galeria", "galerie", "galleria", "fotogalerij", "collage", "lookbook"], weak: ["photos", "images", "pictures", "fotos", "imagenes", "bilder", "immagini", "afbeeldingen"], types: /gallery|collage|lookbook/, prefer: ["media_gallery", "media_collage"] },
  { id: "newsletter", words: ["newsletter", "email signup", "sign up form", "signup form", "subscribe form", "mailing list", "boletin", "suscripcion", "inscription", "lettre d information", "infolettre", "anmeldung", "boletim", "iscrizione", "nieuwsbrief"], weak: ["sign up", "signup", "subscribe"], types: /newsletter|signup|subscribe|email_capture/ },
  { id: "contact", words: ["contact form", "contact section", "contact", "formulario de contacto", "contacto", "formulaire de contact", "kontaktformular", "kontakt", "formulario de contato", "contato", "contatti", "modulo di contatto", "contactformulier"], types: /contact/ },
  { id: "products", words: ["featured products", "product grid", "products", "product list", "best sellers", "bestsellers", "productos", "produits", "produkte", "produtos", "prodotti", "producten", "collection", "collections"], weak: ["shop"], types: /product|collection|catalog|shop/, prefer: ["product_featured", "product_grid", "collection_featured"] },
  { id: "features", words: ["features", "feature grid", "benefits", "caracteristicas", "ventajas", "beneficios", "fonctionnalites", "avantages", "funktionen", "vorteile", "recursos", "caratteristiche", "vantaggi", "kenmerken", "voordelen"], types: /feature|benefit|multicolumn|columns/ },
  { id: "about", words: ["about us", "about", "our story", "founder story", "founder", "sobre nosotros", "quienes somos", "nuestra historia", "a propos", "qui sommes nous", "notre histoire", "uber uns", "unsere geschichte", "sobre nos", "quem somos", "chi siamo", "la nostra storia", "over ons", "ons verhaal"], weak: ["story", "historia", "histoire", "geschichte", "storia"], types: /about|story|founder|timeline/ },
  { id: "video", words: ["video section", "video"], types: /video/ },
  { id: "map", words: ["map", "mapa", "carte", "karte", "mappa", "kaart"], types: /map/ },
  { id: "cta", words: ["call to action", "cta", "llamada a la accion", "appel a l action", "handlungsaufforderung"], types: /cta|call_to_action/ },
  { id: "countdown", words: ["countdown", "countdown timer", "cuenta regresiva", "cuenta atras", "compte a rebours", "countdown", "contagem regressiva", "conto alla rovescia", "aftelklok"], weak: ["timer"], types: /countdown|timer/ },
  { id: "logos", words: ["logo strip", "logo wall", "logos", "trust row", "partner logos", "press logos", "logotipos", "logotypes"], types: /logo|trust|partner|press/ },
  { id: "blog", words: ["blog", "blog posts", "latest posts", "articles", "articulos", "beitrage"], types: /blog|article|posts?$/ },
  { id: "team", words: ["team", "our team", "equipo", "nuestro equipo", "equipe", "notre equipe", "unser team", "nossa equipe", "il team"], types: /team/ },
  { id: "text", words: ["rich text", "text section", "text block", "texto enriquecido", "texte enrichi"], types: /rich_text|text_rich|page_content/ },
]

const SORTED_KIND_WORDS: { kind: Kind; word: string; weak: boolean }[] = KINDS.flatMap((k) => [
  ...k.words.map((w) => ({ kind: k, word: normalizeWords(w).trim(), weak: false })),
  ...(k.weak ?? []).map((w) => ({ kind: k, word: normalizeWords(w).trim(), weak: true })),
]).sort((a, b) => b.word.length - a.word.length)

/** Every kind the words name, strong ones first, with where it was said. */
function kindsIn(text: string, opts: { weakToo: boolean }): { kind: Kind; word: string; at: number }[] {
  let rest = text
  const found: { kind: Kind; word: string; at: number }[] = []
  for (const { kind, word, weak } of SORTED_KIND_WORDS) {
    const needle = ` ${word} `
    let at = rest.indexOf(needle)
    while (at >= 0) {
      const sectionNext = new RegExp(`^ ${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${SECTION} `).test(rest.slice(at))
      if (!weak || opts.weakToo || sectionNext) {
        found.push({ kind, word, at })
        rest = `${rest.slice(0, at)} ${"_".repeat(word.length)} ${rest.slice(at + needle.length)}`
      }
      at = rest.indexOf(needle, at + 1)
    }
  }
  return found.sort((a, b) => a.at - b.at)
}

/* ── the page ──────────────────────────────────────────────────────────── */

const isChrome = (s: TargetPageSection) => !!s.group || s.type === "header" || s.type === "footer"

function displayName(s: TargetPageSection, schema: TargetInput["schema"]): string {
  return (s.label ?? "").trim() || (s.name ?? "").trim() || schema?.(s.type)?.name || s.type.replace(/[_-]+/g, " ")
}

function asTarget(s: TargetPageSection, schema: TargetInput["schema"]): TargetSection {
  return { id: s.id, type: s.type, name: displayName(s, schema) }
}

/** What a section shows: every string in its settings and blocks, normalised, for "the one that says ...". */
function visibleText(s: TargetPageSection): string {
  const out: string[] = []
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || out.length > 400) return
    if (typeof v === "string") {
      if (v.length >= 2 && v.length <= 2_000 && !/^(?:#|https?:|\/|shopify:|\{|\[)/.test(v) && /[a-z]/i.test(v)) out.push(v.replace(/<[^>]+>/g, " "))
    } else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else if (v && typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1)
  }
  walk(s.settings ?? {}, 0)
  walk(s.blocks ?? [], 0)
  return normalizeWords(out.join(" "))
}

/** The kind a section is, by its type and names. */
function kindOfSection(s: TargetPageSection, schema: TargetInput["schema"]): Kind | undefined {
  const key = `${s.type} ${normalizeWords(displayName(s, schema)).trim().replace(/ /g, "_")}`
  if (s.type === "header" || s.group === "header") return KINDS.find((k) => k.id === "header")
  if (s.type === "footer" || s.group === "footer") return KINDS.find((k) => k.id === "footer")
  return KINDS.find((k) => k.id !== "header" && k.id !== "footer" && k.types.test(key))
}

/** Quoted words, or words after "says", for "the section that says Fresh bread". */
function quotedPhrases(prompt: string): string[] {
  const out: string[] = []
  for (const m of prompt.matchAll(/["“”«»„]([^"“”«»„]{2,80})["“”«»„]|'([^']{3,80})'/g)) out.push(normalizeWords(m[1] ?? m[2] ?? "").trim())
  for (const m of normalizeWords(prompt).matchAll(/ (?:that says|which says|saying|with the (?:text|words|heading|title)|que dice|qui dit|mit dem text|die sagt|que diz|che dice|die zegt) ((?:[a-z0-9]+ ){1,6})/g)) {
    out.push(m[1].trim())
  }
  return [...new Set(out.filter((p) => p.length >= 3))]
}

const STOP = new Set("the a an and or of to in on for with this that it is be make change update edit section sections page please can you could would should more less into from about very really just also add new our my your their los las del una uno con para por que les des une pour avec dans sur der die das und mit fur von zum zur dem den uma com para pelo pela della delle degli con per che het een van voor met".split(" "))

/* ── the decision ──────────────────────────────────────────────────────── */

/** "The pricing... I mean the FAQ": what follows the last correction is the request. */
const CORRECTION = / (?:i mean|i meant|actually|sorry|no wait|or rather|quiero decir|mejor dicho|je veux dire|plutot|ich meine|eigentlich|quer dizer|cioe|intendo|ik bedoel) /g

export function resolveTarget(input: TargetInput): TargetDecision {
  const said = normalizeWords(input.prompt)
  const corrections = [...said.matchAll(CORRECTION)]
  const lastCorrection = corrections[corrections.length - 1]
  const text = lastCorrection && lastCorrection.index !== undefined ? ` ${said.slice(lastCorrection.index + lastCorrection[0].length)}` : said
  const schema = input.schema
  const all = input.sections
  const body = all.filter((s) => !isChrome(s))
  const selected = input.selectedId ? all.find((s) => s.id === input.selectedId) : undefined
  const sel = selected ? asTarget(selected, schema) : undefined
  const settingsFor = (targets: TargetSection[]) => preferSettings(text, targets, schema)
  const decide = (d: Omit<TargetDecision, "settings"> & { settings?: string[] }): TargetDecision => {
    const settings = d.settings ?? (d.action === "edit" && d.sections.length ? settingsFor(d.sections) : [])
    return { ...d, ...(settings.length ? { settings } : {}) }
  }

  /* THE CHIP, OR CODE A SECTION: the creator said what may change. */
  if (sel && (input.locked || input.codeFocus)) {
    return decide({ action: "edit", sections: [sel], confidence: "sure", via: "lock", reason: input.codeFocus ? "Code a section, with it open" : "the selection is locked" })
  }

  if (!text.trim()) {
    return sel
      ? decide({ action: "edit", sections: [sel], confidence: "likely", via: "selection", reason: "a picture, with a section open" })
      : decide({ action: "add", sections: [], confidence: "likely", via: "default", reason: "a picture and no words", placement: endOfPage(all, schema) })
  }

  if (QUESTION.test(input.prompt.trim()) && !ADD.test(text) && !REMOVE.test(text)) {
    return { action: "question", sections: sel ? [sel] : [], confidence: "likely", via: "words", reason: "a question" }
  }

  /* THE WHOLE PAGE OR SITE: nothing to narrow. A font or palette change with no section named is the site's. */
  const kindsSaid = kindsIn(text, { weakToo: false })
  if (WIDE.test(text) || (SITE_LOOK.test(text) && kindsSaid.length === 0 && !sel && !THIS.test(text))) {
    return { action: "wide", sections: [], confidence: "likely", via: "words", reason: "the whole page or site" }
  }

  const wantAsked = WANT_A.test(text)
  const addAsked = ADD.test(text) || MAKE_A.test(text) || wantAsked
  const newAsked = !OTHER_THERE.test(text) && (NEW.test(text) || newKindAsked(text))
  const sectionWordAfterAdd = addAsked && re(` (?:${alt(ADD_VERBS)}|${alt(MAKE_VERBS)}|${alt(WANT_VERBS)}) ${W}{0,6}?${SECTION} `).test(text)
  const removeAsked = REMOVE.test(text) && !ADD.test(text) && !MAKE_A.test(text)
  const replaceAsked = REPLACE.test(text)

  /* Which sections the words point at, besides the selection. */
  const refs = referencedSections(input, text)

  /* ── REPLACE: "replace the FAQ with a gallery", "turn this into a pricing table" ── */
  if (replaceAsked) {
    const replaced = refs.sections.length ? refs.sections.slice(0, 1) : sel ? [sel] : []
    const into = kindsIn(text, { weakToo: true }).filter((k) => !replaced.some((r) => k.kind.types.test(r.type))).pop()
    if (replaced.length) {
      const at = all.findIndex((s) => s.id === replaced[0].id)
      return decide({
        action: "replace",
        sections: replaced,
        ...(into ? { kindWord: into.word, kind: addableOf(into.kind, into.word, input.addable) } : {}),
        placement: { index: at, where: "before", anchor: replaced[0] },
        confidence: refs.sections.length || sel ? "likely" : "guess",
        via: refs.sections.length ? refs.via : "selection",
        reason: "a section to become another",
      })
    }
  }

  /* ── REMOVE: "delete the testimonials" (every one that matches) ── */
  if (removeAsked && ELEMENTS.test(text) && !re(` ${SECTION} `).test(text)) {
    /* "Remove the button from the hero": something inside a section, so the section is edited. */
    const inside = refs.sections.length ? refs.sections.slice(0, 1) : sel ? [sel] : []
    if (inside.length) return decide({ action: "edit", sections: inside, confidence: refs.sections.length ? refs.confidence : "sure", via: refs.sections.length ? refs.via : "selection", reason: "something removed from inside a section" })
  } else if (removeAsked) {
    const gone = refs.sections.length ? refs.sections : sel ? [sel] : []
    if (gone.length) return { action: "remove", sections: gone, confidence: refs.sections.length ? refs.confidence : "likely", via: refs.sections.length ? refs.via : "selection", reason: "a section to remove" }
  }

  /* ── ADD: decide whether it is a new section, or something added INTO one ── */
  if (addAsked || newAsked) {
    const named = kindsIn(text, { weakToo: true })
    /* The kind asked for is the one that is not where it goes: "add testimonials below the hero" adds testimonials. */
    const placementWords = placementOf(input, text)
    const asked = named.filter((k) => !placementWords?.anchor || !k.kind.types.test(placementWords.anchor.type)).filter((k) => k.kind.id !== "header" && k.kind.id !== "footer")[0]
    const intoNamed = intoSection(text, input, refs)

    /* A new section, said in so many words: "new", "another", "a section", or placed "below the hero". */
    const wantsSection = newAsked || sectionWordAfterAdd || (!!asked && !!placementWords && !intoNamed)
    if (wantsSection && (!intoNamed || newAsked || sectionWordAfterAdd)) {
      const placement = placementWords ?? (sel ? afterSelection(all, sel) : endOfPage(all, schema))
      const kind = asked ? addableOf(asked.kind, asked.word, input.addable) : addableFromWords(text, input.addable)
      return decide({
        action: "add",
        sections: [],
        ...(kind ? { kind } : {}),
        ...(asked ? { kindWord: asked.word } : {}),
        placement,
        confidence: "sure",
        via: "words",
        reason: "a new section asked for",
      })
    }

    /* Something added INTO a section: "add a button to the hero", "add a question here". */
    if (intoNamed) return decide({ action: "edit", sections: intoNamed.sections, confidence: intoNamed.confidence, via: intoNamed.via, reason: "something added inside a section" })

    if (sel) {
      /* With a section open, the reading ./selection-intent.ts has always made, and its doubt settled rather than asked. */
      const read = readSelectionOf(input, selected!)
      if (read.aim === "new" || read.aim === "ask") {
        const kind = asked ? addableOf(asked.kind, asked.word, input.addable) : undefined
        return decide({
          action: "add",
          sections: [],
          ...(kind ? { kind } : {}),
          ...(asked ? { kindWord: asked.word } : {}),
          placement: placementWords ?? { index: read.index ?? all.findIndex((s) => s.id === sel.id) + 1, where: "after", anchor: sel },
          confidence: read.aim === "ask" ? "guess" : "likely",
          via: "words",
          reason: read.aim === "ask" ? `a ${asked?.word ?? "section"} beside the open one, the likelier of two readings` : read.reason,
        })
      }
      return decide({ action: "edit", sections: [sel], confidence: "likely", via: "selection", reason: read.reason })
    }

    /* Nothing open. A kind of section named: one already on the page takes more of it; else a new one. */
    if (asked) {
      const existing = body.filter((s) => kindOfSection(s, schema)?.id === asked.kind.id)
      const elementish = ELEMENTS.test(text)
      if (existing.length && !newAsked && (elementish || isPluralEntries(asked.word) || (wantAsked && !ADD.test(text) && !MAKE_A.test(text)))) {
        return decide({ action: "edit", sections: [asTarget(existing[0], schema)], confidence: "guess", via: "type", reason: `more ${asked.word} in the one already on the page` })
      }
      const kind = addableOf(asked.kind, asked.word, input.addable)
      return decide({ action: "add", sections: [], ...(kind ? { kind } : {}), kindWord: asked.word, placement: placementWords ?? endOfPage(all, schema), confidence: existing.length ? "guess" : "likely", via: "words", reason: existing.length ? "a new one, though the page has one" : "a kind of section the page does not have" })
    }

    /* "Add a button": an element, into the section the words point at, else the top one. */
    if (ELEMENTS.test(text)) {
      if (refs.sections.length) return decide({ action: "edit", sections: refs.sections, confidence: refs.confidence, via: refs.via, reason: "an element added to a named section" })
      const top = body[0]
      if (top) return decide({ action: "edit", sections: [asTarget(top, schema)], confidence: "guess", via: "default", reason: "an element, with no section named: the top one" })
    }
    const kind = addableFromWords(text, input.addable)
    return decide({ action: "add", sections: [], ...(kind ? { kind } : {}), placement: placementWords ?? endOfPage(all, schema), confidence: "guess", via: "default", reason: "something to add, of a kind the words do not name" })
  }

  /* ── EDIT ── */
  if (sel) {
    /* Another section named, said with "the" or "my": that one, not the selection left open. */
    const others = refs.sections.filter((r) => r.id !== sel.id)
    if (others.length && !THIS.test(text)) return decide({ action: "edit", sections: others, confidence: refs.confidence === "sure" ? "likely" : refs.confidence, via: refs.via, reason: "another section, by name" })
    return decide({ action: "edit", sections: [sel], confidence: "sure", via: "selection", reason: "about the open section" })
  }
  if (refs.sections.length) return decide({ action: "edit", sections: refs.sections, confidence: refs.confidence, via: refs.via, reason: refs.reason })

  /* "Make it bigger" after a change: the section the last run changed. */
  const last = (input.lastChanged ?? []).map((id) => body.find((s) => s.id === id)).filter((s): s is TargetPageSection => !!s)
  if (last.length === 1) return decide({ action: "edit", sections: [asTarget(last[0], schema)], confidence: "likely", via: "follow-up", reason: "the section the last change was to" })

  return { action: "edit", sections: [], confidence: "guess", via: "default", reason: "no section named" }
}

/** Element words: a thing put inside a section rather than a section of its own. */
const ELEMENTS = re(` (?:button|buttons|link|links|heading|headline|subheading|tagline|description|caption|title|subtitle|image|photo|picture|icon|icons|logo|badge|label|paragraph|line|text|quote|question|questions|answer|item|items|entry|entries|card|cards|bullet|bullets|boton|botones|enlace|titulo|imagen|foto|icono|bouton|boutons|lien|titre|image|icone|knopf|schaltflache|link|uberschrift|bild|symbol|botao|botoes|titulo|imagem|pulsante|bottone|collegamento|titolo|immagine|knop|afbeelding|kop) `)

function isPluralEntries(word: string): boolean {
  return / (?:questions|reviews|testimonials|quotes|photos|images|logos|plans|features|preguntas|fragen|domande|vragen) /.test(` ${word} `)
}

/** "A new FAQ", "another testimonials": NEW followed straight away by a kind, with no section word. */
function newKindAsked(text: string): boolean {
  const m = re(` (?:${alt(NEW_WORDS)}) (${W}{1,2})`).exec(text)
  if (!m) return false
  return kindsIn(` ${m[1]}`, { weakToo: true }).length > 0
}

function readSelectionOf(input: TargetInput, selected: TargetPageSection): SelectionRead {
  const shape = selectedShapeOf(input.sections as never, selected.id, (type) => (input.schema?.(type)?.blocks ?? []).map((b) => String(b.type ?? "")).filter(Boolean))
  return shape ? readSelection(input.prompt, shape) : { aim: "edit", reason: "about the open section" }
}

/** "Add a button to the hero", "add a question here": the section it goes into, when the words say. */
function intoSection(text: string, input: TargetInput, refs: Refs): { sections: TargetSection[]; confidence: TargetDecision["confidence"]; via: TargetVia } | null {
  const sel = input.selectedId ? input.sections.find((s) => s.id === input.selectedId) : undefined
  const intoWords = re(` (?:to|in|into|inside|within|on|al|en el|en la|dentro de|dans|au|a la|zu|zum|zur|in den|in die|im|no|na|ao|nel|nella|aan|in de|in het) (?:the |my |our |la |el |le |les |die |der |das |den |o |a |il |lo |de |het |mi |mon |ma |mein |meine |meinen |minha |meu |mio |mia )?((?:[a-z0-9]+ ){1,4})`)
  const m = intoWords.exec(text)
  if (m) {
    const into = ` ${m[1]}`
    const named = refs.sections.filter((r) => kindsIn(into, { weakToo: true }).some((k) => k.kind.types.test(`${r.type} ${normalizeWords(r.name).trim().replace(/ /g, "_")}`)) || normalizeWords(into).includes(normalizeWords(r.name)))
    if (named.length) return { sections: named.slice(0, 1), confidence: "likely", via: refs.via }
  }
  if (sel && INTO_THIS.test(text) && !re(` (?:${alt(AFTER_WORDS)}|${alt(BEFORE_WORDS)}) (?:this|it|esta|este|cette|diese|questa|deze) `).test(text)) {
    return { sections: [asTarget(sel, input.schema)], confidence: "sure", via: "selection" }
  }
  return null
}

interface Refs {
  sections: TargetSection[]
  confidence: TargetDecision["confidence"]
  via: TargetVia
  reason: string
}

/** The sections the words point at: by the text they show, their name, their kind, or their position. */
function referencedSections(input: TargetInput, text: string): Refs {
  const schema = input.schema
  const all = input.sections
  const body = all.filter((s) => !isChrome(s))
  const none: Refs = { sections: [], confidence: "guess", via: "default", reason: "" }
  const pick = (list: TargetPageSection[], via: TargetVia, confidence: TargetDecision["confidence"], reason: string): Refs => ({ sections: list.map((s) => asTarget(s, schema)), via, confidence, reason })

  /* 1. Words in quotes, or after "says": the section that shows them. */
  for (const phrase of quotedPhrases(input.prompt)) {
    const hits = all.filter((s) => visibleText(s).includes(` ${phrase} `))
    if (hits.length === 1) return pick(hits, "text", "sure", `the section that shows "${phrase}"`)
    if (hits.length > 1) return pick(hits.slice(0, 1), "text", "guess", `the first of ${hits.length} sections that show "${phrase}"`)
  }

  /* 2. The name the creator gave a section, or its type's name, said in full. */
  const byName = all.filter((s) => {
    const names = [s.label, s.name].map((n) => normalizeWords(n ?? "").trim()).filter((n) => n.length >= 4 && !STOP.has(n))
    return names.some((n) => text.includes(` ${n} `) && !kindWordOnly(n))
  })
  if (byName.length) return pick(byName, "name", byName.length === 1 ? "sure" : "likely", "by the name the creator gave it")

  /* 3. Position: "the second section", "the last one", "the section below the hero". */
  const placed = positionRef(input, text)
  if (placed) return placed

  /* 4. Its kind: "the hero", "the footer", "the testimonials". Several of a kind: every one when the words say so. */
  const kinds = kindsIn(text, { weakToo: false })
  if (kinds.length) {
    const hits: TargetPageSection[] = []
    let ambiguous = false
    for (const k of kinds) {
      const of = all.filter((s) => kindOfSection(s, schema)?.id === k.kind.id)
      if (!of.length) continue
      const every = re(` (?:all|every|both|each|todas|todos|toutes|tous|alle|beide|tutte|tutti) (?:the |of the |las |los |les |die |as |os |le |i |de )?(?:[a-z]+ )?${k.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)
      if (every || of.length === 1) hits.push(...of)
      else {
        ambiguous = true
        hits.push(of[0])
      }
    }
    let unique = [...new Map(hits.map((h) => [h.id, h])).values()]
    /* "The contact button in the hero": two kinds said, one of them where the change goes. */
    if (unique.length > 1 && !/ (?:and|y|et|und|e|en|both|ambos|beide) /.test(text)) {
      const where = re(` (?:in|on|of|inside|within|en|dans|de|im|in der|no|na|nel|nella|del|della|du|van) (?:the |my |la |el |le |die |der |dem |o |a |il |lo |het )?((?:[a-z0-9]+ ){1,3})`).exec(text)
      const k = where ? kindsIn(` ${where[1]}`, { weakToo: false })[0] : undefined
      const narrowed = k ? unique.filter((s) => kindOfSection(s, schema)?.id === k.kind.id) : []
      if (narrowed.length) unique = narrowed
    }
    if (unique.length) return pick(unique, "type", ambiguous ? "guess" : "likely", ambiguous ? "the first of several of that kind" : "by its kind")
  }

  /* 5. What it is about, in its own words: two or more content words only one section shows. */
  const words = text.split(" ").filter((w) => w.length >= 5 && !STOP.has(w))
  if (words.length) {
    const scored = body.map((s) => {
      const shown = visibleText(s)
      return { s, n: words.filter((w) => shown.includes(` ${w} `)).length }
    }).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)
    if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return pick([scored[0].s], "text", "guess", "by the words it shows")
    /* One long, particular word only one section shows: "the sourdough quote". */
    const rare = words.filter((w) => w.length >= 7)
    const single = body.filter((s) => rare.some((w) => visibleText(s).includes(` ${w} `)))
    if (single.length === 1) return pick(single, "text", "guess", "by a word only it shows")
  }
  return none
}

/** A name that is only a kind's word ("FAQ", "Hero") is matched as a kind, where several of a kind are told apart. */
function kindWordOnly(name: string): boolean {
  return SORTED_KIND_WORDS.some((k) => k.word === name)
}

function positionRef(input: TargetInput, text: string): Refs | null {
  const schema = input.schema
  const all = input.sections
  const body = all.filter((s) => !isChrome(s))
  if (!body.length) return null
  /* "The section below the hero": the one after it. */
  const rel = re(` (?:the )?(?:${SECTION}|one) (?:(?:right |just |directly )?(below|under|after|above|before|over)) (?:the |my )?((?:[a-z0-9]+ ){1,4})`).exec(text)
  if (rel) {
    const anchor = kindsIn(` ${rel[2]}`, { weakToo: false })[0]
    const at = anchor ? all.findIndex((s) => kindOfSection(s, schema)?.id === anchor.kind.id) : -1
    if (at >= 0) {
      const next = /below|under|after/.test(rel[1]) ? all[at + 1] : all[at - 1]
      if (next) return { sections: [asTarget(next, schema)], via: "position", confidence: "likely", reason: `the section ${rel[1]} the ${anchor.word}` }
    }
  }
  const sectionSaid = re(` ${SECTION} | one `).test(text)
  if (!sectionSaid) return null
  for (const [word, n] of ORDINALS) {
    const near = re(` (?:${word}) (?:[a-z]+ ){0,2}?(?:${SECTION}|one) | ${SECTION} (?:at the )?(?:${word}) `)
    if (!near.test(text)) continue
    const s = n === -1 ? body[body.length - 1] : body[n - 1]
    if (s) return { sections: [asTarget(s, schema)], via: "position", confidence: "likely", reason: n === -1 ? "the last section" : `section ${n} on the page` }
  }
  return null
}

/** Where a new section goes, in the words: "below the hero", "above the footer", "at the top". */
function placementOf(input: TargetInput, text: string): TargetDecision["placement"] | null {
  const schema = input.schema
  const all = input.sections
  const sel = input.selectedId ? all.find((s) => s.id === input.selectedId) : undefined
  const firstBody = all.findIndex((s) => !isChrome(s))
  if (AT_TOP.test(text)) return { index: firstBody >= 0 ? firstBody : 0, where: "top" }
  if (AT_END.test(text)) return endOfPage(all, schema)
  for (const [pattern, where] of [[AFTER, "after"], [BEFORE, "before"]] as const) {
    const m = pattern.exec(text)
    if (!m) continue
    const after = ` ${m[1]}`
    if (sel && /^ (?:this|it|that|the selected|esta|este|esto|ella|cette|celle ci|celle|diese|diesen|dieser|dieses|ihm|ihr|isto|esta|questa|questo|deze|dit) /.test(after)) {
      const at = all.findIndex((s) => s.id === sel.id)
      return { index: where === "after" ? at + 1 : at, where, anchor: asTarget(sel, schema) }
    }
    const k = kindsIn(after, { weakToo: false })[0]
    const anchor = k ? all.find((s) => kindOfSection(s, schema)?.id === k.kind.id) : all.find((s) => {
      const n = normalizeWords(displayName(s, schema)).trim()
      return n.length >= 3 && after.startsWith(` ${n} `)
    })
    if (anchor) {
      const at = all.findIndex((s) => s.id === anchor.id)
      /* Nothing goes above the header or below the footer: next to them means just inside the page. */
      if (anchor.type === "header" || anchor.group === "header") return { index: at + 1, where: "top" }
      if (anchor.type === "footer" || anchor.group === "footer") return endOfPage(all, schema)
      return { index: where === "after" ? at + 1 : at, where, anchor: asTarget(anchor, schema) }
    }
  }
  return null
}

function afterSelection(all: readonly TargetPageSection[], sel: TargetSection): NonNullable<TargetDecision["placement"]> {
  const at = all.findIndex((s) => s.id === sel.id)
  return { index: at + 1, where: "after", anchor: sel }
}

function endOfPage(all: readonly TargetPageSection[], schema: TargetInput["schema"]): NonNullable<TargetDecision["placement"]> {
  let footer = all.findIndex((s) => s.type === "footer" || s.group === "footer")
  if (footer < 0) footer = all.length
  const before = [...all.slice(0, footer)].reverse().find((s) => !isChrome(s))
  return { index: footer, where: "end", ...(before ? { anchor: asTarget(before, schema) } : {}) }
}

/** The theme's own section type for a kind, when it has one. */
function addableOf(kind: Kind, word: string, addable: TargetInput["addable"]): string | undefined {
  /*
    A type that is chiefly ANOTHER kind is not this one: "Product Hero" is a hero, "Product reviews" belongs on a
    product page. The kind's own preferred types first, then any that match only it.
  */
  const list = (addable ?? []).filter((a) => {
    const key = `${a.type} ${normalizeWords(a.name ?? "").trim().replace(/ /g, "_")}`
    const primary = KINDS.find((k) => k.id !== "header" && k.id !== "footer" && k.types.test(a.type.split("_")[0] ?? ""))
    return kind.types.test(key) && (!primary || primary.id === kind.id || kind.id === "products" && primary.id === "products")
  })
  for (const preferred of kind.prefer ?? []) if (list.some((a) => a.type === preferred)) return preferred
  const said = normalizeWords(word).trim()
  const byName = list.find((a) => normalizeWords(a.name ?? "").includes(` ${said} `))
  if (byName) return byName.type
  return list[0]?.type
}

/** "Add a before and after slider": the words after "add a", matched against the names the theme gives its sections. */
function addableFromWords(text: string, addable: TargetInput["addable"]): string | undefined {
  const m = re(` (?:${alt(ADD_VERBS)}|${alt(MAKE_VERBS)}) (?:${alt(INDEFINITE)}|${alt(NEW_WORDS)}) ((?:[a-z0-9]+ ){1,5})`).exec(text)
  if (!m) return undefined
  const thing = ` ${m[1]}`
  return (addable ?? []).find((a) => {
    const n = normalizeWords(a.name ?? "").trim()
    return n.length >= 4 && thing.includes(` ${n} `)
  })?.type
}

/** SETTINGS BEFORE CODE: the target's own settings that already do what was asked. */
function preferSettings(text: string, targets: TargetSection[], schema: TargetInput["schema"]): string[] {
  const out: string[] = []
  for (const hint of SETTING_HINTS) {
    if (!hint.words.test(text)) continue
    for (const t of targets.slice(0, 3)) {
      for (const f of schema?.(t.type)?.fields ?? []) {
        if (!f.id || f.type === "header" || f.type === "paragraph") continue
        if (hint.fields.test(f.id) || hint.fields.test(f.label ?? "")) out.push(`${t.name}: ${f.id}${f.label && f.label !== f.id ? ` (${f.label})` : ""}`)
      }
    }
  }
  return [...new Set(out)].slice(0, 8)
}

/* ── the cheap model call, only for a guess ────────────────────────────── */

/** Asked only when the rules can only guess and nothing is selected. Null: "do not know", the rules' guess holds. */
export type TargetClassifier = (prompt: string, ctx: { sections: { id: string; name: string; type: string }[] }) => Promise<{ action: "edit" | "add"; ids: string[] } | null>

export async function decideTarget(input: TargetInput, classify?: TargetClassifier): Promise<TargetDecision> {
  const ruled = resolveTarget(input)
  if (!classify || ruled.confidence !== "guess" || input.selectedId || ruled.action === "wide" || ruled.action === "question") return ruled
  try {
    const answer = await classify(input.prompt.slice(0, 600), { sections: input.sections.map((s) => asTarget(s, input.schema)).slice(0, 60) })
    if (!answer) return ruled
    if (answer.action === "edit") {
      const hits = answer.ids.map((id) => input.sections.find((s) => s.id === id)).filter((s): s is TargetPageSection => !!s)
      if (hits.length) return { ...ruled, action: "edit", sections: hits.map((s) => asTarget(s, input.schema)), placement: undefined, kind: undefined, confidence: "likely", via: "model", reason: "the sections the model read the request as about" }
    }
    if (answer.action === "add" && ruled.action !== "add") return { ...ruled, action: "add", sections: [], placement: endOfPage(input.sections, input.schema), confidence: "likely", via: "model", reason: "a new section, by the model" }
  } catch {
    /* the rules' answer */
  }
  return ruled
}

/** What the cheap model is asked: the page as a numbered list and the request; one line back. */
export function targetClassifierPrompt(prompt: string, sections: { id: string; name: string; type: string }[]): string {
  return [
    "A website editor. The page's sections, top to bottom:",
    ...sections.map((s, i) => `${i + 1}. ${s.name} (${s.type}) id=${s.id}`),
    `Request: ${prompt}`,
    "Is the request a change to sections already on the page, or a new section to add?",
    "Answer with one line: EDIT followed by the ids it changes, or ADD.",
  ].join("\n")
}

export function readTargetAnswer(said: string, ids: readonly string[]): { action: "edit" | "add"; ids: string[] } | null {
  const line = said.trim().split("\n")[0] ?? ""
  if (/^ADD\b/i.test(line)) return { action: "add", ids: [] }
  if (/^EDIT\b/i.test(line)) {
    const found = ids.filter((id) => line.includes(id))
    return found.length ? { action: "edit", ids: found } : null
  }
  return null
}

/* ── what the run is told, and what the reply says ─────────────────────── */

/** One line for the model and the checkpoint: "edit Hero [hero-1]", "add a testimonials section at index 3, after Hero". */
export function describeTarget(d: TargetDecision): string {
  const names = d.sections.map((s) => `${s.name} [${s.id}]`).join(", ")
  const where = d.placement ? placementWords(d.placement) : ""
  switch (d.action) {
    case "edit":
      return names ? `edit ${names}` : "a change the words do not tie to one section"
    case "add":
      return `add a new ${d.kindWord ?? "section"}${d.kind ? ` (type ${d.kind})` : ""}${d.placement ? ` at index ${d.placement.index}${where ? `, ${where}` : ""}` : ""}`
    case "replace":
      return `replace ${names}${d.kindWord ? ` with a ${d.kindWord}` : ""}`
    case "remove":
      return `remove ${names}`
    case "wide":
      return "the whole page or site"
    default:
      return "a question, no change"
  }
}

function placementWords(p: NonNullable<TargetDecision["placement"]>): string {
  if (p.where === "top") return "at the top of the page"
  if (p.where === "end") return p.anchor ? `at the end of the page, after ${p.anchor.name}` : "at the end of the page"
  return p.anchor ? `${p.where} ${p.anchor.name}` : ""
}

/** The block in the run's first message: what to change, decided before it read the page. */
export function targetGuidance(d: TargetDecision, opts: { selectedId?: string; describe?: (id: string) => string; fileSize?: (type: string) => number | null }): string {
  if (d.action === "wide" || d.action === "question") return ""
  const lines: string[] = []
  const guess = d.confidence === "guess"
  const others = d.sections.filter((s) => s.id !== opts.selectedId)
  if (d.action === "edit" && d.sections.length) {
    lines.push(`TARGET, decided from the request: edit ${d.sections.map((s) => `${s.name} [${s.id}]`).join(" and ")}${d.via === "selection" || d.via === "lock" ? " (the open section)" : ` (${d.reason})`}. Make the change there, in place: its settings, its blocks, or its own code. Do not add a new section for it, and leave every other section as it is unless the request names it.`)
  } else if (d.action === "add") {
    lines.push(`TARGET, decided from the request: ${describeTarget(d)}. ${d.kind ? `The theme already has this kind: add_section with sectionType "${d.kind}", then fill it with real content.` : "Use add_section with the closest kind the theme has; write a new one with create_section only when none fits."} Do not change the sections around it, except to keep the colours alternating.`)
  } else if (d.action === "replace") {
    lines.push(`TARGET, decided from the request: ${describeTarget(d)}. Put the new section where it is (index ${d.placement?.index ?? 0}), carry over its real content that still fits, then remove the old one.`)
  } else if (d.action === "remove") {
    lines.push(`TARGET, decided from the request: ${describeTarget(d)}, with remove_section on each.`)
  }
  if (!lines.length) return ""
  if (d.settings?.length) lines.push(`SETTINGS BEFORE CODE: the section already has settings for this (${d.settings.join("; ")}). Change those with update_section. Write code only if no setting can do what was asked.`)
  for (const s of d.sections.slice(0, 2)) {
    const size = opts.fileSize?.(s.type)
    if (size && size > 12_000) lines.push(`${s.name}'s file is ${size.toLocaleString("en-US")} characters: change it with edit_section_code, exact find and replace for only the lines that change. Rewriting it whole takes longer than this run has.`)
  }
  if (guess) lines.push("This is the likeliest reading, not a certain one. If the page shows it is plainly wrong, change the right section instead and say which in your reply.")
  if (opts.describe) for (const s of others.slice(0, 2)) lines.push(`${s.name} [${s.id}], read for you:\n${opts.describe(s.id)}`)
  return lines.join("\n\n")
}

/**
 * THE FIRST LINE OF THE REPLY, from what the run actually did, not from what
 * was predicted: "Edited: Hero", "Added: Testimonials, after Hero",
 * "Removed: FAQ". Empty when it changed no section.
 */
export function changeHeadline(opts: {
  before: readonly TargetPageSection[]
  after: readonly TargetPageSection[]
  added: readonly string[]
  touched: readonly string[]
  removed: readonly string[]
  name: (s: TargetPageSection) => string
  decision?: TargetDecision | null
}): string {
  const parts: string[] = []
  const addedHere = opts.added.filter((id) => opts.after.some((s) => s.id === id))
  const removedHere = opts.removed.filter((id) => !opts.after.some((s) => s.id === id) && opts.before.some((s) => s.id === id))
  for (const id of addedHere) {
    const at = opts.after.findIndex((s) => s.id === id)
    const s = opts.after[at]
    const prev = [...opts.after.slice(0, at)].reverse().find((x) => !isChrome(x) && !addedHere.includes(x.id))
    const where = prev ? `, after ${opts.name(prev)}` : opts.after.slice(0, at).every((x) => isChrome(x)) ? ", at the top" : ""
    parts.push(`Added: ${opts.name(s)}${where}`)
  }
  const edited = [...new Set(opts.touched)]
    .filter((id) => !addedHere.includes(id) && !removedHere.includes(id))
    .map((id) => opts.after.find((s) => s.id === id))
    .filter((s): s is TargetPageSection => !!s)
    .sort((a, b) => opts.after.indexOf(a) - opts.after.indexOf(b))
  if (edited.length) parts.push(`Edited: ${edited.slice(0, 4).map(opts.name).join(", ")}${edited.length > 4 ? ` and ${edited.length - 4} more` : ""}`)
  if (removedHere.length) {
    const gone = removedHere.map((id) => opts.before.find((s) => s.id === id)!).map(opts.name)
    parts.push(`Removed: ${gone.join(", ")}`)
  }
  if (!parts.length) return ""
  const headline = parts.join(". ")
  const d = opts.decision
  /* A guess is said as one, and Undo is the way back. */
  if (d && d.confidence === "guess" && d.action !== "wide" && (addedHere.length || edited.length)) return `${headline}. That was my best reading of the request; Undo puts it back.`
  return headline
}
