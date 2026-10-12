import React, { useState, useEffect, useRef } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, usePricing, fileFromRaw, rawFileMap } from '../../store/basket';
import { browseAndAddFiles } from '../../lib/filePicker';
import type { PrintFile } from '@printbk/shared';

/* ─── Option arrays ─────────────────────────────── */
const colorOptions: { value: PrintFile['settings']['colorMode']; label: string; sub: string }[] = [
  { value: 'bw',    label: 'B&W',        sub: '₹1.50/p' },
  { value: 'color', label: 'Colour',     sub: '₹8.00/p' },
  { value: 'auto',  label: 'Auto',       sub: 'detect'  },
];
const sidedOptions: { value: PrintFile['settings']['sided']; label: string }[] = [
  { value: 'single', label: '1-Sided (₹1.50)' },
  { value: 'double', label: '2-Sided (₹0.85)' },
];
const nUpOptions: { value: number; label: string }[] = [
  { value: 1, label: '1-up' },
  { value: 2, label: '2-up' },
  { value: 4, label: '4-up' },
];
const orientationOptions: { value: 'auto' | 'portrait' | 'landscape'; label: string }[] = [
  { value: 'auto', label: 'Auto (Best fit)' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];
const layoutModeOptions: { value: 'standard' | 'handout' | 'booklet'; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'handout', label: 'Handout' },
  { value: 'booklet', label: 'Booklet' },
];

