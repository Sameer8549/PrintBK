import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Topbar, Icon, UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo, BhimLogo } from '../../components/ui';
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UPILerify checkout data
  const [checkoutData, setCheckoutData] = useState<{
    orderId: string;
    orderNumber: number | null;
    baseAmount: number;
    payableAmount: number;
    qrCodeData: string;
    upiIntentUrl: string;
    gpayUrl?: string;
    phonepeUrl?: string;
    paytmUrl?: string;
    refNote?: string;
    merchantUpiId: string;
    payeeName: string;
    expiresAt: string;
    status: 'PENDING' | 'UNDER_REVIEW' | 'PAID' | 'EXPIRED';
  } | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

  // 15-minute countdown timer state
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);
  const [isExpired, setIsExpired] = useState(false);

  // 20-second delayed "I Have Paid" fallback state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualUtr, setManualUtr] = useState('');
  const [manualUtrError, setManualUtrError] = useState<string | null>(null);
  const [submittingUtr, setSubmittingUtr] = useState(false);

  // Instant PAID animation & redirect state
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const redirectingRef = useRef(false);

  // Platform detection for responsive mobile action
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);

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
        setLoading(true);
        setError(null);

        // First check if an existing session is already active or paid
        let statusRes: any = null;
        try {
          statusRes = await api.getCheckoutStatus(orderId);
        } catch (_) {
          statusRes = null;
        }

        if (statusRes && statusRes.status === 'PAID') {
          if (active) {
            setIsPaidSuccess(true);
            redirectingRef.current = true;
            useBasket.getState().clear();
            setTimeout(() => {
              navigate(`/order-success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
            }, 600);
          }
          return;
        }

        if (statusRes && statusRes.status === 'UNDER_REVIEW') {
          if (active) {
            navigate(`/order-pending?orderId=${encodeURIComponent(orderId)}`, { replace: true });
          }
          return;
        }

        if (statusRes && statusRes.status === 'EXPIRED') {
          if (active) {
            setIsExpired(true);
            setLoading(false);
          }
          return;
        }

        // If no upiIntentUrl or session needs refresh, call createCheckout
        if (!statusRes?.upiIntentUrl || !statusRes?.payableAmount) {
          const createRes = await api.createCheckout({ orderId });
          if (!active) return;
          setCheckoutData({
            orderId: createRes.orderId,
            orderNumber: createRes.orderNumber ?? existingOrder?.orderNumber ?? null,
            baseAmount: Number(createRes.baseAmount || 0),
            payableAmount: Number(createRes.payableAmount || createRes.baseAmount || 0),
            qrCodeData: createRes.qrCodeData,
            upiIntentUrl: createRes.upiIntentUrl,
            gpayUrl: createRes.gpayUrl,
            phonepeUrl: createRes.phonepeUrl,
            paytmUrl: createRes.paytmUrl,
            refNote: createRes.refNote,
            merchantUpiId: createRes.merchantUpiId,
            payeeName: createRes.payeeName,
            expiresAt: createRes.expiresAt,
            status: 'PENDING'
          });
        } else {
          setCheckoutData({
            orderId: statusRes.orderId,
            orderNumber: statusRes.orderNumber ?? existingOrder?.orderNumber ?? null,
            baseAmount: Number(statusRes.baseAmount || 0),
            payableAmount: Number(statusRes.payableAmount || 0),
            qrCodeData: statusRes.qrCodeData || statusRes.upiIntentUrl,
            upiIntentUrl: statusRes.upiIntentUrl,
            gpayUrl: statusRes.gpayUrl,
            phonepeUrl: statusRes.phonepeUrl,
            paytmUrl: statusRes.paytmUrl,
            refNote: statusRes.refNote,
            merchantUpiId: statusRes.merchantUpiId || '',
            payeeName: statusRes.payeeName || 'HKBK Student Point',
            expiresAt: statusRes.expiresAt,
            status: statusRes.status
          });
        }
      } catch (err: any) {
        if (active) {
          console.error('[UPILerify Checkout] Init error:', err);
          setError(err?.message || 'Failed to initialize UPILerify payment session.');
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

  // Copy Merchant UPI ID
  const handleCopyUpiId = () => {
    if (!checkoutData?.merchantUpiId) return;
    navigator.clipboard?.writeText(checkoutData.merchantUpiId).then(() => {
      setCopiedUpiId(true);
      notify('UPI ID copied to clipboard');
      setTimeout(() => setCopiedUpiId(false), 2500);
    }).catch(() => {});
  };

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

  // Handle Manual 12-Digit UTR submission
  const handleSubmitManualUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUtr = manualUtr.trim();

    if (!/^\d{12}$/.test(cleanUtr)) {
      setManualUtrError('Please enter exactly 12 numeric digits (UPI Reference / UTR Number).');
      return;
    }

    try {
      setSubmittingUtr(true);
      setManualUtrError(null);

      const res = await api.submitManualUtr(orderId, cleanUtr);
      if (res.success) {
        redirectingRef.current = true;
        setShowManualModal(false);
        notify('UTR submitted for verification.');
        navigate(res.redirectUrl || `/order-pending?orderId=${encodeURIComponent(orderId)}`, { replace: true });
      } else {
        setManualUtrError('Failed to record UTR. Please verify the digits and try again.');
      }
    } catch (err: any) {
      setManualUtrError(err?.message || 'Failed to submit UTR. Check if it is already used.');
    } finally {
      setSubmittingUtr(false);
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

  // ── Instant Paid Success Overlay ──
  if (isPaidSuccess) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: '#f0fdf4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#16a34a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, marginBottom: 20, animation: 'bounce 0.6s ease' }}>
          ✓
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#166534', marginBottom: 8 }}>Payment Verified!</h2>
        <p style={{ fontSize: 15, color: '#15803d', fontWeight: 600 }}>Opening your confirmed receipt…</p>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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

          {/* Exact Payable Amount Hero */}
          <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
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

            {/* Crucial Paise Offset Notice */}
            <div style={{
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: 12,
              padding: '10px 14px',
              marginTop: 12,
              fontSize: 12,
              lineHeight: 1.45,
              color: '#1e40af',
              fontWeight: 600,
              textAlign: 'left',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start'
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <strong>Please pay the exact amount including paise</strong> (₹{checkoutData.payableAmount.toFixed(2)}) for instant automatic confirmation.
              </div>
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
            margin: '16px 0'
          }}>
            {qrDataUrl ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
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
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    {downloadingQr ? 'Saving QR…' : '📥 Save QR to Gallery'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                Loading QR code…
              </div>
            )}

            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
              Scan with any UPI app: Google Pay, PhonePe, Paytm, BHIM, or Mobile Banking
            </div>
          </div>

          {/* Dedicated UPI App Buttons & Mobile Intents */}
          <div style={{ marginBottom: 16 }}>
            {/* Direct App Launchers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <a
                href={checkoutData.gpayUrl || checkoutData.upiIntentUrl}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 6px',
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  textDecoration: 'none',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}
              >
                <GPayLogo size={22} />
                <span style={{ marginTop: 4 }}>GPay</span>
              </a>
              <a
                href={checkoutData.phonepeUrl || checkoutData.upiIntentUrl}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 6px',
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  textDecoration: 'none',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}
              >
                <PhonePeLogo size={22} />
                <span style={{ marginTop: 4 }}>PhonePe</span>
              </a>
              <a
                href={checkoutData.paytmUrl || checkoutData.upiIntentUrl}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 6px',
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  textDecoration: 'none',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}
              >
                <PaytmLogo size={22} />
                <span style={{ marginTop: 4 }}>Paytm</span>
              </a>
            </div>

            {/* Main All-UPI Intent Link */}
            <a
              href={checkoutData.upiIntentUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '15px',
                background: '#2563eb',
                color: '#ffffff',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 900,
                textDecoration: 'none',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(37,99,235,0.25)',
                boxSizing: 'border-box'
              }}
            >
              <UpiLogo size={24} />
              <span>Pay via Any UPI App (₹{checkoutData.payableAmount.toFixed(2)})</span>
            </a>
          </div>

          {/* Bank Policy Bypass Guidance Box */}
          <div style={{
            background: '#fffbeb',
            border: '1.5px solid #fde68a',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#92400e',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, marginBottom: 4 }}>
              <span>🛡️</span>
              <span>Bank app showing &ldquo;Payment blocked by policy&rdquo;?</span>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: '#78350f' }}>
              No worries! Tap <strong>Copy UPI ID</strong> below, open any UPI app, send <strong>₹{checkoutData.payableAmount.toFixed(2)}</strong> directly as a standard transfer, and enter your 12-digit UTR below for instant auto-activation.
            </p>
          </div>

          {/* Copy-to-clipboard: Merchant UPI ID & Payee */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '12px 14px',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Direct UPI ID</span>
              <button
                type="button"
                onClick={handleCopyUpiId}
                style={{
                  background: copiedUpiId ? '#dcfce7' : '#ffffff',
                  color: copiedUpiId ? '#15803d' : '#2563eb',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {copiedUpiId ? 'Copied ✓' : 'Copy UPI ID'}
              </button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', wordBreak: 'break-all' }}>
              {checkoutData.merchantUpiId || 'Q098686787@ybl'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Payee: <strong>{checkoutData.payeeName}</strong>
            </div>
          </div>

          {/* Live Automatic Status Poller Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: 10,
            border: '1px solid #e2e8f0'
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#2563eb',
              boxShadow: '0 0 0 3px rgba(37,99,235,0.2)',
              animation: 'pulse 1.8s infinite'
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
              Waiting for automatic bank confirmation…
            </span>
          </div>

          {/* Immediate UTR Access Fallback Button */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              Paid via UPI transfer or SMS delayed? Submit reference:
            </p>
            <button
              type="button"
              onClick={() => {
                setManualUtrError(null);
                setShowManualModal(true);
              }}
              style={{
                width: '100%',
                padding: '12px',
                background: '#f8fafc',
                border: '1.5px solid #2563eb',
                color: '#2563eb',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              I Have Paid (Enter 12-Digit UTR)
            </button>
          </div>

          {/* Switch to Cash Option */}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleSwitchToCash}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Prefer to pay cash at the counter? Switch here
            </button>
          </div>
        </div>
      </div>

      {/* Manual "I Have Paid" 12-Digit UTR Modal */}
      {showManualModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: 24,
            maxWidth: 420,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Enter 12-Digit UPI UTR</h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 16 }}>
              Find the 12-digit numeric <strong>UPI Reference ID / UTR Number</strong> in Google Pay, PhonePe, Paytm, or your bank SMS.
            </p>

            <form onSubmit={handleSubmitManualUtr}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  12-Digit Reference Number (UTR)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{12}"
                  maxLength={12}
                  placeholder="e.g. 423456789012"
                  value={manualUtr}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, '');
                    setManualUtr(onlyDigits);
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: manualUtrError ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: 2,
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                  {manualUtr.length}/12 digits entered
                </span>
              </div>

              {manualUtrError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
                  {manualUtrError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUtr || manualUtr.length !== 12}
                  style={{
                    flex: 2,
                    padding: '12px',
                    background: submittingUtr || manualUtr.length !== 12 ? '#94a3b8' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: 800,
                    cursor: submittingUtr || manualUtr.length !== 12 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingUtr ? 'Submitting…' : 'Submit & Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
