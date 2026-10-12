import React, { useState, useMemo } from 'react';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useBasket } from '../../store/basket';
import { layoutSheets, type LayoutSheetsResult, type SheetLayout, type PlacedPage } from '@printbk/shared';

function PrintPreview({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const { files } = useBasket();
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [currentSheetIdx, setCurrentSheetIdx] = useState(0);

  const activeFile = files[selectedFileIdx] || files[0];

  // Derive layout sheets for the active file using the shared pure engine
  const layoutResult: LayoutSheetsResult = useMemo(() => {
    if (!activeFile) {
      return layoutSheets({ pages: [{ pageNumber: 1, width: 210, height: 297, rotation: 0 }] });
    }

    const s = activeFile.settings;
    const pageRotationsMap: Record<number, number> = {};
    if (s.pageRotations) {
      Object.entries(s.pageRotations).forEach(([k, v]) => {
        pageRotationsMap[parseInt(k, 10)] = Number(v);
      });
    }

    // Use actual pageMetrics if extracted, or generate standard pages
    const inputPages = (activeFile.pageMetrics && activeFile.pageMetrics.length > 0)
      ? activeFile.pageMetrics.map(m => ({
          pageNumber: m.pageNumber,
          width: m.width,
          height: m.height,
          rotation: m.rotation || 0
        }))
      : Array.from({ length: activeFile.pages || 1 }, (_, i) => ({
          pageNumber: i + 1,
          width: 210,
          height: 297,
          rotation: 0
        }));

    return layoutSheets({
      pages: inputPages,
      paper: s.paper as any || 'A4',
      nUp: (s.nUp || 1) as any,
      layout: (s.layout || (s.booklet ? 'booklet' : 'standard')) as any,
      sides: s.sided || 'single',
      orientation: s.orientation || 'auto',
      pageRotations: pageRotationsMap
    });
  }, [activeFile]);

  const sheets = layoutResult.sheets;
  const currentSheet: SheetLayout | undefined = sheets[currentSheetIdx] || sheets[0];
  const totalSheets = sheets.length;

  // Handle pager navigation
  const prevSheet = () => setCurrentSheetIdx(i => Math.max(0, i - 1));
  const nextSheet = () => setCurrentSheetIdx(i => Math.min(totalSheets - 1, i + 1));

  if (!activeFile) {
    return (
      <main className="page" style={{ background: '#f7f4ee', minHeight: '100dvh', padding: 24, textAlign: 'center' }}>
        <Topbar title="Print Preview" back onBack={() => go('basket')} />
        <div style={{ marginTop: 40, color: '#64748b' }}>No documents in basket to preview.</div>
        <button className="primary" style={{ marginTop: 20 }} onClick={() => go('basket')}>Return to Basket</button>
      </main>
    );
  }

  const isPortrait = currentSheet?.orientation === 'portrait';
  // Aspect ratio for physical sheet (e.g. A4 = 210/297)
  const sheetAspect = isPortrait ? (currentSheet.width / currentSheet.height) : (currentSheet.width / currentSheet.height);

  return (
    <main className="page preview-page" style={{ background: '#f7f4ee', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Print Preview" back onBack={() => go('basket')} />

      <div style={{ flex: 1, padding: '16px 20px 100px', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* File selector if multiple files */}
        {files.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 10 }}>
            {files.map((f, idx) => (
              <button
                key={f.id}
                onClick={() => { setSelectedFileIdx(idx); setCurrentSheetIdx(0); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: idx === selectedFileIdx ? '2px solid #0f172a' : '1px solid #cbd5e1',
                  background: idx === selectedFileIdx ? '#0f172a' : '#fff',
                  color: idx === selectedFileIdx ? '#fff' : '#475569',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                📄 {f.name}
              </button>
            ))}
          </div>
        )}

        {/* Header Label: What you see is what prints */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
          <span style={{ color: '#64748b', fontWeight: 600 }}>What you see is what prints</span>
          <b style={{ color: '#0f172a', fontWeight: 800 }}>Sheet {currentSheetIdx + 1} of {totalSheets}</b>
        </div>

        {/* Orientation & Duplex Banner */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ background: '#e2e8f0', color: '#334155', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
            📄 {layoutResult.paper} ({currentSheet?.orientation})
          </span>
          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
            🔄 Flip on {layoutResult.duplexEdge}-edge
          </span>
          {activeFile.settings.sided === 'double' && (
            <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              {currentSheet?.side === 'front' ? 'Side A (Front)' : 'Side B (Back)'}
            </span>
          )}
        </div>

        {/* Auto Notes (e.g. Mixed slide notice) */}
        {layoutResult.notes.length > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#166534', fontWeight: 600 }}>
            💡 {layoutResult.notes.join(' ')}
          </div>
        )}

        {/* ── Realistic Sheet Surface with Imposed Slots ── */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${sheetAspect}`,
          background: '#ffffff',
          borderRadius: 8,
          border: '2px solid #0f172a',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12), 4px 4px 0 #cbd5e1',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          {currentSheet && currentSheet.pages.map((p, idx) => {
            // Percent coordinates relative to sheet size
            const leftPct = (p.x / currentSheet.width) * 100;
            const topPct = (p.y / currentSheet.height) * 100;
            const widthPct = (p.width / currentSheet.width) * 100;
            const heightPct = (p.height / currentSheet.height) * 100;

            if (p.isHandoutNoteLine) {
              return (
                <div
                  key={`note-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                    padding: '8px 4px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
                  <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
                  <div style={{ borderBottom: '1.5px dashed #94a3b8', width: '100%' }} />
                </div>
              );
            }

            const isCustomColour = activeFile.settings.colorMode === 'custom';
            const isColourPage = activeFile.settings.colorMode === 'color' ||
              (isCustomColour && (activeFile as any).colorPages?.includes?.(p.pageNumber));

            return (
              <div
                key={`page-${p.pageNumber}-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: isColourPage ? '#eff6ff' : '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  transform: p.rotation ? `rotate(${p.rotation}deg)` : 'none',
                  transition: 'transform 0.2s ease',
                  overflow: 'hidden'
                }}
              >
                {/* Visual lines resembling document content */}
                <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.6 }}>
                  <div style={{ height: 3, background: isColourPage ? '#3b82f6' : '#64748b', borderRadius: 2, width: '60%' }} />
                  <div style={{ height: 2, background: isColourPage ? '#93c5fd' : '#cbd5e1', borderRadius: 1 }} />
                  <div style={{ height: 2, background: isColourPage ? '#93c5fd' : '#cbd5e1', borderRadius: 1 }} />
                  <div style={{ height: 2, background: isColourPage ? '#93c5fd' : '#cbd5e1', borderRadius: 1, width: '85%' }} />
                </div>

                {/* Page Badge */}
                <div style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  background: isColourPage ? '#3b82f6' : '#334155',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 4
                }}>
                  {p.pageNumber}
                </div>

                {/* Colour Badge Indicator */}
                {isColourPage && (
                  <div style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#2563eb'
                  }} title="Colour page" />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Pager Controls ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <button
            onClick={prevSheet}
            disabled={currentSheetIdx <= 0}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              background: currentSheetIdx <= 0 ? '#f1f5f9' : '#fff',
              color: currentSheetIdx <= 0 ? '#94a3b8' : '#0f172a',
              cursor: currentSheetIdx <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 13
            }}
          >
            ← Previous
          </button>

          {/* Dots Indicator */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {sheets.slice(0, 8).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === currentSheetIdx ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === currentSheetIdx ? '#0f172a' : '#cbd5e1',
                  transition: 'all 0.2s ease'
                }}
              />
            ))}
            {sheets.length > 8 && <span style={{ fontSize: 10, color: '#94a3b8' }}>+{sheets.length - 8}</span>}
          </div>

          <button
            onClick={nextSheet}
            disabled={currentSheetIdx >= totalSheets - 1}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              background: currentSheetIdx >= totalSheets - 1 ? '#f1f5f9' : '#fff',
              color: currentSheetIdx >= totalSheets - 1 ? '#94a3b8' : '#0f172a',
              cursor: currentSheetIdx >= totalSheets - 1 ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 13
            }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Bottom Button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 20px 24px' }}>
        <button
          className="primary full"
          style={{ width: '100%', padding: 15, fontSize: 16, fontWeight: 700, borderRadius: 14 }}
          onClick={() => go('checkout')}
        >
          ✓ Preview looks good — Proceed to Checkout
        </button>
      </div>
    </main>
  );
}

export default PrintPreview;
