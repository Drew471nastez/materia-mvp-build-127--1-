import Link from "next/link"
import Image from "next/image"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  published_at: string | null
  read_time: string
  cover_image_url: string | null
  gradient?: string
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function BlogListing({
  posts,
  activeCategory,
  title,
  subtitle,
}: {
  posts: BlogPost[]
  activeCategory: string | null
  title: string
  subtitle: string
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Title area — subtle fade-up on load */}
      <div
        className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-10 blog-fade-up"
        style={{ animationDelay: "0ms" }}
      >
        <h1 className="text-[46px] sm:text-[58px] font-semibold text-neutral-900 tracking-tight mb-3">
          {title}
        </h1>
        <p className="text-neutral-500 text-base max-w-xs leading-relaxed">{subtitle}</p>
      </div>

      {/* Mobile: category pills row */}
      <div
        className="lg:hidden max-w-7xl mx-auto px-6 pb-6 overflow-x-auto blog-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex gap-2 whitespace-nowrap min-w-0">
          <Link
            href="/blog"
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${!activeCategory ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
          >
            All
          </Link>
          {STORELIB_CATEGORIES.map(cat => (
            <Link
              key={cat}
              href={`/blog/explore/categories/${categoryToSlug(cat)}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${activeCategory === cat ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop: sidebar + grid */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="flex gap-0">
          {/* Category sidebar — desktop only, shifted down ~10% */}
          <aside
            className="hidden lg:block w-52 xl:w-60 flex-shrink-0 border-r border-neutral-200 pr-8 mr-12 sticky self-start blog-fade-up"
            style={{ top: "calc(5rem + 2.4rem)", animationDelay: "80ms" }}
          >
            <nav className="flex flex-col gap-5">
              <Link
                href="/blog"
                className={`text-[17px] font-medium transition-colors ${!activeCategory ? "text-neutral-900 underline underline-offset-4 decoration-1" : "text-neutral-600 hover:text-neutral-900"}`}
              >
                All
              </Link>
              {STORELIB_CATEGORIES.map(cat => (
                <Link
                  key={cat}
                  href={`/blog/explore/categories/${categoryToSlug(cat)}`}
                  className={`text-[17px] font-medium transition-colors ${activeCategory === cat ? "text-neutral-900 underline underline-offset-4 decoration-1" : "text-neutral-600 hover:text-neutral-900"}`}
                >
                  {cat}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Post grid */}
          <main className="flex-1 min-w-0">
            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-neutral-400 blog-fade-up" style={{ animationDelay: "100ms" }}>
                <p className="text-lg font-medium">No articles yet in this category.</p>
                <p className="text-sm mt-1">Check back soon.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-14">
                {posts.map((post, i) => (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="group block blog-fade-up"
                    style={{ animationDelay: `${100 + i * 55}ms` }}
                  >
                    <article>
                      {/* Cover image */}
                      <div className="aspect-[16/10] rounded-xl overflow-hidden bg-neutral-100 mb-5 group-hover:scale-[1.005] transition-transform duration-500 ease-out">
                        {post.cover_image_url ? (
                          <Image
                            src={post.cover_image_url}
                            alt={post.title}
                            width={680}
                            height={425}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700 ease-out"
                          />
                        ) : (
                          <div className={`w-full h-full bg-gradient-to-br ${post.gradient || "from-neutral-800 to-neutral-900"} flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-700 ease-out`}>
                            <span className="text-white/20 text-6xl font-bold select-none">
                              {post.title.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      {post.published_at && (
                        <p className="text-neutral-400 text-sm mb-3">
                          Published {fmtDate(post.published_at)}&nbsp;·&nbsp;{post.read_time}
                        </p>
                      )}

                      {/* Title */}
                      <h2 className="text-[22px] font-bold text-neutral-900 leading-snug mb-2 transition-colors duration-300">
                        <span className="bg-[length:0%_1.5px] bg-[position:0_100%] bg-no-repeat bg-gradient-to-r from-neutral-900 to-neutral-900 group-hover:bg-[length:100%_1.5px] transition-[background-size] duration-500 ease-in-out pb-[2px]">
                          {post.title}
                        </span>
                      </h2>

                      {/* Excerpt */}
                      <p className="text-neutral-500 text-sm leading-relaxed mb-4 line-clamp-2">
                        {post.excerpt}
                      </p>

                      {/* Category pill */}
                      <span className="inline-block px-3 py-1 rounded-full border border-neutral-300 text-xs font-medium text-neutral-700">
                        {post.category}
                      </span>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
