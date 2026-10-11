import React, { useState } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, useHistory } from '../../store/basket';

function Settings({ go }: { go: (screen: Screen) => void }) {
  const [cleared, setCleared] = useState(false);
  const [phone, setPhone] = useState(() => localStorage.getItem('printbk-phone') || '');
  const [editingPhone, setEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState(phone);
  const basket = useBasket();
  const history = useHistory();

  const savePhone = () => {
    const cleaned = tempPhone.trim();
    localStorage.setItem('printbk-phone', cleaned);
    setPhone(cleaned);
    setEditingPhone(false);
    notify(cleaned ? 'Phone number saved for ready alerts' : 'Phone number removed');
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

  const testReadyAlert = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('PrintBK: Ready Alert Preview', {
          body: 'Your print order #1001 is READY for collection at HKBK Student Point! Pickup code: 1234',
          icon: '/favicon.ico'
        });
      }
    }
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
    notify('🔔 Ready alert simulated (notification & vibration)');
  };

  return (
    <main className="page" style={{ overflowY: 'auto', background: 'var(--color-bg,#f7f4ee)', minHeight: '100dvh', paddingBottom: 40 }}>
      <Topbar title="Settings" back onBack={() => go("entry")} />

      <div style={{ maxWidth: 580, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Phone Number for Ready Alerts (No transparent phantom numbers) ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
            <div>
              <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>Phone Number</strong>
              <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>
                {phone ? `Registered: ${phone}` : 'Not configured — add for ready alerts'}
              </small>
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
                color: '#0f172a'
              }}
              onClick={() => {
                setTempPhone(phone);
                setEditingPhone(!editingPhone);
              }}
            >
              {editingPhone ? 'Cancel' : phone ? 'Edit' : 'Add'}
            </button>
          </div>

          {editingPhone && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 14, marginBottom: 6 }}>
                Enter your mobile number for pickup alerts:
              </label>
              <input
                type="tel"
                placeholder=""
                value={tempPhone}
                onChange={e => setTempPhone(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  fontSize: 15,
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  color: '#0f172a'
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
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
                  Save number
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

        {/* ── Ready Alert Notification Demo / Permission ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <button
            onClick={testReadyAlert}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>🔔 Ready Alert Notification</strong>
              <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>
                Test pickup notifications on this device
              </small>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: 8 }}>
              Test Alert
            </span>
          </button>
        </div>

        {/* ── Links & Information ── */}
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
              action: () => go('/about')
            },
            {
              label: 'Privacy policy',
              sub: 'How your files and privacy are protected',
              action: () => go('/privacy')
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
                borderTop: i > 0 ? '1px solid #f1f5f9' : 'none'
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>{item.label}</strong>
                <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>{item.sub}</small>
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
              textAlign: 'left'
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: 15, color: cleared ? '#059669' : '#dc2626' }}>
                {cleared ? '✓ All Data Cleared' : 'Clear my data from this device'}
              </strong>
              <small style={{ color: '#64748b', fontSize: 12, marginTop: 2, display: 'block' }}>
                {cleared ? 'Device memory, orders, and cache have been reset' : 'Permanently clears basket, order history, and phone number'}
              </small>
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
