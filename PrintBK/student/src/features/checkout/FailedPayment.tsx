import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function FailedPayment({
  go,
  total
}: {
  go: (screen: Screen) => void;
  total: number;
}) {
  return <main className="state-page failure-state">
      <Brand />
      <div className="failure-mark"><span>!</span><div className="receipt-paper"><b>₹{total}</b></div></div>
      <span className="kicker">NOT CHARGED</span>
      <h1>Payment didn’t go through.</h1>
      <p>Your files are safe. Your wallet has ₹42, so it needs ₹44 more.</p>
      <button className="primary" onClick={() => go("confirming")}>Retry with UPI</button>
      <button className="secondary-action" onClick={() => {
      notify("Cash payment selected");
      go("ticket");
    }}>Switch to cash</button>
      <button className="quiet-action" onClick={() => go("checkout")}>Back to payment options</button>
    </main>;
}
export default FailedPayment;



