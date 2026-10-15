import React, { useState, useEffect } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useHistory, useBasket } from '../../store/basket';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';

const steps = ['Queued', 'Printing', 'Ready!'];

function Ticket({ go, setSheet }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void }) {
  const { id } = useParams<{ id: string }>();
  const { orders, updateOrder } = useHistory();
  const [alertFired, setAlertFired] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Find the specific order from history by ID (or fall back to latest)
  const order = id ? orders.find(o => o.id === id) ?? orders[0] : orders[0];

  // Poll server for live status updates if not a local-only order
  useEffect(() => {
    if (!order?.id || order.id.startsWith('local-')) return;
    let isMounted = true;

    const poll = async () => {
      try {
        const data = await api.getOrder(order.id, order.accessToken);
        if (!isMounted || !data) return;
        updateOrder(order.id, {
          status: data.status,
          pickupCode: data.pickupCode || order.pickupCode,
          orderNumber: data.orderNumber || order.orderNumber,
          deleteAfter: data.deleteAfter || order.deleteAfter,
          filesDeletedAt: data.filesDeletedAt || order.filesDeletedAt,
        });
      } catch (err) {
        // Silently retain cached state
      }
    };

    poll();
    const isFinal = ['completed', 'cancelled', 'rejected', 'expired'].includes(order.status);
    if (!isFinal) {
      // Adaptive polling: 1s while printing/processing, 3s otherwise
      const interval = (order.status === 'printing' || order.status === 'processing') ? 1000 : 3000;
      const timer = setInterval(poll, interval);
      return () => { isMounted = false; clearInterval(timer); };
    }
    return () => { isMounted = false; };
  }, [order?.id, order?.status, order?.accessToken]);

  const status = order?.status ?? 'pending_cash';
  const orderNumber = (status === 'pending_payment' || (!order?.orderNumber && !order?.id))
    ? '#——'
    : order?.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-6).toUpperCase()}`;
  const pickupCode = (['pending_payment', 'pending_cash', 'waiting_quote', 'upi_started', 'upi_claimed'].includes(status) || !order?.pickupCode || order.pickupCode === '——')
    ? '——'
    : order.pickupCode;
  const total = order?.total ?? 0;

  // Compute stage for progress bar
  let stage = 0;
  if (status === 'printing') stage = 1;
  else if (status === 'ready' || status === 'completed') stage = 2;

  // Play synthesized audio chime for ready alert
  const playReadyChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      const now = ctx.currentTime;
      playTone(587.33, now, 0.22); // D5
      playTone(880, now + 0.14, 0.45); // A5
    } catch (_) {}
  };

  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('printbk-phone') || '';
    } catch {
      return '';
    }
  });
  const [phoneInput, setPhoneInput] = useState('');

  const handleSavePhone = () => {
    const cleaned = phoneInput.trim().replace(/\D/g, '');
    if (cleaned.length < 10) {
      notify('Please enter a valid 10-digit mobile number');
      return;
    }
    try {
      localStorage.setItem('printbk-phone', cleaned);
    } catch (_) {}
    setPhone(cleaned);
    notify(`✓ Pickup alert active for +91 ${cleaned}!`);
  };
  useEffect(() => {
    if (status === 'ready' && !alertFired) {
      setAlertFired(true);
      playReadyChime();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`PrintBK: Order ${orderNumber} is Ready!`, {
          body: `Your documents are printed. Present pickup code ${pickupCode} at HKBK Student Point counter!`,
          icon: '/favicon.ico'
        });
      }
      if ('vibrate' in navigator) {
        navigator.vibrate([250, 100, 250, 100, 300]);
      }
      notify(`🎉 Order ${orderNumber} is ready for pickup!`);
    }
  }, [status, alertFired, orderNumber, pickupCode]);

  // Request notification permission if not yet decided
  const enableNotifications = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        notify('✓ Notifications enabled for ready alerts');
      } else {
        notify('Notifications blocked in browser');
      }
    }
  };

  // Status message based on server status
  let statusMessage = "Your job is queued — we'll print it shortly";
  if (status === 'pending_payment') {
    statusMessage = 'Payment method not selected yet. Please complete checkout to start printing.';
  } else if (status === 'pending_cash') {
    statusMessage = `Show order ${orderNumber} at counter to pay ₹${total.toFixed(2)} and start printing`;
  } else if (status === 'upi_started') {
    statusMessage = 'Awaiting UPI app payment. Tap "I Have Paid" once completed.';
  } else if (status === 'upi_claimed') {
    statusMessage = 'UPI Payment Claimed · Shopkeeper will verify payment & print.';
  } else if (status === 'processing') {
    statusMessage = 'Order approved! Preparing documents for printing.';
  } else if (status === 'printing') {
    statusMessage = 'Printing now — almost ready!';
  } else if (status === 'ready') {
    statusMessage = `Ready! Show code ${pickupCode} at the counter.`;
  } else if (status === 'completed') {
    statusMessage = 'Order completed! Thank you.';
  } else if (status === 'rejected') {
    statusMessage = 'Order rejected at counter. Please speak with staff.';
  } else if (status === 'cancelled') {
    statusMessage = 'Order cancelled.';
  }

  // Deletion timer / notice
  const isDeleted = Boolean(order?.filesDeletedAt);
  const deleteAfterTime = order?.deleteAfter
    ? new Date(order.deleteAfter * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const handleDeleteFiles = async () => {
    if (!order?.id) return;
    setDeleting(true);
    try {
      await api.deleteFiles(order.id, order.accessToken);
      updateOrder(order.id, { filesDeletedAt: Math.floor(Date.now() / 1000) });
      notify('Files permanently deleted from server');
    } catch (err: any) {
      notify(err?.message || 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  const shareWhatsApp = () => {
    const text = `PrintBK Order ${orderNumber} · Pickup Code: ${pickupCode} · Amount: ₹${total.toFixed(2)} · Location: HKBK Student Point`;
    if (phone) {
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleRestoreBasket = () => {
    const filesToRestore = order?.files || [];
    if (filesToRestore.length === 0) {
      notify('No document information found to restore');
      go('entry');
      return;
    }
    const { addFile } = useBasket.getState();
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

  return (
    <main className="page ticket-page" style={{ background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh', paddingBottom: 48 }}>
      <Topbar title="Order Ticket" back onBack={() => go('entry')} />

      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        {/* ── Pending Payment Warning Banner ── */}
        {status === 'pending_payment' && (
          <div style={{
            margin: '16px 16px 0',
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: 16,
            padding: '18px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)'
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#b45309' }}>
              ⚠️ Payment Method Not Selected
            </div>
            <p style={{ margin: '6px 0 14px', fontSize: 13, color: '#92400e', lineHeight: 1.4 }}>
              This order has not been confirmed yet. Order details, receipt, and pickup code are withheld until you choose UPI or Cash at counter.
            </p>
            <button
              onClick={() => go('checkout')}
              style={{
                background: '#0b1020',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              Select Payment Method (₹{total.toFixed(2)}) →
            </button>
          </div>
        )}

        {/* ── Order Rejected Banner ── */}
        {status === 'rejected' && (
          <div style={{
            margin: '16px 16px 0',
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: 16,
            padding: '18px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#b91c1c' }}>
              ❌ Order Rejected at Counter
            </div>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
              The print shop could not process this order (e.g. invalid file format or payment discrepancy). Please contact the counter directly at <b>+91 80 2544 1722</b> or visit HKBK Student Point.
            </p>
            <button
              onClick={handleRestoreBasket}
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Fix and Retry →
            </button>
          </div>
        )}

        {/* ── Order Cancelled Banner ── */}
        {status === 'cancelled' && (
          <div style={{
            margin: '16px 16px 0',
            background: '#f8fafc',
            border: '2px solid #94a3b8',
            borderRadius: 16,
            padding: '18px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(148, 163, 184, 0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#334155' }}>
              Order Cancelled
            </div>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              This order was cancelled. Your documents have been safely cleared from our server storage.
            </p>
            <button
              onClick={handleRestoreBasket}
              style={{
                background: '#0b1020',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Restart with Same Documents →
            </button>
          </div>
        )}

        {/* ── Order Expired Banner ── */}
        {status === 'expired' && (
          <div style={{
            margin: '16px 16px 0',
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: 16,
            padding: '18px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#b45309' }}>
              Order Expired
            </div>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              Payment was not completed within 30 minutes, and temporary files were removed to protect your privacy.
            </p>
            <button
              onClick={handleRestoreBasket}
              style={{
                background: '#0b1020',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Restart Print Job →
            </button>
          </div>
        )}

        {/* ── High-visibility Ready Alert Banner ── */}
        {status === 'ready' && (
          <div style={{
            margin: '16px 16px 0',
            background: '#ecfdf5',
            border: '2px solid #059669',
            borderRadius: 16,
            padding: '16px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(5, 150, 105, 0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#047857' }}>
              🎉 Print Job is Ready for Collection!
            </div>
            <p style={{ margin: '6px 0 10px', fontSize: 13, color: '#065f46', lineHeight: 1.4 }}>
              Present pickup code <b>{pickupCode}</b> at the HKBK Student Point counter to receive your documents.
            </p>
            {phone && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#047857', marginBottom: 12 }}>
                🔔 Registered mobile: +91 {phone}
              </div>
            )}
            <button
              onClick={shareWhatsApp}
              style={{
                background: '#25d366',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              💬 {phone ? `Send Code to WhatsApp (+91 ${phone})` : 'Share Pickup Code to WhatsApp'}
            </button>
          </div>
        )}

        {/* ── Main Ticket Card ── */}
        <section className="ticket-card" style={{ margin: '16px', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1.5px solid #e2e8f0' }}>
          {/* Header */}
          <div style={{ background: 'var(--color-primary,#0b1020)', color: '#fff', padding: '22px 24px 18px' }}>
            <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 4 }}>PRINTBK ORDER</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{orderNumber}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
              {order?.files?.length ?? 0} file{(order?.files?.length ?? 0) !== 1 ? 's' : ''} · ₹{total.toFixed(2)}
            </div>
          </div>

          {/* Pickup code — Revealed only once order reaches processing */}
          <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: '#718096', marginBottom: 8, fontWeight: 700 }}>PICKUP CODE</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: 12, lineHeight: 1, color: '#0f172a' }}>{pickupCode}</span>
              {pickupCode !== '——' && (
                <button
                  onClick={async () => { await navigator.clipboard?.writeText(pickupCode); notify('Pickup code copied'); }}
                  aria-label="Copy pickup code"
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, cursor: 'pointer' }}
                >
                  <Icon name="copy" size={18} />
                </button>
              )}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: stage === 2 ? '#059669' : '#64748b', fontWeight: stage === 2 ? 700 : 500 }}>
              {statusMessage}
            </p>

            {/* Student-Facing Files Deletion Countdown / Status */}
            <div style={{ marginTop: 12, fontSize: 12, color: isDeleted ? '#059669' : '#64748b', fontWeight: 500 }}>
              {isDeleted
                ? '✓ Files deleted for your privacy'
                : (status === 'ready' || status === 'completed') && deleteAfterTime
                  ? `🕒 Files delete at ${deleteAfterTime} (5 min privacy rule)`
                  : '🕒 Files protected · Deleted 5 mins after printing'}
            </div>
          </div>

          {/* Progress steps */}
          <div style={{ display: 'flex', padding: '16px 24px', gap: 0 }}>
            {steps.map((step, i) => (
              <div key={step} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', left: 0, top: 14, width: '50%', height: 2, background: i <= stage ? '#059669' : '#e2e8f0' }} />}
                {i < steps.length - 1 && <div style={{ position: 'absolute', right: 0, top: 14, width: '50%', height: 2, background: i < stage ? '#059669' : '#e2e8f0' }} />}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, position: 'relative', zIndex: 1,
                  background: i < stage ? '#059669' : i === stage ? '#0b1020' : '#e2e8f0',
                  color: i <= stage ? '#fff' : '#718096'
                }}>
                  {i < stage ? <Icon name="check" size={12} /> : i + 1}
                </div>
                <span style={{ fontSize: 11, color: i === stage ? '#0b1020' : '#718096', fontWeight: i === stage ? 700 : 400 }}>{step}</span>
              </div>
            ))}
          </div>

          {/* Files List */}
          {(order?.files?.length ?? 0) > 0 && (
            <div style={{ padding: '0 24px 18px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: '#94a3b8', margin: '14px 0 8px', fontWeight: 700, textTransform: 'uppercase' }}>
                Documents in this job
              </div>
              {order!.files.map((name, i) => (
                <div key={i} style={{ fontSize: 13, padding: '7px 0', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < order!.files.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                  <Icon name="file" size={15} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDeleted ? '#94a3b8' : '#1e293b' }}>{name}</span>
                  {isDeleted && <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Files deleted for your privacy</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Real-Time Phone / SMS Pickup Alert ── */}
        <div style={{
          margin: '0 16px 16px',
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              🔔
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Pickup Notifications & Alerts
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Receive instant alert when your prints are completed
              </div>
            </div>
          </div>

          {phone ? (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12
            }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Active Alert Phone: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>+91 {phone}</span>
              </div>
              <button
                onClick={() => { setPhone(''); localStorage.removeItem('printbk-phone'); notify('Phone alert cleared'); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                type="tel"
                placeholder="Enter 10-digit mobile number"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                maxLength={10}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  fontSize: 13,
                  outline: 'none',
                  fontWeight: 600
                }}
              />
              <button
                onClick={handleSavePhone}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Get Alert
              </button>
            </div>
          )}
        </div>

        {/* ── File Deletion Confirmation / On-Demand Delete ── */}
        {isDeleted ? (
          <div style={{
            margin: '0 16px 16px',
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: 16,
            padding: '16px 20px',
            textAlign: 'center'
          }}>
            <div style={{ color: '#059669', fontWeight: 800, fontSize: 14 }}>
              ✓ Files Permanently Deleted
            </div>
            <div style={{ color: '#047857', fontSize: 12, marginTop: 4, marginBottom: 14 }}>
              Your documents have been securely wiped from our storage servers.
            </div>
            <button
              onClick={() => go('entry')}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Start New Print Job →
            </button>
          </div>
        ) : (
          <div style={{ margin: '0 16px 16px' }}>
            <button
              onClick={handleDeleteFiles}
              disabled={deleting}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 12,
                background: '#fff5f5',
                border: '1.5px solid #fed7d7',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: 13,
                cursor: deleting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <Icon name="trash" size={16} />
              {deleting ? 'Deleting files…' : 'Delete my files now'}
            </button>
          </div>
        )}

        {/* ── Actions: Receipt, Share & Done Return Home ── */}
        <div style={{ display: 'flex', gap: 10, padding: '0 16px 12px' }}>
          <button
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 12,
              border: '1.5px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#0f172a'
            }}
            onClick={() => {
              if (status === 'pending_payment') {
                notify('⚠️ Choose a payment method first to view receipt');
                return;
              }
              setSheet('receipt');
            }}
          >
            <Icon name="download" size={16} /> View Receipt
          </button>
          <button
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 12,
              border: '1.5px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#0f172a'
            }}
            onClick={() => {
              if (status === 'pending_payment') {
                notify('⚠️ Complete payment selection first');
                return;
              }
              const text = `PrintBK order ${orderNumber} — Pickup code ${pickupCode}`;
              if (navigator.share) navigator.share({ title: 'PrintBK', text }).catch(() => {});
              else { navigator.clipboard?.writeText(text); notify('Copied to clipboard'); }
            }}
          >
            <Icon name="share" size={16} /> Share
          </button>
        </div>

        {/* ── Primary Return to Home Button (Never Stuck) ── */}
        <div style={{ padding: '0 16px 16px' }}>
          <button
            onClick={() => go('entry')}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              background: '#0b1020',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(11, 16, 32, 0.2)'
            }}
          >
            Done · Start New Print Job
          </button>
        </div>

        {/* ── Secondary Links ── */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16 }}>
          <button
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
            onClick={() => setSheet('report')}
          >
            Report a problem
          </button>
          {'Notification' in window && Notification.permission !== 'granted' && (
            <button
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              onClick={enableNotifications}
            >
              🔔 Enable browser alerts when print is ready
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default Ticket;
