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
    const candidateUrls = [
      "./hkbk-logo.jpg",
      "/staff/hkbk-logo.jpg",
      "/hkbk-logo.jpg",
      "/app/staff/hkbk-logo.jpg",
      "hkbk-logo.jpg"
    ];
    let logoBytes: ArrayBuffer | null = null;
    for (const u of candidateUrls) {
      try {
        const res = await fetch(u);
        if (res.ok) {
          logoBytes = await res.arrayBuffer();
          break;
        }
      } catch (_) {}
    }
    if (logoBytes) {
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
    color: rgb(0.78, 0.94, 0.19),
    borderColor: rgb(0.04, 0.06, 0.13),
    borderWidth: 2,
  });

  const heroBannerText = "FAST SELF-SERVICE MOBILE PRINTING";
  const heroTextWidth = fontBold.widthOfTextAtSize(heroBannerText, 12);
  page.drawText(heroBannerText, {
    x: (595.28 - heroTextWidth) / 2,
    y: 681,
    size: 12,
    font: fontBold,
    color: rgb(0.11, 0.14, 0),
  });

  // Title: "Scan this QR for Fast Printing"
  const titleText = "Scan this QR for Fast Printing";
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 19);
  page.drawText(titleText, {
    x: (595.28 - titleWidth) / 2,
    y: 642,
    size: 19,
    font: fontBold,
    color: rgb(0.04, 0.06, 0.13),
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

  // 4. Vector High-DPI App-Coloured QR Code Generation
  const qrSize = 220;
  const qrX = (595.28 - qrSize) / 2;
  const qrY = 370;

  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    borderColor: rgb(0.04, 0.06, 0.13),
    borderWidth: 3,
    color: rgb(1, 1, 1),
  });

  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    scale: 10,
    color: {
      dark: "#0b1020",
      light: "#c8f031",
    },
  });

  // Decode base64 PNG directly into Uint8Array without calling fetch() to prevent CSP connect-src blocks
  const base64Data = qrDataUrl.includes(",") ? qrDataUrl.split(",")[1] : qrDataUrl;
  const binaryString = atob(base64Data);
  const qrPngBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    qrPngBytes[i] = binaryString.charCodeAt(i);
  }

  const qrImage = await doc.embedPng(qrPngBytes);
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // QR Scan Badge Pill
  const pillWidth = 140;
  const pillHeight = 22;
  const pillX = (595.28 - pillWidth) / 2;
  const pillY = qrY - 18;
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: pillWidth,
    height: pillHeight,
    color: rgb(0.78, 0.94, 0.19),
    borderColor: rgb(0.04, 0.06, 0.13),
    borderWidth: 2,
  });

  const pillText = "SCAN TO PRINT";
  const pillTextWidth = fontBold.widthOfTextAtSize(pillText, 10);
  page.drawText(pillText, {
    x: (595.28 - pillTextWidth) / 2,
    y: pillY + 6.5,
    size: 10,
    font: fontBold,
    color: rgb(0.11, 0.14, 0),
  });

  // QR Instruction Chip
  const qrHint = "Open camera or scanner on any smartphone";
  const hintWidth = fontRegular.widthOfTextAtSize(qrHint, 10.5);
  page.drawText(qrHint, {
    x: (595.28 - hintWidth) / 2,
    y: 334,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const linkText = qrUrl;
  const linkWidth = fontBold.widthOfTextAtSize(linkText, 10.5);
  page.drawText(linkText, {
    x: (595.28 - linkWidth) / 2,
    y: 316,
    size: 10.5,
    font: fontBold,
    color: rgb(0.04, 0.06, 0.13),
  });

  // 5. 3-Step Simple Instructions
  const stepsDividerY = 294;
  page.drawLine({
    start: { x: 48, y: stepsDividerY },
    end: { x: 547.28, y: stepsDividerY },
    thickness: 1.5,
    color: rgb(0.04, 0.06, 0.13),
  });

  page.drawText("HOW IT WORKS IN 3 SIMPLE STEPS", {
    x: 48,
    y: 276,
    size: 10.5,
    font: fontBold,
    color: rgb(0.04, 0.06, 0.13),
  });

  const steps = [
    { num: "1", title: "SCAN QR CODE", desc: "Scan with any phone camera, Google Lens, or UPI app to launch instantly." },
    { num: "2", title: "UPLOAD & CONFIGURE", desc: "Upload PDF, DOCX, or Photos. Choose B&W or colour and number of copies." },
    { num: "3", title: "COLLECT AT COUNTER", desc: "Pay UPI or Cash. Pick up your printed documents using your 4-digit code." },
  ];

  const stepsY = 244;
  steps.forEach((step, idx) => {
    const sy = stepsY - idx * 46;
    page.drawCircle({
      x: 64,
      y: sy + 14,
      size: 13,
      color: rgb(0.78, 0.94, 0.19),
      borderColor: rgb(0.04, 0.06, 0.13),
      borderWidth: 1.5,
    });
    page.drawText(step.num, {
      x: 60.5,
      y: sy + 9,
      size: 12,
      font: fontBold,
      color: rgb(0.11, 0.14, 0),
    });

    page.drawText(step.title, {
      x: 88,
      y: sy + 18,
      size: 11,
      font: fontBold,
      color: rgb(0.04, 0.06, 0.13),
    });

    page.drawText(step.desc, {
      x: 88,
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
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const bytes = await generateQrVectorPdf(qrUrl, shopInfo);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
