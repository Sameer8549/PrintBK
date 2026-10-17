import React, { useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  isStaffPaired,
  pairStaffDevice,
  collectCash,
  approvePrintItem,
  retryPrintItem,
  markItemDone,
  quoteItem,
  rejectOrder,
  undoAction,
  fetchTodayAnalytics,
  fetchHistoryOrders,
  fetchShopSettings,
  updateShopSettings,
  testPrintPrinter,
  printQrPrinter,
  addStaffPrinter,
  purgeStaleOrders,
} from "./api/client"
import { useStaffLive, LiveItem, LivePrinter, LiveShop, LiveRecentlyPrinted } from "./api/useStaffLive"
import { downloadQrPdf, previewQrPdf } from "./qrPosterPdf"

export type Payment = "paid" | "upi" | "cash_due" | "cash_collected"
export type Service =
  | "bw"
  | "colour"
  | "photos"
  | "binding"
  | "lamination"
  | "scanning"
  | "photocopy"
  | "typing"

export type Job = {
  key: string
  order: number
  orderId: number
  service: Service
  uploaded: string
  payment: Payment
  amount: number
  state: string
  linked?: boolean
  disabled?: boolean
  values: string[]
  detail: string
  pickup_code: string
  rawStatus: string
  created_at?: string
  payment_time?: string
  printed_at?: string
  delete_after?: string
  files_deleted_at?: string
  payload?: any
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
  key: string
  order: number
  pickup: string
  printedAt: string
  expiresAt: number
  deleted: boolean
  job: Job
}

const tables: TableConfig[] = [
  {
    id: "bw",
    title: "Black & White Documents",
    icon: "printer",
    meta: "B&W PRINTER",
    columns: ["Uploaded", "Documents", "Pages", "Copies", "Sides", "Layout", "Paper", "Orientation", "Sheets"],
    action: "print",
  },
  {
    id: "colour",
    title: "Colour Documents",
    icon: "colour",
    meta: "COLOUR PRINTER",
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
    meta: "SERVICE COUNTER",
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

const paymentLabel: Record<Payment, string> = {
  paid: "PAID ONLINE",
  upi: "UPI PAID, VERIFY",
  cash_due: "COLLECT",
  cash_collected: "CASH COLLECTED",
}

function mapKindToService(kind: string): Service {
  switch (kind) {
    case "document_bw":
    case "bw":
      return "bw"
    case "document_colour":
    case "colour":
      return "colour"
    case "photo":
    case "photos":
      return "photos"
    case "binding":
      return "binding"
    case "lamination":
      return "lamination"
    case "scanning":
      return "scanning"
    case "photocopy":
      return "photocopy"
    case "typing_request":
    case "typing":
      return "typing"
    default:
      return "bw"
  }
}

function mapPaymentStatus(status: string): Payment {
  switch (status) {
    case "paid_online":
    case "paid_verified":
    case "paid":
      return "paid"
    case "upi_claimed":
    case "upi":
      return "upi"
    case "pending_cash":
    case "cash_due":
      return "cash_due"
    case "cash_collected":
      return "cash_collected"
    default:
      return "cash_due"
  }
}

function formatUploadedWait(isoDate?: string): string {
  if (!isoDate) return "Just now"
  try {
    const d = new Date(isoDate)
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    const diffMinutes = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
    if (diffMinutes === 0) return `${timeStr} · just now`
    return `${timeStr} · waiting ${diffMinutes}m`
  } catch {
    return "Just now"
  }
}

function formatTimeAgo(isoDate?: string): string {
  if (!isoDate) return "Just now"
  try {
    const d = new Date(isoDate)
    const diffMinutes = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
    if (diffMinutes === 0) return "Just now"
    return `${diffMinutes}m ago`
  } catch {
    return "Just now"
  }
}

function formatTimeOnly(isoDate?: string): string {
  if (!isoDate) return "—"
  try {
    const d = new Date(isoDate)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  } catch {
    return "—"
  }
}

function mapStatusToDisplay(item: LiveItem): string {
  switch (item.status) {
    case "preparing":
      return "Preparing"
    case "ready_to_print":
      return "Ready to print"
    case "sending":
      return "Sending to printer"
    case "printing":
      return item.pages_total ? `Printing ${item.pages_done}/${item.pages_total}` : "Printing"
    case "printed":
      return "PRINTED ✓"
    case "failed":
      return item.payload?.errorCode ? `Error: ${item.payload.errorCode}` : "Printer error"
    case "waiting_for_print":
      return "Waiting for print"
    case "ready_to_bind":
      return "Ready to bind"
    case "done":
      return "DONE ✓"
    case "quote_waiting":
      return "Waiting for quote"
    case "quote_sent":
      return "Quote sent"
    case "quote_accepted":
      return "Quote accepted"
    case "expired":
      return "Expired"
    case "cancelled":
      return "Cancelled"
    case "rejected":
      return "Rejected"
    default:
      return item.status
  }
}

function mapLiveItemToJob(item: LiveItem): Job {
  const service = mapKindToService(item.kind)
  const payment = mapPaymentStatus(item.payment_status)
  const state = mapStatusToDisplay(item)
  const pld = item.payload || {}

  // If item already contains structured values array (e.g. injected in test fixtures), use it
  let values: string[] = []
  if (Array.isArray(pld.values) && pld.values.length > 0) {
    values = pld.values
  } else {
    const uploadedStr = formatUploadedWait(item.created_at)
    const docName = pld.fileName || pld.originalFilename || (item as any).title || (pld.files && pld.files[0]?.name) || "Document"
    const docCount = pld.fileCount || (pld.files && pld.files.length) || 1
    const fileLabel = `${docName} · ${docCount} file${docCount > 1 ? "s" : ""}`

    switch (service) {
      case "bw":
        values = [
          uploadedStr,
          fileLabel,
          pld.pageRange || (pld.pagesTotal ? `1–${pld.pagesTotal} of ${pld.pagesTotal}` : "—"),
          String(pld.copies || 1),
          pld.duplex ? (pld.flipEdge === "short" ? "Double · short edge" : "Double · long edge") : "Single",
          pld.pagesPerSheet ? `${pld.pagesPerSheet}-up` : "1-up",
          pld.paperSize || "A4",
          pld.orientation || "Portrait",
          String(pld.totalSheets || Math.ceil((pld.pagesTotal || 1) / (pld.duplex ? 2 : 1))),
        ]
        break
      case "colour":
        values = [
          uploadedStr,
          fileLabel,
          pld.pageRange || (pld.pagesTotal ? `1–${pld.pagesTotal} of ${pld.pagesTotal}` : "—"),
          pld.colourPagesSummary || (pld.colourPagesCount ? `Colour: ${pld.colourPagesCount} pages` : "All colour"),
          String(pld.copies || 1),
          pld.duplex ? (pld.flipEdge === "short" ? "Double · short edge" : "Double · long edge") : "Single",
          pld.pagesPerSheet ? `${pld.pagesPerSheet}-up` : "1-up",
          pld.paperSize || "A4",
          pld.orientation || "Portrait",
          String(pld.totalSheets || Math.ceil((pld.pagesTotal || 1) / (pld.duplex ? 2 : 1))),
        ]
        break
      case "photos":
        values = [
          uploadedStr,
          pld.preset || "Photo print",
          pld.photoCount ? `${pld.photoCount} photos` : "1 photo",
          pld.sheetLayout || "A4 · Standard",
          String(pld.copies || 1),
          pld.paperType || "Photo paper",
          pld.colourMode || "Natural colour",
        ]
        break
      case "binding":
        values = [
          pld.linkedDocName || (item.linked_print_item_id ? `Linked #${item.order_number}` : "Walk-in"),
          pld.bindingType || "Spiral",
          pld.size || "Standard",
          pld.cover || "Standard cover",
          String(pld.copies || 1),
          item.status === "waiting_for_print" ? "Waiting for print" : "Ready to bind",
        ]
        break
      case "lamination":
        values = [
          pld.itemType || "Original document",
          String(pld.quantity || 1),
          pld.finish || "Glossy",
          pld.thickness || "Standard",
          pld.studentBrings || "Original item",
        ]
        break
      case "scanning":
        values = [
          pld.mode || "Document",
          String(pld.pages || 1),
          pld.outputFormat || "Single PDF",
        ]
        break
      case "photocopy":
        values = [
          String(pld.pages || 1),
          String(pld.copies || 1),
          pld.colour ? "Colour" : "B&W",
          pld.duplex ? "Double · long edge" : "Single",
          pld.paperSize || "A4",
        ]
        break
      case "typing":
        values = [
          pld.title || "Custom request",
          pld.notes || "—",
          pld.urgency || "Today",
          item.price > 0 ? `₹${item.price.toFixed(2)}` : "Not quoted",
          item.status === "quote_sent" ? "Quote sent" : item.status === "quote_accepted" ? "Quote accepted" : "Waiting for quote",
        ]
        break
    }
  }

  const detail = pld.detail || `Order #${item.order_number}. Pickup code ${item.pickup_code}.`

  return {
    key: item.id,
    order: item.order_number,
    orderId: item.order_id,
    service,
    uploaded: formatUploadedWait(item.created_at),
    payment,
    amount: item.price,
    state,
    linked: !!item.linked_print_item_id,
    disabled: item.status === "waiting_for_print",
    values,
    detail,
    pickup_code: item.pickup_code,
    rawStatus: item.status,
    created_at: item.created_at,
    printed_at: item.printed_at,
    delete_after: item.delete_after,
    files_deleted_at: item.files_deleted_at,
    payload: pld,
  }
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

function Button({ children, onClick, kind = "plain", disabled = false, className = "", style, title }: { children: React.ReactNode; onClick?: (event: React.MouseEvent) => void; kind?: "primary" | "plain" | "ghost"; disabled?: boolean; className?: string; style?: React.CSSProperties; title?: string }) {
  return <button className={`button button--${kind} ${className}`} type="button" onClick={onClick} disabled={disabled} style={style} title={title}>{children}</button>
}

function LiveIndicator({ offline = false }: { offline?: boolean }) {
  return <div className={`live-status ${offline ? "is-offline" : ""}`}><i /><span><b>{offline ? "OFFLINE" : "LIVE"}</b><small>{offline ? "Waiting to reconnect" : "Connected"}</small></span></div>
}

function PrinterPill({ role, name, online = true }: { role: string; name: string; online?: boolean }) {
  return <div className={`printer-pill ${online ? "" : "is-offline"}`}><i /><span><small>{role}</small>{name}</span></div>
}

function TableTitleBar({ config, count, meta }: { config: TableConfig; count: number; meta?: string }) {
  return <div className="service-title"><div className="service-symbol"><Icon name={config.icon} size={24} /></div><div><strong>{config.title}</strong><span>{meta || config.meta}</span></div><b>{count}</b></div>
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

function ActionButton({
  action,
  primary = false,
  disabled = false,
  pressed = false,
  loading = false,
  onClick,
}: {
  action: "cash" | "print" | "retry" | "done" | "quote"
  primary?: boolean
  disabled?: boolean
  pressed?: boolean
  loading?: boolean
  onClick?: (event: React.MouseEvent) => void
}) {
  const labels = { cash: "COLLECT CASH", print: "APPROVE & PRINT", retry: "RETRY PRINT", done: "DONE", quote: "SEND QUOTE" }
  return (
    <Button
      kind={primary ? "primary" : "plain"}
      disabled={disabled || loading}
      className={pressed ? "is-forced-pressed" : ""}
      onClick={onClick}
    >
      {loading ? "WORKING…" : labels[action]}
      {!loading && action === "cash" && <kbd>C</kbd>}
      {!loading && (action === "print" || action === "retry") && <kbd>↵</kbd>}
    </Button>
  )
}

function PageChip({ page, colour = false }: { page: number; colour?: boolean }) {
  return <span className={colour ? "colour-page" : ""}>P{page}</span>
}

function OrientationNote({ title = "Standard layout", note = "Fitted automatically based on student document layout." }: { title?: string; note?: string }) {
  return <div className="orientation-card"><div className="sheet-illustration"><span>1</span><i /></div><div><span>ORIENTATION PER PAGE</span><b>{title}</b><p>{note}</p></div></div>
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

function PrinterDropdownRow({
  value,
  printers = [],
  onSelect,
  onTest,
}: {
  value: string
  printers?: LivePrinter[]
  onSelect?: (printerName: string) => void
  onTest: () => void
}) {
  const [addingCustom, setAddingCustom] = useState(false)
  const [customName, setCustomName] = useState("")

  const handleCustomSubmit = () => {
    if (customName.trim()) {
      onSelect?.(customName.trim())
      setAddingCustom(false)
      setCustomName("")
    }
  }

  return (
    <div className="printer-select-row-wrap" style={{ width: "100%" }}>
      <div className="printer-select-row">
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === "__custom__") {
              setAddingCustom(true)
            } else {
              onSelect?.(e.target.value)
            }
          }}
        >
          {printers.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name} ({p.online ? "Online" : "Offline"})
            </option>
          ))}
          {value && !printers.some((p) => p.name === value) && (
            <option value={value}>{value} (Configured)</option>
          )}
          <option value="__custom__">+ Add / Type printer name…</option>
        </select>
        <Button onClick={onTest}>TEST PRINT</Button>
      </div>
      {addingCustom && (
        <div className="custom-printer-input" style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            placeholder="Type printer name (e.g. EPSON L3110 Series, Canon G3010)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            style={{ flex: 1, padding: "8px 12px", border: "2px solid var(--ink)", borderRadius: 8, fontSize: 14 }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit()
              if (e.key === "Escape") setAddingCustom(false)
            }}
          />
          <Button kind="primary" onClick={handleCustomSubmit} style={{ minHeight: 44, padding: "0 14px" }}>SAVE</Button>
          <Button kind="ghost" onClick={() => setAddingCustom(false)} style={{ minHeight: 44, padding: "0 12px" }}>CANCEL</Button>
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, change, spark, lime = false }: { label: string; value: string; change: string; spark: number[]; lime?: boolean }) {
  return <article className={`kpi-tile ${lime ? "lime" : ""}`}><span>{label}</span><strong>{value}</strong><Sparkline values={spark} /><b>{change} <small>vs yesterday</small></b></article>
}

