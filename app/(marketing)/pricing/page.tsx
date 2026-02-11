"use client";

import Link from "next/link";
import { Check, Star, Sparkles, ArrowRight } from "lucide-react";

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Perfect for getting started.",
    features: [
      "6% + $0.25 per transaction",
      "Unlimited digital products",
      "Basic OnePage features",
      "500 emails / month",
    ],
    buttonText: "Get Started Free",
    buttonLink: "/signup",
    highlighted: false,
    badge: null,
    buttonStyle: "primary",
  },
  {
    name: "Growth",
    price: "$19",
    period: "/mo",
    description: "For creators ready to scale and pay lower fees.",
    features: [
      "3% + $0.25 per transaction",
      "Unlimited digital products",
      "Premium OnePage features",
      "Custom domain",
      "Verified badge",
      "2,000 emails / month",
    ],
    buttonText: "Get Started",
    buttonLink: "/signup",
    highlighted: true,
    badge: "Most Popular",
    buttonStyle: "primary",
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For serious creators who want the lowest fees and priority support.",
    features: [
      "1.5% + $0.25 per transaction",
      "Unlimited digital products",
      "Premium OnePage features",
      "Custom domain",
      "Verified badge",
      "5,000 emails / month",
      "Priority support",
    ],
    buttonText: "Get Started",
    buttonLink: "/signup",
    highlighted: false,
    badge: "Recommended",
    buttonStyle: "primary",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#faf5ff] py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1a1a2e] mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-[#6b7280] max-w-2xl mx-auto">
            Scale your business with the right plan for you
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {pricingPlans.map((plan) => (
            <div key={plan.name} className="relative">
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold text-white flex items-center gap-1 ${
                      plan.badge === "Most Popular"
                        ? "bg-[#7c3aed]"
                        : "bg-[#1a1a2e]"
                    }`}
                  >
                    {plan.badge === "Recommended" && (
                      <Star className="w-4 h-4" />
                    )}
                    {plan.badge}
                  </div>
                </div>
              )}

              {/* Card */}
              <div
                className={`h-full bg-white rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "border-2 border-[#7c3aed]/40 shadow-[0_0_30px_-5px_rgba(124,58,237,0.15)] ring-1 ring-[#7c3aed]/10 scale-[1.02]"
                    : "border-2 border-[#e5e7eb] shadow-sm"
                }`}
              >
                {/* Plan Name */}
                <h3 className="text-2xl font-bold text-[#1a1a2e] mb-2">
                  {plan.name}
                </h3>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-4xl font-bold text-[#1a1a2e]">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-[#6b7280] text-lg">{plan.period}</span>
                  )}
                </div>

                {/* Description */}
                <p className="text-[#6b7280] mb-6">{plan.description}</p>

                {/* Features */}
                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          plan.highlighted
                            ? "bg-[#7c3aed]"
                            : "bg-[#ede9fe]"
                        }`}
                      >
                        <Check
                          className={`w-3.5 h-3.5 ${
                            plan.highlighted ? "text-white" : "text-[#7c3aed]"
                          }`}
                        />
                      </div>
                      <span className="text-[#374151] text-sm leading-tight">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <Link
                  href={plan.buttonLink}
                  className={`block w-full text-center py-3 px-6 rounded-lg font-semibold transition-colors ${
                    plan.buttonStyle === "inactive"
                      ? "bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed"
                      : "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  }`}
                >
                  {plan.buttonText}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Note */}
        <div className="text-center">
          <p className="text-[#6b7280] text-sm">
            All plans include core features. Upgrade or downgrade anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
