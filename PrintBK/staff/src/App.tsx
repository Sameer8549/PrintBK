import { useEffect, useMemo, useRef, useState } from "react"

type Payment = "paid" | "upi" | "cash_due" | "cash_collected"
type Service =
  | "bw"
  | "colour"
  | "photos"
  | "binding"
  | "lamination"
  | "scanning"
  | "photocopy"
  | "typing"

type Job = {
  key: string
  order: number
  service: Service
  uploaded: string
  payment: Payment
  amount: number
  state: string
  linked?: boolean
  disabled?: boolean
  values: string[]
  detail: string
}

type TableConfig = {
  id: Service
  title: string
  icon: string
  meta: string
  columns: string[]
  action: "print" | "done" | "quote"
}

type RecentPrint = {
  job: Job
  pickup: string
  printedAt: string
  expiresAt: number
}

const pickupCodes: Record<number, string> = {
  1019: "4821", 1020: "1194", 1021: "7318", 1022: "3084", 1023: "6142", 1024: "2059", 1025: "4821", 1026: "9063",
}

const tables: TableConfig[] = [
  {
    id: "bw",
    title: "Black & White Documents",
    icon: "printer",
    meta: "EPSON L3110 · ONLINE",
    columns: ["Uploaded", "Documents", "Pages", "Copies", "Sides", "Layout", "Paper", "Orientation", "Sheets"],
    action: "print",
  },
  {
    id: "colour",
    title: "Colour Documents",
    icon: "colour",
    meta: "EPSON L3110 · ONLINE",
    columns: ["Uploaded", "Documents", "Pages", "Colour pages", "Copies", "Sides", "Layout", "Paper", "Orientation", "Sheets"],
    action: "print",
  },
  {
    id: "photos",
    title: "Photos",
    icon: "photo",
    meta: "COLOUR PRINTER",
    columns: ["Uploaded", "Preset", "Photos", "Sheet & layout", "Copies", "Paper to load", "Colour mode"],
    action: "print",
  },
  {
    id: "binding",
    title: "Binding",
    icon: "bind",
    meta: "FINISHING DESK",
    columns: ["Linked document", "Type", "Size", "Cover", "Copies", "Status"],
    action: "done",
  },
  {
    id: "lamination",
    title: "Lamination",
    icon: "layers",
    meta: "FINISHING DESK",
    columns: ["Item", "Quantity", "Finish", "Thickness", "Student brings"],
    action: "done",
  },
  {
    id: "scanning",
    title: "Scanning",
    icon: "scan",
    meta: "SERVICE COUNTER",
    columns: ["Mode", "Pages", "Output"],
    action: "done",
  },
  {
    id: "photocopy",
    title: "Photocopy",
    icon: "copy",
    meta: "EPSON L3110",
    columns: ["Pages", "Copies", "Colour", "Sides", "Paper"],
    action: "done",
  },
  {
    id: "typing",
    title: "Typing & Custom Requests",
    icon: "type",
    meta: "QUOTE DESK",
    columns: ["Request title", "Notes preview", "Urgency", "Quote", "Status"],
    action: "quote",
  },
]

const initialJobs: Job[] = [
  {
    key: "bw-1019",
    order: 1019,
    service: "bw",
    uploaded: "10:14 · waiting 12m",
    payment: "cash_due",
    amount: 86,
    state: "Ready to print",
    linked: true,
    values: ["10:14 · waiting 12m", "Mechanics Unit 3 notes.pdf · 1 file", "1–40 of 40", "2", "Double · long edge", "2-up", "A4", "Portrait", "40"],
    detail: "Two linked services: print first, then spiral bind. Pickup code P7K2.",
  },
  {
    key: "bw-1020",
    order: 1020,
    service: "bw",
    uploaded: "10:19 · waiting 7m",
    payment: "upi",
    amount: 34,
    state: "Preparing",
    values: ["10:19 · waiting 7m", "DBMS lab record.pdf · 2 files", "1–24 of 24", "1", "Double · long edge", "1-up", "A4", "Fitted automatically", "12"],
    detail: "UPI reference #1020, UTR ending 1194. Pickup code M4D8.",
  },
  {
    key: "colour-1021",
    order: 1021,
    service: "colour",
    uploaded: "10:22 · waiting 4m",
    payment: "upi",
    amount: 128,
    state: "Ready to print",
    values: ["10:22 · waiting 4m", "Final presentation.pdf · 1 file", "1–30 of 30", "Colour: p1 · B&W: p2–30", "1", "Single", "1-up", "A4", "Landscape", "30"],
    detail: "Mixed document. Colour page 1 goes on top of the B&W stack. Pickup code R9T3.",
  },
  {
    key: "photos-1022",
    order: 1022,
    service: "photos",
    uploaded: "10:23 · waiting 3m",
    payment: "paid",
    amount: 96,
    state: "Ready to print",
    values: ["10:23 · waiting 3m", "Passport", "4 photos", "A4 · 8-up · 35 × 45 mm", "2", "Photo paper", "Natural colour"],
    detail: "Crop checked automatically. Pickup code T3Q8.",
  },
  {
    key: "binding-1019",
    order: 1019,
    service: "binding",
    uploaded: "10:14 · waiting 12m",
    payment: "cash_due",
    amount: 86,
    state: "Waiting for print",
    linked: true,
    disabled: true,
    values: ["Mechanics Unit 3 notes.pdf", "Spiral", "8 mm", "Clear front · black back", "1", "Waiting for print"],
    detail: "Linked to the B&W print row for order #1019.",
  },
  {
    key: "lamination-1023",
    order: 1023,
    service: "lamination",
    uploaded: "10:24 · waiting 2m",
    payment: "cash_due",
    amount: 40,
    state: "Finishing needed",
    values: ["ID card", "2", "Glossy", "Standard", "Original ID card"],
    detail: "Student brings the original item. Pickup code H6N1.",
  },
  {
    key: "scanning-1024",
    order: 1024,
    service: "scanning",
    uploaded: "10:25 · waiting 1m",
    payment: "cash_collected",
    amount: 30,
    state: "Preparing",
    values: ["Walk-in", "12", "Single PDF"],
    detail: "Send the completed PDF to the student order automatically.",
  },
  {
    key: "photocopy-1025",
    order: 1025,
    service: "photocopy",
    uploaded: "10:26 · just now",
    payment: "upi",
    amount: 48,
    state: "Printing 14/30",
    values: ["30", "1", "B&W", "Double · long edge", "A4"],
    detail: "14 of 30 pages complete. UPI reference #1025, UTR ending 4821.",
  },
  {
    key: "typing-1026",
    order: 1026,
    service: "typing",
    uploaded: "10:26 · just now",
    payment: "cash_due",
    amount: 0,
    state: "Waiting for quote",
    values: ["One-page application", "Type from handwritten English source…", "Today", "Not quoted", "Waiting for quote"],
    detail: "Student requested delivery by 4:00 PM today.",
  },
]

