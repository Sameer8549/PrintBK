import React, { useState, useEffect, useRef } from 'react';
import { PrintFile } from '@printbk/shared';
import { rawFileMap } from '../../store/basket';

export async function getPdfJsLib(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
      return (window as any).pdfjsLib;
    }
  }
  return null;
}

// Global in-memory caches to prevent redundant parsing and memory bloat
export const pdfDocCache = new Map<string, any>();
export const officeContentCache = new Map<string, {
  slides?: { title: string; bullets: string[] }[];
  pages?: string[][];
  thumb?: string;
}>();
export const imageUrlCache = new Map<string, string>();

interface DocumentPageSlotProps {
  file: PrintFile;
  pageNumber: number;
  rotation?: number;
  isColour?: boolean;
  style?: React.CSSProperties;
  showBadge?: boolean;
  onPageCountDiscovered?: (total: number) => void;
}

export function DocumentPageSlot({
  file,
  pageNumber,
  rotation = 0,
  isColour = false,
  style,
  showBadge = false,
  onPageCountDiscovered
}: DocumentPageSlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const raw = rawFileMap.get(file.id);
  const fileName = (raw?.name || file.name || '').toLowerCase();
  const isPdf = fileName.endsWith('.pdf');
  const isImage = raw?.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(fileName) || (file as any).isPhotoSheet;
  const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt');
  const isDoc = fileName.endsWith('.docx') || fileName.endsWith('.doc');

  const [imageUrl, setImageUrl] = useState<string | null>(() => (file as any).previewUrl || imageUrlCache.get(file.id) || null);
  const [officeData, setOfficeData] = useState(() => officeContentCache.get(file.id) || null);

  // 1. Handle Images and Photo Sheets
  useEffect(() => {
    if ((file as any).isPhotoSheet && (file as any).previewUrl) {
      setImageUrl((file as any).previewUrl);
      setRendered(true);
      return;
    }
    if (!raw || !isImage) return;
    if (imageUrlCache.has(file.id)) {
      setImageUrl(imageUrlCache.get(file.id)!);
      setRendered(true);
      return;
    }
    const url = URL.createObjectURL(raw);
    imageUrlCache.set(file.id, url);
    setImageUrl(url);
    setRendered(true);
  }, [file.id, raw, isImage, (file as any).isPhotoSheet, (file as any).previewUrl]);

  // 2. Handle PDFs
  useEffect(() => {
    if (!raw || !isPdf) return;
    let active = true;
    let renderTask: any = null;

    async function renderPdfPage() {
      try {
        const pdfjs = await getPdfJsLib();
        if (!pdfjs || !active) return;

        let doc = pdfDocCache.get(file.id);
        if (!doc) {
          const buf = await raw!.arrayBuffer();
          if (!active) return;
          doc = await pdfjs.getDocument({ data: buf }).promise;
          if (!active) return;
          pdfDocCache.set(file.id, doc);
          if (onPageCountDiscovered && doc.numPages > 0) {
            onPageCountDiscovered(doc.numPages);
          }
        }

        if (pageNumber < 1 || pageNumber > doc.numPages) {
          if (active) setRendered(false);
          return;
        }

        const pageObj = await doc.getPage(pageNumber);
        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const baseVp = pageObj.getViewport({ scale: 1.0 });
        // Target high-DPI Ultra HD preview scale (2.5x to 3.5x based on devicePixelRatio)
        const dpr = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2;
        const targetRenderWidth = Math.max(baseVp.width * dpr, 1400);
        const scale = targetRenderWidth / baseVp.width;
        const viewport = pageObj.getViewport({ scale });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        renderTask = pageObj.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (active) {
          setRendered(true);
          setLoadError(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('PDF slot render error:', err);
          if (active) setLoadError(true);
        }
      }
    }

    renderPdfPage();
    return () => {
      active = false;
      if (renderTask) renderTask.cancel();
    };
  }, [file.id, raw, isPdf, pageNumber]);

  // 3. Handle Office Files (PPTX / DOCX)
  useEffect(() => {
    if (!raw || (!isPpt && !isDoc)) return;
    if (officeContentCache.has(file.id)) {
      setOfficeData(officeContentCache.get(file.id)!);
      setRendered(true);
      return;
    }

    let active = true;
    async function parseOffice() {
      try {
        const buf = await raw!.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;

        if (isPpt && isZip) {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(buf);

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

          const slides: { title: string; bullets: string[] }[] = [];
          for (let idx = 0; idx < slideKeys.length; idx++) {
            const xml = await zip.files[slideKeys[idx]].async('text');
            const pMatches = Array.from(xml.matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/gi));
            const paragraphs: string[] = [];
            for (const p of pMatches) {
              const text = Array.from(p[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map(m => m[1]).join('').trim();
              if (text) paragraphs.push(text);
            }
            if (paragraphs.length === 0) {
              const allT = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map(m => m[1].trim()).filter(Boolean);
              if (allT.length > 0) paragraphs.push(...allT);
            }
            slides.push({
              title: paragraphs[0] || `Slide ${idx + 1}`,
              bullets: paragraphs.slice(1, 6)
            });
          }

          if (slides.length === 0) {
            for (let i = 1; i <= (file.pages || 1); i++) {
              slides.push({ title: `Slide ${i}`, bullets: [`Presentation slide ${i}`] });
            }
          }

          const cached = { slides };
          officeContentCache.set(file.id, cached);
          if (active) {
            setOfficeData(cached);
            setRendered(true);
            if (onPageCountDiscovered && slides.length > 0) {
              onPageCountDiscovered(slides.length);
            }
          }
        } else if (isDoc && isZip) {
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

            const cached = { pages };
            officeContentCache.set(file.id, cached);
            if (active) {
              setOfficeData(cached);
              setRendered(true);
              if (onPageCountDiscovered && pages.length > 0) {
                onPageCountDiscovered(pages.length);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Office slot parse error:', e);
      }
    }

    parseOffice();
    return () => { active = false; };
  }, [file.id, raw, isPpt, isDoc]);

  // CSS Grayscale filter for live B&W simulation
  const filterStyle = isColour
    ? 'none'
    : 'grayscale(100%) contrast(135%) brightness(102%)';

  const rotTransform = rotation ? `rotate(${rotation}deg)` : undefined;

  // PPT Slide Content
  const slide = officeData?.slides?.[pageNumber - 1];
  // DOCX Page Content
  const docxPage = officeData?.pages?.[pageNumber - 1];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#ffffff',
        ...style
      }}
    >
      {/* 1. PDF Canvas */}
      {isPdf && (
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            height: '100%',
            display: rendered ? 'block' : 'none',
            objectFit: 'contain',
            imageRendering: 'auto',
            filter: filterStyle,
            transform: rotTransform,
            transition: 'transform 0.2s ease'
          }}
        />
      )}

      {/* 2. Image Render */}
      {isImage && imageUrl && (
        <img
          src={imageUrl}
          alt={`Page ${pageNumber}`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain',
            imageRendering: 'high-quality',
            filter: filterStyle,
            transform: rotTransform,
            transition: 'transform 0.2s ease'
          }}
        />
      )}

      {/* 3. PPTX Slide Render */}
      {isPpt && (
        <div
          style={{
            width: '94%',
            height: '92%',
            aspectRatio: '16/9',
            maxHeight: '94%',
            borderRadius: 6,
            border: isColour ? '1.5px solid #93c5fd' : '1.5px solid #cbd5e1',
            background: isColour ? 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)' : '#ffffff',
            padding: '8px 10px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            filter: filterStyle,
            transform: rotTransform,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}
        >
          {/* Slide Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: isColour ? '1px solid #bfdbfe' : '1px solid #e2e8f0', paddingBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '78%' }}>
              {slide?.title || `Slide ${pageNumber}`}
            </span>
            <span style={{ fontSize: 8, fontWeight: 700, background: isColour ? '#dbeafe' : '#f1f5f9', color: isColour ? '#1d4ed8' : '#475569', padding: '1px 5px', borderRadius: 4 }}>
              {pageNumber}
            </span>
          </div>

          {/* Slide Body Bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, padding: '4px 0', overflow: 'hidden' }}>
            {(slide?.bullets || ['Presentation slide notes and key points']).slice(0, 4).map((b, idx) => (
              <div key={idx} style={{ fontSize: 9, color: '#334155', display: 'flex', gap: 4, lineHeight: 1.25 }}>
                <span style={{ color: isColour ? '#2563eb' : '#64748b', fontWeight: 800 }}>•</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
              </div>
            ))}
          </div>

          {/* Slide Footer */}
          <div style={{ fontSize: 7, color: '#94a3b8', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
        </div>
      )}

      {/* 4. DOCX Page Render */}
      {isDoc && (
        <div
          style={{
            width: '92%',
            height: '92%',
            borderRadius: 6,
            border: '1.5px solid #cbd5e1',
            background: '#ffffff',
            padding: '10px 12px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            filter: filterStyle,
            transform: rotTransform,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#0f172a' }}>{file.name}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>P.{pageNumber}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, padding: '6px 0', overflow: 'hidden' }}>
            {(docxPage || ['Document paragraph text excerpt']).map((para, idx) => (
              <p key={idx} style={{ margin: 0, fontSize: 8, color: '#334155', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {para}
              </p>
            ))}
          </div>
          <div style={{ fontSize: 7, color: '#94a3b8', textAlign: 'right' }}>PrintBK Document</div>
        </div>
      )}

      {/* Fallback / While Loading */}
      {!rendered && !isPpt && !isDoc && (
        <div
          style={{
            width: '88%',
            height: '88%',
            background: isColour ? 'linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)' : '#f8fafc',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            padding: '10px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            filter: filterStyle
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#475569' }}>PAGE {pageNumber}</span>
            <span style={{ fontSize: 8, background: '#e2e8f0', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>
              {isColour ? 'Colour' : 'B&W'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ height: 3, background: isColour ? '#2563eb' : '#64748b', borderRadius: 2, width: '60%' }} />
            <div style={{ height: 2, background: isColour ? '#93c5fd' : '#cbd5e1', borderRadius: 1 }} />
            <div style={{ height: 2, background: isColour ? '#93c5fd' : '#cbd5e1', borderRadius: 1, width: '80%' }} />
          </div>
          <div style={{ fontSize: 8, color: '#94a3b8', textAlign: 'right' }}>{file.name}</div>
        </div>
      )}

      {/* Optional Badge */}
      {showBadge && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            background: isColour ? '#2563eb' : '#334155',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 800,
            padding: '1px 5px',
            borderRadius: 4,
            zIndex: 10
          }}
        >
          {pageNumber}
        </div>
      )}
    </div>
  );
}
