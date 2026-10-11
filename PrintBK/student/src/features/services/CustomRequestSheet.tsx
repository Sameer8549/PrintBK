import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function CustomRequestSheet({
  close,
  addService,
  initialNotes
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
  initialNotes: string;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [time, setTime] = useState("Today");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">ASK THE SHOP</span><h2>Custom request</h2></div></div>
    <label className="field-label">Title</label><input className="range-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="What do you need?" />
    <label className="field-label">Notes</label><textarea className="service-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Sizes, quantity, material or anything useful." />
    <button className="upload-draft" onClick={() => notify("File or photo upload opened")}><Icon name="upload" /> Add a file or photo <small>optional</small></button>
    <div className="setting-group"><label>Preferred time</label><div className="chip-row">{["Today", "Tomorrow", "Flexible"].map(value => <button className={time === value ? "active" : ""} onClick={() => setTime(value)} key={value}>{value}</button>)}</div></div>
    <button className="primary full" disabled={!title.trim() || !notes.trim()} onClick={() => {
      addService({
        id: crypto.randomUUID(), type: 'addon',
        name: title,
        detail: `${time} · ${notes}`,
        price: undefined,
        mode: "request",
        label: "Quote pending"
      });
      close();
    }}>Send to the shop</button>
  </SheetShell>;
}
export default CustomRequestSheet;




