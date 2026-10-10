import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

export function Segmented({
  values,
  selected,
  onSelect
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return <div className="segmented">
      {values.map(value => <button key={value} className={selected === value ? "active" : ""} onClick={() => onSelect(value)}>
          {value}
        </button>)}
    </div>;
}
export default Segmented;


