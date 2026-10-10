import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Settings({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const [cleared, setCleared] = useState(false);
  return <main className="page">
      <Topbar title="Settings" back onBack={() => go("entry")} />
      <section className="settings-list">
        <button onClick={() => notify("2 presets: Class notes and Lab records")}><span><strong>Saved presets</strong><small>Class notes · Lab records</small></span><Icon name="chevron" /></button>
        <button onClick={() => notify("Add your number during checkout for ready alerts")}><span><strong>Phone number</strong><small>Not added</small></span><Icon name="chevron" /></button>
        <button onClick={() => notify("PrintBK 1.0 · Built for faster campus printing")}><span><strong>About PrintBK</strong><small>Version 1.0 · Made for students</small></span><Icon name="chevron" /></button>
        <button className="danger" disabled={cleared} onClick={() => {
        setCleared(true);
        localStorage.clear();
        notify("Local data cleared");
      }}><span><strong>{cleared ? "Data cleared" : "Clear my data from this device"}</strong><small>{cleared ? "This device is clean" : "Your active order stays safe"}</small></span>{cleared ? <Icon name="check" /> : <Icon name="trash" />}</button>
      </section>
    </main>;
}
export default Settings;



