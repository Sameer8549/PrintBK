import React, { useState, useEffect } from 'react';
import { Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useHistory } from '../../store/basket';
import { notify } from '../../lib/store';

function PaymentState({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const { orders, updateOrder } = useHistory();
  const order = id ? orders.find(o => o.id === id) : orders[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upiData, setUpiData] = useState<{
    upiId: string;
    payeeName: string;
    amount: number;
    intentUrl: string;
    gpayUrl: string;
    phonepeUrl: string;
    paytmUrl: string;
    tr: string;
    orderNumber: number;
  } | null>(null);

  const [showQR, setShowQR] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [returnedFromApp, setReturnedFromApp] = useState(false);

  // Platform detection
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  // 1. Fetch UPI payload from server
  useEffect(() => {
    if (!id) return;
    const orderId = id;
    let active = true;

    async function loadUpi() {
      try {
        setLoading(true);
        const data = await api.startUpi(orderId, order?.accessToken);
        if (active) {
          setUpiData(data);
          // Auto-show QR code on desktop
          if (isDesktop) setShowQR(true);
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to initiate UPI payment');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUpi();
    return () => { active = false; };
  }, [id, order?.accessToken, isDesktop]);

  // 2. Return-from-UPI hook (Page Visibility Change)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setReturnedFromApp(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleCopyUpiId = () => {
    if (!upiData) return;
    navigator.clipboard?.writeText(upiData.upiId).then(() => {
      setCopied(true);
      notify('UPI ID copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const handleClaimPayment = async () => {
    if (!id) return;
    setClaiming(true);
    try {
      const res = await api.upiReturn(id, order?.accessToken, utrInput.trim() || undefined);
      updateOrder(id, {
        status: res.status || 'upi_claimed',
        orderNumber: res.orderNumber || order?.orderNumber
      });
      notify('Payment claimed! Shop will verify and approve print.');
      go(`/order/${id}`);
    } catch (err: any) {
      notify(err?.message || 'Could not record claim. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const handleSwitchToCash = async () => {
    if (!id) return;
    try {
      const res = await api.chooseCash(id, order?.accessToken);
      updateOrder(id, {
        status: res.status || 'pending_cash',
        orderNumber: res.orderNumber || order?.orderNumber
      });
      notify('Switched to Cash at counter.');
      go(`/order/${id}`);
    } catch (err: any) {
      notify(err?.message || 'Failed to switch to cash');
    }
  };

  if (loading) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: '#f7f4ee', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="UPI Payment" back onBack={() => go('checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Connecting to UPI…</p>
        </div>
      </main>
    );
  }

  if (error || !upiData) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: '#f7f4ee', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="UPI Payment" back onBack={() => go('checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Unable to load UPI payment</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', maxWidth: 300 }}>{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary" onClick={() => window.location.reload()} style={{ padding: '10px 20px' }}>Retry</button>
            <button onClick={handleSwitchToCash} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Pay Cash</button>
          </div>
        </div>
      </main>
    );
  }

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiData.intentUrl)}`;

  return (
    <main className="page" style={{ minHeight: '100dvh', background: '#f7f4ee', display: 'flex', flexDirection: 'column' }}>
      <Topbar title={`Pay ₹${upiData.amount.toFixed(2)}`} back onBack={() => go('checkout')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', maxWidth: 440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Order & Amount Hero Header Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '24px 20px',
          textAlign: 'center',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            <span>✓ Verified Campus Merchant</span>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: '#64748b', textTransform: 'uppercase' }}>
            TOTAL AMOUNT DUE
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#0f172a', margin: '4px 0 2px', letterSpacing: -1 }}>
            ₹{upiData.amount.toFixed(2)}
          </div>
          <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            Order #{upiData.orderNumber} · {upiData.payeeName}
          </div>

          {/* Copyable VPA Chip */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            padding: '6px 14px',
            borderRadius: 10,
            marginTop: 14
          }}>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#1e293b', fontWeight: 700 }}>
              {upiData.upiId}
            </span>
            <button
              onClick={handleCopyUpiId}
              style={{
                background: copied ? '#dcfce7' : '#eff6ff',
                color: copied ? '#15803d' : '#2563eb',
                border: 'none',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </div>

        {/* ── 1-Tap App Launch Section ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚡</span>
            <span>{isAndroid ? 'Pay with your installed UPI app:' : isIOS ? 'Choose your UPI app:' : 'Pay using phone or QR code:'}</span>
          </div>

          {/* Branded 1-tap app buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Google Pay */}
            <a
              href={upiData.gpayUrl || upiData.intentUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#ffffff',
                color: '#1a73e8',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span style={{ color: '#1f2937' }}>Google Pay</span>
              </div>
              <span style={{ fontSize: 12, color: '#1a73e8', fontWeight: 700 }}>Open app →</span>
            </a>

            {/* PhonePe */}
            <a
              href={upiData.phonepeUrl || upiData.intentUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#ffffff',
                color: '#5f259f',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🟣</span>
                <span style={{ color: '#1f2937' }}>PhonePe</span>
              </div>
              <span style={{ fontSize: 12, color: '#5f259f', fontWeight: 700 }}>Open app →</span>
            </a>

            {/* Paytm */}
            <a
              href={upiData.paytmUrl || upiData.intentUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#ffffff',
                color: '#002970',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🔵</span>
                <span style={{ color: '#1f2937' }}>Paytm</span>
              </div>
              <span style={{ fontSize: 12, color: '#002970', fontWeight: 700 }}>Open app →</span>
            </a>

            {/* Generic Intent / Any UPI App */}
            <a
              href={upiData.intentUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px',
                borderRadius: 12,
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(15,23,42,0.15)'
              }}
            >
              <span>🚀 Open Any Other UPI App</span>
            </a>

            {/* QR Toggle Button */}
            <button
              onClick={() => setShowQR(!showQR)}
              style={{
                padding: '10px',
                marginTop: 2,
                borderRadius: 10,
                border: '1.5px solid #cbd5e1',
                background: showQR ? '#f1f5f9' : '#ffffff',
                color: '#475569',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>📷</span>
              <span>{showQR ? 'Hide UPI QR Code' : 'Show QR Code to Scan on Another Phone'}</span>
            </button>
          </div>

          {/* Desktop or QR toggle display */}
          {(isDesktop || showQR) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 6px', borderTop: '1px solid #f1f5f9', marginTop: 14 }}>
              <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '2px solid #0f172a', display: 'inline-block', boxShadow: '4px 4px 0 #cbd5e1' }}>
                <img
                  src={qrImageUrl}
                  alt="UPI Payment QR Code"
                  style={{ width: 200, height: 200, display: 'block', borderRadius: 8 }}
                />
              </div>
              <p style={{ fontSize: 12, color: '#475569', margin: '10px 0 0', textAlign: 'center', fontWeight: 600 }}>
                Scan with Google Pay, PhonePe, Paytm, or BHIM
              </p>
            </div>
          )}
        </div>

        {/* ── Return-From-UPI Claim Card ── */}
        <div style={{
          background: returnedFromApp ? '#ecfdf5' : '#ffffff',
          borderRadius: 20,
          border: returnedFromApp ? '2px solid #10b981' : '1.5px solid #e2e8f0',
          padding: '20px',
          boxShadow: returnedFromApp ? '0 4px 20px rgba(16,185,129,0.15)' : '0 4px 16px rgba(0,0,0,0.03)',
          transition: 'all 0.3s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{returnedFromApp ? '🎉' : '✓'}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              {returnedFromApp ? 'Back from your UPI app?' : 'Confirm your payment'}
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.4 }}>
            After approving the payment in your UPI app, tap below so our print counter system can immediately verify and print your order.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
              12-digit UPI Reference / UTR <small style={{ fontWeight: 400, color: '#94a3b8' }}>(optional — found in UPI receipt)</small>
            </label>
            <input
              type="text"
              placeholder="e.g. 428901234567"
              value={utrInput}
              onChange={e => setUtrInput(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 13px',
                borderRadius: 10,
                border: '1.5px solid #cbd5e1',
                fontSize: 13,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            onClick={handleClaimPayment}
            disabled={claiming}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: 14,
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 800,
              cursor: claiming ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {claiming ? 'Recording claim…' : `✓ I Have Completed Payment (₹${upiData.amount.toFixed(2)})`}
          </button>
        </div>

        {/* Fallback to cash */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={handleSwitchToCash}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Having trouble? Switch to Cash at Counter instead
          </button>
        </div>
      </div>
    </main>
  );
}

export default PaymentState;
