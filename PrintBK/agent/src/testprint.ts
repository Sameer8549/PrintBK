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
  const page = doc.addPage([595.28, 841.89]); // A4
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const shopName = shopInfo?.name || 'HKBK Student Point';

  // Eye-catching counter sign
  page.drawRectangle({
    x: 40,
    y: 40,
    width: 515.28,
    height: 761.89,
    borderColor: rgb(0, 0, 0),
    borderWidth: 4,
    color: rgb(0.99, 0.99, 0.99)
  });

  // Top header banner
  page.drawRectangle({
    x: 40,
    y: 690,
    width: 515.28,
    height: 111.89,
    color: rgb(0.08, 0.08, 0.08)
  });

  page.drawText('PRINT DIRECTLY FROM YOUR PHONE', {
    x: 65,
    y: 750,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  page.drawText(`${shopName} · Fast Self-Service Printing`, {
    x: 65,
    y: 715,
    size: 14,
    font: fontRegular,
    color: rgb(0.85, 0.85, 0.85)
  });

  // Big QR Code Box with URL
  page.drawRectangle({
    x: 140,
    y: 350,
    width: 315,
    height: 300,
    borderColor: rgb(0, 0, 0),
    borderWidth: 3,
    color: rgb(1, 1, 1)
  });

  // Inner box for QR frame
  page.drawText('SCAN QR CODE', {
    x: 215,
    y: 615,
    size: 20,
    font: fontBold,
    color: rgb(0, 0, 0)
  });

  page.drawText('Open your phone camera & point here', {
    x: 185,
    y: 585,
    size: 13,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3)
  });

  // URL Display
  page.drawRectangle({
    x: 160,
    y: 375,
    width: 275,
    height: 45,
    color: rgb(0.94, 0.94, 0.94)
  });
  page.drawText(qrUrl, {
    x: 175,
    y: 393,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.3, 0.8)
  });

  // 3-step instructions
  const steps = [
    '1. SCAN: Scan with your camera or open browser link',
    '2. SELECT: Choose PDF, DOCX, or Photos & configure pages',
    '3. COLLECT: Pay cash or UPI & pick up your printed pages instantly'
  ];

  steps.forEach((step, idx) => {
    page.drawText(step, {
      x: 70,
      y: 280 - (idx * 45),
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });
  });

  page.drawText('Powered by PrintBK · Zero waiting time · Real-time queue', {
    x: 140,
    y: 70,
    size: 12,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5)
  });

  return await doc.save();
}
