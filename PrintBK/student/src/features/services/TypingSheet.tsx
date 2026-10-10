import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function TypingSheet({
  close,
  addService
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
}) {
  const [type, setType] = useState("Resume");
  const [urgency, setUrgency] = useState("2 days");
  const [notes, setNotes] = useState("");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">REQUEST A QUOTE</span><h2>Typing & resume</h2></div></div>
    <div className="setting-group"><label>Type</label><div className="chip-row wrap">{["Resume", "Document typing", "Formatting", "Project report"].map(value => <button className={type === value ? "active" : ""} onClick={() => setType(value)} key={value}>{value}</button>)}</div></div>
    <label className="field-label">Draft or notes</label><textarea className="service-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Paste text, explain the format, or mention what needs fixing." />
    <button className="upload-draft" onClick={() => notify("Draft upload opened")}><Icon name="upload" /> Upload a draft</button>
    <div className="setting-group"><label>Urgency</label><div className="chip-row">{["Today", "2 days", "Flexible"].map(value => <button className={urgency === value ? "active" : ""} onClick={() => setUrgency(value)} key={value}>{value}</button>)}</div></div>
    <div className="quote-notice"><b>We’ll confirm the price</b><span>No payment now. The shop will review your request first.</span></div>
    <button className="primary full" disabled={!notes.trim()} onClick={() => {
      addService({
        id: crypto.randomUUID(), type: 'addon',
        name: type,
        detail: `${urgency} · ${notes}`,
        price: undefined,
        mode: "request",
        label: "Quote pending"
      });
      close();
    }}>Send quote request</button>
  </SheetShell>;
}
export default TypingSheet;



