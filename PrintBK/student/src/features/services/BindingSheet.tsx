import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function BindingSheet({
  close,
  addService,
  initialType
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
  initialType: string;
}) {
  const [type, setType] = useState(initialType);
  const [cover, setCover] = useState("Clear front + black back");
  const [attach, setAttach] = useState(files[0].name);
  const [quantity, setQuantity] = useState(1);
  const prices: Record<string, number> = {
    Spiral: 30,
    Comb: 25,
    Staple: 5,
    "Hard cover": 150
  };
  const price = prices[type] * quantity;
  return <SheetShell tall onClose={close}>
    <div className="sheet-title"><div><span className="kicker">ADD TO A PRINT</span><h2>Binding</h2></div><span className="recommended">Recommended</span></div>
    <div className="setting-group"><label>Binding type</label><Segmented values={["Spiral", "Comb", "Staple", "Hard cover"]} selected={type} onSelect={setType} /></div>
    <div className="binding-recommendation"><span><b>8 mm spine</b><small>Best fit for 40 pages</small></span><i>Recommended</i></div>
    <div className="setting-group"><label>Cover</label><div className="choice-stack">{["Clear front + black back", "Colored cards", "Custom front page"].map(value => <button className={cover === value ? "selected" : ""} onClick={() => setCover(value)} key={value}>{value}<i /></button>)}</div></div>
    <div className="setting-group"><label>Cover colour</label><div className="color-swatches">{["Black", "Navy", "Red", "Green", "Cream"].map(value => <button aria-label={value} title={value} className={value.toLowerCase()} onClick={() => notify(`${value} cover selected`)} key={value} />)}</div></div>
    <div className="setting-group"><label>Attach to</label><div className="choice-stack">{[...files.map(file => file.name), "Bring my own pages to the counter"].map(value => <button className={attach === value ? "selected" : ""} onClick={() => setAttach(value)} key={value}><span>{value}</span><i /></button>)}</div></div>
    <div className="setting-row"><div><label>Quantity</label><small>Same binding and cover</small></div><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div></div>
    <div className="sheet-dock"><div><span>Live price</span><b>₹{price}.00</b></div><button className="primary" onClick={() => {
        addService({
          id: crypto.randomUUID(), type: 'addon',
          name: `${type} binding`,
          detail: cover,
          price,
          mode: attach.includes("Bring") ? "walkin" : "addon",
          label: attach.includes("Bring") ? "Bring pages to counter" : "Add to a print",
          attachTo: attach
        });
        close();
      }}>{attach.includes("Bring") ? "Add counter service" : "Add to basket"}</button></div>
  </SheetShell>;
}
export default BindingSheet;



