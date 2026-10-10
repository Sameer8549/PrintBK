import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Uploading({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const [paused, setPaused] = useState(true);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (!paused && retried) {
      const timer = setTimeout(() => go("basket"), 1400);
      return () => clearTimeout(timer);
    }
  }, [paused, retried, go]);
  return <main className="page upload-page">
      <Topbar title="Preparing files" back onBack={() => go("entry")} />
      <div className="upload-heading"><span className="kicker">SMART CHECKS RUNNING</span><h1>Getting everything print-ready.</h1><p>You can fix anything before paying.</p></div>
      <div className="upload-stack">
        <section className="upload-card complete"><span className="file-thumb"><Icon name="file" /><b>PDF</b></span><div><strong>Engineering_Mathematics_Unit-4.pdf</strong><small>40 pages · checked</small><div className="progress"><i /></div></div><Icon name="check" /></section>
        <section className={`upload-card ${paused ? "paused" : ""}`}><span className="file-thumb"><Icon name="file" /><b>DOCX</b></span><div><strong>Thermodynamics_Lab_Record.docx</strong><small>{paused ? "Upload paused" : "Uploading · 78%"}</small><div className="progress"><i /></div></div><button onClick={() => {
          setPaused(!paused);
          notify(paused ? "Upload resumed" : "Upload paused");
        }}>{paused ? "Resume" : "Pause"}</button></section>
        <section className={`upload-card ${retried ? "" : "failed"}`}><span className="file-thumb"><Icon name="file" /><b>PNG</b></span><div><strong>ID_card_front.png</strong><small>{retried ? "Uploading · 92%" : "Connection dropped. File is safe."}</small><div className="progress"><i /></div></div><button onClick={() => {
          setRetried(true);
          notify("Retrying upload");
        }}>Retry</button></section>
      </div>
      <div className="upload-foot"><div className="scanner-line" /><span>Checking margins, colour pages and blanks</span></div>
      <button className="primary full" disabled={paused || !retried} onClick={() => go("basket")}>Open basket</button>
    </main>;
}
export default Uploading;