const paymentLabel: Record<Payment, string> = {
  paid: "PAID ONLINE",
  upi: "UPI PAID",
  cash_due: "COLLECT",
  cash_collected: "CASH COLLECTED",
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    check: <path d="m5 12 4 4L19 6" />,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    cash: <><path d="M8 4h5a4 4 0 0 1 0 8H8m0-4h8M8 12l7 8" /></>,
    printer: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></>,
    colour: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M5.5 5.5l13 13" /></>,
    photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m3 17 5-5 4 4 3-3 6 6" /></>,
    bind: <><path d="M6 3v18M10 4h9v16h-9" /><path d="M3 7h6M3 12h6M3 17h6" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    scan: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    type: <><path d="M4 5V3h16v2M9 21h6M12 3v18" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Button({ children, onClick, kind = "plain", disabled = false, className = "" }: { children: React.ReactNode; onClick?: (event: React.MouseEvent) => void; kind?: "primary" | "plain" | "ghost"; disabled?: boolean; className?: string }) {
  return <button className={`button button--${kind} ${className}`} type="button" onClick={onClick} disabled={disabled}>{children}</button>
}

function LiveIndicator({ offline = false }: { offline?: boolean }) {
  return <div className={`live-status ${offline ? "is-offline" : ""}`}><i /><span><b>{offline ? "OFFLINE" : "LIVE"}</b><small>{offline ? "Waiting to reconnect" : "Updated 1s ago"}</small></span></div>
}

function PrinterPill({ role, name, online = true }: { role: string; name: string; online?: boolean }) {
  return <div className={`printer-pill ${online ? "" : "is-offline"}`}><i /><span><small>{role}</small>{name}</span></div>
}

function TableTitleBar({ config, count }: { config: TableConfig; count: number }) {
  return <div className="service-title"><div className="service-symbol"><Icon name={config.icon} size={24} /></div><div><strong>{config.title}</strong><span>{config.meta}</span></div><b>{count}</b></div>
}

function Countdown({ expiresAt, deleted = false, compact = false }: { expiresAt: number; deleted?: boolean; compact?: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (deleted || expiresAt <= now) return <span>FILES DELETED</span>
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  return <span>{compact ? time : `FILES DELETE IN ${time}`}</span>
}

function KeycapHint({ keyName, children }: { keyName: string; children?: React.ReactNode }) {
  return <span className="keycap-hint"><kbd>{keyName}</kbd>{children && <span>{children}</span>}</span>
}

function ActionButton({ action, primary = false, disabled = false, pressed = false, onClick }: { action: "cash" | "print" | "retry" | "done" | "quote"; primary?: boolean; disabled?: boolean; pressed?: boolean; onClick?: (event: React.MouseEvent) => void }) {
  const labels = { cash: "COLLECT CASH", print: "APPROVE & PRINT", retry: "RETRY PRINT", done: "DONE", quote: "SEND QUOTE" }
  return <Button kind={primary ? "primary" : "plain"} disabled={disabled} className={pressed ? "is-forced-pressed" : ""} onClick={onClick}>{labels[action]}{action === "cash" && <kbd>C</kbd>}{(action === "print" || action === "retry") && <kbd>↵</kbd>}</Button>
}

function PageChip({ page, colour = false }: { page: number; colour?: boolean }) {
  return <span className={colour ? "colour-page" : ""}>P{page}</span>
}

function OrientationNote({ title = "Pages 2–3 portrait", note = "Fitted automatically. Page 7 rotated by the student." }: { title?: string; note?: string }) {
  return <div className="orientation-card"><div className="sheet-illustration"><span>1</span><i /></div><div><span>ORIENTATION PER PAGE</span><b>{title}</b><p>{note}</p></div></div>
}

function FinishingTag({ children }: { children: React.ReactNode }) {
  return <b className="finishing-tag">{children}</b>
}

function FileLine({ name, meta, tag }: { name: string; meta: string; tag?: string }) {
  return <div className="file-line"><Icon name="printer" /><div><strong title={name}>{name}</strong><span>{meta}</span></div>{tag && <FinishingTag>{tag}</FinishingTag>}</div>
}

function ChangeHelper({ received, change }: { received: number; change: number }) {
  return <div className="change-helper"><Icon name="check" /><div><strong>₹{received.toFixed(2)} received</strong><span>Change to return</span></div><b>₹{change.toFixed(2)}</b></div>
}

function PrintedCompactRow({ order, code, expiresAt }: { order: number; code: string; expiresAt: number }) {
  return <div className="printed-compact"><strong>#{order}</strong><span>Printed · code {code}</span><div className="countdown-ring"><Countdown expiresAt={expiresAt} compact /></div></div>
}

function Banner({ tone, children }: { tone: "warning" | "error" | "info"; children: React.ReactNode }) {
  return <div className={`component-banner ${tone}`}><Icon name={tone === "warning" ? "eye" : tone === "error" ? "settings" : "check"} />{children}</div>
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="component-skeleton">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>
}

function SettingRow({ title, help, checked, onChange, disabled = false }: { title: string; help: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <div className={`toggle-row ${disabled ? "disabled" : ""}`}><div><strong>{title}</strong><span>{help}</span></div><Toggle checked={checked} disabled={disabled} onChange={onChange} /></div>
}

function KeyField({ label, value, secret = false, onChange }: { label: string; value: string; secret?: boolean; onChange: (value: string) => void }) {
  return <SettingsField label={label} value={value} type={secret ? "password" : "text"} onChange={onChange} />
}

function WizardStep({ number, title, state }: { number: number; title: string; state: string }) {
  return <div className="wizard-demo"><i>{number}</i><div><strong>{title}</strong><span>{state}</span></div></div>
}

function PrinterDropdownRow({ value, onTest, onChange }: { value: string; onTest: () => void; onChange?: () => void }) {
  return <div className="printer-select-row"><select defaultValue={value} onChange={onChange}><option>EPSON L3110 Series</option><option>Microsoft Print to PDF</option><option>Canon G3010 Series</option></select><Button onClick={onTest}>TEST PRINT</Button></div>
}

function KpiTile({ label, value, change, spark, lime = false }: { label: string; value: string; change: string; spark: number[]; lime?: boolean }) {
  return <article className={`kpi-tile ${lime ? "lime" : ""}`}><span>{label}</span><strong>{value}</strong><Sparkline values={spark} /><b>{change} <small>vs yesterday</small></b></article>
}

function ChartCard({ eyebrow, title, children, className = "" }: { eyebrow: string; title: string; children: React.ReactNode; className?: string }) {
  return <section className={`analytics-card ${className}`}><div className="analytics-title"><div><span>{eyebrow}</span><strong>{title}</strong></div></div>{children}</section>
}

function FeedbackToast({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return <div className="toast"><span>{message}</span>{action && <Button kind="ghost" onClick={onAction}>{action}</Button>}<i /></div>
}

function Header({ open, setOpen, onSettings, onToday, onOrders }: { open: boolean; setOpen: (open: boolean) => void; onSettings: () => void; onToday: () => void; onOrders: () => void }) {
  const [sound, setSound] = useState(true)
  return (
    <header className="topbar">
      <div className="brand" role="button" tabIndex={0} onClick={onOrders}><img src="/hkbk-logo.jpg" alt="HKBK Group of Institutions" /><div><strong>PrintBK</strong><span>COUNTER</span></div></div>
      <button className={`shop-switch ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen(!open)}><span className="switch-track"><span /></span><b>{open ? "SHOP OPEN" : "SHOP CLOSED"}</b></button>
      <LiveIndicator />
      <div className="printer-pills">
        <PrinterPill role="B&W" name="EPSON L3110" />
        <PrinterPill role="COLOUR" name="EPSON L3110" />
      </div>
      <nav className="nav-actions">
        <Button kind="ghost" className={sound ? "is-active" : ""} onClick={() => setSound(!sound)}><Icon name="volume" /><span>{sound ? "Sound on" : "Sound off"}</span></Button>
        <Button kind="ghost" onClick={onToday}><Icon name="analytics" /><span>Today</span></Button>
        <Button kind="ghost" onClick={onSettings}><Icon name="settings" /><span>Printers</span></Button>
      </nav>
    </header>
  )
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`setting-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><i /><span>{checked ? "On" : "Off"}</span></button>
}

function QRPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`qr-preview ${compact ? "compact" : ""}`}>
      {Array.from({ length: 81 }, (_, index) => <i className={(index * 7 + Math.floor(index / 9) * 3) % 5 < 2 || [0, 1, 2, 9, 11, 18, 19, 20, 60, 61, 62, 69, 71, 78, 79, 80].includes(index) ? "ink" : ""} key={index} />)}
    </div>
  )
}

function SettingsField({ label, value, type = "text", suffix, onChange }: { label: string; value: string; type?: string; suffix?: string; onChange: (value: string) => void }) {
  return <label className="settings-field"><span>{label}</span><div><input type={type} value={value} onChange={(event) => onChange(event.target.value)} />{suffix && <b>{suffix}</b>}</div></label>
}

function PrinterSettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(0)
  const [saved, setSaved] = useState(false)
  const [scanningPrinters, setScanningPrinters] = useState(true)
  const [samePrinter, setSamePrinter] = useState(true)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [bwTest, setBwTest] = useState("")
  const [colourTest, setColourTest] = useState("")
  const [extras, setExtras] = useState<string[]>(["EPSON L15150 · A3"])
  const [mixedMode, setMixedMode] = useState("split")
  const [cash, setCash] = useState(true)
  const [upi, setUpi] = useState(true)
  const [secretVisible, setSecretVisible] = useState(false)
  const [keyId, setKeyId] = useState("")
  const [keySecret, setKeySecret] = useState("")
  const [webhook, setWebhook] = useState("")
  const [sound, setSound] = useState(true)
  const [awake, setAwake] = useState(true)
  const [textSize, setTextSize] = useState("Extra large")
  const [agentHelp, setAgentHelp] = useState(false)
  const [rates, setRates] = useState({ bw: "1.50", colour: "8.00", duplex: "0.85", bulk: "100", a3: "2", legal: "1.25" })
  const [shop, setShop] = useState({ name: "HKBK Student Point", address: "HKBK College Campus, Bengaluru", hours: "8:00 AM – 7:00 PM", phone: "080 2544 1722", upi: "printbk@upi", payee: "HKBK Student Point", delete: "5" })
  const undoSettings = useRef<(() => void) | null>(null)

  const save = () => {
    const snapshot = { samePrinter, defaultsOpen, bwTest, colourTest, extras, mixedMode, cash, upi, secretVisible, keyId, keySecret, webhook, sound, awake, textSize, rates, shop }
    undoSettings.current = () => {
      setSamePrinter(snapshot.samePrinter)
      setDefaultsOpen(snapshot.defaultsOpen)
      setBwTest(snapshot.bwTest)
      setColourTest(snapshot.colourTest)
      setExtras(snapshot.extras)
      setMixedMode(snapshot.mixedMode)
      setCash(snapshot.cash)
      setUpi(snapshot.upi)
      setSecretVisible(snapshot.secretVisible)
      setKeyId(snapshot.keyId)
      setKeySecret(snapshot.keySecret)
      setWebhook(snapshot.webhook)
      setSound(snapshot.sound)
      setAwake(snapshot.awake)
      setTextSize(snapshot.textSize)
      setRates(snapshot.rates)
      setShop(snapshot.shop)
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3500)
  }
  const updateRate = (key: keyof typeof rates, value: string) => {
    setRates((current) => ({ ...current, [key]: value }))
    save()
  }
  const updateShop = (key: keyof typeof shop, value: string) => {
    setShop((current) => ({ ...current, [key]: value }))
    save()
  }
  const updateToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>, value: boolean) => {
    setter(value)
    save()
  }

  const tabs = ["Printers", "Pricing & payment", "Razorpay keys", "Shop info", "QR & counter"]
  useEffect(() => {
    const timer = window.setTimeout(() => setScanningPrinters(false), 700)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <>
      <div className="settings-scrim" onClick={onClose} />
      <aside className="printer-settings-panel">
        <header className="settings-header">
          <div><span>SL-06</span><strong>Printer settings</strong><small>Changes save automatically</small></div>
          <button type="button" onClick={onClose} aria-label="Close printer settings">×</button>
        </header>
        <nav className="settings-tabs">{tabs.map((label, index) => <button type="button" className={tab === index ? "active" : ""} onClick={() => setTab(index)} key={label}>{label}</button>)}</nav>

        <div className="settings-content">
          {tab === 0 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>PRINTERS ON THIS PC</span><strong>Choose where each job goes</strong><p>PrintBK sends orders directly to these printers.</p></div>
              <div className={`printer-discovery ${scanningPrinters ? "loading" : ""}`}><div><i className="status-dot" /><span>{scanningPrinters ? "Looking for printers…" : "3 printers found on this PC"}</span></div><button type="button" onClick={() => { setScanningPrinters(true); window.setTimeout(() => setScanningPrinters(false), 700) }}>REFRESH</button></div>
              {[
                ["Black & White printer", "EPSON L3110 Series", bwTest, setBwTest],
                ["Colour printer", "EPSON L3110 Series", colourTest, setColourTest],
              ].map(([label, printer, result, setResult]) => (
                <section className="setting-card printer-choice" key={label as string}>
                  <div className="setting-card-title"><div><span>{label as string}</span><strong><i className="status-dot" /> Ready</strong></div><Icon name="printer" size={28} /></div>
                  <PrinterDropdownRow value={printer as string} onChange={save} onTest={() => { (setResult as React.Dispatch<React.SetStateAction<string>>)((label as string).startsWith("Colour") ? "Something is wrong" : "Printed correctly"); save() }} />
                  {result && <div className={`test-result ${result === "Printed correctly" ? "success" : "error"}`}><Icon name={result === "Printed correctly" ? "check" : "settings"} />{result as string}{result !== "Printed correctly" && <span>Check paper and try again.</span>}</div>}
                  <button className="defaults-toggle" type="button" onClick={() => setDefaultsOpen(!defaultsOpen)}>Defaults <span>{defaultsOpen ? "−" : "+"}</span></button>
                  {defaultsOpen && <div className="printer-defaults"><label>Default paper<select defaultValue="A4" onChange={save}><option>A4</option><option>A3</option><option>Legal</option></select></label><label>Tray<select defaultValue="Tray 1" onChange={save}><option>Tray 1</option><option>Rear feed</option></select></label><label>Double-sided<Toggle checked={true} onChange={() => save()} /></label><label>Flip edge<select defaultValue="Long edge" onChange={save}><option>Long edge</option><option>Short edge</option></select></label><p>Double-sided jobs only go to printers that support it.</p></div>}
                </section>
              ))}

              <div className="toggle-row"><div><strong>Use the same printer for both</strong><span>Useful when the shop has one printer.</span></div><Toggle checked={samePrinter} onChange={(value) => updateToggle(setSamePrinter, value)} /></div>

              <section className="setting-card qr-print-card">
                <div><span>SHOP QR POSTER</span><strong>Print your QR</strong><p>Students scan this to start an order.</p><Button onClick={save}>PRINT YOUR QR</Button></div>
                <div className="mini-poster"><img src="/hkbk-logo.jpg" alt="" /><QRPreview compact /><b>SCAN TO PRINT</b></div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>EXTRA PRINTERS</span><strong>Special paper and formats</strong></div></div>
                {extras.map((extra) => <div className="extra-printer" key={extra}><i className="status-dot" /><strong>{extra.split(" · ")[0]}</strong><span>{extra.split(" · ")[1]}</span><b>{extra.includes("A3") ? "A3" : "PHOTO"}</b></div>)}
                <Button onClick={() => { setExtras((current) => [...current, "Canon G3010 · Photo"]); save() }}>+ ADD PRINTER</Button>
                <p className="help-copy">Extra printer roles appear as their own order tables automatically.</p>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>MIXED COLOUR DOCUMENTS</span><strong>Choose how pages are routed</strong></div></div>
                <label className={`choice-card ${mixedMode === "split" ? "selected" : ""}`}><input type="radio" checked={mixedMode === "split"} onChange={() => { setMixedMode("split"); save() }} /><div><strong>Split between both printers</strong><span>Colour pages use the colour printer; the rest use B&amp;W, with a clear COMBINE note.</span></div></label>
                <label className={`choice-card ${mixedMode === "colour" ? "selected" : ""}`}><input type="radio" checked={mixedMode === "colour"} onChange={() => { setMixedMode("colour"); save() }} /><div><strong>Print everything on the colour printer</strong><span>The whole document stays together and uses one printer.</span></div></label>
              </section>

              <div className="agent-line"><i className="status-dot" /><div><strong>Print helper running on this PC</strong><span>Last seen 3s ago</span></div><button type="button" onClick={() => setAgentHelp(!agentHelp)}>{agentHelp ? "Hide help" : "Get help"}</button></div>
              {agentHelp && <Banner tone="info">If orders stop printing, keep this app open and restart the printer. PrintBK reconnects automatically.</Banner>}
              <details className="no-printer-help"><summary>No printers found?</summary><p>Install your printer in Windows, then refresh this list.</p></details>
            </div>
          )}

          {tab === 1 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>PRICING &amp; PAYMENT</span><strong>Simple rates students can understand</strong></div>
              <section className="setting-card">
                <div className="setting-card-title"><div><span>PRINT RATES</span><strong>Per-page pricing</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="B&W per page" value={rates.bw} type="number" suffix="₹" onChange={(value) => updateRate("bw", value)} />
                  <SettingsField label="Colour per page" value={rates.colour} type="number" suffix="₹" onChange={(value) => updateRate("colour", value)} />
                  <SettingsField label="Double-sided rate" value={rates.duplex} type="number" suffix="₹" onChange={(value) => updateRate("duplex", value)} />
                  <SettingsField label="Bulk discount after" value={rates.bulk} type="number" suffix="pages" onChange={(value) => updateRate("bulk", value)} />
                  <SettingsField label="A3 multiplier" value={rates.a3} type="number" suffix="×" onChange={(value) => updateRate("a3", value)} />
                  <SettingsField label="Legal multiplier" value={rates.legal} type="number" suffix="×" onChange={(value) => updateRate("legal", value)} />
                </div>
                <div className="addon-grid">{[["Spiral", "35"], ["Comb", "45"], ["Staple", "5"], ["Hard cover", "120"], ["Lamination", "30"]].map(([name, price]) => <label key={name}><span>{name}</span><div>₹<input defaultValue={price} onChange={save} /></div></label>)}</div>
              </section>
              <section className="student-preview"><span>WHAT THE STUDENT SEES</span><strong>20 B&amp;W pages · Double-sided</strong><div><span>Printing</span><b>₹{(20 * Number(rates.duplex || 0)).toFixed(2)}</b></div><small>Price updates immediately when the student changes settings.</small></section>
              <section className="setting-card">
                <div className="setting-card-title"><div><span>OTHER SERVICES</span><strong>Availability today</strong></div></div>
                {["Binding", "Lamination", "Scanning", "Photocopy", "Typing requests"].map((service) => <div className="toggle-row compact" key={service}><div><strong>{service}</strong><span>Not available today</span></div><Toggle checked={false} onChange={() => save()} /></div>)}
              </section>
              <section className="setting-card payment-settings">
                <div className="setting-card-title"><div><span>PAYMENTS</span><strong>Ways students can pay</strong></div></div>
                <SettingRow title="Enable Cash at Counter" help="Collect before approving the order." checked={cash} onChange={(value) => updateToggle(setCash, value)} />
                <SettingRow title="Enable UPI payment" help="UPI intent, no gateway." checked={upi} onChange={(value) => updateToggle(setUpi, value)} />
                {upi && <div className="field-grid"><SettingsField label="UPI ID" value={shop.upi} onChange={(value) => updateShop("upi", value)} /><SettingsField label="Payee name" value={shop.payee} onChange={(value) => updateShop("payee", value)} /></div>}
                <Button onClick={save}>SEND TEST PAYMENT LINK</Button>
                <p className="notice-copy">UPI payments are checked by you in your UPI app before you tap Approve &amp; Print.</p>
                <SettingRow title="Enable Razorpay Online Payment" help="Add your Razorpay keys first." checked={false} disabled onChange={() => {}} />
              </section>
            </div>
          )}

          {tab === 2 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>RAZORPAY KEYS</span><strong>Connect online payments</strong><p>Paste the three values from your Razorpay account.</p></div>
              {!keyId && <div className="keys-empty"><span className="ready-mark"><Icon name="cash" size={36} /></span><strong>No keys added yet</strong><p>Add keys below, then send one small test payment.</p></div>}
              <section className="setting-card keys-card">
                <KeyField label="Key ID" value={keyId} onChange={(value) => { setKeyId(value); save() }} />
                <label className="settings-field"><span>Key Secret</span><div><input type={secretVisible ? "text" : "password"} value={keySecret} onChange={(event) => { setKeySecret(event.target.value); save() }} /><button type="button" onClick={() => setSecretVisible(!secretVisible)}>{secretVisible ? "HIDE" : "SHOW"}</button></div></label>
                <KeyField label="Webhook Secret" value={webhook} secret onChange={(value) => { setWebhook(value); save() }} />
                {keyId && <div className={`key-badge ${keyId.startsWith("rzp_live") ? "live" : "test"}`}>{keyId.startsWith("rzp_live") ? "LIVE KEY" : "TEST KEY"}</div>}
                {keyId && !keyId.startsWith("rzp_") && <div className="test-result error"><Icon name="settings" />These keys do not look right. Copy them again from Razorpay.</div>}
              </section>
              <section className="setting-card">
                <div className="setting-card-title"><div><span>SETUP STATUS</span><strong>Four quick checks</strong></div></div>
                {["KYC done", "Keys added", "Webhook set", "Test payment done"].map((item, index) => <div className={`check-row ${index === 0 || (index === 1 && keyId) || (index === 2 && webhook) ? "done" : ""}`} key={item}><i>{index === 0 || (index === 1 && keyId) || (index === 2 && webhook) ? <Icon name="check" /> : index + 1}</i><span>{item}</span></div>)}
                <Button onClick={save} disabled={!keyId || !keySecret}>SEND TEST PAYMENT</Button>
                {keyId && keySecret && webhook && <div className="ready-state"><Icon name="check" /><div><strong>Ready to enable</strong><span>Complete one test payment to turn Razorpay on.</span></div></div>}
              </section>
            </div>
          )}

          {tab === 3 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>SHOP INFO</span><strong>What students see before ordering</strong></div>
              <section className="setting-card shop-fields">
                <SettingsField label="Shop name" value={shop.name} onChange={(value) => updateShop("name", value)} />
                <SettingsField label="Address" value={shop.address} onChange={(value) => updateShop("address", value)} />
                <SettingsField label="Opening hours" value={shop.hours} onChange={(value) => updateShop("hours", value)} />
                <SettingsField label="Contact number" value={shop.phone} onChange={(value) => updateShop("phone", value)} />
                <SettingsField label="UPI ID shown to students" value={shop.upi} onChange={(value) => updateShop("upi", value)} />
                <SettingsField label="UPI payee name" value={shop.payee} onChange={(value) => updateShop("payee", value)} />
              </section>
              <section className="setting-card delete-setting">
                <div><span>FILE PRIVACY</span><strong>Files are deleted <b>{shop.delete} minutes</b> after printing</strong><p>Choose between 1 and 30 minutes. Files are always removed after 60 minutes at most.</p></div>
                <input type="range" min="1" max="30" value={shop.delete} onChange={(event) => updateShop("delete", event.target.value)} />
                <div className="range-labels"><span>1 min</span><b>{shop.delete} min</b><span>30 min</span></div>
              </section>
            </div>
          )}

          {tab === 4 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>QR &amp; COUNTER</span><strong>Make ordering obvious</strong></div>
              <section className="setting-card shop-qr-card">
                <QRPreview /><div><span>YOUR SHOP LINK</span><strong>printbk.in/hkbk-point</strong><p>Students scan or open this link to place an order.</p></div>
              </section>
              <div className="poster-layouts">
                {["A4 wall poster", "A5 counter stand", "Table tent"].map((layout, index) => <button type="button" className={index === 0 ? "selected" : ""} onClick={save} key={layout}><div className={`poster-shape poster-${index}`}><img src="/hkbk-logo.jpg" alt="" /><QRPreview compact /><b>SCAN TO PRINT</b></div><span>{layout}</span></button>)}
              </div>
              <Button kind="primary" onClick={save}><Icon name="printer" /> PRINT POSTER</Button>
              <section className="setting-card counter-options">
                <div className="setting-card-title"><div><span>COUNTER DISPLAY</span><strong>Comfortable all day</strong></div></div>
                <label className="settings-field"><span>Text size</span><select value={textSize} onChange={(event) => { setTextSize(event.target.value); save() }}><option>Large</option><option>Extra large</option><option>Giant</option></select></label>
                <SettingRow title="New-order sound" help="Play a short tone when a table appears." checked={sound} onChange={(value) => updateToggle(setSound, value)} />
                <SettingRow title="Keep screen awake" help="Prevent this counter PC from sleeping." checked={awake} onChange={(value) => updateToggle(setAwake, value)} />
              </section>
            </div>
          )}
        </div>
        {saved && <div className="settings-saved"><Icon name="check" /><span>Saved</span><button type="button" onClick={() => { undoSettings.current?.(); setSaved(false) }}>UNDO</button></div>}
      </aside>
    </>
  )
}

