import type { Metadata } from "next"
import Link from "next/link"
import {
  ChevronRight,
  BookOpen,
  ShoppingBag,
  CreditCard,
  BarChart3,
  Mail,
  Link2,
  Settings,
  Shield,
  HelpCircle,
  FileText,
  Zap,
  Users,
  Globe,
  Wallet,
  Search,
} from "lucide-react"
import { BackButton } from "@/components/back-button"

export const metadata: Metadata = {
  title: "Help Center | Storelib",
  description: "Documentation and guides for using Storelib",
}

const categories = [
  {
    title: "Getting Started",
    icon: Zap,
    description: "Learn the basics of setting up your Storelib store",
    articles: [
      { title: "Creating your account", slug: "creating-account" },
      { title: "Setting up your store", slug: "setting-up-store" },
      { title: "Adding your first product", slug: "first-product" },
      { title: "Understanding your dashboard", slug: "dashboard-overview" },
    ],
  },
  {
    title: "Products",
    icon: ShoppingBag,
    description: "Create and manage your digital products",
    articles: [
      { title: "Creating a digital product", slug: "create-product" },
      { title: "Product pricing strategies", slug: "pricing" },
      { title: "Adding product files", slug: "product-files" },
      { title: "Product categories and tags", slug: "categories-tags" },
      { title: "Managing product visibility", slug: "product-visibility" },
    ],
  },
  {
    title: "Payments & Payouts",
    icon: CreditCard,
    description: "Set up payments and receive your earnings",
    articles: [
      { title: "Connecting Stripe", slug: "connect-stripe" },
      { title: "Understanding fees", slug: "fees" },
      { title: "Payout schedules", slug: "payout-schedules" },
      { title: "Tax information", slug: "taxes" },
      { title: "Refunds and disputes", slug: "refunds" },
    ],
  },
  {
    title: "Store Builder",
    icon: Globe,
    description: "Customize your store appearance",
    articles: [
      { title: "Using the Store Builder", slug: "store-builder-basics" },
      { title: "Customizing your theme", slug: "themes" },
      { title: "Adding your logo and branding", slug: "branding" },
      { title: "Custom domains", slug: "custom-domains" },
    ],
  },
  {
    title: "OnePage",
    icon: Link2,
    description: "Create your link-in-bio page",
    articles: [
      { title: "Setting up OnePage", slug: "onepage-setup" },
      { title: "Adding links and blocks", slug: "onepage-blocks" },
      { title: "Customizing appearance", slug: "onepage-appearance" },
      { title: "Analytics for OnePage", slug: "onepage-analytics" },
    ],
  },
  {
    title: "Email Marketing",
    icon: Mail,
    description: "Engage with your audience via email",
    articles: [
      { title: "Building your email list", slug: "email-list" },
      { title: "Creating email campaigns", slug: "email-campaigns" },
      { title: "Email templates", slug: "email-templates" },
      { title: "Automation sequences", slug: "email-automation" },
      { title: "Managing subscribers", slug: "subscribers" },
    ],
  },
  {
    title: "Analytics",
    icon: BarChart3,
    description: "Track your store performance",
    articles: [
      { title: "Understanding analytics", slug: "analytics-overview" },
      { title: "Sales reports", slug: "sales-reports" },
      { title: "Traffic sources", slug: "traffic-sources" },
      { title: "Conversion tracking", slug: "conversion-tracking" },
    ],
  },
  {
    title: "Account & Settings",
    icon: Settings,
    description: "Manage your account settings",
    articles: [
      { title: "Profile settings", slug: "profile-settings" },
      { title: "Security settings", slug: "security-settings" },
      { title: "Notification preferences", slug: "notifications" },
      { title: "Billing and plans", slug: "billing" },
      { title: "Deleting your account", slug: "delete-account" },
    ],
  },
]

const popularArticles = [
  { title: "How to create your first product", category: "Getting Started" },
  { title: "Setting up Stripe payments", category: "Payments" },
  { title: "Customizing your store theme", category: "Store Builder" },
  { title: "Building your email list", category: "Email Marketing" },
  { title: "Understanding your analytics", category: "Analytics" },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Page header — same structure as /terms and /privacy */}
      <div className="bg-gradient-to-b from-[#fafafa] to-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <BackButton />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center shrink-0 mt-1">
              <HelpCircle className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div className="flex-1">
              <h1 className="text-[32px] sm:text-[42px] font-bold text-[#1a1a2e] tracking-tight leading-tight">
                Help Center
              </h1>
              <p className="text-[14px] text-[#6b7280] mt-2">
                Find answers and learn how to get the most out of Storelib.
              </p>
              {/* Search */}
              <div className="mt-5 max-w-xl">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search for help articles..."
                    className="w-full h-11 pl-12 pr-4 rounded-xl border border-[#e5e7eb] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-transparent bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Popular Articles */}
        <section className="mb-12">
          <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-4">Popular Articles</h2>
          <div className="grid gap-3">
            {popularArticles.map((article, index) => (
              <a
                key={index}
                href="#"
                className="flex items-center justify-between p-4 bg-[#fafafa] rounded-xl hover:bg-[#f3f4f6] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-[#8b5cf6]" />
                  <div>
                    <p className="text-[14px] font-medium text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                      {article.title}
                    </p>
                    <p className="text-[12px] text-[#9ca3af]">{article.category}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#9ca3af] group-hover:text-[#8b5cf6] transition-colors" />
              </a>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section>
          <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-6">Browse by Category</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {categories.map((category, index) => {
              const Icon = category.icon
              return (
                <div
                  key={index}
                  className="border border-[#e5e7eb] rounded-2xl p-5 hover:border-[#d1d5db] transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#f3f4f6] flex items-center justify-center">
                      <Icon className="h-5 w-5 text-[#8b5cf6]" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{category.title}</h3>
                      <p className="text-[12px] text-[#9ca3af]">{category.description}</p>
                    </div>
                  </div>
                  <ul className="space-y-2 mt-4">
                    {category.articles.slice(0, 4).map((article, articleIndex) => (
                      <li key={articleIndex}>
                        <a
                          href="#"
                          className="text-[13px] text-[#6b7280] hover:text-[#8b5cf6] transition-colors flex items-center gap-1.5"
                        >
                          <ChevronRight className="h-3 w-3" />
                          {article.title}
                        </a>
                      </li>
                    ))}
                    {category.articles.length > 4 && (
                      <li>
                        <a
                          href="#"
                          className="text-[13px] text-[#8b5cf6] hover:text-[#7c3aed] transition-colors font-medium"
                        >
                          View all {category.articles.length} articles
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* Contact Support */}
        <section className="mt-12 bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] rounded-2xl p-8 text-center text-white">
          <HelpCircle className="h-10 w-10 mx-auto mb-4 opacity-80" />
          <h2 className="text-[20px] font-semibold mb-2">Still need help?</h2>
          <p className="text-[14px] opacity-90 mb-6 max-w-md mx-auto">
            Can't find what you're looking for? Our support team is here to help you with any questions.
          </p>
          <a
            href="mailto:support@storelib.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#8b5cf6] rounded-xl text-[14px] font-medium hover:bg-opacity-90 transition-colors"
          >
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
        </section>

        {/* Quick Links */}
        <section className="mt-12 pt-8 border-t border-[#e5e7eb]">
          <div className="flex flex-wrap justify-center gap-6 text-[13px]">
            <Link href="/privacy" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Terms of Service
            </Link>
            <Link href="/app/changelog" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Changelog
            </Link>
            <a href="mailto:support@storelib.com" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              support@storelib.com
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
