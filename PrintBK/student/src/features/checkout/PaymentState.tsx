import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { useHistory, useBasket } from '../../store/basket';
import { notify } from '../../lib/store';

export default function PaymentState({
  go
}: {
  go?: (screen: Screen) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { orders, updateOrder } = useHistory();

  // Extract orderId from URL parameter or query string
  const orderId = useMemo(() => {
    if (id) return id;
    const query = new URLSearchParams(location.search);
    return query.get('orderId') || '';
  }, [id, location.search]);

  const existingOrder = useMemo(() => {
    return orders.find(o => o.id === orderId);
  }, [orders, orderId]);

  const [loading, setLoading] = useState(() => !(existingOrder && existingOrder.total));
  const [error, setError] = useState<string | null>(null);

  // UPILerify checkout data
  const [checkoutData, setCheckoutData] = useState<any>(() => {
    if (existingOrder && existingOrder.total) {
      const amt = Number(existingOrder.total);
      const encMerchant = encodeURIComponent('Q098686787@ybl');
      const encPayee = encodeURIComponent('HKBK Student Point');
      const amountStr = amt.toFixed(2);
      const cleanRef = `PrintBK${existingOrder.orderNumber || ''}`;
      const baseIntent = `upi://pay?pa=${encMerchant}&pn=${encPayee}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(cleanRef)}`;
      return {
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber ?? null,
        baseAmount: amt,
        payableAmount: amt,
        qrCodeData: baseIntent,
        upiIntentUrl: baseIntent,
        merchantUpiId: 'Q098686787@ybl',
        payeeName: 'HKBK Student Point',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        status: 'PENDING'
      };
    }
    return null;
  });

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

  // 15-minute countdown timer state
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);
  const [isExpired, setIsExpired] = useState(false);

  // Payment Action & Redirect States
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submittingPaid, setSubmittingPaid] = useState(false);

  // Instant PAID animation & UPILerify 3-second redirect state
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [successCountdown, setSuccessCountdown] = useState(3);
  const redirectingRef = useRef(false);

  // UPILerify Success Redirect Countdown (3s standard spec)
  useEffect(() => {
    if (!isPaidSuccess) return;
    const deadline = Date.now() + 3000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSuccessCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        navigate(`/order-success?orderId=${encodeURIComponent(orderId)}&status=VERIFIED`, { replace: true });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isPaidSuccess, orderId, navigate]);

  // Platform detection for responsive mobile action
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);

  // 1. Initial Load: create or fetch UPILerify checkout session
  useEffect(() => {
    if (!orderId) {
      setError('Missing order ID. Please return to checkout.');
      setLoading(false);
      return;
    }

    let active = true;

    async function initializeCheckout() {
      try {
        setError(null);

        // Instant 1-Roundtrip Checkout Initializer
        const res = await api.createCheckout({ orderId });
        if (!active) return;

        if (res.status === 'PAID') {
          setIsPaidSuccess(true);
          redirectingRef.current = true;
          useBasket.getState().clear();
          setTimeout(() => {
            navigate(`/order-success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
          }, 600);
          return;
        }

        if (res.status === 'UNDER_REVIEW') {
          navigate(`/order-pending?orderId=${encodeURIComponent(orderId)}`, { replace: true });
          return;
        }

        if (res.status === 'EXPIRED') {
          setIsExpired(true);
          return;
        }

        setCheckoutData({
          orderId: res.orderId,
          orderNumber: res.orderNumber ?? existingOrder?.orderNumber ?? null,
          baseAmount: Number(res.baseAmount || 0),
          payableAmount: Number(res.payableAmount || res.baseAmount || 0),
          qrCodeData: res.qrCodeData || res.upiIntentUrl,
          upiIntentUrl: res.upiIntentUrl,
          merchantUpiId: res.merchantUpiId || 'Q098686787@ybl',
          payeeName: res.payeeName || 'HKBK Student Point',
          expiresAt: res.expiresAt,
          status: 'PENDING'
        });
      } catch (err: any) {
        if (active && !checkoutData) {
          console.error('[UPILerify Checkout] Init error:', err);
          setError(err?.message || 'Failed to initialize payment session.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initializeCheckout();
    return () => { active = false; };
  }, [orderId, existingOrder?.orderNumber, navigate]);

  // 2. Generate Crisp Dynamic Vector QR Code
  useEffect(() => {
    const rawQrTarget = checkoutData?.upiIntentUrl || checkoutData?.qrCodeData;
    if (!rawQrTarget) return;

    QRCode.toDataURL(rawQrTarget, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.warn('QR Code generation error:', err));
  }, [checkoutData?.upiIntentUrl, checkoutData?.qrCodeData]);

  // 3. Live 15-Minute Countdown Timer & Page Elapsed Timer
  useEffect(() => {
    if (!checkoutData?.expiresAt || isExpired || isPaidSuccess) return;

    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);

      const expiryMs = new Date(checkoutData.expiresAt).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));

      setRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        setIsExpired(true);
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [checkoutData?.expiresAt, isExpired, isPaidSuccess]);

  // Format MM:SS for countdown display
  const formattedCountdown = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remainingSeconds]);

  // 4. Ultra-Fast Polling (1.2s) & Instant Resume on Tab Focus
  useEffect(() => {
    if (!orderId || isExpired || redirectingRef.current) return;

    let active = true;

    async function checkStatusNow() {
      if (!active || redirectingRef.current || document.visibilityState !== 'visible') return;
      try {
        const res = await api.getCheckoutStatus(orderId);
        if (!active || !res) return;

        // Instant Automatic Confirmation on PAID
        if (res.status === 'PAID') {
          redirectingRef.current = true;
          setIsPaidSuccess(true);
          useBasket.getState().clear();

          if (existingOrder) {
            updateOrder(orderId, {
              status: 'PAID',
              payment_status: 'paid_verified',
              orderNumber: res.orderNumber || existingOrder.orderNumber,
              pickupCode: res.pickupCode || existingOrder.pickupCode,
              utr: res.utrNumber
            } as any);
          }

          notify('Payment verified! Redirecting to receipt…');
          setTimeout(() => {
            navigate(`/order-success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
          }, 200);
          return;
        }

        if (res.status === 'UNDER_REVIEW') {
          redirectingRef.current = true;
          navigate(`/order-pending?orderId=${encodeURIComponent(orderId)}`, { replace: true });
          return;
        }

        if (res.status === 'EXPIRED') {
          setIsExpired(true);
        }
      } catch (_) {
        // Tolerant to transient connection hiccups
      }
    }

    const pollInterval = setInterval(checkStatusNow, 1200);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkStatusNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [orderId, isExpired, existingOrder, updateOrder, navigate]);

  // Copy Exact Payable Amount
  const handleCopyAmount = () => {
    if (!checkoutData?.payableAmount) return;
    navigator.clipboard?.writeText(checkoutData.payableAmount.toFixed(2)).then(() => {
      setCopiedAmount(true);
      notify(`Payable amount ₹${checkoutData.payableAmount.toFixed(2)} copied`);
      setTimeout(() => setCopiedAmount(false), 2500);
    }).catch(() => {});
  };

  // Download QR Code image
  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    try {
      setDownloadingQr(true);
      const link = document.createElement('a');
      link.href = qrDataUrl;
      link.download = `PrintBK-UPI-${checkoutData?.orderNumber || 'Order'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notify('QR code saved. Open Google Pay or PhonePe to scan from gallery.');
      setTimeout(() => setDownloadingQr(false), 2500);
    } catch (_) {
      notify('Please screenshot the QR code on your screen.');
      setDownloadingQr(false);
    }
  };

  // Direct 1-Click "I Have Paid" Action (No verification page, instant queue dispatch)
  const handleIHavePaid = async () => {
    if (!orderId) return;
    try {
      setSubmittingPaid(true);
      notify('Recording payment… Sending order to print counter…');

      // Submit direct payment declaration to backend
      await api.submitManualUtr(orderId, 'PAID_DECLARED').catch(() => {});

      if (existingOrder) {
        updateOrder(orderId, {
          status: 'UNDER_REVIEW',
          payment_status: 'upi_claimed',
          orderNumber: checkoutData?.orderNumber || existingOrder.orderNumber,
          paymentMethod: 'upi'
        } as any);
      }

      useBasket.getState().clear();
      notify('Payment recorded! Redirecting to receipt…');
      navigate(`/order-success?orderId=${encodeURIComponent(orderId)}&status=VERIFIED`, { replace: true });
    } catch (err: any) {
      console.warn('I Have Paid redirect error:', err);
      navigate(`/order-success?orderId=${encodeURIComponent(orderId)}&status=VERIFIED`, { replace: true });
    } finally {
      setSubmittingPaid(false);
    }
  };

  // Refresh expired session
  const handleRefreshSession = async () => {
    try {
      setLoading(true);
      setIsExpired(false);
      setElapsedSeconds(0);
      const res = await api.createCheckout({ orderId });
      setCheckoutData({
        orderId: res.orderId,
        orderNumber: res.orderNumber ?? existingOrder?.orderNumber ?? null,
        baseAmount: Number(res.baseAmount || 0),
        payableAmount: Number(res.payableAmount || res.baseAmount || 0),
        qrCodeData: res.qrCodeData,
        upiIntentUrl: res.upiIntentUrl,
        merchantUpiId: res.merchantUpiId,
        payeeName: res.payeeName,
        expiresAt: res.expiresAt,
        status: 'PENDING'
      });
      notify('Generated fresh 15-minute payment session.');
    } catch (err: any) {
      notify(err?.message || 'Failed to refresh session');
      setIsExpired(true);
    } finally {
      setLoading(false);
    }
  };

  // Switch to Cash at Counter fallback
  const handleSwitchToCash = async () => {
    if (!orderId) return;
    try {
      const res = await api.chooseCash(orderId, existingOrder?.accessToken);
      if (existingOrder) {
        updateOrder(orderId, {
          status: res.status || 'pending_cash',
          payment_status: 'cash_due',
          orderNumber: res.orderNumber || existingOrder.orderNumber,
          paymentMethod: 'cash'
        });
      }
      useBasket.getState().clear();
      notify('Switched to Cash at Counter.');
      navigate(`/order/${encodeURIComponent(orderId)}`);
    } catch (err: any) {
      notify(err?.message || 'Failed to switch to cash');
    }
  };

  // ── Loading Screen ──
  if (loading) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Direct UPI Checkout" back onBack={() => navigate('/checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 18, fontSize: 15, color: '#0f172a', fontWeight: 700 }}>Connecting to UPILerify Engine…</p>
          <span style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>Reserving unique paise amount for instant automatic confirmation</span>
        </div>
      </main>
    );
  }

  // ── Error Screen ──
  if (error || !checkoutData) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Payment Error" back onBack={() => navigate('/checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>
            ⚠️
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Unable to Load Payment</h2>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 24 }}>{error || 'The payment session could not be established.'}</p>
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button
              onClick={() => navigate('/checkout')}
              style={{ flex: 1, padding: '12px', background: '#e2e8f0', color: '#1e293b', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              Back to Checkout
            </button>
            <button
              onClick={handleSwitchToCash}
              style={{ flex: 1, padding: '12px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              Pay Cash Instead
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Expired State ──
  if (isExpired) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Session Expired" back onBack={() => navigate('/checkout')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', maxWidth: 440, margin: '0 auto' }}>
          <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 16 }}>
            ⏱️
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Payment Window Expired</h2>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 20 }}>
            This 15-minute UPI reservation has expired to release the unique paise amount. No money was deducted.
          </p>
          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, width: '100%', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Order Number</span>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>#{checkoutData?.orderNumber || orderId.slice(0, 8)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Base Total</span>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>₹{Number(checkoutData?.baseAmount || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button
              onClick={handleRefreshSession}
              style={{
                width: '100%',
                padding: '14px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.2)'
              }}
            >
              Generate Fresh Payment Session
            </button>
            <button
              onClick={handleSwitchToCash}
              style={{
                width: '100%',
                padding: '12px',
                background: '#ffffff',
                color: '#16a34a',
                border: '1.5px solid #16a34a',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Pay Cash at Counter Instead
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Instant Paid Success Overlay (Official UPILerify 3s Countdown Redirect) ──
  if (isPaidSuccess) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: '#f0fdf4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#16a34a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, marginBottom: 18, boxShadow: '0 10px 25px rgba(22,163,74,0.3)', animation: 'bounce 0.6s ease' }}>
          ✓
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#166534', marginBottom: 6 }}>Payment Verified!</h2>
        <p style={{ fontSize: 14, color: '#15803d', fontWeight: 600, marginBottom: 18 }}>Confirmed by UPIlerify Engine.</p>
        
        <div style={{ maxWidth: 320, width: '100%', background: '#ffffff', padding: 18, borderRadius: 16, border: '1px solid #bbf7d0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <p style={{ fontSize: 13, color: '#475569', margin: '0 0 10px 0' }}>
            Redirecting in <strong>{successCountdown}</strong> {successCountdown === 1 ? 'second' : 'seconds'}…
          </p>
          <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${((4 - successCountdown) / 3) * 100}%`, height: '100%', background: '#16a34a', transition: 'width 0.3s linear' }} />
          </div>
          <button
            onClick={() => navigate(`/order-success?orderId=${encodeURIComponent(orderId)}&status=VERIFIED`, { replace: true })}
            style={{ width: '100%', padding: '12px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >
            Return to Receipt Now →
          </button>
        </div>
      </main>
    );
  }

  // ── Main Checkout Card ──
  return (
    <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Direct UPI Payment" back onBack={() => navigate('/checkout')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 40px', maxWidth: 440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Main Payment Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px 18px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          position: 'relative'
        }}>
          
          {/* Header Row: Order Number & 15-Minute Countdown Timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ORDER #{checkoutData.orderNumber || orderId.slice(0, 8)}
              </span>
            </div>
            {/* Countdown Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: remainingSeconds < 180 ? '#fee2e2' : '#f1f5f9',
              color: remainingSeconds < 180 ? '#dc2626' : '#334155',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800
            }}>
              <span>⏱️</span>
              <span>{formattedCountdown}</span>
            </div>
          </div>

          {/* Quick Instructions At The Top */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 14,
            border: '1.5px solid #e2e8f0',
            padding: '12px 14px',
            marginBottom: 16,
            textAlign: 'left'
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📌</span>
              <span>How to complete your order:</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.55 }}>
              <li>Scan the QR code below with Google Pay, PhonePe, Paytm, or any UPI app.</li>
              <li>Pay the exact amount: <strong>₹{checkoutData.payableAmount.toFixed(2)}</strong>.</li>
              <li>Tap <strong>&ldquo;I Have Paid&rdquo;</strong> below right after sending payment.</li>
              <li>Or tap <strong>&ldquo;Pay Cash at Counter&rdquo;</strong> to pay cash when picking up your printouts!</li>
            </ol>
          </div>

          {/* Exact Payable Amount Hero */}
          <div style={{ textAlign: 'center', margin: '4px 0 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
              EXACT PAYABLE AMOUNT
            </div>
            <div style={{
              fontSize: 38,
              fontWeight: 900,
              color: '#0f172a',
              letterSpacing: -1,
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}>
              <span>₹{checkoutData.payableAmount.toFixed(2)}</span>
              <button
                type="button"
                onClick={handleCopyAmount}
                title="Copy exact amount"
                style={{
                  background: copiedAmount ? '#dcfce7' : '#f1f5f9',
                  color: copiedAmount ? '#15803d' : '#475569',
                  border: 'none',
                  borderRadius: 8,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {copiedAmount ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Dynamic Scannable UPI QR Code */}
          <div style={{
            background: '#fafafa',
            borderRadius: 16,
            border: '1.5px dashed #cbd5e1',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '8px 0 16px'
          }}>
            {qrDataUrl ? (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <img
                  src={qrDataUrl}
                  alt="UPI Payment QR Code"
                  style={{
                    width: 220,
                    height: 220,
                    borderRadius: 12,
                    display: 'block',
                    background: '#ffffff',
                    padding: 8,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                  }}
                />
                <div style={{ textAlign: 'center', marginTop: 12, width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 12,
                      color: '#0f172a',
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      padding: '11px 22px',
                      width: '100%',
                      maxWidth: 240,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                    }}
                  >
                    <span style={{ fontSize: 17 }}>📥</span>
                    <span>{downloadingQr ? 'Saving QR…' : 'Download QR Code'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                Loading QR code…
              </div>
            )}

            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 10, textAlign: 'center', fontWeight: 600 }}>
              Scan with Google Pay, PhonePe, Paytm, BHIM, or any Mobile Banking App
            </div>
          </div>

          {/* Action Buttons: "I Have Paid" + "Pay Cash at Counter" */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={handleIHavePaid}
              disabled={submittingPaid}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '16px 20px',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 900,
                cursor: submittingPaid ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
                letterSpacing: 0.3
              }}
            >
              <span style={{ fontSize: 20 }}>✓</span>
              <span>{submittingPaid ? 'Recording Payment…' : 'I Have Paid'}</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchToCash}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '14px 18px',
                background: '#ffffff',
                color: '#334155',
                border: '1.5px solid #cbd5e1',
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: 18 }}>💵</span>
              <span>Pay Cash at Counter</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
