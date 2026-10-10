import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function Splash() {
  return <main className="splash">
      <div className="splash-rings" aria-hidden="true"><i /><i /><i /></div>
      <Brand full large />
      <div className="paper-feed"><span /></div>
      <p>Warming up the printer</p>
    </main>;
}
export default Splash;



