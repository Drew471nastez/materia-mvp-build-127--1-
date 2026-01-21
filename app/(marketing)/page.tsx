"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Play, Check, Menu, X } from "lucide-react"

export default function StorelibLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="bg-[#faf8f5] overflow-x-hidden">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#faf8f5]/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#1a1a1a]">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[15px] font-semibold text-[#1a1a1a]">Storelib</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            {["Solutions", "Pricing", "Community", "Discover"].map((item) => (
              <Link key={item} href="#" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">{item}</Link>
            ))}
          </div>
          
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">Log in</Link>
            <Link href="/signup" className="px-4 py-2 text-[13px] font-medium bg-[#1a1a1a] text-white rounded-lg hover:bg-[#333] transition-colors">Open Storelib</Link>
          </div>
          
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* HERO - Lovable style */}
      <section className="relative min-h-screen pt-20 overflow-hidden">
        {/* Floating elements with dashed borders */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top left - Pink/blue gradient */}
          <motion.div 
            className="absolute top-24 left-8 lg:left-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div className="w-40 h-48 rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-500"></div>
            </div>
          </motion.div>

          {/* Top center left - Empty dashed box */}
          <motion.div 
            className="absolute top-16 left-1/4 hidden lg:block"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <div className="w-32 h-16 rounded-xl border-2 border-dashed border-[#ccc]"></div>
          </motion.div>

          {/* Color dots */}
          <motion.div 
            className="absolute top-48 left-1/3 hidden lg:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-[#1a1a1a]"></div>
                <div className="w-8 h-8 rounded-full bg-[#e8d5f0]"></div>
              </div>
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-[#f0b8d0]"></div>
                <div className="w-8 h-8 rounded-full bg-[#f5d860]"></div>
              </div>
            </div>
          </motion.div>

          {/* Top right - Aa typography */}
          <motion.div 
            className="absolute top-20 right-1/4 hidden lg:block"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
          >
            <div className="w-28 h-24 rounded-xl border-2 border-dashed border-[#ccc] flex items-center justify-center">
              <span className="text-4xl font-serif text-[#1a1a1a]">Aa</span>
            </div>
          </motion.div>

          {/* Right side - Avatar group */}
          <motion.div 
            className="absolute top-36 right-16 hidden lg:block"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="w-32 h-20 rounded-xl border-2 border-dashed border-[#ccc] flex items-center justify-center">
              <div className="flex -space-x-2">
                <div className="w-10 h-10 rounded-full bg-amber-200 border-2 border-white"></div>
                <div className="w-10 h-10 rounded-full bg-rose-200 border-2 border-white"></div>
                <div className="w-10 h-10 rounded-full bg-blue-200 border-2 border-white"></div>
              </div>
            </div>
          </motion.div>

          {/* Far right - Pink gradient */}
          <motion.div 
            className="absolute top-32 right-8 hidden md:block"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
          >
            <div className="w-36 h-32 rounded-2xl border-2 border-dashed border-[#ccc] overflow-hidden p-1">
              <div className="w-full h-full rounded-xl bg-gradient-to-br from-pink-300 via-purple-300 to-blue-400"></div>
            </div>
          </motion.div>
        </div>

        {/* Main content */}
        <div className="relative z-10 max-w-[800px] mx-auto px-6 pt-32 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[13px] text-[#666] mb-6">Storelib for creators</p>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-normal text-[#1a1a1a] leading-[1.1] tracking-tight mb-6" style={{ fontFamily: 'Georgia, serif' }}>
              Your best products,
              <br />
              <span className="italic">in production</span>
            </h1>
            
            <p className="text-[15px] text-[#666] mb-8 max-w-md mx-auto leading-relaxed">
              Bring your vision to life.
              <br />
              Create Storelib experiences.
            </p>
            
            <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1a1a] text-white text-[14px] font-medium rounded-lg hover:bg-[#333] transition-colors">
              Get started
            </Link>
          </motion.div>
        </div>

        {/* Logo cloud */}
        <motion.div 
          className="relative z-10 py-12 border-t border-black/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {["Klarna", "Adobe", "NETFLIX", "PayPal", "Salesforce", "HCA Healthcare"].map((brand) => (
                <span key={brand} className="text-[#999] font-medium text-sm">{brand}</span>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* FROM IDEA TO PRODUCTION */}
      <section className="py-24 bg-[#faf8f5]">
        <div className="max-w-[1100px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              From idea to production-ready
              <br />
              design
            </h2>
            <p className="text-[15px] text-[#666] max-w-lg leading-relaxed">
              Translate your ideas directly into working prototypes. Test and iterate on designs with full visual control.
            </p>
          </motion.div>

          {/* Feature card with UI mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-8 shadow-sm border border-black/5"
          >
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-xl font-medium text-[#1a1a1a] mb-3">Visual control</h3>
                <p className="text-[14px] text-[#666] leading-relaxed">
                  Click, edit, and refine with direct control over every detail. Select one or multiple elements at once and polish them instantly: text, colors, spacing, and layout. Point-and-click editing, no code required, and production-ready from the start.
                </p>
                <div className="flex gap-2 mt-6">
                  <button className="w-8 h-8 rounded-full border border-[#ddd] flex items-center justify-center text-[#999] hover:border-[#999] transition-colors">←</button>
                  <button className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-white">→</button>
                </div>
              </div>
              <div className="bg-[#e8f4fc] rounded-2xl p-6">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-[12px] font-medium text-[#1a1a1a] mb-4">Spacing</div>
                  <div className="flex gap-4 mb-6">
                    <div>
                      <div className="text-[10px] text-[#999] mb-1">Margin</div>
                      <div className="flex gap-1">
                        {['10', '%', '0', '0'].map((v, i) => (
                          <div key={i} className="w-8 h-7 bg-[#f5f5f5] rounded text-[11px] flex items-center justify-center text-[#666]">{v}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#999] mb-1">Padding</div>
                      <div className="flex gap-1">
                        {['U↓', '⊡', ')', '⊏'].map((v, i) => (
                          <div key={i} className="w-8 h-7 bg-[#f5f5f5] rounded text-[11px] flex items-center justify-center text-[#666]">{v}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-[12px] font-medium text-[#1a1a1a] mb-3">Typography</div>
                  <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                      <div className="text-[10px] text-[#999] mb-1">Font size</div>
                      <div className="h-8 bg-[#f5f5f5] rounded px-2 flex items-center text-[12px] text-[#666]">16xy</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-[#999] mb-1">Font family</div>
                      <div className="h-8 bg-[#f5f5f5] rounded px-2 flex items-center text-[12px] text-[#666]">Sans-serif</div>
                    </div>
                  </div>
                  <div className="text-[12px] font-medium text-[#1a1a1a] mb-3">Color</div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="text-[10px] text-[#999] mb-1">Text color</div>
                      <div className="h-8 bg-[#f5f5f5] rounded px-2 flex items-center gap-2 text-[12px] text-[#666]">
                        <div className="w-4 h-4 rounded-full bg-black"></div>
                        black
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-[#999] mb-1">Background color</div>
                      <div className="h-8 bg-[#f5f5f5] rounded px-2 flex items-center gap-2 text-[12px] text-[#666]">
                        <div className="w-4 h-4 rounded-full bg-indigo-400"></div>
                        Indigo-500
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SELL ANYTHING - Clean cards */}
      <section className="py-24 bg-white">
        <div className="max-w-[1100px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              Sell anything you create
            </h2>
            <p className="text-[15px] text-[#666] max-w-lg mx-auto">
              Templates, courses, downloads, memberships. If you made it, you can sell it.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Card 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-[#faf8f5] rounded-3xl p-8 relative overflow-hidden min-h-[320px]"
            >
              <div className="absolute top-8 right-8 w-44">
                <div className="bg-white rounded-2xl shadow-lg p-4 border border-black/5">
                  <div className="text-[11px] text-[#999] mb-1">My Product</div>
                  <div className="text-[14px] font-medium text-[#1a1a1a]">Design System Kit</div>
                  <div className="flex gap-2 mt-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-200 to-pink-300"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-200 to-purple-300 flex items-center justify-center">
                      <Play className="w-3 h-3 text-purple-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-lg p-3 border border-black/5 mt-2 ml-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[#1a1a1a]">Add to cart</span>
                    <span className="bg-emerald-500 text-white text-[12px] px-2 py-1 rounded-lg font-medium">$49</span>
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-[#1a1a1a] mb-3">Sell anything</h3>
              <p className="text-[14px] text-[#666] max-w-[240px] leading-relaxed">
                Video courses. Monthly memberships. One-time downloads. Whatever you want to sell, Storelib handles it.
              </p>
            </motion.div>

            {/* Card 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-[#faf8f5] rounded-3xl p-8 relative overflow-hidden min-h-[320px]"
            >
              <div className="absolute top-8 right-8 w-48">
                <div className="bg-white rounded-2xl shadow-lg p-4 border border-black/5">
                  <div className="flex items-baseline gap-6 mb-3">
                    <div>
                      <div className="text-xl font-semibold text-[#1a1a1a]">847</div>
                      <div className="text-[11px] text-[#999]">Sales</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-[#1a1a1a]">$42,350</div>
                      <div className="text-[11px] text-[#999]">Revenue</div>
                    </div>
                  </div>
                  <div className="h-10 flex items-end gap-[3px]">
                    {[35, 50, 40, 65, 55, 80, 60, 75, 70, 90, 65, 85].map((h, i) => (
                      <div key={i} className="flex-1 bg-gradient-to-t from-pink-300 to-pink-200 rounded-t" style={{ height: `${h}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-[#1a1a1a] mb-3">Track everything</h3>
              <p className="text-[14px] text-[#666] max-w-[240px] leading-relaxed">
                See your sales, revenue, and growth in real time. Know exactly what's working.
              </p>
            </motion.div>

            {/* Card 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-[#faf8f5] rounded-3xl p-8"
            >
              <h3 className="text-2xl font-medium text-[#1a1a1a] mb-6">Sell to anyone</h3>
              <div className="space-y-4">
                {[
                  "Accept payments in any currency",
                  "One-time, subscriptions, or payment plans",
                  "Automatic tax calculation worldwide",
                  "Instant payouts to your bank"
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[14px] text-[#666]">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Card 4 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-[#faf8f5] rounded-3xl p-8 relative overflow-hidden"
            >
              <div className="absolute top-8 right-8 flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-white text-sm font-bold">S</div>
                  <div className="bg-white rounded-xl shadow border border-black/5 px-3 py-2">
                    <div className="text-[10px] text-[#999]">Your store</div>
                    <div className="text-[12px] font-semibold text-[#1a1a1a]">storelib.com/you</div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <div className="w-9 h-9 rounded-xl bg-[#FF6B35] flex items-center justify-center text-white text-lg">#</div>
                  <div className="w-9 h-9 rounded-xl bg-[#FFC233] flex items-center justify-center text-[#1a1a1a]">✦</div>
                  <div className="w-9 h-9 rounded-xl bg-[#4285F4] flex items-center justify-center text-white font-bold text-sm">W</div>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-[#1a1a1a] mb-3">Sell anywhere</h3>
              <p className="text-[14px] text-[#666] max-w-[260px] leading-relaxed">
                Your own storefront, or embed products on your existing site. Connect to your favorite tools.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRODUCT SHOWCASE - Figma style */}
      <section className="py-24 bg-[#faf8f5]">
        <div className="max-w-[1100px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              Prompt, code, and design from
              <br />
              first idea to final product
            </h2>
          </motion.div>

          {/* Browser mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-white/10 rounded-lg px-4 py-1 text-[12px] text-white/60">storelib.com/editor</div>
                </div>
              </div>
              <div className="aspect-[16/9] bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] p-8 flex">
                {/* Left sidebar */}
                <div className="w-64 bg-[#252525] rounded-xl p-4 mr-4 hidden md:block">
                  <div className="text-[11px] text-white/40 mb-3">PROMPTING</div>
                  <div className="space-y-2 text-[12px] text-white/60">
                    <div className="bg-[#333] rounded-lg p-2">Turn this design into a working music player...</div>
                    <div className="bg-blue-500/20 text-blue-400 rounded-lg p-2 text-[11px]">Music Player v1</div>
                  </div>
                </div>
                {/* Main preview */}
                <div className="flex-1 bg-[#333] rounded-xl overflow-hidden">
                  <div className="h-full bg-gradient-to-br from-orange-200 via-rose-200 to-pink-300 flex items-center justify-center">
                    <div className="bg-[#2a2a2a] rounded-2xl p-6 shadow-2xl">
                      <div className="text-white/40 text-[11px] mb-2">Dreamy Haze</div>
                      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 mx-auto mb-4"></div>
                      <div className="flex justify-center gap-4 text-white/60">
                        <span>◀◀</span>
                        <span className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#1a1a1a]">▶</span>
                        <span>▶▶</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center gap-2 mt-8 flex-wrap">
              {["Prompt", "Design", "Draw", "Build", "Publish", "Promote", "Jam", "Present"].map((tab, i) => (
                <button key={tab} className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${i === 0 ? "bg-[#1a1a1a] text-white" : "text-[#666] hover:bg-black/5"}`}>
                  {tab}
                </button>
              ))}
            </div>
            <p className="text-center text-[14px] text-[#666] mt-4">Prompt to code anything you can imagine with AI.</p>
            <p className="text-center mt-3">
              <Link href="#" className="text-[14px] text-[#1a1a1a] underline underline-offset-4">Explore Storelib Make</Link>
            </p>
          </motion.div>
        </div>
      </section>

      {/* TESTIMONIAL - Pink background */}
      <section className="py-24 bg-[#ffe8e4]">
        <div className="max-w-[900px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="text-[100px] leading-none text-[#1a1a1a] font-serif">"</div>
            <h2 className="text-3xl md:text-4xl font-normal text-[#1a1a1a] leading-snug tracking-tight mb-10" style={{ fontFamily: 'Georgia, serif' }}>
              Storelib changed how I think about selling online. I went from zero to $10k in my first month. The tools just work.
            </h2>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a]/10"></div>
              <div>
                <div className="font-medium text-[#1a1a1a]">Marcus Johnson</div>
                <div className="text-[14px] text-[#666]">Course Creator</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CREATOR RESULTS - Stan Store style */}
      <section className="py-24 bg-[#e8e4df]">
        <div className="max-w-[1100px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              Creators are winning
            </h2>
            <p className="text-[15px] text-[#666]">Real results from real people</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Result 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-200 to-rose-300"></div>
                <span className="text-[13px] font-medium text-[#1a1a1a]">@sarah.designs</span>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-5 mb-4">
                <div className="text-xl font-semibold text-[#1a1a1a] mb-4">$6,714 this week 🤯</div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] text-[#999] mb-1">Total Revenue</div>
                  <div className="text-2xl font-semibold text-[#1a1a1a]">$47,291</div>
                  <div className="h-8 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg mt-3"></div>
                </div>
              </div>
              <p className="text-[13px] text-[#666] leading-relaxed">
                Quit my job 3 months ago. Best decision ever. Storelib makes it so easy to sell templates.
              </p>
            </motion.div>

            {/* Result 2 - Big card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-3xl overflow-hidden shadow-sm"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-amber-100 to-orange-100 relative">
                <div className="absolute inset-0 flex items-end p-6">
                  <div>
                    <div className="text-[#1a1a1a] text-lg font-medium leading-snug mb-4">
                      How I built a $100k/year business selling digital products
                    </div>
                    <div className="bg-white/90 backdrop-blur rounded-xl p-4 inline-block shadow-sm">
                      <div className="text-[11px] text-[#999]">Total Revenue</div>
                      <div className="text-2xl font-semibold text-[#1a1a1a]">$127,450</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Result 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-indigo-300"></div>
                  <span className="text-[13px] font-medium text-[#1a1a1a]">@alex.codes</span>
                </div>
                <p className="text-[13px] text-[#666] leading-relaxed">
                  Moved my whole business to Storelib. The checkout conversion is insane. My sales went up 40% just from switching.
                </p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 mb-3">
                  <div className="text-xl font-semibold text-[#1a1a1a]">$18k in 2 weeks 🔥</div>
                </div>
                <div className="bg-[#faf8f5] rounded-xl p-4">
                  <div className="text-[11px] text-[#999] mb-1">This Month</div>
                  <div className="text-xl font-semibold text-[#1a1a1a]">$18,247</div>
                  <div className="flex gap-4 mt-2 text-[11px] text-[#999]">
                    <span>4,821 views</span>
                    <span>892 sales</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 bg-white">
        <div className="max-w-[1100px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              Everything you need
            </h2>
            <p className="text-[15px] text-[#666]">No extra tools. No complicated setup.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Beautiful storefronts", desc: "Your products deserve a real home. Not a link page.", color: "from-emerald-50 to-teal-50" },
              { title: "Instant checkout", desc: "One click purchase. No friction. More sales.", color: "from-blue-50 to-indigo-50" },
              { title: "Built-in audience", desc: "Followers, wishlists, and discovery. Grow without ads.", color: "from-purple-50 to-pink-50" },
              { title: "Secure delivery", desc: "Your files stay protected. License keys included.", color: "from-orange-50 to-amber-50" },
              { title: "Real analytics", desc: "Know your numbers. Traffic, conversions, revenue.", color: "from-rose-50 to-pink-50" },
              { title: "Fast payouts", desc: "Get paid to your bank. No waiting weeks.", color: "from-cyan-50 to-sky-50" }
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className={`bg-gradient-to-br ${f.color} rounded-3xl p-6`}
              >
                <div className="h-28 bg-white/50 rounded-2xl mb-4 flex items-center justify-center">
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm"></div>
                </div>
                <h3 className="font-medium text-[#1a1a1a] mb-2">{f.title}</h3>
                <p className="text-[13px] text-[#666] leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 bg-[#faf8f5]">
        <div className="max-w-[900px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-normal text-[#1a1a1a] leading-tight tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              Simple pricing
            </h2>
            <p className="text-[15px] text-[#666]">Start free. Upgrade when you're ready.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-8 border border-black/5"
            >
              <div className="text-[14px] font-medium text-[#1a1a1a] mb-2">Free</div>
              <div className="text-4xl font-semibold text-[#1a1a1a] mb-1">$0</div>
              <div className="text-[13px] text-[#999] mb-6">forever</div>
              <div className="space-y-3 mb-8">
                {["3 products", "Storelib branding", "Basic analytics", "5% transaction fee"].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-[14px] text-[#666]">
                    <Check className="w-4 h-4 text-[#1a1a1a]" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/signup" className="block w-full py-3 text-center bg-[#f5f5f5] text-[#1a1a1a] rounded-xl font-medium text-[14px] hover:bg-[#eee] transition-colors">
                Get started
              </Link>
            </motion.div>

            {/* Pro */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-[#1a1a1a] rounded-3xl p-8 relative"
            >
              <div className="absolute top-4 right-4 bg-emerald-500 text-white text-[11px] font-medium px-3 py-1 rounded-full">Popular</div>
              <div className="text-[14px] font-medium text-white/60 mb-2">Pro</div>
              <div className="text-4xl font-semibold text-white mb-1">$29</div>
              <div className="text-[13px] text-white/40 mb-6">per month</div>
              <div className="space-y-3 mb-8">
                {["Unlimited products", "Custom domain", "No branding", "Advanced analytics", "3% transaction fee", "Priority support"].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-[14px] text-white/70">
                    <Check className="w-4 h-4 text-emerald-400" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/signup" className="block w-full py-3 text-center bg-white text-[#1a1a1a] rounded-xl font-medium text-[14px] hover:bg-white/90 transition-colors">
                Start free trial
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 bg-[#1a1a1a] relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 max-w-[700px] mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-normal text-white leading-tight tracking-tight mb-6" style={{ fontFamily: 'Georgia, serif' }}>
              Ready to start selling?
            </h2>
            <p className="text-[16px] text-white/60 mb-10 max-w-md mx-auto">
              Join thousands of creators who use Storelib to sell their work.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#1a1a1a] rounded-xl font-medium text-[15px] hover:bg-white/90 transition-colors">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/explore" className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/20 text-white rounded-xl font-medium text-[15px] hover:bg-white/5 transition-colors">
                See examples
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[13px] text-white/40">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />No credit card</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />Free forever plan</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />Cancel anytime</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white py-16 border-t border-black/5">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
                <span className="font-semibold text-[#1a1a1a]">Storelib</span>
              </Link>
              <p className="text-[13px] text-[#666]">Sell your digital products.</p>
            </div>
            {[
              { title: "Product", links: ["Features", "Pricing", "Examples"] },
              { title: "Resources", links: ["Blog", "Help", "Guides"] },
              { title: "Company", links: ["About", "Careers", "Contact"] },
              { title: "Legal", links: ["Privacy", "Terms"] }
            ].map((col, i) => (
              <div key={i}>
                <div className="font-medium text-[#1a1a1a] text-[13px] mb-4">{col.title}</div>
                <div className="space-y-3">
                  {col.links.map((link) => (
                    <Link key={link} href="#" className="block text-[13px] text-[#666] hover:text-[#1a1a1a] transition-colors">{link}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-black/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-[13px] text-[#999]">© 2025 Storelib</div>
            <div className="flex items-center gap-6">
              {["Twitter", "Instagram", "GitHub"].map((s) => (
                <Link key={s} href="#" className="text-[13px] text-[#999] hover:text-[#1a1a1a] transition-colors">{s}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
