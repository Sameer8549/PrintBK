import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function generateTestPrintPdf(printerName: string, shopInfo?: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 (72 dpi)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const shopName = shopInfo?.name || 'HKBK Student Point';

  // Title & Header
  page.drawText('PrintBK System & Spooler Test Page', {
    x: 50,
    y: 790,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1)
  });

  page.drawText(`${shopName} · Shop PC Agent Hardware Diagnostics`, {
    x: 50,
    y: 765,
    size: 13,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3)
  });

  // Printer metadata box
  page.drawRectangle({
    x: 50,
    y: 670,
    width: 495,
    height: 75,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.97)
  });

  page.drawText(`Target Printer: ${printerName}`, { x: 65, y: 720, size: 14, font: fontBold });
  page.drawText(`Driver Status: Spooler Online & Verified`, { x: 65, y: 700, size: 12, font: fontRegular });
  page.drawText(`Timestamp: ${new Date().toLocaleString()}`, { x: 65, y: 682, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  // 1. CMYK Colour Calibration Bars
  page.drawText('Colour Space Balance (CMYK / RGB Check)', { x: 50, y: 635, size: 13, font: fontBold });

  const colors = [
    { label: 'Cyan', c: rgb(0, 0.8, 0.9) },
    { label: 'Magenta', c: rgb(0.9, 0.1, 0.6) },
    { label: 'Yellow', c: rgb(0.95, 0.9, 0.1) },
    { label: 'Black', c: rgb(0.1, 0.1, 0.1) },
    { label: 'Red', c: rgb(0.9, 0.15, 0.15) },
    { label: 'Green', c: rgb(0.15, 0.7, 0.25) },
    { label: 'Blue', c: rgb(0.15, 0.25, 0.85) }
  ];

  const barWidth = 65;
  const barHeight = 35;
  colors.forEach((col, idx) => {
    const xPos = 50 + (idx * (barWidth + 6));
    page.drawRectangle({
      x: xPos,
      y: 590,
      width: barWidth,
      height: barHeight,
      color: col.c
    });
    page.drawText(col.label, { x: xPos + 2, y: 575, size: 10, font: fontRegular });
  });

  // 2. Grayscale Density Gradient (10% to 100%)
  page.drawText('Grayscale Density & Halftone Steps (10% - 100%)', { x: 50, y: 535, size: 13, font: fontBold });
  for (let i = 1; i <= 10; i++) {
    const val = 1 - (i * 0.1);
    const xPos = 50 + ((i - 1) * 49);
    page.drawRectangle({
      x: xPos,
      y: 495,
      width: 45,
      height: 30,
      color: rgb(val, val, val)
    });
    page.drawText(`${i * 10}%`, { x: xPos + 10, y: 480, size: 9, font: fontRegular });
  }

  // 3. Margin & Border Registration Crosshairs
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 555.28,
    height: 801.89,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5
  });
  page.drawText('5mm Registration Boundary', { x: 25, y: 25, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });

  page.drawText('If this page printed clearly with even tones and sharp text, this printer is ready for student orders.', {
    x: 50,
    y: 100,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.5, 0.2)
  });

  return await doc.save();
}

