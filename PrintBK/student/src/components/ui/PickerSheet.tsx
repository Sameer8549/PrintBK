import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function PickerSheet({
  setSheet
}: {
  setSheet: (sheet: Sheet) => void;
}) {
  const [selected, setSelected] = useState<number[]>(Array.from({
    length: 12
  }, (_, i) => i + 1));
  const [preset, setPreset] = useState("Custom");
  const toggle = (n: number) => setSelected(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);
  const choosePreset = (value: string) => {
    setPreset(value);
    if (value === "All") setSelected(Array.from({
      length: 40
    }, (_, i) => i + 1));
    if (value === "Odd") setSelected(Array.from({
      length: 20
    }, (_, i) => i * 2 + 1));
    if (value === "Even") setSelected(Array.from({
      length: 20
    }, (_, i) => (i + 1) * 2));
    if (value === "1–5") setSelected([1, 2, 3, 4, 5]);
  };
  return <SheetShell tall onClose={() => setSheet("settings")}>
      <div className="sheet-title"><div><span className="kicker">PICK PAGES</span><h2>{selected.length} of 40 selected</h2></div><button className="text-button" onClick={() => setSheet("settings")}>Done</button></div>
      <div className="chip-row picker-chips">{["All", "Odd", "Even", "1–5", "Custom"].map(x => <button className={x === preset ? "active" : ""} onClick={() => choosePreset(x)} key={x}>{x}</button>)}</div>
      <div className="page-grid">
        {Array.from({
        length: 18
      }, (_, i) => i + 1).map(n => {
        const active = selected.includes(n);
        const blank = n === 7 || n === 14;
        return <button key={n} className={`${active ? "selected" : ""} ${blank ? "blank" : ""}`} onClick={() => {
          setPreset("Custom");
          toggle(n);
        }}>
            <span className="page-lines" /><i>{blank ? "blank" : n}</i>{[3, 8, 11, 16].includes(n) && <em />}
            {active && <b><Icon name="check" size={12} /></b>}
          </button>;
      })}
      </div>
      <div className="sheet-dock single"><button className="primary" onClick={() => setSheet("settings")}>Use {selected.length} pages</button></div>
    </SheetShell>;
}
export default PickerSheet;


