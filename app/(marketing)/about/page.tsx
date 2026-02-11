"use client";

import Link from "next/link";
import { Heart, Zap, DollarSign, Users, Package, TrendingUp, Globe } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block mb-4 px-4 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">
            About Us
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            About Storelib
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Empowering digital creators worldwide to build, launch, and grow their businesses with the simplest platform for selling digital products.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-gray-50 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 text-center">
            Our Mission
          </h2>
          <div className="bg-white rounded-2xl p-8 md:p-12 border border-gray-200">
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              At Storelib, we believe every creator deserves the tools to monetize their expertise without technical barriers or excessive fees. Our mission is to make selling digital products simple, accessible, and affordable for creators worldwide.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Whether you're selling e-books, courses, templates, or digital art, we provide everything you need: beautiful storefronts that reflect your brand, instant delivery systems that delight your customers, and transparent pricing that respects your earnings.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              We're committed to keeping transaction fees low, features powerful yet simple, and support always available. Your success is our success, and we're here to help you every step of the way.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
            Our Values
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Creator First */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 hover:border-purple-200 transition-colors">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Heart className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Creator First
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Everything we build is designed with creators in mind. Your needs, your feedback, and your success drive every decision we make.
              </p>
            </div>

            {/* Simplicity */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 hover:border-purple-200 transition-colors">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Simplicity
              </h3>
              <p className="text-gray-600 leading-relaxed">
                No technical skills required. No complicated setup. Just a clean, intuitive platform that anyone can use to start selling in minutes.
              </p>
            </div>

            {/* Transparency */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 hover:border-purple-200 transition-colors">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <DollarSign className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Transparency
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Simple, straightforward pricing with no hidden fees. You always know exactly what you're paying and what you're getting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gray-50 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
            Our Impact
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Creators */}
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                10K+
              </div>
              <div className="text-gray-600 text-sm md:text-base">
                Creators
              </div>
            </div>

            {/* Products Sold */}
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                100K+
              </div>
              <div className="text-gray-600 text-sm md:text-base">
                Products Sold
              </div>
            </div>

            {/* Creator Earnings */}
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                $2M+
              </div>
              <div className="text-gray-600 text-sm md:text-base">
                Creator Earnings
              </div>
            </div>

            {/* Countries */}
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                150+
              </div>
              <div className="text-gray-600 text-sm md:text-base">
                Countries
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Ready to start your creator journey?
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of creators who have already launched their digital product businesses with Storelib.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gray-900 text-white px-8 py-4 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