function PaymentBlock({ payment, amount, order }: { payment: Payment; amount: number; order: number }) {
  return (
    <div className={`row-payment row-payment--${payment}`}>
      <span className="payment-main"><Icon name={payment === "upi" ? "eye" : payment === "cash_due" ? "cash" : "check"} size={22} />{paymentLabel[payment]} {payment !== "cash_collected" && <b>₹{amount.toFixed(2)}</b>}</span>
      {payment === "upi" && <small>Check UPI app · ref #{order} · UTR 4821</small>}
      {payment === "paid" && <small>Payment confirmed</small>}
      {payment === "cash_collected" && <small>₹{amount.toFixed(2)} received</small>}
      {payment === "cash_due" && <small>Cash before service</small>}
    </div>
  )
}

function StateChip({ state }: { state: string }) {
  return <span className={`state-chip state-chip--${state.toLowerCase().replaceAll(" ", "-").replace("/", "-")}`}>{state === "Printed" && <span className="countdown-ring">4:12</span>}{state}</span>
}

function InlineOrderDetail({ job }: { job: Job }) {
  const studentState = job.state.startsWith("Printing")
    ? "Printing 14 of 30"
    : job.state === "Printed"
      ? `Printed, show code ${job.order.toString().slice(-4)}`
      : job.payment === "upi"
        ? "Waiting for the shop to confirm your UPI payment"
        : job.state
  return (
    <div className="inline-order-detail">
      <div><span>ORDER</span><strong>#{job.order}</strong></div>
      <div><span>PRINT PLAN</span><b>{job.service === "colour" ? "Page 1 colour · Pages 2–30 B&W · Combine stacks" : job.service === "photos" ? "Photo paper · Natural colour · 8-up" : "Settings checked · Ready for direct print"}</b></div>
      <div><span>STUDENT SEES</span><b>{studentState}</b></div>
      <div><span>FILES</span><b>{job.state === "Printed" ? "Delete automatically in 4:12" : "Protected until 5 minutes after printing"}</b></div>
    </div>
  )
}

function Timeline({ job }: { job: Job }) {
  const stages = [
    ["Uploaded", "10:42"],
    [job.payment === "upi" ? "UPI claimed" : job.payment === "cash_collected" ? "Cash collected" : "Paid", "10:44"],
    ["Approved", job.state === "Preparing" || job.state === "Ready to print" ? "—" : "10:46"],
    ["Printing", job.state.startsWith("Printing") || job.state === "Printed" ? "10:47" : "—"],
    ["Printed", job.state === "Printed" ? "10:48" : "—"],
    ["Files deleted", job.state === "Files deleted" ? "10:53" : "—"],
  ]
  return <div className="detail-timeline">{stages.map(([label, time], index) => <div className={time !== "—" ? "complete" : ""} key={label}><i>{time !== "—" ? <Icon name="check" size={13} /> : index + 1}</i><span>{label}</span><b>{time}</b></div>)}</div>
}

function SheetPeek({ colour = false }: { colour?: boolean }) {
  return (
    <div className="sheet-peek">
      {[1, 2, 3, 4].map((page) => <div className={colour && page === 1 ? "is-colour" : ""} key={page}><span>{page}</span><i /><i /><i /></div>)}
      <span>+26 sheets</span>
    </div>
  )
}

function OrderDetailPanel({ job, onClose, onReject, readOnly = false }: { job: Job; onClose: () => void; onReject: (job: Job) => void; readOnly?: boolean }) {
  const [hold, setHold] = useState(false)
  const [rejectReason, setRejectReason] = useState("UPI not received")
  const holdTimer = useRef<number | undefined>(undefined)
  const isColour = job.service === "colour"
  const isPhoto = job.service === "photos"
  const isDocument = job.service === "bw" || job.service === "colour"
  const serviceConfig = tables.find((table) => table.id === job.service)
  const startReject = () => {
    setHold(true)
    holdTimer.current = window.setTimeout(() => onReject(job), 1000)
  }
  const stopReject = () => {
    setHold(false)
    window.clearTimeout(holdTimer.current)
  }
  return (
    <aside className={`order-detail-panel ${readOnly ? "read-only" : ""}`}>
      <div className="panel-handle" />
      <div className="detail-panel-top">
        <div><span>ORDER DETAILS</span><strong>#{job.order}</strong><small>Uploaded {job.uploaded}</small></div>
        <button type="button" onClick={onClose} aria-label="Close order details">×</button>
      </div>
      <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
      {(job.state !== "Preparing" && job.payment !== "cash_due") && <div className="pickup-code"><span>PICKUP CODE</span><strong>{job.order.toString().slice(-4)}</strong></div>}
      <Timeline job={job} />

      {job.payment === "upi" && (
        <section className="upi-claim">
          <div><Icon name="eye" size={26} /><strong>UPI payment claimed</strong></div>
          <p><b>₹{job.amount.toFixed(2)}</b> at <b>10:44</b>, ref <b>#{job.order}</b>, UTR ending <b>4821</b>. Check this in your UPI app, then tap Approve &amp; Print.</p>
        </section>
      )}

      <section className="detail-block">
        <div className="detail-heading"><span>{isDocument || isPhoto ? "WHAT TO PRINT" : "SERVICE DETAILS"}</span><b>{isPhoto ? "PHOTO SHEET 1" : isDocument ? "DOCUMENT 1" : serviceConfig?.title.toUpperCase()}</b></div>
        {(isDocument || isPhoto) && <div className="file-name" title={job.values[1]}>{isPhoto ? "Passport photos.jpg" : job.values[1] ?? "Student document.pdf"}</div>}
        {!isDocument && !isPhoto ? (
          <div className="spec-grid service-spec-grid">
            {serviceConfig?.columns.map((column, index) => <div key={column}><span>{column}</span><b>{job.values[index] ?? "—"}</b></div>)}
            {job.service === "lamination" && <div><span>Counter note</span><b>Student brings the original item</b></div>}
            {job.service === "typing" && <div><span>Full notes</span><b>Type from the handwritten English source and preserve paragraph breaks.</b></div>}
          </div>
        ) : isPhoto ? (
          <div className="spec-grid">
            <div><span>Preset</span><b>Passport photo</b></div><div><span>Photos</span><b>Front · 4 photos</b></div>
            <div><span>Sheet specification</span><b>A4 · 8-up · 35 × 45 mm</b></div><div><span>Paper to load</span><b>Photo paper</b></div>
          </div>
        ) : (
          <>
            <div className="spec-grid">
              <div><span>Pages</span><b>Pages 1–30 of 30</b></div><div><span>Copies</span><b>2 · Collated</b></div>
              <div><span>Sides</span><b>Double-sided · short edge</b></div><div><span>Layout</span><b>2-up · Standard</b></div>
              <div><span>Paper</span><b>A4</b></div><div><span>Total sheets</span><b>30</b></div>
            </div>
            <div className="detail-subhead">COLOUR PLAN</div>
            <div className="colour-plan">
              {Array.from({ length: 10 }, (_, index) => <PageChip page={index + 1} colour={isColour && index === 0} key={index} />)}
              <b>{isColour ? "Page 1 colour · Pages 2–30 B&W" : "All B&W"}</b>
            </div>
            <OrientationNote title="All landscape slides" note="Pages 2–3 are portrait, fitted automatically. Page 7 was rotated by the student. Blank pages removed." />
          </>
        )}
      </section>

      {isDocument && (
        <section className="detail-block">
          <div className="detail-heading"><span>HOW IT WILL PRINT</span><b>READ ONLY</b></div>
          <p className="plain-instruction">{isColour ? "Colour page 1: Colour printer, Tray 1. B&W pages 2–30: B&W printer. COMBINE: colour page 1 goes on top of the B&W stack." : "Everything goes directly to the B&W printer, Tray 1."}</p>
          <div className="final-instruction">Double-sided, short edge · <b>2 copies</b> · Collated</div>
        </section>
      )}

      {job.linked && (
        <section className="detail-block">
          <div className="detail-heading"><span>SERVICES</span><b>LINKED ORDER</b></div>
          <div className="linked-service"><Icon name="bind" /><div><strong>Spiral binding · 8 mm</strong><span>Clear front · Black back · Linked document #{job.order}</span></div><StateChip state={job.state === "Printed" ? "Ready to bind" : "Waiting for print"} /></div>
        </section>
      )}

      <section className="detail-block">
        <div className="detail-heading"><span>PEEK</span><b>EXACT SHEETS · READ ONLY</b></div>
        <SheetPeek colour={isColour || isPhoto} />
      </section>

      <section className="detail-block print-flow-block">
        <div className="detail-heading"><span>PRINT FLOW &amp; AUTO-DELETE</span><b>LIVE</b></div>
        <div className="flow-sequence">
          {[
            ["Order arrives", "Table appears for a new service"],
            ["Approve & Print", "One action beside the order"],
            ["Printing", "Page 14 of 30 · Copy 1 of 2"],
            ["PRINTED ✓", "Green confirmation for 3 seconds"],
            ["Row leaves", "Empty table collapses and the grid reflows"],
            ["Recently printed", "Files delete in 5:00 · Print again available"],
            ["Files deleted", "Document 1 remains in History"],
          ].map(([state, note]) => <div className={(job.state.startsWith("Printing") && state === "Printing") || (job.state.startsWith("PRINTED") && state === "PRINTED ✓") ? "current" : ""} key={state}><i /><span>{state}</span><small>{note}</small></div>)}
        </div>
        {isColour && <div className="combine-note"><span>COMBINE</span> Colour part 1/2 printed · B&W part 2/2 printing · Place colour page 1 on top.</div>}
        <div className="error-states"><span>RECOVERY STATES</span>{["Paper jam", "Out of paper", "Printer offline", "Bad file"].map((error) => <b key={error}>{error}</b>)}</div>
        <p className="deleted-note">After deletion: “Files deleted, ask the student to upload again.” The print button is removed.</p>
      </section>

      <section className="price-receipt">
        <div className="detail-heading"><span>PRICE</span><b>RECEIPT</b></div>
        {isDocument ? <><div><span>B&amp;W pages · 29 × ₹1.50</span><b>₹43.50</b></div><div><span>Colour pages · 1 × ₹8.00</span><b>₹8.00</b></div><div><span>Second copy</span><b>₹51.50</b></div></> : <div><span>{serviceConfig?.title} · 1 service</span><b>₹{job.amount.toFixed(2)}</b></div>}
        <div className="receipt-total"><span>TOTAL</span><b>₹{job.amount.toFixed(2)}</b></div>
      </section>

      <div className="student-sees"><i /><span>STUDENT SEES</span><strong>{job.state.startsWith("Printing") ? "Printing 14 of 30" : job.state === "Printed" ? `Printed, show code ${job.order.toString().slice(-4)}` : job.payment === "upi" ? "Waiting for the shop to confirm your UPI payment" : job.state}</strong></div>
      {!readOnly && <div className="reject-area">
        <select value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}><option>UPI not received</option><option>Student left without paying</option></select>
        <button type="button" className={hold ? "holding" : ""} onPointerDown={startReject} onPointerUp={stopReject} onPointerLeave={stopReject}>PRESS &amp; HOLD 1 SECOND TO REJECT</button>
        <small>The student is notified immediately. You can undo for 5 seconds.</small>
      </div>}
    </aside>
  )
}

