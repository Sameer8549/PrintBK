import React, { useState, useEffect } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory, useBasket } from '../../store/basket';
import { api } from '../../services/api';
import { computePaymentStatus, getPaymentBadgeDetails, type PaymentStatus } from '@printbk/shared';

function History({ go, setSheet }: { go: (screen: Screen) => void; setSheet?: (sheet: Sheet) => void }) {
  const { orders, updateOrder } = useHistory();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync latest status from server for any active/unfinalized orders or pending payment statuses
  useEffect(() => {
    const activeOrders = orders.filter(
      o => !o.id.startsWith('local-') && (
        !['completed', 'cancelled', 'rejected', 'expired'].includes(o.status) ||
        (!o.payment_status || !['paid_verified', 'cash_collected', 'not_paid', 'refunded'].includes(o.payment_status))
      )
    );
    activeOrders.forEach(async (ord) => {
      try {
        const live = await api.getOrder(ord.id, ord.accessToken);
        if (live && (live.status !== ord.status || live.payment_status !== ord.payment_status)) {
          updateOrder(ord.id, {
            status: live.status,
            payment_status: live.payment_status,
            pickupCode: live.pickupCode || ord.pickupCode,
            orderNumber: live.orderNumber || ord.orderNumber
          });
        }
      } catch (_) {}
    });
  }, [orders, updateOrder]);

  const handlePrintAgain = (order: any) => {
    const { addFile } = useBasket.getState();
    const filesToRestore = order.files || [];
    if (filesToRestore.length === 0) {
      notify('No document information found for this order');
      return;
    }

    filesToRestore.forEach((fileName: string) => {
      const ext = fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
      addFile({
        id: crypto.randomUUID(),
        name: fileName,
        size: 1024,
        type: ext,
        pages: 1,
        colorPages: 0,
        colorDetection: 'pending',
        settings: {
          copies: 1,
          colorMode: 'bw',
          sided: 'double',
          paper: 'A4',
          orientation: 'auto',
          nUp: 1,
          layout: 'standard',
          pageRotations: {},
          booklet: false,
          range: 'all'
        }
      });
    });

    notify(`Restored ${filesToRestore.length} document(s) to basket`);
    go('basket');
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return { label: 'Ready for Pickup', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
      case 'printing':
        return { label: 'Printing', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
      case 'processing':
        return { label: 'Queued to Print', bg: '#fefce8', color: '#ca8a04', border: '#fef08a' };
      case 'completed':
        return { label: 'Completed', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
      case 'cancelled':
        return { label: 'Cancelled', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      case 'rejected':
        return { label: 'Rejected', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      case 'expired':
        return { label: 'Expired', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      default:
        return { label: 'Order Placed', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    }
  };

  return (
    <main className="page" style={{ background: 'var(--color-bg, #f7f4ee)', minHeight: '100dvh', paddingBottom: 48 }}>
      <Topbar title="Order History" back onBack={() => go("entry")} />

      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          background: '#0b1020',
          color: '#ffffff',
          padding: '8px 16px',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span>Offline · Your orders are saved on this device; we will sync when reconnected.</span>
        </div>
      )}

      <div style={{ maxWidth: 580, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {orders.length === 0 ? (
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            padding: '48px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#64748b'
            }}>
              <Icon name="history" size={26} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0b1020', margin: '0 0 6px' }}>
              No past orders yet
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px', lineHeight: 1.5 }}>
              Your print jobs and digital receipts will appear here once you place your first order.
            </p>
            <button
              onClick={() => go("entry")}
              style={{
                background: '#0b1020',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Start New Print Job
            </button>
          </div>
        ) : (
          <>
            {/* ── Section Title ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 4px' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0b1020', margin: 0 }}>
                  Recent Orders
                </h2>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                  Stored securely on this device
                </span>
              </div>
              <span style={{
                background: '#e2e8f0',
                color: '#334155',
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 99
              }}>
                {orders.length} order{orders.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Order Cards ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {orders.map((order) => {
                const orderBadge = getOrderStatusBadge(order.status);
                const paymentStatus: PaymentStatus = computePaymentStatus(order);
                const payBadge = getPaymentBadgeDetails(paymentStatus, order.total, order.status);

                const orderNumStr = order.orderNumber
                  ? `#${order.orderNumber}`
                  : `#${order.id.slice(-6).toUpperCase()}`;
                const dateStr = new Date(order.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={order.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: 16,
                      border: '1.5px solid #e2e8f0',
                      padding: '18px 20px',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    {/* Header Row: Order Number & Separate Status Chips */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#0b1020', letterSpacing: -0.5 }}>
                          {orderNumStr}
                        </span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          · {dateStr}
                        </span>
                      </div>

                      {/* Two Distinct Chips: Order Status + Payment Status */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                          background: orderBadge.bg,
                          color: orderBadge.color,
                          border: `1px solid ${orderBadge.border}`,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 99,
                          whiteSpace: 'nowrap'
                        }}>
                          {orderBadge.label}
                        </span>

                        <span style={{
                          background: payBadge.bg,
                          color: payBadge.color,
                          border: `1px solid ${payBadge.border}`,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 99,
                          whiteSpace: 'nowrap'
                        }}>
                          {payBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Files & Amount Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                        <Icon name="file" size={16} />
                        <span style={{ fontWeight: 500 }}>
                          {order.files.length} document{order.files.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        ₹{order.total.toFixed(2)}
                      </span>
                    </div>

                    {/* Footer Row: Pickup code & Action button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {order.pickupCode && order.pickupCode !== '——' ? (
                          <span>Pickup code: <b style={{ color: '#0f172a', letterSpacing: 1.5 }}>{order.pickupCode}</b></span>
                        ) : order.filesDeletedAt ? (
                          <span style={{ color: '#059669' }}>Files deleted</span>
                        ) : (
                          <span>Show at counter</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => handlePrintAgain(order)}
                          title="Restore documents and settings to basket"
                          style={{
                            background: '#f1f5f9',
                            color: '#0f172a',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          ⟳ Print again
                        </button>
                        <button
                          onClick={() => go(`/receipt/${order.id}`)}
                          style={{
                            background: '#0b1020',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          View Receipt <Icon name="arrow" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default History;
