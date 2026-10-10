import { useEffect, useMemo, useRef, useState } from "react";

type Screen =
  | "splash"
  | "entry"
  | "uploading"
  | "basket"
  | "empty"
  | "preview"
  | "services"
  | "photo"
  | "checkout"
  | "confirming"
  | "failed"
  | "paid"
  | "ticket"
  | "quoteTicket"
  | "orderError"
  | "history"
  | "settings";
type Sheet = null | "settings" | "picker" | "breakdown" | "receipt" | "report" | "binding" | "lamination" | "scanning" | "typing" | "custom";

type ServiceItem = {
  id: string;
  name: string;
  detail: string;
  price: number | null;
  mode: "addon" | "walkin" | "request";
  label: string;
  attachTo?: string;
  counterNote?: string;
};

const logo = "/assets/printbk-logo.svg";

function notify(message: string) {
  window.dispatchEvent(new CustomEvent("printbk:toast", { detail: message }));
}

function browseFiles(go: (screen: Screen) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png";
  input.onchange = () => {
    if (input.files?.length) go("uploading");
  };
  input.click();
}

function scanPages(go: (screen: Screen) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.onchange = () => {
    if (input.files?.length) {
      notify(`${input.files.length} page${input.files.length > 1 ? "s" : ""} captured`);
      go("uploading");
    }
  };
  input.click();
}

