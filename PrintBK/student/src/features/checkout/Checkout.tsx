import React, { useState } from 'react';
import { Icon, Topbar, SheetShell } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { usePricing, useBasket, useHistory } from '../../store/basket';
import { api } from '../../services/api';

function UpiQR({ upiUrl, size = 220 }: { upiUrl: string; size?: number }) {
  const src = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(upiUrl)}&choe=UTF-8`;
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <img src={src} width={size} height={size} alt="UPI QR"
        style={{ borderRadius: 12, border: '2px solid #e2e8f0', display: 'block', margin: '0 auto' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      <p style={{ fontSize: 12, color: '#718096', margin: '8px 0 0' }}>
        Scan with GPay · PhonePe · Paytm · Any UPI app
      </p>
    </div>
  );
}

function makeCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

function Checkout({ go, setSheet, services }: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: any[];
}) {
  const [payment, setPayment] = useState<'UPI' | 'Cash'>('UPI');
  const [phone, setPhone] = useState(() => localStorage.getItem('printbk-phone') || '');
  const basket = useBasket();
  const pricing = usePricing();
  const { addOrder } = useHistory();
  const total = pricing.total;
  const hasQuote = pricing.quotePending;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; code: string } | null>(null);

  const shopUpiId = 'hkbkstudentpoint@upi';
  const shopName  = 'HKBK Student Point';
  const upiLink   = `upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(2)}&cu=INR&tn=PrintBK Order`;

  const placeOrder = async () => {
    if (basket.files.length === 0 && basket.services.length === 0) { setError('Your basket is empty!'); return; }
    setLoading(true); setError(null);
    if (phone) localStorage.setItem('printbk-phone', phone);

    // Generate ONE pickup code for this order — used everywhere
    const code = makeCode();
    let orderId = `local-${Date.now()}`;

    try {
      // 3.5-second network deadline: if cloud is slow, seamlessly fallback to local instant order
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3500));
      const result = await Promise.race([
        api.createOrder({ files: basket.files, services: basket.services, rush: false, pickupCode: code } as any),
        timeout
      ]);
      orderId = result.orderId;
    } catch { 
      console.warn('Backend slow or offline — saved locally'); 
    }

    // Save to history immediately with the code
    addOrder({ id: orderId, date: Date.now(), files: basket.files.map(f => f.name), total, pickupCode: code, status: payment === 'Cash' ? 'pending_cash' : 'paid' });

    if (payment === 'Cash') {
      basket.clear();
      notify('Order reserved. Pay at the counter.');
      go(`/order/${orderId}`);
      setLoading(false);
      return;
    }

    // UPI — show QR, keep basket until user confirms
    setPendingOrder({ id: orderId, code });
    setLoading(false);
  };

  const confirmPaid = () => {
    basket.clear();
    go(`/pay/${pendingOrder!.id}`);
  };

  /* ── UPI QR screen ── */
  if (pendingOrder) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg,#f7f4ee)' }}>
        <Topbar title="Pay via UPI" back onBack={() => setPendingOrder(null)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 32px' }}>
          <div style={{ maxWidth: 380, margin: '0 auto', background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#718096', marginBottom: 4 }}>Pay to {shopName}</div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginBottom: 16 }}>₹{total.toFixed(2)}</div>
            
            {/* Direct UPI Intent Button */}
            <a href={upiLink} style={{ display: 'block', background: '#10b981', color: '#fff', padding: '14px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', marginBottom: 16, fontSize: 17, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
              Open UPI App (GPay, PhonePe)
            </a>

            <div style={{ fontSize: 11, color: '#a0aec0', margin: '20px 0 12px', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, height: 1, background: '#e2e8f0' }}></span>
              OR SCAN QR
              <span style={{ flex: 1, height: 1, background: '#e2e8f0' }}></span>
            </div>

            <UpiQR upiUrl={upiLink} />
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f7f4ee', borderRadius: 10, fontSize: 13 }}>
              <b>UPI ID:</b> {shopUpiId}
            </div>
            {phone && <div style={{ marginTop: 8, fontSize: 12, color: '#718096' }}>Ready alert → {phone}</div>}
          </div>
          <button className="primary full" style={{ marginTop: 20, width: '100%', padding: 16, fontSize: 16, fontWeight: 700 }} onClick={confirmPaid}>
            ✓ I have paid — Show my ticket
          </button>
          <button onClick={() => setPendingOrder(null)} style={{ display: 'block', width: '100%', marginTop: 10, padding: 10, background: 'none', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer' }}>
            ← Change payment method
          </button>
        </div>
      </main>
    );
  }

  /* ── Normal checkout ── */
  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg,#f7f4ee)' }}>
      <Topbar title="Checkout" back onBack={() => go('basket')} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Summary */}
        <div style={{ background: '#fff', padding: '16px 24px', marginBottom: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: '#718096', fontSize: 14 }}>
              {basket.files.length} file{basket.files.length !== 1 ? 's' : ''}
              {basket.services.length > 0 ? ` · ${basket.services.length} service${basket.services.length !== 1 ? 's' : ''}` : ''}
            </span>
            <button style={{ background: 'none', border: 'none', fontSize: 13, color: '#3b82f6', cursor: 'pointer', padding: 0 }} onClick={() => setSheet('breakdown')}>
              Breakdown →
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: '#718096' }}>{basket.files.reduce((s, f) => s + f.pages, 0)} pages</span>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>₹{total.toFixed(2)}</span>
          </div>
          {pricing.savingsTip && (
            <div style={{ fontSize: 12, color: '#1f9d55', marginTop: 8, padding: '6px 10px', background: '#f0fdf4', borderRadius: 8 }}>
              💡 {pricing.savingsTip}
            </div>
          )}
        </div>

        {/* Payment options */}
        <div style={{ padding: '20px 24px 8px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Pay with</h2>
          {(['UPI', 'Cash'] as const).map(m => (
            <label key={m} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 10,
              background: payment === m ? '#eff6ff' : '#fff',
              border: `2px solid ${payment === m ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 14, cursor: 'pointer'
            }}>
              <input type="radio" name="pay" value={m} checked={payment === m} onChange={() => setPayment(m)} style={{ accentColor: '#3b82f6' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{m === 'UPI' ? '📱 UPI / Scan & Pay' : '💵 Cash at counter'}</div>
                <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                  {m === 'UPI' ? 'GPay · PhonePe · Paytm · Any UPI app' : 'Pay when your print is ready'}
                </div>
              </div>
            </label>
          ))}
        </div>

        {payment === 'UPI' && (
          <div style={{ padding: '0 24px 16px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#718096' }}>
              Phone <small style={{ fontWeight: 400 }}>(optional — for ready alert)</small>
            </label>
            <input type="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box' }} />
          </div>
        )}

        {error && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 10, color: '#c53030', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 24px 32px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
        <button className="primary full" style={{ width: '100%', padding: 16, fontSize: 17, fontWeight: 700, borderRadius: 14 }}
          onClick={placeOrder} disabled={loading || (basket.files.length === 0 && basket.services.length === 0)}>
          {loading ? 'Placing order…' : hasQuote ? 'Send for quote' : payment === 'UPI' ? `📱 Pay via UPI — ₹${total.toFixed(2)}` : `✓ Confirm cash order`}
        </button>
      </div>
    </main>
  );
}
export default Checkout;
