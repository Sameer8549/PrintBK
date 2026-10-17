import React from 'react';
import { Brand, SheetShell, Icon } from '../../components/ui';
import { Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory, usePricing, useBasket } from '../../store/basket';
import { computePaymentStatus, getPaymentBadgeDetails } from '@printbk/shared';

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
  // Pull order from history (check props or active URL route)
  const { orders } = useHistory();
  const urlOrderId = (() => {
    if (orderId) return orderId;
    const match = window.location.hash.match(/\/order\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : undefined;
  })();
  const targetOrder = urlOrderId ? (orders.find(o => o.id === urlOrderId) ?? orders[0]) : orders[0];

  if (targetOrder?.status === 'pending_payment') {
    return (
      <SheetShell tall onClose={() => setSheet(null)}>
        <div style={{ textAlign: 'center', padding: '36px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>PAUSED</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0b1020', margin: '0 0 8px' }}>Order Not Confirmed</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, margin: '0 0 24px' }}>
            Receipt is not available because this order is still awaiting payment selection. Please choose Cash or UPI at checkout.
          </p>
          <button
            onClick={() => setSheet(null)}
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              background: '#0b1020',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Back to Order
          </button>
        </div>
      </SheetShell>
    );
  }

  const displayId = orderId
    ? `#${orderId.slice(-6).toUpperCase()}`
    : targetOrder?.orderNumber
      ? `#${targetOrder.orderNumber}`
      : targetOrder
        ? `#${targetOrder.id.slice(-6).toUpperCase()}`
        : '#——';

  const code = (['pending_payment', 'pending_cash', 'waiting_quote', 'upi_started', 'upi_claimed'].includes(targetOrder?.status ?? '') || !targetOrder?.pickupCode || targetOrder.pickupCode === '——')
    ? '——'
    : targetOrder.pickupCode;
  const total = targetOrder?.total ?? 0;
  const files = targetOrder?.files ?? [];
  const dateStr = targetOrder
    ? new Date(targetOrder.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '——';
  const isCash = (paymentMethod?.toLowerCase().includes('cash') || targetOrder?.paymentMethod === 'cash' || targetOrder?.status === 'pending_cash');
  const isUpi = !isCash;
  const method = isCash ? 'Cash at Counter' : 'UPI Transfer';

  const paymentStatus = computePaymentStatus(targetOrder);
  const payBadge = getPaymentBadgeDetails(paymentStatus, total, targetOrder?.status);

  const saveAsPDF = () => {
    const popup = window.open('', '_blank', 'width=460,height=760');
    if (!popup) { notify('Allow pop-ups to save the receipt'); return; }
    const rows = files.map(name => `<div class="row"><span>${name}</span><b>—</b></div>`).join('');
    const servicesRows = (services ?? []).map(s => `<div class="row"><span>${s.name}</span><b>${s.price == null ? 'Quote' : `₹${s.price}`}</b></div>`).join('');

    const paySectionHtml = isCash ? `
      <div class="pay-card cash-card">
        <div class="pay-badge">PAYMENT: CASH AT COUNTER</div>
        <div class="pay-row"><span>Collection Counter:</span><b>HKBK Student Point Desk</b></div>
        <div class="pay-row"><span>Amount Payable:</span><b class="due">₹${total.toFixed(2)} (Cash Due)</b></div>
        <div class="pay-row"><span>Payment Status:</span><b>DUE ON PICKUP</b></div>
        <div class="pay-desc">Please pay exact cash at counter when your pickup code is called.</div>
      </div>
    ` : `
      <div class="pay-card upi-card">
        <div class="pay-badge">PAYMENT: UPI INSTANT TRANSFER</div>
        <div class="pay-row"><span>Merchant Payee:</span><b>PrintBK HKBK</b></div>
        <div class="pay-row"><span>Beneficiary VPA:</span><b>Q098686787@ybl</b></div>
        <div class="pay-row"><span>Amount Paid:</span><b class="paid">₹${total.toFixed(2)}</b></div>
        <div class="pay-row"><span>Transaction Status:</span><b>${paymentStatus === 'paid_verified' ? 'VERIFIED' : 'CLAIMED BY STUDENT'}</b></div>
        <div class="pay-desc">Payment claimed via UPI to Q098686787@ybl. Shop staff will verify UTR and release prints.</div>
      </div>
    `;

    popup.document.write(`<!doctype html><html><head><title>PrintBK receipt ${displayId}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:28px 20px;background:#f7f4ee;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0b1020}
  .receipt{max-width:390px;margin:auto;background:#fff;border:2px solid #0b1020;padding:24px;box-shadow:6px 6px 0 #0b1020;border-radius:12px}
  header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px}
  .brand{font-size:22px;font-weight:900;letter-spacing:-0.5px}small{color:#64748b;font-size:11px}
  .dash{border-top:2px dashed #cbd5e1;margin:14px 0}
  .row{display:flex;justify-content:space-between;gap:16px;margin:8px 0;font-size:13px;align-items:center}
  .code{text-align:center;padding:14px;border:2px solid #0b1020;border-radius:10px;margin:16px 0;background:#f8fafc}
  .code b{display:block;font:900 36px monospace;letter-spacing:10px;margin:4px 0 2px}
  .total{font-size:18px;font-weight:900}
  .pay-card{margin:14px 0;padding:12px 14px;border-radius:10px;font-size:12px}
  .upi-card{background:#eff6ff;border:1.5px solid #bfdbfe;color:#1e3a8a}
  .cash-card{background:#fefce8;border:1.5px solid #fef08a;color:#713f12}
  .pay-badge{font-weight:800;font-size:11px;letter-spacing:0.8px;margin-bottom:8px}
  .pay-row{display:flex;justify-content:space-between;margin:4px 0;font-size:12px}
  .pay-desc{font-size:11px;margin-top:8px;padding-top:6px;border-top:1px dashed rgba(0,0,0,0.15);line-height:1.4}
  .due{color:#b45309;font-weight:800}
  .paid{color:#15803d;font-weight:800}
  footer{margin-top:20px;text-align:center;color:#94a3b8;font-size:11px;line-height:1.5}
  @media print{body{padding:0;background:#fff}.receipt{box-shadow:none;border:1px solid #cbd5e1;max-width:none}}
</style></head><body><div class="receipt">
<header><div><div class="brand">PrintBK</div><small>HKBK Student Point · Bengaluru</small></div><div style="text-align:right"><small>${dateStr}</small></div></header>
<div class="row"><span>Order Reference</span><b>${displayId}</b></div>
<div class="row"><span>Payment Method</span><b>${method}</b></div>
${paySectionHtml}
<div class="dash"></div>
<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#94a3b8;margin-bottom:8px">ITEMS & PRINTS</div>
${rows}
${servicesRows}
<div class="dash"></div>
<div class="row total"><span>Total Amount</span><b>₹${total.toFixed(2)}</b></div>
<div class="code"><small>PICKUP CODE</small><b>${code}</b><small>${code !== '——' ? 'Present code at counter to receive prints' : 'Issued upon counter release'}</small></div>
<footer>Files auto-delete 10 minutes after printing.<br>Thank you for using PrintBK!</footer>
</div><script>window.onload=()=>setTimeout(()=>window.print(),350)</script></body></html>`);
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
        <span style={{ background: badgeBg, color: badgeColor, padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          {badgeText}
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

        {/* Payment mode card tailored to method */}
        <div style={{
          background: isCash ? '#fefce8' : '#eff6ff',
          border: `1.5px solid ${isCash ? '#fef08a' : '#bfdbfe'}`,
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: payBadge.color, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {isCash ? 'CASH AT COUNTER' : 'UPI INSTANT PAYMENT'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isCash ? '#a16207' : '#2563eb' }}>
              {isCash ? 'Due on Pickup' : 'To: Q098686787@ybl'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.4 }}>
            {isCash ? (
              <span>Please pay <b>₹${total.toFixed(2)} in cash</b> when collecting your prints at HKBK Student Point printing desk.</span>
            ) : (
              <span>Paid to <b>PrintBK HKBK</b> (VPA: <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>Q098686787@ybl</code>). Present pickup code at counter for release.</span>
            )}
          </div>
        </div>

        {/* Files & Services breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>Items & Documents</div>
          
          {files.length > 0 ? files.map((name, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="file" size={15} />
                <span>{name}</span>
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
          <small style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
            {code !== '——' ? 'Present this 4-digit code at the counter' : 'Pickup code issued once order is approved at counter'}
          </small>
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
        onClick={() => setSheet(null)}
        style={{ width: '100%', padding: '13px', borderRadius: 12, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 12 }}
      >
        Done · Close Receipt
      </button>

      <button
        style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 8px', background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
        onClick={() => setSheet("report")}
      >
        Report a problem with this receipt
      </button>
    </SheetShell>
  );
}
export default ReceiptSheet;
