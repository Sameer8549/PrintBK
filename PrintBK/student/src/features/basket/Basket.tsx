import React, { useState, useEffect, useRef } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, usePricing, fileFromRaw, rawFileMap } from '../../store/basket';
import { browseAndAddFiles } from '../../lib/filePicker';
import { api } from '../../services/api';
import { type PrintFile, parsePageRange } from '@printbk/shared';
import { DocumentPageSlot, getPdfJsLib } from '../preview/DocumentPageSlot';


/* ─── Option arrays ─────────────────────────────── */
const colorOptions: { value: 'bw' | 'color' | 'auto' | 'custom'; label: string; sub: string }[] = [
  { value: 'bw',     label: 'B&W',        sub: '₹1.50/p' },
  { value: 'color',  label: 'Colour',     sub: '₹8.00/p' },
  { value: 'auto',   label: 'Auto',       sub: 'detect'  },
  { value: 'custom', label: 'Custom',     sub: 'pick pgs' },
];
const sidedOptions: { value: PrintFile['settings']['sided']; label: string; sub: string; icon: string }[] = [
  { value: 'single', label: '1-Sided', sub: '₹1.50/sheet', icon: '1' },
  { value: 'double', label: '2-Sided', sub: '₹0.85/side · Eco', icon: '2' },
];
const nUpOptions: { value: number; label: string; sub: string; icon: string }[] = [
  { value: 1, label: '1-up', sub: 'Full page', icon: '■' },
  { value: 2, label: '2-up', sub: 'Save 50% paper', icon: '◫' },
  { value: 4, label: '4-up', sub: 'Compact grid', icon: '⊞' },
];
const orientationOptions: { value: 'auto' | 'portrait' | 'landscape'; label: string; sub: string; icon: string }[] = [
  { value: 'auto', label: 'Auto', sub: 'Smart fit', icon: 'A' },
  { value: 'portrait', label: 'Portrait', sub: 'Upright', icon: '▯' },
  { value: 'landscape', label: 'Landscape', sub: 'Wide', icon: '▭' },
];
const layoutModeOptions: { value: 'standard' | 'handout' | 'booklet'; label: string; sub: string; icon: string }[] = [
  { value: 'standard', label: 'Standard', sub: 'Full sheet', icon: '1:1' },
  { value: 'handout', label: 'Handout', sub: 'Slide + Notes', icon: '3:1' },
  { value: 'booklet', label: 'Booklet', sub: 'Center fold', icon: '2-up' },
];

function checkZipSafety(zip: any, compressedSize: number) {
  const entries = Object.values(zip.files) as any[];
  if (entries.length > 10000) {
    throw new Error('Zip bomb detected: excessive zip entries (> 10,000)');
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    const uncomp = entry._data?.uncompressedSize ?? 0;
    totalUncompressed += uncomp;
  }
  if (totalUncompressed > 100 * 1024 * 1024) {
    throw new Error('Zip bomb detected: uncompressed size exceeds 100MB limit');
  }
  if (compressedSize > 5 * 1024 * 1024 && totalUncompressed / compressedSize > 10) {
    throw new Error('Zip bomb detected: excessive compression ratio (> 10:1)');
  }
}

function withTimeout<T>(promise: Promise<T>, ms = 15000, fallbackMessage = 'Preview timed out'): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(fallbackMessage)), ms);
  });
  return Promise.race([
    promise.then(res => { clearTimeout(timer); return res; }),
    timeoutPromise
  ]);
}