const todayHistory = [
  { order: 1019, time: "10:14", code: "4821", files: "Document 1", pages: 40, colour: "B&W", payment: "cash_collected" as Payment, amount: 86, status: "Printed", speed: "8m 12s" },
  { order: 1020, time: "10:19", code: "1194", files: "Document 1 · Document 2", pages: 24, colour: "B&W", payment: "upi" as Payment, amount: 34, status: "Printed", speed: "6m 04s" },
  { order: 1021, time: "10:22", code: "7318", files: "Document 1", pages: 30, colour: "Mixed colour", payment: "upi" as Payment, amount: 128, status: "Printed", speed: "5m 48s" },
  { order: 1022, time: "10:23", code: "3084", files: "Photo sheet 1", pages: 2, colour: "Colour", payment: "paid" as Payment, amount: 96, status: "Printed", speed: "4m 10s" },
  { order: 1014, time: "09:48", code: "5520", files: "Document 1", pages: 12, colour: "B&W", payment: "cash_due" as Payment, amount: 18, status: "Cancelled", speed: "—" },
  { order: 1011, time: "09:31", code: "2028", files: "Document 1", pages: 6, colour: "Colour", payment: "upi" as Payment, amount: 48, status: "Rejected", speed: "2m 18s" },
  { order: 1008, time: "08:56", code: "8834", files: "Document 1", pages: 18, colour: "B&W", payment: "paid" as Payment, amount: 27, status: "Expired", speed: "—" },
]

