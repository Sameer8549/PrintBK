// dev-only-component
// Dev-only design system and component specimen gallery.
// Excluded from production builds.
import React, { useState } from "react"

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    check: <path d="m5 12 4 4L19 6" />,
    printer: <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />,
    search: <circle cx="11" cy="11" r="7" />,
  }
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || <path d="m5 12 4 4L19 6" />}
    </svg>
  )
}

function KpiTile({ label, value, change, lime = false }: { label: string; value: string; change: string; lime?: boolean }) {
  return (
    <article className={`kpi-tile ${lime ? "lime" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <b>{change}</b>
    </article>
  )
}

export default function ComponentsPage() {
  const [tab, setTab] = useState(0)

  return (
    <main className="components-page">
      <header className="components-hero">
        <div>
          <span className="eyebrow">DESIGN SYSTEM</span>
          <h1 className="component-page-title">PrintBK UI Kit</h1>
          <p>Counter operations component library.</p>
        </div>
      </header>

      <section className="component-section">
        <div className="component-section-title">
          <span>01</span>
          <div>
            <strong>Color Palette</strong>
            <p>High-contrast accessible theme.</p>
          </div>
        </div>
        <div className="color-token-grid">
          <div><i style={{ background: "var(--ink)" }} /><strong>Ink</strong><span>#0B1020</span></div>
          <div><i style={{ background: "var(--paper)" }} /><strong>Paper</strong><span>#F7F4EE</span></div>
          <div><i style={{ background: "var(--lime)" }} /><strong>Lime</strong><span>#C8F031</span></div>
          <div><i style={{ background: "var(--sand)" }} /><strong>Sand</strong><span>#EDE8DC</span></div>
        </div>
      </section>

      <section className="component-section">
        <div className="component-section-title">
          <span>02</span>
          <div>
            <strong>Interactive Components</strong>
            <p>Operational controls and status indicators.</p>
          </div>
        </div>
        <div className="component-grid three">
          <div className="component-specimen">
            <span>KPI TILE</span>
            <KpiTile label="Total Orders" value="128" change="+8%" lime />
          </div>
          <div className="component-specimen">
            <span>BUTTON</span>
            <button className="button button--primary" style={{ width: "100%", height: "64px" }}>
              Approve &amp; Print
            </button>
          </div>
          <div className="component-specimen">
            <span>TOAST</span>
            <div className="component-toast">
              <Icon name="check" />
              <span>Action completed</span>
              <button type="button">UNDO</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
