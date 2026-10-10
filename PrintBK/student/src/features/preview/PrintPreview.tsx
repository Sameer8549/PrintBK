import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function PrintPreview({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const [fixed, setFixed] = useState<string[]>([]);
  const warnings = [["blank", "2 blank pages", "Remove them and save 1 sheet"], ["rotate", "Mixed orientation", "Rotate pages 8 and 11"], ["tiny", "Tiny text after 6-up", "Switch this file to 4-up"]];
  const fix = (id: string) => {
    setFixed(current => [...current, id]);
    notify(id === "blank" ? "Fixed 2 blank pages for you" : "Preview updated");
  };
  return <main className="page preview-page">
      <Topbar title="Print preview" back onBack={() => go("basket")} />
      <div className="preview-label"><span>What you see is what prints</span><b>Sheet 2 of 9</b></div>
      <div className="a4-preview"><div className="preview-column"><span /><span /><span /><span /><i /></div><div className="preview-column"><span /><span /><span /><span /><i /></div><em>2</em></div>
      <div className="pager"><button onClick={() => notify("Showing sheet 1")}>←</button><span><i /> <i className="active" /> <i /> <i /> <i /></span><button onClick={() => notify("Showing sheet 3")}>→</button></div>
      <div className="warning-list">
        {warnings.map(([id, title, copy]) => <section className={fixed.includes(id) ? "fixed" : ""} key={id}><span>{fixed.includes(id) ? <Icon name="check" /> : "!"}</span><div><strong>{fixed.includes(id) ? `Fixed: ${title}` : title}</strong><small>{fixed.includes(id) ? "Your price and preview are updated." : copy}</small></div><button onClick={() => fix(id)} disabled={fixed.includes(id)}>{fixed.includes(id) ? "Done" : "Fix"}</button></section>)}
        <section className="info"><span>i</span><div><strong>Low-resolution image</strong><small>ID card may look slightly soft at this size.</small></div><button onClick={() => notify("We’ll print at the safest available size")}>Keep</button></section>
      </div>
      <button className="primary full" onClick={() => go("checkout")}>Preview looks good</button>
    </main>;
}
export default PrintPreview;