function printReceipt(services: ServiceItem[] = []) {
  const popup = window.open("", "_blank", "width=460,height=760");
  if (!popup) {
    notify("Allow pop-ups to save the receipt as PDF");
    return;
  }
  const logoUrl = `${window.location.origin}${logo}`;
  const serviceRows = services.map((service) => `<div class="row"><span>${service.name}</span><b>${service.price === null ? "Quote pending" : `₹${service.price}`}</b></div>`).join("");
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  popup.document.write(`<!doctype html><html><head><title>PrintBK receipt #1042</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f4ee;color:#0b1020;font-family:Arial,sans-serif}
    .receipt{max-width:390px;margin:auto;padding:24px;border:2px solid #0b1020;background:#fff;box-shadow:5px 5px 0 #0b1020}
    header{display:flex;align-items:center;justify-content:space-between}img{width:52px;height:52px;object-fit:contain}
    h1{margin:0;font-size:25px}small{color:#6d7283}.dash{margin:20px 0;border-top:2px dashed #d5cdb9}
    .row{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:13px}.row b{font-family:monospace}
    .total{font-size:20px;font-weight:700}.code{text-align:center;padding:18px;border:2px solid #0b1020}
    .code b{display:block;font:700 40px monospace;letter-spacing:8px}.paid{color:#1f9d55;font-weight:700}
    footer{margin-top:22px;text-align:center;color:#7a7f90;font-size:10px}
    @media print{body{padding:0;background:#fff}.receipt{box-shadow:none;max-width:none}}
  </style></head><body><main class="receipt"><header><div><h1>PrintBK</h1><small>HKBK Student Point</small></div><img src="${logoUrl}" alt="PrintBK"></header>
  <div class="dash"></div><div class="row"><span>Order</span><b>#1042</b></div><div class="row"><span>Paid</span><b class="paid">UPI · ₹${total}.00</b></div>
  <div class="dash"></div><div class="row"><span>Engineering Mathematics</span><b>₹18</b></div><div class="row"><span>Thermodynamics Lab</span><b>₹54</b></div><div class="row"><span>ID card front</span><b>₹14</b></div>${serviceRows}
  <div class="dash"></div><div class="row total"><span>Total paid</span><b>₹${total}.00</b></div><div class="code"><small>PICKUP CODE</small><b>4821</b></div>
  <footer>Files auto-delete 10 minutes after printing.<br>04 September 2025 · 12:42 PM</footer></main><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  popup.document.close();
}

async function shareReceipt(total = 86) {
  const data = { title: "PrintBK receipt #1042", text: `PrintBK order #1042 · Paid ₹${total}.00 · Pickup code 4821` };
  if (navigator.share) await navigator.share(data).catch(() => undefined);
  else {
    await navigator.clipboard?.writeText(data.text);
    notify("Receipt details copied");
  }
}

const files = [
  {
    name: "Engineering_Mathematics_Unit-4.pdf",
    pages: 40,
    meta: "Pages 1–12 · B&W · 2-up · Double-side",
    price: 18,
    kind: "PDF",
    badge: "Recognized",
  },
  {
    name: "Thermodynamics_Lab_Record.docx",
    pages: 18,
    meta: "All pages · Auto colour · Single-side",
    price: 54,
    kind: "DOCX",
    badge: "Saves ₹14 with 2-up",
  },
  {
    name: "ID_card_front.png",
    pages: 1,
    meta: "Colour · A4 · ID card size",
    price: 14,
    kind: "PNG",
    badge: "You already added this",
  },
];

function Icon({
  name,
  size = 20,
}: {
  name: "arrow" | "history" | "more" | "upload" | "file" | "chevron" | "copy" | "check" | "sun" | "trash" | "download" | "share" | "home" | "basket" | "wallet" | "settings" | "camera";
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
    basket: <><path d="M3 6h18l-2 9H6z" /><path d="m8 6 4-4 4 4" /><circle cx="8" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></>,
    wallet: <><path d="M3 6a3 3 0 0 1 3-3h13v18H5a2 2 0 0 1-2-2z" /><path d="M3 7h16M14 12h7v5h-7a2 2 0 0 1 0-5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    camera: <><path d="M4 7h4l2-3h4l2 3h4v13H4z" /><circle cx="12" cy="13" r="4" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Brand({ full = false, large = false }: { full?: boolean; large?: boolean }) {
  return (
    <div className={`brand ${large ? "brand--large" : ""}`}>
      <img src={logo} alt="PrintBK" />
      {full && (
        <div>
          <strong>PrintBK</strong>
          <span>print. pay. pick up.</span>
        </div>
      )}
    </div>
  );
}

function Topbar({
  title,
  back,
  onBack,
  action,
}: {
  title: string;
  back?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      {back ? (
        <button className="icon-button" onClick={onBack} aria-label="Go back"><Icon name="arrow" /></button>
      ) : <Brand />}
      <div className="topbar__title">{title}</div>
      <div className="topbar__action">{action ?? <span />}</div>
    </header>
  );
}

function MobileNav({ active, go }: { active: Screen; go: (screen: Screen) => void }) {
  const items: Array<{ label: string; icon: "home" | "basket" | "history" | "wallet" | "settings"; screen: Screen }> = [
    { label: "Home", icon: "home", screen: "entry" },
    { label: "Basket", icon: "basket", screen: "basket" },
    { label: "Orders", icon: "history", screen: "ticket" },
    { label: "Wallet", icon: "wallet", screen: "history" },
    { label: "Settings", icon: "settings", screen: "settings" },
  ];
  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {items.map((item) => <button className={active === item.screen || (item.label === "Wallet" && active === "history") ? "active" : ""} onClick={() => go(item.screen)} key={item.label}><span><Icon name={item.icon} size={19} />{item.label === "Basket" && <i>3</i>}</span><b>{item.label}</b></button>)}
    </nav>
  );
}

function Segmented({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {values.map((value) => (
        <button key={value} className={selected === value ? "active" : ""} onClick={() => onSelect(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}

function Splash() {
  return (
    <main className="splash">
      <div className="splash-rings" aria-hidden="true"><i /><i /><i /></div>
      <Brand full large />
      <div className="paper-feed"><span /></div>
      <p>Warming up the printer</p>
    </main>
  );
}

function Entry({ go, setSheet, openPhoto }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void; openPhoto: (layout: string) => void }) {
  const [tab, setTab] = useState("Documents");
  return (
    <main className="page entry">
      <header className="entry-header">
        <Brand full />
        <div className="header-buttons">
          <button className="icon-button" onClick={() => go("history")} aria-label="Order history"><Icon name="history" /></button>
          <button className="icon-button" onClick={() => go("settings")} aria-label="Settings"><Icon name="more" /></button>
        </div>
      </header>
      <section className="shop-intro">
        <div className="eyebrow">YOU’RE AT</div>
        <h1>HKBK Student Point</h1>
        <div className="status-chip"><i /> Open <span>·</span> <b>2</b> in queue <span>·</span> ~<b>3</b> min</div>
      </section>
      <Segmented values={["Documents", "Photos", "Other Services"]} selected={tab} onSelect={(v) => {
        setTab(v);
        if (v === "Photos") openPhoto("");
        if (v === "Other Services") go("services");
      }} />
      <button className="drop-zone" onClick={() => browseFiles(go)}>
        <span className="upload-icon"><Icon name="upload" size={24} /></span>
        <strong>Drop your files here</strong>
        <small>or tap to browse</small>
        <span className="format-row">{["PDF", "DOCX", "PPT", "XLSX", "JPG", "PNG"].map((x) => <i key={x}>{x}</i>)}</span>
      </button>
      <button className="reprint-card" onClick={() => go("checkout")}>
        <span className="mini-ticket"><b>#1031</b><i>4 files</i></span>
        <span><small>Last printed yesterday</small><strong>Reprint last order</strong></span>
        <Icon name="chevron" />
      </button>
      <button className="printer-note" onClick={() => notify("B&W is available now. Colour may take 2 minutes longer.")}><span>Printer busy</span><p>Colour printer has <b>paper low</b>. B&W is running normally.</p><Icon name="chevron" size={16} /></button>
      <button className="price-strip" onClick={() => setSheet("breakdown")}>
        <span>B&W <b>₹1</b></span><i /> <span>Colour <b>₹5</b></span><i /> <span>Double-side <b>saves 20%</b></span>
      </button>
      <footer>Files auto-delete <b>10 minutes</b> after printing.</footer>
    </main>
  );
}

function OtherServices({ go, setSheet, addService, openBinding, openCustom }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void; addService: (service: ServiceItem) => void; openBinding: (type: string) => void; openCustom: (note: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [customNote, setCustomNote] = useState("");
  const services = [
    { id: "spiral", category: "Binding", title: "Spiral binding", copy: "Neat, flexible binding for notes and reports", price: "from ₹30", tag: "Add to a print", icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Spiral" },
    { id: "comb", category: "Binding", title: "Comb binding", copy: "Reusable spine for manuals and projects", price: "from ₹25", tag: "Add to a print", icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Comb" },
    { id: "staple", category: "Binding", title: "Staple / corner pin", copy: "Simple finish for short documents", price: "₹5", tag: "Add to a print", icon: "check" as const, sheet: "binding" as Sheet, bindingType: "Staple" },
    { id: "hard", category: "Binding", title: "Hard cover / thesis binding", copy: "Premium project and thesis finish", price: "from ₹150", tag: "Not available today", icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Hard cover", unavailable: true },
    { id: "lamination", category: "Lamination", title: "Lamination", copy: "ID ₹10 · A4 ₹25 · A3 ₹50", price: "from ₹10", tag: "Walk-in", icon: "copy" as const, sheet: "lamination" as Sheet },
    { id: "scanning", category: "Scanning", title: "Scanning to PDF", copy: "Upload page photos or bring originals", price: "₹5/page", tag: "Walk-in or upload", icon: "camera" as const, sheet: "scanning" as Sheet },
    { id: "photocopy", category: "Other", title: "Photocopy at counter", copy: "Bring the original to the counter", price: "from ₹1/page", tag: "Walk-in", icon: "copy" as const },
    { id: "typing", category: "Typing", title: "Document typing / resume making", copy: "We type, format and clean up your draft", price: "quote", tag: "Request", icon: "file" as const, sheet: "typing" as Sheet },
  ];
  const visible = services.filter((service) => (filter === "All" || service.category === filter) && `${service.title} ${service.copy}`.toLowerCase().includes(query.toLowerCase()));
  const open = (service: typeof services[number]) => {
    if (service.unavailable) return;
    if (service.bindingType) openBinding(service.bindingType);
    else if (service.sheet) setSheet(service.sheet);
    else addService({ id: crypto.randomUUID(), name: "Photocopy at counter", detail: "Bring the original · Pay at counter", price: 1, mode: "walkin", label: "Pay at counter", counterNote: "Bring your original pages for photocopying." });
  };
  return (
    <main className="page other-services-page">
      <Topbar title="Other Services" back onBack={() => go("entry")} />
      <div className="services-hero"><span className="kicker">AT HKBK STUDENT POINT</span><h1>Finish the job.</h1><p>Binding, lamination, scanning and document help—all without guessing what to ask for.</p></div>
      <div className="service-search"><Icon name="file" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services" /><button onClick={() => setQuery("")}>{query ? "Clear" : "⌕"}</button></div>
      <div className="service-filters">{["All", "Binding", "Lamination", "Scanning", "Typing", "Other"].map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div>
      {visible.length ? <div className="service-list">{visible.map((service) => <button className={service.unavailable ? "unavailable" : ""} disabled={service.unavailable} onClick={() => open(service)} key={service.id}><span className="service-mark"><Icon name={service.icon} /></span><span><strong>{service.title}</strong><small>{service.copy}</small><i>{service.tag}</i></span><b>{service.price}</b><Icon name="chevron" size={17} /></button>)}</div> : <div className="service-empty"><Brand /><h2>No services found</h2><p>Try another search or clear the filter.</p><button onClick={() => { setQuery(""); setFilter("All"); }}>Show all services</button></div>}
      <section className="custom-service-row"><span className="service-mark"><Icon name="more" /></span><div><strong>Need something else?</strong><small>Tell the shop what you need.</small><textarea value={customNote} onChange={(event) => setCustomNote(event.target.value)} placeholder="Add a short note" /></div><button onClick={() => openCustom(customNote)} disabled={!customNote.trim()}>Request</button></section>
    </main>
  );
}

function Uploading({ go }: { go: (screen: Screen) => void }) {
  const [paused, setPaused] = useState(true);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (!paused && retried) {
      const timer = setTimeout(() => go("basket"), 1400);
      return () => clearTimeout(timer);
    }
  }, [paused, retried, go]);
  return (
    <main className="page upload-page">
      <Topbar title="Preparing files" back onBack={() => go("entry")} />
      <div className="upload-heading"><span className="kicker">SMART CHECKS RUNNING</span><h1>Getting everything print-ready.</h1><p>You can fix anything before paying.</p></div>
      <div className="upload-stack">
        <section className="upload-card complete"><span className="file-thumb"><Icon name="file" /><b>PDF</b></span><div><strong>Engineering_Mathematics_Unit-4.pdf</strong><small>40 pages · checked</small><div className="progress"><i /></div></div><Icon name="check" /></section>
        <section className={`upload-card ${paused ? "paused" : ""}`}><span className="file-thumb"><Icon name="file" /><b>DOCX</b></span><div><strong>Thermodynamics_Lab_Record.docx</strong><small>{paused ? "Upload paused" : "Uploading · 78%"}</small><div className="progress"><i /></div></div><button onClick={() => { setPaused(!paused); notify(paused ? "Upload resumed" : "Upload paused"); }}>{paused ? "Resume" : "Pause"}</button></section>
        <section className={`upload-card ${retried ? "" : "failed"}`}><span className="file-thumb"><Icon name="file" /><b>PNG</b></span><div><strong>ID_card_front.png</strong><small>{retried ? "Uploading · 92%" : "Connection dropped. File is safe."}</small><div className="progress"><i /></div></div><button onClick={() => { setRetried(true); notify("Retrying upload"); }}>Retry</button></section>
      </div>
      <div className="upload-foot"><div className="scanner-line" /><span>Checking margins, colour pages and blanks</span></div>
      <button className="primary full" disabled={paused || !retried} onClick={() => go("basket")}>Open basket</button>
    </main>
  );
}

function EmptyBasket({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="state-page empty-state">
      <Brand />
      <div className="empty-paper"><Icon name="file" size={34} /><span /></div>
      <span className="kicker">BASKET EMPTY</span>
      <h1>Nothing queued yet.</h1>
      <p>Drop in class notes, lab records or photos. We’ll check them before you pay.</p>
      <button className="primary" onClick={() => browseFiles(go)}>Choose files</button>
      <button className="quiet-action" onClick={() => go("entry")}>Back to HKBK Student Point</button>
    </main>
  );
}

function PrintPreview({ go }: { go: (screen: Screen) => void }) {
  const [fixed, setFixed] = useState<string[]>([]);
  const warnings = [
    ["blank", "2 blank pages", "Remove them and save 1 sheet"],
    ["rotate", "Mixed orientation", "Rotate pages 8 and 11"],
    ["tiny", "Tiny text after 6-up", "Switch this file to 4-up"],
  ];
  const fix = (id: string) => {
    setFixed((current) => [...current, id]);
    notify(id === "blank" ? "Fixed 2 blank pages for you" : "Preview updated");
  };
  return (
    <main className="page preview-page">
      <Topbar title="Print preview" back onBack={() => go("basket")} />
      <div className="preview-label"><span>What you see is what prints</span><b>Sheet 2 of 9</b></div>
      <div className="a4-preview"><div className="preview-column"><span /><span /><span /><span /><i /></div><div className="preview-column"><span /><span /><span /><span /><i /></div><em>2</em></div>
      <div className="pager"><button onClick={() => notify("Showing sheet 1")}>←</button><span><i /> <i className="active" /> <i /> <i /> <i /></span><button onClick={() => notify("Showing sheet 3")}>→</button></div>
      <div className="warning-list">
        {warnings.map(([id, title, copy]) => <section className={fixed.includes(id) ? "fixed" : ""} key={id}><span>{fixed.includes(id) ? <Icon name="check" /> : "!"}</span><div><strong>{fixed.includes(id) ? `Fixed: ${title}` : title}</strong><small>{fixed.includes(id) ? "Your price and preview are updated." : copy}</small></div><button onClick={() => fix(id)} disabled={fixed.includes(id)}>{fixed.includes(id) ? "Done" : "Fix"}</button></section>)}
        <section className="info"><span>i</span><div><strong>Low-resolution image</strong><small>ID card may look slightly soft at this size.</small></div><button onClick={() => notify("We’ll print at the safest available size")}>Keep</button></section>
      </div>
      <button className="primary full" onClick={() => go("checkout")}>Preview looks good</button>
    </main>
  );
}

function FileCard({ file, onClick, index, services }: { file: typeof files[0]; onClick: () => void; index: number; services: ServiceItem[] }) {
  const attached = services.filter((service) => service.mode === "addon" && service.attachTo === file.name);
  return (
    <div className="file-card-group">
      <button className="file-card" onClick={onClick}>
        <span className="drag-handle">⠿</span>
        <span className={`file-thumb thumb-${index}`}>
          <Icon name="file" size={24} /><b>{file.kind}</b><i>{file.pages}</i>
        </span>
        <span className="file-copy">
          <span className={`file-badge badge-${index}`}>{file.badge}</span>
          <strong title={file.name}>{file.name}</strong>
          <small><b>{file.pages}</b> pages · {index === 0 ? "2 colour pages" : index === 1 ? "6 colour pages" : "colour"}</small>
          <span>{file.meta}</span>
        </span>
        <b className="file-price">₹{file.price}</b>
      </button>
      {attached.map((service) => <div className="attached-service" key={service.id}><span><Icon name="check" size={14} /><b>{service.name}</b><small>{service.detail}</small></span><strong>₹{service.price}</strong></div>)}
    </div>
  );
}

function Basket({ go, setSheet, services }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void; services: ServiceItem[] }) {
  const [same, setSame] = useState(false);
  const pricedServices = services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const total = 86 + pricedServices;
  const standalone = services.filter((service) => service.mode !== "addon" || !service.attachTo);
  const hasQuote = services.some((service) => service.mode === "request");
  return (
    <main className="page has-dock">
      <Topbar title="Your basket" back onBack={() => go("entry")} action={<button className="text-button" onClick={() => go("empty")}>Clear</button>} />
      <div className="basket-heading"><div><span className="kicker">3 FILES READY</span><h1>Check before we print.</h1></div><button className={`switch ${same ? "on" : ""}`} onClick={() => setSame(!same)}><i /></button></div>
      <div className="same-row"><span>Apply same settings to all</span><small>Smart defaults are on</small></div>
      <div className="file-list">
        {files.map((file, i) => <FileCard key={file.name} file={file} index={i} services={services} onClick={() => setSheet("settings")} />)}
      </div>
      {standalone.length > 0 && <div className="basket-services">{standalone.map((service) => <section key={service.id}><span className={`service-mode ${service.mode}`}>{service.mode === "walkin" ? "COUNTER" : "REQUEST"}</span><div><strong>{service.name}</strong><small>{service.detail}</small><i>{service.label}</i></div><b>{service.price === null ? "Quote pending" : `₹${service.price}`}</b></section>)}</div>}
      <button className="add-more" onClick={() => browseFiles(go)}><span>+</span> Add more files</button>
      <button className="safe-note" onClick={() => go("preview")}><Icon name="check" size={16} /> We checked margins, blank pages and image quality. <b>Preview</b></button>
      <div className="bottom-dock">
        <button className="total-block" onClick={() => setSheet("breakdown")}><span>3 files · 31 sheets{services.length ? ` · ${services.length} services` : ""}</span><b>₹{total}.00</b><small>View breakdown</small></button>
        <button className="primary" onClick={() => go(hasQuote ? "quoteTicket" : "checkout")}>{hasQuote ? "Send for quote" : "Continue to pay"} <span>→</span></button>
      </div>
    </main>
  );
}

function SheetShell({ children, onClose, tall = false }: { children: React.ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
      <section className={`sheet ${tall ? "sheet--tall" : ""}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="sheet-handle" onClick={onClose} aria-label="Close sheet" />
        {children}
      </section>
    </div>
  );
}

function SettingsSheet({ setSheet }: { setSheet: (sheet: Sheet) => void }) {
  const [colour, setColour] = useState("Auto");
  const [side, setSide] = useState("Double");
  const [perSheet, setPerSheet] = useState("2");
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState("Custom");
  const [mode, setMode] = useState("Standard");
  const [paper, setPaper] = useState("A4");
  const [binding, setBinding] = useState("None");
  const [skipBlanks, setSkipBlanks] = useState(true);
  const price = Math.max(9, 18 + (copies - 1) * 18 + (colour === "Colour" ? 20 : 0) + (binding === "Spiral" ? 25 : 0));
  const reset = () => {
    setColour("Auto"); setSide("Double"); setPerSheet("2"); setCopies(1); setPages("Custom"); setMode("Standard"); setPaper("A4"); setBinding("None"); setSkipBlanks(true);
    notify("Smart defaults restored");
  };
  return (
    <SheetShell tall onClose={() => setSheet(null)}>
      <div className="sheet-title"><div><span className="kicker">ENGINEERING_MATH…PDF</span><h2>Print settings</h2></div><button className="text-button" onClick={reset}>Reset</button></div>
      <div className="preview-strip">
        {[1, 2, 3].map((n) => <div className="mini-page" key={n}><span /><span /><span /><b>{n}</b></div>)}
        <button onClick={() => setSheet("picker")}>Pick visually <Icon name="chevron" size={16} /></button>
      </div>
      <div className="setting-group"><label>Pages <small>{pages === "All" ? "40" : pages === "Odd" || pages === "Even" ? "20" : "12"} of 40</small></label><Segmented values={["All", "Odd", "Even", "Custom"]} selected={pages} onSelect={setPages} /><button className="range-input" onClick={() => setSheet("picker")}>{pages === "Custom" ? "1–12" : pages} <span>pages</span></button></div>
      <div className="setting-row">
        <div><label>Copies</label><small>Sets of the selected pages</small></div>
        <div className="stepper"><button onClick={() => setCopies(Math.max(1, copies - 1))}>−</button><b>{copies}</b><button onClick={() => setCopies(copies + 1)}>+</button></div>
      </div>
      <div className="setting-group"><label>Colour</label><Segmented values={["B&W", "Colour", "Auto"]} selected={colour} onSelect={setColour} /><small className="helper">Only coloured pages are charged at colour rate.</small></div>
      <div className="setting-group"><label>Sides</label><Segmented values={["Single", "Double"]} selected={side} onSelect={setSide} /></div>
      <div className="setting-group"><label>Pages per sheet</label><Segmented values={["1", "2", "4", "6"]} selected={perSheet} onSelect={(value) => { setPerSheet(value); setMode("Standard"); }} /><div className="chip-row"><button className={mode === "Handout" ? "active" : ""} onClick={() => setMode("Handout")}>Handout</button><button className={mode === "Booklet" ? "active" : ""} onClick={() => setMode("Booklet")}>Booklet</button></div></div>
      <div className="setting-pair"><div><label>Paper</label><button className="select-row" onClick={() => setPaper(paper === "A4" ? "A3" : paper === "A3" ? "Legal" : "A4")}>{paper} <span>⌄</span></button></div><div><label>Binding</label><button className="select-row" onClick={() => setBinding(binding === "None" ? "Staple" : binding === "Staple" ? "Spiral" : "None")}>{binding} <span>⌄</span></button></div></div>
      <div className="setting-row"><div><label>Skip blank pages</label><small>{skipBlanks ? "2 blank pages will be removed" : "Blank pages will print"}</small></div><button className={`switch ${skipBlanks ? "on" : ""}`} onClick={() => setSkipBlanks(!skipBlanks)}><i /></button></div>
      <label className="preset-check"><input type="checkbox" onChange={(event) => event.target.checked && notify("Preset will be saved as Class notes")} /> Save as “Class notes” preset</label>
      <div className="sheet-dock"><div><span>Live price</span><b key={price}>₹{price}.00</b></div><button className="primary" onClick={() => { setSheet(null); notify("Settings saved"); }}>Done</button></div>
    </SheetShell>
  );
}

function PickerSheet({ setSheet }: { setSheet: (sheet: Sheet) => void }) {
  const [selected, setSelected] = useState<number[]>(Array.from({ length: 12 }, (_, i) => i + 1));
  const [preset, setPreset] = useState("Custom");
  const toggle = (n: number) => setSelected((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n]);
  const choosePreset = (value: string) => {
    setPreset(value);
    if (value === "All") setSelected(Array.from({ length: 40 }, (_, i) => i + 1));
    if (value === "Odd") setSelected(Array.from({ length: 20 }, (_, i) => i * 2 + 1));
    if (value === "Even") setSelected(Array.from({ length: 20 }, (_, i) => (i + 1) * 2));
    if (value === "1–5") setSelected([1, 2, 3, 4, 5]);
  };
  return (
    <SheetShell tall onClose={() => setSheet("settings")}>
      <div className="sheet-title"><div><span className="kicker">PICK PAGES</span><h2>{selected.length} of 40 selected</h2></div><button className="text-button" onClick={() => setSheet("settings")}>Done</button></div>
      <div className="chip-row picker-chips">{["All", "Odd", "Even", "1–5", "Custom"].map((x) => <button className={x === preset ? "active" : ""} onClick={() => choosePreset(x)} key={x}>{x}</button>)}</div>
      <div className="page-grid">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
          const active = selected.includes(n); const blank = n === 7 || n === 14;
          return <button key={n} className={`${active ? "selected" : ""} ${blank ? "blank" : ""}`} onClick={() => { setPreset("Custom"); toggle(n); }}>
            <span className="page-lines" /><i>{blank ? "blank" : n}</i>{[3, 8, 11, 16].includes(n) && <em />}
            {active && <b><Icon name="check" size={12} /></b>}
          </button>;
        })}
      </div>
      <div className="sheet-dock single"><button className="primary" onClick={() => setSheet("settings")}>Use {selected.length} pages</button></div>
    </SheetShell>
  );
}

function BreakdownSheet({ close, services = [] }: { close: () => void; services?: ServiceItem[] }) {
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  return (
    <SheetShell onClose={close}>
      <div className="sheet-title"><div><span className="kicker">NO SURPRISES</span><h2>Price breakdown</h2></div></div>
      <div className="receipt-lines">
        <div><span>Engineering Mathematics <small>6 sheets · mixed colour</small></span><b>₹18</b></div>
        <div><span>Thermodynamics Lab <small>18 sheets · auto colour</small></span><b>₹54</b></div>
        <div><span>ID card front <small>colour · exact size</small></span><b>₹14</b></div>
        {services.map((service) => <div className={service.price === null ? "pending-line" : ""} key={service.id}><span>{service.name}<small>{service.detail} · {service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        <div className="discount"><span>2-up saving</span><b>−₹14</b></div>
        <div><span>Priority printing</span><b>₹14</b></div>
      </div>
      <div className="dotted" />
      <div className="grand-total"><span>Total</span><b>₹{total}.00</b></div>
      <div className="savings-tip">Keep 2-up on and save 14 sheets.</div>
      <button className="primary full" onClick={close}>Looks right</button>
    </SheetShell>
  );
}

function BindingSheet({ close, addService, initialType }: { close: () => void; addService: (service: ServiceItem) => void; initialType: string }) {
  const [type, setType] = useState(initialType);
  const [cover, setCover] = useState("Clear front + black back");
  const [attach, setAttach] = useState(files[0].name);
  const [quantity, setQuantity] = useState(1);
  const prices: Record<string, number> = { Spiral: 30, Comb: 25, Staple: 5, "Hard cover": 150 };
  const price = prices[type] * quantity;
  return <SheetShell tall onClose={close}>
    <div className="sheet-title"><div><span className="kicker">ADD TO A PRINT</span><h2>Binding</h2></div><span className="recommended">Recommended</span></div>
    <div className="setting-group"><label>Binding type</label><Segmented values={["Spiral", "Comb", "Staple", "Hard cover"]} selected={type} onSelect={setType} /></div>
    <div className="binding-recommendation"><span><b>8 mm spine</b><small>Best fit for 40 pages</small></span><i>Recommended</i></div>
    <div className="setting-group"><label>Cover</label><div className="choice-stack">{["Clear front + black back", "Colored cards", "Custom front page"].map((value) => <button className={cover === value ? "selected" : ""} onClick={() => setCover(value)} key={value}>{value}<i /></button>)}</div></div>
    <div className="setting-group"><label>Cover colour</label><div className="color-swatches">{["Black", "Navy", "Red", "Green", "Cream"].map((value) => <button aria-label={value} title={value} className={value.toLowerCase()} onClick={() => notify(`${value} cover selected`)} key={value} />)}</div></div>
    <div className="setting-group"><label>Attach to</label><div className="choice-stack">{[...files.map((file) => file.name), "Bring my own pages to the counter"].map((value) => <button className={attach === value ? "selected" : ""} onClick={() => setAttach(value)} key={value}><span>{value}</span><i /></button>)}</div></div>
    <div className="setting-row"><div><label>Quantity</label><small>Same binding and cover</small></div><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div></div>
    <div className="sheet-dock"><div><span>Live price</span><b>₹{price}.00</b></div><button className="primary" onClick={() => { addService({ id: crypto.randomUUID(), name: `${type} binding`, detail: cover, price, mode: attach.includes("Bring") ? "walkin" : "addon", label: attach.includes("Bring") ? "Bring pages to counter" : "Add to a print", attachTo: attach }); close(); }}>{attach.includes("Bring") ? "Add counter service" : "Add to basket"}</button></div>
  </SheetShell>;
}

function LaminationSheet({ close, addService }: { close: () => void; addService: (service: ServiceItem) => void }) {
  const [item, setItem] = useState("ID card");
  const [finish, setFinish] = useState("Glossy");
  const [thickness, setThickness] = useState("Standard 125 micron");
  const [quantity, setQuantity] = useState(1);
  const base: Record<string, number> = { "ID card": 10, A4: 25, A3: 50, Photo: 15, Certificate: 25 };
  const price = (base[item] + (thickness.startsWith("Thick") ? 10 : 0)) * quantity;
  return <SheetShell tall onClose={close}>
    <div className="sheet-title"><div><span className="kicker">WALK-IN SERVICE</span><h2>Lamination</h2></div></div>
    <div className="setting-group"><label>Item type</label><div className="chip-row wrap">{Object.keys(base).map((value) => <button className={item === value ? "active" : ""} onClick={() => setItem(value)} key={value}>{value}</button>)}</div></div>
    <div className="setting-group"><label>Finish</label><Segmented values={["Glossy", "Matte"]} selected={finish} onSelect={setFinish} /></div>
    <div className="setting-group"><label>Thickness</label><div className="choice-stack">{["Standard 125 micron", "Thick 250 micron"].map((value) => <button className={thickness === value ? "selected" : ""} onClick={() => setThickness(value)} key={value}>{value}<i /></button>)}</div></div>
    <div className="setting-row"><div><label>Quantity</label><small>{quantity} item{quantity > 1 ? "s" : ""}</small></div><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div></div>
    <div className="walkin-notice"><Icon name="history" /><span><b>Bring items to the counter</b><small>Pay now to get a token. Hand over the physical items when your code is called.</small></span></div>
    <div className="sheet-dock"><div><span>Live price</span><b>₹{price}.00</b></div><button className="primary" onClick={() => { addService({ id: crypto.randomUUID(), name: `${item} lamination`, detail: `${finish} · ${thickness} · Qty ${quantity}`, price, mode: "walkin", label: "Pay now, hand over at counter", counterNote: `Bring: ${quantity} ${item}${quantity > 1 ? "s" : ""} for lamination. Show code 4821.` }); close(); }}>Add to basket</button></div>
  </SheetShell>;
}

function ScanningSheet({ close, addService }: { close: () => void; addService: (service: ServiceItem) => void }) {
  const [method, setMethod] = useState("Upload scans");
  const [pages, setPages] = useState(4);
  const [output, setOutput] = useState("Single PDF");
  const [email, setEmail] = useState("");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">DIGITISE PAGES</span><h2>Scanning to PDF</h2></div></div>
    <div className="setting-group"><label>How?</label><Segmented values={["Upload scans", "Walk-in"]} selected={method} onSelect={setMethod} /></div>
    <div className="setting-row"><div><label>Pages</label><small>₹5 per page</small></div><div className="stepper"><button onClick={() => setPages(Math.max(1, pages - 1))}>−</button><b>{pages}</b><button onClick={() => setPages(pages + 1)}>+</button></div></div>
    <div className="setting-group"><label>Output</label><Segmented values={["Single PDF", "Separate images"]} selected={output} onSelect={setOutput} /></div>
    <label className="field-label">Email me the PDF <small>optional</small></label><input className="range-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
    <div className="sheet-dock"><div><span>Live price</span><b>₹{pages * 5}.00</b></div><button className="primary" onClick={() => { addService({ id: crypto.randomUUID(), name: "Scanning to PDF", detail: `${pages} pages · ${output}`, price: pages * 5, mode: method === "Walk-in" ? "walkin" : "addon", label: method, counterNote: method === "Walk-in" ? `Bring: ${pages} pages for scanning. Show code 4821.` : undefined }); close(); }}>Add to basket</button></div>
  </SheetShell>;
}

function TypingSheet({ close, addService }: { close: () => void; addService: (service: ServiceItem) => void }) {
  const [type, setType] = useState("Resume");
  const [urgency, setUrgency] = useState("2 days");
  const [notes, setNotes] = useState("");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">REQUEST A QUOTE</span><h2>Typing & resume</h2></div></div>
    <div className="setting-group"><label>Type</label><div className="chip-row wrap">{["Resume", "Document typing", "Formatting", "Project report"].map((value) => <button className={type === value ? "active" : ""} onClick={() => setType(value)} key={value}>{value}</button>)}</div></div>
    <label className="field-label">Draft or notes</label><textarea className="service-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Paste text, explain the format, or mention what needs fixing." />
    <button className="upload-draft" onClick={() => notify("Draft upload opened")}><Icon name="upload" /> Upload a draft</button>
    <div className="setting-group"><label>Urgency</label><div className="chip-row">{["Today", "2 days", "Flexible"].map((value) => <button className={urgency === value ? "active" : ""} onClick={() => setUrgency(value)} key={value}>{value}</button>)}</div></div>
    <div className="quote-notice"><b>We’ll confirm the price</b><span>No payment now. The shop will review your request first.</span></div>
    <button className="primary full" disabled={!notes.trim()} onClick={() => { addService({ id: crypto.randomUUID(), name: type, detail: `${urgency} · ${notes}`, price: null, mode: "request", label: "Quote pending" }); close(); }}>Send quote request</button>
  </SheetShell>;
}

function CustomRequestSheet({ close, addService, initialNotes }: { close: () => void; addService: (service: ServiceItem) => void; initialNotes: string }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [time, setTime] = useState("Today");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">ASK THE SHOP</span><h2>Custom request</h2></div></div>
    <label className="field-label">Title</label><input className="range-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need?" />
    <label className="field-label">Notes</label><textarea className="service-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Sizes, quantity, material or anything useful." />
    <button className="upload-draft" onClick={() => notify("File or photo upload opened")}><Icon name="upload" /> Add a file or photo <small>optional</small></button>
    <div className="setting-group"><label>Preferred time</label><div className="chip-row">{["Today", "Tomorrow", "Flexible"].map((value) => <button className={time === value ? "active" : ""} onClick={() => setTime(value)} key={value}>{value}</button>)}</div></div>
    <button className="primary full" disabled={!title.trim() || !notes.trim()} onClick={() => { addService({ id: crypto.randomUUID(), name: title, detail: `${time} · ${notes}`, price: null, mode: "request", label: "Quote pending" }); close(); }}>Send to the shop</button>
  </SheetShell>;
}

function Checkout({ go, setSheet, services }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void; services: ServiceItem[] }) {
  const [payment, setPayment] = useState("UPI");
  const [phone, setPhone] = useState("");
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const pay = () => {
    if (payment === "Wallet") return go("failed");
    if (payment === "Cash") { notify("Order reserved. Pay at the counter."); return go("ticket"); }
    go("confirming");
  };
  return (
    <main className="page has-dock">
      <Topbar title="Checkout" back onBack={() => go("basket")} />
      <section className="checkout-ticket">
        <div className="ticket-top"><Brand /><span>HKBK Student Point</span></div>
        <div className="dotted" />
        <div className="summary-line"><span>3 files</span><b>31 sheets</b></div>
        {services.map((service) => <div className="summary-line service-summary" key={service.id}><span>{service.name}<small>{service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        <div className="summary-line"><span>Total</span><b>₹{total}.00</b></div>
        <button className="link-row" onClick={() => setSheet("breakdown")}>See full price breakdown <Icon name="chevron" size={16} /></button>
      </section>
      <label className="field-label">Get a ready alert <small>optional</small></label>
      <div className="phone-field"><span>+91</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone number" /><i>{phone.length === 10 ? "Alert on" : "Not saved"}</i></div>
      <section className="payment-section">
        <span className="kicker">PAYMENT</span>
        <button className={`payment-row ${payment === "UPI" ? "selected" : ""}`} onClick={() => setPayment("UPI")}><span className="pay-icon">UPI</span><span><strong>Pay by UPI</strong><small>GPay · PhonePe · Paytm</small></span><i /></button>
        <button className={`payment-row ${payment === "Wallet" ? "selected" : ""}`} onClick={() => setPayment("Wallet")}><span className="pay-icon">₹</span><span><strong>PrintBK wallet</strong><small>Balance ₹42 · Add ₹100, get ₹5 extra</small></span><i /></button>
        <button className={`payment-row ${payment === "Cash" ? "selected" : ""}`} onClick={() => setPayment("Cash")}><span className="pay-icon">CA</span><span><strong>Pay cash at counter</strong><small>Printing starts after payment</small></span><i /></button>
      </section>
      <div className="trust-note"><Icon name="check" size={16} /> Files are encrypted and auto-deleted.</div>
      <div className="bottom-dock vertical"><button className="primary full" onClick={pay}>{payment === "Cash" ? "Reserve and pay at counter" : payment === "Wallet" ? `Pay ₹${total} from wallet` : `Pay ₹${total} and print instantly`}</button><small>{payment === "Wallet" ? "Your wallet may need a top-up." : "Paid orders print automatically."}</small></div>
    </main>
  );
}

function PaymentState({ type, go, total }: { type: "confirming" | "paid"; go: (screen: Screen) => void; total: number }) {
  useEffect(() => {
    if (type === "confirming") { const t = setTimeout(() => go("paid"), 1800); return () => clearTimeout(t); }
    const t = setTimeout(() => go("ticket"), 1600); return () => clearTimeout(t);
  }, [type, go]);
  return (
    <main className="state-page">
      <Brand />
      <div className={`payment-visual ${type}`}>
        <div className="receipt-paper"><span /><span /><span /><b>₹{total}</b></div>
        {type === "paid" && <div className="paid-stamp">PAID<small>HKBK · 12:42</small></div>}
      </div>
      <h1>{type === "confirming" ? "Confirming payment" : "Payment done."}</h1>
      <p>{type === "confirming" ? "Keep this screen open for a moment." : "Your order just joined the print queue."}</p>
      {type === "confirming" && <div className="paper-feed wide"><span /></div>}
    </main>
  );
}

function FailedPayment({ go, total }: { go: (screen: Screen) => void; total: number }) {
  return (
    <main className="state-page failure-state">
      <Brand />
      <div className="failure-mark"><span>!</span><div className="receipt-paper"><b>₹{total}</b></div></div>
      <span className="kicker">NOT CHARGED</span>
      <h1>Payment didn’t go through.</h1>
      <p>Your files are safe. Your wallet has ₹42, so it needs ₹44 more.</p>
      <button className="primary" onClick={() => go("confirming")}>Retry with UPI</button>
      <button className="secondary-action" onClick={() => { notify("Cash payment selected"); go("ticket"); }}>Switch to cash</button>
      <button className="quiet-action" onClick={() => go("checkout")}>Back to payment options</button>
    </main>
  );
}

function Ticket({ go, setSheet, services }: { go: (screen: Screen) => void; setSheet: (sheet: Sheet) => void; services: ServiceItem[] }) {
  const [stage, setStage] = useState(0);
  const steps = ["Queued", "Printing", "Ready", "Collected"];
  const counterItems = services.filter((service) => service.mode === "walkin");
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  useEffect(() => {
    if (stage < 2) { const t = setTimeout(() => setStage(stage + 1), 3000); return () => clearTimeout(t); }
  }, [stage]);
  return (
    <main className="page ticket-page">
      <Topbar title="Order #1042" back onBack={() => go("entry")} action={<button className="icon-button" onClick={() => go("history")} aria-label="Order history"><Icon name="history" /></button>} />
      <div className={`ready-banner ${stage === 2 ? "visible" : ""}`}><Icon name="check" /> Ready for pickup</div>
      <section className="order-ticket">
        <div className="ticket-brand"><Brand /><span>{stage === 2 ? "READY" : "LIVE ORDER"}</span></div>
        <div className="order-no"><span>ORDER</span><b>#1042</b></div>
        <div className="pickup-code"><span>{stage === 2 ? "SHOW THIS AT THE COUNTER" : "PICKUP CODE"}</span><b>4821</b><button onClick={async () => { await navigator.clipboard?.writeText("4821"); notify("Pickup code copied"); }} aria-label="Copy pickup code"><Icon name="copy" size={18} /></button></div>
        <p className={stage === 2 ? "success-copy" : ""}>{stage === 0 ? "2 ahead of you, about 3 min" : stage === 1 ? "Printing now · about 1 min" : "Ready. Show code 4821 at the counter."}</p>
        <div className="tear"><span>✂</span></div>
        <div className="step-track">
          {steps.map((step, i) => <div key={step} className={`${i < stage ? "done" : ""} ${i === stage ? "current" : ""}`}><i>{i < stage ? <Icon name="check" size={12} /> : i + 1}</i><span>{step}</span></div>)}
        </div>
        <div className="ticket-files">{files.map((file) => <div key={file.name}><span>{file.name}</span><b>₹{file.price}</b></div>)}</div>
        {services.map((service) => <div className="ticket-service-line" key={service.id}><span>{service.name}<small>{service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        {counterItems.length > 0 && <div className="counter-items"><span className="kicker">COUNTER ITEMS</span>{counterItems.map((service) => <p key={service.id}>{service.counterNote ?? `Bring your items for ${service.name}. Show code 4821.`}</p>)}</div>}
        <div className="dotted" />
        <div className="ticket-total"><span>Total paid</span><b>₹{total}.00</b></div>
      </section>
      <div className="ticket-actions"><button onClick={() => setSheet("receipt")}><Icon name="download" /> Receipt</button><button onClick={() => shareReceipt(total)}><Icon name="share" /> Share</button></div>
      <button className="support-link" onClick={() => stage === 1 ? go("orderError") : setSheet("report")}>{stage === 1 ? "Printer issue?" : "Report a problem"}</button>
      <button className="delete-link" onClick={() => { notify("Your files were deleted"); go("entry"); }}><Icon name="trash" size={16} /> Delete my files now</button>
    </main>
  );
}

function ReceiptSheet({ setSheet, services }: { setSheet: (sheet: Sheet) => void; services: ServiceItem[] }) {
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  return (
    <SheetShell tall onClose={() => setSheet(null)}>
      <div className="sheet-title"><div><span className="kicker">PAYMENT RECEIPT</span><h2>Order #1042</h2></div><span className="receipt-paid">Paid</span></div>
      <article className="pdf-receipt">
        <header><Brand full /><span>04 SEP 2025<br />12:42 PM</span></header>
        <div className="receipt-code"><span>ORDER</span><b>#1042</b><i>UPI</i></div>
        <div className="dotted" />
        <div className="pdf-lines"><div><span>Engineering Mathematics<small>6 sheets · mixed colour</small></span><b>₹18</b></div><div><span>Thermodynamics Lab<small>18 sheets · auto colour</small></span><b>₹54</b></div><div><span>ID card front<small>colour · exact size</small></span><b>₹14</b></div>{services.map((service) => <div key={service.id}><span>{service.name}<small>{service.detail}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}</div>
        <div className="dotted" />
        <div className="pdf-total"><span>Total paid<small>UPI · ref 4821042</small></span><b>₹{total}.00</b></div>
        <div className="receipt-pickup"><span>PICKUP CODE</span><b>4821</b></div>
        <footer>HKBK Student Point · Bengaluru<br />Files auto-delete 10 minutes after printing.</footer>
      </article>
      <div className="receipt-actions"><button className="primary" onClick={() => printReceipt(services)}><Icon name="download" /> Save PDF</button><button onClick={() => shareReceipt(total)}><Icon name="share" /> Share</button></div>
      <button className="support-link" onClick={() => setSheet("report")}>Report a problem with this order</button>
    </SheetShell>
  );
}

function QuoteTicket({ go, services }: { go: (screen: Screen) => void; services: ServiceItem[] }) {
  const requests = services.filter((service) => service.mode === "request");
  return <main className="page ticket-page">
    <Topbar title="Request #Q1043" back onBack={() => go("basket")} />
    <section className="order-ticket quote-ticket">
      <div className="ticket-brand"><Brand /><span>WAITING FOR QUOTE</span></div>
      <div className="quote-clock"><span>…</span></div>
      <div className="order-no"><span>REQUEST</span><b>#Q1043</b></div>
      <h2>We’re checking the details.</h2>
      <p>The shop will confirm the price before anything is printed or charged.</p>
      <div className="tear"><span>✂</span></div>
      <div className="ticket-files">{requests.map((service) => <div key={service.id}><span>{service.name}<small>{service.detail}</small></span><b>Quote pending</b></div>)}</div>
      <div className="dotted" />
      <div className="ticket-total"><span>Amount due now</span><b>₹0.00</b></div>
    </section>
    <div className="quote-notice"><b>Nothing to pay yet</b><span>You’ll get a ready-to-review quote here.</span></div>
    <button className="secondary-action full-width" onClick={() => go("entry")}>Back to home</button>
  </main>;
}

function OrderError({ go, total }: { go: (screen: Screen) => void; total: number }) {
  const [waiting, setWaiting] = useState(false);
  return (
    <main className="state-page failure-state">
      <Brand />
      <div className="jam-visual"><div className="printer-box"><span /><i /></div><b>!</b></div>
      <span className="kicker">ORDER #1042 · PAUSED</span>
      <h1>{waiting ? "We’ll keep your place." : "Paper jam. We’re fixing it."}</h1>
      <p>{waiting ? "Your order is still next. We’ll alert you when printing resumes." : "Nothing is lost and you won’t be charged twice."}</p>
      <button className="primary" onClick={() => go("ticket")}>{waiting ? "Track my order" : "Retry now"}</button>
      <button className="secondary-action" onClick={() => setWaiting(true)}>Wait and alert me</button>
      <button className="quiet-action danger-text" onClick={() => { notify(`₹${total} refund started to your wallet`); go("history"); }}>Refund ₹{total} to wallet</button>
    </main>
  );
}

function ReportSheet({ close }: { close: () => void }) {
  const [problem, setProblem] = useState("");
  const [pages, setPages] = useState("");
  return (
    <SheetShell onClose={close}>
      <div className="sheet-title"><div><span className="kicker">ORDER #1042</span><h2>Receipt & support</h2></div></div>
      <div className="action-pair"><button onClick={() => printReceipt()}><Icon name="download" /> Save PDF receipt</button><button onClick={() => shareReceipt()}><Icon name="share" /> Share receipt</button></div>
      <div className="dotted" />
      <label>Report a problem</label>
      <div className="report-list">{["Smudged page", "Missing page", "Wrong settings", "Other"].map((x) => <button className={problem === x ? "selected" : ""} onClick={() => setProblem(x)} key={x}>{x}<span>{problem === x ? "●" : "○"}</span></button>)}</div>
      <input className="range-input muted-input" value={pages} onChange={(event) => setPages(event.target.value)} placeholder="Page numbers (optional)" />
      <button className="primary full" disabled={!problem} onClick={() => { notify("Report sent. We’ll help at the counter."); close(); }}>Send report</button>
    </SheetShell>
  );
}

function PhotoTool({ go, initialLayout }: { go: (screen: Screen) => void; initialLayout: string }) {
  const [layout, setLayout] = useState(initialLayout);
  const [ratio, setRatio] = useState("3:4");
  const [fit, setFit] = useState("Fill");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(42);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [filledAll, setFilledAll] = useState(true);
  const [photoSrc, setPhotoSrc] = useState("");
  const [cardPhotos, setCardPhotos] = useState<string[]>(["", ""]);
  const [customRows, setCustomRows] = useState(3);
  const [customColumns, setCustomColumns] = useState(3);
  const [photoOffset, setPhotoOffset] = useState({ x: 0, y: 0 });
  const [slotScale, setSlotScale] = useState(100);
  const photoInput = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const resizeState = useRef<{ x: number; origin: number } | null>(null);
  const isCardLayout = layout === "ID card" || layout === "Aadhaar";
  const customSlots = customRows * customColumns;
  const layouts: Record<string, { slots: number; className: string; label: string; price: number; ratio: string }> = {
    "1": { slots: 1, className: "layout-one", label: "Full-page photo", price: 10, ratio: "Auto" },
    "2": { slots: 2, className: "layout-two", label: "Two large photos", price: 15, ratio: "Auto" },
    "4": { slots: 4, className: "layout-four", label: "Four equal photos", price: 20, ratio: "Auto" },
    "Passport 8-up": { slots: 8, className: "layout-passport", label: "35 × 45 mm passport", price: 40, ratio: "3:4" },
    "4×6": { slots: 2, className: "layout-4x6", label: "Two 4 × 6 inch prints", price: 30, ratio: "2:3" },
    "ID card": { slots: 2, className: "layout-id", label: "Front and back · 85.6 × 54 mm", price: 20, ratio: "Card" },
    "Aadhaar": { slots: 2, className: "layout-aadhaar", label: "Front and back · exact size", price: 20, ratio: "Card" },
    "Resume": { slots: 1, className: "layout-resume", label: "One full A4 page", price: 10, ratio: "Auto" },
    "Custom": { slots: customSlots, className: "layout-custom", label: `${customColumns} × ${customRows} custom grid`, price: 20 + customSlots * 3, ratio: ratio },
  };
  const config = layout ? layouts[layout] : { slots: 1, className: "layout-one empty-layout", label: "Choose a layout below", price: 0, ratio: "Auto" };
  const selectLayout = (value: string) => {
    setLayout(value);
    setSelectedSlot(0);
    setFilledAll(true);
    setSlotScale(100);
    setPhotoOffset({ x: 0, y: 0 });
    if (layouts[value].ratio === "3:4") setRatio("3:4");
    notify(`${layouts[value].label} selected`);
  };
  const importPhoto = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (isCardLayout) setCardPhotos((photos) => photos.map((photo, index) => index === selectedSlot ? url : photo));
    else setPhotoSrc(url);
    setFilledAll(true);
    notify(isCardLayout ? `${selectedSlot === 0 ? "Front" : "Back"} image added` : "Photo imported and fitted");
  };
  const imageStyle: React.CSSProperties = {
    objectFit: fit === "Fit" ? "contain" : fit === "Fill" ? "cover" : "fill",
    transform: `translate(${photoOffset.x}px, ${photoOffset.y}px) scale(${1 + zoom / 180}) rotate(${rotation}deg)`,
  };
  return (
    <main className="page has-dock photo-page">
      <Topbar title="Photo print" back onBack={() => go("entry")} />
      <input ref={photoInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/heic,image/heif" onChange={(event) => importPhoto(event.target.files?.[0])} />
      <section className="photo-context">
        <div><span className="kicker">A4 PHOTO SHEET</span><h1>Place it once.<br />We’ll size the rest.</h1></div>
        <button onClick={() => photoInput.current?.click()}><Icon name="camera" /><span>{isCardLayout ? `${selectedSlot === 0 ? "Front" : "Back"} image` : photoSrc ? "Change photo" : "Choose photo"}<small>JPG, PNG or HEIC</small></span></button>
      </section>
      <div className="photo-preview">
        <div className="sheet-toolbar"><span>LIVE PREVIEW</span><b>{config.slots} SLOT{config.slots > 1 ? "S" : ""}</b></div>
        <div className={`photo-sheet ${config.className}`} style={layout === "Custom" ? { gridTemplateColumns: `repeat(${customColumns}, 1fr)`, gridTemplateRows: `repeat(${customRows}, 1fr)` } : undefined}>
          {Array.from({ length: config.slots }, (_, i) => {
            const slotPhoto = isCardLayout ? cardPhotos[i] : photoSrc;
            const hasPhoto = Boolean(layout) && (isCardLayout ? Boolean(slotPhoto) : filledAll || i === 0);
            return <div key={`photo-slot-${layout || "empty"}-${i}`} role="button" tabIndex={0} className={`photo-slot ${i === selectedSlot ? "selected" : ""} ${hasPhoto ? "filled" : "empty"}`} style={i === selectedSlot ? { transform: `scale(${slotScale / 100})` } : undefined} onClick={() => setSelectedSlot(i)} onKeyDown={(event) => event.key === "Enter" && setSelectedSlot(i)} onPointerDown={(event) => {
              if (!hasPhoto) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragState.current = { x: event.clientX, y: event.clientY, originX: photoOffset.x, originY: photoOffset.y };
            }} onPointerMove={(event) => {
              if (!dragState.current) return;
              setPhotoOffset({ x: Math.max(-45, Math.min(45, dragState.current.originX + event.clientX - dragState.current.x)), y: Math.max(-45, Math.min(45, dragState.current.originY + event.clientY - dragState.current.y)) });
            }} onPointerUp={() => { dragState.current = null; }}>
              {slotPhoto && hasPhoto ? <img src={slotPhoto} alt="" style={imageStyle} /> : !isCardLayout && hasPhoto ? <span className="avatar-shape" style={{ transform: `scale(${1 + zoom / 180}) rotate(${rotation}deg)` }} /> : <span className="empty-slot"><strong>+</strong><small>Add {i === 0 ? "front" : "back"}</small></span>}
              {i === selectedSlot && <span className="slot-handles" key={`slot-handles-${i}`}><i /><b className="resize-handle" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeState.current = { x: event.clientX, origin: slotScale }; }} onPointerMove={(event) => { if (resizeState.current) setSlotScale(Math.max(72, Math.min(100, resizeState.current.origin + (event.clientX - resizeState.current.x) / 2))); }} onPointerUp={(event) => { event.stopPropagation(); resizeState.current = null; }} /></span>}
              {(layout === "ID card" || layout === "Aadhaar") && <em>{i === 0 ? "FRONT" : "BACK"}</em>}
            </div>;
          })}
        </div>
        <div className="sheet-caption"><span>A4 · {config.label}</span><b>{ratio} crop</b></div>
        {layout && <div className="edit-hint">Drag the photo to position it · pull the lime corner to resize</div>}
      </div>
      <div className="photo-section-title"><label>Choose layout</label><span>Exact print sizes</span></div>
      <div className="layout-scroll">{Object.keys(layouts).map((value) => <button className={layout === value ? "active" : ""} onClick={() => selectLayout(value)} key={value}><b>{value}</b><small>{layouts[value].slots} slot{layouts[value].slots > 1 ? "s" : ""}</small></button>)}</div>
      {isCardLayout && <div className="card-side-switch"><button className={selectedSlot === 0 ? "active" : ""} onClick={() => setSelectedSlot(0)}><span>1</span><b>Front</b><small>{cardPhotos[0] ? "Image ready" : "Add image"}</small></button><button className={selectedSlot === 1 ? "active" : ""} onClick={() => setSelectedSlot(1)}><span>2</span><b>Back</b><small>{cardPhotos[1] ? "Image ready" : "Add image"}</small></button></div>}
      {layout === "Custom" && <div className="custom-grid-controls"><div><span><b>Columns</b><small>Across the page</small></span><div className="stepper"><button onClick={() => setCustomColumns(Math.max(1, customColumns - 1))}>−</button><b>{customColumns}</b><button onClick={() => setCustomColumns(Math.min(4, customColumns + 1))}>+</button></div></div><div><span><b>Rows</b><small>Down the page</small></span><div className="stepper"><button onClick={() => setCustomRows(Math.max(1, customRows - 1))}>−</button><b>{customRows}</b><button onClick={() => setCustomRows(Math.min(5, customRows + 1))}>+</button></div></div></div>}
      <div className="tool-panel">
        <div><label>Crop ratio <span>Slot {selectedSlot + 1}</span></label><div className="chip-row">{["Original", "3:4", "1:1"].map((value) => <button className={ratio === value ? "active" : ""} onClick={() => setRatio(value)} key={value}>{value}</button>)}</div></div>
        <div><label>Image fit</label><Segmented values={["Fit", "Fill", "Stretch"]} selected={fit} onSelect={setFit} /></div>
        <label className="zoom-control"><span>Zoom <b>{zoom}%</b></span><input type="range" min="0" max="100" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <div className="action-pair"><button onClick={() => setRotation((rotation + 90) % 360)}>↻ Rotate 90°</button>{isCardLayout ? <button onClick={() => photoInput.current?.click()}>Replace {selectedSlot === 0 ? "front" : "back"}</button> : <button className={filledAll ? "active" : ""} onClick={() => { setFilledAll(!filledAll); notify(filledAll ? "Only the first slot is filled" : `Filled all ${config.slots} slots`); }}>{filledAll ? "Clear repeats" : "Fill all slots"}</button>}</div>
      </div>
      <div className={`photo-safe-note ${!layout || (isCardLayout ? cardPhotos.some((photo) => !photo) : !photoSrc) ? "pending" : ""}`}><Icon name={!layout || (isCardLayout ? cardPhotos.some((photo) => !photo) : !photoSrc) ? "camera" : "check"} /> {!layout ? "Choose a layout to build your sheet." : isCardLayout && cardPhotos.some((photo) => !photo) ? "Add both front and back to continue." : !photoSrc ? "Choose a photo to start editing." : "Faces, edges and print size checked."}</div>
      <div className="bottom-dock"><div className="total-block"><span>{layout ? `1 A4 sheet · ${config.slots} slots` : "Choose a layout"}</span><b>{layout ? `₹${config.price}.00` : "—"}</b><small>{layout ? "No hidden charges" : "Price appears here"}</small></div><button className="primary" disabled={!layout || (isCardLayout ? cardPhotos.some((photo) => !photo) : !photoSrc)} onClick={() => { notify(`${config.label} added to basket`); go("basket"); }}>{isCardLayout && cardPhotos.some((photo) => !photo) ? "Add front + back" : "Add photo sheet"}</button></div>
    </main>
  );
}

function History({ go }: { go: (screen: Screen) => void }) {
  const [balance, setBalance] = useState(42);
  return (
    <main className="page">
      <Topbar title="History & wallet" back onBack={() => go("entry")} />
      <section className="wallet-card"><span>PRINTBK WALLET</span><b>₹{balance}.00</b><button onClick={() => { setBalance(balance + 100); notify("₹100 added. ₹5 bonus is on us."); }}>Add money</button><small>You saved <strong>64 sheets</strong> this month.</small></section>
      <div className="section-heading"><h2>Past orders</h2><span>Last 30 days</span></div>
      {[["#1031", "Yesterday · 4 files", "₹112"], ["#1014", "12 Aug · 2 files", "₹46"], ["#0988", "04 Aug · 1 file", "₹18"]].map((x) => <section className="history-ticket" key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><strong>{x[2]}</strong><button onClick={() => go("basket")}>Reprint</button></section>)}
    </main>
  );
}

function Settings({ go }: { go: (screen: Screen) => void }) {
  const [cleared, setCleared] = useState(false);
  return (
    <main className="page">
      <Topbar title="Settings" back onBack={() => go("entry")} />
      <section className="settings-list">
        <button onClick={() => notify("2 presets: Class notes and Lab records")}><span><strong>Saved presets</strong><small>Class notes · Lab records</small></span><Icon name="chevron" /></button>
        <button onClick={() => notify("Add your number during checkout for ready alerts")}><span><strong>Phone number</strong><small>Not added</small></span><Icon name="chevron" /></button>
        <button onClick={() => notify("PrintBK 1.0 · Built for faster campus printing")}><span><strong>About PrintBK</strong><small>Version 1.0 · Made for students</small></span><Icon name="chevron" /></button>
        <button className="danger" disabled={cleared} onClick={() => { setCleared(true); localStorage.clear(); notify("Local data cleared"); }}><span><strong>{cleared ? "Data cleared" : "Clear my data from this device"}</strong><small>{cleared ? "This device is clean" : "Your active order stays safe"}</small></span>{cleared ? <Icon name="check" /> : <Icon name="trash" />}</button>
      </section>
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [photoPreset, setPhotoPreset] = useState("");
  const [bindingPreset, setBindingPreset] = useState("Spiral");
  const [customDraft, setCustomDraft] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#F7F4EE");
    const t = setTimeout(() => setScreen("entry"), 1400);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const showToast = (event: Event) => {
      setToast((event as CustomEvent<string>).detail);
      window.setTimeout(() => setToast(""), 2600);
    };
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener("printbk:toast", showToast);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("printbk:toast", showToast);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);
  const go = (next: Screen) => { setSheet(null); setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openPhoto = (layout: string) => { setPhotoPreset(layout); go("photo"); };
  const openBinding = (type: string) => { setBindingPreset(type); setSheet("binding"); };
  const openCustom = (note: string) => { setCustomDraft(note); setSheet("custom"); };
  const addService = (service: ServiceItem) => {
    setServices((current) => [...current, service]);
    notify(`${service.name} added`);
  };
  const orderTotal = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const navVisible = ["entry", "history", "settings"].includes(screen) && !sheet;
  const view = useMemo(() => {
    if (screen === "splash") return <Splash />;
    if (screen === "entry") return <Entry go={go} setSheet={setSheet} openPhoto={openPhoto} />;
    if (screen === "uploading") return <Uploading go={go} />;
    if (screen === "basket") return <Basket go={go} setSheet={setSheet} services={services} />;
    if (screen === "empty") return <EmptyBasket go={go} />;
    if (screen === "preview") return <PrintPreview go={go} />;
    if (screen === "services") return <OtherServices go={go} setSheet={setSheet} addService={addService} openBinding={openBinding} openCustom={openCustom} />;
    if (screen === "photo") return <PhotoTool go={go} initialLayout={photoPreset} />;
    if (screen === "checkout") return <Checkout go={go} setSheet={setSheet} services={services} />;
    if (screen === "confirming" || screen === "paid") return <PaymentState type={screen} go={go} total={orderTotal} />;
    if (screen === "failed") return <FailedPayment go={go} total={orderTotal} />;
    if (screen === "ticket") return <Ticket go={go} setSheet={setSheet} services={services} />;
    if (screen === "quoteTicket") return <QuoteTicket go={go} services={services} />;
    if (screen === "orderError") return <OrderError go={go} total={orderTotal} />;
    if (screen === "history") return <History go={go} />;
    return <Settings go={go} />;
  }, [screen, sheet, photoPreset, bindingPreset, customDraft, services]);
  return (
    <div className={`app ${navVisible ? "nav-visible" : ""} ${sheet ? "sheet-open" : ""}`} data-screen={screen}>
      <div className="motion-scene" aria-hidden="true">
        <i className="motion-paper paper-one"><span /></i>
        <i className="motion-paper paper-two"><span /></i>
        <i className="motion-registration">+</i>
        <i className="motion-track" />
      </div>
      <div className={`offline-banner ${offline ? "visible" : ""}`}>You’re offline. Your basket is saved.</div>
      <div className="screen-transition" key={screen}>{view}</div>
      {navVisible && <MobileNav active={screen} go={go} />}
      {sheet === "settings" && <SettingsSheet setSheet={setSheet} />}
      {sheet === "picker" && <PickerSheet setSheet={setSheet} />}
      {sheet === "breakdown" && <BreakdownSheet close={() => setSheet(null)} services={services} />}
      {sheet === "receipt" && <ReceiptSheet setSheet={setSheet} services={services} />}
      {sheet === "report" && <ReportSheet close={() => setSheet(null)} />}
      {sheet === "binding" && <BindingSheet close={() => setSheet(null)} addService={addService} initialType={bindingPreset} />}
      {sheet === "lamination" && <LaminationSheet close={() => setSheet(null)} addService={addService} />}
      {sheet === "scanning" && <ScanningSheet close={() => setSheet(null)} addService={addService} />}
      {sheet === "typing" && <TypingSheet close={() => setSheet(null)} addService={addService} />}
      {sheet === "custom" && <CustomRequestSheet close={() => setSheet(null)} addService={addService} initialNotes={customDraft} />}
      <div className={`toast ${toast ? "visible" : ""}`} role="status"><Icon name="check" size={16} /> {toast}</div>
    </div>
  );
}
