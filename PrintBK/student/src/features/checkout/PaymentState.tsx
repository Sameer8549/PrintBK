import React, { useState, useEffect, useRef } from 'react';
import { Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useHistory, useBasket } from '../../store/basket';
import { notify } from '../../lib/store';

function PaymentState({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [copied, setCopied] = useState(false);
  const [failedLaunch, setFailedLaunch] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Platform detection
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  // Tracking timestamps
  const launchTimeRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const claimedRef = useRef<boolean>(false);
  const qrShownAtRef = useRef<number>(Date.now());

  // 1. Fetch UPI payload from server
  useEffect(() => {
    if (!id) return;
    const orderId = id;
    let active = true;

    async function loadUpi() {
      try {
        setLoading(true);
        let data = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            data = await api.startUpi(orderId, order?.accessToken);
            if (data) break;
          } catch (e: any) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 800));
          }
        }
        if (!data) throw lastErr || new Error('Failed to initiate UPI payment');
        if (active) {
          setUpiData(data);
          qrShownAtRef.current = Date.now();
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

  // Execute automatic UPI return claim and redirect straight to receipt
  const executeAutoClaim = async () => {
    if (!id || claimedRef.current) return;
    claimedRef.current = true;
    setRedirecting(true);

    try {
      const res = await api.upiReturn(id, order?.accessToken);
      if (order) {
        updateOrder(id, {
          status: res.status || 'upi_claimed',
          payment_status: 'upi_claimed',
          orderNumber: res.orderNumber || order?.orderNumber,
          paymentMethod: 'upi'
        });
      } else {
        useHistory.getState().addOrder({
          id,
          orderNumber: res.orderNumber || upiData?.orderNumber,
          date: Date.now(),
          files: [],
          total: upiData?.amount || 0,
          pickupCode: '——',
          status: 'upi_claimed',
          payment_status: 'upi_claimed',
          paymentMethod: 'upi'
        });
      }
      useBasket.getState().clear();
      notify('Payment recorded! Redirecting to confirmed receipt…');
      // Zero-tap direct redirect to receipt
      navigate(`/receipt/${id}`);
    } catch (err: any) {
      claimedRef.current = false;
      setRedirecting(false);
      notify(err?.message || 'Failed to record return. Please try again.');
    }
  };

  // 2. Return-from-UPI hook with strict guards
  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now();

      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = now;
        return;
      }

      if (document.visibilityState === 'visible') {
        const launchedAt = launchTimeRef.current;
        if (launchedAt) {
          // Guard 1: Ignore returns > 15 minutes after launch
          if ((now - launchedAt) > 15 * 60 * 1000) {
            launchTimeRef.current = null;
            return;
          }

          // Guard 2: Require page to have been hidden for at least 2 seconds (2000ms)
          const hiddenStart = hiddenAtRef.current || launchedAt;
          const hiddenDuration = now - hiddenStart;

          if (hiddenDuration < 2000) {
            // False return: UPI app did not open or failed to launch
            setFailedLaunch(true);
            return;
          }

          // Valid return: Auto-claim and redirect straight to receipt
          executeAutoClaim();
        } else if (isDesktop || showQR) {
          // Desktop QR flow: If QR has been visible >= 20s and user returns to tab
          if ((now - qrShownAtRef.current) >= 20000) {
            executeAutoClaim();
          }
        }
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        handleVisibilityChange();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
    };
  }, [id, order?.accessToken, isDesktop, showQR]);

  const handleCopyUpiId = () => {
    if (!upiData) return;
    navigator.clipboard?.writeText(upiData.upiId).then(() => {
      setCopied(true);
      notify('UPI ID copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const handleSwitchToCash = async () => {
    if (!id) return;
    try {
      const res = await api.chooseCash(id, order?.accessToken);
      updateOrder(id, {
        status: res.status || 'pending_cash',
        payment_status: 'cash_due',
        orderNumber: res.orderNumber || order?.orderNumber,
        paymentMethod: 'cash'
      });
      useBasket.getState().clear();
      notify('Switched to Cash at counter.');
      navigate(`/receipt/${id}`);
    } catch (err: any) {
      notify(err?.message || 'Failed to switch to cash');
    }
  };

  const handleLaunchUpi = () => {
    launchTimeRef.current = Date.now();
    hiddenAtRef.current = Date.now();
    setFailedLaunch(false);
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

        {/* ── Auto-Redirecting Banner ── */}
        {redirecting && (
          <div style={{
            background: '#ecfdf5',
            borderRadius: 16,
            border: '1.5px solid #10b981',
            padding: '16px 20px',
            textAlign: 'center',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #a7f3d0', borderTopColor: '#059669', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#065f46' }}>
              Return detected! Opening confirmed receipt…
            </span>
          </div>
        )}

        {/* ── False Return Notice (Friendly fallback when app did not open) ── */}
        {failedLaunch && !redirecting && (
          <div style={{
            background: '#fffbeb',
            borderRadius: 16,
            border: '1.5px solid #f59e0b',
            padding: '16px 18px',
            marginBottom: 16,
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.12)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>📱</span>
              <strong style={{ fontSize: 14, color: '#92400e' }}>
                UPI App Didn't Open
              </strong>
            </div>
            <p style={{ fontSize: 13, color: '#b45309', margin: '0 0 12px', lineHeight: 1.4 }}>
              It looks like your UPI app did not launch or was closed quickly. You can try again or scan the QR code instead.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={upiData.intentUrl}
                onClick={handleLaunchUpi}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: 'none',
                  textAlign: 'center'
                }}
              >
                Try Again
              </a>
              <button
                onClick={() => setShowQR(true)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  color: '#1e293b',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Show QR Code
              </button>
            </div>
          </div>
        )}

        {/* ── 1-Tap App Launch Section ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href={upiData.intentUrl}
              onClick={handleLaunchUpi}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '16px 20px',
                borderRadius: 14,
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 16,
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                textAlign: 'center'
              }}
            >
              <span>⚡ Pay with UPI</span>
            </a>

            {/* QR Toggle Button */}
            <button
              onClick={() => setShowQR(!showQR)}
              style={{
                padding: '11px',
                borderRadius: 12,
                border: '1.5px solid #cbd5e1',
                background: showQR ? '#f1f5f9' : '#ffffff',
                color: '#475569',
                fontSize: 13,
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
