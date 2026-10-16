import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

export interface QrShopRates {
  bw?: number;
  colour?: number;
  duplex?: number;
  photo4x6?: number;
  bindingSpiral?: number;
  laminationA4?: number;
}

export interface QrShopInfo {
  name?: string;
  address?: string;
  rates?: QrShopRates;
  delete_delay_minutes?: number;
}

export async function generateQrVectorPdf(qrUrl: string, shopInfo?: QrShopInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 (595.28 x 841.89 pt)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const shopName = shopInfo?.name || "HKBK Student Point";
  const address = shopInfo?.address || "HKBK College Campus, Bengaluru";
  const deleteDelay = shopInfo?.delete_delay_minutes || 5;
  const rates = shopInfo?.rates || {
    bw: 1.5,
    colour: 8.0,
    duplex: 0.85,
    photo4x6: 20,
    bindingSpiral: 30,
    laminationA4: 20,
  };

  // 1. Outer A4 Border (margins >= 15mm / ~42pt)
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 539.28,
    height: 785.89,
    borderColor: rgb(0.08, 0.08, 0.08),
    borderWidth: 2,
    color: rgb(0.99, 0.99, 0.99),
  });

  // 2. Embed Single Canonical Logo (HKBK official logo)
  try {
    const res = await fetch("./hkbk-logo.jpg");
    if (res.ok) {
      const logoBytes = await res.arrayBuffer();
      const logoImage = await doc.embedJpg(logoBytes);
      page.drawImage(logoImage, {
        x: 48,
        y: 728,
        width: 56,
        height: 56,
      });
    }
  } catch (_) {
    // If fetch fails in some environment, continue without image
  }

  // Header Typography
  page.drawText(shopName, {
    x: 118,
    y: 760,
    size: 20,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  page.drawText("CAMPUS DIGITAL PRINT COUNTER", {
    x: 118,
    y: 742,
    size: 10,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(address, {
    x: 118,
    y: 730,
    size: 9,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Header Divider
  page.drawLine({
    start: { x: 48, y: 712 },
    end: { x: 547.28, y: 712 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // 3. Hero Banner
  page.drawRectangle({
    x: 48,
    y: 672,
    width: 499.28,
    height: 30,
    color: rgb(0.08, 0.08, 0.08),
  });

  const heroBannerText = "FAST SELF-SERVICE MOBILE PRINTING";
  const heroTextWidth = fontBold.widthOfTextAtSize(heroBannerText, 12);
  page.drawText(heroBannerText, {
    x: (595.28 - heroTextWidth) / 2,
    y: 681,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Title: "Scan this QR for Fast Printing"
  const titleText = "Scan this QR for Fast Printing";
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 19);
  page.drawText(titleText, {
    x: (595.28 - titleWidth) / 2,
    y: 642,
    size: 19,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  const subText = "Upload documents & photos directly from your phone — no app or signup required";
  const subWidth = fontRegular.widthOfTextAtSize(subText, 10.5);
  page.drawText(subText, {
    x: (595.28 - subWidth) / 2,
    y: 624,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  // 4. Vector High-DPI QR Code Generation
  const qrSize = 195;
  const qrX = (595.28 - qrSize) / 2;
  const qrY = 415;

  page.drawRectangle({
    x: qrX - 8,
    y: qrY - 8,
    width: qrSize + 16,
    height: qrSize + 16,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 2,
    color: rgb(1, 1, 1),
  });

  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    scale: 10,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });

  const qrRes = await fetch(qrDataUrl);
  const qrPngBytes = await qrRes.arrayBuffer();
  const qrImage = await doc.embedPng(qrPngBytes);
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // QR Instruction Chip
  const qrHint = "Open camera or scanner on any phone";
  const hintWidth = fontRegular.widthOfTextAtSize(qrHint, 10);
  page.drawText(qrHint, {
    x: (595.28 - hintWidth) / 2,
    y: 395,
    size: 10,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const linkText = qrUrl;
  const linkWidth = fontBold.widthOfTextAtSize(linkText, 10);
  page.drawText(linkText, {
    x: (595.28 - linkWidth) / 2,
    y: 380,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.35, 0.85),
  });

  // 5. Dynamic Campus Service Rates Strip
  page.drawLine({
    start: { x: 48, y: 366 },
    end: { x: 547.28, y: 366 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  page.drawText("POPULAR SERVICES & CAMPUS RATES", {
    x: 48,
    y: 350,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const rateCards = [
    { label: "B&W Print", price: `Rs ${Number(rates.bw || 1.5).toFixed(2)}/pg` },
    { label: "Colour Print", price: `Rs ${Number(rates.colour || 8.0).toFixed(2)}/pg` },
    { label: "Double-Sided", price: `Rs ${Number(rates.duplex || 0.85).toFixed(2)}/pg` },
    { label: "Photo Prints", price: `Rs ${Number(rates.photo4x6 || 20).toFixed(2)}` },
    { label: "Spiral Binding", price: `Rs ${Number(rates.bindingSpiral || 30).toFixed(2)}` },
    { label: "Lamination A4", price: `Rs ${Number(rates.laminationA4 || 20).toFixed(2)}` },
  ];

  const colWidth = 78;
  const colGap = 6;
  rateCards.forEach((rc, i) => {
    const rx = 48 + i * (colWidth + colGap);
    page.drawRectangle({
      x: rx,
      y: 308,
      width: colWidth,
      height: 34,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
      color: rgb(0.96, 0.96, 0.96),
    });
    page.drawText(rc.label, { x: rx + 4, y: 328, size: 7.5, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(rc.price, { x: rx + 4, y: 314, size: 9, font: fontBold, color: rgb(0.08, 0.08, 0.08) });
  });

  // 6. 3-Step Simple Instructions
  const stepsY = 275;
  page.drawLine({
    start: { x: 48, y: stepsY + 15 },
    end: { x: 547.28, y: stepsY + 15 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  const steps = [
    { num: "1", title: "SCAN QR CODE", desc: "Scan with any phone camera, Google Lens, or UPI app to launch." },
    { num: "2", title: "UPLOAD & CONFIGURE", desc: "Upload PDF, DOCX, or Photos. Choose B&W or colour and copies." },
    { num: "3", title: "COLLECT AT COUNTER", desc: "Pay UPI or Cash. Pick up your documents using your 4-digit code." },
  ];

  steps.forEach((step, idx) => {
    const sy = stepsY - idx * 42;
    page.drawCircle({
      x: 62,
      y: sy + 14,
      size: 13,
      color: rgb(0.08, 0.08, 0.08),
    });
    page.drawText(step.num, {
      x: 58.5,
      y: sy + 9,
      size: 12,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(step.title, {
      x: 86,
      y: sy + 18,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(step.desc, {
      x: 86,
      y: sy + 5,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  // 7. Footer & Security Privacy Guarantee
  page.drawLine({
    start: { x: 48, y: 130 },
    end: { x: 547.28, y: 130 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  page.drawText("Direct Link:", { x: 48, y: 110, size: 9.5, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(qrUrl, { x: 105, y: 110, size: 9.5, font: fontBold, color: rgb(0.08, 0.08, 0.08) });

  page.drawText(
    `High-speed campus network · Files deleted ${deleteDelay} minutes after printing for privacy`,
    {
      x: 48,
      y: 92,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    }
  );

  page.drawText("PrintBK Official Campus Counter Sign · Printed from Staff Counter Console", {
    x: 48,
    y: 50,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.6, 0.6),
  });

  return await doc.save();
}

export async function downloadQrPdf(qrUrl: string, shopInfo?: QrShopInfo): Promise<void> {
  const bytes = await generateQrVectorPdf(qrUrl, shopInfo);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PrintBK-A4-QR-Poster-${(shopInfo?.name || "Campus").replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function previewQrPdf(qrUrl: string, shopInfo?: QrShopInfo): Promise<void> {
  const bytes = await generateQrVectorPdf(qrUrl, shopInfo);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}
