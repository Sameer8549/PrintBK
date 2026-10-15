import React, { useState, useEffect } from 'react';
import { Icon, Brand, Topbar, Segmented } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';
import { browseAndAddFiles } from '../../lib/filePicker';
import { defaultShopConfig, ShopConfig } from '@printbk/shared';
import { api } from '../../services/api';

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
  const [cfg, setCfg] = useState<ShopConfig & { open?: boolean; announcement?: string; shopInfo?: any }>(defaultShopConfig);
  const basket = useBasket();
  const addFile = useBasket(s => s.addFile);

  useEffect(() => {
    let isMounted = true;
    api.getConfig().then((data) => {
      if (isMounted && data) {
        setCfg(data);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const isOpen = cfg.open !== false;
  const shopName = cfg.shopInfo?.name || "HKBK Student Point";
  const bwSingle = cfg.rates?.bwSingle ?? 1.5;
  const bwDouble = cfg.rates?.bwDouble ?? 0.85;
  const colourRate = cfg.rates?.colour ?? 8.0;

  const handleUploadClick = () => {
    if (!isOpen) {
      notify(cfg.announcement || 'Shop is currently closed. Ordering is paused.');
      return;
    }
    browseAndAddFiles(go, addFile);
  };

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
        <div className="eyebrow">YOU'RE AT</div>
        <h1>{shopName}</h1>
        {isOpen ? (
          <div className="status-chip"><i /> Open</div>
        ) : (
          <div className="status-chip is-closed" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <i style={{ background: '#ef4444' }} /> Closed
          </div>
        )}
      </section>

      {!isOpen && (
        <div className="shop-announcement" style={{ margin: '8px 0 16px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#991b1b', fontSize: 13 }}>
          <strong>Shop Closed: </strong>
          <span>{cfg.announcement || 'Counter orders are currently paused. Please check back shortly.'}</span>
        </div>
      )}

      <Segmented values={["Documents", "Photos", "Other Services"]} selected={tab} onSelect={v => {
        setTab(v);
        if (v === "Photos") openPhoto("");
        if (v === "Other Services") go("services");
      }} />
      <button className="drop-zone" onClick={handleUploadClick} style={{ opacity: isOpen ? 1 : 0.65 }}>
        <span className="upload-icon"><Icon name="upload" size={24} /></span>
        <strong>{isOpen ? "Drop your files here" : "Ordering is paused"}</strong>
        <small>{isOpen ? "or tap to browse" : "Shop is currently closed"}</small>
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
        <span>B&W Single <b>₹{bwSingle.toFixed(2)}</b></span><i /> <span>Double <b>₹{bwDouble.toFixed(2)}</b></span><i /> <span>Colour <b>₹{colourRate.toFixed(2)}</b></span>
      </button>
      <footer>Files auto-delete <b>{cfg.autoDeleteDelay || 5} minutes</b> after printing.</footer>
    </main>
  );
}

export default Entry;