/* ─── Actual Document Preview (PDF Canvas / Image / PPTX / DOCX / Slider) ── */
function DocumentPreview({ file, go }: { file: PrintFile; go?: (screen: Screen) => void }) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(file.pages || 1);
  const [loading, setLoading] = useState(false);
  const [previewTimedOut, setPreviewTimedOut] = useState(false);
  const [isBlankPage, setIsBlankPage] = useState(false);
  const [isLowDpiImage, setIsLowDpiImage] = useState(false);
  const [officeSecurityError, setOfficeSecurityError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  useEffect(() => {
    if (file.pages && file.pages !== totalPages) {
      setTotalPages(file.pages);
    }
  }, [file.pages]);

  const [officeSlides, setOfficeSlides] = useState<{ title: string; bullets: string[] }[]>([]);
  const [officePages, setOfficePages] = useState<string[][]>([]);
  const [officeThumb, setOfficeThumb] = useState<string | null>(null);
  const pptxContainerRef = useRef<HTMLDivElement | null>(null);
  const pptxViewerRef = useRef<any>(null);
  const [hasPptxRendered, setHasPptxRendered] = useState(false);

  const raw = rawFileMap.get(file.id);
  const s = file.settings || ({} as any);
  const isCustom = s.colorMode === 'custom' || s.colorPlan?.mode === 'custom';
  const customColorPages = s.colorPlan?.colorPages || [];
  const isCurrentPageColor = (s.colorMode === 'color' || s.colorMode === 'colour')
    ? true
    : s.colorMode === 'bw'
      ? false
      : isCustom
        ? customColorPages.includes(page)
        : (file.colorPages ? page <= file.colorPages : false);
  const isBW = !isCurrentPageColor;
  const isDouble = s.sided === 'double';
  const nUp = s.nUp ?? 1;

  const fileName = (raw?.name || file.name || '').toLowerCase();
  const isPdf = fileName.endsWith('.pdf');
  const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt') || fileName.endsWith('.odp');
  const isDoc = fileName.endsWith('.docx') || fileName.endsWith('.doc') || fileName.endsWith('.odt');
  const isImage = Boolean(raw?.type?.startsWith('image/')) || /\.(jpe?g|png|webp|gif)$/i.test(fileName);

  // 1. Check Image DPI for printing quality
  useEffect(() => {
    if (!raw || !isImage) return;
    let active = true;
    const url = URL.createObjectURL(raw);
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      // An A4 sheet at 150 DPI is ~1240x1754. Flag image if under 600px width/height
      if (img.naturalWidth < 600 || img.naturalHeight < 600) {
        setIsLowDpiImage(true);
      } else {
        setIsLowDpiImage(false);
      }
    };
    img.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [raw, isImage]);

  // 2. Load PDF with 15s timeout
  useEffect(() => {
    if (!raw || !isPdf) return;
    let active = true;

    async function loadPdf() {
      setLoading(true);
      try {
        await withTimeout((async () => {
          const pdfjs = await getPdfJsLib();
          if (pdfjs && active) {
            const buffer = await raw!.arrayBuffer();
            if (!active) return;
            const doc = await pdfjs.getDocument({ data: buffer }).promise;
            if (!active) return;
            setPdfDoc(doc);
            setTotalPages(doc.numPages);

            const metrics = [];
            for (let pNum = 1; pNum <= Math.min(doc.numPages, 100); pNum++) {
              try {
                const p = await doc.getPage(pNum);
                const vp = p.getViewport({ scale: 1.0 });
                metrics.push({
                  pageNumber: pNum,
                  width: vp.width,
                  height: vp.height,
                  rotation: p.rotate || 0
                });
              } catch (_) {}
            }
            if (active && metrics.length > 0) {
              useBasket.getState().updateFile(file.id, { pageMetrics: metrics, pages: doc.numPages });
            }
          }
        })(), 15000);
      } catch (err: any) {
        console.warn('PDF preview error:', err);
        if (active) setPreviewTimedOut(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPdf();
    return () => { active = false; };
  }, [raw, isPdf]);

  // 2. Render selected PDF page to Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !isPdf) return;
    let renderTask: any = null;

    async function renderPage() {
      try {
        const pageObj = await pdfDoc.getPage(page);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = pageObj.getViewport({ scale: 2.0 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderTask = pageObj.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        try {
          const imgData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100)).data;
          let darkPixels = 0;
          for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
            if (r < 235 || g < 235 || b < 235) darkPixels++;
          }
          setIsBlankPage(darkPixels < 5);
        } catch (_) {}
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Page render error:', err);
        }
      }
    }

    renderPage();
    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, page, isPdf]);

  // 3. Load PPTX, PPT, or DOCX
  useEffect(() => {
    if (!raw || (!isPpt && !isDoc)) return;
    let active = true;

    async function loadOffice() {
      setLoading(true);
      try {
        const buf = await raw!.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;

        if (isPpt) {
          // 1. Try rendering full original visual PPTX slides via PptxViewer
          if (isZip && pptxContainerRef.current) {
            try {
              pptxContainerRef.current.style.display = 'block';
              pptxContainerRef.current.innerHTML = '';
              const { PptxViewer } = await import('@aiden0z/pptx-renderer');
              if (active) {
                const targetWidth = pptxContainerRef.current.clientWidth || 320;
                const viewer = await PptxViewer.open(buf, pptxContainerRef.current, {
                  renderMode: 'slide',
                  fitMode: 'contain',
                  width: targetWidth,
                  onSlideChange: (idx: number) => {
                    if (active) setPage(idx + 1);
                  }
                });
                if (active) {
                  pptxViewerRef.current = viewer;
                  const count = viewer.slideCount;
                  if (count > 0) {
                    setTotalPages(count);
                    setHasPptxRendered(true);
                    if (file.pages !== count) {
                      useBasket.getState().updateFile(file.id, { pages: count });
                    }
                  }
                }
              }
            } catch (err) {
              console.warn('PptxViewer visual render error, using fallback layout:', err);
              if (pptxContainerRef.current) pptxContainerRef.current.style.display = 'none';
            }
          }

          const parsedSlides: { title: string; bullets: string[] }[] = [];
          const slideMetrics: { pageNumber: number; width: number; height: number; rotation: number }[] = [];

          if (isZip) {
            const JSZip = (await import('jszip')).default;
            const zip = await withTimeout(JSZip.loadAsync(buf), 15000, 'Office document reading timed out');
            checkZipSafety(zip, buf.byteLength);

            // 1. Detect base presentation slide dimensions (e.g. 16:9 vs 4:3)
            let baseSlideW = 320;
            let baseSlideH = 180;
            const presKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('ppt/presentation.xml'));
            if (presKey) {
              const presText = await zip.files[presKey].async('text');
              const cxMatch = presText.match(/cx="(\d+)"[^>]*cy="(\d+)"/i) || presText.match(/cy="(\d+)"[^>]*cx="(\d+)"/i);
              if (cxMatch) {
                const cx = parseInt(cxMatch[1], 10);
                const cy = parseInt(cxMatch[2], 10);
                if (cx && cy) {
                  baseSlideW = cx / 36000;
                  baseSlideH = cy / 36000;
                }
              }
            }

            // Check for thumbnail
            const thumbKey = Object.keys(zip.files).find(k => /docprops[\\/]thumbnail\.(jpe?g|png)$/i.test(k));
            if (thumbKey) {
              const blob = await zip.files[thumbKey].async('blob');
              if (active) setOfficeThumb(URL.createObjectURL(blob));
            }

            // Find all slide XML files (normalizing both Windows \ and Unix /)
            const slideKeys = Object.keys(zip.files)
              .filter(k => {
                const norm = k.replace(/\\/g, '/').toLowerCase();
                return norm.includes('/slides/') && norm.endsWith('.xml') && !norm.includes('_rels') && !norm.includes('slidelayout') && !norm.includes('slidemaster');
              })
              .sort((a, b) => {
                const numA = parseInt(a.match(/slide.*?(\d+)/i)?.[1] || '0', 10);
                const numB = parseInt(b.match(/slide.*?(\d+)/i)?.[1] || '0', 10);
                return numA - numB;
              });

            for (let idx = 0; idx < slideKeys.length; idx++) {
              const key = slideKeys[idx];
              const xml = await zip.files[key].async('text');

              // Detect per-slide rotation or transform
              let rot = 0;
              const rotMatch = xml.match(/rot="(\d+)"/);
              if (rotMatch) {
                rot = Math.round(parseInt(rotMatch[1], 10) / 60000) % 360;
              }
              const isSwapped = rot === 90 || rot === 270;
              slideMetrics.push({
                pageNumber: idx + 1,
                width: isSwapped ? baseSlideH : baseSlideW,
                height: isSwapped ? baseSlideW : baseSlideH,
                rotation: rot
              });
              
              // Extract paragraph by paragraph
              const pMatches = Array.from(xml.matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/gi));
              const paragraphs: string[] = [];
              for (const p of pMatches) {
                const text = Array.from(p[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map(m => m[1]).join('').trim();
                if (text) paragraphs.push(text);
              }

              // Fallback to all <a:t> if paragraph matching didn't yield text
              if (paragraphs.length === 0) {
                const allT = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map(m => m[1].trim()).filter(Boolean);
                if (allT.length > 0) paragraphs.push(...allT);
              }

              const title = paragraphs[0] || `Slide ${idx + 1}`;
              const bullets = paragraphs.slice(1, 8);
              parsedSlides.push({ title, bullets });
            }

            // Fallback: Check presentation.xml or Content_Types if slideKeys was empty
            if (parsedSlides.length === 0) {
              let total = 0;
              const presKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('ppt/presentation.xml'));
              if (presKey) {
                const text = await zip.files[presKey].async('text');
                total = (text.match(/<[^:]*:?sldId[\s>]/gi) || []).length;
              }
              if (!total) {
                const ctKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('[content_types].xml'));
                if (ctKey) {
                  const text = await zip.files[ctKey].async('text');
                  total = (text.match(/application\/vnd\.openxmlformats-officedocument\.presentationml\.slide\+xml/gi) || []).length;
                }
              }
              const count = Math.max(total, file.pages || 1);
              for (let i = 1; i <= count; i++) {
                parsedSlides.push({ title: `Slide ${i}`, bullets: [`Presentation slide ${i} of ${count}`] });
              }
            }
          } else {
            // Binary .ppt (OLE2)
            let slideCount = file.pages || 1;
            const texts: string[] = [];

            try {
              const CFB = (await import('cfb')).default || (await import('cfb'));
              const cfb = CFB.read(bytes, { type: 'array' });
              
              // DocumentSummaryInformation stream for slide count
              const docSum = cfb.FileIndex.find((f: any) => f.name.includes('DocumentSummaryInformation'));
              if (docSum && docSum.content) {
                const stream = new Uint8Array(docSum.content);
                for (let i = 0; i < stream.length - 8; i++) {
                  if (stream[i] === 0x10 && stream[i+1] === 0x00 && stream[i+2] === 0x00 && stream[i+3] === 0x00) {
                    const propOffset = stream[i+4] | (stream[i+5] << 8) | (stream[i+6] << 16) | (stream[i+7] << 24);
                    if (propOffset > 0 && propOffset < stream.length - 8) {
                      const valType = stream[propOffset] | (stream[propOffset+1] << 8);
                      if (valType === 3) {
                        const c = stream[propOffset+4] | (stream[propOffset+5] << 8) | (stream[propOffset+6] << 16) | (stream[propOffset+7] << 24);
                        if (c > 0 && c < 1000) slideCount = c;
                      }
                    }
                  }
                }
              }

              // PowerPoint Document stream
              const pptDoc = cfb.FileIndex.find((f: any) => f.name.includes('PowerPoint Document'));
              if (pptDoc && pptDoc.content) {
                const docStream = new Uint8Array(pptDoc.content);
                let persistCount = 0;
                for (let i = 0; i < docStream.length - 8; i++) {
                  const recType = docStream[i+2] | (docStream[i+3] << 8);
                  if (recType === 0x03F8) persistCount++;
                }
                if (persistCount > 0) slideCount = persistCount;

                for (let i = 0; i < docStream.length - 8; i++) {
                  const recType = docStream[i+2] | (docStream[i+3] << 8);
                  const recLen = docStream[i+4] | (docStream[i+5] << 8) | (docStream[i+6] << 16) | (docStream[i+7] << 24);
                  if (recLen > 0 && recLen < 4000 && (i + 8 + recLen) <= docStream.length) {
                    if (recType === 0x0FA8) {
                      let str = '';
                      for (let j = 0; j < recLen; j++) {
                        const c = docStream[i + 8 + j];
                        if (c >= 32 && c <= 126) str += String.fromCharCode(c);
                        else if (c === 10 || c === 13) str += ' ';
                      }
                      if (str.trim().length > 3) texts.push(str.trim());
                    } else if (recType === 0x0FA0) {
                      let str = '';
                      for (let j = 0; j < recLen; j += 2) {
                        const code = docStream[i + 8 + j] | (docStream[i + 8 + j + 1] << 8);
                        if (code >= 32 && code <= 126) str += String.fromCharCode(code);
                        else if (code === 10 || code === 13) str += ' ';
                      }
                      if (str.trim().length > 3) texts.push(str.trim());
                    }
                  }
                }
              }
            } catch (err) {
              console.warn('Binary ppt preview error:', err);
            }

            const textPerSlide = Math.max(1, Math.ceil(texts.length / slideCount));
            for (let i = 0; i < slideCount; i++) {
              const chunk = texts.slice(i * textPerSlide, (i + 1) * textPerSlide);
              const title = chunk[0] || `Slide ${i + 1}`;
              const bullets = chunk.slice(1, 6);
              parsedSlides.push({ title, bullets });
            }
          }

          if (active && parsedSlides.length > 0) {
            setOfficeSlides(parsedSlides);
            setTotalPages(parsedSlides.length);
            useBasket.getState().updateFile(file.id, {
              pages: parsedSlides.length,
              pageMetrics: slideMetrics.length > 0 ? slideMetrics : undefined
            });
          }
        } else if (isDoc) {
          // Read word/document.xml
          const JSZip = (await import('jszip')).default;
          const zip = await withTimeout(JSZip.loadAsync(buf), 15000, 'Office document reading timed out');
          checkZipSafety(zip, buf.byteLength);
          const docKey = Object.keys(zip.files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('word/document.xml'));
          if (docKey) {
            const xml = await zip.files[docKey].async('text');
            const pMatches = Array.from(xml.matchAll(/<w:p[^>]*>([\s\S]*?)<\/w:p>/gi));
            const paragraphs: string[] = [];
            for (const p of pMatches) {
              const text = Array.from(p[1].matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gi)).map(m => m[1]).join('');
              if (text.trim()) paragraphs.push(text.trim());
            }

            const pages: string[][] = [];
            for (let i = 0; i < paragraphs.length; i += 4) {
              pages.push(paragraphs.slice(i, i + 4));
            }
            if (pages.length === 0) pages.push([file.name]);

            if (active) {
              setOfficePages(pages);
              setTotalPages(pages.length);
              if (file.pages !== pages.length) {
                useBasket.getState().updateFile(file.id, { pages: pages.length });
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Office preview error:', err);
        if (err?.message?.includes('Zip bomb') || err?.message?.includes('timed out')) {
          if (active) setOfficeSecurityError(err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOffice();
    return () => { active = false; };
  }, [raw, isPpt, isDoc]);

  // Synchronize slide changes with PptxViewer
  useEffect(() => {
    if (pptxViewerRef.current && hasPptxRendered) {
      try {
        pptxViewerRef.current.goToSlide(page - 1);
      } catch (e) {
        console.warn('Failed to switch slide:', e);
      }
    }
  }, [page, hasPptxRendered]);

  // Calculate current page metric & rotation
  const settings = file.settings || ({} as any);
  const currentMetric = file.pageMetrics?.[page - 1];
  const currentRot = (((settings.pageRotations?.[page] ?? currentMetric?.rotation ?? 0) % 360) + 360) % 360;
  const isPageLandscape = currentMetric
    ? ((currentRot === 90 || currentRot === 270) ? currentMetric.width <= currentMetric.height : currentMetric.width >= currentMetric.height)
    : isPpt;

  // Selected orientation & layout mode
  const selectedOrientation = s.orientation ?? 'auto';
  const effectiveIsLandscape = selectedOrientation === 'landscape'
    ? true
    : selectedOrientation === 'portrait'
      ? false
      : isPageLandscape;
  const selectedLayout = s.layout ?? (s.booklet ? 'booklet' : 'standard');

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!raw || !isImage) return;
    const url = URL.createObjectURL(raw);
    setPreviewImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [raw, isImage]);

  // Detect mixed slide sizes
  const portraitPages = (file.pageMetrics || []).filter(m => {
    const rot = (((settings.pageRotations?.[m.pageNumber] ?? m.rotation ?? 0) % 360) + 360) % 360;
    const isWider = m.width >= m.height;
    return (rot === 90 || rot === 270) ? isWider : !isWider;
  }).map(m => m.pageNumber);
  const isMixed = file.pageMetrics && file.pageMetrics.length > 1 && portraitPages.length > 0 && portraitPages.length < file.pageMetrics.length;

  const handleRotateCurrentPage = () => {
    const nextRot = (currentRot + 90) % 360;
    const nextRotations = { ...(settings.pageRotations || {}), [page]: nextRot };
    useBasket.getState().updateFile(file.id, {
      settings: { ...settings, pageRotations: nextRotations }
    });
  };

  // Live CSS filter: Grayscale + high contrast for B&W, natural for Colour
  const filterStyle = isBW
    ? 'grayscale(100%) contrast(140%) brightness(102%)'
    : 'none';

  const renderSlot = (slotPageNum: number) => {
    if (slotPageNum > totalPages) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          borderRadius: 4,
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 600,
          border: '1px dashed #cbd5e1'
        }}>
          Empty slot
        </div>
      );
    }
    const isSlotColor = (s.colorMode === 'color' || s.colorMode === 'colour')
      ? true
      : s.colorMode === 'bw'
        ? false
        : isCustom
          ? customColorPages.includes(slotPageNum)
          : (file.colorPages ? slotPageNum <= file.colorPages : false);

    const slotMetric = file.pageMetrics?.[slotPageNum - 1];
    const slotRot = ((file.settings.pageRotations?.[slotPageNum] ?? slotMetric?.rotation ?? 0) % 360 + 360) % 360;

    return (
      <DocumentPageSlot
        file={file}
        pageNumber={slotPageNum}
        rotation={slotRot}
        isColour={isSlotColor}
        onPageCountDiscovered={(discoveredCount) => {
          if (discoveredCount > 0 && discoveredCount !== totalPages) {
            setTotalPages(discoveredCount);
          }
        }}
      />
    );
  };

  const isSheetWide = effectiveIsLandscape || selectedLayout === 'booklet' || (s.nUp ?? 1) === 2;

  return (
    <div style={{
      background: '#f8fafc',
      border: '1.5px solid #e2e8f0',
      borderRadius: 14,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12
    }}>
      {/* Top Preview Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
        <span>DOCUMENT PREVIEW</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            background: isBW ? '#e2e8f0' : '#dbeafe',
            color: isBW ? '#334155' : '#1d4ed8',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800
          }}>
            {isBW ? 'B&W' : 'Colour'}
          </span>
          <span style={{
            background: '#f1f5f9',
            color: '#334155',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800
          }}>
            {effectiveIsLandscape ? 'Landscape' : 'Portrait'}
          </span>
          {selectedLayout !== 'standard' && (
            <span style={{
              background: '#fef3c7',
              color: '#b45309',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 800
            }}>
              {selectedLayout === 'handout' ? 'Handout' : 'Booklet'}
            </span>
          )}
          {(s.nUp ?? 1) > 1 && (
            <span style={{
              background: '#e0f2fe',
              color: '#0369a1',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 800
            }}>
              {s.nUp}-Up
            </span>
          )}
          {isDouble && (
            <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>
              Double-Sided
            </span>
          )}
        </div>
      </div>

      {/* Mixed Slide Sizes Info Note */}
      {isMixed && (
        <div style={{
          fontSize: 11,
          background: '#eff6ff',
          color: '#1d4ed8',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #bfdbfe',
          width: '100%',
          boxSizing: 'border-box',
          lineHeight: 1.4
        }}>
          ℹ️ Slide{portraitPages.length > 1 ? 's' : ''} {portraitPages.slice(0, 5).join(', ')}{portraitPages.length > 5 ? '…' : ''} {portraitPages.length > 1 ? 'are' : 'is'} portrait; we will fit them automatically.
        </div>
      )}

      {/* Security or parsing warning */}
      {officeSecurityError && (
        <div style={{
          fontSize: 11,
          background: '#fef2f2',
          color: '#b91c1c',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #fecaca',
          width: '100%',
          boxSizing: 'border-box',
          lineHeight: 1.4
        }}>
          {officeSecurityError}
        </div>
      )}

      {/* Timeout warning */}
      {previewTimedOut && (
        <div style={{
          fontSize: 11,
          background: '#fffbeb',
          color: '#b45309',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #fde68a',
          width: '100%',
          boxSizing: 'border-box',
          lineHeight: 1.4
        }}>
          Preview generation timed out. The file will still print correctly.
        </div>
      )}

      {/* Main Preview Screen (Dynamically adjusts aspect ratio to reflect Orientation & Layout) */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: isSheetWide ? 330 : 245,
        aspectRatio: isSheetWide ? '1.414 / 1' : '1 / 1.414',
        minHeight: isSheetWide ? 220 : 310,
        background: '#fff',
        borderRadius: 8,
        border: '2px solid #0f172a',
        boxShadow: isDouble ? '4px 4px 0 #cbd5e1, 8px 8px 0 #94a3b8' : '4px 4px 0 #cbd5e1',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.25s ease',
        boxSizing: 'border-box'
      }}>
        {/* ── Imposition Rendering based on Layout Mode ── */}
        {selectedLayout === 'handout' ? (
          <div style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '12px 14px',
            boxSizing: 'border-box',
            alignItems: 'center',
            gap: 12,
            background: '#ffffff'
          }}>
            <div style={{
              flex: '1.2',
              height: '85%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              background: '#f8fafc',
              overflow: 'hidden',
              padding: 4
            }}>
              {renderSlot(page)}
            </div>
            <div style={{
              flex: '1',
              height: '80%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              padding: '6px 0',
              boxSizing: 'border-box'
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2 }}>HANDOUT NOTES</div>
              <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
              <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
              <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
              <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
            </div>
          </div>
        ) : selectedLayout === 'booklet' ? (
          <div style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '10px 12px',
            boxSizing: 'border-box',
            alignItems: 'stretch',
            gap: 8,
            background: '#ffffff'
          }}>
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              borderLeft: '2px dashed #94a3b8',
              zIndex: 10,
              pointerEvents: 'none'
            }}>
              <span style={{
                position: 'absolute',
                top: 6,
                left: -20,
                fontSize: 8,
                fontWeight: 800,
                color: '#64748b',
                background: 'rgba(255,255,255,0.95)',
                padding: '1px 4px',
                borderRadius: 3,
                border: '1px solid #cbd5e1'
              }}>
                FOLD
              </span>
            </div>
            <div style={{
              flex: 1,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 4
            }}>
              {renderSlot(page)}
            </div>
            <div style={{
              flex: 1,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 4
            }}>
              {renderSlot(page + 1)}
            </div>
          </div>
        ) : (s.nUp ?? 1) === 2 ? (
          <div style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '10px 12px',
            boxSizing: 'border-box',
            alignItems: 'center',
            gap: 8,
            background: '#ffffff'
          }}>
            <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', height: '90%', padding: 4 }}>
              {renderSlot(page)}
            </div>
            <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', height: '90%', padding: 4 }}>
              {renderSlot(page + 1)}
            </div>
          </div>
        ) : (s.nUp ?? 1) === 4 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            width: '100%',
            height: '100%',
            padding: '8px 10px',
            boxSizing: 'border-box'
          }}>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 2 }}>
              {renderSlot(page)}
            </div>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 2 }}>
              {renderSlot(page + 1)}
            </div>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 2 }}>
              {renderSlot(page + 2)}
            </div>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 2 }}>
              {renderSlot(page + 3)}
            </div>
          </div>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: '#ffffff'
          }}>
            {/* 1. PDF Canvas Preview */}
            {isPdf && (
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                  filter: filterStyle,
                  transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
                  transition: 'transform 0.2s ease'
                }}
              />
            )}

            {/* 2. Real Image Preview */}
            {isImage && previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="Document preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                  filter: filterStyle,
                  transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
                  transition: 'transform 0.2s ease'
                }}
              />
            )}

            {/* 3. Real PPTX / PPT Slide Preview */}
            {isPpt && (
              <div style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                filter: filterStyle,
                transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
                transition: 'transform 0.2s ease'
              }}>
                <div
                  ref={pptxContainerRef}
                  style={{
                    width: '100%',
                    display: hasPptxRendered ? 'block' : 'none',
                    overflow: 'hidden',
                    borderRadius: 8
                  }}
                />
                {!hasPptxRendered && (
                  <div style={{
                    width: '94%',
                    aspectRatio: isPageLandscape ? '16/9' : '3/4',
                    background: isBW ? '#ffffff' : 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box'
                  }}>
                    {officeThumb && page === 1 ? (
                      <img src={officeThumb} alt="Slide 1" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} />
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #e2e8f0', paddingBottom: 6, marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                            {officeSlides[page - 1]?.title || `Slide ${page}`}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4, color: '#475569' }}>
                            {page}/{totalPages}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, padding: '4px 0' }}>
                          {(officeSlides[page - 1]?.bullets || ['Presentation slide notes and key points']).slice(0, 5).map((bullet, idx) => (
                            <div key={idx} style={{ fontSize: 11, color: '#334155', display: 'flex', gap: 6, lineHeight: 1.3 }}>
                              <span style={{ color: isBW ? '#64748b' : '#2563eb' }}>•</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bullet}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right' }}>
                          {file.name}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Real DOCX Document Preview */}
            {isDoc && (
              <div style={{
                width: '92%',
                minHeight: 220,
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: 6,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                filter: filterStyle,
                transform: currentRot ? `rotate(${currentRot}deg)` : undefined
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{file.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>P.{page}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, padding: '8px 0' }}>
                  {(officePages[page - 1] || ['Document text content preview']).map((p, idx) => (
                    <p key={idx} style={{ margin: 0, fontSize: 10, color: '#334155', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {p}
                    </p>
                  ))}
                </div>
                <div style={{ fontSize: 8, color: '#94a3b8', textAlign: 'right' }}>PrintBK Document</div>
              </div>
            )}

            {/* 5. Loading overlay */}
            {loading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#0f172a', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Loading preview…</span>
              </div>
            )}

            {/* 6. Fallback if not PDF/Image/PPT/DOC or file restored without raw buffer */}
            {!isPdf && !isImage && !isPpt && !isDoc && !loading && (
              <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                {file.name} · {file.pages} page{file.pages !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page by Page Slider Controls + Rotate Override */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, width: '100%', maxWidth: 320, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                background: page <= 1 ? '#f1f5f9' : '#fff',
                color: page <= 1 ? '#94a3b8' : '#0f172a',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 11
              }}
            >
              ◀
            </button>

            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
              {isPpt ? `Slide ${page}/${totalPages}` : `Page ${page}/${totalPages}`}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                background: page >= totalPages ? '#f1f5f9' : '#fff',
                color: page >= totalPages ? '#94a3b8' : '#0f172a',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 11
              }}
            >
              ▶
            </button>
          </div>
        )}

        <button
          onClick={handleRotateCurrentPage}
          title="Rotate 90° clockwise"
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1.5px solid #cbd5e1',
            background: '#fff',
            color: '#0f172a',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          ⟳ Rotate {currentRot > 0 ? `(${currentRot}°)` : ''}
        </button>

        {isCustom && (
          <button
            onClick={() => {
              const curSet = new Set(s.colorPlan?.colorPages || []);
              if (curSet.has(page)) curSet.delete(page);
              else curSet.add(page);
              const updated = Array.from(curSet).sort((a, b) => a - b);
              useBasket.getState().updateFile(file.id, {
                settings: {
                  ...s,
                  colorMode: 'custom',
                  colorPlan: { mode: 'custom', colorPages: updated }
                }
              });
            }}
            title={isCurrentPageColor ? "Switch this page to B&W" : "Switch this page to Colour"}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: isCurrentPageColor ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1',
              background: isCurrentPageColor ? '#eff6ff' : '#fff',
              color: isCurrentPageColor ? '#1d4ed8' : '#0f172a',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {isCurrentPageColor ? 'Colour Page' : 'Set Colour'}
          </button>
        )}
      </div>

      {/* Button to open Full Sheet Print Preview */}
      {go && (
        <button
          onClick={() => {
            useBasket.getState().setActiveFileId(file.id);
            go('preview');
          }}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1.5px solid #0f172a',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)'
          }}
        >
          Full Sheet Print Preview
        </button>
      )}

      {/* Live mode info text */}
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        Previewing in <b>{
          s.colorMode === 'bw' ? 'B&W (₹1.50/p single, ₹0.85/p double)' :
          s.colorMode === 'color' ? 'Full Colour (₹8.00/p)' :
          isCustom ? `Custom Plan (${customColorPages.length} Colour @ ₹8.00, ${(file.pages || 1) - customColorPages.length} B&W)` :
          'Auto Detection'
        }</b>
      </div>
    </div>
  );
}

