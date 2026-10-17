/**
 * ===========================================================================
 *  THE HELP CENTER INSIDE THE DASHBOARD (/app/help)
 * ===========================================================================
 * The same content as the public /help, from the same data (lib/help) and
 * the same parts (./help-parts: the article body, its contents, the way to
 * a person; ./help-search; ./questions-browser), drawn in the app's own
 * frame (./app-help-frame) instead of the public site's band, header and
 * footer. Every link goes to the /app/help address of the same page
 * (lib/help/paths), so reading never drops somebody out of the app.
 *
 * Topics and articles are rows in one card, the way the app lists anything,
 * each with what it is and a chevron: a list that reads the same on a phone,
 * where it is a grouped list under the thumb, and at a desk.
 *
 * The words are the Help Center's, in English, like the articles they sit
 * around; the page's title and its back are the app's (tt, in each page).
 */
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import {
  POPULAR_HELP,
  headingId,
  helpArticle,
  helpArticlePath,
  helpArticlesIn,
  helpCategoriesFor,
  helpCategory,
  helpNeighbours,
  helpRelated,
  helpSectionsIn,
  helpToc,
  helpVisible,
  readingMinutes,
  type HelpArticle,
  type HelpCategory,
} from "@/lib/help/articles"
import { searchHelp } from "@/lib/help/search"
import type { HelpTopic } from "@/lib/help/questions"
import { APP_HELP_BASE, helpHref } from "@/lib/help/paths"
import { ArticleBody, ContactSupport, OnThisPage } from "./help-parts"
import { TopicIcon } from "./help-hero"
import { HelpSearch } from "./help-search"
import { QuestionsBrowser } from "./questions-browser"
import { TocSpy } from "./toc-spy"
import { cn } from "@/lib/utils"

const BASE = APP_HELP_BASE
/** An article's address in the app. */
export const appArticlePath = (a: HelpArticle) => helpHref(helpArticlePath(a), BASE)
/** A topic's address in the app. */
export const appTopicPath = (slug: string) => `${BASE}/${slug}`

const CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const ROW = "group flex min-h-[56px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-[#fafafb] active:bg-[#f3f4f6] sm:px-5"
const SECTION_TITLE = "mb-2.5 px-1 text-[13px] font-semibold text-[#6b7280]"

function Chevron() {
  return <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#c4c7cd] transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-[#6b7280]" />
}

