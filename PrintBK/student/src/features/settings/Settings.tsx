import React, { useState } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, useHistory } from '../../store/basket';

function GoldenIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)',
        border: '1.5px solid #f59e0b',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.22)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function Settings({ go }: { go: (screen: Screen) => void }) {
  const [cleared, setCleared] = useState(false);
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('printbk-phone') || '';
    } catch {
      return '';
    }
  });
  const [editingPhone, setEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState(phone);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const basket = useBasket();
  const history = useHistory();

  const savePhone = async () => {
    const raw = tempPhone.trim();
    const digits = raw.replace(/\D/g, '');
    const cleaned = digits.length >= 10 ? digits.slice(-10) : digits;

    if (!cleaned) {
      try { localStorage.removeItem('printbk-phone'); } catch (_) {}
      setPhone('');
      setEditingPhone(false);
      notify('Phone number removed');
      return;
    }

    if (cleaned.length !== 10) {
      notify('Please enter a valid 10-digit mobile number');
      return;
    }

    try { localStorage.setItem('printbk-phone', cleaned); } catch (_) {}
    setPhone(cleaned);
    setEditingPhone(false);

    // Request real browser notification permission immediately
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushStatus(perm);
      } catch (_) {}
    }

    if ('vibrate' in navigator) {
      try { navigator.vibrate([100, 50, 100]); } catch (_) {}
    }

    notify(`✓ Ready alerts enabled for +91 ${cleaned}`);
  };

  const removePhone = () => {
    localStorage.removeItem('printbk-phone');
    setPhone('');
    setTempPhone('');
    setEditingPhone(false);
    notify('Phone number removed');
  };

  const clearAllData = () => {
    setCleared(true);
    // 1. Clear in-memory stores
    basket.clear();
    history.clearHistory();

    // 2. Clear browser storage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}

    // 3. Reset local state
    setPhone('');
    setTempPhone('');
    setEditingPhone(false);
    notify('All device data and order history cleared');
  };

  return (
    <main className="page" style={{ overflowY: 'auto', background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh', paddingBottom: 40 }}>
      <Topbar title="Settings" back onBack={() => go("entry")} />

      <div style={{ maxWidth: 580, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Phone Number & Real Ready Alert Integration ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldenIcon>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </GoldenIcon>
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>Phone Number &amp; Ready Alerts</strong>
                <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>
                  {phone ? `Registered: +91 ${phone}` : 'Enter 10-digit mobile number for pickup alerts'}
                </small>
              </div>
            </div>
            <button
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                padding: '7px 14px',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
                color: '#0f172a',
                flexShrink: 0
              }}
              onClick={() => {
                setTempPhone(phone);
                setEditingPhone(!editingPhone);
              }}
            >
              {editingPhone ? 'Cancel' : phone ? 'Edit' : 'Add'}
            </button>
          </div>

          {/* Active alert indicator pill */}
          {phone && !editingPhone && (
            <div style={{
              margin: '0 18px 16px',
              padding: '10px 14px',
              borderRadius: 12,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>🟢</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>
                  Real-time pickup alerts active for +91 {phone}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                {pushStatus === 'granted' ? 'Push + Chime' : 'Audio + WA'}
              </span>
            </div>
          )}

          {editingPhone && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 14, marginBottom: 6 }}>
                Mobile Number (India +91):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '11px 12px',
                  background: '#f1f5f9',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#334155'
                }}>
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={tempPhone}
                  onChange={e => setTempPhone(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 15,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a'
                  }}
                />
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 0 }}>
                You will receive sound chime, vibration, browser notification, and instant WhatsApp pickup dispatch when staff marks your order ready.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    background: '#0b1020',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                  onClick={savePhone}
                >
                  Save &amp; Enable Alerts
                </button>
                {phone && (
                  <button
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: '#fff',
                      color: '#ef4444',
                      border: '1.5px solid #fca5a5',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                    onClick={removePhone}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Links & Information with Premium Golden Icons ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          {[
            {
              label: 'About PrintBK',
              sub: 'Platform details & developer information',
              action: () => go('/about'),
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              ),
            },
            {
              label: 'Privacy Policy',
              sub: 'Auto file deletion and encryption protection',
              action: () => go('/privacy'),
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              ),
            },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                gap: 14
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <GoldenIcon>{item.icon}</GoldenIcon>
                <div>
                  <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>{item.label}</strong>
                  <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>{item.sub}</small>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="chevron" size={18} />
              </div>
            </button>
          ))}
        </div>

        {/* ── Clear My Data From This Device (Working 100%) ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <button
            disabled={cleared}
            onClick={clearAllData}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              background: cleared ? '#f8fafc' : 'none',
              border: 'none',
              cursor: cleared ? 'default' : 'pointer',
              textAlign: 'left',
              gap: 14
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldenIcon>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </GoldenIcon>
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: cleared ? '#059669' : '#dc2626' }}>
                  {cleared ? '✓ All Data Cleared' : 'Clear my data from this device'}
                </strong>
                <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>
                  {cleared ? 'Device memory, orders, and cache have been reset' : 'Permanently clears basket, order history, and phone number'}
                </small>
              </div>
            </div>
            <div style={{ color: cleared ? '#059669' : '#dc2626' }}>
              {cleared ? <Icon name="check" size={20} /> : <Icon name="trash" size={18} />}
            </div>
          </button>
        </div>

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', margin: '20px 0 32px', lineHeight: 1.6 }}>
          PrintBK v1.0 · HKBK Student Point · Bengaluru<br />
          Developed by 3rd Year ISE Student Abdul Sameer
        </p>
      </div>
    </main>
  );
}

export default Settings;
