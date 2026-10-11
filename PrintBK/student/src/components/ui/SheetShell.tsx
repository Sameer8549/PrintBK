import React from 'react';

export function SheetShell({
  children,
  onClose,
  tall = false,
  noTopClose = false
}: {
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
  noTopClose?: boolean;
}) {
  return (
    <div className="sheet-layer" role="presentation" onClick={onClose}>
      <section
        className={`sheet ${tall ? "sheet--tall" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative' }}
      >
        <button className="sheet-handle" onClick={onClose} aria-label="Close sheet" />
        
        {/* Prominent Red Close Button (only if not hidden by child sheet) */}
        {!noTopClose && (
          <button
            onClick={onClose}
            aria-label="Close sheet"
            style={{
              position: 'absolute',
              top: 14,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#ef4444',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 800,
              color: '#ffffff',
              boxShadow: '0 3px 10px rgba(239, 68, 68, 0.4)',
              zIndex: 99
            }}
          >
            ✕
          </button>
        )}

        {children}
      </section>
    </div>
  );
}
export default SheetShell;
