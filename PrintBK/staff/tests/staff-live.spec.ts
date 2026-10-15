import { test, expect } from "@playwright/test"

test.describe("Staff Live Feed & Real-time Synchronization", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure paired
    await page.addInitScript(() => {
      window.localStorage.setItem("printbk-paired", "true")
      window.localStorage.setItem("printbk_staff_token", "test-device-token")
    })
  })

  test("Delta feed updates item states and handles added/removed items live", async ({ page }) => {
    let callCount = 0

    // Mock /server/api/staff/live
    await page.route("**/server/api/staff/live*", async (route) => {
      callCount++
      if (callCount === 1) {
        // Initial snapshot: 2 items
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            cursor: "c1",
            shop: { open: true },
            printers: [{ id: "p1", name: "EPSON L3110", role: "bw", online: true }],
            items: [
              {
                id: "item-101",
                order_id: 101,
                order_number: 101,
                pickup_code: "9911",
                kind: "document_bw",
                status: "ready_to_print",
                payment_status: "cash_collected",
                price: 45.0,
                pages_done: 0,
                pages_total: 10,
                created_at: new Date(Date.now() - 60000).toISOString(),
                payload: {
                  fileName: "Project_Report.pdf",
                  fileCount: 1,
                  copies: 1,
                  pagesTotal: 10,
                  duplex: true,
                  paperSize: "A4",
                },
              },
            ],
            removedItemIds: [],
            recentlyPrinted: [],
            counters: { waiting: 1, cashToCollect: 0, upiToVerify: 0, printedToday: 0, collectedToday: 45 },
          }),
        })
      } else {
        // Second poll: item-101 is now printing, new item-102 arrives
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            cursor: "c2",
            items: [
              {
                id: "item-101",
                order_id: 101,
                order_number: 101,
                pickup_code: "9911",
                kind: "document_bw",
                status: "printing",
                payment_status: "cash_collected",
                price: 45.0,
                pages_done: 5,
                pages_total: 10,
                created_at: new Date(Date.now() - 60000).toISOString(),
                payload: {
                  fileName: "Project_Report.pdf",
                  copies: 1,
                  pagesTotal: 10,
                  duplex: true,
                },
              },
              {
                id: "item-102",
                order_id: 102,
                order_number: 102,
                pickup_code: "8822",
                kind: "document_colour",
                status: "ready_to_print",
                payment_status: "upi_claimed",
                price: 120.0,
                pages_done: 0,
                pages_total: 15,
                created_at: new Date().toISOString(),
                payload: {
                  fileName: "Colour_Brochure.pdf",
                  copies: 2,
                  pagesTotal: 15,
                },
              },
            ],
            removedItemIds: [],
            recentlyPrinted: [],
            counters: { waiting: 2, cashToCollect: 0, upiToVerify: 1, printedToday: 0, collectedToday: 165 },
          }),
        })
      }
    })

    await page.goto("/?view=orders")

    // Initially order #101 should appear with "Ready to print"
    await expect(page.locator(".row-order strong:has-text('#101')")).toBeVisible({ timeout: 5000 })
    await expect(page.locator("text=Ready to print").first()).toBeVisible()

    // Within polling cycle (1s), live delta arrives: #101 transitions to Printing 5/10 and #102 appears
    await expect(page.locator(".row-order strong:has-text('#102')")).toBeVisible({ timeout: 5000 })
    await expect(page.locator("text=Printing 5/10").first()).toBeVisible()
    await expect(page.locator("text=UPI PAID").first()).toBeVisible()
  })

  test("Action 409 Conflict error displays toast and does not crash app", async ({ page }) => {
    await page.route("**/server/api/staff/live*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cursor: "c1",
          shop: { open: true },
          printers: [{ id: "p1", name: "EPSON L3110", role: "bw", online: true }],
          items: [
            {
              id: "item-201",
              order_id: 201,
              order_number: 201,
              pickup_code: "1234",
              kind: "document_bw",
              status: "ready_to_print",
              payment_status: "pending_cash",
              price: 25.0,
              pages_done: 0,
              pages_total: 5,
              created_at: new Date().toISOString(),
              payload: { fileName: "Document.pdf" },
            },
          ],
          removedItemIds: [],
          recentlyPrinted: [],
        }),
      })
    })

    // Mock 409 Conflict on collect cash
    await page.route("**/server/api/staff/orders/201/collect-cash", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Order is not in pending_cash state" }),
      })
    })

    await page.goto("/?view=orders")
    await expect(page.locator(".row-order strong:has-text('#201')")).toBeVisible({ timeout: 5000 })

    // Click COLLECT CASH
    const collectBtn = page.locator(".row-controls button:has-text('COLLECT CASH')").first()
    await expect(collectBtn).toBeVisible()
    await collectBtn.click()

    // Toast error should appear
    await expect(page.locator(".toast")).toBeVisible({ timeout: 3000 })
    await expect(page.locator("text=Order is not in pending_cash state")).toBeVisible()
  })

  test("Offline indicator reacts to network disconnect and reconnection", async ({ page, context }) => {
    await page.route("**/server/api/staff/live*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cursor: "c1",
          shop: { open: true },
          printers: [],
          items: [],
          removedItemIds: [],
          recentlyPrinted: [],
        }),
      })
    })

    await page.goto("/?view=orders")
    await expect(page.locator(".live-status b")).toHaveText("LIVE")

    // Simulate network drop
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event("offline")))

    // Should indicate OFFLINE
    await expect(page.locator(".live-status.is-offline")).toBeVisible()
    await expect(page.locator(".live-status b")).toHaveText("OFFLINE")

    // Restore network
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event("online")))

    // Should recover to LIVE
    await expect(page.locator(".live-status b")).toHaveText("LIVE")
  })
})
