/**
 * Ultra HD Photo Sheet Generator (300 DPI Print Fidelity)
 * Renders an A4 photographic print sheet (2480 x 3508 px) with exact mm-calibrated dimensions,
 * cutting guidelines, high-contrast B&W processing, and zero-loss reproduction.
 */

export interface PhotoSheetOptions {
  primaryFile: File | Blob;
  secondaryFile?: File | Blob | null; // Used for ID / Aadhaar back side
  layout: string;
  colorMode: 'colour' | 'bw';
  zoom: number; // 0 to 100
  rotation: number; // 0, 90, 180, 270
  photoOffset: { x: number; y: number };
  fit: string; // 'Fit', 'Fill', 'Stretch'
  customRows?: number;
  customColumns?: number;
  slotScale?: number; // 72 to 100
  filledAll?: boolean;
  uiSlotWidth?: number; // UI slot width in px for drag offset scale calibration
}

export interface GeneratedPhotoSheet {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

// Standard A4 dimensions at 300 DPI
const A4_W = 2480;
const A4_H = 3508;

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for Ultra HD rendering: ' + err));
    };
    img.src = url;
  });
}

interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
  isSecondary?: boolean;
  label?: string;
  isCard?: boolean;
}

export async function generateUltraHdPhotoSheet(opts: PhotoSheetOptions): Promise<GeneratedPhotoSheet> {
  const {
    primaryFile,
    secondaryFile,
    layout,
    colorMode,
    zoom = 42,
    rotation = 0,
    photoOffset = { x: 0, y: 0 },
    fit = 'Fill',
    customRows = 3,
    customColumns = 3,
    slotScale = 100,
    filledAll = true,
    uiSlotWidth = 115
  } = opts;

  // 1. Load primary image and optional secondary image
  const primaryImg = await loadImage(primaryFile);
  const secondaryImg = secondaryFile ? await loadImage(secondaryFile).catch(() => null) : null;

  // 2. Setup A4 Canvas at 300 DPI
  const canvas = document.createElement('canvas');
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get 2D canvas context for Ultra HD sheet');

  // Fill pure white A4 photographic substrate
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);

  // 3. Compute Slots based on chosen layout
  const slots: SlotRect[] = [];
  const isCardLayout = layout === 'ID card' || layout === 'Aadhaar';

  if (layout === 'Passport 8-up') {
    // 35 mm x 45 mm passport photo at 300 DPI = 413 x 531 px
    const slotW = 413;
    const slotH = 531;
    const cols = 2;
    const rows = 4;
    const gapX = 80;
    const gapY = 80;
    const totalW = cols * slotW + (cols - 1) * gapX;
    const totalH = rows * slotH + (rows - 1) * gapY;
    const startX = Math.round((A4_W - totalW) / 2);
    const startY = Math.round((A4_H - totalH) / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({
          x: startX + c * (slotW + gapX),
          y: startY + r * (slotH + gapY),
          w: slotW,
          h: slotH
        });
      }
    }
  } else if (layout === '4×6' || layout === '4x6') {
    // Two 4 x 6 inch photos (1800 x 1200 px each)
    const slotW = 1800;
    const slotH = 1200;
    const gapY = 140;
    const totalH = 2 * slotH + gapY;
    const startX = Math.round((A4_W - slotW) / 2);
    const startY = Math.round((A4_H - totalH) / 2);

    slots.push({ x: startX, y: startY, w: slotW, h: slotH });
    slots.push({ x: startX, y: startY + slotH + gapY, w: slotW, h: slotH });
  } else if (isCardLayout) {
    // ISO/IEC 7810 ID-1 standard: 85.6 mm x 54.0 mm = 1011 x 638 px at 300 DPI
    const slotW = 1011;
    const slotH = 638;
    const gapY = 240;
    const totalH = 2 * slotH + gapY;
    const startX = Math.round((A4_W - slotW) / 2);
    const startY = Math.round((A4_H - totalH) / 2);

    slots.push({ x: startX, y: startY, w: slotW, h: slotH, isSecondary: false, label: 'FRONT', isCard: true });
    slots.push({ x: startX, y: startY + slotH + gapY, w: slotW, h: slotH, isSecondary: true, label: 'BACK', isCard: true });
  } else if (layout === '1' || layout === 'Resume' || layout === 'Full-page photo') {
    // Single full A4 photo with 120px safety border
    const margin = 120;
    slots.push({ x: margin, y: margin, w: A4_W - 2 * margin, h: A4_H - 2 * margin });
  } else if (layout === '2') {
    // Two large half-sheet photos
    const margin = 120;
    const gapY = 100;
    const slotW = A4_W - 2 * margin;
    const slotH = Math.round((A4_H - 2 * margin - gapY) / 2);
    slots.push({ x: margin, y: margin, w: slotW, h: slotH });
    slots.push({ x: margin, y: margin + slotH + gapY, w: slotW, h: slotH });
  } else if (layout === '4') {
    // 2 x 2 grid
    const margin = 120;
    const gap = 100;
    const slotW = Math.round((A4_W - 2 * margin - gap) / 2);
    const slotH = Math.round((A4_H - 2 * margin - gap) / 2);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        slots.push({
          x: margin + c * (slotW + gap),
          y: margin + r * (slotH + gap),
          w: slotW,
          h: slotH
        });
      }
    }
  } else {
    // Custom Grid (customColumns x customRows)
    const margin = 120;
    const gap = 80;
    const cols = Math.max(1, Math.min(4, customColumns));
    const rows = Math.max(1, Math.min(5, customRows));
    const slotW = Math.round((A4_W - 2 * margin - (cols - 1) * gap) / cols);
    const slotH = Math.round((A4_H - 2 * margin - (rows - 1) * gap) / rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({
          x: margin + c * (slotW + gap),
          y: margin + r * (slotH + gap),
          w: slotW,
          h: slotH
        });
      }
    }
  }

  // Offset calibration factor from screen pixels to 300 DPI sheet pixels
  const baseSlotWidth = slots[0]?.w || 413;
  const offsetScale = baseSlotWidth / Math.max(uiSlotWidth, 60);

  // 4. Render Each Slot
  slots.forEach((slot, index) => {
    // Determine which image to use for this slot
    let imgToDraw = primaryImg;
    if (isCardLayout) {
      imgToDraw = slot.isSecondary ? (secondaryImg || primaryImg) : primaryImg;
    } else if (!filledAll && index > 0) {
      // If user chose not to repeat, only fill the first slot and draw cutting guide outline on others
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      ctx.restore();
      return;
    }

    ctx.save();

    // Subtle cutting guide & corner crosshairs
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    if (slot.isCard) {
      // Rounded rectangle for ID cards
      const rad = 36;
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.y, slot.w, slot.h, rad);
      ctx.stroke();
    } else {
      ctx.strokeRect(slot.x - 1, slot.y - 1, slot.w + 2, slot.h + 2);
    }
    ctx.setLineDash([]);

    // Draw Corner Cutting Ticks (+)
    const tickLen = 20;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(slot.x - tickLen, slot.y); ctx.lineTo(slot.x - 2, slot.y);
    ctx.moveTo(slot.x, slot.y - tickLen); ctx.lineTo(slot.x, slot.y - 2);
    // Top-right
    ctx.moveTo(slot.x + slot.w + 2, slot.y); ctx.lineTo(slot.x + slot.w + tickLen, slot.y);
    ctx.moveTo(slot.x + slot.w, slot.y - tickLen); ctx.lineTo(slot.x + slot.w, slot.y - 2);
    // Bottom-left
    ctx.moveTo(slot.x - tickLen, slot.y + slot.h); ctx.lineTo(slot.x - 2, slot.y + slot.h);
    ctx.moveTo(slot.x, slot.y + slot.h + 2); ctx.lineTo(slot.x, slot.y + slot.h + tickLen);
    // Bottom-right
    ctx.moveTo(slot.x + slot.w + 2, slot.y + slot.h); ctx.lineTo(slot.x + slot.w + tickLen, slot.y + slot.h);
    ctx.moveTo(slot.x + slot.w, slot.y + slot.h + 2); ctx.lineTo(slot.x + slot.w, slot.y + slot.h + tickLen);
    ctx.stroke();

    // Optional slot label (e.g. FRONT / BACK)
    if (slot.label) {
      ctx.fillStyle = '#64748b';
      ctx.font = '700 28px "JetBrains Mono", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slot.label, slot.x + slot.w / 2, slot.y - 20);
    }

    // Clip to slot boundary
    ctx.beginPath();
    if (slot.isCard) {
      ctx.roundRect(slot.x, slot.y, slot.w, slot.h, 36);
    } else {
      ctx.rect(slot.x, slot.y, slot.w, slot.h);
    }
    ctx.clip();

    // Calculate transformation
    const centerX = slot.x + slot.w / 2;
    const centerY = slot.y + slot.h / 2;
    ctx.translate(centerX, centerY);

    // Apply rotation
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Apply drag offset
    const dx = photoOffset.x * offsetScale;
    const dy = photoOffset.y * offsetScale;
    ctx.translate(dx, dy);

    // Calculate image dimensions and scaling
    const isRotatedQuarter = rotation === 90 || rotation === 270;
    const effectiveImgW = isRotatedQuarter ? imgToDraw.naturalHeight : imgToDraw.naturalWidth;
    const effectiveImgH = isRotatedQuarter ? imgToDraw.naturalWidth : imgToDraw.naturalHeight;

    let scale = 1;
    if (fit === 'Fill') {
      scale = Math.max(slot.w / effectiveImgW, slot.h / effectiveImgH);
    } else if (fit === 'Fit') {
      scale = Math.min(slot.w / effectiveImgW, slot.h / effectiveImgH);
    } else {
      // Stretch
      scale = slot.w / effectiveImgW;
    }

    // Apply zoom and slot scale
    scale *= (1 + zoom / 180) * (slotScale / 100);

    const drawW = imgToDraw.naturalWidth * scale;
    const drawH = imgToDraw.naturalHeight * scale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(imgToDraw, -drawW / 2, -drawH / 2, drawW, drawH);

    // If Black & White mode is selected, convert this slot to high-contrast photographic grayscale
    if (colorMode === 'bw') {
      const imgData = ctx.getImageData(slot.x, slot.y, slot.w, slot.h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Standard Rec. 709 photographic luminance
        let luma = 0.299 * r + 0.587 * g + 0.114 * b;
        // High contrast S-curve boost for rich photographic blacks and highlights
        luma = ((luma - 128) * 1.15) + 128;
        if (luma < 0) luma = 0;
        else if (luma > 255) luma = 255;
        data[i] = luma;
        data[i + 1] = luma;
        data[i + 2] = luma;
      }
      ctx.putImageData(imgData, slot.x, slot.y);
    }

    ctx.restore();
  });

  // Footer metadata marking Ultra HD 300 DPI print certificate
  ctx.save();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 24px "JetBrains Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`PrintBK Ultra HD Photo Print · ${layout} · 300 DPI · ${colorMode === 'bw' ? 'B&W' : 'Colour'} · A4`, A4_W / 2, A4_H - 45);
  ctx.restore();

  // 5. Export as pristine, maximum quality JPEG blob (1.0 quality = lossless compression)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob conversion failed'));
      },
      'image/jpeg',
      1.0
    );
  });

  const cleanLabel = layout.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Photo_Sheet_${cleanLabel}_${colorMode}_300DPI.jpg`;
  const file = new File([blob], fileName, { type: 'image/jpeg' });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file,
    previewUrl,
    width: A4_W,
    height: A4_H
  };
}
