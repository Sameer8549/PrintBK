import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Entry({
  go,
  setSheet,
  openPhoto
}: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  openPhoto: (layout: string) => void;
}) {
  const [tab, setTab] = useState("Documents");
  return <main className="page entry">
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
      <Segmented values={["Documents", "Photos", "Other Services"]} selected={tab} onSelect={v => {
      setTab(v);
      if (v === "Photos") openPhoto("");
      if (v === "Other Services") go("services");
    }} />
      <button className="drop-zone" onClick={() => browseFiles(go)}>
        <span className="upload-icon"><Icon name="upload" size={24} /></span>
        <strong>Drop your files here</strong>
        <small>or tap to browse</small>
        <span className="format-row">{["PDF", "DOCX", "PPT", "XLSX", "JPG", "PNG"].map(x => <i key={x}>{x}</i>)}</span>
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
    </main>;
}
export default Entry;