/** Articles as rows in one card. */
function ArticleRows({ articles, summary = true, label }: { articles: HelpArticle[]; summary?: boolean; label?: string }) {
  return (
    <ul className={cn(CARD, "divide-y divide-[#f0f0f2]")} aria-label={label}>
      {articles.map((a) => (
        <li key={`${a.category}/${a.slug}`}>
          <Link href={appArticlePath(a)} className={ROW} data-app-help-article={a.slug}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-[#1a1a2e]">{a.title}</span>
              {summary ? <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-[#6b7280]">{a.summary}</span> : null}
            </span>
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The way to a person, as a card in the page rather than a band across it. */
function Contact() {
  return (
    <div className={cn(CARD, "mt-10")} data-app-help-contact="">
      <ContactSupport inCard />
    </div>
  )
}

/* ------------------------------------------------------------------------ */

/** /app/help: the search first, then every topic, the articles most people come for, and how to reach a person. */
export function AppHelpHome({ physical }: { physical: boolean }) {
  const categories = helpCategoriesFor(physical)
  const popular = POPULAR_HELP.map((p) => {
    const [c, s] = p.split("/")
    return helpVisible(helpCategory(c), physical) ? helpArticle(c, s) : undefined
  }).filter((a): a is HelpArticle => !!a)
  return (
    <>
      <div className="pt-2" data-app-help-search="">
        <HelpSearch base={BASE} size="large" />
      </div>

      <section aria-labelledby="app-help-topics" className="mt-8">
        <h2 id="app-help-topics" className={SECTION_TITLE}>
          Topics
        </h2>
        <ul className={cn(CARD, "divide-y divide-[#f0f0f2]")}>
          {categories.map((c) => (
            <li key={c.slug}>
              <TopicRow href={appTopicPath(c.slug)} slug={c.slug} title={c.title} line={c.description} count={helpArticlesIn(c.slug).length} />
            </li>
          ))}
          <li>
            <TopicRow href={`${BASE}/questions`} slug="questions" title="Order problems" line="What to do when an order goes wrong, for stores and for buyers." />
          </li>
        </ul>
      </section>

      {popular.length > 0 ? (
        <section aria-labelledby="app-help-popular" className="mt-8">
          <h2 id="app-help-popular" className={SECTION_TITLE}>
            Popular articles
          </h2>
          <ArticleRows articles={popular} summary={false} />
        </section>
      ) : null}

      <Contact />
    </>
  )
}

function TopicRow({ href, slug, title, line, count }: { href: string; slug: string; title: string; line: string; count?: number }) {
  return (
    <Link href={href} className={cn(ROW, "py-3.5")} data-app-help-topic={slug}>
      <TopicIcon slug={slug} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold leading-snug text-[#1a1a2e]">{title}</span>
          {typeof count === "number" ? <span className="text-[12.5px] tabular-nums text-[#9ca3af]">{count}</span> : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-[#6b7280]">{line}</span>
      </span>
      <Chevron />
    </Link>
  )
}

/* ------------------------------------------------------------------------ */

/** /app/help/<topic>: what it covers, where to start in a topic read in groups, its articles by group, and the other topics. */
export function AppHelpTopic({ category, physical }: { category: HelpCategory; physical: boolean }) {
  const sections = helpSectionsIn(category.slug)
  const articles = helpArticlesIn(category.slug)
  const grouped = sections.length > 1
  const first = (category.start ? articles.find((a) => a.slug === category.start) : undefined) ?? articles[0]
  return (
    <>
      <div className="flex items-start gap-3.5 pt-1">
        <TopicIcon slug={category.slug} size={44} />
        <p className="min-w-0 max-w-[60ch] pt-0.5 text-[15px] leading-relaxed text-[#4b5563]">{category.description}</p>
      </div>

      {grouped ? (
        <nav aria-label="In this topic" className="app-gutter-bleed mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) =>
            s.title ? (
              <a key={s.title} href={`#${headingId(s.title)}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#374151] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a2e]">
                {s.title}
                <span className="tabular-nums text-[#9ca3af]">{s.articles.length}</span>
              </a>
            ) : null,
          )}
        </nav>
      ) : null}

      <div className="mt-6 space-y-8">
        {grouped && first ? (
          <Link href={appArticlePath(first)} className={cn(CARD, ROW, "py-4")} data-help-start="">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[#6d28d9]">{category.start ? "Start here" : "New here? Start with"}</span>
              <span className="mt-0.5 block text-[16px] font-semibold leading-snug text-[#1a1a2e]">{first.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-[#6b7280]">{first.summary}</span>
            </span>
            <Chevron />
          </Link>
        ) : null}

        {sections.map((section) => (
          <section key={section.title ?? "all"} id={section.title ? headingId(section.title) : undefined} aria-label={section.title ?? undefined} className="scroll-mt-20" data-help-section={section.title ?? ""}>
            {section.title ? <h2 className={SECTION_TITLE}>{section.title}</h2> : null}
            <ArticleRows articles={section.articles} />
          </section>
        ))}
      </div>

      <OtherTopics physical={physical} except={category.slug} />
      <Contact />
    </>
  )
}

function OtherTopics({ physical, except }: { physical: boolean; except?: string }) {
  return (
    <nav aria-label="Other topics" className="mt-10">
      <h2 className={SECTION_TITLE}>Other topics</h2>
      <ul className="flex flex-wrap gap-2">
        {helpCategoriesFor(physical)
          .filter((c) => c.slug !== except)
          .map((c) => (
            <li key={c.slug}>
              <Link href={appTopicPath(c.slug)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white pl-1.5 pr-4 text-[14px] font-medium text-[#374151] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a2e]">
                <TopicIcon slug={c.slug} size={28} />
                {c.title}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  )
}

/* ------------------------------------------------------------------------ */

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })

/**
 * /app/help/<topic>/<article>: one reading column in a white sheet, the
 * title, the line under it, when it was updated; the contents folded under
 * the title on a phone and kept in view beside the sheet at a desk; then
 * before and after it, the rest of its group, and what to read next.
 */
export function AppHelpArticle({ article, category }: { article: HelpArticle; category: HelpCategory }) {
  const toc = helpToc(article)
  const { previous, next } = helpNeighbours(article)
  const related = helpRelated(article)
  const own = helpSectionsIn(category.slug).find((g) => g.articles.some((a) => a.slug === article.slug))
  const siblings = own ? own.articles.filter((a) => a.slug !== article.slug) : []
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-10">
      <div className="min-w-0">
        <article className={cn(CARD, "app-gutter-bleed rounded-none border-x-0 px-5 py-6 sm:mx-0 sm:rounded-2xl sm:border-x sm:px-8 sm:py-8 lg:px-10 lg:py-10")} data-help-article="">
          {article.section ? <p className="mb-2 text-[13px] font-medium text-[#6d28d9]">{article.section}</p> : null}
          <h1 className="text-[26px] font-bold leading-[1.2] tracking-[-0.02em] text-[#1a1a2e] sm:text-[32px]">{article.title}</h1>
          <p className="mt-3 text-[16.5px] leading-relaxed text-[#4b5563] sm:text-[17px]" data-help-summary="">
            {article.summary}
          </p>
          <p className="mt-3 text-[13px] text-[#6b7280]" data-help-meta="">
            {article.updated ? (
              <>
                Updated <time dateTime={article.updated}>{dateLabel(article.updated)}</time>
                <span aria-hidden className="mx-2 text-[#d1d5db]">
                  ·
                </span>
              </>
            ) : null}
            {readingMinutes(article)} min read
          </p>
          {toc.length >= 2 ? (
            <div className="mt-5">
              <OnThisPage items={toc} variant="inline" />
            </div>
          ) : null}
          <div className="mt-7 sm:mt-9">
            <ArticleBody blocks={article.body} base={BASE} />
          </div>
        </article>

        {previous || next ? (
          <nav aria-label="Previous and next articles" className="mt-6 grid gap-3 sm:grid-cols-2" data-help-prevnext="">
            {previous ? <StepLink article={previous} dir="previous" /> : <span className="hidden sm:block" />}
            {next ? <StepLink article={next} dir="next" /> : null}
          </nav>
        ) : null}

        {siblings.length > 0 ? (
          <section aria-labelledby="more-in-topic" className="mt-8" data-help-more="">
            <h2 id="more-in-topic" className={SECTION_TITLE}>
              More in {own?.title ?? category.title}
            </h2>
            <ArticleRows articles={siblings.slice(0, 6)} summary={false} />
          </section>
        ) : null}

        {related.length > 0 ? (
          <section aria-labelledby="related-articles" className="mt-8" data-help-related="">
            <h2 id="related-articles" className={SECTION_TITLE}>
              Related articles
            </h2>
            <ArticleRows articles={related} />
          </section>
        ) : null}

        <div className={cn(CARD, "mt-8 px-5 py-4")}>
          <ContactSupport compact />
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-[88px]">
          <OnThisPage items={toc} variant="side" />
        </div>
      </aside>
      <TocSpy />
    </div>
  )
}

function StepLink({ article, dir }: { article: HelpArticle; dir: "previous" | "next" }) {
  return (
    <Link
      href={appArticlePath(article)}
      rel={dir === "next" ? "next" : "prev"}
      className={cn(CARD, "group flex min-h-[72px] flex-col justify-center px-4 py-3 transition-colors hover:bg-[#fafafb] active:bg-[#f3f4f6]", dir === "next" && "sm:items-end sm:text-right")}
    >
      <span className="text-[12.5px] text-[#6b7280]">{dir === "next" ? "Next" : "Previous"}</span>
      <span className="mt-0.5 text-[14.5px] font-medium leading-snug text-[#1a1a2e]">
        {dir === "previous" ? <span aria-hidden>&larr; </span> : null}
        {article.title}
        {dir === "next" ? <span aria-hidden> &rarr;</span> : null}
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------------------ */

/** /app/help/search?q=: what the field lists as somebody types, as a page (Enter with nothing highlighted, or no script). */
export function AppHelpSearch({ q, physical }: { q: string; physical: boolean }) {
  const query = q.trim()
  const results = query ? searchHelp(q, 30, { physical }) : []
  return (
    <>
      <div className="pt-2">
        <HelpSearch base={BASE} size="compact" defaultQuery={q} />
      </div>
      <p className="mt-6 px-1 text-[14px] font-medium text-[#4b5563]" aria-live="polite">
        {!query ? "Type a word to search the Help Center" : results.length === 0 ? `No articles match “${query}”` : `${results.length} ${results.length === 1 ? "article" : "articles"} for “${query}”`}
      </p>
      {results.length > 0 ? (
        <ol className={cn(CARD, "mt-3 divide-y divide-[#f0f0f2]")}>
          {results.map((r) => (
            <li key={`${r.article.category}/${r.article.slug}`}>
              <Link href={appArticlePath(r.article)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug text-[#1a1a2e]">{r.article.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-[#6b7280]">
                    <span className="text-[#4b5563]">{helpCategory(r.article.category)?.title}</span>
                    <span aria-hidden> · </span>
                    {r.snippet}
                  </span>
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ol>
      ) : query ? (
        <p className="mt-2 px-1 text-[14px] text-[#6b7280]">
          Try a shorter or different word, or{" "}
          <Link href={BASE} className="font-medium text-[#1a1a2e] underline underline-offset-2">
            browse the topics
          </Link>
          .
        </p>
      ) : null}
      <Contact />
    </>
  )
}

/** The questions page's name, the Help Center's own words like the rest of it (app/help/questions says the same). */
export const APP_QUESTIONS_TITLE = "Order problems, answered"

/** /app/help/questions: the order problems, answered, with the pills sticking under the page's bar on a phone. */
export function AppHelpQuestions({ topics }: { topics: HelpTopic[] }) {
  return (
    <>
      <p className="max-w-[62ch] px-1 pt-1 text-[15px] leading-relaxed text-[#4b5563]">What happens, what the store does and what the buyer does, for the questions asked most.</p>
      <div className="mt-6">
        <QuestionsBrowser topics={topics} base={BASE} pillsAt="app-gutter-bleed top-[56px] bg-[#f8f9fa]/95" />
      </div>
      <Contact />
    </>
  )
}
