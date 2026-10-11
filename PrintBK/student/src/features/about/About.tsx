import React from 'react';
import { Topbar, Icon } from '../../components/ui';
import { Screen } from '../../lib/types';

interface AboutProps {
  go: (screen: Screen) => void;
}

export function About({ go }: AboutProps) {
  return (
    <main className="page" style={{ background: 'var(--color-bg, #f7f4ee)', minHeight: '100dvh', paddingBottom: 48 }}>
      <Topbar title="About PrintBK" back onBack={() => go('settings')} />

      <div style={{ maxWidth: 580, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        {/* ── App Header Card ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '28px 24px 24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          textAlign: 'center'
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: '#0b1020',
            color: '#ffffff',
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 900,
            boxShadow: '0 8px 24px rgba(11, 16, 32, 0.25)'
          }}>
            P
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0b1020', margin: '0 0 6px', letterSpacing: -0.5 }}>
            PrintBK
          </h1>
          <div style={{
            display: 'inline-block',
            background: '#eff6ff',
            color: '#2563eb',
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 99,
            marginBottom: 12
          }}>
            Version 1.0 · Production Ready
          </div>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
            Smart, privacy-first, zero-wait campus printing platform designed and built specifically for students at <b>HKBK Student Point</b>, Bengaluru.
          </p>
        </div>

        {/* ── Highlights Grid ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12
        }}>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⚡</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Instant Preview</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Original PDF & multi-slide PPTX rendering</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>100% Privacy</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Capability tokens & auto-deletion in 5 mins</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🏷️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Pickup Codes</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>4-digit codes & sequential order tracking</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>💵</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Pay at Counter</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Fast cash collection & dormant Razorpay</div>
          </div>
        </div>

        {/* ── Developer Spotlight Card ── */}
        <div style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          borderRadius: 20,
          border: '1.5px solid #e2e8f0',
          padding: '24px',
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
              borderRadius: 8
            }}>
              Creator & Developer
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
              ISE Department
            </span>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0b1020', margin: '0 0 4px' }}>
            Abdul Sameer
          </h2>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6', marginBottom: 10 }}>
            3rd Year Information Science & Engineering (ISE) Student
          </div>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
            Built PrintBK to solve campus printing congestion — replacing slow manual USB transfers and paper queues with an automated, secure web-first solution.
          </p>

          {/* Social & Portfolio Links with Official Icons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Portfolio */}
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
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#f0f9ff',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon name="globe" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Portfolio</div>
                  <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 500 }}>asameer.netlify.app</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
            </a>

            {/* GitHub */}
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
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
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
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>github.com/Sameer8549</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
            </a>

            {/* LinkedIn */}
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
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
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
                  <div style={{ fontSize: 12, color: '#0a66c2', fontWeight: 500 }}>linkedin.com/in/abdulsameer9</div>
                </div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <Icon name="external" size={16} />
              </div>
            </a>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '12px 0 24px', lineHeight: 1.6 }}>
          Designed & Developed with ❤️ by Abdul Sameer<br />
          HKBK Student Point · Bengaluru
        </div>
      </div>
    </main>
  );
}

export default About;
