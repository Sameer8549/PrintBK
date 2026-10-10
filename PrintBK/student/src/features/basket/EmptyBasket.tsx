import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function EmptyBasket({
  go
}: {
  go: (screen: Screen) => void;
}) {
  return <main className="state-page empty-state">
      <Brand />
      <div className="empty-paper"><Icon name="file" size={34} /><span /></div>
      <span className="kicker">BASKET EMPTY</span>
      <h1>Nothing queued yet.</h1>
      <p>Drop in class notes, lab records or photos. We’ll check them before you pay.</p>
      <button className="primary" onClick={() => browseFiles(go)}>Choose files</button>
      <button className="quiet-action" onClick={() => go("entry")}>Back to HKBK Student Point</button>
    </main>;
}
export default EmptyBasket;



