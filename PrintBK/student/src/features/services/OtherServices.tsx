import React from 'react';
import { Icon, Topbar, SheetShell } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { notify } from '../../lib/store';
import { useShopConfig } from '../../store/shopConfig';

function OtherServices({
  go,
  setSheet,
  addService,
  openBinding,
  openCustom
}: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  addService: (service: ServiceItem) => void;
  openBinding: (type: string) => void;
  openCustom: (note: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("All");
  const [customNote, setCustomNote] = React.useState("");

  const cfg = useShopConfig(s => s.config);
  const svcAvail = cfg.services || {};
  const rates = cfg.rates as any;

  const isSpiralAvail = svcAvail.binding_spiral?.available !== false;
  const isHardAvail = svcAvail.binding_hard?.available !== false;
  const isLaminationAvail = svcAvail.lamination?.available !== false;
  const isScanningAvail = svcAvail.scanning?.available !== false;
  const isPhotocopyAvail = svcAvail.photocopy?.available !== false;
  const isTypingAvail = svcAvail.typing?.available !== false;

  const spiralRate = rates.bindingSpiral ?? rates.spiral ?? 35;
  const hardRate = rates.bindingHard ?? rates.hardCover ?? 150;
  const scanRate = rates.scanPerPage ?? rates.scan ?? 5;
  const copyRate = rates.copyBw ?? rates.photocopy ?? 1.5;
  const lamA4 = rates.laminationA4 ?? 25;
  const lamA3 = rates.laminationA3 ?? 50;
  const lamID = rates.laminationID ?? 10;

  const services = [
    { id: "spiral", category: "Binding", title: "Spiral binding", copy: "Neat, flexible binding for notes and reports", price: `from ₹${spiralRate}`, tag: isSpiralAvail ? "Add to a print" : (svcAvail.binding_spiral?.reason || "Not available today"), icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Spiral", unavailable: !isSpiralAvail },
    { id: "comb", category: "Binding", title: "Comb binding", copy: "Reusable spine for manuals and projects", price: `from ₹${rates.comb ?? 25}`, tag: isSpiralAvail ? "Add to a print" : (svcAvail.binding_spiral?.reason || "Not available today"), icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Comb", unavailable: !isSpiralAvail },
    { id: "staple", category: "Binding", title: "Staple / corner pin", copy: "Simple finish for short documents", price: `₹${rates.staple ?? 5}`, tag: "Add to a print", icon: "check" as const, sheet: "binding" as Sheet, bindingType: "Staple", unavailable: false },
    { id: "hard", category: "Binding", title: "Hard cover / thesis binding", copy: "Premium project and thesis finish", price: `from ₹${hardRate}`, tag: isHardAvail ? "Add to a print" : (svcAvail.binding_hard?.reason || "Not available today"), icon: "file" as const, sheet: "binding" as Sheet, bindingType: "Hard cover", unavailable: !isHardAvail },
    { id: "lamination", category: "Lamination", title: "Lamination", copy: `ID ₹${lamID} · A4 ₹${lamA4} · A3 ₹${lamA3}`, price: `from ₹${lamID}`, tag: isLaminationAvail ? "Walk-in" : (svcAvail.lamination?.reason || "Not available today"), icon: "copy" as const, sheet: "lamination" as Sheet, unavailable: !isLaminationAvail },
    { id: "scanning", category: "Scanning", title: "Scanning to PDF", copy: "Upload page photos or bring originals", price: `₹${scanRate}/page`, tag: isScanningAvail ? "Walk-in or upload" : (svcAvail.scanning?.reason || "Not available today"), icon: "camera" as const, sheet: "scanning" as Sheet, unavailable: !isScanningAvail },
    { id: "photocopy", category: "Other", title: "Photocopy at counter", copy: "Bring the original to the counter", price: `from ₹${copyRate}/page`, tag: isPhotocopyAvail ? "Walk-in" : (svcAvail.photocopy?.reason || "Not available today"), icon: "copy" as const, unavailable: !isPhotocopyAvail },
    { id: "typing", category: "Typing", title: "Document typing / resume making", copy: "We type, format and clean up your draft", price: "quote", tag: isTypingAvail ? "Request" : (svcAvail.typing?.reason || "Not available today"), icon: "file" as const, sheet: "typing" as Sheet, unavailable: !isTypingAvail },
  ];

  const visible = services.filter(s =>
    (filter === "All" || s.category === filter) &&
    `${s.title} ${s.copy}`.toLowerCase().includes(query.toLowerCase())
  );

  const open = (service: typeof services[number]) => {
    if (service.unavailable) return;
    if (service.bindingType) {
      openBinding(service.bindingType);
    } else if (service.sheet) {
      setSheet(service.sheet);
    } else {
      // Walk-in photocopy — add directly
      addService({
        id: crypto.randomUUID(),
        type: 'addon',
        name: "Photocopy at counter",
        detail: "Bring the original · Pay at counter",
        price: cfg.rates.photocopy,
        mode: "walkin",
        label: "Pay at counter",
        counterNote: "Bring your original pages for photocopying.",
      });
      notify("Photocopy added. Bring originals to the counter.");
      go("basket");
    }
  };

  return <main className="page other-services-page">
      <Topbar title="Other Services" back onBack={() => go("entry")} />
      <div className="services-hero"><span className="kicker">AT HKBK STUDENT POINT</span><h1>Finish the job.</h1><p>Binding, lamination, scanning and document help — all without guessing what to ask for.</p></div>
      <div className="service-search"><Icon name="file" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services" /><button onClick={() => setQuery("")}>{query ? "Clear" : "🔍"}</button></div>
      <div className="service-filters">{["All", "Binding", "Lamination", "Scanning", "Typing", "Other"].map(v => <button className={filter === v ? "active" : ""} onClick={() => setFilter(v)} key={v}>{v}</button>)}</div>
      {visible.length ? <div className="service-list">{visible.map(service => <button className={service.unavailable ? "unavailable" : ""} disabled={service.unavailable} onClick={() => open(service)} key={service.id}><span className="service-mark"><Icon name={service.icon} /></span><span><strong>{service.title}</strong><small>{service.copy}</small><i>{service.tag}</i></span><b>{service.price}</b><Icon name="chevron" size={17} /></button>)}</div> : <div className="service-empty"><h2>No services found</h2><p>Try another search or clear the filter.</p><button onClick={() => { setQuery(""); setFilter("All"); }}>Show all services</button></div>}
      <section className="custom-service-row">
        <span className="service-mark"><Icon name="more" /></span>
        <div>
          <strong>Need something else?</strong>
          <small>Tell the shop what you need.</small>
          <textarea value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="Add a short note" />
        </div>
        <button onClick={() => { openCustom(customNote); }} disabled={!customNote.trim()}>Request</button>
      </section>
    </main>;
}
export default OtherServices;

