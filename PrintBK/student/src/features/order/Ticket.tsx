import React, { useState, useEffect } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory } from '../../store/basket';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';

const steps = ['Queued', 'Printing', 'Ready!'];

function Ticket({ go, setSheet }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void }) {
  const { id } = useParams<{ id: string }>();
  const { orders, updateOrder } = useHistory();

  // Find the specific order from history by ID (or fall back to latest)
  const order = id ? orders.find(o => o.id === id) ?? orders[0] : orders[0];

  // Poll server for live status updates if not a local-only order
  useEffect(() => {
    if (!order?.id || order.id.startsWith('local-')) return;
    let isMounted = true;

    const poll = async () => {
      try {
        const data = await api.getOrder(order.id, order.accessToken);
        if (!isMounted || !data) return;
        updateOrder(order.id, {
          status: data.status,
          pickupCode: data.pickupCode || order.pickupCode,
          orderNumber: data.orderNumber || order.orderNumber,
          deleteAfter: data.deleteAfter || order.deleteAfter,
          filesDeletedAt: data.filesDeletedAt || order.filesDeletedAt,
        });
      } catch (err) {
        // Silently retain cached state
      }
    };

    poll();
    const isFinal = ['completed', 'cancelled', 'rejected', 'expired'].includes(order.status);
    if (!isFinal) {
      const timer = setInterval(poll, 3500);
      return () => { isMounted = false; clearInterval(timer); };
    }
    return () => { isMounted = false; };
  }, [order?.id, order?.status, order?.accessToken]);

  const status = order?.status ?? 'pending_cash';
  const orderNumber = order?.orderNumber ? `#${order.orderNumber}` : order?.id ? `#${order.id.slice(-6).toUpperCase()}` : '#——';
  const pickupCode = (['pending_payment', 'pending_cash', 'waiting_quote'].includes(status) || !order?.pickupCode || order.pickupCode === '——')
    ? '——'
    : order.pickupCode;
  const total = order?.total ?? 0;

  // Compute stage for progress bar
  let stage = 0;
  if (status === 'printing') stage = 1;
  else if (status === 'ready' || status === 'completed') stage = 2;

  // Status message based on server status
  let statusMessage = "Your job is queued — we'll print it shortly";
  if (status === 'pending_cash') {
    statusMessage = `Show order ${orderNumber} at counter to pay ₹${total.toFixed(2)} and start printing`;
  } else if (status === 'printing') {
    statusMessage = 'Printing now — almost ready!';
  } else if (status === 'ready') {
    statusMessage = `Ready! Show code ${pickupCode} at the counter.`;
  } else if (status === 'completed') {
    statusMessage = 'Order completed! Thank you.';
  } else if (status === 'rejected') {
    statusMessage = 'Order rejected at counter. Please speak with staff.';
  } else if (status === 'cancelled') {
    statusMessage = 'Order cancelled.';
  }

  // Deletion timer / notice
  const isDeleted = Boolean(order?.filesDeletedAt);
  const deleteAfterTime = order?.deleteAfter
    ? new Date(order.deleteAfter * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const handleDeleteFiles = async () => {
    if (!order?.id) return;
    try {
      await api.deleteFiles(order.id, order.accessToken);
      updateOrder(order.id, { filesDeletedAt: Math.floor(Date.now() / 1000) });
      notify('Files permanently deleted');
    } catch (err: any) {
      notify(err?.message || 'Deletion failed');
    }
  };

  return (
    <main className="page ticket-page" style={{ background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh' }}>
      <Topbar title="Order ticket" />

      <section className="ticket-card" style={{ margin: '16px', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ background: 'var(--color-primary,#0b1020)', color: '#fff', padding: '20px 24px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 4 }}>PRINTBK ORDER</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>{orderNumber}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
            {order?.files?.length ?? 0} file{(order?.files?.length ?? 0) !== 1 ? 's' : ''} · ₹{total.toFixed(2)}
          </div>
        </div>

        {/* Pickup code — Revealed only once order reaches processing */}
        <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#718096', marginBottom: 8 }}>PICKUP CODE</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: 12, lineHeight: 1 }}>{pickupCode}</span>
            {pickupCode !== '——' && (
              <button onClick={async () => { await navigator.clipboard?.writeText(pickupCode); notify('Pickup code copied'); }}
                aria-label="Copy pickup code"
                style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
                <Icon name="copy" size={18} />
              </button>
            )}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: stage === 2 ? '#1f9d55' : '#718096', fontWeight: stage === 2 ? 600 : 400 }}>
            {statusMessage}
          </p>

          {/* Student-Facing Files Deletion Line */}
          <div style={{ marginTop: 10, fontSize: 12, color: isDeleted ? '#1f9d55' : '#718096' }}>
            {isDeleted
              ? '✓ Files permanently deleted'
              : deleteAfterTime
                ? `🕒 Files deleted at ${deleteAfterTime}`
                : '🕒 Files deleted 5 mins after pickup'}
          </div>
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
            const text = `PrintBK order ${orderNumber} — Pickup code ${pickupCode}`;
            if (navigator.share) navigator.share({ title: 'PrintBK', text }).catch(() => {});
            else { navigator.clipboard?.writeText(text); notify('Copied to clipboard'); }
          }}>
          <Icon name="share" /> Share
        </button>
      </div>

      <button className="support-link" style={{ display: 'block', width: '100%', textAlign: 'center', padding: 8, background: 'none', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer' }}
        onClick={() => setSheet('report')}>Report a problem</button>
      {!isDeleted && (
        <button style={{ display: 'block', width: '100%', textAlign: 'center', padding: '8px 8px 24px', background: 'none', border: 'none', color: '#c53030', fontSize: 13, cursor: 'pointer' }}
          onClick={handleDeleteFiles}>
          <Icon name="trash" size={14} /> Delete my files now
        </button>
      )}
    </main>
  );
}
export default Ticket;
