import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function ReportSheet({
  close
}: {
  close: () => void;
}) {
  const [problem, setProblem] = useState("");
  const [pages, setPages] = useState("");
  return <SheetShell onClose={close}>
      <div className="sheet-title"><div><span className="kicker">ORDER #1042</span><h2>Receipt & support</h2></div></div>
      <div className="action-pair"><button onClick={() => printReceipt()}><Icon name="download" /> Save PDF receipt</button><button onClick={() => shareReceipt()}><Icon name="share" /> Share receipt</button></div>
      <div className="dotted" />
      <label>Report a problem</label>
      <div className="report-list">{["Smudged page", "Missing page", "Wrong settings", "Other"].map(x => <button className={problem === x ? "selected" : ""} onClick={() => setProblem(x)} key={x}>{x}<span>{problem === x ? "●" : "○"}</span></button>)}</div>
      <input className="range-input muted-input" value={pages} onChange={event => setPages(event.target.value)} placeholder="Page numbers (optional)" />
      <button className="primary full" disabled={!problem} onClick={() => {
      notify("Report sent. We’ll help at the counter.");
      close();
    }}>Send report</button>
    </SheetShell>;
}
export default ReportSheet;