/* ─── Inline edit panel per file ────────────────── */
function FileCard({
  file,
  onUpdate,
  onRemove,
  go
}: {
  file: PrintFile;
  onUpdate: (f: PrintFile) => void;
  onRemove: () => void;
  go?: (screen: Screen) => void;
}) {
  const [open, setOpen] = useState(true);
  const s = file.settings;
  const upd = (patch: Partial<typeof s>) => onUpdate({ ...file, settings: { ...s, ...patch } });

  const pricing = usePricing();
  const line = pricing.lines.find(l => l.id === file.id);
  const [retryingUpload, setRetryingUpload] = useState(false);
  const raw = rawFileMap.get(file.id);
  const uploadError = (file as any).uploadError;

  const [customRangeText, setCustomRangeText] = useState((s.colorPlan?.colorPages || []).join(', '));
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  // Sync only if file id changes
  const prevFileId = useRef(file.id);
  useEffect(() => {
    if (prevFileId.current !== file.id) {
      prevFileId.current = file.id;
      setCustomRangeText((s.colorPlan?.colorPages || []).join(', '));
    }
  }, [file.id]);

  const handleCustomRangeInput = (val: string) => {
    setCustomRangeText(val);
    if (!val.trim()) {
      setCustomRangeError(null);
      upd({ colorMode: 'custom', colorPlan: { mode: 'custom', colorPages: [] } });
      return;
    }
    const maxP = file.pages || 1;
    // Don't show error if ending in separator while actively typing (e.g. "1,")
    const isTypingSeparator = /[,\-\s]$/.test(val);
    const parsed = parsePageRange(val, maxP);
    const valid = parsed.pages.filter(p => p >= 1 && p <= maxP);
    if (valid.length === 0 && !isTypingSeparator && val.trim() !== '') {
      setCustomRangeError(`Please enter pages between 1 and ${maxP}`);
    } else {
      setCustomRangeError(null);
      if (valid.length > 0) {
        upd({ colorMode: 'custom', colorPlan: { mode: 'custom', colorPages: valid } });
      }
    }
  };

  const handleCustomRangeBlur = () => {
    const maxP = file.pages || 1;
    if (!customRangeText.trim()) {
      upd({ colorMode: 'custom', colorPlan: { mode: 'custom', colorPages: [] } });
    } else {
      const parsed = parsePageRange(customRangeText, maxP);
      const valid = parsed.pages.filter(p => p >= 1 && p <= maxP);
      upd({ colorMode: 'custom', colorPlan: { mode: 'custom', colorPages: valid } });
      setCustomRangeText(valid.join(', '));
    }
  };

  const applyColorPreset = (pages: number[]) => {
    setCustomRangeText(pages.join(', '));
    setCustomRangeError(null);
    upd({ colorMode: 'custom', colorPlan: { mode: 'custom', colorPages: pages } });
  };

  const sel = (v: boolean) => ({ border: `2px solid ${v ? '#0b1020' : '#e2e8f0'}`, background: v ? '#0b1020' : '#fff', color: v ? '#fff' : '#0b1020' });
  const btn = { cursor: 'pointer' as const, borderRadius: 10, fontWeight: 600 as const, fontSize: 13, minHeight: 44 };
  const presetBtn: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#334155',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', marginBottom: 10, position: 'relative', overflow: open ? 'visible' : 'hidden' }}>
      {/* ── Header row: Clean single Edit toggle, formula, savings chip ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 2 }}><Icon name="file" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{file.name}</div>
          <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
            {file.pages} page{file.pages !== 1 ? 's' : ''} · {
              s.colorMode === 'bw' ? 'B&W' :
              s.colorMode === 'color' ? 'Colour' :
              s.colorMode === 'custom' ? `Custom (${(s.colorPlan?.colorPages || []).length} col)` :
              'Auto'
            } · {s.sided === 'double' ? '2-sided' : '1-sided'} · ×{s.copies}
          </div>

          {/* Pricing Formula and Total */}
          {line && (
            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>
              <span>{line.formula}</span>
              <span style={{ marginLeft: 6, fontWeight: 800, color: '#16a34a' }}>= ₹{line.total.toFixed(2)}</span>
            </div>
          )}

          {/* Savings chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {s.sided === 'double' && s.colorMode !== 'color' && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: 4 }}>
                Saved ₹{((file.pages || 1) * 0.65 * (s.copies || 1)).toFixed(2)} with 2-sided
              </span>
            )}
            {(s.nUp ?? 1) > 1 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 4 }}>
                Saved sheets with {s.nUp}-up
              </span>
            )}
          </div>

          {/* Upload failure or retry row */}
          {uploadError && (
            <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#dc2626' }}>
              <span>Upload failed: {uploadError}</span>
              <button
                type="button"
                aria-label="Retry upload"
                disabled={retryingUpload}
                onClick={async () => {
                  if (!raw) return;
                  setRetryingUpload(true);
                  try {
                    const res = await api.uploadFile(raw);
                    if (res?.cloudId) {
                      useBasket.getState().updateFile(file.id, { cloudId: res.cloudId, uploadStatus: 'done', uploadError: undefined } as any);
                      notify('Re-uploaded successfully');
                    }
                  } catch (e: any) {
                    useBasket.getState().updateFile(file.id, { uploadError: e?.message || 'Upload retry failed' } as any);
                    notify('Upload retry failed');
                  } finally {
                    setRetryingUpload(false);
                  }
                }}
                style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}
              >
                {retryingUpload ? 'Retrying…' : 'Retry ⟳'}
              </button>
            </div>
          )}

          {/* Large file progress indicator */}
          {file.size > 5 * 1024 * 1024 && !(file as any).cloudId && !uploadError && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              <span>Large file ({(file.size / (1024 * 1024)).toFixed(1)} MB) backing up to cloud…</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? "Close settings" : "Edit document settings"}
          style={{ ...btn, padding: '8px 14px', background: open ? '#f1f5f9' : '#0b1020', color: open ? '#475569' : '#fff', border: 'none', flexShrink: 0, fontWeight: 700, borderRadius: 10, minHeight: 44 }}
        >
          {open ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* ── Edit panel ── */}
      {open && (
        <div style={{ borderTop: '1.5px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Live Document Preview (PDF / Images / PPTX / DOCX) */}
          <DocumentPreview file={file} go={go} />

          {/* Colour */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>COLOUR MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {colorOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ colorMode: opt.value })}
                  style={{ ...btn, flex: 1, padding: '9px 4px', lineHeight: 1.3, ...sel(s.colorMode === opt.value) }}>
                  {opt.label}<br /><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{opt.sub}</span>
                </button>
              ))}
            </div>

            {/* Custom Colour Configuration */}
            {s.colorMode === 'custom' && (
              <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CUSTOM COLOUR PAGES</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', background: '#dbeafe', padding: '2px 8px', borderRadius: 6 }}>
                    {(s.colorPlan?.colorPages || []).length} of {file.pages || 1} pages colour
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    Colour pages (e.g. 1, 5-7):
                  </label>
                  <input
                    type="text"
                    value={customRangeText}
                    placeholder="e.g. 1, 5-7"
                    onChange={e => handleCustomRangeInput(e.target.value)}
                    onBlur={handleCustomRangeBlur}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  {customRangeError && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                      {customRangeError}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: 0.5 }}>QUICK PRESETS</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => applyColorPreset([1])} style={presetBtn}>
                      First page colour only
                    </button>
                    <button type="button" onClick={() => applyColorPreset([1, file.pages || 1])} style={presetBtn}>
                      First & last page colour
                    </button>
                    <button type="button" onClick={() => applyColorPreset(Array.from({ length: file.colorPages || 1 }, (_, i) => i + 1))} style={presetBtn}>
                      Pages detected as colour
                    </button>
                    <button type="button" onClick={() => applyColorPreset([])} style={presetBtn}>
                      Clear (All B&W)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Orientation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>ORIENTATION</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {orientationOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ orientation: opt.value })}
                  style={{ ...btn, flex: 1, padding: '9px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...sel((s.orientation ?? 'auto') === opt.value) }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.icon} {opt.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <div style={{
              fontSize: 11,
              color: '#334155',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '7px 10px',
              marginTop: 6,
              lineHeight: 1.4
            }}>
              <b>Live Preview Effect:</b> {
                (s.orientation ?? 'auto') === 'auto' ? 'Adapts sheet rotation automatically to best fit your document.' :
                s.orientation === 'portrait' ? 'Sheet displays upright vertically (Portrait).' :
                'Sheet displays rotated horizontally (Landscape).'
              }
            </div>
          </div>

          {/* Layout Mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>LAYOUT MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {layoutModeOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ layout: opt.value })}
                  style={{ ...btn, flex: 1, padding: '9px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...sel((s.layout ?? 'standard') === opt.value) }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.icon} {opt.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <div style={{
              fontSize: 11,
              color: '#334155',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '7px 10px',
              marginTop: 6,
              lineHeight: 1.4
            }}>
              <b>Live Preview Effect:</b> {
                (s.layout ?? 'standard') === 'standard' ? 'Standard 1 page per sheet filling full printable area.' :
                s.layout === 'handout' ? 'Handout displays your slide on the left with ruled note lines on the right.' :
                'Booklet displays a 2-page center-folded spread with a staple fold line.'
              }
            </div>
          </div>

          {/* Sides */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>PRINT SIDES</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {sidedOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ sided: opt.value })}
                  style={{ ...btn, flex: 1, padding: '9px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...sel(s.sided === opt.value) }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.icon} {opt.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              {s.sided === 'double' ? 'Double-sided saves paper and costs only ₹0.85/side instead of ₹1.50!' : 'Single-sided prints on one side only (₹1.50 per sheet).'}
            </div>
          </div>

          {/* N-up */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>PAGES PER SHEET</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {nUpOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ nUp: opt.value })}
                  style={{ ...btn, flex: 1, padding: '9px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...sel((s.nUp ?? 1) === opt.value) }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.icon} {opt.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <div style={{
              fontSize: 11,
              color: '#334155',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '7px 10px',
              marginTop: 6,
              lineHeight: 1.4
            }}>
              <b>Live Preview Effect:</b> {
                (s.nUp ?? 1) === 1 ? '1 full page per sheet.' :
                (s.nUp ?? 1) === 2 ? '2 real pages placed side-by-side on each sheet (saves 50% paper).' :
                '4 real pages placed in a 2×2 grid on each sheet.'
              }
            </div>
          </div>

          {/* Copies */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>COPIES</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => upd({ copies: Math.max(1, s.copies - 1) })} style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>−</button>
              <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 700, fontSize: 17 }}>{s.copies}</span>
              <button onClick={() => upd({ copies: s.copies + 1 })} style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>+</button>
            </div>
          </div>

          {/* Page range */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>PAGE RANGE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'custom'] as const).map(r => (
                <button key={r} onClick={() => upd({ range: r })}
                  style={{ ...btn, flex: 1, padding: 10, ...sel((s.range ?? 'all') === r) }}>
                  {r === 'all' ? 'All pages' : 'Custom range'}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Action Row: Dedicated Delete on left, Single prominent Red Close on right */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              onClick={onRemove}
              style={{
                flex: 1,
                padding: '15px 12px',
                background: '#fee2e2',
                color: '#dc2626',
                border: '1.5px solid #fecaca',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                flex: 2,
                padding: '15px 16px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              Done · Close Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Basket screen ─────────────────────────────── */
function Basket({ go, setSheet }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void }) {
  const basket = useBasket();
  const pricing = usePricing();
  const { files, services, removeFile, removeService, addFile, updateFile } = basket;

  const handleAddMore = () => {
    browseAndAddFiles(go, addFile);
  };



  const lastFileRef = useRef<HTMLDivElement | null>(null);
  const prevCount = useRef(files.length);

  useEffect(() => {
    if (files.length > prevCount.current) {
      setTimeout(() => {
        lastFileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
    prevCount.current = files.length;
  }, [files.length]);

  /* ── 2. Empty Basket Screen ── */
  if (files.length === 0 && services.length === 0) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f4ee', minHeight: '100dvh' }}>
        <Topbar title="Basket" back onBack={() => go('entry')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}><Icon name="basket" size={52} /></div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Basket is empty</h2>
          <p style={{ margin: '0 0 24px', color: '#718096', fontSize: 15 }}>Upload files or add from Other Services</p>
          <button className="primary" style={{ padding: '14px 32px', fontSize: 15 }} onClick={() => go('entry')}>Browse files</button>
        </div>
      </main>
    );
  }

  const totalPages = files.reduce((s, f) => s + f.pages * (f.settings.copies ?? 1), 0);

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f4ee', minHeight: '100dvh' }}>
      <Topbar title={`Basket · ${files.length + services.length} item${files.length + services.length !== 1 ? 's' : ''}`} back onBack={() => go('entry')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 120px' }}>
        {/* Files */}
        {files.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#718096', margin: '4px 2px 8px' }}>FILES</div>
            {files.map((f, idx) => (
              <div key={f.id} ref={idx === files.length - 1 ? lastFileRef : undefined}>
                <FileCard
                  file={f}
                  onUpdate={updated => updateFile(updated.id, updated)}
                  onRemove={() => removeFile(f.id)}
                  go={go}
                />
              </div>
            ))}
            <button
              onClick={handleAddMore}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1.5px solid #0f172a',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)'
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add more files
            </button>
          </div>
        )}

        {/* Services */}
        {services.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#718096', margin: '12px 2px 8px' }}>SERVICES</div>
            {services.map(s => (
              <div key={s.id} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  {s.detail && <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{s.detail}</div>}
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>{s.price == null ? 'Quote' : `₹${s.price}`}</span>
                <button onClick={() => removeService(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 22, lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom checkout bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 16px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: '#718096' }}>{totalPages} page{totalPages !== 1 ? 's' : ''} to print</div>
            {pricing.savingsTip && <div style={{ fontSize: 11, color: '#1f9d55', marginTop: 2 }}>{pricing.savingsTip}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={{ fontSize: 12, color: '#718096', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }} onClick={() => setSheet('breakdown')}>
              Breakdown
            </button>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>₹{pricing.total.toFixed(2)}</div>
          </div>
        </div>
        <button className="primary full" style={{ width: '100%', padding: 15, fontSize: 17, fontWeight: 700, borderRadius: 14 }} onClick={() => go('checkout')}>
          Checkout →
        </button>
      </div>
    </main>
  );
}
export default Basket;
