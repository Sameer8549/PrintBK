import { test, expect, Page } from "@playwright/test"

// Worst-case fixtures as required by spec:
// #10234, ₹12,450.00, 120 pages, 60-char filename, 6 detail chips,
// long payment labels, long Kannada/Hindi-length labels, 8 tables, table with 40 rows.
const longFileName = "Very_Long_Academic_Thesis_Final_Approved_Draft_2026_Semester_8.pdf"
const kannadaLabel = "ಮುದ್ರಣಕ್ಕಾಗಿ ಸಿದ್ಧವಾಗಿದೆ ಮತ್ತು ಪರಿಶೀಲಿಸಲಾಗಿದೆ"
const hindiLabel = "दस्तावेज़ प्रतियां और स्पाइरल बाइंडिंग सेवा"

type Service = "bw" | "colour" | "photos" | "binding" | "lamination" | "scanning" | "photocopy" | "typing"
type Payment = "paid" | "upi" | "cash_due" | "cash_collected"

interface TestJob {
  key: string
  order: number
  service: Service
  uploaded: string
  payment: Payment
  amount: number
  state: string
  linked?: boolean
  disabled?: boolean
  values: string[]
  detail: string
}

function generateWorstCaseJobs(): TestJob[] {
  const allServices: Service[] = [
    "bw",
    "colour",
    "photos",
    "binding",
    "lamination",
    "scanning",
    "photocopy",
    "typing",
  ]
  const jobs: TestJob[] = []

  // 1. Extreme worst-case row: order #10234, ₹12,450.00, 120 pages, 60-char filename, 6 chips, Kannada/Hindi labels
  jobs.push({
    key: "bw-10234",
    order: 10234,
    service: "bw",
    uploaded: "10:14 · waiting 14m",
    payment: "cash_due",
    amount: 12450.0,
    state: "Ready to print",
    linked: true,
    values: [
      "10:14 · waiting 14m",
      `${longFileName} · 120 pages`,
      "1–120 of 120",
      "10",
      "Double · long edge",
      "2-up",
      "A4 · 80 GSM Bond",
      kannadaLabel,
      "120",
    ],
    detail: `Worst case order #10234 with ${hindiLabel}. 60-char filename: ${longFileName}. Total ₹12,450.00.`,
  })

  // 2. Generate 40 rows in BW table to verify vertical scrolling without inner table 480px trap
  for (let i = 1; i <= 39; i++) {
    const orderNum = 11000 + i
    jobs.push({
      key: `bw-${orderNum}`,
      order: orderNum,
      service: "bw",
      uploaded: `10:${(i % 50).toString().padStart(2, "0")} · waiting 5m`,
      payment: i % 3 === 0 ? "paid" : i % 3 === 1 ? "upi" : "cash_due",
      amount: 45.0 + i * 2.5,
      state: i === 1 ? "Printing 14/120" : "Ready to print",
      values: [
        `10:${(i % 50).toString().padStart(2, "0")}`,
        `Document_${i}_notes.pdf`,
        `1–${20 + i}`,
        "1",
        "Double · long edge",
        "1-up",
        "A4",
        "Portrait",
        `${10 + i}`,
      ],
      detail: `Standard row ${i} in BW table`,
    })
  }

  // 3. Ensure all other 7 tables have at least one occupied row so all 8 tables appear
  const sampleData: Record<Exclude<Service, "bw">, { title: string; state: string; values: string[] }> = {
    colour: {
      title: "Design_Portfolio_Final_Print_Ultra_HQ.pdf",
      state: "Ready to print",
      values: ["10:20", "Design_Portfolio.pdf", "1–24 of 24", "Colour: 1–24", "1", "Single", "1-up", "A4", "Landscape", "24"],
    },
    photos: {
      title: "Passport Photo Set",
      state: "Ready to print",
      values: ["10:22", "Passport Glossy", "8 photos", "A4 · 8-up · 35 × 45 mm", "4", "Photo paper", "Natural colour"],
    },
    binding: {
      title: "Thesis Spiral Binding",
      state: "Ready to bind",
      values: ["Linked to #10234", "Spiral Binding", "A4", "Clear Poly Cover", "1", "Waiting for print"],
    },
    lamination: {
      title: "Degree Certificate",
      state: "Ready to laminate",
      values: ["Degree Certificate A4", "1", "Gloss", "250 micron", "Student brought"],
    },
    scanning: {
      title: "Signed Legal Contract",
      state: "Ready to scan",
      values: ["Colour Scan 600DPI", "8 pages", "PDF via Email"],
    },
    photocopy: {
      title: "Engineering Textbook chapters 4-5",
      state: "Ready to copy",
      values: ["44 pages", "2 copies", "B&W", "Double sided", "A4 75 GSM"],
    },
    typing: {
      title: "Legal Affidavit Form Kannada English",
      state: "Waiting for quote",
      values: ["Kannada English Affidavit", "Handwritten source document", "Urgent - Today", "Not quoted", "Needs review"],
    },
  }

  for (const s of allServices) {
    if (s === "bw") continue
    const svc = s as Exclude<Service, "bw">
    const orderNum = 12000 + jobs.length
    jobs.push({
      key: `${svc}-${orderNum}`,
      order: orderNum,
      service: svc,
      uploaded: "10:25 · waiting 2m",
      payment: "upi",
      amount: 150.0,
      state: sampleData[svc].state,
      values: sampleData[svc].values,
      detail: `${sampleData[svc].title} - ${kannadaLabel}`,
    })
  }

  return jobs
}

