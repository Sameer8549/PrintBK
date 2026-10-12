import React, { useState, useEffect } from 'react';
import { Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { usePricing, useBasket, useHistory } from '../../store/basket';
import { api } from '../../services/api';

function Checkout({ go, setSheet, services }: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: any[];
}) {
  const [payment, setPayment] = useState<'UPI' | 'Cash' | 'Razorpay'>('UPI');
  const [enabledMethods, setEnabledMethods] = useState<{ cash: boolean; upi: boolean; razorpay: boolean }>({ cash: true, upi: true, razorpay: false });
  const [phone, setPhone] = useState(() => localStorage.getItem('printbk-phone') || '');
  const basket = useBasket();
  const pricing = usePricing();
  const { addOrder } = useHistory();
  const total = pricing.total;
  const hasQuote = pricing.quotePending;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg?.paymentMethods) {
        setEnabledMethods({
          cash: cfg.paymentMethods.cash !== false,
          upi: true,
          razorpay: Boolean(cfg.paymentMethods.razorpay)
        });
      }
    }).catch(() => {});
  }, []);

  const placeOrder = async () => {
    if (basket.files.length === 0 && basket.services.length === 0) {
      setError('Your basket is empty!');
      return;
    }
    setLoading(true);
    setError(null);
    if (phone) localStorage.setItem('printbk-phone', phone);

    try {
      const isCash = payment === 'Cash';
      const result = await api.createOrder({
        files: basket.files,
        services: basket.services,
        rush: false,
        payment: isCash ? 'Cash' : 'UPI',
        phone: phone.trim() || undefined
      } as any);

      addOrder({
        id: result.orderId,
        orderNumber: result.orderNumber,
        date: Date.now(),
        files: basket.files.map(f => f.name),
        total,
        pickupCode: result.pickupCode || '——',
        status: result.status || (isCash ? 'pending_cash' : 'pending_payment'),
        accessToken: result.accessToken
      });

      basket.clear();

      if (isCash) {
        notify('Order reserved. Pay cash at the counter.');
        go(`/order/${result.orderId}`);
      } else {
        // Direct UPI Intent / QR payment page
        go(`/pay/${result.orderId}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Choose payment method</h2>

          {/* 1. UPI Intent / QR (Primary) */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 10,
            background: payment === 'UPI' ? '#eff6ff' : '#fff',
            border: `2px solid ${payment === 'UPI' ? '#3b82f6' : '#e2e8f0'}`,
            borderRadius: 14, cursor: 'pointer'
          }}>
            <input type="radio" name="pay" value="UPI" checked={payment === 'UPI'} onChange={() => setPayment('UPI')} style={{ accentColor: '#3b82f6' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ Pay with UPI
                <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>Fastest</span>
              </div>
              <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                GPay, PhonePe, Paytm, or scan QR
              </div>
            </div>
          </label>

          {/* 2. Cash at counter */}
          {enabledMethods.cash && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 10,
              background: payment === 'Cash' ? '#eff6ff' : '#fff',
              border: `2px solid ${payment === 'Cash' ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 14, cursor: 'pointer'
            }}>
              <input type="radio" name="pay" value="Cash" checked={payment === 'Cash'} onChange={() => setPayment('Cash')} style={{ accentColor: '#3b82f6' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>💵 Cash at counter</div>
                <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                  Pay cash when your order is called at the shop
                </div>
              </div>
            </label>
          )}

          {/* 3. Dormant Razorpay (only shown if configured) */}
          {enabledMethods.razorpay && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 10,
              background: payment === 'Razorpay' ? '#eff6ff' : '#fff',
              border: `2px solid ${payment === 'Razorpay' ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 14, cursor: 'pointer'
            }}>
              <input type="radio" name="pay" value="Razorpay" checked={payment === 'Razorpay'} onChange={() => setPayment('Razorpay')} style={{ accentColor: '#3b82f6' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>💳 Online Gateway (Razorpay)</div>
                <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                  Cards, Netbanking
                </div>
              </div>
            </label>
          )}
        </div>

        <div style={{ padding: '0 24px 16px' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#718096' }}>
            Phone <small style={{ fontWeight: 400 }}>(optional — for ready alert)</small>
          </label>
          <input type="tel" placeholder="" value={phone} onChange={e => setPhone(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box' }} />
        </div>

        {error && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 10, color: '#c53030', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 24px 32px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
        <button className="primary full" style={{ width: '100%', padding: 16, fontSize: 17, fontWeight: 700, borderRadius: 14 }}
          onClick={placeOrder} disabled={loading || (basket.files.length === 0 && basket.services.length === 0)}>
          {loading ? 'Processing…' : hasQuote ? 'Send for quote' : (payment === 'Cash' ? '✓ Confirm & Pay Cash at Counter' : '⚡ Continue to UPI Payment')}
        </button>
      </div>
    </main>
  );
}
export default Checkout;

