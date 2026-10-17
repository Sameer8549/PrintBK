import React, { useState, useEffect } from 'react';
import { Icon, Topbar, GoldBadge, GoldBadgeName } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, useHistory } from '../../store/basket';

interface SettingsRow {
  badge: GoldBadgeName;
  label: string;
  sub: string;
  action?: () => void;
  right?: React.ReactNode;
}

export function Settings({ go }: { go: (screen: Screen) => void }) {
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
  
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('printbk-theme') as 'light' | 'dark') || 'light';
    } catch {
      return 'light';
    }
  });

  // Presets state
  const [presetDuplex, setPresetDuplex] = useState(() => {
    try {
      return localStorage.getItem('printbk-preset-duplex') === 'true';
    } catch {
      return false;
    }
  });

  // Push notifications state
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Help expandable modal / banner
  const [showHelp, setShowHelp] = useState(false);
  const [showShopInfo, setShowShopInfo] = useState(false);

  const basket = useBasket();
  const history = useHistory();

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('printbk-theme', next);
      document.documentElement.setAttribute('data-theme', next);
    } catch (_) {}
    notify(`Switched to ${next} mode`);
  };

  const togglePreset = () => {
    const next = !presetDuplex;
    setPresetDuplex(next);
    try {
      localStorage.setItem('printbk-preset-duplex', String(next));
    } catch (_) {}
    notify(next ? 'Default set to 2-Sided (Save Paper)' : 'Default set to 1-Sided');
  };

  const requestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('Push notifications are not supported in this browser');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
      if (perm === 'granted') {
        notify('Ready alerts enabled for browser');
      } else {
        notify('Notification permission was dismissed');
      }
    } catch (_) {
      notify('Unable to request notification permission');
    }
  };

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

    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushStatus(perm);
      } catch (_) {}
    }

    if ('vibrate' in navigator) {
      try { navigator.vibrate([100, 50, 100]); } catch (_) {}
    }

    notify(`Ready alerts enabled for +91 ${cleaned}`);
  };

  const removePhone = () => {
    try { localStorage.removeItem('printbk-phone'); } catch (_) {}
    setPhone('');
    setTempPhone('');
    setEditingPhone(false);
    notify('Phone number removed');
  };

  const clearAllData = () => {
    setCleared(true);
    basket.clear();
    history.clearHistory();

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}

    setPhone('');
    setTempPhone('');
    setEditingPhone(false);
    notify('All device data and order history cleared');
  };

  return (
    <main
      className="page"
      style={{
        overflowY: 'auto',
        background: 'var(--color-bg, #f8f6f0)',
        minHeight: '100dvh',
        paddingBottom: 48,
      }}
    >
      <Topbar title="Settings" back onBack={() => go('entry')} />

      <div
        style={{
          maxWidth: 600,
          margin: '20px auto 0',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* ── SECTION 1: PREFERENCES (Theme, Presets, Language) ── */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            Preferences
          </div>

          {/* Row 1: Theme */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="theme" size={44} ariaLabel="Theme" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Theme &amp; Display
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {theme === 'light' ? 'Light Mode (Campus Standard)' : 'Dark Mode (OLED)'}
                </small>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              {theme === 'light' ? 'Switch Dark' : 'Switch Light'}
            </button>
          </div>

          {/* Row 2: Default Print Presets */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="presets" size={44} ariaLabel="Print Presets" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Print Presets
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {presetDuplex ? 'Default: 2-Sided · B&W · A4' : 'Default: 1-Sided · B&W · A4'}
                </small>
              </div>
            </div>
            <button
              onClick={togglePreset}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              {presetDuplex ? '2-Sided' : '1-Sided'}
            </button>
          </div>

          {/* Row 3: Language */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="language" size={44} ariaLabel="Language" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Language
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  English (India) · Campus Default
                </small>
              </div>
            </div>
            <span
              style={{
                padding: '4px 10px',
                background: '#f1f5f9',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
              }}
            >
              EN
            </span>
          </div>
        </div>

        {/* ── SECTION 2: ALERTS & NOTIFICATIONS (Phone, Push Alerts) ── */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            Alerts &amp; Dispatch
          </div>

          {/* Row 4: Phone Number */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="phone" size={44} ariaLabel="Phone Alerts" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Phone &amp; Ready Alerts
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {phone ? `Active: +91 ${phone}` : 'Enter mobile number for pickup alerts'}
                </small>
              </div>
            </div>
            <button
              onClick={() => {
                setTempPhone(phone);
                setEditingPhone(!editingPhone);
              }}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              {editingPhone ? 'Cancel' : phone ? 'Edit' : 'Add'}
            </button>
          </div>

          {/* Phone active status banner */}
          {phone && !editingPhone && (
            <div
              style={{
                margin: '0 18px 16px',
                padding: '10px 14px',
                borderRadius: 12,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>
                  Pickup alerts active for +91 {phone}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#065f46',
                  background: '#d1fae5',
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {pushStatus === 'granted' ? 'Push + Chime' : 'Audio + WA'}
              </span>
            </div>
          )}

          {/* Phone editor input */}
          {editingPhone && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#64748b',
                  marginTop: 14,
                  marginBottom: 6,
                }}
              >
                Mobile Number (India +91):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    padding: '11px 12px',
                    background: '#f1f5f9',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 15,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a',
                  }}
                />
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 0 }}>
                Instant pickup chime and WhatsApp dispatch triggered when your print job is ready at the counter.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  onClick={savePhone}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    background: '#0b1020',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Save &amp; Enable Alerts
                </button>
                {phone && (
                  <button
                    onClick={removePhone}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: '#fff',
                      color: '#ef4444',
                      border: '1.5px solid #fca5a5',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Row 5: Notifications */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="notifications" size={44} ariaLabel="Notifications" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Browser Push &amp; Chime
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {pushStatus === 'granted'
                    ? 'Enabled · Instant counter notification'
                    : pushStatus === 'denied'
                    ? 'Blocked by browser settings'
                    : 'Tap to enable browser alerts'}
                </small>
              </div>
            </div>
            <button
              onClick={requestPushPermission}
              disabled={pushStatus === 'granted'}
              style={{
                background: pushStatus === 'granted' ? '#ecfdf5' : '#f8fafc',
                border: `1.5px solid ${pushStatus === 'granted' ? '#a7f3d0' : '#cbd5e1'}`,
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: pushStatus === 'granted' ? '#047857' : '#0f172a',
                cursor: pushStatus === 'granted' ? 'default' : 'pointer',
              }}
            >
              {pushStatus === 'granted' ? 'Active' : 'Enable'}
            </button>
          </div>
        </div>

        {/* ── SECTION 3: ORDERS & CAMPUS SHOP (History, Shop Info, How It Works, Contact) ── */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            Orders &amp; Campus Shop
          </div>

          {/* Row 6: History */}
          <button
            onClick={() => go('history')}
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
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="history" size={44} ariaLabel="Order History" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Past Orders &amp; Receipts
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  View live pickup codes, prices, and receipts
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row 7: Shop Info */}
          <button
            onClick={() => setShowShopInfo(!showShopInfo)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="shop" size={44} ariaLabel="Shop Info" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Shop Hours &amp; Location
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  HKBK Campus Ground Floor · Mon–Sat 08:30–17:30
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {showShopInfo && (
            <div
              style={{
                padding: '14px 18px',
                background: '#f8fafc',
                borderTop: '1px solid #f1f5f9',
                fontSize: 13,
                color: '#334155',
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>Location:</p>
              <p style={{ margin: '0 0 10px 0', color: '#64748b' }}>
                HKBK College of Engineering, Ground Floor (Opposite Canteen), Bengaluru 560045.
              </p>
              <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>Operating Schedule:</p>
              <p style={{ margin: 0, color: '#64748b' }}>
                Monday to Saturday: 8:30 AM to 5:30 PM.<br />
                Sunday &amp; Campus Holidays: Closed.
              </p>
            </div>
          )}

          {/* Row 8: Help & How It Works */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="help" size={44} ariaLabel="How It Works" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  How It Works
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Upload files &rarr; Pay with UPI/Cash &rarr; Collect via 4-digit code
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {showHelp && (
            <div
              style={{
                padding: '14px 18px',
                background: '#f8fafc',
                borderTop: '1px solid #f1f5f9',
                fontSize: 13,
                color: '#334155',
                lineHeight: 1.6,
              }}
            >
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li style={{ marginBottom: 6 }}>
                  <strong>Upload Documents:</strong> Add PDFs, slides, or photos directly from your phone.
                </li>
                <li style={{ marginBottom: 6 }}>
                  <strong>Configure Settings:</strong> Select color mode, single or double sided, and copies.
                </li>
                <li style={{ marginBottom: 6 }}>
                  <strong>Checkout:</strong> Pay securely with UPI or choose counter cash.
                </li>
                <li>
                  <strong>Counter Collection:</strong> Walk up to the PrintBK counter and show your 4-digit code.
                </li>
              </ol>
            </div>
          )}

          {/* Row 9: Contact */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="contact" size={44} ariaLabel="Contact Support" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Contact &amp; Support
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Counter staff assistance &amp; student support
                </small>
              </div>
            </div>
            <a
              href="tel:919876543210"
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                textDecoration: 'none',
              }}
            >
              Call Counter
            </a>
          </div>
        </div>

        {/* ── SECTION 4: SECURITY & PLATFORM (Privacy, About, Clear Data) ── */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            Security &amp; About
          </div>

          {/* Row 10: Privacy Policy */}
          <button
            onClick={() => go('/privacy')}
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
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="privacy" size={44} ariaLabel="Privacy Policy" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Privacy &amp; Auto-Deletion Policy
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Zero long-term retention · Files deleted after printing
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row 11: About PrintBK */}
          <button
            onClick={() => go('/about')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="about" size={44} ariaLabel="About PrintBK" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  About PrintBK
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Student initiative · HKBK College of Engineering
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row 12: Clear Device Data */}
          <button
            disabled={cleared}
            onClick={clearAllData}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderTop: '1px solid #f1f5f9',
              background: cleared ? '#f8fafc' : 'none',
              border: 'none',
              cursor: cleared ? 'default' : 'pointer',
              textAlign: 'left',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GoldBadge name="clear" size={44} ariaLabel="Clear Device Data" />
              <div>
                <strong
                  style={{
                    display: 'block',
                    fontSize: 15,
                    color: cleared ? '#059669' : '#dc2626',
                  }}
                >
                  {cleared ? 'All Device Data Reset' : 'Clear My Data From This Device'}
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {cleared
                    ? 'Basket, order cache, and stored preferences have been wiped'
                    : 'Permanently removes basket, order history, and phone number'}
                </small>
              </div>
            </div>
            <div style={{ color: cleared ? '#059669' : '#dc2626' }}>
              {cleared ? <Icon name="check" size={20} /> : <Icon name="trash" size={18} />}
            </div>
          </button>
        </div>

        {/* ── FOOTER ── */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#94a3b8',
            margin: '16px 0 32px',
            lineHeight: 1.6,
          }}
        >
          PrintBK v1.0 &middot; HKBK Student Point &middot; Bengaluru<br />
          Crafted with care by 3rd Year ISE Student Abdul Sameer
        </p>
      </div>
    </main>
  );
}

export default Settings;
