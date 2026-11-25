import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Topbar, Icon } from '../../components/ui';
import { api } from '../../services/api';
import { useHistory } from '../../store/basket';
import { notify } from '../../lib/store';

export default function OrderPending({
  go
}: {
  go?: (screen: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { orders, updateOrder } = useHistory();

  // Read orderId from URL search params
  const orderId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return query.get('orderId') || query.get('id') || '';
  }, [location.search]);

  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any>(null);
  const redirectingRef = useRef(false);

  // 1. Initial Load & Background Poller every 5 seconds
  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function pollStatus() {
      if (redirectingRef.current || !active) return;

      try {
        const res = await api.getCheckoutStatus(orderId);
        if (!active) return;

        setStatusData(res);
        setLoading(false);

        // If the bank alert arrives or staff approves it -> auto-redirect to /order-success
        if (res.status === 'PAID') {
          redirectingRef.current = true;
          updateOrder(orderId, {
            status: 'PAID',
            payment_status: 'paid_verified',
            orderNumber: res.orderNumber,
            pickupCode: res.pickupCode
          } as any);

          notify('Payment verified by bank! Opening confirmation…');
          navigate(`/order-success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
        }
      } catch (_) {
        setLoading(false);
      }
    }

    pollStatus();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollStatus();
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orderId, updateOrder, navigate]);

  return (
    <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="UTR Under Verification" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 48px', maxWidth: 440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Verification Status Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #fed7aa',
          padding: '28px 20px',
          boxShadow: '0 10px 30px rgba(249,115,22,0.06)',
          textAlign: 'center'
        }}>
          
          {/* Animated Hourglass / Clock Badge */}
          <div style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: '#ffedd5',
            color: '#ea580c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            margin: '0 auto 16px',
            boxShadow: '0 0 0 8px rgba(249,115,22,0.1)'
          }}>
            ⏳
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#9a3412', marginBottom: 6 }}>
            Payment Under Verification
          </h1>

          <p style={{ fontSize: 13, color: '#c2410c', lineHeight: 1.5, marginBottom: 20 }}>
            We received your 12-digit UPI reference number. Our automated bank reconciler is matching your transfer.
          </p>

          {/* Details Card */}
          <div style={{
            background: '#fff7ed',
            borderRadius: 14,
            border: '1px solid #ffedd5',
            padding: '16px',
            textAlign: 'left',
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #fed7aa' }}>
              <span style={{ fontSize: 12, color: '#7c2d12' }}>Order Number</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>#{statusData?.orderNumber || orderId.slice(0, 8)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #fed7aa' }}>
              <span style={{ fontSize: 12, color: '#7c2d12' }}>Payable Amount</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>₹{Number(statusData?.payableAmount || 0).toFixed(2)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 12, color: '#7c2d12' }}>Submitted 12-Digit UTR</span>
              <strong style={{ fontSize: 13, fontFamily: 'monospace', color: '#c2410c', letterSpacing: 1 }}>
                {statusData?.utrNumber || 'Under Review'}
              </strong>
            </div>
          </div>

          {/* Live Background Polling Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            marginBottom: 20
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ea580c',
              boxShadow: '0 0 0 3px rgba(234,88,12,0.2)',
              animation: 'pulse 1.6s infinite'
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
              Checking bank confirmation every 5s…
            </span>
          </div>

          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginBottom: 20 }}>
            You can keep this screen open, or head to the counter. Your order will automatically advance as soon as verified.
          </p>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orderId && (
              <button
                type="button"
                onClick={() => navigate(`/order/${encodeURIComponent(orderId)}`)}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(234,88,12,0.2)'
                }}
              >
                View Order Progress Ticket
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                width: '100%',
                padding: '12px',
                background: '#f1f5f9',
                color: '#334155',
                border: 'none',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
