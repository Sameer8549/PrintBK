import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [customNote, setCustomNote] = useState("");
  const services = [{
    id: "spiral",
    category: "Binding",
    title: "Spiral binding",
    copy: "Neat, flexible binding for notes and reports",
    price: "from ₹30",
    tag: "Add to a print",
    icon: "file" as const,
    sheet: "binding" as Sheet,
    bindingType: "Spiral"
  }, {
    id: "comb",
    category: "Binding",
    title: "Comb binding",
    copy: "Reusable spine for manuals and projects",
    price: "from ₹25",
    tag: "Add to a print",
    icon: "file" as const,
    sheet: "binding" as Sheet,
    bindingType: "Comb"
  }, {
    id: "staple",
    category: "Binding",
    title: "Staple / corner pin",
    copy: "Simple finish for short documents",
    price: "₹5",
    tag: "Add to a print",
    icon: "check" as const,
    sheet: "binding" as Sheet,
    bindingType: "Staple"
  }, {
    id: "hard",
    category: "Binding",
    title: "Hard cover / thesis binding",
    copy: "Premium project and thesis finish",
    price: "from ₹150",
    tag: "Not available today",
    icon: "file" as const,
    sheet: "binding" as Sheet,
    bindingType: "Hard cover",
    unavailable: true
  }, {
    id: "lamination",
    category: "Lamination",
    title: "Lamination",
    copy: "ID ₹10 · A4 ₹25 · A3 ₹50",
    price: "from ₹10",
    tag: "Walk-in",
    icon: "copy" as const,
    sheet: "lamination" as Sheet
  }, {
    id: "scanning",
    category: "Scanning",
    title: "Scanning to PDF",
    copy: "Upload page photos or bring originals",
    price: "₹5/page",
    tag: "Walk-in or upload",
    icon: "camera" as const,
    sheet: "scanning" as Sheet
  }, {
    id: "photocopy",
    category: "Other",
    title: "Photocopy at counter",
    copy: "Bring the original to the counter",
    price: "from ₹1/page",
    tag: "Walk-in",
    icon: "copy" as const
  }, {
    id: "typing",
    category: "Typing",
    title: "Document typing / resume making",
    copy: "We type, format and clean up your draft",
    price: "quote",
    tag: "Request",
    icon: "file" as const,
    sheet: "typing" as Sheet
  }];
  const visible = services.filter(service => (filter === "All" || service.category === filter) && `${service.title} ${service.copy}`.toLowerCase().includes(query.toLowerCase()));
  const open = (service: typeof services[number]) => {
    if (service.unavailable) return;
    if (service.bindingType) openBinding(service.bindingType);else if (service.sheet) setSheet(service.sheet);else addService({
      id: crypto.randomUUID(), type: 'addon',
      name: "Photocopy at counter",
      detail: "Bring the original · Pay at counter",
      price: 1,
      mode: "walkin",
      label: "Pay at counter",
      counterNote: "Bring your original pages for photocopying."
    });
  };
  return <main className="page other-services-page">
      <Topbar title="Other Services" back onBack={() => go("entry")} />
      <div className="services-hero"><span className="kicker">AT HKBK STUDENT POINT</span><h1>Finish the job.</h1><p>Binding, lamination, scanning and document help—all without guessing what to ask for.</p></div>
      <div className="service-search"><Icon name="file" size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" /><button onClick={() => setQuery("")}>{query ? "Clear" : "⌕"}</button></div>
      <div className="service-filters">{["All", "Binding", "Lamination", "Scanning", "Typing", "Other"].map(value => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div>
      {visible.length ? <div className="service-list">{visible.map(service => <button className={service.unavailable ? "unavailable" : ""} disabled={service.unavailable} onClick={() => open(service)} key={service.id}><span className="service-mark"><Icon name={service.icon} /></span><span><strong>{service.title}</strong><small>{service.copy}</small><i>{service.tag}</i></span><b>{service.price}</b><Icon name="chevron" size={17} /></button>)}</div> : <div className="service-empty"><Brand /><h2>No services found</h2><p>Try another search or clear the filter.</p><button onClick={() => {
        setQuery("");
        setFilter("All");
      }}>Show all services</button></div>}
      <section className="custom-service-row"><span className="service-mark"><Icon name="more" /></span><div><strong>Need something else?</strong><small>Tell the shop what you need.</small><textarea value={customNote} onChange={event => setCustomNote(event.target.value)} placeholder="Add a short note" /></div><button onClick={() => openCustom(customNote)} disabled={!customNote.trim()}>Request</button></section>
    </main>;
}
export default OtherServices;



