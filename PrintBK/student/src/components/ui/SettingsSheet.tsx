import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function SettingsSheet({
  setSheet
}: {
  setSheet: (sheet: Sheet) => void;
}) {
  const [colour, setColour] = useState("Auto");
  const [side, setSide] = useState("Double");
  const [perSheet, setPerSheet] = useState("2");
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState("Custom");
  const [mode, setMode] = useState("Standard");
  const [paper, setPaper] = useState("A4");
  const [binding, setBinding] = useState("None");
  const [skipBlanks, setSkipBlanks] = useState(true);
  const price = Math.max(9, 18 + (copies - 1) * 18 + (colour === "Colour" ? 20 : 0) + (binding === "Spiral" ? 25 : 0));
  const reset = () => {
    setColour("Auto");
    setSide("Double");
    setPerSheet("2");
    setCopies(1);
    setPages("Custom");
    setMode("Standard");
    setPaper("A4");
    setBinding("None");
    setSkipBlanks(true);
    notify("Smart defaults restored");
  };
  return <SheetShell tall onClose={() => setSheet(null)}>
      <div className="sheet-title"><div><span className="kicker">ENGINEERING_MATH…PDF</span><h2>Print settings</h2></div><button className="text-button" onClick={reset}>Reset</button></div>
      <div className="preview-strip">
        {[1, 2, 3].map(n => <div className="mini-page" key={n}><span /><span /><span /><b>{n}</b></div>)}
        <button onClick={() => setSheet("picker")}>Pick visually <Icon name="chevron" size={16} /></button>
      </div>
      <div className="setting-group"><label>Pages <small>{pages === "All" ? "40" : pages === "Odd" || pages === "Even" ? "20" : "12"} of 40</small></label><Segmented values={["All", "Odd", "Even", "Custom"]} selected={pages} onSelect={setPages} /><button className="range-input" onClick={() => setSheet("picker")}>{pages === "Custom" ? "1–12" : pages} <span>pages</span></button></div>
      <div className="setting-row">
        <div><label>Copies</label><small>Sets of the selected pages</small></div>
        <div className="stepper"><button onClick={() => setCopies(Math.max(1, copies - 1))}>−</button><b>{copies}</b><button onClick={() => setCopies(copies + 1)}>+</button></div>
      </div>
      <div className="setting-group"><label>Colour</label><Segmented values={["B&W", "Colour", "Auto"]} selected={colour} onSelect={setColour} /><small className="helper">Only coloured pages are charged at colour rate.</small></div>
      <div className="setting-group"><label>Sides</label><Segmented values={["Single", "Double"]} selected={side} onSelect={setSide} /></div>
      <div className="setting-group"><label>Pages per sheet</label><Segmented values={["1", "2", "4", "6"]} selected={perSheet} onSelect={value => {
        setPerSheet(value);
        setMode("Standard");
      }} /><div className="chip-row"><button className={mode === "Handout" ? "active" : ""} onClick={() => setMode("Handout")}>Handout</button><button className={mode === "Booklet" ? "active" : ""} onClick={() => setMode("Booklet")}>Booklet</button></div></div>
      <div className="setting-pair"><div><label>Paper</label><button className="select-row" onClick={() => setPaper(paper === "A4" ? "A3" : paper === "A3" ? "Legal" : "A4")}>{paper} <span>⌄</span></button></div><div><label>Binding</label><button className="select-row" onClick={() => setBinding(binding === "None" ? "Staple" : binding === "Staple" ? "Spiral" : "None")}>{binding} <span>⌄</span></button></div></div>
      <div className="setting-row"><div><label>Skip blank pages</label><small>{skipBlanks ? "2 blank pages will be removed" : "Blank pages will print"}</small></div><button className={`switch ${skipBlanks ? "on" : ""}`} onClick={() => setSkipBlanks(!skipBlanks)}><i /></button></div>
      <label className="preset-check"><input type="checkbox" onChange={event => event.target.checked && notify("Preset will be saved as Class notes")} /> Save as “Class notes” preset</label>
      <div className="sheet-dock"><div><span>Live price</span><b key={price}>₹{price}.00</b></div><button className="primary" onClick={() => {
        setSheet(null);
        notify("Settings saved");
      }}>Done</button></div>
    </SheetShell>;
}
export default SettingsSheet;


