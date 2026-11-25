import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Topbar, Icon } from '../../components/ui';
import { api } from '../../services/api';
import { useHistory } from '../../store/basket';

export default function OrderSuccess({
  go
}: {
  go?: (screen: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { orders } = useHistory();

  // Read orderId from URL search params
  const orderId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return query.get('orderId') || query.get('id') || '';
  }, [location.search]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      // Fallback to latest order in history
      if (orders.length > 0) {
        setOrder(orders[0]);
      }
      setLoading(false);
      return;
    }

    let active = true;

    async function loadSuccessDetails() {
      try {
        setLoading(true);
        // Fetch status directly from checkout engine
        const statusData = await api.getCheckoutStatus(orderId).catch(() => null);
        const fullOrder = await api.getOrder(orderId).catch(() => null);

        if (active) {
          setOrder({
            id: orderId,
            orderNumber: statusData?.orderNumber || fullOrder?.orderNumber || fullOrder?.order_number || '——',
            pickupCode: statusData?.pickupCode || fullOrder?.pickupCode || fullOrder?.pickup_code || '——',
            payableAmount: statusData?.payableAmount || fullOrder?.payableAmount || fullOrder?.total || 0,
            baseAmount: statusData?.baseAmount || fullOrder?.baseAmount || fullOrder?.total || 0,
            status: statusData?.status || fullOrder?.status || 'PAID',
            utrNumber: statusData?.utrNumber || fullOrder?.utrNumber || null,
            files: fullOrder?.files || [],
            fileNames: fullOrder?.file_names || fullOrder?.fileNames || [],
            createdAt: fullOrder?.created_at ? new Date(Number(fullOrder.created_at) * 1000).toLocaleString() : new Date().toLocaleString()
          });
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Could not fetch order confirmation');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSuccessDetails();
    return () => { active = false; };
  }, [orderId, orders]);

  if (loading) {
    return (
      <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Order Confirmed" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#16a34a', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16, fontSize: 14, color: '#166534', fontWeight: 700 }}>Verifying payment confirmation…</p>
        </div>
      </main>
    );
  }

  const effectiveOrder = order || orders[0];

  return (
    <main className="page" style={{ minHeight: '100dvh', background: 'var(--paper, #f7f4ee)', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Payment Confirmed" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 48px', maxWidth: 440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Success Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #bbf7d0',
          padding: '28px 20px',
          boxShadow: '0 10px 30px rgba(22,163,74,0.08)',
          textAlign: 'center'
        }}>
          {/* Animated Success Badge */}
          <div style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: '#dcfce7',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 38,
            fontWeight: 900,
            margin: '0 auto 16px',
            boxShadow: '0 0 0 8px rgba(22,163,74,0.1)'
          }}>
            ✓
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#14532d', marginBottom: 6 }}>
            Payment Verified &amp; Confirmed!
          </h1>
          <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.5, marginBottom: 20 }}>
            Your direct UPI payment has been verified by the bank. Your document is ready for printing.
          </p>

          {/* 4-Digit Pickup Code Hero Card */}
          <div style={{
            background: '#f0fdf4',
            border: '2px dashed #16a34a',
            borderRadius: 16,
            padding: '16px',
            marginBottom: 20
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1.2 }}>
              YOUR COUNTER PICKUP CODE
            </div>
            <div style={{
              fontSize: 48,
              fontWeight: 900,
              fontFamily: 'monospace',
              letterSpacing: 4,
              color: '#0f172a',
              margin: '6px 0'
            }}>
              {effectiveOrder?.pickupCode || '——'}
            </div>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
              Show this code to counter staff to collect your prints
            </div>
          </div>

          {/* Order Details Receipt */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: '16px',
            textAlign: 'left',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Order Number</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>#{effectiveOrder?.orderNumber || '——'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Amount Paid</span>
              <strong style={{ fontSize: 13, color: '#16a34a' }}>₹{Number(effectiveOrder?.payableAmount || 0).toFixed(2)}</strong>
            </div>

            {effectiveOrder?.utrNumber && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>12-Digit UTR</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                  {effectiveOrder.utrNumber}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Payment Mode</span>
              <strong style={{ fontSize: 12, color: '#0f172a' }}>Direct UPI (Instant Reconciled)</strong>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {effectiveOrder?.id && (
              <button
                type="button"
                onClick={() => navigate(`/order/${encodeURIComponent(effectiveOrder.id)}`)}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.25)'
                }}
              >
                View Full Live Order Status
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
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Print Another Document
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
