import React, { useEffect } from 'react';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useShopConfig } from '../../store/shopConfig';

interface AboutProps {
  go: (screen: Screen) => void;
}

export function About({ go }: AboutProps) {
  const logoUrl = import.meta.env.BASE_URL + 'assets/hkbk-logo.png';
  const cfg = useShopConfig(s => s.config);
  const shopName = cfg.shopInfo?.name || 'HKBK Student Point';
  const shopAddress = cfg.shopInfo?.address || 'HKBK Campus, Nagawara, Bengaluru - 560045';

  // Ensure page always opens from the very top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const pageEl = document.querySelector('.page');
    if (pageEl) pageEl.scrollTop = 0;
  }, []);

  const campusFeatures = [
    {
      title: 'High-Speed Document & Assignment Printing',
      desc: 'Instant in-browser rendering for PDFs, DOCX files, and PPTX presentations with live slide-by-slide previews.',
      icon: 'file' as const,
      accent: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      title: 'Precision Color & Monochrome Reprographics',
      desc: 'Crystal-clear 1200 DPI output on premium 75 GSM paper with duplex (double-sided) or single-sided options.',
      icon: 'copy' as const,
      accent: '#059669',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    },
    {
      title: 'Lab Manuals, Records & Thesis Binding',
      desc: 'Spiral binding, soft-cover thermal binding, and executive hard-bound project reports directly at the campus desk.',
      icon: 'check' as const,
      accent: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
    },
    {
      title: 'Queue-Free Counter Dispatch',
      desc: 'Zero waiting in long queues. Submit from your mobile phone anywhere on campus and pick up with your 4-digit code.',
      icon: 'shop' as const,
      accent: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
    },
  ];

  return (
    <main
      className="page"
      style={{
        background: 'var(--color-bg, #f7f4ee)',
        minHeight: '100dvh',
        paddingBottom: 64,
        overflowY: 'auto',
      }}
    >
      <Topbar title="About PrintBK" back onBack={() => go('settings')} />

      <div
        style={{
          maxWidth: 640,
          margin: '16px auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: '0 14px',
        }}
      >
        {/* ── Official Crest & Hero Card ── */}
        <section
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%)',
            borderRadius: 24,
            border: '1.5px solid #e2e8f0',
            padding: '28px 20px 24px',
            boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
            textAlign: 'center',
          }}
        >
          {/* Official HD HKBK Crest */}
          <div
            style={{
              width: 104,
              height: 104,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              borderRadius: 26,
              padding: 8,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
              border: '2px solid #e2e8f0',
            }}
          >
            <img
              src={logoUrl}
              alt="Official HKBK Crest"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>

          <h1
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: '#0b1020',
              margin: '0 0 6px',
              letterSpacing: -0.5,
            }}
          >
            PrintBK
          </h1>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#047857',
              marginBottom: 14,
            }}
          >
            Official Smart Campus Printing &amp; Reprographics Platform
          </div>

          {/* Badges */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 99,
                border: '1px solid #bfdbfe',
              }}
            >
              Across All HKBK Institutions
            </span>
            <span
              style={{
                background: '#fef3c7',
                color: '#92400e',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 99,
                border: '1px solid #fde68a',
              }}
            >
              {shopName} Desk
            </span>
            <span
              style={{
                background: '#ecfdf5',
                color: '#047857',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 99,
                border: '1px solid #a7f3d0',
              }}
            >
              v1.0 Production
            </span>
          </div>

          <p
            style={{
              fontSize: 13.5,
              color: '#334155',
              lineHeight: 1.65,
              margin: 0,
              textAlign: 'left',
              background: '#f8fafc',
              padding: '16px 18px',
              borderRadius: 16,
              border: '1px solid #f1f5f9',
            }}
          >
            Built for all students, faculty, researchers, and campus staff across all{' '}
            <b>HKBK Institutions</b> — unified under one fast, privacy-focused printing
            network. Print directly from your mobile device or laptop, skip counter lines,
            and collect with a secure 4-digit code.
          </p>
        </section>

        {/* ── Unified Campus Reprographics Across All HKBK Institutions ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            padding: '22px 20px',
            boxShadow: '0 2px 14px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: '#eff6ff',
                color: '#1d4ed8',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="shop" size={18} />
            </div>
            <div>
              <strong style={{ display: 'block', fontSize: 16, color: '#0f172a' }}>
                Across All HKBK Institutions
              </strong>
              <small style={{ color: '#64748b', fontSize: 12 }}>
                Unified campus printing and reprographic services
              </small>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 14,
            }}
          >
            {campusFeatures.map(feat => (
              <div
                key={feat.title}
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: feat.bg,
                    color: feat.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${feat.border}`,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Icon name={feat.icon} size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>
                    {feat.title}
                  </strong>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0', lineHeight: 1.5 }}>
                    {feat.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Problem Solved: Old Way vs PrintBK ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            padding: '22px 20px',
            boxShadow: '0 2px 14px rgba(0,0,0,0.03)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>
            Why Campus Needed PrintBK
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                ✕
              </div>
              <div>
                <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>
                  The Old Campus Experience
                </strong>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '3px 0 0', lineHeight: 1.5 }}>
                  Passing malware-infected flash drives from hostel PCs to counter printers,
                  swarming the shop during 15-minute breaks, and verbal confusion over page numbers
                  and pricing.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                ✓
              </div>
              <div>
                <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>
                  The PrintBK Experience
                </strong>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '3px 0 0', lineHeight: 1.5 }}>
                  Direct in-browser PDF, slide, and photo rendering, clear prices, instant UPI or counter
                  cash, and automated queueing. Walk up, state your 4-digit code, and pick up clean prints.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Key Architectural Capabilities ── */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ marginBottom: 6, color: '#2563eb' }}><Icon name="file" size={22} /></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Zero-Trace Privacy</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Cryptographic capability tokens with automated {cfg.deleteDelayMinutes || 5}-minute privacy wipe.
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ marginBottom: 6, color: '#059669' }}><Icon name="copy" size={22} /></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Multi-Format Parsing</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              In-browser page detection for PDFs, DOCX, and PPTX slide presentations with live previews.
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ marginBottom: 6, color: '#d97706' }}><Icon name="check" size={22} /></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>4-Digit Secure Codes</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Collision-free numerical verification tokens for instant release at the counter.
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ marginBottom: 6, color: '#7c3aed' }}><Icon name="bell" size={22} /></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Ready Dispatch</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Audio chime, device vibration, and pickup notifications for students.
            </div>
          </div>
        </section>

        {/* ── Creator & Engineering Card ── */}
        <section
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
            borderRadius: 22,
            border: '1.5px solid #e2e8f0',
            padding: '24px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Header Badges Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px 12px',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#fef3c7',
                color: '#b45309',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid #fde68a',
              }}
            >
              <span style={{ fontSize: 13 }}>👑</span> Creator &amp; Lead Engineer
            </span>
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                color: '#475569',
                fontWeight: 700,
                background: '#f1f5f9',
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              Batch 2022–2026
            </span>
          </div>

          {/* Profile Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #0b1020 0%, #1e293b 100%)',
                color: '#d4af37',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 900,
                border: '2px solid #d4af37',
                boxShadow: '0 4px 12px rgba(11, 16, 32, 0.15)',
                flexShrink: 0,
              }}
            >
              AS
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: '#0b1020',
                  margin: 0,
                  lineHeight: 1.2,
                  wordBreak: 'break-word',
                }}
              >
                Abdul Sameer
              </h2>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#2563eb',
                  marginTop: 4,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                Lead Engineer &amp; Campus Developer
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#64748b',
                  marginTop: 2,
                  lineHeight: 1.3,
                }}
              >
                Across All HKBK Institutions
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: '0 0 20px', wordBreak: 'break-word' }}>
            Designed, architected, and hardened PrintBK across all HKBK Institutions. Passionate
            about solving everyday campus bottlenecks through elegant, reliable software.
          </p>

          {/* Social Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Portfolio Link */}
            <a
              href="https://asameer.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: 14,
                textDecoration: 'none',
                color: '#0f172a',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: '#f0fdf4',
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <Icon name="globe" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Portfolio</div>
                  <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>asameer.netlify.app</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}><Icon name="external" size={16} /></div>
            </a>

            {/* GitHub Profile */}
            <a
              href="https://github.com/Sameer8549"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: 14,
                textDecoration: 'none',
                color: '#0f172a',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: '#24292f',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="github" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>GitHub</div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>github.com/Sameer8549</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}><Icon name="external" size={16} /></div>
            </a>

            {/* LinkedIn Profile */}
            <a
              href="https://linkedin.com/in/abdulsameer9"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: 14,
                textDecoration: 'none',
                color: '#0f172a',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: '#0a66c2',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="linkedin" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>LinkedIn</div>
                  <div style={{ fontSize: 12, color: '#0a66c2', fontWeight: 600 }}>linkedin.com/in/abdulsameer9</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}><Icon name="external" size={16} /></div>
            </a>
          </div>
        </section>

        {/* ── Official Institutional Footer ── */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#94a3b8',
            padding: '8px 0 24px',
            lineHeight: 1.6,
          }}
        >
          <b>HKBK Group of Institutions</b> · {shopAddress}<br />
          Official Smart Campus Printing &amp; Reprographics Desk · Across All HKBK Institutions
        </div>
      </div>
    </main>
  );
}

export default About;