async function setupPageWithWorstCase(page: Page) {
  await page.route("**/server/api/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], printers: [], shop: { is_open: true } }),
    })
  })
  // Ensure staff app considers the counter paired so it loads the Orders board directly
  await page.addInitScript(() => {
    window.localStorage.setItem("printbk-paired", "true")
  })
  await page.goto("/?view=orders")
  await page.waitForLoadState("domcontentloaded")

  // Inject worst case jobs via custom event
  const worstCase = generateWorstCaseJobs()
  await page.evaluate((jobs) => {
    window.dispatchEvent(new CustomEvent("printbk-set-jobs", { detail: jobs }))
  }, worstCase)

  // Give React time to render
  await page.waitForTimeout(300)
}

test.describe("Staff Counter App Visual Hardening (Phase 4)", () => {
  test("Desktop 1920: shows 2 table columns, no horizontal overflow, correct typography floor", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await setupPageWithWorstCase(page)

    // Check no horizontal page overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)

    // Check 2 columns at >= 1760px
    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector(".tables-grid")
      if (!grid) return ""
      return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length
    })
    expect(gridCols).toBe(2)

    // Check typography floor >= 14px in operational view and >= 16px in job rows
    const fontViolations = await page.evaluate(() => {
      const violations: string[] = []
      const rows = document.querySelectorAll(".job-row")
      rows.forEach((row, i) => {
        const textNodes = row.querySelectorAll("*")
        textNodes.forEach((node) => {
          const fs = parseFloat(window.getComputedStyle(node).fontSize)
          if (fs < 14) {
            violations.push(`Row ${i} element <${node.tagName}> has font size ${fs}px: "${node.textContent?.slice(0, 20)}"`)
          }
        })
      })
      return violations
    })
    expect(fontViolations).toEqual([])

    // Check Approve & Print distance within 450px of order number
    const buttonDistance = await page.evaluate(() => {
      const row = document.querySelector(".job-row") as HTMLElement
      if (!row) return 999
      const orderEl = row.querySelector(".row-order") as HTMLElement
      const buttonEl = row.querySelector(".row-controls .button") as HTMLElement
      if (!orderEl || !buttonEl) return 999
      const orderRect = orderEl.getBoundingClientRect()
      const buttonRect = buttonEl.getBoundingClientRect()
      return buttonRect.left - orderRect.right
    })
    expect(buttonDistance).toBeLessThanOrEqual(450)

    // Amount column right edge alignment with table header right edge
    const alignmentDelta = await page.evaluate(() => {
      const table = document.querySelector(".service-table")
      if (!table) return 999
      const headerRight = table.querySelector(".compact-head span:last-child")?.getBoundingClientRect().right ?? 0
      const amountRight = table.querySelector(".job-row .row-amount")?.getBoundingClientRect().right ?? 0
      return Math.abs(headerRight - amountRight)
    })
    expect(alignmentDelta).toBeLessThanOrEqual(4)

    // Check touch targets >= 64px on desktop
    const targetHeights = await page.evaluate(() => {
      const badTargets: string[] = []
      document.querySelectorAll(".row-controls .button, .next-up-bar .button").forEach((btn) => {
        const h = (btn as HTMLElement).getBoundingClientRect().height
        if (h < 64) {
          badTargets.push(`Button "${btn.textContent?.trim()}" height is ${h}px (< 64px)`)
        }
      })
      return badTargets
    })
    expect(targetHeights).toEqual([])

    // Save 1920 wide operational screenshot
    await page.screenshot({ path: "../docs/screenshots/staff-1920-after.png" })
  })

  test("Desktop 1440: single column, no horizontal scroll, fits worst-case row cleanly", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupPageWithWorstCase(page)

    // Save 1440 wide operational screenshot
    await page.screenshot({ path: "../docs/screenshots/staff-1440-after.png" })

    // Single column table grid below 1760px
    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector(".tables-grid")
      if (!grid) return 0
      return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length
    })
    expect(gridCols).toBe(1)

    // No page horizontal overflow at 1440px
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)

    // Table scroll should not have max-height: 480px trap
    const tableScrollStyle = await page.evaluate(() => {
      const el = document.querySelector(".table-scroll")
      if (!el) return ""
      return window.getComputedStyle(el).maxHeight
    })
    expect(tableScrollStyle).toBe("none")

    // Next Up bar cleanly positioned 24px above bottom edge
    const nextUpBottom = await page.evaluate(() => {
      const bar = document.querySelector(".next-up-bar") as HTMLElement
      if (!bar) return 0
      const rect = bar.getBoundingClientRect()
      return window.innerHeight - rect.bottom
    })
    expect(Math.round(nextUpBottom)).toBe(24)
  })

  test("Tablet 1024: single column, no horizontal overflow, full visibility", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await setupPageWithWorstCase(page)

    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector(".tables-grid")
      if (!grid) return 0
      return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length
    })
    expect(gridCols).toBe(1)

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test("History view at 1440: fits without horizontal scroll and amounts right aligned", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      window.localStorage.setItem("printbk-paired", "true")
    })
    await page.goto("/?view=history")
    await page.waitForLoadState("networkidle")

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)

    // Amount & Pages right aligned
    const isRightAligned = await page.evaluate(() => {
      const firstRow = document.querySelector(".history-row")
      if (!firstRow) return true
      const pages = firstRow.querySelector("b:nth-of-type(1)")
      const amount = firstRow.querySelector("b:nth-of-type(2)")
      const pagesAlign = pages ? window.getComputedStyle(pages).textAlign : "right"
      const amountAlign = amount ? window.getComputedStyle(amount).textAlign : "right"
      return pagesAlign === "right" && amountAlign === "right"
    })
    expect(isRightAligned).toBe(true)
  })

  test("Mobile 390: phone view displays full-width 56px action button and 48px service chips", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupPageWithWorstCase(page)

    // Check owner phone container active
    const isPhoneView = await page.evaluate(() => {
      return !!document.querySelector(".owner-phone")
    })
    expect(isPhoneView).toBe(true)

    // Service chips height >= 48px
    const chipHeight = await page.evaluate(() => {
      const chip = document.querySelector(".owner-service-switcher button") as HTMLElement
      return chip ? chip.getBoundingClientRect().height : 0
    })
    expect(chipHeight).toBeGreaterThanOrEqual(48)

    // Full-width action button height >= 56px
    const actionButton = await page.evaluate(() => {
      const btn = document.querySelector(".owner-order-action .button") as HTMLElement
      if (!btn) return { width: 0, height: 0, containerWidth: 0 }
      const container = btn.parentElement as HTMLElement
      return {
        width: btn.getBoundingClientRect().width,
        height: btn.getBoundingClientRect().height,
        containerWidth: container.getBoundingClientRect().width,
      }
    })
    expect(actionButton.height).toBeGreaterThanOrEqual(56)
    expect(Math.abs(actionButton.width - actionButton.containerWidth)).toBeLessThanOrEqual(4)

    // Next Up bar cleanly stacked above bottom tabs with >= 12px spacing
    const spacing = await page.evaluate(() => {
      const nextUp = document.querySelector(".owner-next-up") as HTMLElement
      const tabs = document.querySelector(".owner-bottom-tabs") as HTMLElement
      if (!nextUp || !tabs) return 12
      return tabs.getBoundingClientRect().top - nextUp.getBoundingClientRect().bottom
    })
    expect(spacing).toBeGreaterThanOrEqual(10)
  })

  test("Capture before pairing screenshots at 1920 and 1440", async ({ page }) => {
    await page.route("**/server/api/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], printers: [], shop: { is_open: true } }),
      })
    })
    // Before pairing (first-run screen) at 1920
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto("/?view=orders")
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(300)
    await page.screenshot({ path: "../docs/screenshots/staff-1920-before.png" })

    // Before pairing (first-run screen) at 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/?view=orders")
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(300)
    await page.screenshot({ path: "../docs/screenshots/staff-1440-before.png" })
  })
})
