import React, { useEffect } from 'react';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useShopConfig } from '../../store/shopConfig';

interface PrivacyPolicyProps {
  go: (screen: Screen) => void;
}

export function PrivacyPolicy({ go }: PrivacyPolicyProps) {
  const cfg = useShopConfig(s => s.config);
  const shopName = cfg.shopInfo?.name || 'HKBK Student Point';
  const shopAddress = cfg.shopInfo?.address || 'HKBK College Campus, Nagawara, Bengaluru';
  const deleteMinutes = cfg.deleteDelayMinutes || 5;

  // Ensure page always opens from the very top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const pageEl = document.querySelector('.page');
    if (pageEl) pageEl.scrollTop = 0;
  }, []);

  const pillars = [
    {
      title: 'Automated Privacy File Purge',
      summary: `All document uploads are automatically destroyed from server storage ${deleteMinutes} minutes after printing.`,
      desc: `Your files are processed strictly in volatile encrypted buffers. As soon as your print is dispatched at the counter, a high-priority background deletion timer clears the file bytes entirely.`,
      icon: 'file' as const,
      accent: '#059669',
      bg: '#ecfdf5',
    },
    {
      title: 'Zero Permanent Storage & No Accounts',
      summary: 'No user accounts, no passwords, and zero profiling.',
      desc: 'PrintBK operates with zero-knowledge capability tokens. Each order is identified by an ephemeral cryptographic token. We do not maintain user databases or track personal reading history.',
      icon: 'shield' as const,
      accent: '#2563eb',
      bg: '#eff6ff',
    },
    {
      title: 'End-to-End Transit Encryption',
      summary: 'All transfers secured with TLS 1.3 / HTTPS encryption.',
      desc: 'When you upload files from your smartphone or laptop, all bytes travel through encrypted HTTPS tunnels directly into secure Zoho Catalyst CloudScale infrastructure.',
      icon: 'check' as const,
      accent: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      title: 'Local-Only Mobile Number Storage',
      summary: 'Optional phone number never sold, shared, or indexed.',
      desc: 'If you choose to enter your mobile number for ready dispatch chimes and notifications, it is stored locally on your own device in private browser storage. It is never sold or used for marketing.',
      icon: 'phone' as const,
      accent: '#d97706',
      bg: '#fffbeb',
    },
    {
      title: 'Zero Analytics Trackers & Ads',
      summary: 'No tracking pixels, third-party cookies, or ad beacons.',
      desc: 'PrintBK does not load Google Analytics, Meta pixels, advertising SDKs, or third-party trackers. The application bundle is 100% self-contained.',
      icon: 'eye' as const,
      accent: '#0f172a',
      bg: '#f8fafc',
    },
    {
      title: 'Immediate On-Demand Deletion',
      summary: 'Cancel and wipe your documents anytime with a single tap.',
      desc: 'You can delete your documents instantly from the Order Ticket screen at any moment before printing. Clearing your data from Settings also purges all local history immediately.',
      icon: 'trash' as const,
      accent: '#dc2626',
      bg: '#fef2f2',
    },
  ];

  return (
    <main
      className="page"
      style={{
        overflowY: 'auto',
        background: 'var(--color-bg, #f7f4ee)',
        minHeight: '100dvh',
        paddingBottom: 64,
      }}
    >
      <Topbar title="Privacy Policy" back onBack={() => go('settings')} />

      <div
        style={{
          maxWidth: 640,
          margin: '16px auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '0 14px',
        }}
      >
        {/* ── TL;DR Executive Summary Hero ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            padding: '24px 20px',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: '#ecfdf5',
                color: '#059669',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid #a7f3d0',
              }}
            >
              <Icon name="check" size={20} />
            </div>
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#059669',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  display: 'block',
                }}
              >
                Zero-Retention Guarantee
              </span>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>
                Your Privacy at {shopName}
              </h1>
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '14px 16px',
              fontSize: 13,
              color: '#334155',
              lineHeight: 1.6,
            }}
          >
            <b>The PrintBK Promise:</b> We only use your files to print them at the counter. All document
            files are automatically erased within <b>{deleteMinutes} minutes</b> of printing. We do not read
            your contents, track your browsing, or sell your data.
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#64748b',
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <span>Last updated: October 2026</span>
            <span>Across All HKBK Institutions</span>
          </div>
        </section>

        {/* ── 6 Privacy Pillars ── */}
        {pillars.map(pillar => (
          <section
            key={pillar.title}
            style={{
              background: '#ffffff',
              borderRadius: 20,
              border: '1.5px solid #e2e8f0',
              padding: '18px 18px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: pillar.bg,
                color: pillar.accent,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <Icon name={pillar.icon} size={18} />
            </div>

            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                {pillar.title}
              </h2>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: pillar.accent === '#0f172a' ? '#334155' : pillar.accent,
                  marginBottom: 6,
                  lineHeight: 1.4,
                }}
              >
                {pillar.summary}
              </div>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                {pillar.desc}
              </p>
            </div>
          </section>
        ))}

        {/* ── Instant Assistance & Verification ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1.5px solid #e2e8f0',
            padding: '20px 18px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
            Privacy Questions or In-Person Verification
          </h2>
          <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.55, margin: '0 0 14px' }}>
            If you have any questions or require in-person verification of file destruction,
            visit the printing desk directly at the campus counter (Ground Floor, Opposite Canteen).
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => go('settings')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#0b1020',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name="shop" size={16} />
              Visit Counter · Ground Floor
            </button>
            <button
              onClick={() => go('settings')}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                padding: '10px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              Back to Settings
            </button>
          </div>
        </section>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '8px 0 16px' }}>
          {shopName} · {shopAddress}
        </div>
      </div>
    </main>
  );
}

export default PrivacyPolicy;