/* ─── Actual Document Preview (PDF Canvas / Image / PPTX / DOCX / Slider) ── */
function DocumentPreview({ file, go }: { file: PrintFile; go?: (screen: Screen) => void }) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(file.pages || 1);
  const [loading, setLoading] = useState(false);
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
  const s = file.settings;
  const isBW = s.colorMode === 'bw';
  const isDouble = s.sided === 'double';
  const nUp = s.nUp ?? 1;

  const fileName = (raw?.name || file.name).toLowerCase();
  const isPdf = fileName.endsWith('.pdf');
  const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt') || fileName.endsWith('.odp');
  const isDoc = fileName.endsWith('.docx') || fileName.endsWith('.doc') || fileName.endsWith('.odt');
  const isImage = raw?.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(fileName);

  // 1. Load PDF
  useEffect(() => {
    if (!raw || !isPdf) return;
    let active = true;

    async function loadPdf() {
      setLoading(true);
      try {
        const buffer = await raw!.arrayBuffer();
        if (!active) return;
        const pdfjs = (window as any).pdfjsLib;
        if (pdfjs) {
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
      } catch (err) {
        console.warn('PDF preview error:', err);
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
            const zip = await JSZip.loadAsync(buf);

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
          const zip = await JSZip.loadAsync(buf);
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
      } catch (err) {
        console.warn('Office preview error:', err);
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
  const currentMetric = file.pageMetrics?.[page - 1];
  const currentRot = ((file.settings.pageRotations?.[page] ?? currentMetric?.rotation ?? 0) % 360 + 360) % 360;
  const isPageLandscape = currentMetric
    ? ((currentRot === 90 || currentRot === 270) ? currentMetric.width <= currentMetric.height : currentMetric.width >= currentMetric.height)
    : isPpt;

  // Detect mixed slide sizes
  const portraitPages = (file.pageMetrics || []).filter(m => {
    const rot = ((file.settings.pageRotations?.[m.pageNumber] ?? m.rotation ?? 0) % 360 + 360) % 360;
    const isWider = m.width >= m.height;
    return (rot === 90 || rot === 270) ? isWider : !isWider;
  }).map(m => m.pageNumber);
  const isMixed = file.pageMetrics && file.pageMetrics.length > 1 && portraitPages.length > 0 && portraitPages.length < file.pageMetrics.length;

  const handleRotateCurrentPage = () => {
    const nextRot = (currentRot + 90) % 360;
    const nextRotations = { ...(file.settings.pageRotations || {}), [page]: nextRot };
    useBasket.getState().updateFile(file.id, {
      settings: { ...file.settings, pageRotations: nextRotations }
    });
  };

  // Live CSS filter: Grayscale + high contrast for B&W, natural for Colour
  const filterStyle = isBW
    ? 'grayscale(100%) contrast(140%) brightness(102%)'
    : 'none';

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            background: isBW ? '#e2e8f0' : '#dbeafe',
            color: isBW ? '#334155' : '#1d4ed8',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800
          }}>
            {isBW ? 'B&W Active' : 'Colour Active'}
          </span>
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

      {/* Main Preview Screen */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: isPageLandscape ? 320 : 240,
        minHeight: isPageLandscape ? 180 : 280,
        background: '#fff',
        borderRadius: 8,
        border: '1.5px solid #0f172a',
        boxShadow: isDouble ? '4px 4px 0 #cbd5e1, 8px 8px 0 #94a3b8' : '4px 4px 0 #cbd5e1',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: filterStyle,
        transition: 'filter 0.25s ease'
      }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
            Loading preview…
          </div>
        )}

        {/* 1. PDF Canvas Preview */}
        {isPdf && (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
              transition: 'transform 0.2s ease'
            }}
          />
        )}

        {/* 2. Image Preview */}
        {isImage && raw && (
          <img
            src={URL.createObjectURL(raw)}
            alt="Preview"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'contain',
              transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
              transition: 'transform 0.2s ease'
            }}
          />
        )}

        {/* 3. PPTX / PPT Slide Preview */}
        {isPpt && (
          <div style={{
            width: '100%',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: currentRot ? `rotate(${currentRot}deg)` : undefined,
            transition: 'transform 0.2s ease'
          }}>
            {/* Visual Full Presentation Container */}
            <div
              ref={pptxContainerRef}
              style={{
                width: '100%',
                display: hasPptxRendered ? 'block' : 'none',
                overflow: 'hidden',
                borderRadius: 8
              }}
            />

            {/* Fallback slide card if visual renderer did not mount or for binary PPT */}
            {!hasPptxRendered && (
              <div style={{
                width: '100%',
                aspectRatio: isPageLandscape ? '16/9' : '3/4',
                background: isBW ? '#ffffff' : 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                border: '1.5px solid #cbd5e1',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                position: 'relative'
              }}>
                {officeThumb && page === 1 ? (
                  <img src={officeThumb} alt="Slide 1" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} />
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #e2e8f0', paddingBottom: 6, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        📊 {officeSlides[page - 1]?.title || `Slide ${page}`}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: 4 }}>
                        {page} / {totalPages}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'hidden' }}>
                      {(officeSlides[page - 1]?.bullets || []).map((b, idx) => (
                        <div key={idx} style={{ fontSize: 11, color: '#334155', display: 'flex', gap: 6, lineHeight: 1.3 }}>
                          <span style={{ color: '#3b82f6', fontWeight: 700 }}>•</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                        </div>
                      ))}
                      {(!officeSlides[page - 1]?.bullets || officeSlides[page - 1]?.bullets.length === 0) && (
                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          Presentation Slide {page} of {totalPages}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right', marginTop: 2, letterSpacing: 0.5 }}>
                      {file.name}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. DOCX Document Preview */}
        {isDoc && (
          <div style={{ width: '100%', padding: '16px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 260 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: 4 }}>
              📝 {file.name} (Page {page})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: '#334155', lineHeight: 1.4 }}>
              {(officePages[page - 1] || []).map((para, idx) => (
                <p key={idx} style={{ margin: 0 }}>{para}</p>
              ))}
              {(!officePages[page - 1] || officePages[page - 1]?.length === 0) && (
                <p style={{ margin: 0, color: '#94a3b8', fontStyle: 'italic' }}>Document Page {page}</p>
              )}
            </div>
          </div>
        )}

        {/* Fallback */}
        {!isPdf && !isImage && !isPpt && !isDoc && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {file.pages} page{file.pages !== 1 ? 's' : ''} · {nUp}-up
            </div>
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
      </div>

      {/* Button to open Full Sheet Print Preview */}
      {go && (
        <button
          onClick={() => go('preview')}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1.5px solid #0f172a',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          🔍 Full Sheet Print Preview
        </button>
      )}

      {/* Live mode info text */}
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        Previewing in <b>{isBW ? 'B&W (₹1.50/p single, ₹0.85/p double)' : 'Full Colour (₹8.00/p)'}</b>
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

  const sel = (v: boolean) => ({ border: `2px solid ${v ? '#0b1020' : '#e2e8f0'}`, background: v ? '#0b1020' : '#fff', color: v ? '#fff' : '#0b1020' });
  const btn = { cursor: 'pointer' as const, borderRadius: 10, fontWeight: 600 as const, fontSize: 13 };

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', marginBottom: 10, position: 'relative', overflow: open ? 'visible' : 'hidden' }}>
      {/* ── Header row: Clean single Edit toggle, no duplicate close or delete buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>📄</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
          <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
            {file.pages} page{file.pages !== 1 ? 's' : ''} · {s.colorMode === 'bw' ? 'B&W' : s.colorMode === 'color' ? 'Colour' : 'Auto'} · {s.sided === 'double' ? '2-sided' : '1-sided'} · ×{s.copies}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ ...btn, padding: '7px 14px', background: open ? '#f1f5f9' : '#0b1020', color: open ? '#475569' : '#fff', border: 'none', flexShrink: 0, fontWeight: 700, borderRadius: 10 }}
        >
          {open ? 'Done' : '✏️ Edit'}
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
          </div>

          {/* Orientation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>ORIENTATION</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {orientationOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ orientation: opt.value })}
                  style={{ ...btn, flex: 1, padding: 10, ...sel((s.orientation ?? 'auto') === opt.value) }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>LAYOUT MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {layoutModeOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ layout: opt.value })}
                  style={{ ...btn, flex: 1, padding: 10, ...sel((s.layout ?? 'standard') === opt.value) }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sides */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>PRINT SIDES</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {sidedOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ sided: opt.value })}
                  style={{ ...btn, flex: 1, padding: 10, ...sel(s.sided === opt.value) }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* N-up */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1.2, marginBottom: 8 }}>PAGES PER SHEET</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {nUpOptions.map(opt => (
                <button key={opt.value} onClick={() => upd({ nUp: opt.value })}
                  style={{ ...btn, flex: 1, padding: 10, ...sel((s.nUp ?? 1) === opt.value) }}>
                  {opt.label}
                </button>
              ))}
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
              🗑️ Delete
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                flex: 2,
                padding: '15px 16px',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              ✕ Close Settings
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

  /* ── 1. Processing Screen (Prevents showing empty basket during upload) ── */
  if (basket.isProcessing || (files.length === 0 && basket.isProcessing)) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f4ee', minHeight: '100dvh' }}>
        <Topbar title="Processing Documents" back onBack={() => go('entry')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 24 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#ef4444', animation: 'spin 1s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              ⚡
            </div>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>
            Processing your documents…
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
            Reading pages, analyzing slide layouts, and preparing your live preview.
          </p>
        </div>
      </main>
    );
  }

  /* ── 2. Empty Basket Screen ── */
  if (files.length === 0 && services.length === 0) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f4ee', minHeight: '100dvh' }}>
        <Topbar title="Basket" back onBack={() => go('entry')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🛒</div>
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
            {files.map(f => (
              <FileCard
                key={f.id}
                file={f}
                onUpdate={updated => updateFile(updated.id, updated)}
                onRemove={() => removeFile(f.id)}
                go={go}
              />
            ))}
            <button onClick={handleAddMore} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1.5px dashed #c0b8a8', background: 'none', color: '#718096', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
              + Add more files
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
            {pricing.savingsTip && <div style={{ fontSize: 11, color: '#1f9d55', marginTop: 2 }}>💡 {pricing.savingsTip}</div>}
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
