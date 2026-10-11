import React from 'react';
import { SheetShell } from '../../components/ui';
import { usePricing, useBasket } from '../../store/basket';

function BreakdownSheet({
  close,
  services = []
}: {
  close: () => void;
  services?: any[];
}) {
  const pricing = usePricing();
  const basket = useBasket();

  return (
    <SheetShell tall noTopClose onClose={close}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#64748b', textTransform: 'uppercase' }}>
          TRANSPARENT PRICING
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 0', color: '#0f172a' }}>
          Detailed Calculations
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
          Exact line-by-line formula for your print order
        </p>
      </div>

      {/* Itemized Calculation Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
        {pricing.lines.map(line => (
          <div
            key={line.id}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: 14,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            {/* Top row: Name & Subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {line.name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {line.detail}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', whiteSpace: 'nowrap' }}>
                ₹{line.total.toFixed(2)}
              </div>
            </div>

            {/* Detailed Math Formula Box */}
            {line.formula && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'monospace',
                marginTop: 2
              }}>
                <span style={{ fontSize: 13 }}>🧮</span>
                <span style={{ fontWeight: 600 }}>{line.formula}</span>
              </div>
            )}
          </div>
        ))}

        {pricing.lines.length === 0 && basket.files.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            No documents in your basket yet
          </div>
        )}

        {/* Rush Fee if enabled */}
        {pricing.rushFee > 0 && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fef3c7', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#b45309', fontSize: 13 }}>⚡ Rush Priority</span>
              <small style={{ display: 'block', color: '#d97706', fontSize: 11 }}>Jump to front of print queue</small>
            </div>
            <b style={{ color: '#b45309', fontSize: 15 }}>₹{pricing.rushFee.toFixed(2)}</b>
          </div>
        )}
      </div>

      {/* Savings Tip Banner */}
      {pricing.savingsTip && (
        <div style={{
          background: '#f0fdf4',
          border: '1.5px solid #bbf7d0',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: '#15803d',
          fontSize: 12,
          fontWeight: 600
        }}>
          <span>💡</span>
          <span>{pricing.savingsTip}</span>
        </div>
      )}

      {pricing.quotePending && (
        <div style={{
          background: '#fffbeb',
          border: '1.5px solid #fef3c7',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 16,
          color: '#b45309',
          fontSize: 12,
          fontWeight: 600
        }}>
          ⚠ Some custom services require physical confirmation at counter.
        </div>
      )}

      {/* Total Card */}
      <div style={{
        background: '#fff',
        border: '2px solid #0f172a',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Final Amount</span>
          <small style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>Inclusive of single/double rates</small>
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>
          ₹{pricing.total.toFixed(2)}
        </div>
      </div>

      {/* Red Background Full-Width Close Button (Same as Checkout Button) */}
      <button
        onClick={close}
        style={{
          width: '100%',
          padding: '16px',
          background: '#ef4444',
          color: '#ffffff',
          border: 'none',
          borderRadius: 14,
          fontSize: 17,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}
      >
        ✕ Close Price Breakdown
      </button>
    </SheetShell>
  );
}
export default BreakdownSheet;
