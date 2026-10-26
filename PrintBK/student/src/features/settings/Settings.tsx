import React, { useState, useEffect } from 'react';
import { Icon, Topbar, GoldBadge } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, useHistory } from '../../store/basket';
import { useShopConfig } from '../../store/shopConfig';

export function Settings({ go }: { go: (screen: Screen) => void }) {
  const cfg = useShopConfig(s => s.config);
  const shopName = cfg.shopInfo?.name || 'HKBK Student Point';
  const shopAddress = cfg.shopInfo?.address || 'HKBK Campus, Nagawara, Bengaluru - 560045';
  const shopHours = cfg.shopInfo?.hours || 'Monday to Saturday: 8:30 AM to 6:00 PM';
  const isOpen = cfg.open !== false;
  const deleteMinutes = cfg.deleteDelayMinutes || 5;

  const [cleared, setCleared] = useState(false);
  const [hubTab, setHubTab] = useState<'hours' | 'how' | 'contact' | 'faq'>('hours');

  // Ensure settings page opens at the top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const pageEl = document.querySelector('.page');
    if (pageEl) pageEl.scrollTop = 0;
  }, []);

  // Phone number state
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('printbk-phone') || '';
    } catch {
      return '';
    }
  });
  const [editingPhone, setEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState(phone);

  // Push notifications state (working feature)
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const basket = useBasket();
  const history = useHistory();

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

  const savePhone = () => {
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
        Notification.requestPermission().then(perm => setPushStatus(perm)).catch(() => {});
      } catch (_) {}
    }

    if ('vibrate' in navigator) {
      try { navigator.vibrate([100, 50, 100]); } catch (_) {}
    }

    notify(`Pickup alerts enabled for +91 ${cleaned}`);
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
    notify('All device cache, orders, and data cleared');
  };

  return (
    <main
      className="page"
      style={{
        overflowY: 'auto',
        background: 'var(--color-bg, #f8f6f0)',
        minHeight: '100dvh',
        paddingBottom: 56,
      }}
    >
      <Topbar title="Settings & Support" back onBack={() => go('entry')} />

      <div
        style={{
          maxWidth: 640,
          margin: '16px auto 0',
          padding: '0 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* ── SECTION 1: WORKING NOTIFICATION & PHONE ALERTS ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            Pickup &amp; Ready Alerts
          </div>

          {/* Row: Phone Number */}
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
                  Mobile Number for Alerts
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {phone ? `Active: +91 ${phone}` : 'Get notified when documents are printed'}
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
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              {editingPhone ? 'Cancel' : phone ? 'Change' : 'Set Number'}
            </button>
          </div>

          {/* Phone active banner */}
          {phone && !editingPhone && (
            <div
              style={{
                margin: '0 18px 14px',
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
                  Alerts active for +91 {phone}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#065f46',
                  background: '#d1fae5',
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontWeight: 700,
                }}
              >
                Audio + WA Alert
              </span>
            </div>
          )}

          {/* Phone Editor */}
          {editingPhone && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#475569',
                  marginTop: 14,
                  marginBottom: 6,
                }}
              >
                10-Digit Mobile Number (India +91):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    padding: '11px 12px',
                    background: '#f1f5f9',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 800,
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
                    fontWeight: 600,
                  }}
                />
              </div>
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
                  Save &amp; Enable
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
                      fontWeight: 700,
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

          {/* Row: Browser Push */}
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
              <GoldBadge name="notifications" size={44} ariaLabel="Browser Alerts" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Browser Push &amp; Chime
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {pushStatus === 'granted'
                    ? 'Enabled · Instant device chime on completion'
                    : pushStatus === 'denied'
                    ? 'Blocked in browser permissions'
                    : 'Enable browser notifications for print status'}
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
                fontWeight: 700,
                color: pushStatus === 'granted' ? '#047857' : '#0f172a',
                cursor: pushStatus === 'granted' ? 'default' : 'pointer',
              }}
            >
              {pushStatus === 'granted' ? 'Active ✓' : 'Enable'}
            </button>
          </div>
        </section>

        {/* ── SECTION 2: MERGED CAMPUS HUB (Hours, How It Works, Contact & Support in ONE Page) ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 18px 12px',
              background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <Icon name="shop" size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>
                    Campus Hub &amp; Support
                  </h2>
                  <small style={{ color: '#64748b', fontSize: 12 }}>
                    {shopName} · Ground Floor, Opposite Canteen
                  </small>
                </div>
              </div>

              {/* Status Chip */}
              <span
                style={{
                  background: isOpen ? '#ecfdf5' : '#fee2e2',
                  color: isOpen ? '#047857' : '#991b1b',
                  border: `1px solid ${isOpen ? '#a7f3d0' : '#fecaca'}`,
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: 99,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isOpen ? '#10b981' : '#ef4444',
                  }}
                />
                {isOpen ? 'Open Now' : 'Closed'}
              </span>
            </div>

            {/* Hub Sub-Navigation Tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                marginTop: 14,
                background: '#f1f5f9',
                padding: 4,
                borderRadius: 12,
              }}
            >
              {[
                { id: 'hours', label: 'Shop Hours' },
                { id: 'how', label: 'How It Works' },
                { id: 'contact', label: 'Contact' },
                { id: 'faq', label: 'Help & FAQ' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setHubTab(t.id as any)}
                  style={{
                    background: hubTab === t.id ? '#ffffff' : 'transparent',
                    color: hubTab === t.id ? '#0f172a' : '#64748b',
                    border: 'none',
                    borderRadius: 9,
                    padding: '8px 2px',
                    fontSize: 12,
                    fontWeight: hubTab === t.id ? 800 : 600,
                    cursor: 'pointer',
                    boxShadow: hubTab === t.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hub Tab Content */}
          <div style={{ padding: '18px 20px' }}>
            {/* TAB 1: SHOP HOURS & TIMINGS */}
            {hubTab === 'hours' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Standard Operating Schedule
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                    {shopHours}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Sundays &amp; Official Campus Holidays: Closed
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Campus Location</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>Ground Floor</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Opposite Canteen</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Privacy Buffer</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{deleteMinutes} Minutes</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Auto-purge after print</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#475569', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', lineHeight: 1.5 }}>
                  💡 <b>Pro-Tip:</b> Beat the break rush! Submit your order 10 minutes before class ends, and pick it up right as you walk into the canteen corridor.
                </div>
              </div>
            )}

            {/* TAB 2: HOW IT WORKS (4-STEP VISUAL) */}
            {hubTab === 'how' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  {
                    num: '1',
                    title: 'Upload Documents',
                    text: 'Drop PDFs, Word documents, PPTX slides, or photos directly from your phone.',
                    accent: '#2563eb',
                  },
                  {
                    num: '2',
                    title: 'Customize Your Print',
                    text: 'Select B&W or Colour, 1-sided or 2-sided, paper size (A4 / A3 / Glossy), and copies with instant live pricing.',
                    accent: '#059669',
                  },
                  {
                    num: '3',
                    title: 'Checkout Seamlessly',
                    text: 'Pay via any UPI app (GPay, PhonePe, Paytm) or select Pay Cash at Counter.',
                    accent: '#d97706',
                  },
                  {
                    num: '4',
                    title: 'Fast Counter Pickup',
                    text: 'Walk up to the PrintBK counter desk, show your 4-digit pickup code, and collect your fresh prints immediately.',
                    accent: '#7c3aed',
                  },
                ].map(step => (
                  <div
                    key={step.num}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: '#f8fafc',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: step.accent,
                        color: '#ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 13,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {step.num}
                    </div>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>
                        {step.title}
                      </strong>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.45 }}>
                        {step.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: CONTACT & COUNTER ASSISTANCE */}
            {hubTab === 'contact' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Official Counter Desk
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 3 }}>
                    {shopName} Desk
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                    {shopAddress}
                  </div>
                </div>

                <div style={{ background: '#ffffff', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                      <Icon name="shop" size={16} />
                    </div>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>In-Person Counter Assistance</strong>
                  </div>
                  <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                    Visit the reprographics counter desk directly on the Ground Floor, Opposite Canteen. Staff are on duty during operational hours to assist with custom print jobs, binding options, thesis formatting, and pickup inquiries.
                  </p>
                </div>

                <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
                  Counter Hours: {shopHours} · Walk up directly anytime during open hours.
                </div>
              </div>
            )}

            {/* TAB 4: HELP & FAQ */}
            {hubTab === 'faq' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    q: 'Paid on UPI but receipt still shows waiting?',
                    a: 'Simply walk up to the counter and show your bank transaction UTR. Counter staff will verify and release your prints on the spot.',
                  },
                  {
                    q: 'Can I print PPTX presentations and slides?',
                    a: 'Yes! Slide decks are rendered with slide-by-slide previews and support 2-up or 4-up printing to save paper.',
                  },
                  {
                    q: 'How long do my uploaded documents stay stored?',
                    a: `Files are automatically and permanently erased from server storage ${deleteMinutes} minutes after printing for your privacy.`,
                  },
                  {
                    q: 'Need custom binding or lamination?',
                    a: 'We offer Spiral, Comb, Soft cover, and Hard thesis binding, plus A4, A3, and ID card thermal lamination directly at the counter.',
                  },
                ].map(item => (
                  <div
                    key={item.q}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      padding: '12px 14px',
                    }}
                  >
                    <strong style={{ fontSize: 13, color: '#0f172a', display: 'block' }}>
                      {item.q}
                    </strong>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0', lineHeight: 1.45 }}>
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 3: ORDERS, PRIVACY & PLATFORM ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 18px 8px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#64748b',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            History &amp; Information
          </div>

          {/* Row: Past Orders */}
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
                  View pickup codes, past receipts, and order tracking
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row: Privacy Policy */}
          <button
            onClick={() => go('privacy')}
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
              <GoldBadge name="privacy" size={44} ariaLabel="Privacy Policy" />
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  Privacy &amp; Auto-Deletion Policy
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Files wiped {deleteMinutes} mins after printing · Zero long-term data retention
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row: About PrintBK */}
          <button
            onClick={() => go('about')}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
              <GoldBadge name="about" size={44} ariaLabel="About PrintBK" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>
                  About PrintBK
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block', wordBreak: 'break-word' }}>
                  Across all HKBK Institutions · Engineered by Abdul Sameer
                </small>
              </div>
            </div>
            <div style={{ color: '#94a3b8' }}>
              <Icon name="chevron" size={18} />
            </div>
          </button>

          {/* Row: Clear Data */}
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
                  {cleared ? 'All Device Data Wiped' : 'Clear My Data From This Device'}
                </strong>
                <small style={{ color: '#64748b', fontSize: 13, marginTop: 2, display: 'block' }}>
                  {cleared
                    ? 'Basket, order cache, and stored phone number cleared'
                    : 'Removes local basket, order history, and saved phone number'}
                </small>
              </div>
            </div>
            <div style={{ color: cleared ? '#059669' : '#dc2626' }}>
              {cleared ? <Icon name="check" size={20} /> : <Icon name="trash" size={18} />}
            </div>
          </button>
        </section>

        {/* ── FOOTER ── */}
        <footer
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#94a3b8',
            margin: '12px 0 32px',
            lineHeight: 1.6,
          }}
        >
          <b>PrintBK v1.0</b> &middot; {shopName} &middot; Bengaluru<br />
          Dedicated to all students and faculty across HKBK Institutions<br />
          Engineered by Abdul Sameer &middot; Lead Engineer
        </footer>
      </div>
    </main>
  );
}

export default Settings;
