import React, { useState, useEffect } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory } from '../../store/basket';
import { useParams } from 'react-router-dom';

const steps = ['Queued', 'Printing', 'Ready!'];

function Ticket({ go, setSheet }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void }) {
  const { id } = useParams<{ id: string }>();
  const { orders } = useHistory();

  // Find the specific order from history by ID (or fall back to latest)
  const order = id ? orders.find(o => o.id === id) ?? orders[0] : orders[0];

  // Pickup code comes ONLY from the stored order — never generated fresh
  const pickupCode = order?.pickupCode ?? '——';
  const displayId = order ? `#${order.id.slice(-6).toUpperCase()}` : id ? `#${id.slice(-6).toUpperCase()}` : '#——';
  const total = order?.total ?? 0;

  const [stage, setStage] = useState(0);
  const [, setSheet_] = useState<Sheet>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 3000);
    const t2 = setTimeout(() => setStage(2), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <main className="page ticket-page" style={{ background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh' }}>
      <Topbar title="Order ticket" />

      <section className="ticket-card" style={{ margin: '16px', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ background: 'var(--color-primary,#0b1020)', color: '#fff', padding: '20px 24px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 4 }}>PRINTBK ORDER</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>{displayId}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
            {order?.files?.length ?? 0} file{(order?.files?.length ?? 0) !== 1 ? 's' : ''} · ₹{total.toFixed(2)}
          </div>
        </div>

        {/* Pickup code — THE source of truth */}
        <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#718096', marginBottom: 8 }}>PICKUP CODE</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: 12, lineHeight: 1 }}>{pickupCode}</span>
            <button onClick={async () => { await navigator.clipboard?.writeText(pickupCode); notify('Pickup code copied'); }}
              aria-label="Copy pickup code"
              style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
              <Icon name="copy" size={18} />
            </button>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: stage === 2 ? '#1f9d55' : '#718096', fontWeight: stage === 2 ? 600 : 400 }}>
            {stage === 0 ? 'Your job is queued — we\'ll print it shortly' : stage === 1 ? 'Printing now — almost ready!' : `Ready! Show code ${pickupCode} at the counter.`}
          </p>
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', padding: '16px 24px', gap: 0 }}>
          {steps.map((step, i) => (
            <div key={step} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', left: 0, top: 14, width: '50%', height: 2, background: i <= stage ? '#1f9d55' : '#e2e8f0' }} />}
              {i < steps.length - 1 && <div style={{ position: 'absolute', right: 0, top: 14, width: '50%', height: 2, background: i < stage ? '#1f9d55' : '#e2e8f0' }} />}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, position: 'relative', zIndex: 1,
                background: i < stage ? '#1f9d55' : i === stage ? '#0b1020' : '#e2e8f0',
                color: i <= stage ? '#fff' : '#718096'
              }}>
                {i < stage ? <Icon name="check" size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === stage ? '#0b1020' : '#718096', fontWeight: i === stage ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>

        {/* Files */}
        {(order?.files?.length ?? 0) > 0 && (
          <div style={{ padding: '0 24px 16px', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: '#718096', margin: '12px 0 8px' }}>FILES IN THIS ORDER</div>
            {order!.files.map((name, i) => (
              <div key={i} style={{ fontSize: 13, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < order!.files.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <Icon name="file" size={14} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 10, padding: '0 16px 16px' }}>
        <button style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
          onClick={() => setSheet('receipt')}>
          <Icon name="download" /> Receipt
        </button>
        <button style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
          onClick={() => {
            const text = `PrintBK order ${displayId} — Pickup code ${pickupCode}`;
            if (navigator.share) navigator.share({ title: 'PrintBK', text }).catch(() => {});
            else { navigator.clipboard?.writeText(text); notify('Copied to clipboard'); }
          }}>
          <Icon name="share" /> Share
        </button>
      </div>

      <button className="support-link" style={{ display: 'block', width: '100%', textAlign: 'center', padding: 8, background: 'none', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer' }}
        onClick={() => setSheet('report')}>Report a problem</button>
      <button style={{ display: 'block', width: '100%', textAlign: 'center', padding: '8px 8px 24px', background: 'none', border: 'none', color: '#c53030', fontSize: 13, cursor: 'pointer' }}
        onClick={() => { notify('Files deleted'); go('entry'); }}>
        <Icon name="trash" size={14} /> Delete my files now
      </button>
    </main>
  );
}
export default Ticket;
