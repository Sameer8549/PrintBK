import React, { useState, useEffect } from 'react';
import { Icon, Brand, Topbar, Segmented } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';
import { browseAndAddFiles } from '../../lib/filePicker';
import { defaultShopConfig } from '@printbk/shared';

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
  const basket = useBasket();
  const addFile = useBasket(s => s.addFile);
  const cfg = defaultShopConfig;

  return <main className="page entry">
      <header className="entry-header">
        <Brand full />
        <div className="header-buttons">
          <button className="icon-button" onClick={() => go("history")} aria-label="Order history"><Icon name="history" /></button>
          <button className="icon-button" onClick={() => go("settings")} aria-label="Settings"><Icon name="more" /></button>
        </div>
      </header>
      <section className="shop-intro">
        <div className="eyebrow">YOU'RE AT</div>
        <h1>HKBK Student Point</h1>
        <div className="status-chip"><i /> Open</div>
      </section>
      <Segmented values={["Documents", "Photos", "Other Services"]} selected={tab} onSelect={v => {
      setTab(v);
      if (v === "Photos") openPhoto("");
      if (v === "Other Services") go("services");
    }} />
      <button className="drop-zone" onClick={() => browseAndAddFiles(go, addFile)}>
        <span className="upload-icon"><Icon name="upload" size={24} /></span>
        <strong>Drop your files here</strong>
        <small>or tap to browse</small>
        <span className="format-row">{["PDF", "DOCX", "PPT", "XLSX", "JPG", "PNG"].map(x => <i key={x}>{x}</i>)}</span>
      </button>
      {basket.files.length > 0 && (
        <button className="reprint-card" onClick={() => go("basket")}>
          <span className="mini-ticket"><b>{basket.files.length}</b><i>file{basket.files.length !== 1 ? 's' : ''} in basket</i></span>
          <span><small>Tap to review and pay</small><strong>Open basket</strong></span>
          <Icon name="chevron" />
        </button>
      )}
      <button className="price-strip" onClick={() => setSheet("breakdown")}>
        <span>B&W Single <b>₹1.50</b></span><i /> <span>Double <b>₹0.85</b></span><i /> <span>Colour <b>₹8.00</b></span>
      </button>
      <footer>Files auto-delete <b>{cfg.autoDeleteDelay} minutes</b> after printing.</footer>
    </main>;
}
export default Entry;
