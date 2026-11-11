/** Hydrate the exact server-rendered hero; no duplicate design implementation. */
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { Hero } from "@/components/marketing/hero"
hydrateRoot(
  document.getElementById("app")!,
  <>
    <BodyScrollRestorer />
    <div data-homepage-surface="" className="bg-white">
      <Hero />
      <BuildShowcase />
    </div>
  </>,
)
