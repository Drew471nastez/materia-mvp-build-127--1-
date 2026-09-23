"use client"

import { Badge, Card, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * The site's pages, and the way into each. Nothing is edited here: a page is
 * sections, and sections are edited in the builder, which has the preview,
 * the undo and the save. This is the list, and the door.
 */
export function PageSettings({ ctx }: { ctx: SettingsContext }) {
  return (
    <>
      <PageTitle aside={<button type="button" onClick={ctx.onAddPage} className={buttonClass}>Add page</button>}>
        Pages & Navigation
      </PageTitle>

      <Card title="Pages">
        {ctx.pages.map((page) => (
          <Row
            key={page.key}
            label={
              <span className="flex items-center gap-2">
                {page.name}
                {page.key === "home" && <Badge tone="neutral">Homepage</Badge>}
              </span>
            }
            hint={page.path}
          >
            <button type="button" onClick={() => ctx.onEditPage(page.key)} className={buttonClass}>
              Edit
            </button>
          </Row>
        ))}
      </Card>

      <Card title="Navigation">
        <Row label="Menu" hint="The links in your header. They are part of the header section.">
          <button type="button" onClick={ctx.onEditMenu} className={buttonClass}>
            Edit menu
          </button>
        </Row>
      </Card>
    </>
  )
}
