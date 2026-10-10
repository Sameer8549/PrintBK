import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Ticket({
  go,
  setSheet,
  services
}: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: ServiceItem[];
}) {
  const [stage, setStage] = useState(0);
  const steps = ["Queued", "Printing", "Ready", "Collected"];
  const counterItems = services.filter(service => service.mode === "walkin");
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  useEffect(() => {
    if (stage < 2) {
      const t = setTimeout(() => setStage(stage + 1), 3000);
      return () => clearTimeout(t);
    }
  }, [stage]);
  return <main className="page ticket-page">
      <Topbar title="Order #1042" back onBack={() => go("entry")} action={<button className="icon-button" onClick={() => go("history")} aria-label="Order history"><Icon name="history" /></button>} />
      <div className={`ready-banner ${stage === 2 ? "visible" : ""}`}><Icon name="check" /> Ready for pickup</div>
      <section className="order-ticket">
        <div className="ticket-brand"><Brand /><span>{stage === 2 ? "READY" : "LIVE ORDER"}</span></div>
        <div className="order-no"><span>ORDER</span><b>#1042</b></div>
        <div className="pickup-code"><span>{stage === 2 ? "SHOW THIS AT THE COUNTER" : "PICKUP CODE"}</span><b>4821</b><button onClick={async () => {
          await navigator.clipboard?.writeText("4821");
          notify("Pickup code copied");
        }} aria-label="Copy pickup code"><Icon name="copy" size={18} /></button></div>
        <p className={stage === 2 ? "success-copy" : ""}>{stage === 0 ? "2 ahead of you, about 3 min" : stage === 1 ? "Printing now · about 1 min" : "Ready. Show code 4821 at the counter."}</p>
        <div className="tear"><span>✂</span></div>
        <div className="step-track">
          {steps.map((step, i) => <div key={step} className={`${i < stage ? "done" : ""} ${i === stage ? "current" : ""}`}><i>{i < stage ? <Icon name="check" size={12} /> : i + 1}</i><span>{step}</span></div>)}
        </div>
        <div className="ticket-files">{files.map(file => <div key={file.name}><span>{file.name}</span><b>₹{file.price}</b></div>)}</div>
        {services.map(service => <div className="ticket-service-line" key={service.id}><span>{service.name}<small>{service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        {counterItems.length > 0 && <div className="counter-items"><span className="kicker">COUNTER ITEMS</span>{counterItems.map(service => <p key={service.id}>{service.counterNote ?? `Bring your items for ${service.name}. Show code 4821.`}</p>)}</div>}
        <div className="dotted" />
        <div className="ticket-total"><span>Total paid</span><b>₹{total}.00</b></div>
      </section>
      <div className="ticket-actions"><button onClick={() => setSheet("receipt")}><Icon name="download" /> Receipt</button><button onClick={() => shareReceipt(total)}><Icon name="share" /> Share</button></div>
      <button className="support-link" onClick={() => stage === 1 ? go("orderError") : setSheet("report")}>{stage === 1 ? "Printer issue?" : "Report a problem"}</button>
      <button className="delete-link" onClick={() => {
      notify("Your files were deleted");
      go("entry");
    }}><Icon name="trash" size={16} /> Delete my files now</button>
    </main>;
}
export default Ticket;