function Sparkline({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${index * 19},${38 - value}`).join(" ")
  return <svg className="sparkline" viewBox="0 0 115 42" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" /><line x1="0" y1="40" x2="115" y2="40" stroke="currentColor" strokeWidth="1" /></svg>
}

function TodayView({ onHistory }: { onHistory: () => void }) {
  const [compare, setCompare] = useState(true)
  const [dayOffset, setDayOffset] = useState(0)
  const [summarySent, setSummarySent] = useState(false)
  const dayLabels = ["Sunday, 23 June", "Monday, 24 June", "Tuesday, 25 June"]
  const hours = [2, 4, 5, 7, 9, 11, 14, 12, 8, 7, 5, 3, 1]
  const services = [["Printing", 41], ["Binding", 12], ["Lamination", 9], ["Scanning", 7], ["Photocopy", 6], ["Photos", 4]]
  return (
    <main className="today-page">
      <div className="today-head">
        <div><span className="eyebrow">SL-07 · TODAY</span><div className="today-date-nav"><button type="button" onClick={() => setDayOffset(Math.max(-1, dayOffset - 1))}>←</button><strong>{dayLabels[dayOffset + 1]}</strong><button type="button" onClick={() => setDayOffset(Math.min(1, dayOffset + 1))}>→</button><button type="button" onClick={() => setDayOffset(0)}><Icon name="calendar" /></button></div></div>
        <div className="today-head-actions"><label>Compare with yesterday <Toggle checked={compare} onChange={setCompare} /></label><Button onClick={onHistory}>ORDERS HISTORY</Button></div>
      </div>

      <section className="kpi-grid">
        {[
          ["Collected", "₹3,240", "+12%", [10, 18, 13, 22, 27, 31]],
          ["Orders", "41", "+6", [6, 12, 9, 20, 24, 29]],
          ["Pages printed", "624", "+18%", [8, 15, 17, 23, 20, 33]],
          ["Average wait", "6m 42s", "−1m 08s", [30, 26, 25, 19, 17, 13]],
        ].map((kpi, index) => <KpiTile key={kpi[0] as string} label={kpi[0] as string} value={kpi[1] as string} change={kpi[2] as string} spark={kpi[3] as number[]} lime={index === 0} />)}
      </section>

      <div className="analytics-grid">
        <section className="analytics-card payment-breakdown">
          <div className="analytics-title"><div><span>PAYMENTS</span><strong>How students paid</strong></div><b>₹3,240</b></div>
          <div className="stacked-bar"><i style={{ width: "34%" }} /><i style={{ width: "66%" }} /></div>
          <div className="bar-legend"><span><i />Cash <b>₹1,102</b></span><span><i />UPI <b>₹2,138</b></span><span className="disabled"><i />Razorpay <b>Not enabled yet</b></span></div>
          <div className="payment-alerts"><div className="verify-alert"><Icon name="eye" /><span>UPI TO VERIFY</span><b>3</b></div><div className="cash-list"><span>CASH STILL TO COLLECT</span><div><b>#1026</b><strong>₹35.00</strong></div><div><b>#1023</b><strong>₹40.00</strong></div></div></div>
        </section>

        <section className="analytics-card print-mix">
          <div className="analytics-title"><div><span>PRINT MIX</span><strong>Pages and paper</strong></div></div>
          <div className="metric-bar"><div><span>B&amp;W</span><b>488 pages</b></div><i><b style={{ width: "78%" }} /></i><small>Colour · 136 pages</small></div>
          <div className="metric-bar"><div><span>Double-sided</span><b>68%</b></div><i><b style={{ width: "68%" }} /></i><small>Single-sided · 32%</small></div>
          <div className="paper-saved"><Icon name="layers" size={30} /><div><span>PAPER SAVED TODAY</span><strong>186 sheets</strong><small>Double-sided and multi-up layouts</small></div></div>
        </section>

        <section className="analytics-card hourly-chart">
          <div className="analytics-title"><div><span>ORDERS BY HOUR</span><strong>Peak 1 to 2 PM, 14 orders</strong></div></div>
          <div className="hour-bars">{hours.map((value, index) => <div key={index} title={`${index + 8}:00 — ${value} orders`}><i className={value === 14 ? "peak" : ""} style={{ height: `${value * 8}px` }} /><span>{index + 8 > 12 ? `${index - 4}P` : `${index + 8}A`}</span></div>)}</div>
        </section>

        <section className="analytics-card service-mix">
          <div className="analytics-title"><div><span>SERVICE MIX</span><strong>Ranked by orders</strong></div></div>
          {services.map(([name, value], index) => <div className="rank-row" key={name}><b>{index + 1}</b><span>{name}</span><i><strong style={{ width: `${Number(value) / 41 * 100}%` }} /></i><em>{value}</em></div>)}
        </section>

        <section className="analytics-card privacy-card">
          <div className="analytics-title"><div><span>PRIVACY</span><strong>Automatic file deletion</strong></div><Icon name="check" size={28} /></div>
          <div><span>Files auto-deleted</span><b>52 of 52</b></div><div><span>Average time to deletion</span><b>5 min 12 s</b></div><div><span>Deletion failures</span><b>0</b></div>
        </section>

        <section className="analytics-card insights-card">
          <div className="analytics-title"><div><span>INSIGHTS</span><strong>Three useful things</strong></div></div>
          <p>Colour orders peaked just before the 1 PM class.</p><p>Double-sided printing saved 186 sheets today.</p><p>Average wait improved by 1 minute 8 seconds.</p>
          <div className="goal-strip"><div><span>DAILY GOAL</span><b>₹3,240 of ₹4,000</b></div><i><b style={{ width: "81%" }} /></i><strong>81%</strong></div>
        </section>
      </div>

      <section className="day-summary-wrap">
        <div className="day-summary-copy"><span className="eyebrow">PRINTABLE DAY SUMMARY</span><strong>Close the counter with one clean sheet.</strong><p>Prints directly on the selected shop printer.</p><Button kind="primary" onClick={() => { setSummarySent(true); window.setTimeout(() => setSummarySent(false), 3000) }}><Icon name="printer" /> {summarySent ? "SENT TO PRINTER" : "PRINT DAY SUMMARY"}</Button></div>
        <article className="day-summary-sheet">
          <div className="summary-logo"><img src="/hkbk-logo.jpg" alt="" /><div><strong>PrintBK</strong><span>HKBK Student Point</span></div></div>
          <div className="summary-sheet-title">DAY SUMMARY <b>24·06·2024</b></div>
          {[["Total collected", "₹3,240"], ["Cash for drawer", "₹1,102"], ["Online total", "₹2,138"], ["Orders", "41"], ["Pages", "624"], ["Services", "34"], ["Peak hour", "1–2 PM"], ["Deletion compliance", "52 / 52"]].map(([label, value]) => <div className="summary-receipt-row" key={label}><span>{label}</span><b>{value}</b></div>)}
          <small>Printed from the PrintBK counter app</small>
        </article>
      </section>
    </main>
  )
}

function HistoryPayment({ payment }: { payment: Payment }) {
  return <span className={`history-payment history-payment--${payment}`}><Icon name={payment === "upi" ? "eye" : payment === "cash_due" ? "cash" : "check"} size={16} />{payment === "upi" ? "UPI VERIFY" : payment === "paid" ? "PAID ONLINE" : payment === "cash_due" ? "CASH DUE" : "CASH PAID"}</span>
}

function HistoryView({ onBack, onOpen }: { onBack: () => void; onOpen: (job: Job) => void }) {
  const [search, setSearch] = useState("")
  const [range, setRange] = useState("Today")
  const [mode, setMode] = useState("All print")
  const [pay, setPay] = useState("All payments")
  const [loading, setLoading] = useState(false)
  const refresh = (setter: () => void) => { setLoading(true); setter(); window.setTimeout(() => setLoading(false), 450) }
  const rows = todayHistory.filter((row) => (`${row.order} ${row.code}`.includes(search.trim())) && (mode === "All print" || row.colour.includes(mode)) && (pay === "All payments" || row.payment === pay))
  const openRow = (row: typeof todayHistory[number]) => onOpen({ key: `history-${row.order}`, order: row.order, service: row.colour === "Colour" ? "colour" : "bw", uploaded: `${row.time} · ${row.speed}`, payment: row.payment, amount: row.amount, state: row.status, values: [row.time, row.files, `1–${row.pages} of ${row.pages}`, "1", "Double · long edge", "1-up", "A4", "Fitted automatically", `${Math.ceil(row.pages / 2)}`], detail: `Pickup code ${row.code}. Read-only history record.` })
  return (
    <main className="history-page">
      <div className="history-head"><div><button type="button" onClick={onBack}>← TODAY</button><span className="eyebrow">SL-08</span><div className="page-title">Orders history</div></div><div className="history-total"><span>TOTAL SHOWN</span><b>₹{rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)}</b></div></div>
      <div className="history-tools">
        <label className="history-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or pickup code" /></label>
        <select value={range} onChange={(event) => refresh(() => setRange(event.target.value))}><option>Today</option><option>Yesterday</option><option>7 days</option></select>
        <select value={mode} onChange={(event) => refresh(() => setMode(event.target.value))}><option>All print</option><option>B&W</option><option>Colour</option></select>
        <select value={pay} onChange={(event) => refresh(() => setPay(event.target.value))}><option>All payments</option><option value="cash_collected">Cash</option><option value="upi">UPI</option><option value="paid">Online</option></select>
      </div>
      <section className="history-table">
        <div className="history-table-head"><span>Order #</span><span>Time</span><span>Files</span><span>Pages</span><span>Colour mode</span><span>Payment</span><span>Amount</span><span>Status</span><span>Time to print</span></div>
        {loading && <div className="history-state"><i /><strong>Loading orders…</strong></div>}
        {!loading && rows.length === 0 && <div className="history-state"><span className="ready-mark"><Icon name="search" size={30} /></span><strong>No orders found</strong><p>Try another order number, pickup code, or filter.</p></div>}
        {!loading && rows.map((row) => <button className="history-row" type="button" key={row.order} onClick={() => openRow(row)}><strong>#{row.order}</strong><span>{row.time}</span><span title={row.files}>{row.files}</span><b>{row.pages}</b><span>{row.colour}</span><HistoryPayment payment={row.payment} /><b>₹{row.amount.toFixed(2)}</b><span className={`history-status status-${row.status.toLowerCase()}`}>{row.status}</span><b>{row.speed}</b></button>)}
        {!loading && rows.length > 0 && <footer><span>{rows.length} orders</span><strong>FOOTER TOTAL</strong><b>₹{rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)}</b></footer>}
      </section>
    </main>
  )
}

function OwnerPhoneView({
  jobs,
  payments,
  recentlyPrinted,
  shopOpen,
  setShopOpen,
  onAction,
}: {
  jobs: Job[]
  payments: Record<number, Payment>
  recentlyPrinted: RecentPrint[]
  shopOpen: boolean
  setShopOpen: (open: boolean) => void
  onAction: (job: Job, type: "cash" | "primary") => void
}) {
  const [tab, setTab] = useState<"orders" | "today">("orders")
  const [service, setService] = useState<Service>("bw")
  const [online, setOnline] = useState(true)
  const [loadingService, setLoadingService] = useState(false)
  const services = tables.map((table) => ({ ...table, count: jobs.filter((job) => job.service === table.id).length })).filter((table) => table.count > 0)
  const visible = jobs.filter((job) => job.service === service).map((job) => ({ ...job, payment: payments[job.order] ?? job.payment }))
  const nextUp = jobs.map((job) => ({ ...job, payment: payments[job.order] ?? job.payment })).find((job) => !job.disabled && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE"))
  const printed = recentlyPrinted.length > 0 ? recentlyPrinted : [{
    job: { ...initialJobs[0], key: "owner-printed", order: 1014, state: "Printed" },
    pickup: "5520",
    printedAt: "2 min ago",
    expiresAt: Date.now() + 180000,
  }]
  const actionLabel = (job: Job) => {
    const config = tables.find((table) => table.id === job.service)
    if (job.payment === "cash_due" && config?.action !== "quote") return "COLLECT CASH"
    if (config?.action === "done") return "DONE"
    if (config?.action === "quote") return job.state === "Quote sent" ? "DONE" : "SEND QUOTE"
    return ["Paper jam", "Out of paper", "Printer offline", "Bad file"].includes(job.state) ? "RETRY PRINT" : "APPROVE & PRINT"
  }
  useEffect(() => {
    if (services.length > 0 && !services.some((item) => item.id === service)) setService(services[0].id)
  }, [services, service])
  return (
    <div className="owner-phone">
      <header className="owner-topbar">
        <div className="owner-brand"><img src="/hkbk-logo.jpg" alt="HKBK Group of Institutions" /><strong>PrintBK</strong></div>
        <button className={`owner-shop-switch ${shopOpen ? "open" : ""}`} type="button" onClick={() => setShopOpen(!shopOpen)}><i /><span>{shopOpen ? "OPEN" : "CLOSED"}</span></button>
        <button className={`owner-live ${online ? "" : "offline"}`} type="button" onClick={() => setOnline(!online)}><i /><span>{online ? "LIVE" : "OFFLINE"}</span></button>
        <div className="owner-printer-dots" aria-label="Both printers online"><i /><i /></div>
      </header>

      {!online && <div className="owner-offline"><Icon name="settings" /><div><strong>Shop connection is offline</strong><span>Showing the last orders received. Actions will send when the connection returns.</span></div></div>}
      {tab === "orders" ? (
        <main className="owner-orders">
          <div className="owner-page-head"><span>SL-09 · OWNER VIEW</span><strong>Shop orders</strong><small>First uploaded stays at the top.</small></div>
          <nav className="owner-service-switcher">
            {services.map((item) => <button type="button" key={item.id} className={service === item.id ? "active" : ""} onClick={() => { setLoadingService(true); setService(item.id); window.setTimeout(() => setLoadingService(false), 350) }}><Icon name={item.icon} /><span>{item.title.replace(" Documents", "").replace(" & Custom Requests", "")}</span><b>{item.count}</b></button>)}
          </nav>
          {services.length > 0 && <div className="owner-service-title"><div><span>{tables.find((table) => table.id === service)?.title}</span><strong>{visible.length} waiting</strong></div><small>{tables.find((table) => table.id === service)?.meta}</small></div>}
          {visible.some((job) => ["Paper jam", "Out of paper", "Printer offline", "Bad file"].includes(job.state)) && <div className="owner-error"><Icon name="settings" /><div><strong>Printer needs attention</strong><span>{visible.find((job) => ["Paper jam", "Out of paper", "Printer offline", "Bad file"].includes(job.state))?.state}. Use Retry Print on the order.</span></div></div>}
          {loadingService && <div className="owner-loading"><Skeleton /></div>}
          {!loadingService && visible.length === 0 && <div className="owner-empty"><span className="ready-mark"><Icon name="check" size={30} /></span><strong>Nothing waiting here</strong><p>New orders will appear automatically.</p></div>}
          {!loadingService && <div className="owner-order-list">
            {visible.map((job) => {
              const config = tables.find((table) => table.id === job.service)
              return <article className="owner-order-card" key={job.key}>
                <div className="owner-card-top">
                  <div className="owner-order-action"><strong>#{job.order}</strong><Button kind={job.key === nextUp?.key ? "primary" : "plain"} disabled={job.disabled || !online} onClick={() => onAction(job, job.payment === "cash_due" && config?.action !== "quote" ? "cash" : "primary")}>{actionLabel(job)}</Button></div>
                  <div className="owner-card-meta"><span>Uploaded {job.uploaded}</span><span>Pickup <b>{pickupCodes[job.order] ?? "4821"}</b></span><span>Amount <b>₹{job.amount.toFixed(2)}</b></span></div>
                </div>
                <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
                <div className="owner-fields">
                  {config?.columns.slice(0, 5).map((column, fieldIndex) => <div key={column}><span>{column}</span><b title={job.values[fieldIndex]}>{job.values[fieldIndex] ?? "—"}</b></div>)}
                </div>
              </article>
            })}
          </div>}
          <section className="owner-printed">
            <div className="owner-section-head"><span>PRINTED</span><b>{printed.length}</b></div>
            {printed.map((item) => <div className="owner-printed-row" key={item.job.key}><div><strong>#{item.job.order}</strong><span>Code {item.pickup} · {item.printedAt}</span></div><b><Countdown expiresAt={item.expiresAt} deleted={item.job.state === "Files deleted"} /></b></div>)}
          </section>
        </main>
      ) : (
        <main className="owner-today">
          <div className="owner-page-head"><span>TODAY · MONDAY 24 JUNE</span><strong>Shop at a glance</strong><small>Live from HKBK Student Point.</small></div>
          <article className="owner-collected"><span>COLLECTED TODAY</span><strong>₹3,240</strong><b>+12% vs yesterday</b><Sparkline values={[10, 18, 13, 22, 27, 31]} /></article>
          <article className="owner-story-card"><span>CASH VS ONLINE</span><div className="owner-pay-bar"><i /><b /></div><div className="owner-pay-labels"><span>Cash <b>₹1,102</b></span><span>Online <b>₹2,138</b></span></div><small>Razorpay not enabled yet</small></article>
          <div className="owner-stat-pair"><article><span>ORDERS</span><strong>41</strong><small>6 more than yesterday</small></article><article><span>PAGES</span><strong>624</strong><small>488 B&amp;W · 136 colour</small></article></div>
          <article className="owner-story-card owner-hours"><span>ORDERS BY HOUR</span><strong>Peak 1 to 2 PM · 14 orders</strong><div>{[2,4,5,7,9,11,14,12,8,7,5,3,1].map((value, index) => <i key={index} className={value === 14 ? "peak" : ""} style={{ height: `${value * 6}px` }} title={`${index + 8}:00 · ${value} orders`} />)}</div><footer><span>8A</span><span>2P</span><span>8P</span></footer></article>
          <article className="owner-story-card owner-privacy"><Icon name="check" /><div><span>FILES AUTO-DELETED</span><strong>52 of 52</strong><small>No deletion failures</small></div></article>
        </main>
      )}
      {tab === "orders" && nextUp && <div className="owner-next-up"><div><span>NEXT UP</span><strong>#{nextUp.order}</strong><small>{tables.find((table) => table.id === nextUp.service)?.title} · {paymentLabel[nextUp.payment]}</small></div><Button kind="primary" disabled={!online} onClick={() => onAction(nextUp, nextUp.payment === "cash_due" && tables.find((table) => table.id === nextUp.service)?.action !== "quote" ? "cash" : "primary")}>{actionLabel(nextUp)}</Button></div>}
      <nav className="owner-bottom-tabs"><button type="button" className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}><Icon name="printer" /><span>Orders</span></button><button type="button" className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><Icon name="calendar" /><span>Today</span></button></nav>
    </div>
  )
}

function ServiceTable({
  config,
  jobs,
  selected,
  expanded,
  nextKey,
  onSelect,
  onAction,
}: {
  config: TableConfig
  jobs: Job[]
  selected: string
  expanded: string
  nextKey: string
  onSelect: (key: string) => void
  onAction: (job: Job, action: "cash" | "primary") => void
}) {
  return (
    <section className={`service-table service-table--${config.id}`}>
      <TableTitleBar config={config} count={jobs.length} />
      <div className="table-scroll">
        <div className="table-head compact-head"><span>Pos.</span><span>Order #</span><span>Payment</span><span>Control</span><span>Amount</span></div>
        {jobs.map((job, index) => (
          <div key={job.key} className={`job-wrap ${selected === job.key ? "is-selected" : ""} ${index === jobs.length - 1 ? "is-new" : ""} ${job.state.startsWith("PRINTED") || job.state.startsWith("DONE") ? "is-complete" : ""}`}>
            <div className="job-row" role="button" tabIndex={0} onClick={() => onSelect(job.key)}>
              <div className="position"><i /><b>{index + 1}</b></div>
              <div className="row-order"><strong>#{job.order}</strong>{job.linked && <span>SAME ORDER</span>}</div>
              <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
              <div className="row-controls">
                {job.payment === "cash_due" && config.action !== "quote" && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE") && <ActionButton action="cash" primary={job.key === nextKey} onClick={(event) => { event.stopPropagation(); onAction(job, "cash") }} />}
                {(job.payment !== "cash_due" || config.action === "quote") && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE") && (
                  <ActionButton action={config.action === "print" ? (["Paper jam", "Out of paper", "Printer offline", "Bad file"].includes(job.state) ? "retry" : "print") : config.action === "quote" ? (job.state === "Quote sent" ? "done" : "quote") : "done"} primary={job.key === nextKey} disabled={job.disabled} onClick={(event) => { event.stopPropagation(); onAction(job, "primary") }} />
                )}
                {(job.state.startsWith("Sending") || job.state.startsWith("Printing")) && <div className="printing-progress"><span>{job.state}</span><i><b /></i><small>Page 14 of 30</small></div>}
                {(job.state.startsWith("PRINTED") || job.state.startsWith("DONE")) && <div className="printed-flash">{job.state}</div>}
              </div>
              <div className="row-amount">₹{job.amount.toFixed(2)}</div>
              <div className="detail-chip-line">
                <StateChip state={job.state} />
                {config.columns.map((column, valueIndex) => <span className="detail-chip" key={`${job.key}-${column}`} title={job.values[valueIndex]}><b>{column}</b>{job.values[valueIndex] ?? "—"}</span>)}
                {config.id === "colour" && <span className="combine-chip">COMBINE · Colour page 1 goes on top</span>}
              </div>
            </div>
            {expanded === job.key && <InlineOrderDetail job={job} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function ComponentsPage() {
  const [demoKey, setDemoKey] = useState("rzp_test_123456789")
  const rowStates = ["Paid online", "UPI paid verify", "Cash not collected", "Cash collected", "Preparing", "Ready to print", "Printing", "Printed", "Waiting for print", "Waiting too long", "Selected"]
  const colors = [
    ["Paper", "var(--paper)"], ["Sand", "var(--sand)"], ["Sand deep", "var(--sand-deep)"], ["Ink", "var(--ink)"], ["Ink 2", "var(--ink-2)"], ["Muted", "var(--muted)"], ["Line", "var(--line)"], ["Electric lime", "var(--lime)"], ["Lime text", "var(--lime-text)"], ["Success", "var(--success)"], ["Success tint", "var(--success-tint)"], ["Warning", "var(--warning)"], ["Warning tint", "var(--warning-tint)"], ["Error", "var(--error)"], ["Error tint", "var(--error-tint)"], ["Info", "var(--info)"], ["Info tint", "var(--info-tint)"],
  ]
  return (
    <main className="components-page">
      <div className="components-hero"><div><span className="eyebrow">POLISH PASS 1</span><div className="component-page-title">PrintBK components</div><p>Production foundations and states used across counter, tablet, and owner views.</p></div><div><b>SL-COMP</b><span>PAPER &amp; INK · LIGHT ONLY</span></div></div>

      <section className="component-section">
        <div className="component-section-title"><span>01</span><div><strong>Foundations</strong><p>Every visual decision starts here.</p></div></div>
        <div className="token-title">COLOUR VARIABLES</div>
        <div className="color-token-grid">{colors.map(([name, value]) => <div key={name}><i style={{ background: value }} /><strong>{name}</strong><span>{value.replace("var(", "").replace(")", "")}</span></div>)}</div>
        <div className="foundation-grid">
          <div><div className="token-title">SPACING VARIABLES</div><div className="spacing-tokens">{[4, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((space) => <div key={space}><i style={{ width: space }} /><b>{space}</b></div>)}</div></div>
          <div><div className="token-title">RADIUS VARIABLES</div><div className="radius-tokens">{[["Chip", 999], ["Input", 10], ["Card", 14], ["Panel", 18]].map(([label, radius]) => <div key={label as string} style={{ borderRadius: radius as number }}><span>{label as string}</span><b>{radius === 999 ? "Pill" : `${radius}px`}</b></div>)}</div></div>
        </div>
        <div className="token-title">TEXT STYLES</div>
        <div className="type-specimens">
          <div className="type-display">Display / Space Grotesk 72</div><div className="type-order">#1019 · Order / JetBrains Mono 56</div><div className="type-amount">₹3,240.00 · Amount / Mono 40</div><div className="type-payment">UPI PAID, VERIFY · Status 26</div><div className="type-file">Mechanics Unit 3 notes.pdf · File 20</div><div className="type-body">Counter body / Inter 16 minimum</div>
        </div>
      </section>

      <section className="component-section">
        <div className="component-section-title"><span>02</span><div><strong>Shell &amp; status</strong><p>Shared awareness at every size.</p></div></div>
        <div className="component-shell-row"><div className="brand"><img src="/hkbk-logo.jpg" alt="" /><div><strong>PrintBK</strong><span>COUNTER</span></div></div><button className="shop-switch is-open" type="button"><span className="switch-track"><span /></span><b>SHOP OPEN</b></button><LiveIndicator /><LiveIndicator offline /><PrinterPill role="B&W" name="EPSON L3110" /><PrinterPill role="COLOUR" name="EPSON L3110" online={false} /></div>
        <div className="component-grid two"><div className="component-specimen"><span>TABLE TITLE BAR</span><TableTitleBar config={tables[0]} count={2} /></div><div className="component-specimen"><span>BANNERS</span><Banner tone="warning">Check your UPI app before approving.</Banner><Banner tone="error">Printer offline. Orders stay safe.</Banner></div></div>
      </section>

      <section className="component-section">
        <div className="component-section-title"><span>03</span><div><strong>Payment &amp; actions</strong><p>Payment remains the loudest row element.</p></div></div>
        <div className="payment-specimens">{(["paid", "upi", "cash_due", "cash_collected"] as Payment[]).map((payment) => <PaymentBlock key={payment} payment={payment} amount={86} order={1019} />)}</div>
        <div className="button-specimens">
          <div><span>COLLECT CASH</span><ActionButton action="cash" /></div>
          <div><span>APPROVE / DEFAULT</span><ActionButton action="print" primary /></div>
          <div><span>PRESSED</span><ActionButton action="print" primary pressed /></div>
          <div><span>DISABLED</span><ActionButton action="print" primary disabled /></div>
          <div><span>RETRY</span><ActionButton action="retry" primary /></div>
        </div>
        <div className="helper-row"><ChangeHelper received={100} change={14} /><div className="keycap-demo"><KeycapHint keyName="Enter">Approve selected row</KeycapHint><KeycapHint keyName="C">Collect cash</KeycapHint></div></div>
      </section>

      <section className="component-section">
        <div className="component-section-title"><span>04</span><div><strong>Service rows</strong><p>One component, every payment and workflow state.</p></div></div>
        <div className="row-state-grid">{rowStates.map((state, index) => <div className={`component-row ${state === "Selected" ? "selected" : ""}`} key={state}><div><strong>#{1019 + index}</strong><span>{state}</span></div><StateChip state={state} /><div className={`mini-payment mini-payment-${index % 4}`}>{["PAID ONLINE", "UPI VERIFY", "CASH DUE", "CASH PAID"][index % 4]}</div><Button kind={index === 5 ? "primary" : "plain"} disabled={state === "Waiting for print"}>{state === "Printing" ? "PRINTING 14/30" : "APPROVE & PRINT"}</Button></div>)}</div>
        <div className="component-grid two">
          <div className="component-specimen"><span>COLOUR-PLAN PAGE CHIPS</span><div className="colour-plan">{Array.from({ length: 10 }, (_, index) => <PageChip page={index + 1} colour={index === 0 || index === 4} key={index} />)}<b>2 colour pages · 8 B&amp;W</b></div></div>
          <div className="component-specimen"><span>ORIENTATION NOTE</span><OrientationNote /></div>
          <div className="component-specimen"><span>FILE LINE &amp; FINISHING TAG</span><FileLine name="Mechanics Unit 3 notes.pdf" meta="40 pages · 2 copies" tag="SPIRAL 8 MM" /></div>
          <div className="component-specimen"><span>PRINTED COMPACT ROW</span><PrintedCompactRow order={1019} code="4821" expiresAt={Date.now() + 252000} /></div>
        </div>
        <div className="component-specimen full"><span>EXPANDED ORDER DETAILS</span><InlineOrderDetail job={initialJobs[2]} /></div>
      </section>

      <section className="component-section">
        <div className="component-section-title"><span>05</span><div><strong>Settings &amp; forms</strong><p>Calm controls with immediate feedback.</p></div></div>
        <div className="component-specimen full"><span>PRINTER SETTINGS TABS</span><nav className="settings-tabs component-tabs">{["Printers", "Pricing & payment", "Razorpay keys", "Shop info", "QR & counter"].map((label, index) => <button className={index === 0 ? "active" : ""} type="button" key={label}>{label}</button>)}</nav></div>
        <div className="component-grid two">
          <div className="component-specimen"><span>PRINTER DROPDOWN ROW + TEST</span><PrinterDropdownRow value="EPSON L3110 Series" onTest={() => {}} /></div>
          <div className="component-specimen"><span>SETTING ROW</span><SettingRow title="New-order sound" help="Play one short tone." checked={true} onChange={() => {}} /></div>
          <div className="component-specimen"><span>KEY FIELD</span><KeyField label="Razorpay Key ID" value={demoKey} onChange={setDemoKey} /></div>
          <div className="component-specimen"><span>WIZARD STEP</span><WizardStep number={2} title="Choose your printers" state="Step 2 of 3 · In progress" /></div>
        </div>
      </section>

      <section className="component-section">
        <div className="component-section-title"><span>06</span><div><strong>Feedback, data &amp; loading</strong><p>Consistent signals across every screen.</p></div></div>
        <div className="component-grid three">
          <div className="component-specimen"><span>KPI TILE</span><KpiTile label="Collected" value="₹3,240" change="+12%" spark={[10,18,13,22,27,31]} lime /></div>
          <div className="component-specimen"><span>CHART CARD</span><ChartCard eyebrow="ORDERS BY HOUR" title="Peak at 1 PM"><div className="mini-chart">{[4,8,6,12,9,14,7].map((value) => <i key={value} style={{ height: value * 6 }} />)}</div></ChartCard></div>
          <div className="component-specimen"><span>SKELETON</span><Skeleton /></div>
        </div>
        <div className="component-grid two">
          <div className="component-specimen"><span>TABLE ROW</span><button className="history-row component-history-row" type="button"><strong>#1019</strong><span>10:14</span><span>Document 1</span><b>40</b><span>B&amp;W</span><HistoryPayment payment="upi" /><b>₹86.00</b><span className="history-status status-printed">Printed</span><b>8m 12s</b></button></div>
          <div className="component-specimen"><span>UNDO TOAST</span><div className="component-toast"><Icon name="check" /><span>Cash collected for #1019</span><button type="button">UNDO</button><i /></div></div>
        </div>
      </section>

      <section className="handoff-cover">
        <img src="/hkbk-logo.jpg" alt="HKBK Group of Institutions" /><div><span>PRINTBK STAFF APP</span><strong>Counter operations, without admin work.</strong><p>Version 1.0 · 24 June 2024 · Paper &amp; Ink</p></div>
      </section>
      <section className="component-section">
        <div className="component-section-title"><span>07</span><div><strong>File organization &amp; prototype flows</strong><p>Handoff index, named frames, and implementation rules.</p></div></div>
        <div className="page-index">{["Cover", "Design System", "Components", "Staff Desktop 1920", "Staff Desktop 1440", "Staff Tablet", "Staff Mobile", "Prototype Flows"].map((page, index) => <div key={page}><b>{String(index + 1).padStart(2, "0")}</b><span>{page}</span></div>)}</div>
        <div className="frame-index">{["SL-01 · First-run pairing", "SL-02 · Orders", "SL-03 · States", "SL-04 · Order details", "SL-05 · Print flow", "SL-06 · Printer settings", "SL-07 · Today", "SL-08 · Orders history", "SL-09 · Owner phone"].map((frame) => <span key={frame}>{frame}</span>)}</div>
        <div className="flow-diagram">
          {["Student orders", "Appears live in service lane", "Staff approves", "Prints directly", "Student ticket updates", "Files delete after 5 minutes"].map((step, index) => <div key={step}><i>{index + 1}</i><strong>{step}</strong>{index < 5 && <span>→</span>}</div>)}
        </div>
        <div className="tap-audit"><div><span>PAID PATH</span><strong>1 tap</strong><p>Approve &amp; Print</p></div><div><span>CASH PATH</span><strong>2 taps</strong><p>Collect Cash → Approve &amp; Print</p></div></div>
        <div className="dev-notes">
          {[
            "One-time pairing only. No login after setup.",
            "SL-02 has one first-come service table for B&W, Colour, Photos, Binding, Lamination, Scanning, Photocopy, and Typing or custom requests; tables appear only when occupied.",
            "Print tables are tied to shop printers. Files are prepared in the background, so approval is instant.",
            "Order controls are limited to Collect Cash, Approve & Print, Done, and Send Quote. Reject exists only inside details and requires a one-second hold.",
            "UPI PAID, VERIFY means the shop checks its own UPI app; Approve & Print is the verification.",
            "Cash collection is per order and updates linked service rows.",
            "Approve & Print sends the student's settings directly to the printer. There is no download, open-file action, print dialog, or confirmation popup.",
            "Files delete five minutes after printing and always within sixty minutes. Pickup code appears only after payment or cash collection.",
            "Wait status turns amber at five minutes and red at ten minutes.",
            "Mixed colour jobs route colour pages to Colour and the rest to B&W with a COMBINE note, unless the shop chooses all-colour routing.",
            "Student orientation, fitting, blank-page removal, and page rotations are applied before printing.",
            "The student ticket updates live as the counter app advances.",
            "Today totals: collected is completed cash plus verified UPI and online payments; orders count unique completed orders; pages count printed output pages; wait is upload-to-printed time; paper saved compares output sheets with single-sided 1-up sheets.",
            "Privacy rule: store no student name, phone number, or email.",
          ].map((note) => <p key={note}>{note}</p>)}
        </div>
      </section>
    </main>
  )
}

function SetupFlow({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(1)
  const [code, setCode] = useState("")
  const [tested, setTested] = useState(false)
  return (
    <main className="pairing-flow">
      <div className="pairing-brand"><img src="/hkbk-logo.jpg" alt="HKBK Group of Institutions" /><div><strong>PrintBK</strong><span>COUNTER SETUP</span></div></div>
      <div className="pairing-progress">{[1,2,3].map((item) => <div className={item <= step ? "active" : ""} key={item}><i>{item < step ? <Icon name="check" /> : item}</i><span>{item === 1 ? "Connect" : item === 2 ? "Printers" : "Ready"}</span></div>)}</div>
      <section className="pairing-card">
        {step === 1 && <><span className="eyebrow">STEP 1 OF 3</span><div className="pairing-title">Connect this PC to your shop</div><p>Enter the one-time setup code shown in the owner view.</p><KeyField label="SHOP SETUP CODE" value={code} onChange={setCode} /><Button kind="primary" disabled={code.length < 4} onClick={() => setStep(2)}>CONNECT SHOP</Button></>}
        {step === 2 && <><span className="eyebrow">STEP 2 OF 3</span><div className="pairing-title">Choose your printers</div><p>Files will print directly with the student's settings.</p><PrinterDropdownRow value="EPSON L3110 Series" onTest={() => setTested(true)} /><PrinterDropdownRow value="EPSON L3110 Series" onTest={() => setTested(true)} />{tested && <Banner tone="info">Test page printed correctly.</Banner>}<Button kind="primary" onClick={() => setStep(3)}>CONTINUE</Button></>}
        {step === 3 && <><span className="ready-mark"><Icon name="check" size={36} /></span><div className="pairing-title">You’re ready</div><p>HKBK Student Point is paired. The app will open directly on Orders from now on.</p><div className="pairing-summary"><span>Black &amp; White</span><b>EPSON L3110</b><span>Colour</span><b>EPSON L3110</b></div><Button kind="primary" onClick={onFinish}>OPEN SHOP</Button></>}
      </section>
      <small>No login is needed after this one-time pairing.</small>
    </main>
  )
}

export default function App() {
  const [shopOpen, setShopOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<"orders" | "today" | "history" | "components">(() => new URLSearchParams(window.location.search).get("view") === "components" && import.meta.env.DEV ? "components" : "orders")
  const [historyJob, setHistoryJob] = useState<Job | null>(null)
  const [phoneOwnerView, setPhoneOwnerView] = useState(() => window.matchMedia("(max-width: 520px)").matches)
  const [showSetup, setShowSetup] = useState(() => window.localStorage.getItem("printbk-paired") !== "true")
  const [jobs, setJobs] = useState(initialJobs)
  const [payments, setPayments] = useState<Record<number, Payment>>(() => Object.fromEntries(initialJobs.map((job) => [job.order, job.payment])))
  const [selected, setSelected] = useState(initialJobs[0]?.key ?? "")
  const [expanded, setExpanded] = useState("")
  const [toast, setToast] = useState<{ message: string; action?: string; job?: Job; restore?: { jobs: Job[]; payments: Record<number, Payment> } } | null>(null)
  const [searching, setSearching] = useState(false)
  const [orderSearch, setOrderSearch] = useState("")
  const [serviceFilter, setServiceFilter] = useState<"all" | Service>("all")
  const [paymentFilter, setPaymentFilter] = useState<"all" | Payment>("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [recentOpen, setRecentOpen] = useState(false)
  const [recentlyPrinted, setRecentlyPrinted] = useState<RecentPrint[]>([])
  const previousServices = useRef(tables.filter((table) => initialJobs.some((job) => job.service === table.id)).length)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const handleSetJobs = (event: CustomEvent<Job[]>) => {
      if (Array.isArray(event.detail)) {
        setJobs(event.detail)
        setPayments(Object.fromEntries(event.detail.map((job) => [job.order, job.payment])))
        if (event.detail[0]) setSelected(event.detail[0].key)
      }
    }
    window.addEventListener("printbk-set-jobs", handleSetJobs as EventListener)
    return () => window.removeEventListener("printbk-set-jobs", handleSetJobs as EventListener)
  }, [])

  const displayJobs = useMemo(() => jobs.map((job) => ({ ...job, payment: payments[job.order] ?? job.payment })), [jobs, payments])
  const filteredJobs = useMemo(() => displayJobs.filter((job) => {
    const query = orderSearch.trim().toLowerCase()
    const matchesSearch = !query || `${job.order} ${pickupCodes[job.order] ?? ""} ${job.values.join(" ")}`.toLowerCase().includes(query)
    const matchesService = serviceFilter === "all" || job.service === serviceFilter
    const matchesPayment = paymentFilter === "all" || job.payment === paymentFilter
    const matchesStatus = statusFilter === "all" || (statusFilter === "ready" ? job.state.includes("Ready") : statusFilter === "waiting" ? job.state.includes("Waiting") || job.state === "Preparing" : job.state.includes("Printing") || job.state.includes("Sending"))
    return matchesSearch && matchesService && matchesPayment && matchesStatus
  }), [displayJobs, orderSearch, serviceFilter, paymentFilter, statusFilter])
  const selectedJob = displayJobs.find((job) => job.key === selected)
  const visibleTables = tables.filter((table) => filteredJobs.some((job) => job.service === table.id))
  const occupiedTablesCount = tables.filter((table) => displayJobs.some((job) => job.service === table.id)).length
  const nextUp = displayJobs.find((job) => !job.disabled && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE"))

  useEffect(() => {
    if (occupiedTablesCount > previousServices.current) {
      try {
        const context = audioRef.current ?? new window.AudioContext()
        audioRef.current = context
        if (context.state === "suspended") void context.resume()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 660
        gain.gain.value = 0.035
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.09)
      } catch {
        // the new-order sound is optional
      }
    }
    previousServices.current = occupiedTablesCount
  }, [occupiedTablesCount])

  const action = (job: Job, type: "cash" | "primary") => {
    const restore = { jobs, payments }
    if (type === "cash") {
      setPayments((current) => ({ ...current, [job.order]: "cash_collected" }))
      setToast({ message: `Cash collected for #${job.order} · linked rows updated`, action: "UNDO", restore })
      return
    }
    if (job.service === "typing") {
      if (job.state === "Quote sent") {
        setJobs((current) => current.map((item) => item.key === job.key ? { ...item, state: `DONE ✓ #${job.order}` } : item))
        window.setTimeout(() => setJobs((current) => current.filter((item) => item.key !== job.key)), 3000)
      } else {
        setJobs((current) => current.map((item) => item.key === job.key ? { ...item, state: "Quote sent" } : item))
      }
      return
    }
    const isPrint = job.service === "bw" || job.service === "colour" || job.service === "photos"
    setJobs((current) => current.map((item) => item.key === job.key ? { ...item, state: isPrint ? "Sending to EPSON L3110" : `DONE ✓ #${job.order}` } : item))
    if (isPrint) {
      window.setTimeout(() => setJobs((current) => current.map((item) => item.key === job.key ? { ...item, state: "Printing 14/30" } : item)), 700)
      window.setTimeout(() => {
        setJobs((current) => current.map((item) => {
          if (item.key === job.key) return { ...item, state: `PRINTED ✓ #${job.order}` }
          if (item.order === job.order && item.state === "Waiting for print") return { ...item, state: "Ready to bind", disabled: false }
          return item
        }))
        setRecentlyPrinted((current) => [{ job: { ...job, state: "Printed" }, pickup: pickupCodes[job.order] ?? "4821", printedAt: "Just now", expiresAt: Date.now() + 300000 }, ...current])
        setToast({ message: `Printed #${job.order}, show code ${pickupCodes[job.order] ?? "4821"}. Files delete in 5:00`, action: "PRINT AGAIN", job })
        window.setTimeout(() => setJobs((current) => current.filter((item) => item.key !== job.key)), 3000)
      }, 2600)
      window.setTimeout(() => setRecentlyPrinted((current) => current.map((item) => item.job.key === job.key ? { ...item, job: { ...item.job, state: "Files deleted", values: item.job.values.map((value, index) => index === 1 ? "Document 1" : value) } } : item)), 300000)
      window.setTimeout(() => setRecentlyPrinted((current) => current.filter((item) => item.job.key !== job.key)), 303000)
    } else {
      window.setTimeout(() => setJobs((current) => current.filter((item) => item.key !== job.key)), 3000)
    }
  }

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)")
    const update = () => setPhoneOwnerView(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (view !== "orders" || phoneOwnerView) return
      const target = event.target as HTMLElement | null
      const typing = !!target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      if (typing || settingsOpen || historyJob || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "Enter" && target?.closest("button, a")) return
      if (event.key === "/") { event.preventDefault(); setSearching(true); return }
      if (displayJobs.length === 0) return
      const index = displayJobs.findIndex((job) => job.key === selected)
      if (event.key === "ArrowDown") setSelected(displayJobs[Math.min(index + 1, displayJobs.length - 1)].key)
      if (event.key === "ArrowUp") setSelected(displayJobs[Math.max(index - 1, 0)].key)
      if (event.key === "Tab") {
        event.preventDefault()
        const serviceIndex = tables.findIndex((table) => table.id === (serviceFilter === "all" ? visibleTables[0]?.id ?? "bw" : serviceFilter))
        const next = tables[(serviceIndex + 1) % tables.length].id
        setServiceFilter(next)
        const first = displayJobs.find((job) => job.service === next)
        if (first) setSelected(first.key)
      }
      if ((event.key === "c" || event.key === "C") && nextUp?.payment === "cash_due") action(nextUp, "cash")
      if (event.key === "Enter" && nextUp) action(nextUp, nextUp.payment === "cash_due" ? "cash" : "primary")
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  })

  const chooseRow = (key: string) => {
    setSelected(key)
    setExpanded((current) => current === key ? "" : key)
  }

  const rejectOrder = (job: Job) => {
    const restore = { jobs, payments }
    setJobs((current) => current.filter((item) => item.order !== job.order))
    setExpanded("")
    setToast({ message: `#${job.order} cancelled · student notified`, action: "UNDO", restore })
  }

  const printAgain = (job: Job) => {
    if (!jobs.some((item) => item.key === job.key)) setJobs((current) => [...current, { ...job, state: "Ready to print" }])
    setRecentOpen(false)
    setToast(null)
  }

  if (showSetup) return <SetupFlow onFinish={() => { window.localStorage.setItem("printbk-paired", "true"); setShowSetup(false) }} />
  if (phoneOwnerView) return <OwnerPhoneView jobs={jobs} payments={payments} recentlyPrinted={recentlyPrinted} shopOpen={shopOpen} setShopOpen={setShopOpen} onAction={action} />

  return (
    <div className={`app-shell view-${view}`}>
      <Header open={shopOpen} setOpen={setShopOpen} onOrders={() => { setView("orders"); setHistoryJob(null) }} onToday={() => { setView("today"); setExpanded(""); setHistoryJob(null) }} onSettings={() => { setExpanded(""); setHistoryJob(null); setSettingsOpen(true) }} />
      {view === "orders" && <>
      <main className={`orders-board ${expanded ? "has-detail-panel" : ""}`}>
        <div className="board-heading">
          <div><span className="eyebrow">LIVE ORDERS · {displayJobs.length} WAITING</span><div className="page-title">First in. First out.</div></div>
          <div className="keyboard-help"><span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Tab</kbd> next table</span><span><kbd>C</kbd> cash</span><span><kbd>Enter</kbd> print</span><span><kbd>/</kbd> search</span></div>
        </div>
        <div className="orders-toolbar">
          <label className="orders-search"><Icon name="search" /><input autoFocus={searching} value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} onBlur={() => setSearching(false)} placeholder="Order number, pickup code or file" /></label>
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as "all" | Payment)}><option value="all">All payments</option><option value="paid">Paid online</option><option value="upi">UPI verify</option><option value="cash_due">Cash due</option><option value="cash_collected">Cash collected</option></select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready</option><option value="waiting">Waiting</option><option value="printing">Printing</option></select>
          <div className="recent-wrap">
            <button className="recent-button" type="button" onClick={() => setRecentOpen(!recentOpen)}><span>RECENTLY PRINTED</span><b>{recentlyPrinted.length}</b></button>
            {recentOpen && <div className="recent-dropdown"><div className="recent-title"><strong>Recently printed</strong><span>FILES RETAINED FOR 5 MINUTES</span></div>{recentlyPrinted.length === 0 && <p>Nothing printed in the last 5 minutes.</p>}{recentlyPrinted.map((item) => <div className="recent-item" key={item.job.key}><div><strong>#{item.job.order}</strong><span>CODE {item.pickup} · {item.printedAt}</span><b><Countdown expiresAt={item.expiresAt} deleted={item.job.state === "Files deleted"} /></b></div>{item.job.state !== "Files deleted" && <Button onClick={() => printAgain(item.job)}>PRINT AGAIN</Button>}</div>)}</div>}
          </div>
        </div>
        <div className="orders-service-filters"><button type="button" className={serviceFilter === "all" ? "active" : ""} onClick={() => setServiceFilter("all")}>ALL <b>{displayJobs.length}</b></button>{tables.filter((table) => displayJobs.some((job) => job.service === table.id)).map((table) => <button type="button" className={serviceFilter === table.id ? "active" : ""} onClick={() => setServiceFilter(table.id)} key={table.id}>{table.title} <b>{displayJobs.filter((job) => job.service === table.id).length}</b></button>)}</div>
        {visibleTables.length === 0 ? <div className="all-caught-up"><span className="ready-mark"><Icon name={displayJobs.length === 0 ? "check" : "search"} size={42} /></span><strong>{displayJobs.length === 0 ? "All caught up" : "No matching orders"}</strong><p>{displayJobs.length === 0 ? "New orders will appear here automatically." : "Clear or change the filters above."}</p></div> : <div className={`tables-grid tables-grid--${visibleTables.length}`}>
          {visibleTables.map((table) => (
            <ServiceTable
              key={table.id}
              config={table}
              jobs={filteredJobs.filter((job) => job.service === table.id)}
              selected={selected}
              expanded={expanded}
              nextKey={nextUp?.key ?? ""}
              onSelect={chooseRow}
              onAction={action}
            />
          ))}
        </div>}
      </main>
      {expanded && selectedJob && <OrderDetailPanel job={selectedJob} onClose={() => setExpanded("")} onReject={rejectOrder} />}
      </>}
      {view === "today" && <TodayView onHistory={() => setView("history")} />}
      {view === "history" && <HistoryView onBack={() => { setView("today"); setHistoryJob(null) }} onOpen={setHistoryJob} />}
      {view === "components" && <ComponentsPage />}
      {historyJob && <OrderDetailPanel job={historyJob} readOnly onClose={() => setHistoryJob(null)} onReject={() => {}} />}
      {settingsOpen && <PrinterSettingsPanel onClose={() => setSettingsOpen(false)} />}
      {!shopOpen && <div className="closed-overlay"><div><span>SHOP CLOSED</span><strong>Orders are paused</strong><p>Open the shop from the top bar when you’re ready.</p></div></div>}
      {view === "orders" && nextUp && <div className="next-up-bar"><div className="next-label">NEXT UP</div><div className="next-order">#{nextUp.order}</div><div className="next-summary"><strong>{tables.find((table) => table.id === nextUp.service)?.title} · {nextUp.values[2] ?? nextUp.values[0]}</strong><span>{nextUp.payment === "upi" ? "Check your UPI app, then approve & print" : paymentLabel[nextUp.payment]}</span></div><Button kind="primary" onClick={() => action(nextUp, nextUp.payment === "cash_due" ? "cash" : "primary")}>{nextUp.payment === "cash_due" ? <>COLLECT CASH <kbd>C</kbd></> : tables.find((table) => table.id === nextUp.service)?.action === "done" ? "DONE" : tables.find((table) => table.id === nextUp.service)?.action === "quote" ? nextUp.state === "Quote sent" ? "DONE" : "SEND QUOTE" : <>APPROVE &amp; PRINT <kbd>↵</kbd></>}</Button></div>}
      {toast && <FeedbackToast message={toast.message} action={toast.action} onAction={() => { if (toast.action === "PRINT AGAIN" && toast.job) printAgain(toast.job); if (toast.action === "UNDO" && toast.restore) { setJobs(toast.restore.jobs); setPayments(toast.restore.payments); setToast(null) } }} />}
    </div>
  )
}