function FeedbackToast({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return <div className="toast"><span>{message}</span>{action && <Button kind="ghost" onClick={onAction}>{action}</Button>}<i /></div>
}

function Header({
  open,
  setOpen,
  closedSince,
  printers,
  online,
  onSettings,
  onToday,
  onOrders,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  closedSince?: number | null
  printers: LivePrinter[]
  online: boolean
  onSettings: () => void
  onToday: () => void
  onOrders: () => void
}) {
  const [sound, setSound] = useState(true)
  const bwPrinter = printers.find((p) => p.role === "bw") || printers[0]
  const colourPrinter = printers.find((p) => p.role === "colour") || printers[1] || bwPrinter

  const closedText = closedSince
    ? `CLOSED SINCE ${new Date(closedSince * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : "SHOP CLOSED"

  return (
    <header className="topbar">
      <div className="brand" role="button" tabIndex={0} onClick={onOrders}>
        <img src="./hkbk-logo.jpg" alt="HKBK Group of Institutions" />
        <div><strong>PrintBK</strong><span>COUNTER</span></div>
      </div>
      <button className={`shop-switch ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen(!open)} title={open ? "Click to pause/close shop" : "Click to open shop"}>
        <span className="switch-track"><span /></span><b>{open ? "SHOP OPEN" : closedText}</b>
      </button>
      <LiveIndicator offline={!online} />
      <div className="printer-pills">
        {bwPrinter && <PrinterPill role="B&W" name={bwPrinter.name} online={bwPrinter.online} />}
        {colourPrinter && <PrinterPill role="COLOUR" name={colourPrinter.name} online={colourPrinter.online} />}
      </div>
      <nav className="nav-actions">
        <Button kind="ghost" className={sound ? "is-active" : ""} onClick={() => setSound(!sound)}>
          <Icon name="volume" /><span>{sound ? "Sound on" : "Sound off"}</span>
        </Button>
        <Button kind="ghost" onClick={onToday}><Icon name="analytics" /><span>Today</span></Button>
        <Button kind="ghost" onClick={onSettings}><Icon name="settings" /><span>Settings</span></Button>
      </nav>
    </header>
  )
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`setting-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><i /><span>{checked ? "On" : "Off"}</span></button>
}

function RealQRCode({ text, size = 180, className = "" }: { text: string; size?: number; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string>("")

  useEffect(() => {
    QRCode.toDataURL(text, {
      margin: 1,
      width: size * 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0b1020", light: "#c8f031" },
    })
      .then((url) => setDataUrl(url))
      .catch(() => {})
  }, [text, size])

  if (!dataUrl) {
    return <div className={`qr-preview ${className}`} style={{ width: size, height: size }} />
  }

  return (
    <div className={`real-qr-wrap ${className}`} style={{ width: size, height: size, display: "inline-block" }}>
      <img src={dataUrl} alt="Scan to start order" style={{ width: "100%", height: "100%", display: "block", borderRadius: 8 }} />
    </div>
  )
}

function QrPosterModal({
  open,
  onClose,
  shopName = "HKBK Student Point",
  address = "HKBK College Campus, Bengaluru",
  studentUrl,
  printers = [],
  rates = {},
}: {
  open: boolean
  onClose: () => void
  shopName?: string
  address?: string
  studentUrl: string
  printers?: LivePrinter[]
  rates?: any
}) {
  const [copied, setCopied] = useState(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>("")
  const [printingStatus, setPrintingStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (printers && printers.length > 0) {
      const onlinePrinter = printers.find((p) => p.online)
      setSelectedPrinterId(onlinePrinter ? String(onlinePrinter.id) : String(printers[0].id))
    }
  }, [printers])

  if (!open) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(studentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrintToPrinter = async () => {
    if (!selectedPrinterId) {
      alert("No printer selected. You can download or preview the A4 vector PDF directly.")
      return
    }
    try {
      setBusy(true)
      setPrintingStatus("Sending print job to counter printer via agent...")
      await printQrPrinter(selectedPrinterId)
      setPrintingStatus("Sent to printer successfully! ✓")
      setTimeout(() => setPrintingStatus(null), 4000)
    } catch (err: any) {
      setPrintingStatus(`Printing error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDownloadPdf = async () => {
    try {
      setBusy(true)
      await downloadQrPdf(studentUrl, { name: shopName, address, rates })
    } catch (err: any) {
      alert("Failed to download PDF: " + err.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePreviewPdf = async () => {
    try {
      setBusy(true)
      await previewQrPdf(studentUrl, { name: shopName, address, rates })
    } catch (err: any) {
      alert("Failed to preview PDF: " + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="qr-modal-scrim" onClick={onClose} />
      <div className="qr-modal-container">
        {/* Top Control Bar with 1-click Browser Print & Actions */}
        <div className="qr-modal-top-bar">
          <div className="qr-bar-heading">
            <strong>Shop QR Poster (1-Page A4)</strong>
            <span>Print immediately on any printer or export vector PDF</span>
          </div>
          <div className="qr-poster-actions">
            <Button
              kind="primary"
              onClick={() => window.print()}
              className="print-poster-btn"
              title="Print 1-page A4 poster immediately on counter printer"
            >
              <Icon name="printer" />
              <span>PRINT 1-PAGE POSTER</span>
            </Button>
            <Button kind="plain" onClick={handleDownloadPdf} disabled={busy}>
              <span>DOWNLOAD A4 PDF</span>
            </Button>
            <Button kind="plain" onClick={handlePreviewPdf} disabled={busy}>
              <span>PREVIEW PDF</span>
            </Button>
            <Button kind="plain" onClick={handleCopy}>
              <span>{copied ? "COPIED ✓" : "COPY LINK"}</span>
            </Button>
            {printers && printers.length > 0 && selectedPrinterId && (
              <Button
                kind="plain"
                onClick={handlePrintToPrinter}
                disabled={busy}
                title="Send directly to local Windows print agent"
              >
                <span>PRINT VIA AGENT</span>
              </Button>
            )}
            <Button kind="ghost" onClick={onClose} className="qr-close-btn">
              <span>✕ CLOSE</span>
            </Button>
          </div>
        </div>

        {printers && printers.length > 0 && (
          <div className="qr-printer-select-row">
            <label>Agent Target Printer:</label>
            <select
              value={selectedPrinterId}
              onChange={(e) => setSelectedPrinterId(e.target.value)}
            >
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({(p.role || "bw").toUpperCase()}) — {p.online ? "Online" : "Offline"}
                </option>
              ))}
            </select>
          </div>
        )}

        {printingStatus && (
          <div
            style={{
              margin: "8px 0",
              fontSize: 13,
              fontWeight: 700,
              color: printingStatus.includes("error") ? "red" : "green",
            }}
          >
            {printingStatus}
          </div>
        )}

        {/* 1-Page Printable Poster Sheet */}
        <div className="qr-poster-printable">
          {/* 1. Header with single canonical logo */}
          <div className="poster-header">
            <div className="poster-logos">
              <img src="./hkbk-logo.jpg" alt="HKBK" className="poster-hkbk-logo" />
            </div>
            <div className="poster-venue">
              <strong>{shopName}</strong>
              <span>CAMPUS DIGITAL PRINT COUNTER</span>
            </div>
          </div>

          {/* 2. Hero banner */}
          <div className="poster-hero">
            <div className="poster-headline-badge">FAST SELF-SERVICE PRINTING</div>
            <h1 className="poster-title">Scan this QR for Fast Printing</h1>
            <p className="poster-subtitle">Upload PDFs, docs, and photos directly from your phone — no app or signup required!</p>
          </div>

          {/* 3. Clean high-contrast App-Coloured CSS-Styled QR code */}
          <div className="poster-qr-frame">
            <RealQRCode text={studentUrl} size={240} />
            <div className="qr-scan-badge">SCAN TO PRINT</div>
          </div>

          {/* 4. 3 Simple steps */}
          <div className="poster-steps">
            <div className="step-card">
              <div className="step-num">1</div>
              <div className="step-content">
                <strong>Scan QR Code</strong>
                <span>Open any Camera, Google Lens, or UPI App</span>
              </div>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <div className="step-content">
                <strong>Upload &amp; Set Options</strong>
                <span>PDFs, DOCX, Photos · Pick B&amp;W or Colour</span>
              </div>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <div className="step-content">
                <strong>Pick Up at Counter</strong>
                <span>Pay UPI or Cash · Collect with 4-digit code</span>
              </div>
            </div>
          </div>

          {/* 6. Direct link and privacy note */}
          <div className="poster-footer">
            <div className="footer-url">
              <span>Direct Link: </span>
              <strong>{studentUrl}</strong>
            </div>
            <div className="footer-secure">
              <span>High-speed campus network · Files deleted 5 minutes after printing</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SettingsField({ label, value, type = "text", suffix, placeholder, onChange }: { label: string; value: string; type?: string; suffix?: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="settings-field"><span>{label}</span><div><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{suffix && <b>{suffix}</b>}</div></label>
}

function ToggleRow({
  title,
  subtitle,
  checked,
  disabled = false,
  onChange,
}: {
  title: string
  subtitle: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        className={`setting-toggle ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <i />
        <span>{checked ? "ENABLED" : "OFF"}</span>
      </button>
    </div>
  )
}

function PrinterSettingsPanel({
  printers,
  shop,
  studentUrl,
  onClose,
  onOpenQrModal,
  onRefreshLive,
}: {
  printers: LivePrinter[]
  shop: LiveShop
  studentUrl: string
  onClose: () => void
  onOpenQrModal: () => void
  onRefreshLive: () => void
}) {
  const [tab, setTab] = useState(0)
  const [saved, setSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<Record<string, string>>({})
  const [mixedMode, setMixedMode] = useState(shop.mixed_colour_mode || "split")
  const [version, setVersion] = useState<number>(shop.version || 1)
  const [undoable, setUndoable] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rzpKeys, setRzpKeys] = useState({ keyId: "", keySecret: "" })
  const [rzpConfigured, setRzpConfigured] = useState(false)

  const [rates, setRates] = useState({
    bw: String(shop.rates?.bw ?? "1.50"),
    colour: String(shop.rates?.colour ?? "8.00"),
    duplex: String(shop.rates?.duplex ?? "0.85"),
    bulk: String(shop.rates?.bulk ?? "100"),
    a3: String(shop.rates?.a3 ?? "2"),
    legal: String(shop.rates?.legal ?? "1.25"),
    photo4x6: String(shop.rates?.photo4x6 ?? "20.00"),
    photo8x10: String(shop.rates?.photo8x10 ?? "50.00"),
    photoPassport: String(shop.rates?.photoPassport ?? "60.00"),
    bindingSpiral: String(shop.rates?.bindingSpiral ?? "35.00"),
    bindingSoft: String(shop.rates?.bindingSoft ?? "60.00"),
    bindingHard: String(shop.rates?.bindingHard ?? "150.00"),
    laminationA4: String(shop.rates?.laminationA4 ?? "25.00"),
    laminationA3: String(shop.rates?.laminationA3 ?? "50.00"),
    scanPerPage: String(shop.rates?.scanPerPage ?? "5.00"),
    copyBw: String(shop.rates?.copyBw ?? "1.50"),
    copyColour: String(shop.rates?.copyColour ?? "8.00"),
    typingBase: String(shop.rates?.typingBase ?? "50.00"),
    typingPerPage: String(shop.rates?.typingPerPage ?? "30.00"),
    upiVpa: String(shop.rates?.upiVpa ?? "studentpoint@okhdfcbank"),
    upiName: String(shop.rates?.upiName ?? "HKBK Student Point"),
  })

  const [services, setServices] = useState<Record<string, { available: boolean; reason?: string }>>({
    document_bw: { available: true },
    document_colour: { available: true },
    photos: { available: true },
    binding_spiral: { available: true },
    binding_soft: { available: true },
    binding_hard: { available: true },
    lamination: { available: true },
    scanning: { available: true },
    photocopy: { available: true },
    typing: { available: true }
  })

  const [payments, setPayments] = useState<{ cash: boolean; upi: boolean; razorpay: boolean }>({
    cash: true,
    upi: true,
    razorpay: false
  })

  const [shopDetails, setShopDetails] = useState({
    name: shop.name || "HKBK Student Point",
    address: shop.address || "HKBK College Campus, Bengaluru",
    phone: shop.phone || "080 2544 1722",
    hours: "8:30 AM – 6:00 PM (Mon–Sat)",
    announcement: shop.announcement || "",
    delete: String(shop.delete_delay_minutes || 5),
  })

  useEffect(() => {
    let mounted = true
    fetchShopSettings().then((s) => {
      if (!mounted || !s) return
      setVersion(s.version || 1)
      if (s.rates) {
        setRates((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.entries(s.rates).map(([k, v]) => [k, String(v)]))
        }))
      }
      if (s.services) {
        setServices((prev) => ({ ...prev, ...s.services }))
      }
      if (s.payments) {
        setPayments({
          cash: s.payments.cash !== false,
          upi: s.payments.upi !== false,
          razorpay: Boolean(s.payments.razorpay)
        })
        if (s.payments.upiVpa) setRates((r) => ({ ...r, upiVpa: s.payments.upiVpa }))
        if (s.payments.upiName) setRates((r) => ({ ...r, upiName: s.payments.upiName }))
      }
      if (s.shop_info) {
        setShopDetails({
          name: s.shop_info.name || "HKBK Student Point",
          address: s.shop_info.address || "HKBK College Campus, Bengaluru",
          phone: s.shop_info.phone || "080 2544 1722",
          hours: s.shop_info.hours || "8:30 AM – 6:00 PM (Mon–Sat)",
          announcement: s.announcement || "",
          delete: String(s.delete_delay_minutes || 5),
        })
      }
      if (s.mixed_colour_mode) setMixedMode(s.mixed_colour_mode)
      if (s.razorpay_configured) setRzpConfigured(true)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  const configuredBw = (shop as any)?.printer_mapping?.bw || (shop as any)?.shop_info?.printer_mapping?.bw || ""
  const configuredColour = (shop as any)?.printer_mapping?.colour || (shop as any)?.shop_info?.printer_mapping?.colour || ""

  const [selectedBw, setSelectedBw] = useState<string>(configuredBw)
  const [selectedColour, setSelectedColour] = useState<string>(configuredColour)

  useEffect(() => {
    if (configuredBw && !selectedBw) setSelectedBw(configuredBw)
    if (configuredColour && !selectedColour) setSelectedColour(configuredColour)
  }, [configuredBw, configuredColour])

  const bwPrinter = printers.find((p) => p.name === selectedBw) || printers.find((p) => p.role === "bw") || printers[0]
  const colourPrinter = printers.find((p) => p.name === selectedColour) || printers.find((p) => p.role === "colour") || printers[1] || bwPrinter

  const handleAssignPrinter = async (role: "bw" | "colour", name: string) => {
    if (role === "bw") setSelectedBw(name)
    if (role === "colour") setSelectedColour(name)
    try {
      await updateShopSettings({
        printer_mapping: {
          bw: role === "bw" ? name : (selectedBw || bwPrinter?.name || "B&W Printer"),
          colour: role === "colour" ? name : (selectedColour || colourPrinter?.name || "Colour Printer"),
        }
      })
      await addStaffPrinter(name, role)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onRefreshLive()
    } catch (err: any) {
      alert("Failed to assign printer: " + err.message)
    }
  }

  const handleTestPrint = async (printerIdOrName?: string) => {
    const target = printerIdOrName || (printers[0]?.id || printers[0]?.name)
    if (!target) {
      alert("No printer available to test. Please add or connect a printer first.")
      return
    }
    try {
      setTestStatus((prev) => ({ ...prev, [target]: "Sending test print…" }))
      await testPrintPrinter(target)
      setTestStatus((prev) => ({ ...prev, [target]: "Sent to printer successfully" }))
    } catch (err: any) {
      setTestStatus((prev) => ({ ...prev, [target]: err.message || "Test print failed" }))
    }
  }

  const handleUndo = async () => {
    if (!undoable) return
    const prev = undoable
    setUndoable(null)
    setRates(prev.rates)
    setServices(prev.services)
    setPayments(prev.payments)
    setShopDetails(prev.shopDetails)
    await saveSettings(prev.rates, prev.services, prev.payments, prev.shopDetails, false)
  }

  const saveSettings = async (
    customRates?: typeof rates,
    customServices?: typeof services,
    customPayments?: typeof payments,
    customShopDetails?: typeof shopDetails,
    recordUndo = true
  ) => {
    const r = customRates || rates
    const sv = customServices || services
    const pm = customPayments || payments
    const sd = customShopDetails || shopDetails

    // Validate inputs
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'upiVpa' && k !== 'upiName') {
        const num = Number(v)
        if (isNaN(num) || num < 0) {
          setErrorMsg(`Rate "${k}" cannot be negative`)
          return
        }
      }
    }
    const delMinutes = Number(sd.delete)
    if (isNaN(delMinutes) || delMinutes < 1 || delMinutes > 60) {
      setErrorMsg("File privacy delete delay must be between 1 and 60 minutes")
      return
    }
    setErrorMsg(null)

    if (recordUndo) {
      setUndoable({
        rates: { ...rates },
        services: { ...services },
        payments: { ...payments },
        shopDetails: { ...shopDetails }
      })
    }

    try {
      const payload: any = {
        expected_version: version,
        rates: {
          bw: Number(r.bw),
          colour: Number(r.colour),
          duplex: Number(r.duplex),
          bulk: Number(r.bulk),
          a3: Number(r.a3),
          legal: Number(r.legal),
          photo4x6: Number(r.photo4x6),
          photo8x10: Number(r.photo8x10),
          photoPassport: Number(r.photoPassport),
          bindingSpiral: Number(r.bindingSpiral),
          bindingSoft: Number(r.bindingSoft),
          bindingHard: Number(r.bindingHard),
          laminationA4: Number(r.laminationA4),
          laminationA3: Number(r.laminationA3),
          scanPerPage: Number(r.scanPerPage),
          copyBw: Number(r.copyBw),
          copyColour: Number(r.copyColour),
          typingBase: Number(r.typingBase),
          typingPerPage: Number(r.typingPerPage),
          upiVpa: r.upiVpa,
          upiName: r.upiName,
        },
        services: sv,
        payments: {
          cash: pm.cash,
          upi: pm.upi,
          razorpay: pm.razorpay,
          upiVpa: r.upiVpa,
          upiName: r.upiName,
        },
        shop_info: {
          name: sd.name,
          address: sd.address,
          phone: sd.phone,
          hours: sd.hours,
          payee: r.upiName,
          upi: r.upiVpa,
        },
        announcement: sd.announcement,
        mixed_colour_mode: mixedMode,
        delete_delay_minutes: delMinutes,
      }
      if (rzpKeys.keyId && rzpKeys.keySecret) {
        payload.payments.razorpay_key_id = rzpKeys.keyId
        payload.payments.razorpay_key_secret = rzpKeys.keySecret
      }

      const res = await updateShopSettings(payload)
      if (res.version) setVersion(res.version)
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
      onRefreshLive()
    } catch (err: any) {
      if (err?.conflict) {
        setErrorMsg("Settings were updated on another terminal. Re-fetching latest...");
        onRefreshLive();
      } else {
        setErrorMsg(err.message || "Failed to save settings");
      }
    }
  }

  const tabs = ["Printers", "Pricing & payment", "Shop info", "QR & counter"]

  return (
    <>
      <div className="settings-scrim" onClick={onClose} />
      <aside className="printer-settings-panel">
        <header className="settings-header">
          <div><span>SETTINGS</span><strong>Counter settings</strong><small>Live shop PC configuration</small></div>
          <button type="button" onClick={onClose} aria-label="Close printer settings">×</button>
        </header>
        <nav className="settings-tabs">{tabs.map((label, index) => <button type="button" className={tab === index ? "active" : ""} onClick={() => setTab(index)} key={label}>{label}</button>)}</nav>

        <div className="settings-content">
          {tab === 0 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>PRINTERS ON THIS PC</span><strong>Choose where each job goes</strong><p>PrintBK sends orders directly to these shop printers.</p></div>

              <div className={`printer-agent-status ${printers.some((p) => p.online) ? "online" : "offline"}`}>
                <span className={`status-badge ${printers.some((p) => p.online) ? "live" : "offline"}`}>
                  {printers.some((p) => p.online) ? "● PRINT AGENT ONLINE" : "● PRINT AGENT OFFLINE"}
                </span>
                <p>
                  {printers.some((p) => p.online)
                    ? "Connected to shop PC background agent. Print jobs dispatch directly to local printers."
                    : "Print agent is offline. Run `node agent.js` on the counter PC to connect local USB/Network printers."}
                </p>
              </div>

              <div className="printer-discovery">
                <div><i className="status-dot" /><span>{printers.length > 0 ? `${printers.length} printer${printers.length > 1 ? "s" : ""} detected` : "No printers reported yet"}</span></div>
                <button type="button" onClick={onRefreshLive}>REFRESH</button>
              </div>

              <section className="setting-card printer-choice">
                <div className="setting-card-title"><div><span>Black &amp; White printer</span><strong><i className="status-dot" /> {bwPrinter ? (bwPrinter.online ? "Online" : "Offline") : selectedBw ? "Configured" : "None"}</strong></div><Icon name="printer" size={28} /></div>
                <PrinterDropdownRow
                  value={selectedBw || bwPrinter?.name || "No B&W printer"}
                  printers={printers}
                  onSelect={(name) => handleAssignPrinter("bw", name)}
                  onTest={() => handleTestPrint(bwPrinter?.id || selectedBw || bwPrinter?.name)}
                />
                {(bwPrinter || selectedBw) && testStatus[bwPrinter?.id || selectedBw || ""] && (
                  <div className="test-result success"><Icon name="check" />{testStatus[bwPrinter?.id || selectedBw || ""]}</div>
                )}
              </section>

              <section className="setting-card printer-choice">
                <div className="setting-card-title"><div><span>Colour printer</span><strong><i className="status-dot" /> {colourPrinter ? (colourPrinter.online ? "Online" : "Offline") : selectedColour ? "Configured" : "None"}</strong></div><Icon name="colour" size={28} /></div>
                <PrinterDropdownRow
                  value={selectedColour || colourPrinter?.name || "No colour printer"}
                  printers={printers}
                  onSelect={(name) => handleAssignPrinter("colour", name)}
                  onTest={() => handleTestPrint(colourPrinter?.id || selectedColour || colourPrinter?.name)}
                />
                {(colourPrinter || selectedColour) && testStatus[colourPrinter?.id || selectedColour || ""] && (
                  <div className="test-result success"><Icon name="check" />{testStatus[colourPrinter?.id || selectedColour || ""]}</div>
                )}
              </section>

              <section className="setting-card qr-print-card">
                <div><span>SHOP QR POSTER</span><strong>Print your QR</strong><p>Students scan this to start an order.</p><Button onClick={onOpenQrModal}>PRINT YOUR QR</Button></div>
                <div className="mini-poster" onClick={onOpenQrModal} style={{ cursor: "pointer" }}><img src="./hkbk-logo.jpg" alt="" /><RealQRCode text={studentUrl} size={64} /><b>SCAN TO PRINT</b></div>
              </section>

              <details className="setting-card printer-setup-guide">
                <summary><span>HOW TO CONNECT PRINTERS</span><strong>Printer setup guide</strong></summary>
                <div className="setup-guide-body">
                  <p>The <strong>PrintBK Print Agent</strong> is a small background program you run on the counter PC. It discovers your local USB and network printers and sends jobs directly — no dialogs, no manual steps.</p>
                  <ol>
                    <li>
                      <strong>Step 1 — Open a terminal on the counter PC</strong>
                      <p>Press <kbd>Win + R</kbd>, type <code>cmd</code>, press Enter.</p>
                    </li>
                    <li>
                      <strong>Step 2 — Navigate to the agent folder</strong>
                      <p>Type: <code>cd C:\PrintBK\agent</code> (adjust if installed elsewhere).</p>
                    </li>
                    <li>
                      <strong>Step 3 — Start the agent</strong>
                      <p>Run: <code>pnpm start</code> or <code>node agent.js</code></p>
                      <p style={{ color: "var(--muted)", fontSize: 13 }}>Keep this terminal window open while the shop is running. Your printers will appear here within 10 seconds of the agent starting.</p>
                    </li>
                    <li>
                      <strong>Step 4 — Verify connection</strong>
                      <p>Click <strong>REFRESH</strong> above. The status will change to <span style={{ color: "var(--success)", fontWeight: 700 }}>● PRINT AGENT ONLINE</span> and your printers will be listed.</p>
                    </li>
                  </ol>
                  <div className="setup-guide-tips">
                    <strong>Student Settings &amp; Real Document Printing</strong>
                    <ul>
                      <li>When students submit documents, all their selected settings (<strong>Double-sided / Duplex</strong>, <strong>Copies</strong>, <strong>Paper Size A4/A3</strong>, <strong>Orientation</strong>, and <strong>Page Ranges</strong>) are passed directly to the printer spooler.</li>
                      <li>Clicking <strong>APPROVE &amp; PRINT</strong> sends the exact file to the local printer queue immediately. No manual print dialogs needed.</li>
                      <li>USB printers: Connect directly to the counter PC — the agent picks them up automatically.</li>
                      <li>Network/WiFi printers: Make sure the printer is on the same local network and is added in Windows Settings → Printers &amp; scanners.</li>
                      <li>To start the agent automatically on boot, create a shortcut to <code>agent.js</code> in your Windows Startup folder (<kbd>Win + R</kbd> → <code>shell:startup</code>).</li>
                      <li>If a printer appears offline, power-cycle the printer and click REFRESH.</li>
                    </ul>
                  </div>
                </div>
              </details>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>MIXED COLOUR DOCUMENTS</span><strong>Choose how pages are routed</strong></div></div>
                <label className={`choice-card ${mixedMode === "split" ? "selected" : ""}`}><input type="radio" checked={mixedMode === "split"} onChange={() => { setMixedMode("split"); saveSettings() }} /><div><strong>Split between both printers</strong><span>Colour pages use the colour printer; the rest use B&amp;W.</span></div></label>
                <label className={`choice-card ${mixedMode === "colour" ? "selected" : ""}`}><input type="radio" checked={mixedMode === "colour"} onChange={() => { setMixedMode("colour"); saveSettings() }} /><div><strong>Print everything on the colour printer</strong><span>The whole document stays together and uses one printer.</span></div></label>
              </section>
            </div>
          )}

          {tab === 1 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>PRICING &amp; PAYMENT</span><strong>All campus services rates</strong></div>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>1. DOCUMENT PRINTS</span><strong>Black &amp; white and colour per page</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="B&W per page" value={rates.bw} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, bw: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Colour per page" value={rates.colour} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, colour: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Double-sided rate" value={rates.duplex} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, duplex: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Bulk discount after" value={rates.bulk} type="number" suffix="pages" onChange={(v) => { const nr = { ...rates, bulk: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="A3 multiplier" value={rates.a3} type="number" suffix="×" onChange={(v) => { const nr = { ...rates, a3: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Legal multiplier" value={rates.legal} type="number" suffix="×" onChange={(v) => { const nr = { ...rates, legal: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>2. PHOTO PRINTS</span><strong>Glossy &amp; passport print pricing</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="4×6 Photo rate" value={rates.photo4x6} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, photo4x6: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="8×10 Photo rate" value={rates.photo8x10} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, photo8x10: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Passport set (8 photos)" value={rates.photoPassport} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, photoPassport: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>3. BINDING DESK</span><strong>Spiral, soft cover, and hard bound</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="Spiral binding rate" value={rates.bindingSpiral} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, bindingSpiral: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Soft cover binding rate" value={rates.bindingSoft} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, bindingSoft: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Hard project bound rate" value={rates.bindingHard} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, bindingHard: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>4. LAMINATION</span><strong>Thermal protection sheets</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="A4 Lamination sheet" value={rates.laminationA4} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, laminationA4: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="A3 Lamination sheet" value={rates.laminationA3} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, laminationA3: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>5. SCANNING &amp; PHOTOCOPY</span><strong>Service counter walk-in rates</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="Scanning per page" value={rates.scanPerPage} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, scanPerPage: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Photocopy B&W rate" value={rates.copyBw} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, copyBw: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Photocopy Colour rate" value={rates.copyColour} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, copyColour: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>6. TYPING &amp; CUSTOM REQUESTS</span><strong>Custom project work &amp; formatting</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="Base quote minimum" value={rates.typingBase} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, typingBase: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Typing per page" value={rates.typingPerPage} type="number" suffix="₹" onChange={(v) => { const nr = { ...rates, typingPerPage: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>7. COUNTER UPI DETAILS</span><strong>Merchant QR &amp; student payment</strong></div></div>
                <div className="field-grid">
                  <SettingsField label="UPI VPA (Virtual ID)" value={rates.upiVpa} onChange={(v) => { const nr = { ...rates, upiVpa: v }; setRates(nr); saveSettings(nr) }} />
                  <SettingsField label="Merchant Display Name" value={rates.upiName} onChange={(v) => { const nr = { ...rates, upiName: v }; setRates(nr); saveSettings(nr) }} />
                </div>
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>8. SERVICE AVAILABILITY</span><strong>Enable or disable individual services</strong></div></div>
                <p style={{ marginBottom: "16px", color: "var(--muted)", fontSize: 14 }}>
                  Disabling a service instantly hides or marks it as "Not available today" in the student app with your custom explanation.
                </p>
                {[
                  { key: "bw", label: "Black & White Printing", desc: "A4 / A3 standard document printing" },
                  { key: "colour", label: "Colour Printing", desc: "Full colour document printing" },
                  { key: "photos", label: "Photo Printing", desc: "4×6, 8×10, and passport prints" },
                  { key: "binding_spiral", label: "Spiral Binding", desc: "Standard spiral binding with plastic sheet" },
                  { key: "binding_soft", label: "Soft Cover Binding", desc: "Thermal and soft card book binding" },
                  { key: "binding_hard", label: "Hard Bound Project", desc: "Golden embossed project hard binding" },
                  { key: "lamination", label: "Thermal Lamination", desc: "A4 & A3 sheet pouch lamination" },
                  { key: "scanning", label: "Document Scanning", desc: "Walk-in scan to email/drive" },
                  { key: "photocopy", label: "Photocopy Counter", desc: "Walk-in manual page copy" },
                  { key: "typing", label: "Typing & Formatting", desc: "Custom typing and thesis project editing" },
                ].map((s) => {
                  const sInfo = (services as any)[s.key] || { available: true }
                  const isAvailable = sInfo.available !== false
                  return (
                    <div key={s.key} style={{ borderBottom: "1px dotted var(--line)", paddingBottom: "12px", marginBottom: "12px" }}>
                      <ToggleRow
                        title={s.label}
                        subtitle={s.desc}
                        checked={isAvailable}
                        onChange={(checked) => {
                          const updated = {
                            ...services,
                            [s.key]: {
                              available: checked,
                              reason: checked ? "" : (sInfo.reason || "Temporarily unavailable today")
                            }
                          }
                          setServices(updated)
                          saveSettings(rates, updated)
                        }}
                      />
                      {!isAvailable && (
                        <div style={{ marginTop: "8px" }}>
                          <SettingsField
                            label="Reason shown to students"
                            value={sInfo.reason || ""}
                            placeholder="e.g. Machine under maintenance, resumes 2 PM"
                            onChange={(reason) => {
                              const updated = {
                                ...services,
                                [s.key]: { available: false, reason }
                              }
                              setServices(updated)
                              saveSettings(rates, updated)
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>

              <section className="setting-card">
                <div className="setting-card-title"><div><span>9. PAYMENT METHODS &amp; GATEWAY</span><strong>Student checkout options</strong></div></div>
                <ToggleRow
                  title="Cash at Counter"
                  subtitle="Student places order and pays counter staff before collection"
                  checked={payments.cash}
                  onChange={(checked) => {
                    const updated = { ...payments, cash: checked }
                    setPayments(updated)
                    saveSettings(rates, services, updated)
                  }}
                />
                <ToggleRow
                  title="Direct UPI Payment"
                  subtitle="Generates UPI QR with student reference ID, merchant UPI ID, and exact amount"
                  checked={payments.upi}
                  onChange={(checked) => {
                    const updated = { ...payments, upi: checked }
                    setPayments(updated)
                    saveSettings(rates, services, updated)
                  }}
                />
                <ToggleRow
                  title="Razorpay Online Gateway"
                  subtitle={rzpConfigured ? "Payment gateway active (credentials stored on server)" : "Card, Netbanking & Wallets via Razorpay (API Key required)"}
                  checked={payments.razorpay}
                  onChange={(checked) => {
                    const updated = { ...payments, razorpay: checked }
                    setPayments(updated)
                    saveSettings(rates, services, updated)
                  }}
                />
                {payments.razorpay && (
                  <div style={{ marginTop: "16px", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--paper)" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
                      Razorpay API Credentials
                      {rzpConfigured && <span style={{ marginLeft: "8px", color: "var(--success)", fontSize: "12px" }}>● Configured on server</span>}
                    </div>
                    <div className="field-grid">
                      <SettingsField
                        label="Key ID"
                        value={rzpKeys.keyId}
                        placeholder={rzpConfigured ? "rzp_live_••••••• (unchanged)" : "rzp_live_..."}
                        onChange={(v) => setRzpKeys((k) => ({ ...k, keyId: v }))}
                      />
                      <SettingsField
                        label="Key Secret"
                        type="password"
                        value={rzpKeys.keySecret}
                        placeholder={rzpConfigured ? "•••••••••••••••• (unchanged)" : "Secret"}
                        onChange={(v) => setRzpKeys((k) => ({ ...k, keySecret: v }))}
                      />
                    </div>
                    {(rzpKeys.keyId || rzpKeys.keySecret) && (
                      <div style={{ marginTop: "10px" }}>
                        <Button kind="plain" onClick={() => saveSettings(rates, services, payments, shopDetails)}>
                          UPDATE RAZORPAY KEYS
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 2 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>SHOP INFO</span><strong>What students see before ordering</strong></div>
              <section className="setting-card shop-fields">
                <SettingsField label="Shop name" value={shopDetails.name} onChange={(v) => { const ns = { ...shopDetails, name: v }; setShopDetails(ns); saveSettings(rates, services, payments, ns) }} />
                <SettingsField label="Address" value={shopDetails.address} onChange={(v) => { const ns = { ...shopDetails, address: v }; setShopDetails(ns); saveSettings(rates, services, payments, ns) }} />
                <SettingsField label="Contact number" value={shopDetails.phone} onChange={(v) => { const ns = { ...shopDetails, phone: v }; setShopDetails(ns); saveSettings(rates, services, payments, ns) }} />
                <SettingsField
                  label="Shop announcement banner"
                  value={shopDetails.announcement}
                  placeholder="e.g. Closing early today at 4:00 PM for sports day"
                  onChange={(v) => { const ns = { ...shopDetails, announcement: v }; setShopDetails(ns); saveSettings(rates, services, payments, ns) }}
                />
              </section>
              <section className="setting-card precedence-info-card" style={{ background: "var(--paper-subtle, #f8fafc)", border: "1.5px solid var(--line, #e2e8f0)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted, #64748b)", textTransform: "uppercase", marginBottom: 4 }}>
                  OPERATIONAL PRECEDENCE
                </div>
                <strong style={{ display: "block", fontSize: 15, color: "var(--ink, #0b1020)", marginBottom: 6 }}>
                  How Counter Open/Closed is decided
                </strong>
                <ol style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.5, color: "var(--ink-secondary, #334155)" }}>
                  <li><strong>1. Manual Open/Closed Switch:</strong> Highest precedence. When set to CLOSED, ordering is paused immediately across all platforms.</li>
                  <li><strong>2. Temporary Pause:</strong> Quick pause from the counter header.</li>
                  <li><strong>3. Scheduled Hours:</strong> Regular operational hours ({shopDetails.hours || "8:30 AM – 6:00 PM (Mon–Sat)"}).</li>
                </ol>
              </section>
              <section className="setting-card delete-setting">
                <div><span>FILE PRIVACY</span><strong>Files are deleted <b>{shopDetails.delete} minutes</b> after printing</strong><p>Configurable between 1 and 30 minutes. Hard maximum 60 minutes.</p></div>
                <input type="range" min="1" max="30" value={shopDetails.delete} onChange={(e) => { const ns = { ...shopDetails, delete: e.target.value }; setShopDetails(ns); saveSettings(rates, services, payments, ns) }} />
                <div className="range-labels"><span>1 min</span><b>{shopDetails.delete} min</b><span>30 min</span></div>
              </section>
            </div>
          )}

          {tab === 3 && (
            <div className="settings-tab">
              <div className="settings-intro"><span>QR &amp; COUNTER</span><strong>Make ordering obvious</strong></div>
              <section className="setting-card shop-qr-card">
                <RealQRCode text={studentUrl} size={150} />
                <div>
                  <span>STUDENT APP LINK</span>
                  <strong>{studentUrl}</strong>
                  <p>Students scan this QR code or navigate to this link on their mobile devices to start an order.</p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                    <Button kind="primary" onClick={onOpenQrModal}><Icon name="printer" /> OPEN PRINTABLE A4 POSTER</Button>
                    <Button kind="plain" onClick={async () => {
                      if (window.confirm("Purge stale test orders older than 12 hours from queue?")) {
                        try {
                          const res = await purgeStaleOrders();
                          alert(`Purged ${res.purgedCount || 0} stale test orders.`);
                          onRefreshLive();
                        } catch (e: any) {
                          alert("Purge failed: " + e.message);
                        }
                      }
                    }}>CLEAR STALE ORDERS</Button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
        {errorMsg && (
          <div className="settings-error" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", padding: "10px 16px", borderRadius: "8px", margin: "12px", border: "1px solid rgba(239, 68, 68, 0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}>✕</button>
          </div>
        )}
        {undoable && (
          <div className="settings-undo-bar" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "10px 16px", borderRadius: "8px", margin: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
            <span>Settings updated.</span>
            <button type="button" onClick={handleUndo} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>UNDO</button>
          </div>
        )}
        {saved && <div className="settings-saved"><Icon name="check" /><span>Settings saved</span></div>}
      </aside>
    </>
  )
}

function PaymentBlock({ payment, amount, order }: { payment: Payment; amount: number; order: number }) {
  return (
    <div className={`row-payment row-payment--${payment}`}>
      <span className="payment-main"><Icon name={payment === "upi" ? "eye" : payment === "cash_due" ? "cash" : "check"} size={22} />{paymentLabel[payment]} {payment !== "cash_collected" && <b>₹{amount.toFixed(2)}</b>}</span>
      {payment === "upi" && <small>Check UPI app · ref #{order}</small>}
      {payment === "paid" && <small>Payment confirmed</small>}
      {payment === "cash_collected" && <small>₹{amount.toFixed(2)} received</small>}
      {payment === "cash_due" && <small>Cash before service</small>}
    </div>
  )
}

function StateChip({ state }: { state: string }) {
  return <span className={`state-chip state-chip--${state.toLowerCase().replaceAll(" ", "-").replace("/", "-")}`}>{state}</span>
}

function InlineOrderDetail({ job }: { job: Job }) {
  const studentState = job.state.startsWith("Printing")
    ? job.state
    : job.state === "Printed" || job.state === "PRINTED ✓"
      ? `Printed, show code ${job.pickup_code}`
      : job.payment === "upi"
        ? "Waiting for the shop to confirm your UPI payment"
        : job.state

  return (
    <div className="inline-order-detail">
      <div><span>ORDER</span><strong>#{job.order}</strong></div>
      <div><span>PRINT PLAN</span><b>{job.payload?.printPlan || (job.service === "colour" ? "Colour document" : "Standard direct print")}</b></div>
      <div><span>STUDENT SEES</span><b>{studentState}</b></div>
      <div><span>FILES</span><b>{job.state.includes("PRINTED") ? "Delete scheduled automatically" : "Protected until 5 minutes after printing"}</b></div>
    </div>
  )
}

function Timeline({ job }: { job: Job }) {
  const stages = [
    ["Uploaded", formatTimeOnly(job.created_at)],
    [job.payment === "upi" ? "UPI claimed" : job.payment === "cash_collected" ? "Cash collected" : "Paid", job.payment !== "cash_due" ? "Confirmed" : "—"],
    ["Approved", ["sending", "printing", "printed", "done"].includes(job.rawStatus) ? "Approved" : "—"],
    ["Printing", ["printing", "printed"].includes(job.rawStatus) ? "In progress" : "—"],
    ["Printed", job.rawStatus === "printed" ? (job.printed_at ? formatTimeOnly(job.printed_at) : "Complete") : "—"],
    ["Files deleted", job.files_deleted_at ? formatTimeOnly(job.files_deleted_at) : (job.rawStatus === "printed" ? "Scheduled" : "—")],
  ]
  return <div className="detail-timeline">{stages.map(([label, time], index) => <div className={time !== "—" ? "complete" : ""} key={label}><i>{time !== "—" ? <Icon name="check" size={13} /> : index + 1}</i><span>{label}</span><b>{time}</b></div>)}</div>
}

function SheetPeek({ colour = false }: { colour?: boolean }) {
  return (
    <div className="sheet-peek">
      {[1, 2, 3, 4].map((page) => <div className={colour && page === 1 ? "is-colour" : ""} key={page}><span>{page}</span><i /><i /><i /></div>)}
    </div>
  )
}

function OrderDetailPanel({
  job,
  onClose,
  onReject,
  readOnly = false,
}: {
  job: Job
  onClose: () => void
  onReject: (job: Job, reason: string) => void
  readOnly?: boolean
}) {
  const [hold, setHold] = useState(false)
  const [rejectReason, setRejectReason] = useState("UPI not received")
  const holdTimer = useRef<number | undefined>(undefined)
  const isColour = job.service === "colour"
  const isPhoto = job.service === "photos"
  const isDocument = job.service === "bw" || job.service === "colour"
  const serviceConfig = tables.find((table) => table.id === job.service)

  const startReject = () => {
    setHold(true)
    holdTimer.current = window.setTimeout(() => onReject(job, rejectReason), 1000)
  }
  const stopReject = () => {
    setHold(false)
    window.clearTimeout(holdTimer.current)
  }

  return (
    <>
      <div className="order-detail-scrim" onClick={onClose} />
      <aside className={`order-detail-panel ${readOnly ? "read-only" : ""}`}>
        <div className="panel-handle" />
        <div className="detail-panel-top">
          <div><span>ORDER DETAILS</span><strong>#{job.order}</strong><small>Uploaded {job.uploaded}</small></div>
          <button type="button" onClick={onClose} aria-label="Close order details">×</button>
        </div>
        <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
        {job.state !== "Preparing" && job.payment !== "cash_due" && (
          <div className="pickup-code"><span>PICKUP CODE</span><strong>{job.pickup_code}</strong></div>
        )}
        <Timeline job={job} />

        {job.payment === "upi" && (
          <section className="upi-claim">
            <div><Icon name="eye" size={26} /><strong>UPI payment claimed</strong></div>
            <p><b>₹{job.amount.toFixed(2)}</b> ref <b>#{job.order}</b>. Check your UPI app, then tap Approve &amp; Print.</p>
          </section>
        )}

        <section className="detail-block">
          <div className="detail-heading"><span>{isDocument || isPhoto ? "WHAT TO PRINT" : "SERVICE DETAILS"}</span><b>{isPhoto ? "PHOTO SHEET" : isDocument ? "DOCUMENT" : serviceConfig?.title.toUpperCase()}</b></div>
          {(isDocument || isPhoto) && <div className="file-name" title={job.values[1]}>{job.values[1] ?? "Document"}</div>}
          {!isDocument && !isPhoto ? (
            <div className="spec-grid service-spec-grid">
              {serviceConfig?.columns.map((column, index) => <div key={column}><span>{column}</span><b>{job.values[index] ?? "—"}</b></div>)}
            </div>
          ) : isPhoto ? (
            <div className="spec-grid">
              <div><span>Preset</span><b>{job.values[1] || "Photo"}</b></div><div><span>Photos</span><b>{job.values[2] || "1"}</b></div>
              <div><span>Sheet specification</span><b>{job.values[3] || "A4"}</b></div><div><span>Paper to load</span><b>{job.values[5] || "Photo paper"}</b></div>
            </div>
          ) : (
            <>
              <div className="spec-grid">
                <div><span>Pages</span><b>{job.values[2] || "—"}</b></div><div><span>Copies</span><b>{job.values[3] || "1"}</b></div>
                <div><span>Sides</span><b>{job.values[4] || "Single"}</b></div><div><span>Layout</span><b>{job.values[5] || "1-up"}</b></div>
                <div><span>Paper</span><b>{job.values[6] || "A4"}</b></div><div><span>Total sheets</span><b>{job.values[8] || "—"}</b></div>
              </div>
              <div className="detail-subhead">COLOUR PLAN</div>
              <div className="colour-plan">
                {Array.from({ length: 6 }, (_, index) => <PageChip page={index + 1} colour={isColour && index === 0} key={index} />)}
                <b>{isColour ? (job.values[3] || "Colour document") : "All B&W"}</b>
              </div>
              <OrientationNote title={job.values[7] || "Standard"} note="Applied directly to printer without dialog." />
            </>
          )}
        </section>

        <section className="detail-block">
          <div className="detail-heading"><span>PEEK</span><b>EXACT SHEETS · READ ONLY</b></div>
          <SheetPeek colour={isColour || isPhoto} />
        </section>

        <section className="price-receipt">
          <div className="detail-heading"><span>PRICE</span><b>RECEIPT</b></div>
          <div><span>{serviceConfig?.title || "Item"}</span><b>₹{job.amount.toFixed(2)}</b></div>
          <div className="receipt-total"><span>TOTAL</span><b>₹{job.amount.toFixed(2)}</b></div>
        </section>

        <div className="student-sees"><i /><span>STUDENT SEES</span><strong>{job.state.startsWith("Printing") ? job.state : job.state.includes("PRINTED") ? `Printed, show code ${job.pickup_code}` : job.payment === "upi" ? "Waiting for the shop to confirm your UPI payment" : job.state}</strong></div>
        {!readOnly && (
          <div className="reject-area">
            <select value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}><option>UPI not received</option><option>Student left without paying</option><option>Other reason</option></select>
            <button type="button" className={hold ? "holding" : ""} onPointerDown={startReject} onPointerUp={stopReject} onPointerLeave={stopReject}>PRESS &amp; HOLD 1 SECOND TO REJECT</button>
            <small>The student is notified immediately. You can undo for 5 seconds.</small>
          </div>
        )}
      </aside>
    </>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) {
    return (
      <svg className="sparkline" viewBox="0 0 115 42" aria-hidden="true">
        <line x1="0" y1="40" x2="115" y2="40" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
      </svg>
    )
  }
  const points = values.map((value, index) => `${index * (115 / Math.max(1, values.length - 1))},${38 - Math.min(35, Math.max(0, value))}`).join(" ")
  return <svg className="sparkline" viewBox="0 0 115 42" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" /><line x1="0" y1="40" x2="115" y2="40" stroke="currentColor" strokeWidth="1" /></svg>
}

interface TodayStats {
  collected: number
  orders: number
  pages: number
  cash: number
  online: number
  averageWait: string
}

function TodayView({ onHistory, onOrders }: { onHistory: () => void; onOrders: () => void }) {
  const [stats, setStats] = useState<TodayStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTodayAnalytics()
      .then((data) => {
        setStats(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const collectedStr = stats ? `₹${stats.collected.toLocaleString("en-IN")}` : "₹0"
  const cashStr = stats ? `₹${stats.cash.toLocaleString("en-IN")}` : "₹0"
  const onlineStr = stats ? `₹${stats.online.toLocaleString("en-IN")}` : "₹0"
  const ordersStr = stats ? String(stats.orders) : "0"
  const pagesStr = stats ? String(stats.pages) : "0"
  const avgWaitStr = stats?.averageWait || "—"

  return (
    <main className="today-page">
      <div className="today-head">
        <div><span className="eyebrow">TODAY KPI</span><div className="today-date-nav"><strong>Today's Operations</strong></div></div>
        <div className="today-head-actions">
          <Button kind="plain" onClick={onOrders}>← BACK TO LIVE ORDERS</Button>
          <Button onClick={onHistory}>ORDERS HISTORY</Button>
        </div>
      </div>

      <section className="kpi-grid">
        {[
          ["Collected", collectedStr, stats && stats.orders > 0 ? `${stats.orders} orders` : "0 orders", stats && stats.orders > 0 ? [stats.collected] : []],
          ["Orders", ordersStr, stats && stats.orders > 0 ? `${stats.orders} total` : "0 total", stats && stats.orders > 0 ? [stats.orders] : []],
          ["Pages printed", pagesStr, stats && stats.orders > 0 ? `${stats.pages} pages` : "0 pages", stats && stats.orders > 0 ? [stats.pages] : []],
          ["Average wait", avgWaitStr, "real-time", []],
        ].map((kpi, index) => <KpiTile key={kpi[0] as string} label={kpi[0] as string} value={kpi[1] as string} change={kpi[2] as string} spark={kpi[3] as number[]} lime={index === 0} />)}
      </section>

      <div className="analytics-grid">
        <section className="analytics-card payment-breakdown">
          <div className="analytics-title"><div><span>PAYMENTS</span><strong>How students paid</strong></div><b>{collectedStr}</b></div>
          <div className="bar-legend"><span><i />Cash <b>{cashStr}</b></span><span><i />UPI <b>{onlineStr}</b></span></div>
        </section>
      </div>

      <section className="day-summary-wrap">
        <article className="day-summary-sheet">
          <div className="summary-logo">
            <img src="./hkbk-logo.jpg" alt="" />
            <div><strong>PrintBK</strong><span>Counter Summary</span></div>
          </div>
          {[
            ["Total collected", collectedStr],
            ["Cash in drawer", cashStr],
            ["Online total", onlineStr],
            ["Total orders", ordersStr],
            ["Pages printed", pagesStr],
          ].map(([label, value]) => <div className="summary-receipt-row" key={label}><span>{label}</span><b>{value}</b></div>)}
        </article>
      </section>
    </main>
  )
}

function HistoryPayment({ payment }: { payment: Payment }) {
  const label = payment === "upi" ? "UPI PAID" : payment === "paid" ? "PAID ONLINE" : payment === "cash_due" ? "CASH DUE" : "CASH PAID"
  const icon = payment === "upi" ? "check" : payment === "cash_due" ? "cash" : "check"
  return <span className={`history-payment history-payment--${payment}`}><Icon name={icon} size={16} />{label}</span>
}

function HistoryView({ onBack, onOrders, onOpen }: { onBack: () => void; onOrders: () => void; onOpen: (job: Job) => void }) {
  const [search, setSearch] = useState("")
  const [pay, setPay] = useState("All payments")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchHistoryOrders({ search, payment: pay })
      .then((res) => {
        setRows(res.orders || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [search, pay])

  const openRow = (row: any) =>
    onOpen({
      key: `history-${row.order}`,
      order: row.order,
      orderId: row.order,
      service: row.colour === "Colour" ? "colour" : "bw",
      uploaded: `${row.time} · ${row.speed}`,
      payment: row.payment,
      amount: row.amount,
      state: row.status,
      values: [row.time, row.files, `1–${row.pages} of ${row.pages}`, "1", "Double · long edge", "1-up", "A4", "Standard", `${Math.ceil(row.pages / 2)}`],
      detail: `Pickup code ${row.code}. Read-only history record.`,
      pickup_code: row.code,
      rawStatus: row.status,
    })

  return (
    <main className="history-page">
      <div className="history-head">
        <div className="history-head-nav">
          <button type="button" className="history-back-btn" onClick={onOrders}>← BACK TO LIVE ORDERS</button>
          <div>
            <span className="eyebrow">HISTORY</span>
            <div className="page-title">Orders history</div>
          </div>
        </div>
        <div className="history-total"><span>TOTAL SHOWN</span><b>₹{rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)}</b></div>
      </div>
      <div className="history-tools">
        <label className="history-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or pickup code" /></label>
        <select value={pay} onChange={(event) => setPay(event.target.value)}><option>All payments</option><option value="cash_collected">Cash</option><option value="upi">UPI</option><option value="paid">Online</option></select>
      </div>
      <section className="history-table">
        <div className="history-table-head"><span>Order #</span><span>Time</span><span>Files</span><span>Pages</span><span>Colour mode</span><span>Payment</span><span>Amount</span><span>Status</span><span>Time to print</span></div>
        {loading && <div className="history-state"><i /><strong>Loading orders…</strong></div>}
        {!loading && rows.length === 0 && <div className="history-state"><span className="ready-mark"><Icon name="search" size={30} /></span><strong>No orders found</strong></div>}
        {!loading && rows.map((row) => <button className="history-row" type="button" key={row.order} onClick={() => openRow(row)}><strong>#{row.order}</strong><span>{row.time}</span><span title={row.files}>{row.files}</span><b>{row.pages}</b><span>{row.colour}</span><HistoryPayment payment={row.payment} /><b>₹{row.amount.toFixed(2)}</b><span className={`history-status status-${row.status.toLowerCase()}`}>{row.status}</span><b>{row.speed}</b></button>)}
      </section>
    </main>
  )
}

function OwnerPhoneView({
  jobs,
  recentlyPrinted,
  shopOpen,
  setShopOpen,
  closedSince,
  onAction,
}: {
  jobs: Job[]
  recentlyPrinted: RecentPrint[]
  shopOpen: boolean
  setShopOpen: (open: boolean) => void
  closedSince?: number | null
  onAction: (job: Job, type: "cash" | "primary") => void
}) {
  const [tab, setTab] = useState<"orders" | "today">("orders")
  const [service, setService] = useState<Service>("bw")
  const services = tables.map((table) => ({ ...table, count: jobs.filter((job) => job.service === table.id).length })).filter((table) => table.count > 0)
  const visible = jobs.filter((job) => job.service === service)
  const nextUp = jobs.find((job) => !job.disabled && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE"))

  useEffect(() => {
    if (services.length > 0 && !services.some((item) => item.id === service)) setService(services[0].id)
  }, [services, service])

  const closedLabel = closedSince
    ? `CLOSED (${new Date(closedSince * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
    : "CLOSED"

  return (
    <div className="owner-phone">
      <header className="owner-topbar">
        <div className="owner-brand"><img src="./hkbk-logo.jpg" alt="HKBK Group of Institutions" /><strong>PrintBK</strong></div>
        <button className={`owner-shop-switch ${shopOpen ? "open" : ""}`} type="button" onClick={() => setShopOpen(!shopOpen)}>
          <i />
          <span>{shopOpen ? "OPEN" : closedLabel}</span>
        </button>
      </header>

      {tab === "orders" ? (
        <main className="owner-orders">
          <div className="owner-page-head"><span>OWNER VIEW</span><strong>Shop orders</strong><small>First uploaded stays at the top.</small></div>
          <nav className="owner-service-switcher">
            {services.map((item) => <button type="button" key={item.id} className={service === item.id ? "active" : ""} onClick={() => setService(item.id)}><Icon name={item.icon} /><span>{item.title}</span><b>{item.count}</b></button>)}
          </nav>
          {visible.length === 0 && <div className="owner-empty"><strong>Nothing waiting here</strong></div>}
          <div className="owner-order-list">
            {visible.map((job) => (
              <article className="owner-order-card" key={job.key}>
                <div className="owner-card-top">
                  <div className="owner-order-action"><strong>#{job.order}</strong><Button kind={job.key === nextUp?.key ? "primary" : "plain"} disabled={job.disabled} onClick={() => onAction(job, job.payment === "cash_due" ? "cash" : "primary")}>{job.payment === "cash_due" ? "COLLECT CASH" : "APPROVE & PRINT"}</Button></div>
                  <div className="owner-card-meta"><span>Uploaded {job.uploaded}</span><span>Pickup <b>{job.pickup_code}</b></span><span>Amount <b>₹{job.amount.toFixed(2)}</b></span></div>
                </div>
                <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
              </article>
            ))}
          </div>
          {recentlyPrinted.length > 0 && (
            <section className="owner-printed">
              <div className="owner-section-head"><span>PRINTED</span><b>{recentlyPrinted.length}</b></div>
              {recentlyPrinted.map((item) => <div className="owner-printed-row" key={item.key}><div><strong>#{item.order}</strong><span>Code {item.pickup} · {item.printedAt}</span></div><b><Countdown expiresAt={item.expiresAt} deleted={item.deleted} /></b></div>)}
            </section>
          )}
        </main>
      ) : (
        <TodayView onHistory={() => {}} onOrders={() => setTab("orders")} />
      )}
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
  loadingActions,
  onSelect,
  onAction,
}: {
  config: TableConfig
  jobs: Job[]
  selected: string
  expanded: string
  nextKey: string
  loadingActions?: Record<string, boolean>
  onSelect: (key: string) => void
  onAction: (job: Job, action: "cash" | "primary") => void
}) {
  return (
    <section className={`service-table service-table--${config.id}`}>
      <TableTitleBar config={config} count={jobs.length} />
      <div className="table-scroll">
        <div className="table-head compact-head"><span>Pos.</span><span>Order #</span><span>Payment</span><span>Control</span><span>Amount</span></div>
        {jobs.map((job, index) => {
          const isLoading = Boolean(loadingActions?.[job.key] || loadingActions?.[String(job.order)] || loadingActions?.[String(job.orderId)])
          const hasCombine = Boolean(job.payload?.combineNote || job.payload?.colorPlan?.mode === "custom" || (typeof job.payload?.printInstructions === "string" && job.payload.printInstructions.includes("COMBINE")))

          return (
            <div key={job.key} className={`job-wrap ${selected === job.key ? "is-selected" : ""} ${index === jobs.length - 1 ? "is-new" : ""} ${job.state.startsWith("PRINTED") || job.state.startsWith("DONE") ? "is-complete" : ""}`}>
              <div className="job-row" role="button" tabIndex={0} onClick={() => onSelect(job.key)}>
                <div className="position"><i /><b>{index + 1}</b></div>
                <div className="row-order"><strong>#{job.order}</strong>{job.linked && <span>SAME ORDER</span>}</div>
                <PaymentBlock payment={job.payment} amount={job.amount} order={job.order} />
                <div className="row-controls">
                  {job.payment === "cash_due" && config.action !== "quote" && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE") && (
                    <ActionButton action="cash" primary={job.key === nextKey} loading={isLoading} onClick={(event) => { event.stopPropagation(); onAction(job, "cash") }} />
                  )}
                  {(job.payment !== "cash_due" || config.action === "quote") && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE") && (
                    <ActionButton action={config.action === "print" ? (job.state.includes("Error") ? "retry" : "print") : config.action === "quote" ? (job.state === "Quote sent" ? "done" : "quote") : "done"} primary={job.key === nextKey} disabled={job.disabled} loading={isLoading} onClick={(event) => { event.stopPropagation(); onAction(job, "primary") }} />
                  )}
                  {(job.state.startsWith("Sending") || job.state.startsWith("Printing")) && <div className="printing-progress"><span>{job.state}</span><i><b /></i></div>}
                  {(job.state.startsWith("PRINTED") || job.state.startsWith("DONE")) && <div className="printed-flash">{job.state}</div>}
                </div>
                <div className="row-amount">₹{job.amount.toFixed(2)}</div>
                <div className="detail-chip-line">
                  <StateChip state={job.state} />
                  {config.columns.map((column, valueIndex) => <span className="detail-chip" key={`${job.key}-${column}`} title={job.values[valueIndex]}><b>{column}</b>{job.values[valueIndex] ?? "—"}</span>)}
                  {config.id === "colour" && hasCombine && <span className="combine-chip">COMBINE · {job.payload?.combineNote || "Colour pages separate"}</span>}
                </div>
              </div>
              {expanded === job.key && <InlineOrderDetail job={job} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SetupFlow({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(1)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (code.trim().length < 4) return
    setError("")
    setLoading(true)
    try {
      await pairStaffDevice(code.trim())
      setStep(3)
    } catch (err: any) {
      setError(err.message || "Invalid setup code. Check your staff setup code.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="pairing-flow">
      <div className="pairing-brand">
        <img src="./hkbk-logo.jpg" alt="HKBK Group of Institutions" />
        <img src="./printbk-logo.svg" alt="PrintBK" style={{ height: 32, marginLeft: 8 }} />
        <div><strong>PrintBK</strong><span>COUNTER SETUP</span></div>
      </div>
      <div className="pairing-progress">{[1, 2, 3].map((item) => <div className={item <= step ? "active" : ""} key={item}><i>{item < step ? <Icon name="check" /> : item}</i><span>{item === 1 ? "Connect" : item === 2 ? "Printers" : "Ready"}</span></div>)}</div>
      <section className="pairing-card">
        {step === 1 && (
          <>
            <span className="eyebrow">STEP 1 OF 3</span>
            <div className="pairing-title">Connect this PC to your shop</div>
            <p>Enter the staff setup code configured in your Catalyst environment.</p>
            <SettingsField label="SHOP SETUP CODE" value={code} onChange={setCode} />
            {error && <Banner tone="error">{error}</Banner>}
            <Button kind="primary" disabled={code.trim().length < 4 || loading} onClick={handleConnect}>{loading ? "CONNECTING…" : "CONNECT SHOP"}</Button>
          </>
        )}
        {step === 3 && (
          <>
            <span className="ready-mark"><Icon name="check" size={36} /></span>
            <div className="pairing-title">You’re ready</div>
            <p>This counter PC is paired. The app will open directly to Orders from now on.</p>
            <Button kind="primary" onClick={onFinish}>OPEN SHOP</Button>
          </>
        )}
      </section>
      <small>No login is needed after this one-time pairing.</small>
    </main>
  )
}

// Lazy load isolated Components gallery for dev preview only
const ComponentsPageLazy = import.meta.env.DEV
  ? React.lazy(() => import("./ComponentsPage"))
  : () => null

export default function App() {
  const [shopOpen, setShopOpen] = useState(true)
  const [closedSince, setClosedSince] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<"orders" | "today" | "history" | "components">(() => new URLSearchParams(window.location.search).get("view") === "components" && import.meta.env.DEV ? "components" : "orders")
  const [historyJob, setHistoryJob] = useState<Job | null>(null)
  const [phoneOwnerView, setPhoneOwnerView] = useState(() => window.matchMedia("(max-width: 520px)").matches)
  const [showSetup, setShowSetup] = useState(() => !isStaffPaired())

  const studentUrl = typeof window !== "undefined"
    ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "https://printbk-60074625517.development.catalystserverless.in/app/index.html"
        : `${window.location.origin}/app/index.html`)
    : "https://printbk-60074625517.development.catalystserverless.in/app/index.html"

  // Live polling feed
  const {
    items: liveItems,
    printers: livePrinters,
    shop: liveShop,
    recentlyPrinted: liveRecentlyPrinted,
    online: isLiveOnline,
    refresh: refreshLive,
  } = useStaffLive()

  // Sync shopOpen and closedSince from live feed whenever changed on server
  useEffect(() => {
    if (liveShop && typeof liveShop.open !== "undefined") {
      setShopOpen(liveShop.open !== false)
      setClosedSince(liveShop.closedSince || liveShop.closed_since || null)
    }
  }, [liveShop?.open, liveShop?.closedSince, liveShop?.closed_since])

  // Single authoritative toggle with optimistic update and rollback
  const handleToggleShopOpen = async (targetOpen: boolean) => {
    const prevOpen = shopOpen
    const prevClosedSince = closedSince
    setShopOpen(targetOpen)
    setClosedSince(targetOpen ? null : Math.floor(Date.now() / 1000))
    try {
      const res = await updateShopSettings({ open: targetOpen })
      if (res && res.settings) {
        setShopOpen(res.settings.open !== false)
        setClosedSince(res.settings.closed_since || null)
      }
      await refreshLive()
    } catch (err: any) {
      setShopOpen(prevOpen)
      setClosedSince(prevClosedSince)
      alert(`Failed to update shop status: ${err.message || 'Network error'}`)
    }
  }

  // Support test overrides (e.g. Playwright layout tests via printbk-set-jobs)
  const [overrideJobs, setOverrideJobs] = useState<Job[] | null>(null)

  useEffect(() => {
    const handleSetJobs = (event: CustomEvent<Job[]>) => {
      if (Array.isArray(event.detail)) {
        setOverrideJobs(event.detail)
        if (event.detail[0]) setSelected(event.detail[0].key)
      }
    }
    window.addEventListener("printbk-set-jobs", handleSetJobs as EventListener)
    return () => window.removeEventListener("printbk-set-jobs", handleSetJobs as EventListener)
  }, [])

  useEffect(() => {
    const handleUnauthorized = () => setShowSetup(true)
    window.addEventListener("printbk-unauthorized", handleUnauthorized)
    return () => window.removeEventListener("printbk-unauthorized", handleUnauthorized)
  }, [])

  const jobs: Job[] = useMemo(() => {
    if (overrideJobs !== null) return overrideJobs
    return liveItems.map(mapLiveItemToJob)
  }, [overrideJobs, liveItems])

  const [selected, setSelected] = useState<string>("")
  const [expanded, setExpanded] = useState("")
  const [toast, setToast] = useState<{ message: string; action?: string; actionId?: string; onAction?: () => void } | null>(null)
  const [searching, setSearching] = useState(false)
  const [orderSearch, setOrderSearch] = useState("")
  const [serviceFilter, setServiceFilter] = useState<"all" | Service>("all")
  const [paymentFilter, setPaymentFilter] = useState<"all" | Payment>("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [recentOpen, setRecentOpen] = useState(false)

  const audioRef = useRef<AudioContext | null>(null)
  const previousServices = useRef(0)

  useEffect(() => {
    if (jobs.length > 0 && !selected) {
      setSelected(jobs[0].key)
    }
  }, [jobs, selected])

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const query = orderSearch.trim().toLowerCase()
    const matchesSearch = !query || `${job.order} ${job.pickup_code} ${job.values.join(" ")}`.toLowerCase().includes(query)
    const matchesService = serviceFilter === "all" || job.service === serviceFilter
    const matchesPayment = paymentFilter === "all" || job.payment === paymentFilter
    const matchesStatus = statusFilter === "all" || (statusFilter === "ready" ? job.state.includes("Ready") : statusFilter === "waiting" ? job.state.includes("Waiting") || job.state === "Preparing" : job.state.includes("Printing") || job.state.includes("Sending"))
    return matchesSearch && matchesService && matchesPayment && matchesStatus
  }), [jobs, orderSearch, serviceFilter, paymentFilter, statusFilter])

  const selectedJob = jobs.find((job) => job.key === selected)
  const visibleTables = tables.filter((table) => filteredJobs.some((job) => job.service === table.id))
  const occupiedTablesCount = tables.filter((table) => jobs.some((job) => job.service === table.id)).length
  const nextUp = jobs.find((job) => !job.disabled && !job.state.startsWith("Sending") && !job.state.startsWith("Printing") && !job.state.startsWith("PRINTED") && !job.state.startsWith("DONE"))

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
        // Audio notification optional
      }
    }
    previousServices.current = occupiedTablesCount
  }, [occupiedTablesCount])

  const recentlyPrinted: RecentPrint[] = useMemo(() => {
    return liveRecentlyPrinted.map((rp) => ({
      key: rp.item_id,
      order: rp.order_number,
      pickup: rp.pickup_code,
      printedAt: formatTimeAgo(rp.printed_at),
      expiresAt: rp.delete_after ? new Date(rp.delete_after).getTime() : new Date(rp.printed_at).getTime() + 300000,
      deleted: !!rp.files_deleted_at,
      job: {
        key: rp.item_id,
        order: rp.order_number,
        orderId: rp.order_number,
        service: mapKindToService(rp.kind),
        uploaded: "",
        payment: "paid" as Payment,
        amount: 0,
        state: rp.files_deleted_at ? "Files deleted" : "Printed",
        values: [],
        detail: `Pickup code ${rp.pickup_code}`,
        pickup_code: rp.pickup_code,
        rawStatus: "printed",
      },
    }))
  }, [liveRecentlyPrinted])

  const action = async (job: Job, type: "cash" | "primary") => {
    const actionKey = job.key
    setActionLoading((prev) => ({ ...prev, [actionKey]: true, [String(job.order)]: true }))

    try {
      if (type === "cash") {
        const res = await collectCash(job.orderId || job.order)
        setToast({
          message: `Cash collected for #${job.order} · linked rows updated`,
          action: "UNDO",
          actionId: res.actionId,
        })
        await refreshLive()
        return
      }

      if (job.service === "typing") {
        if (job.state === "Quote sent") {
          await markItemDone(job.key)
          setToast({ message: `Marked custom request #${job.order} done`, action: "DISMISS" })
        } else {
          const priceInput = window.prompt(`Enter quote amount (₹) for order #${job.order}:`, "50")
          if (priceInput) {
            const price = parseFloat(priceInput)
            if (!isNaN(price) && price > 0) {
              await quoteItem(job.key, price)
              setToast({ message: `Quote ₹${price} sent for #${job.order}`, action: "DISMISS" })
            }
          }
        }
        await refreshLive()
        return
      }

      const isPrint = job.service === "bw" || job.service === "colour" || job.service === "photos"
      if (isPrint) {
        if (job.state.includes("Error")) {
          await retryPrintItem(job.key)
          setToast({ message: `Retrying print for #${job.order}`, action: "DISMISS" })
        } else {
          await approvePrintItem(job.key)
          setToast({ message: `Order #${job.order} approved & queued for printer`, action: "DISMISS" })
        }
      } else {
        await markItemDone(job.key)
        setToast({ message: `Marked #${job.order} completed`, action: "DISMISS" })
      }
      await refreshLive()
    } catch (err: any) {
      setToast({ message: err.message || "Failed to execute action", action: "DISMISS" })
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionKey]: false, [String(job.order)]: false }))
    }
  }

  const handleUndo = async (actionId?: string) => {
    if (!actionId) {
      setToast(null)
      return
    }
    try {
      await undoAction(actionId)
      await refreshLive()
      setToast(null)
    } catch (err: any) {
      setToast({ message: err.message || "Failed to undo", action: "DISMISS" })
    }
  }

  const handleRejectOrder = async (job: Job, reason: string) => {
    try {
      const res = await rejectOrder(job.orderId || job.order, reason)
      setExpanded("")
      setToast({
        message: `#${job.order} cancelled · student notified`,
        action: "UNDO",
        actionId: res.actionId,
      })
      await refreshLive()
    } catch (err: any) {
      setToast({ message: err.message || "Failed to reject order", action: "DISMISS" })
    }
  }

  const handlePrintAgain = async (item: RecentPrint) => {
    try {
      await retryPrintItem(item.key)
      setRecentOpen(false)
      await refreshLive()
      setToast({ message: `Reprint queued for #${item.order}`, action: "DISMISS" })
    } catch (err: any) {
      setToast({ message: err.message || "Failed to reprint", action: "DISMISS" })
    }
  }

  const handlePurgeStale = async () => {
    if (window.confirm("Purge stale test orders older than 12 hours from the queue?")) {
      try {
        const res = await purgeStaleOrders()
        setToast({ message: `Purged ${res.purgedCount || 0} stale test orders`, action: "DISMISS" })
        await refreshLive()
      } catch (err: any) {
        setToast({ message: err.message || "Failed to purge stale orders", action: "DISMISS" })
      }
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
      if (typing || settingsOpen || qrModalOpen || historyJob || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "Enter" && target?.closest("button, a")) return
      if (event.key === "/") { event.preventDefault(); setSearching(true); return }
      if (jobs.length === 0) return
      const index = jobs.findIndex((job) => job.key === selected)
      if (event.key === "ArrowDown") setSelected(jobs[Math.min(index + 1, jobs.length - 1)].key)
      if (event.key === "ArrowUp") setSelected(jobs[Math.max(index - 1, 0)].key)
      if (event.key === "Tab") {
        event.preventDefault()
        const serviceIndex = tables.findIndex((table) => table.id === (serviceFilter === "all" ? visibleTables[0]?.id ?? "bw" : serviceFilter))
        const next = tables[(serviceIndex + 1) % tables.length].id
        setServiceFilter(next)
        const first = jobs.find((job) => job.service === next)
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

  if (showSetup) {
    return <SetupFlow onFinish={() => setShowSetup(false)} />
  }

  if (phoneOwnerView) {
    return (
      <OwnerPhoneView
        jobs={jobs}
        recentlyPrinted={recentlyPrinted}
        shopOpen={shopOpen}
        setShopOpen={handleToggleShopOpen}
        closedSince={closedSince}
        onAction={action}
      />
    )
  }

  return (
    <div className={`app-shell view-${view}`}>
      <Header
        open={shopOpen}
        setOpen={handleToggleShopOpen}
        closedSince={closedSince}
        printers={livePrinters}
        online={isLiveOnline}
        onOrders={() => { setView("orders"); setHistoryJob(null) }}
        onToday={() => { setView("today"); setExpanded(""); setHistoryJob(null) }}
        onSettings={() => { setExpanded(""); setHistoryJob(null); setSettingsOpen(true) }}
      />

      {view === "orders" && (
        <>
          <main className={`orders-board ${expanded ? "has-detail-panel" : ""}`}>
            <div className="board-heading">
              <div><span className="eyebrow">LIVE ORDERS · {jobs.length} WAITING</span><div className="page-title">First in. First out.</div></div>
              <div className="keyboard-help"><span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Tab</kbd> next table</span><span><kbd>C</kbd> cash</span><span><kbd>Enter</kbd> print</span><span><kbd>/</kbd> search</span></div>
            </div>
            <div className="orders-toolbar">
              <label className="orders-search"><Icon name="search" /><input autoFocus={searching} value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} onBlur={() => setSearching(false)} placeholder="Order number, pickup code or file" /></label>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as "all" | Payment)}><option value="all">All payments</option><option value="paid">Paid online</option><option value="upi">UPI verify</option><option value="cash_due">Cash due</option><option value="cash_collected">Cash collected</option></select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready</option><option value="waiting">Waiting</option><option value="printing">Printing</option></select>
              <Button kind="ghost" onClick={handlePurgeStale}>CLEAR STALE</Button>
              <div className="recent-wrap">
                <button className="recent-button" type="button" onClick={() => setRecentOpen(!recentOpen)}><span>RECENTLY PRINTED</span><b>{recentlyPrinted.length}</b></button>
                {recentOpen && (
                  <div className="recent-dropdown">
                    <div className="recent-title"><strong>Recently printed</strong><span>FILES RETAINED FOR 5 MINUTES</span></div>
                    {recentlyPrinted.length === 0 && <p>Nothing printed in the last 5 minutes.</p>}
                    {recentlyPrinted.map((item) => (
                      <div className="recent-item" key={item.key}>
                        <div><strong>#{item.order}</strong><span>CODE {item.pickup} · {item.printedAt}</span><b><Countdown expiresAt={item.expiresAt} deleted={item.deleted} /></b></div>
                        {!item.deleted && <Button onClick={() => handlePrintAgain(item)}>PRINT AGAIN</Button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="orders-service-filters">
              <button type="button" className={serviceFilter === "all" ? "active" : ""} onClick={() => setServiceFilter("all")}>ALL <b>{jobs.length}</b></button>
              {tables.filter((table) => jobs.some((job) => job.service === table.id)).map((table) => (
                <button type="button" className={serviceFilter === table.id ? "active" : ""} onClick={() => setServiceFilter(table.id)} key={table.id}>{table.title} <b>{jobs.filter((job) => job.service === table.id).length}</b></button>
              ))}
            </div>

            {visibleTables.length === 0 ? (
              <div className="all-caught-up">
                <span className="ready-mark"><Icon name={jobs.length === 0 ? "check" : "search"} size={42} /></span>
                <strong>{jobs.length === 0 ? "All caught up" : "No matching orders"}</strong>
                <p>{jobs.length === 0 ? "New orders will appear here automatically." : "Clear or change the filters above."}</p>
              </div>
            ) : (
              <div className={`tables-grid tables-grid--${visibleTables.length}`}>
                {visibleTables.map((table) => (
                  <ServiceTable
                    key={table.id}
                    config={table}
                    jobs={filteredJobs.filter((job) => job.service === table.id)}
                    selected={selected}
                    expanded={expanded}
                    nextKey={nextUp?.key ?? ""}
                    loadingActions={actionLoading}
                    onSelect={chooseRow}
                    onAction={action}
                  />
                ))}
              </div>
            )}
          </main>
          {expanded && selectedJob && <OrderDetailPanel job={selectedJob} onClose={() => setExpanded("")} onReject={handleRejectOrder} />}
        </>
      )}

      {view === "today" && <TodayView onHistory={() => setView("history")} onOrders={() => { setView("orders"); setHistoryJob(null) }} />}
      {view === "history" && <HistoryView onBack={() => { setView("today"); setHistoryJob(null) }} onOrders={() => { setView("orders"); setHistoryJob(null) }} onOpen={setHistoryJob} />}
      {view === "components" && import.meta.env.DEV && (
        <React.Suspense fallback={<div className="component-skeleton"><i /></div>}>
          <ComponentsPageLazy />
        </React.Suspense>
      )}
      {historyJob && <OrderDetailPanel job={historyJob} readOnly onClose={() => setHistoryJob(null)} onReject={() => {}} />}
      {settingsOpen && (
        <PrinterSettingsPanel
          printers={livePrinters}
          shop={liveShop}
          studentUrl={studentUrl}
          onClose={() => setSettingsOpen(false)}
          onOpenQrModal={() => setQrModalOpen(true)}
          onRefreshLive={refreshLive}
        />
      )}
      <QrPosterModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        shopName={liveShop.name || "HKBK Student Point"}
        address={liveShop.address}
        studentUrl={studentUrl}
        printers={livePrinters}
        rates={liveShop.rates}
      />
      {!shopOpen && <div className="closed-overlay"><div><span>SHOP CLOSED</span><strong>Orders are paused</strong><p>Open the shop from the top bar when you’re ready.</p></div></div>}
      {view === "orders" && nextUp && (
        <div className="next-up-bar">
          <div className="next-label">NEXT UP</div>
          <div className="next-order">#{nextUp.order}</div>
          <div className="next-summary"><strong>{tables.find((table) => table.id === nextUp.service)?.title} · {nextUp.values[2] ?? nextUp.values[0]}</strong><span>{nextUp.payment === "upi" ? "Check your UPI app, then approve & print" : paymentLabel[nextUp.payment]}</span></div>
          <Button kind="primary" disabled={Boolean(actionLoading[nextUp.key])} onClick={() => action(nextUp, nextUp.payment === "cash_due" ? "cash" : "primary")}>
            {actionLoading[nextUp.key] ? "WORKING…" : nextUp.payment === "cash_due" ? <>COLLECT CASH <kbd>C</kbd></> : tables.find((table) => table.id === nextUp.service)?.action === "done" ? "DONE" : tables.find((table) => table.id === nextUp.service)?.action === "quote" ? nextUp.state === "Quote sent" ? "DONE" : "SEND QUOTE" : <>APPROVE &amp; PRINT <kbd>↵</kbd></>}
          </Button>
        </div>
      )}
      {toast && (
        <FeedbackToast
          message={toast.message}
          action={toast.action}
          onAction={() => {
            if (toast.action === "UNDO") handleUndo(toast.actionId)
            else setToast(null)
          }}
        />
      )}
    </div>
  )
}