export async function generateQrPrintPdf(qrUrl: string, shopInfo?: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 (595.28 x 841.89 pt)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const shopName = shopInfo?.name || 'HKBK Student Point';
  const address = shopInfo?.address || 'HKBK College Campus, Bengaluru';
  const deleteDelay = shopInfo?.delete_delay_minutes || 5;
  const rates = shopInfo?.rates || {
    bw: 1.50,
    colour: 8.00,
    duplex: 0.85,
    photo4x6: 20,
    bindingSpiral: 30,
    laminationA4: 20
  };

  // 1. Outer A4 Border (margins >= 15mm / ~42pt)
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 539.28,
    height: 785.89,
    borderColor: rgb(0.08, 0.08, 0.08),
    borderWidth: 2,
    color: rgb(0.99, 0.99, 0.99)
  });

  // 2. Embed Single Canonical Logo (HKBK official logo)
  const candidateLogos = [
    path.resolve(__dirname, '../public/hkbk-logo.jpg'),
    path.resolve(__dirname, '../../public/hkbk-logo.jpg'),
    path.resolve(process.cwd(), 'agent/public/hkbk-logo.jpg'),
    path.resolve(process.cwd(), 'staff/public/hkbk-logo.jpg'),
    path.resolve(__dirname, '../../staff/public/hkbk-logo.jpg'),
    path.resolve(__dirname, '../../../staff/public/hkbk-logo.jpg'),
  ];
  const logoPath = candidateLogos.find(p => fs.existsSync(p));

  if (logoPath) {
    try {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImage = await doc.embedJpg(logoBytes);
      page.drawImage(logoImage, {
        x: 48,
        y: 728,
        width: 56,
        height: 56
      });
    } catch (_) {}
  }

  // Header Typography
  page.drawText(shopName, {
    x: 118,
    y: 760,
    size: 20,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08)
  });

  page.drawText('CAMPUS DIGITAL PRINT COUNTER', {
    x: 118,
    y: 742,
    size: 10,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4)
  });

  page.drawText(address, {
    x: 118,
    y: 730,
    size: 9,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5)
  });

  // Header Divider
  page.drawLine({
    start: { x: 48, y: 712 },
    end: { x: 547.28, y: 712 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85)
  });

  // 3. Hero Banner
  page.drawRectangle({
    x: 48,
    y: 672,
    width: 499.28,
    height: 30,
    color: rgb(0.08, 0.08, 0.08)
  });

  const heroBannerText = 'FAST SELF-SERVICE MOBILE PRINTING';
  const heroTextWidth = fontBold.widthOfTextAtSize(heroBannerText, 12);
  page.drawText(heroBannerText, {
    x: (595.28 - heroTextWidth) / 2,
    y: 681,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  // Title: "Scan this QR for Fast Printing"
  const titleText = 'Scan this QR for Fast Printing';
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 19);
  page.drawText(titleText, {
    x: (595.28 - titleWidth) / 2,
    y: 642,
    size: 19,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08)
  });

  const subText = 'Upload documents & photos directly from your phone — no app or signup required';
  const subWidth = fontRegular.widthOfTextAtSize(subText, 10.5);
  page.drawText(subText, {
    x: (595.28 - subWidth) / 2,
    y: 624,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35)
  });

  // 4. Vector High-DPI QR Code Generation
  const qrSize = 195;
  const qrX = (595.28 - qrSize) / 2;
  const qrY = 415;

  // Background frame around QR code
  page.drawRectangle({
    x: qrX - 8,
    y: qrY - 8,
    width: qrSize + 16,
    height: qrSize + 16,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 2,
    color: rgb(1, 1, 1)
  });

  const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 1,
    scale: 10,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  const qrImage = await doc.embedPng(qrPngBuffer);
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize
  });

  // QR Instruction Chip
  const qrHint = 'Open camera or scanner on any phone';
  const hintWidth = fontRegular.widthOfTextAtSize(qrHint, 10);
  page.drawText(qrHint, {
    x: (595.28 - hintWidth) / 2,
    y: 395,
    size: 10,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4)
  });

  const linkText = qrUrl;
  const linkWidth = fontBold.widthOfTextAtSize(linkText, 10);
  page.drawText(linkText, {
    x: (595.28 - linkWidth) / 2,
    y: 380,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.35, 0.85)
  });

  // 5. Dynamic Campus Service Rates Strip
  page.drawLine({
    start: { x: 48, y: 366 },
    end: { x: 547.28, y: 366 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88)
  });

  page.drawText('POPULAR SERVICES & CAMPUS RATES', {
    x: 48,
    y: 350,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2)
  });

  const rateCards = [
    { label: 'B&W Print', price: `Rs ${Number(rates.bw || 1.5).toFixed(2)}/pg` },
    { label: 'Colour Print', price: `Rs ${Number(rates.colour || 8.0).toFixed(2)}/pg` },
    { label: 'Double-Sided', price: `Rs ${Number(rates.duplex || 0.85).toFixed(2)}/pg` },
    { label: 'Photo Prints', price: `Rs ${Number(rates.photo4x6 || 20).toFixed(2)}` },
    { label: 'Spiral Binding', price: `Rs ${Number(rates.bindingSpiral || 30).toFixed(2)}` },
    { label: 'Lamination A4', price: `Rs ${Number(rates.laminationA4 || 20).toFixed(2)}` },
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
      color: rgb(0.96, 0.96, 0.96)
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
    color: rgb(0.88, 0.88, 0.88)
  });

  const steps = [
    { num: '1', title: 'SCAN QR CODE', desc: 'Scan with any phone camera, Google Lens, or UPI app to launch.' },
    { num: '2', title: 'UPLOAD & CONFIGURE', desc: 'Upload PDF, DOCX, or Photos. Choose B&W or colour and copies.' },
    { num: '3', title: 'COLLECT AT COUNTER', desc: 'Pay UPI or Cash. Pick up your documents using your 4-digit code.' }
  ];

  steps.forEach((step, idx) => {
    const sy = stepsY - (idx * 42);
    // Number badge circle
    page.drawCircle({
      x: 64,
      y: sy + 10,
      size: 12,
      color: rgb(0.08, 0.08, 0.08)
    });
    page.drawText(step.num, {
      x: 60.5,
      y: sy + 6,
      size: 11,
      font: fontBold,
      color: rgb(1, 1, 1)
    });
    page.drawText(step.title, {
      x: 86,
      y: sy + 12,
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.08)
    });
    page.drawText(step.desc, {
      x: 86,
      y: sy + 0,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4)
    });
  });

  // 7. Footer & Privacy note
  page.drawLine({
    start: { x: 48, y: 125 },
    end: { x: 547.28, y: 125 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88)
  });

  const privacyText = `Private & Secure: Files are deleted ${deleteDelay} minutes after printing.`;
  const privacyWidth = fontBold.widthOfTextAtSize(privacyText, 10);
  page.drawText(privacyText, {
    x: (595.28 - privacyWidth) / 2,
    y: 104,
    size: 10,
    font: fontBold,
    color: rgb(0.15, 0.55, 0.25)
  });

  const footerText = 'Powered by PrintBK · Zero waiting time · Real-time counter queue';
  const footerWidth = fontRegular.widthOfTextAtSize(footerText, 9);
  page.drawText(footerText, {
    x: (595.28 - footerWidth) / 2,
    y: 88,
    size: 9,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5)
  });

  return await doc.save();
}
