import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

export function Brand({
  full = false,
  large = false
}: {
  full?: boolean;
  large?: boolean;
}) {
  return <div className={`brand ${large ? "brand--large" : ""}`}>
      <img src={import.meta.env.BASE_URL + 'assets/hkbk-logo.png'} alt="PrintBK · HKBK" style={{ imageRendering: 'auto', objectFit: 'contain' }} />
      {full && <div>
          <strong>PrintBK</strong>
          <span>print. pay. pick up.</span>
        </div>}
    </div>;
}
export default Brand;


