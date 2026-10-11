import React from 'react';
import { Brand, SheetShell, Icon } from '../../components/ui';
import { Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory, usePricing, useBasket } from '../../store/basket';

function ReceiptSheet({
  setSheet,
  services,
  orderId,
  pickupCode,
  paidAt,
  paymentMethod,
}: {
  setSheet: (sheet: any) => void;
  services?: any[];
  orderId?: string;
  pickupCode?: string;
  paidAt?: number;
  paymentMethod?: string;
}) {
  // Pull last order from history
  const { orders } = useHistory();
  const lastOrder = orders[0];

  const displayId = orderId
    ? `#${orderId.slice(-6).toUpperCase()}`
    : lastOrder
      ? `#${lastOrder.id.slice(-6).toUpperCase()}`
      : '#——';

  const code = pickupCode ?? lastOrder?.pickupCode ?? '——';
  const total = lastOrder?.total ?? 0;
  const files = lastOrder?.files ?? [];
  const dateStr = lastOrder
    ? new Date(lastOrder.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '——';
  const method = paymentMethod ?? 'UPI';

  const saveAsPDF = () => {
    const popup = window.open('', '_blank', 'width=460,height=760');
    if (!popup) { notify('Allow pop-ups to save the receipt'); return; }
    const rows = files.map(name => `<div class="row"><span>${name}</span><b>—</b></div>`).join('');
    popup.document.write(`<!doctype html><html><head><title>PrintBK receipt ${displayId}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f4ee;font-family:Arial,sans-serif;color:#0b1020}
  .receipt{max-width:380px;margin:auto;background:#fff;border:2px solid #0b1020;padding:24px;box-shadow:5px 5px 0 #0b1020}
  header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
  h1{margin:0;font-size:22px}.brand{font-size:20px;font-weight:700}small{color:#6d7283;font-size:11px}
  .dash{border-top:2px dashed #d5cdb9;margin:14px 0}.row{display:flex;justify-content:space-between;gap:16px;margin:8px 0;font-size:13px}
  .code{text-align:center;padding:14px;border:2px solid #0b1020;margin:16px 0}.code b{display:block;font:700 36px monospace;letter-spacing:8px}
  .total{font-size:18px;font-weight:700}.paid{color:#1f9d55;font-weight:700}
  footer{margin-top:20px;text-align:center;color:#7a7f90;font-size:10px}
  @media print{body{padding:0;background:#fff}.receipt{box-shadow:none;max-width:none}}
</style></head><body><div class="receipt">
<header><div><div class="brand">PrintBK</div><small>HKBK Student Point · Bengaluru</small></div><div style="text-align:right"><small>${dateStr}</small></div></header>
<div class="row"><span>Order</span><b>${displayId}</b></div>
<div class="row"><span>Payment</span><b class="paid">${method} · ₹${total.toFixed(2)}</b></div>
<div class="dash"></div>
${rows}
<div class="dash"></div>
<div class="row total"><span>Total paid</span><b>₹${total.toFixed(2)}</b></div>
<div class="code"><small>PICKUP CODE</small><b>${code}</b></div>
<footer>Files auto-delete 10 minutes after printing.<br>Thank you for using PrintBK!</footer>
</div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    popup.document.close();
  };

  const shareOrder = async () => {
    const text = `PrintBK receipt ${displayId} · ₹${total.toFixed(2)} · Pickup code ${code}`;
    if (navigator.share) { await navigator.share({ title: 'PrintBK Receipt', text }).catch(() => {}); }
    else { await navigator.clipboard?.writeText(text); notify('Receipt details copied'); }
  };

  return (
    <SheetShell tall onClose={() => setSheet(null)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#718096', textTransform: 'uppercase' }}>Official Receipt</span>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '2px 0 0', color: '#0b1020' }}>Order {displayId}</h2>
        </div>
        <span style={{ background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          ✓ PAID
        </span>
      </div>

      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1.5px solid #e2e8f0',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        {/* Brand & Date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0b1020' }}>PrintBK</div>
            <div style={{ fontSize: 12, color: '#718096' }}>HKBK Student Point · Bengaluru</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#718096' }}>Date & Time</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{dateStr}</div>
          </div>
        </div>

        {/* Payment info row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: 10 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Payment Mode</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{method}</span>
        </div>

        {/* Files & Services breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>Items & Documents</div>
          
          {files.length > 0 ? files.map((name, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                📄 {name}
              </span>
              <span style={{ color: '#64748b', fontSize: 12 }}>Print</span>
            </div>
          )) : (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
              No document details recorded
            </div>
          )}

          {(services ?? []).map(service => (
            <div key={service.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
              <div>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{service.name}</span>
                {service.detail && <small style={{ display: 'block', color: '#64748b', fontSize: 11 }}>{service.detail}</small>}
              </div>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {service.price == null ? 'Quote pending' : `₹${service.price}`}
              </span>
            </div>
          ))}
        </div>

        {/* Total separator */}
        <div style={{ borderTop: '2px dashed #e2e8f0', margin: '4px 0' }} />

        {/* Total Amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Total Paid</span>
            <small style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>Inclusive of taxes & discounts</small>
          </div>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#0f172a' }}>
            ₹{total.toFixed(2)}
          </span>
        </div>

        {/* High-visibility Pickup Code Box */}
        <div style={{
          textAlign: 'center',
          background: '#f8fafc',
          border: '2px solid #0f172a',
          borderRadius: 14,
          padding: '16px',
          marginTop: 8
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#64748b' }}>PICKUP CODE</span>
          <b style={{ display: 'block', fontSize: 42, fontWeight: 900, letterSpacing: 12, color: '#0f172a', margin: '6px 0 2px' }}>
            {code}
          </b>
          <small style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Present this 4-digit code at the counter</small>
        </div>

        <footer style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
          Files auto-delete 10 minutes after printing for privacy.<br />
          Thank you for choosing HKBK Student Point!
        </footer>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          onClick={saveAsPDF}
          style={{ flex: 1, padding: '14px', borderRadius: 12, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Icon name="download" /> Save PDF
        </button>
        <button
          onClick={shareOrder}
          style={{ flex: 1, padding: '14px', borderRadius: 12, background: '#fff', color: '#0f172a', border: '1.5px solid #cbd5e1', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Icon name="share" /> Share
        </button>
      </div>

      <button
        style={{ display: 'block', width: '100%', textAlign: 'center', padding: '12px 8px', background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 8 }}
        onClick={() => setSheet("report")}
      >
        Report a problem with this receipt
      </button>
    </SheetShell>
  );
}
export default ReceiptSheet;
