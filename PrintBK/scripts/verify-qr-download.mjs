import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const staffRequire = createRequire(path.resolve("staff/package.json"));
const { PDFDocument } = staffRequire("pdf-lib");
const { chromium } = staffRequire("@playwright/test");

const clientDir = path.resolve("client");
const evidenceDir = path.resolve("docs/fix-evidence/after");
fs.mkdirSync(evidenceDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, "http://localhost:4188");
  let pathname = urlObj.pathname;
  
  // Mock API endpoints to avoid connection errors in staff app
  if (pathname.startsWith("/server/api/") || pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", orders: [], stats: {} }));
  }

  let filePath;
  if (pathname === "/staff/" || pathname === "/staff") {
    filePath = path.join(clientDir, "staff/index.html");
  } else if (pathname.startsWith("/staff/")) {
    filePath = path.join(clientDir, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(clientDir, "staff", pathname.replace(/^\/staff\//, ""));
    }
  } else {
    filePath = path.join(clientDir, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    return res.end(fs.readFileSync(filePath));
  }
  
  res.writeHead(404);
  res.end("Not Found: " + pathname);
});

async function run() {
  await new Promise(r => server.listen(4188, r));
  console.log("Mock static server listening on 4188");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  
  const consoleLogs = [];
  page.on("console", msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", err => {
    console.error("PAGE ERROR:", err);
  });

  await page.goto("http://localhost:4188/staff/");
  await page.evaluate(() => {
    localStorage.setItem("printbk-paired", "true");
    localStorage.setItem("printbk_staff_paired", "true");
    localStorage.setItem("printbk_staff_device_id", "staff_master_pc");
    localStorage.setItem("printbk_staff_token", "test_token");
  });
  await page.goto("http://localhost:4188/staff/");
  
  await page.waitForSelector("button:has-text('Settings')", { timeout: 10000 });
  await page.click("button:has-text('Settings')");
  
  await page.waitForSelector("button:has-text('PRINT YOUR QR')", { timeout: 10000 });
  await page.click("button:has-text('PRINT YOUR QR')");
  
  await page.waitForSelector(".qr-modal-container", { timeout: 10000 });
  console.log("QR Modal is open.");

  const posterEl = await page.$(".qr-poster-printable");
  if (posterEl) {
    await posterEl.screenshot({ path: path.join(evidenceDir, "qr-poster-element.png") });
    console.log("Captured poster element screenshot to docs/fix-evidence/after/qr-poster-element.png");
  }

  // Click DOWNLOAD A4 PDF
  const downloadPromise = page.waitForEvent("download");
  await page.click("button:has-text('DOWNLOAD A4 PDF')");
  const download = await downloadPromise;
  
  const targetPdf = path.join(evidenceDir, "downloaded-from-app-verified.pdf");
  await download.saveAs(targetPdf);
  console.log("Successfully intercepted download:", targetPdf);

  const pdfBytes = fs.readFileSync(targetPdf);
  console.log("Downloaded PDF size (bytes):", pdfBytes.length);

  // Validate PDF with pdf-lib
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  console.log(`PDF Page Count: ${pageCount}`);
  console.log(`Page Dimensions: ${width} x ${height} (A4 standard: 595.28 x 841.89)`);

  // Also test browser print output via page.pdf()
  await page.emulateMedia({ media: 'print' });
  const browserPrintPdfPath = path.join(evidenceDir, "browser-print-verified.pdf");
  await page.pdf({
    path: browserPrintPdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
  });
  console.log("Generated browser print PDF:", browserPrintPdfPath);
  const browserPdfDoc = await PDFDocument.load(fs.readFileSync(browserPrintPdfPath));
  const browserPrintPageCount = browserPdfDoc.getPageCount();
  console.log("Browser Print Page Count:", browserPrintPageCount);

  // Check console logs for any CSP violation
  const cspViolations = consoleLogs.filter(l => l.toLowerCase().includes("content security policy") || l.toLowerCase().includes("refused"));
  console.log("CSP violations found:", cspViolations.length);
  if (cspViolations.length > 0) {
    console.error("CSP logs:", cspViolations);
  }

  await browser.close();
  server.close();

  if (pageCount !== 1) {
    throw new Error(`Expected exactly 1 page, got ${pageCount}`);
  }
  if (pdfBytes.length < 5000) {
    throw new Error(`PDF size suspiciously small: ${pdfBytes.length} bytes`);
  }
  if (cspViolations.length > 0) {
    throw new Error(`Encountered CSP violations during download`);
  }

  console.log("✅ VERIFICATION SUCCESSFUL: Downloaded PDF is valid, exactly 1 page, generated cleanly with 0 CSP errors!");
}

run().catch(err => {
  console.error("Verification failed:", err);
  server.close();
  process.exit(1);
});
