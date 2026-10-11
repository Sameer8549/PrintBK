import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function ScanningSheet({
  close,
  addService
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
}) {
  const [method, setMethod] = useState("Upload scans");
  const [pages, setPages] = useState(4);
  const [output, setOutput] = useState("Single PDF");
  const [email, setEmail] = useState("");
  return <SheetShell onClose={close}>
    <div className="sheet-title"><div><span className="kicker">DIGITISE PAGES</span><h2>Scanning to PDF</h2></div></div>
    <div className="setting-group"><label>How?</label><Segmented values={["Upload scans", "Walk-in"]} selected={method} onSelect={setMethod} /></div>
    <div className="setting-row"><div><label>Pages</label><small>₹5 per page</small></div><div className="stepper"><button onClick={() => setPages(Math.max(1, pages - 1))}>−</button><b>{pages}</b><button onClick={() => setPages(pages + 1)}>+</button></div></div>
    <div className="setting-group"><label>Output</label><Segmented values={["Single PDF", "Separate images"]} selected={output} onSelect={setOutput} /></div>
    <label className="field-label">Email me the PDF <small>optional</small></label><input className="range-input" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
    <div className="sheet-dock"><div><span>Live price</span><b>₹{pages * 5}.00</b></div><button className="primary" onClick={() => {
        addService({
          id: crypto.randomUUID(), type: 'addon',
          name: "Scanning to PDF",
          detail: `${pages} pages · ${output}`,
          price: pages * 5,
          mode: method === "Walk-in" ? "walkin" : "addon",
          label: method,
          counterNote: method === "Walk-in" ? `Bring: ${pages} pages for scanning. Show code 4821.` : undefined
        });
        close();
      }}>Add to basket</button></div>
  </SheetShell>;
}
export default ScanningSheet;




