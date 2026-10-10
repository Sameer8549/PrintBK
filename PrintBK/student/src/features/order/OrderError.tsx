import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function OrderError({
  go,
  total
}: {
  go: (screen: Screen) => void;
  total: number;
}) {
  const [waiting, setWaiting] = useState(false);
  return <main className="state-page failure-state">
      <Brand />
      <div className="jam-visual"><div className="printer-box"><span /><i /></div><b>!</b></div>
      <span className="kicker">ORDER #1042 · PAUSED</span>
      <h1>{waiting ? "We’ll keep your place." : "Paper jam. We’re fixing it."}</h1>
      <p>{waiting ? "Your order is still next. We’ll alert you when printing resumes." : "Nothing is lost and you won’t be charged twice."}</p>
      <button className="primary" onClick={() => go("ticket")}>{waiting ? "Track my order" : "Retry now"}</button>
      <button className="secondary-action" onClick={() => setWaiting(true)}>Wait and alert me</button>
      <button className="quiet-action danger-text" onClick={() => {
      notify(`₹${total} refund started to your wallet`);
      go("history");
    }}>Refund ₹{total} to wallet</button>
    </main>;
}
export default OrderError;



