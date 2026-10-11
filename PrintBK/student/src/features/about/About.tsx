import React from 'react';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';

interface AboutProps {
  go: (screen: Screen) => void;
}

export function About({ go }: AboutProps) {
  const logoUrl = import.meta.env.BASE_URL + 'assets/hkbk-logo.png';

  return (
    <main className="page" style={{ background: 'var(--color-bg, #f7f4ee)', minHeight: '100dvh', paddingBottom: 56 }}>
      <Topbar title="About PrintBK" back onBack={() => go('settings')} />

      <div style={{ maxWidth: 600, margin: '14px auto 0', display: 'flex', flexDirection: 'column', gap: 16, padding: '0 12px' }}>
        {/* ── Official Crest & Hero Card ── */}
        <section style={{
          background: '#ffffff',
          borderRadius: 22,
          border: '1.5px solid #e2e8f0',
          padding: '28px 22px 24px',
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.05)',
          textAlign: 'center'
        }}>
          {/* Official HD HKBK Crest */}
          <div style={{
            width: 96,
            height: 96,
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            borderRadius: 24,
            padding: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.06)',
            border: '1.5px solid #e2e8f0'
          }}>
            <img
              src={logoUrl}
              alt="Official HKBK Crest"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                imageRendering: 'auto'
              }}
            />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0b1020', margin: '0 0 6px', letterSpacing: -0.5 }}>
            PrintBK
          </h1>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#047857', marginBottom: 12 }}>
            Smart Campus Reprographics & Automated Printing Platform
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 99,
              border: '1px solid #bfdbfe'
            }}>
              HKBK Student Point · Bengaluru
            </span>
            <span style={{
              background: '#ecfdf5',
              color: '#047857',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 99,
              border: '1px solid #a7f3d0'
            }}>
              v1.0 Production Hardened
            </span>
          </div>

          <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.65, margin: 0, textAlign: 'left', background: '#f8fafc', padding: '14px 16px', borderRadius: 14, border: '1px solid #f1f5f9' }}>
            Built exclusively for students, faculty, and campus staff at <b>HKBK College of Engineering</b> to eliminate counter bottlenecks, eradicate malware transmission via shared flash drives, and streamline document printing in seconds.
          </p>
        </section>

        {/* ── College & Facility Context ── */}
        <section style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '22px 20px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🏛️</span>
            <div>
              <strong style={{ display: 'block', fontSize: 15, color: '#0f172a' }}>HKBK College of Engineering</strong>
              <small style={{ color: '#64748b', fontSize: 12 }}>Nagawara, Bengaluru - 560045, Karnataka</small>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 14 }}>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Affiliation</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>VTU, Belagavi</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>AICTE Approved · NAAC</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Campus Facility</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>HKBK Student Point</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Reprographics Wing</div>
            </div>
          </div>
        </section>

        {/* ── The Problem PrintBK Solves ── */}
        <section style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '22px 20px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.03)'
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💡</span> Why PrintBK was Built
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                ✕
              </div>
              <div>
                <strong style={{ fontSize: 13, color: '#0f172a', display: 'block' }}>The Old Way (Pen Drives & Rush)</strong>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
                  Passing infected pen drives between hostel computers and lab printers, crowding the reprographics counter during short breaks, and manually explaining page numbers to staff.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                ✓
              </div>
              <div>
                <strong style={{ fontSize: 13, color: '#0f172a', display: 'block' }}>The PrintBK Way (Instant & Contactless)</strong>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
                  Direct PDF & PPTX slide rendering on your device, transparent rates, sequential order numbers, and 4-digit pickup codes. Arrive at the counter, show code, collect prints.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Key Architectural Capabilities ── */}
        <section style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12
        }}>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Zero-Trace Privacy</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>128-bit cryptographic capability tokens & 5-min server auto-wipe.</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⚡</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Local File Engine</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>High-accuracy PDF page count & PPTX slide-count parser in browser.</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🏷️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Secure Pickup Codes</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Collision-free server-generated 4-digit verification pin.</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🔔</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Multi-Channel Alerts</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Audio chime, device vibration, browser push, & 1-tap WhatsApp alert.</div>
          </div>
        </section>

        {/* ── Creator & Developer Spotlight Card ── */}
        <section style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          borderRadius: 22,
          border: '1.5px solid #e2e8f0',
          padding: '24px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{
              background: '#fef3c7',
              color: '#b45309',
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid #fde68a'
            }}>
              Creator & Developer
            </span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
              Batch 2022–2026
            </span>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0b1020', margin: '0 0 4px' }}>
            Abdul Sameer
          </h2>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', marginBottom: 10 }}>
            3rd Year Information Science & Engineering (ISE) Student
          </div>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
            Conceptualized, engineered, and hardened PrintBK for the students of HKBKCE. Dedicated to building high-performance, privacy-centric campus utilities with modern web engineering.
          </p>

          {/* Clickable Social, Portfolio & Company Links */}
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
                transition: 'transform 0.1s ease, border-color 0.1s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #bbf7d0'
                }}>
                  <Icon name="globe" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Portfolio</div>
                  <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>asameer.netlify.app</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
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
                transition: 'transform 0.1s ease, border-color 0.1s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: '#24292f',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon name="github" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>GitHub</div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>github.com/Sameer8549</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
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
                transition: 'transform 0.1s ease, border-color 0.1s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: '#0a66c2',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon name="linkedin" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>LinkedIn</div>
                  <div style={{ fontSize: 12, color: '#0a66c2', fontWeight: 600 }}>linkedin.com/in/abdulsameer9</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '12px 0 24px', lineHeight: 1.6 }}>
          PrintBK Platform · Engineered with ❤️ by Abdul Sameer<br />
          Department of Information Science & Engineering · HKBKCE
        </div>
      </div>
    </main>
  );
}

export default About;
