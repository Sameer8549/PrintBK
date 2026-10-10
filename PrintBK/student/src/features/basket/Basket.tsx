import FileCard from './FileCard';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Basket({
  go,
  setSheet,
  services
}: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: ServiceItem[];
}) {
  const [same, setSame] = useState(false);
  const pricedServices = services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  const total = 86 + pricedServices;
  const standalone = services.filter(service => service.mode !== "addon" || !service.attachTo);
  const hasQuote = services.some(service => service.mode === "request");
  return <main className="page has-dock">
      <Topbar title="Your basket" back onBack={() => go("entry")} action={<button className="text-button" onClick={() => go("empty")}>Clear</button>} />
      <div className="basket-heading"><div><span className="kicker">3 FILES READY</span><h1>Check before we print.</h1></div><button className={`switch ${same ? "on" : ""}`} onClick={() => setSame(!same)}><i /></button></div>
      <div className="same-row"><span>Apply same settings to all</span><small>Smart defaults are on</small></div>
      <div className="file-list">
        {files.map((file, i) => <FileCard key={file.name} file={file} index={i} services={services} onClick={() => setSheet("settings")} />)}
      </div>
      {standalone.length > 0 && <div className="basket-services">{standalone.map(service => <section key={service.id}><span className={`service-mode ${service.mode}`}>{service.mode === "walkin" ? "COUNTER" : "REQUEST"}</span><div><strong>{service.name}</strong><small>{service.detail}</small><i>{service.label}</i></div><b>{service.price === null ? "Quote pending" : `₹${service.price}`}</b></section>)}</div>}
      <button className="add-more" onClick={() => browseFiles(go)}><span>+</span> Add more files</button>
      <button className="safe-note" onClick={() => go("preview")}><Icon name="check" size={16} /> We checked margins, blank pages and image quality. <b>Preview</b></button>
      <div className="bottom-dock">
        <button className="total-block" onClick={() => setSheet("breakdown")}><span>3 files · 31 sheets{services.length ? ` · ${services.length} services` : ""}</span><b>₹{total}.00</b><small>View breakdown</small></button>
        <button className="primary" onClick={() => go(hasQuote ? "quoteTicket" : "checkout")}>{hasQuote ? "Send for quote" : "Continue to pay"} <span>→</span></button>
      </div>
    </main>;
}
export default Basket;



