import React, { useState, useEffect } from 'react';
import { Icon, Brand, Topbar, Segmented } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';
import { useShopConfig } from '../../store/shopConfig';
import { browseAndAddFiles, processAndAddFiles } from '../../lib/filePicker';

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
  const cfg = useShopConfig(s => s.config);
  const basket = useBasket();
  const addFile = useBasket(s => s.addFile);

  const isOpen = cfg.open !== false;
  const shopName = cfg.shopInfo?.name || "HKBK Student Point";
  const rates = cfg.rates as any;
  const bwSingle = rates?.bw ?? 1.5;
  const bwDouble = rates?.duplex ?? (rates?.doubleSideDiscount ? Number((bwSingle * (1 - rates.doubleSideDiscount)).toFixed(2)) : 0.85);
  const colourRate = rates?.colour ?? rates?.color ?? 8.0;
  const deleteMinutes = cfg.deleteDelayMinutes || cfg.autoDeleteDelay || 5;

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
        <div className="shop-announcement" style={{ margin: '8px 0 16px', padding: '14px 16px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, color: '#991b1b', fontSize: 13, lineHeight: 1.45 }}>
          <div style={{ fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Shop Closed</span>
            {cfg.closedSince && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#b91c1c' }}>
                · since {new Date(cfg.closedSince * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div>{cfg.announcement || 'Counter orders and uploads are paused. Please check back shortly.'}</div>
          {cfg.hours && <div style={{ marginTop: 6, fontSize: 12, color: '#7f1d1d' }}><strong>Regular Hours:</strong> {cfg.hours}</div>}
          {cfg.reopenAt && <div style={{ marginTop: 4, fontSize: 12, color: '#7f1d1d' }}><strong>Expected Reopen:</strong> {cfg.reopenAt}</div>}
        </div>
      )}

      <Segmented values={["Documents", "Photos", "Other Services"]} selected={tab} onSelect={v => {
        setTab(v);
        if (v === "Photos") openPhoto("");
        if (v === "Other Services") go("services");
      }} />
      <button
        className="drop-zone"
        onClick={handleUploadClick}
        onDragOver={(e) => {
          e.preventDefault();
          if (isOpen) e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!isOpen) {
            notify(cfg.announcement || 'Shop is currently closed. Ordering is paused.');
            return;
          }
          if (e.dataTransfer?.files?.length) {
            processAndAddFiles(Array.from(e.dataTransfer.files), go, addFile);
          }
        }}
        style={{ opacity: isOpen ? 1 : 0.65 }}
      >
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
      <footer>Files auto-delete <b>{deleteMinutes} minutes</b> after printing.</footer>
    </main>
  );
}

export default Entry;
