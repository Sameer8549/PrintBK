import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function LaminationSheet({
  close,
  addService
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
}) {
  const [item, setItem] = useState("ID card");
  const [finish, setFinish] = useState("Glossy");
  const [thickness, setThickness] = useState("Standard 125 micron");
  const [quantity, setQuantity] = useState(1);
  const base: Record<string, number> = {
    "ID card": 10,
    A4: 25,
    A3: 50,
    Photo: 15,
    Certificate: 25
  };
  const price = (base[item] + (thickness.startsWith("Thick") ? 10 : 0)) * quantity;
  return <SheetShell tall onClose={close}>
    <div className="sheet-title"><div><span className="kicker">WALK-IN SERVICE</span><h2>Lamination</h2></div></div>
    <div className="setting-group"><label>Item type</label><div className="chip-row wrap">{Object.keys(base).map(value => <button className={item === value ? "active" : ""} onClick={() => setItem(value)} key={value}>{value}</button>)}</div></div>
    <div className="setting-group"><label>Finish</label><Segmented values={["Glossy", "Matte"]} selected={finish} onSelect={setFinish} /></div>
    <div className="setting-group"><label>Thickness</label><div className="choice-stack">{["Standard 125 micron", "Thick 250 micron"].map(value => <button className={thickness === value ? "selected" : ""} onClick={() => setThickness(value)} key={value}>{value}<i /></button>)}</div></div>
    <div className="setting-row"><div><label>Quantity</label><small>{quantity} item{quantity > 1 ? "s" : ""}</small></div><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div></div>
    <div className="walkin-notice"><Icon name="history" /><span><b>Bring items to the counter</b><small>Pay now to get a token. Hand over the physical items when your code is called.</small></span></div>
    <div className="sheet-dock"><div><span>Live price</span><b>₹{price}.00</b></div><button className="primary" onClick={() => {
        addService({
          id: crypto.randomUUID(), type: 'addon',
          name: `${item} lamination`,
          detail: `${finish} · ${thickness} · Qty ${quantity}`,
          price,
          mode: "walkin",
          label: "Pay now, hand over at counter",
          counterNote: `Bring: ${quantity} ${item}${quantity > 1 ? "s" : ""} for lamination. Show order pickup code at counter.`
        });
        close();
      }}>Add to basket</button></div>
  </SheetShell>;
}
export default LaminationSheet;




