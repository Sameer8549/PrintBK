import React, { useState } from 'react';
import { Segmented, SheetShell } from '../../components/ui';
import { ServiceItem } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';
import { useShopConfig } from '../../store/shopConfig';

function BindingSheet({
  close,
  addService,
  initialType
}: {
  close: () => void;
  addService: (service: ServiceItem) => void;
  initialType: string;
}) {
  const [type, setType] = useState(initialType || "Spiral");
  const [cover, setCover] = useState("Clear front + black back");
  const [attach, setAttach] = useState('');
  const [quantity, setQuantity] = useState(1);
  const basketFiles = useBasket(s => s.files);
  const cfg = useShopConfig(s => s.config);
  const rates = (cfg.rates as any) || {};
  const prices: Record<string, number> = {
    Spiral: rates.bindingSpiral ?? rates.spiral ?? 30,
    Comb: rates.bindingComb ?? rates.comb ?? 25,
    Staple: rates.bindingStaple ?? rates.staple ?? 5,
    'Hard cover': rates.bindingHard ?? rates.hardCover ?? 150
  };
  const unitPrice = prices[type] ?? 30;
  const price = unitPrice * quantity;

  return (
    <SheetShell tall onClose={close}>
      <div className="sheet-title"><div><span className="kicker">ADD TO A PRINT</span><h2>Binding</h2></div><span className="recommended">Recommended</span></div>
      <div className="setting-group"><label>Binding type</label><Segmented values={["Spiral", "Comb", "Staple", "Hard cover"]} selected={type} onSelect={setType} /></div>
      <div className="binding-recommendation"><span><b>8 mm spine</b><small>Best fit for 40 pages</small></span><i>Recommended</i></div>
      <div className="setting-group"><label>Cover</label><div className="choice-stack">{["Clear front + black back", "Colored cards", "Custom front page"].map(value => <button className={cover === value ? "selected" : ""} onClick={() => setCover(value)} key={value}>{value}<i /></button>)}</div></div>
      <div className="setting-group"><label>Cover colour</label><div className="color-swatches">{["Black", "Navy", "Red", "Green", "Cream"].map(value => <button aria-label={value} title={value} className={value.toLowerCase()} onClick={() => notify(`${value} cover selected`)} key={value} />)}</div></div>
      <div className="setting-group"><label>Attach to</label><div className="choice-stack">{[...basketFiles.map(f => f.name), "Bring my own pages to the counter"].map(value => <button className={attach === value ? "selected" : ""} onClick={() => setAttach(value)} key={value}><span>{value}</span><i /></button>)}</div></div>
      <div className="setting-row"><div><label>Quantity</label><small>Same binding and cover</small></div><div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div></div>
      <div className="sheet-dock"><div><span>Live price</span><b>₹{price.toFixed(2)}</b></div><button className="primary" onClick={() => {
          addService({
            id: crypto.randomUUID(), type: attach.includes('Bring') ? 'walkin' : 'addon',
            name: `${type} binding`,
            detail: cover,
            price,
            qty: quantity,
            attachTo: attach || undefined
          });
          close();
        }}>{attach.includes("Bring") ? "Add counter service" : "Add to basket"}</button></div>
    </SheetShell>
  );
}

export default BindingSheet;
