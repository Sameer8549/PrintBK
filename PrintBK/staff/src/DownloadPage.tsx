import React, { useEffect, useState } from "react"
import { pairStaffDevice } from "./api/client"

interface VersionInfo {
  latestVersion: string
  minSupportedVersion?: string
  fileSize: string
  fileSizeBytes?: number
  releaseDate: string
  sha256: string
  downloadUrl: string
  stableDownloadUrl: string
  releaseNotes: string
}

interface DownloadPageProps {
  onPairSuccess: () => void
}

export function DownloadPage({ onPairSuccess }: DownloadPageProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [copiedSha, setCopiedSha] = useState(false)
  const [copiedPs, setCopiedPs] = useState(false)
  const [protocolFallbackVisible, setProtocolFallbackVisible] = useState(false)
  const [showOwnerPairing, setShowOwnerPairing] = useState(false)

  // Pairing state
  const [setupCode, setSetupCode] = useState("")
  const [pairError, setPairError] = useState("")
  const [pairLoading, setPairLoading] = useState(false)

  const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent)
  const isMobile = typeof window !== "undefined" && (window.innerWidth < 640 || /Android|iPhone|iPad/i.test(navigator.userAgent))

  useEffect(() => {
    let active = true
    fetch("/server/api/counter/version")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!active) return
        if (data.ok) {
          setVersionInfo(data)
        } else {
          setFetchError("Latest release information currently unavailable.")
        }
      })
      .catch((err) => {
        if (!active) return
        setFetchError("Could not reach release feed. Direct installer download remains accessible.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const defaultDownloadUrl = "https://github.com/glittercowboy/PrintBK-releases/releases/latest/download/PrintBK-Counter-Setup.exe"
  const downloadUrl = versionInfo?.stableDownloadUrl || versionInfo?.downloadUrl || defaultDownloadUrl
  const version = versionInfo?.latestVersion || "1.0.0"
  const fileSize = versionInfo?.fileSize || "118 MB"
  const releaseDate = versionInfo?.releaseDate || "October 2026"
  const sha256 = versionInfo?.sha256 || "63768f5d0505a415a772ebc17fb1ff756e07b5ca31a44e5033fcb16751c6c579"

  const psCommand = `Get-FileHash "$HOME\\Downloads\\PrintBK-Counter-Setup.exe" -Algorithm SHA256`

  const handleCopySha = () => {
    navigator.clipboard.writeText(sha256)
    setCopiedSha(true)
    setTimeout(() => setCopiedSha(false), 2000)
  }

  const handleCopyPs = () => {
    navigator.clipboard.writeText(psCommand)
    setCopiedPs(true)
    setTimeout(() => setCopiedPs(false), 2000)
  }

  const handleOpenProtocol = () => {
    window.location.href = "printbk-counter://"
    setTimeout(() => {
      setProtocolFallbackVisible(true)
    }, 2400)
  }

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (setupCode.trim().length < 4) return
    setPairError("")
    setPairLoading(true)
    try {
      await pairStaffDevice(setupCode.trim(), isMobile ? "Owner Phone" : "Browser Counter")
      onPairSuccess()
    } catch (err: any) {
      setPairError(err.message || "Failed to pair device. Check your setup code.")
    } finally {
      setPairLoading(false)
    }
  }

  return (
    <div className="download-page-root">
      {/* Top Header */}
      <header className="download-header">
        <div className="download-brand">
          <img src="./hkbk-logo.jpg" alt="HKBK Campus Store" className="download-brand-logo" />
          <div className="download-brand-text">
            <strong>PrintBK Counter</strong>
            <span>STATION RELEASE HUB</span>
          </div>
        </div>

        <div className="download-header-actions">
          <button
            type="button"
            className="download-alt-link"
            onClick={() => setShowOwnerPairing((v) => !v)}
            aria-expanded={showOwnerPairing}
          >
            {showOwnerPairing ? "Back to installer" : "Owner on a phone? Pair this browser"}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="download-container">
        {/* Device advisory notice if not on Windows */}
        {!isWindows && (
          <div className="download-banner download-banner--info" role="region" aria-label="Operating system advisory">
            <strong>Non-Windows device detected.</strong>
            <p>
              The PrintBK Counter workstation application runs natively on 64-bit Windows PCs connected to shop printers.
              To manage queue orders from this device, use the owner pairing flow below.
            </p>
          </div>
        )}

        {fetchError && (
          <div className="download-banner download-banner--warning" role="region" aria-label="Backend status notice">
            <span>{fetchError}</span>
          </div>
        )}

        {/* Hero Section */}
        <section className="download-hero">
          <span className="eyebrow">OFFICIAL WORKSTATION SOFTWARE</span>
          <h1 className="download-headline">PrintBK Counter</h1>
          <p className="download-subline">
            Install once on your shop PC. Everything is included.
          </p>

          <div className="download-action-group">
            <a
              href={downloadUrl}
              className="download-primary-button"
              id="download-windows-btn"
              download
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.949-1.801" />
              </svg>
              <span>
                <strong>DOWNLOAD FOR WINDOWS</strong>
                <small>v{version} · {fileSize} · {releaseDate}</small>
              </span>
            </a>

            <button
              type="button"
              className="download-secondary-button"
              onClick={handleOpenProtocol}
              id="open-counter-protocol-btn"
            >
              Already installed? Open PrintBK Counter
            </button>
          </div>

          {protocolFallbackVisible && (
            <div className="protocol-fallback-notice">
              <p>
                If PrintBK Counter did not open automatically, verify the installer has completed, or launch <strong>PrintBK Counter</strong> directly from your Windows Start Menu.
              </p>
            </div>
          )}
        </section>

        {/* Collapsible Owner Mobile Pairing Panel */}
        {showOwnerPairing && (
          <section className="owner-pairing-panel" id="owner-pairing-section">
            <div className="owner-pairing-header">
              <span className="eyebrow">REMOTE STORE ACCESS</span>
              <h2>Owner Mobile &amp; Browser Pairing</h2>
              <p>
                Enter your staff setup code once to pair this browser as an authorized store monitor. No password or email login required.
              </p>
            </div>

            <form onSubmit={handlePairSubmit} className="owner-pairing-form">
              <label htmlFor="owner-setup-code" className="owner-pairing-label">
                STAFF SETUP CODE
              </label>
              <input
                id="owner-setup-code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="PBK-SETUP-XXXX or 24-character code"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                className="owner-pairing-input"
                disabled={pairLoading}
              />

              {pairError && (
                <div className="owner-pairing-error" role="alert">
                  {pairError}
                </div>
              )}

              <div className="owner-pairing-actions">
                <button
                  type="submit"
                  disabled={setupCode.trim().length < 4 || pairLoading}
                  className="owner-pairing-submit"
                >
                  {pairLoading ? "PAIRING BROWSER…" : "PAIR THIS BROWSER"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowOwnerPairing(false)}
                  className="owner-pairing-cancel"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Features: What You Get */}
        <section className="download-features-grid">
          <div className="download-feature-card">
            <div className="download-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
            <h3>Print Agent Included</h3>
            <p>
              Background daemon automatically polls approved student jobs and prints silently with correct color, duplex, copies, and orientation settings.
            </p>
          </div>

          <div className="download-feature-card">
            <div className="download-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3>Counter Screen</h3>
            <p>
              High-contrast orders board built for busy shop desks with 1-click cash collection, job queues, instant reprints, and live analytics.
            </p>
          </div>

          <div className="download-feature-card">
            <div className="download-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </div>
            <h3>Automatic Updates</h3>
            <p>
              Verified differential updates download in the background from public release feeds, keeping your counter reliable without manual re-installs.
            </p>
          </div>

          <div className="download-feature-card">
            <div className="download-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3>Works With Your Printers</h3>
            <p>
              Direct Windows spooler integration detects Canon, HP, Epson, and Brother printers with separate B&amp;W and Colour queue routing.
            </p>
          </div>
        </section>

        {/* 3-Step Setup Guide */}
        <section className="download-steps-section">
          <div className="download-steps-header">
            <span className="eyebrow">3-STEP WORKSTATION SETUP</span>
            <h2>Simple Installation Guide</h2>
          </div>

          <div className="download-steps-list">
            <div className="download-step-card">
              <div className="download-step-number">1</div>
              <div className="download-step-content">
                <h3>Install your printers in Windows</h3>
                <p>
                  Ensure your document and receipt printers are connected via USB or network. Open Windows Printers &amp; Scanners and print a standard Windows test page.
                </p>
              </div>
            </div>

            <div className="download-step-card">
              <div className="download-step-number">2</div>
              <div className="download-step-content">
                <h3>Run the installer</h3>
                <p>
                  Launch <code>PrintBK-Counter-Setup.exe</code>. If Windows SmartScreen displays &ldquo;Windows protected your PC&rdquo;, click <strong>More info</strong> and select <strong>Run anyway</strong>.
                </p>
              </div>
            </div>

            <div className="download-step-card">
              <div className="download-step-number">3</div>
              <div className="download-step-content">
                <h3>Enter your setup code once</h3>
                <p>
                  When prompted, enter your store setup code. The counter desktop window and background print agent pair together immediately. Press <strong>Test print</strong> to confirm.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Binary Integrity & Checksums */}
        <section className="download-integrity-section">
          <div className="download-integrity-header">
            <span className="eyebrow">CRYPTOGRAPHIC INTEGRITY</span>
            <h2>Verify Checksum</h2>
            <p>
              Every release binary is hashed before deployment. Verify the SHA-256 fingerprint before executing on your PC.
            </p>
          </div>

          <div className="integrity-box">
            <div className="integrity-row">
              <div className="integrity-label">SHA-256 (Setup Binary)</div>
              <div className="integrity-val-wrap">
                <code className="integrity-hash">{sha256}</code>
                <button
                  type="button"
                  onClick={handleCopySha}
                  className="integrity-copy-btn"
                  aria-label="Copy SHA-256 checksum"
                >
                  {copiedSha ? "COPIED" : "COPY"}
                </button>
              </div>
            </div>

            <div className="integrity-row integrity-row--sub">
              <div className="integrity-label">PowerShell Verification Command</div>
              <div className="integrity-val-wrap">
                <code className="integrity-cmd">{psCommand}</code>
                <button
                  type="button"
                  onClick={handleCopyPs}
                  className="integrity-copy-btn"
                  aria-label="Copy PowerShell verification command"
                >
                  {copiedPs ? "COPIED" : "COPY COMMAND"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Troubleshooting & Support */}
        <footer className="download-footer-support">
          <div>
            <strong>Need assistance setting up?</strong>
            <p>Contact store technical support or review the local setup guide.</p>
          </div>
          <div className="support-links">
            <a
              href="https://wa.me/919999999999?text=PrintBK%20Counter%20setup%20assistance"
              target="_blank"
              rel="noopener noreferrer"
              className="support-link"
            >
              WhatsApp Support
            </a>
            <button
              type="button"
              className="support-link"
              onClick={() => setShowOwnerPairing(true)}
            >
              Pair Phone Browser
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}
