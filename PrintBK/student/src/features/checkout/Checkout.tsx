import React, { useState, useEffect } from 'react';
import { Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { usePricing, useBasket, useHistory } from '../../store/basket';
import { useShopConfig } from '../../store/shopConfig';
import { api } from '../../services/api';

function Checkout({ go, setSheet, services }: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: any[];
}) {
  const [payment, setPayment] = useState<'UPI' | 'Cash' | 'Razorpay'>('UPI');
  const cfg = useShopConfig(s => s.config);
  const isOpen = cfg.open !== false;

  const enabledMethods = {
    cash: cfg.paymentMethods?.cash !== false,
    upi: cfg.paymentMethods?.upi !== false,
    razorpay: Boolean(cfg.paymentMethods?.razorpay)
  };

  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('printbk-phone') || '';
    } catch {
      return '';
    }
  });
  const basket = useBasket();
  const pricing = usePricing();
  const { addOrder } = useHistory();
  const total = pricing.total;
  const hasQuote = pricing.quotePending;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = async () => {
    if (!isOpen) {
      setError(`Shop is currently closed: ${cfg.announcement || 'Counter orders are paused.'}`);
      return;
    }
    if (basket.files.length === 0 && basket.services.length === 0) {
      setError('Your basket is empty!');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (phone) localStorage.setItem('printbk-phone', phone);
    } catch (_) {}

    try {
      const isCash = payment === 'Cash';
      const result = await api.createOrder({
        files: basket.files,
        services: basket.services,
        rush: false,
        payment: isCash ? 'Cash' : (payment === 'Razorpay' ? 'Razorpay' : 'UPI'),
        phone: phone.trim() || undefined,
        expectedTotal: total,
        settingsVersion: cfg.version
      } as any);

      addOrder({
        id: result.orderId,
        orderNumber: result.orderNumber,
        date: Date.now(),
        files: basket.files.map(f => f.name),
        total,
        pickupCode: result.pickupCode || '——',
        status: result.status || (isCash ? 'pending_cash' : 'pending_payment'),
        accessToken: result.accessToken,
        paymentMethod: isCash ? 'cash' : 'upi'
      });

      if (isCash) {
        basket.clear();
        notify('Order reserved. Pay cash at the counter.');
        go(`/order/${result.orderId}`);
      } else {
        // Direct UPI Intent / QR payment page (Keep basket intact so back button does not lose documents)
        go(`/pay/${result.orderId}`);
      }
    } catch (err: any) {
      if (err?.pricesChanged) {
        useShopConfig.getState().fetchConfig();
        setError(`Prices were updated by the counter. New total: ₹${Number(err.newTotal).toFixed(2)}. Please review and tap again.`);
      } else {
        setError(err?.message || 'Failed to place order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Normal checkout ── */
  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh' }}>
      <Topbar title="Checkout" back onBack={() => go('basket')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', maxWidth: 440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Order Summary Hero Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                📄 {basket.files.length} {basket.files.length === 1 ? 'file' : 'files'}
              </span>
              <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                📑 {basket.files.reduce((s, f) => s + f.pages, 0)} pages
              </span>
              {basket.services.length > 0 && (
                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                  ✨ {basket.services.length} services
                </span>
              )}
            </div>
            <button
              onClick={() => setSheet('breakdown')}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                color: '#2563eb',
                cursor: 'pointer',
                padding: '4px 6px'
              }}
            >
              Breakdown →
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Total payable</span>
            <span style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', letterSpacing: -1 }}>
              ₹{total.toFixed(2)}
            </span>
          </div>

          {pricing.savingsTip && (
            <div style={{
              fontSize: 11,
              color: '#15803d',
              marginTop: 12,
              padding: '8px 12px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span>💡</span>
              <span>{pricing.savingsTip}</span>
            </div>
          )}
        </div>

        {/* Payment Method Selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
            CHOOSE PAYMENT METHOD
          </div>

          {/* 1. UPI Intent / QR (Primary) */}
          <div
            onClick={() => setPayment('UPI')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              marginBottom: 10,
              background: payment === 'UPI' ? '#eff6ff' : '#ffffff',
              border: `2px solid ${payment === 'UPI' ? '#2563eb' : '#e2e8f0'}`,
              borderRadius: 14,
              cursor: 'pointer',
              boxShadow: payment === 'UPI' ? '0 4px 14px rgba(37,99,235,0.1)' : '0 2px 6px rgba(0,0,0,0.02)',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: payment === 'UPI' ? '#dbeafe' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20
              }}>
                ⚡
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Pay with UPI
                  <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                    Instant & Zero Fee
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Google Pay, PhonePe, Paytm, or QR scan
                </div>
              </div>
            </div>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `2px solid ${payment === 'UPI' ? '#2563eb' : '#cbd5e1'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: payment === 'UPI' ? '#2563eb' : '#fff'
            }}>
              {payment === 'UPI' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
            </div>
          </div>

          {/* 2. Cash at Counter */}
          {enabledMethods.cash && (
            <div
              onClick={() => setPayment('Cash')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                marginBottom: 10,
                background: payment === 'Cash' ? '#f0fdf4' : '#ffffff',
                border: `2px solid ${payment === 'Cash' ? '#16a34a' : '#e2e8f0'}`,
                borderRadius: 14,
                cursor: 'pointer',
                boxShadow: payment === 'Cash' ? '0 4px 14px rgba(22,163,74,0.1)' : '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: payment === 'Cash' ? '#dcfce7' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20
                }}>
                  💵
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Cash at Counter
                    <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                      Pay at Desk
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Pay in cash when order is called at the printing counter
                  </div>
                </div>
              </div>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${payment === 'Cash' ? '#16a34a' : '#cbd5e1'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: payment === 'Cash' ? '#16a34a' : '#fff'
              }}>
                {payment === 'Cash' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
            </div>
          )}

          {/* 3. Razorpay (only shown if configured) */}
          {enabledMethods.razorpay && (
            <div
              onClick={() => setPayment('Razorpay')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                marginBottom: 10,
                background: payment === 'Razorpay' ? '#eff6ff' : '#ffffff',
                border: `2px solid ${payment === 'Razorpay' ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: 14,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  💳
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Online Cards & Netbanking</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Debit card, Credit card, Netbanking</div>
                </div>
              </div>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${payment === 'Razorpay' ? '#2563eb' : '#cbd5e1'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: payment === 'Razorpay' ? '#2563eb' : '#fff'
              }}>
                {payment === 'Razorpay' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
            </div>
          )}
        </div>

        {/* Notification Phone Input */}
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
            📱 WhatsApp / Phone Number <small style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</small>
          </label>
          <input
            type="tel"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              fontSize: 14,
              boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Used only to send a ready notification when your document has finished printing.
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
          🔒 {cfg.shopInfo?.name || 'HKBK Student Point'} · Files auto-delete {cfg.deleteDelayMinutes || 5} minutes after printing
        </div>
      </div>

      {/* Floating CTA Bottom Bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#ffffff',
        borderTop: '1.5px solid #e2e8f0',
        padding: '14px 20px 24px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 50
      }}>
        <button
          onClick={placeOrder}
          disabled={loading || !isOpen || (basket.files.length === 0 && basket.services.length === 0)}
          style={{
            width: '100%',
            maxWidth: 440,
            padding: '16px',
            fontSize: 16,
            fontWeight: 800,
            borderRadius: 14,
            border: 'none',
            background: !isOpen ? '#94a3b8' : (payment === 'Cash' ? '#15803d' : '#2563eb'),
            color: '#ffffff',
            cursor: (loading || !isOpen) ? 'not-allowed' : 'pointer',
            boxShadow: !isOpen ? 'none' : (payment === 'Cash' ? '0 4px 14px rgba(21,128,61,0.3)' : '0 4px 14px rgba(37,99,235,0.3)'),
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          {loading ? (
            'Processing Order…'
          ) : !isOpen ? (
            'Shop Closed · Ordering Paused'
          ) : hasQuote ? (
            'Send Documents for Quote'
          ) : payment === 'Cash' ? (
            `✓ Reserve & Pay ₹${total.toFixed(2)} in Cash at Counter`
          ) : (
            `⚡ Pay ₹${total.toFixed(2)} via UPI`
          )}
        </button>
      </div>
    </main>
  );
}
export default Checkout;

