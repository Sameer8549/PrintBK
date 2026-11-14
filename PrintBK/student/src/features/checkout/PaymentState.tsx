import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Topbar, Icon, UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo, BhimLogo } from '../../components/ui';
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

  // Platform detection
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  const [activeTab, setActiveTab] = useState<'qr' | 'intent'>(isDesktop ? 'qr' : 'intent');
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [failedLaunch, setFailedLaunch] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string>('');
  const [utrInput, setUtrInput] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);

  // Tracking timestamps
  const launchTimeRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const claimedRef = useRef<boolean>(false);

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
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to initiate UPI payment');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUpi();
    return () => { active = false; };
  }, [id, order?.accessToken]);

  // Generate local offline vector QR code whenever intentUrl is loaded
  useEffect(() => {
    if (!upiData?.intentUrl) return;
    QRCode.toDataURL(upiData.intentUrl, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setLocalQrDataUrl(url))
      .catch(err => console.warn('Offline QR code generation warning:', err));
  }, [upiData?.intentUrl]);

  // Active order status poller — auto-transitions when payment is confirmed or approved by counter
  useEffect(() => {
    if (!id || redirecting) return;
    const orderId = id;
    let active = true;

    const pollTimer = setInterval(async () => {
      if (!active || claimedRef.current || document.visibilityState !== 'visible') return;
      try {
        const o = await api.getOrder(orderId, order?.accessToken);
        if (!o || !active) return;
        const paidStatuses = ['upi_claimed', 'cash_collected', 'paid', 'paid_verified', 'processing', 'printing', 'ready', 'completed'];
        if (paidStatuses.includes(o.status) || paidStatuses.includes((o as any).payment_status)) {
          claimedRef.current = true;
          setRedirecting(true);
          updateOrder(orderId, {
            status: o.status,
            payment_status: (o as any).payment_status || 'upi_claimed',
            orderNumber: o.orderNumber || order?.orderNumber,
            paymentMethod: 'upi'
          } as any);
          useBasket.getState().clear();
          notify('Payment verified! Opening confirmed receipt…');
          navigate(`/receipt/${orderId}`);
        }
      } catch (_) {}
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollTimer);
    };
  }, [id, order?.accessToken, redirecting, navigate, updateOrder]);

  // Execute automatic UPI return claim and redirect straight to receipt
  const executeAutoClaim = async (submittedUtr?: string) => {
    if (!id || claimedRef.current) return;
    claimedRef.current = true;
    setRedirecting(true);
    setSubmittingUtr(true);

    try {
      const finalUtr = (submittedUtr !== undefined ? submittedUtr : utrInput).trim() || undefined;
      const res = await api.upiReturn(id, order?.accessToken, finalUtr);
      if (order) {
        updateOrder(id, {
          status: res.status || 'upi_claimed',
          payment_status: 'upi_claimed',
          orderNumber: res.orderNumber || order?.orderNumber,
          paymentMethod: 'upi',
          utr: finalUtr
        } as any);
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
      navigate(`/receipt/${id}`);
    } catch (err: any) {
      claimedRef.current = false;
      setRedirecting(false);
      setSubmittingUtr(false);
      notify(err?.message || 'Failed to record payment. Please try again.');
    }
  };

  // Return-from-UPI hook with safety guards for mobile browsers
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
          // Ignore returns > 15 minutes after launch
          if ((now - launchedAt) > 15 * 60 * 1000) {
            launchTimeRef.current = null;
            return;
          }

          // Guard: Require page to have been hidden for at least 1.5 seconds (1500ms)
          const hiddenStart = hiddenAtRef.current || launchedAt;
          const hiddenDuration = now - hiddenStart;

          if (hiddenDuration < 1500) {
            setFailedLaunch(true);
            return;
          }

          // Valid return after completing payment in UPI app
          executeAutoClaim();
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
  }, [id, order?.accessToken]);

  const handleCopyUpiId = () => {
    if (!upiData) return;
    navigator.clipboard?.writeText(upiData.upiId).then(() => {
      setCopiedVpa(true);
      notify('UPI ID copied to clipboard');
      setTimeout(() => setCopiedVpa(false), 2500);
    }).catch(() => {});
  };

  const handleCopyAmount = () => {
    if (!upiData) return;
    navigator.clipboard?.writeText(upiData.amount.toFixed(2)).then(() => {
      setCopiedAmount(true);
      notify('Amount ₹' + upiData.amount.toFixed(2) + ' copied');
      setTimeout(() => setCopiedAmount(false), 2500);
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
        <Topbar title="UPI Payment Gateway" back onBack={() => go('checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Connecting to Open-Source UPI Gateway…</p>
        </div>
      </main>
    );
  }

  if (error || !upiData) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: '#f7f4ee', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="UPI Payment Gateway" back onBack={() => go('checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}><Icon name="arrow" size={36} /></div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Unable to load UPI payment</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', maxWidth: 320 }}>{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary" onClick={() => window.location.reload()} style={{ padding: '10px 20px' }}>Retry</button>
            <button onClick={handleSwitchToCash} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Pay Cash</button>
          </div>
        </div>
      </main>
    );
  }

  const gpayHref = isAndroid && (upiData as any)?.gpayAndroid
    ? (upiData as any).gpayAndroid
    : (isIOS && (upiData as any)?.gpayIos ? (upiData as any).gpayIos : (upiData.gpayUrl || upiData.intentUrl));

  const phonepeHref = isAndroid && (upiData as any)?.phonepeAndroid
    ? (upiData as any).phonepeAndroid
    : (isIOS && (upiData as any)?.phonepeIos ? (upiData as any).phonepeIos : (upiData.phonepeUrl || upiData.intentUrl));

  const paytmHref = isAndroid && (upiData as any)?.paytmAndroid
    ? (upiData as any).paytmAndroid
    : (isIOS && (upiData as any)?.paytmIos ? (upiData as any).paytmIos : (upiData.paytmUrl || upiData.intentUrl));

  const bhimHref = isAndroid && (upiData as any)?.bhimAndroid
    ? (upiData as any).bhimAndroid
    : (upiData.intentUrl);

  return (
    <main className="page" style={{ minHeight: '100dvh', background: '#f7f4ee', display: 'flex', flexDirection: 'column' }}>
      <Topbar title={`Pay ₹${upiData.amount.toFixed(2)}`} back onBack={() => go('checkout')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 80px', maxWidth: 460, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Order & Amount Hero Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          textAlign: 'center',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#059669', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            <span>Verified Campus Merchant</span>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: '#64748b', textTransform: 'uppercase' }}>
            TOTAL AMOUNT DUE
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', margin: '4px 0 2px', letterSpacing: -1 }}>
            ₹{upiData.amount.toFixed(2)}
          </div>
          <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            Order #{upiData.orderNumber} · {upiData.payeeName}
          </div>

          {/* Quick Copy Chips (VPA + Amount) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              padding: '5px 10px',
              borderRadius: 8
            }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#1e293b', fontWeight: 700 }}>
                {upiData.upiId}
              </span>
              <button
                type="button"
                onClick={handleCopyUpiId}
                style={{
                  background: copiedVpa ? '#dcfce7' : '#eff6ff',
                  color: copiedVpa ? '#15803d' : '#2563eb',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {copiedVpa ? 'Copied!' : 'Copy UPI'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyAmount}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: copiedAmount ? '#dcfce7' : '#f8fafc',
                color: copiedAmount ? '#15803d' : '#334155',
                border: '1px solid #cbd5e1',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span>₹{upiData.amount.toFixed(2)}</span>
              <span style={{ fontWeight: 800, color: copiedAmount ? '#15803d' : '#2563eb' }}>
                {copiedAmount ? 'Copied!' : 'Copy'}
              </span>
            </button>
          </div>
        </div>

        {/* Auto-Redirecting Banner */}
        {redirecting && (
          <div style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            borderRadius: 16,
            border: '2px solid #059669',
            padding: '16px 18px',
            textAlign: 'center',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 16px rgba(5, 150, 105, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #a7f3d0', borderTopColor: '#059669', animation: 'spin 0.8s linear infinite' }} />
              <strong style={{ fontSize: 15, fontWeight: 900, color: '#065f46' }}>
                Payment Recorded Successfully!
              </strong>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>
              Claiming order &amp; opening your confirmed receipt ticket…
            </span>
          </div>
        )}

        {/* False Return Notice (App did not open fallback) */}
        {failedLaunch && !redirecting && (
          <div style={{
            background: '#fffbeb',
            borderRadius: 16,
            border: '1.5px solid #f59e0b',
            padding: '14px 16px',
            marginBottom: 16,
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.12)'
          }}>
            <strong style={{ fontSize: 14, color: '#92400e', display: 'block', marginBottom: 4 }}>
              UPI App Didn't Open
            </strong>
            <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px', lineHeight: 1.4 }}>
              If your app didn't open automatically, switch to the <strong>Scan QR</strong> tab to pay via any UPI app.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 12,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Scan QR Code Instead
              </button>
            </div>
          </div>
        )}

        {/* Dual Mode View Switcher (Tabs) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          background: '#e2e8f0',
          borderRadius: 14,
          padding: 3,
          marginBottom: 16
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: 'none',
              background: activeTab === 'qr' ? '#ffffff' : 'transparent',
              color: activeTab === 'qr' ? '#0f172a' : '#64748b',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: activeTab === 'qr' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📷 Scan QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('intent')}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: 'none',
              background: activeTab === 'intent' ? '#ffffff' : 'transparent',
              color: activeTab === 'intent' ? '#0f172a' : '#64748b',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: activeTab === 'intent' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>⚡ Pay via UPI App</span>
          </button>
        </div>

        {/* TAB 1: SCAN QR CODE VIEW */}
        {activeTab === 'qr' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            padding: '24px 20px',
            marginBottom: 16,
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <UpiLogo size={24} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Scan &amp; Pay Instant</span>
            </div>

            {/* QR Code Container */}
            <div style={{
              background: '#fff',
              padding: 12,
              borderRadius: 16,
              border: '2px solid #0f172a',
              display: 'inline-block',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
              {localQrDataUrl ? (
                <img
                  src={localQrDataUrl}
                  alt="UPI Payment QR Code"
                  style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }}
                />
              ) : (
                <div style={{ width: 220, height: 220, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 12 }}>
                  Generating QR…
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: '#475569', margin: '14px 0 0', fontWeight: 600 }}>
              Scan using Google Pay, PhonePe, Paytm, BHIM, Navi, CRED, or any banking app
            </p>
          </div>
        )}

        {/* TAB 2: PAY VIA UPI APP (MOBILE 1-TAP) */}
        {activeTab === 'intent' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            padding: '20px',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
              SELECT YOUR UPI PAYMENT APP
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Universal Primary Intent Button */}
              <a
                href={upiData.intentUrl}
                onClick={handleLaunchUpi}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 15,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <UpiLogo size={24} />
                  <span>Pay via Any UPI App</span>
                </div>
                <span style={{ fontSize: 18 }}>➔</span>
              </a>

              {/* Direct App Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 4 }}>
                <a
                  href={gpayHref}
                  onClick={handleLaunchUpi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <GPayLogo size={28} />
                  <span>Google Pay</span>
                </a>

                <a
                  href={phonepeHref}
                  onClick={handleLaunchUpi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <PhonePeLogo size={28} />
                  <span>PhonePe</span>
                </a>

                <a
                  href={paytmHref}
                  onClick={handleLaunchUpi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <PaytmLogo size={28} />
                  <span>Paytm</span>
                </a>

                <a
                  href={bhimHref}
                  onClick={handleLaunchUpi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <BhimLogo size={28} />
                  <span>BHIM UPI</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* OPEN-SOURCE UPI GATEWAY CONFIRMATION CARD (Visible on both QR and App tabs) */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #16a34a',
          padding: '20px',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(22, 163, 74, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            <strong style={{ fontSize: 13, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Step 2: Confirm Your Payment
            </strong>
          </div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.45 }}>
            After completing payment in your UPI app, submit below to open your receipt ticket and send your files directly to the counter printers.
          </p>

          {/* 12-Digit UTR Input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
              12-Digit UPI Ref / UTR Number (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 431802938102"
              value={utrInput}
              onChange={(e) => setUtrInput(e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 22))}
              style={{
                width: '100%',
                padding: '11px 14px',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                fontSize: 14,
                fontFamily: 'monospace',
                fontWeight: 600,
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
              Found in your UPI app payment details as &ldquo;UPI Ref No.&rdquo; or &ldquo;UTR&rdquo;.
            </span>
          </div>

          {/* Big Green Primary Confirmation CTA */}
          <button
            type="button"
            disabled={submittingUtr || redirecting}
            onClick={() => executeAutoClaim(utrInput)}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 12,
              border: 'none',
              background: '#16a34a',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 800,
              cursor: submittingUtr ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
              transition: 'background 0.15s ease'
            }}
          >
            <span>{submittingUtr ? 'Recording Payment…' : '✓ I Have Paid (Open My Receipt)'}</span>
          </button>
        </div>

        {/* Security / Web Link Warning Notice */}
        <div style={{ background: '#eff6ff', borderRadius: 14, border: '1px solid #bfdbfe', padding: '12px 14px', fontSize: 12, color: '#1e40af', lineHeight: 1.45, marginBottom: 16 }}>
          <strong>💡 Open-Source Direct UPI:</strong> All payments go 100% directly to the campus merchant VPA (<strong>{upiData.upiId}</strong>) with 0% intermediate gateway deduction. If your browser blocks links, scan the QR code above!
        </div>

        {/* Fallback to cash */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            type="button"
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
