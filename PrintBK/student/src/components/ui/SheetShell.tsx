import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

export function SheetShell({
  children,
  onClose,
  tall = false
}: {
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
}) {
  return <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
      <section className={`sheet ${tall ? "sheet--tall" : ""}`} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <button className="sheet-handle" onClick={onClose} aria-label="Close sheet" />
        {children}
      </section>
    </div>;
}
export default SheetShell;


