import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

export function Topbar({
  title,
  back,
  onBack,
  action
}: {
  title: string;
  back?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  return <header className="topbar">
      {back ? <button className="icon-button" onClick={onBack} aria-label="Go back"><Icon name="arrow" /></button> : <Brand />}
      <div className="topbar__title">{title}</div>
      <div className="topbar__action">{action ?? <span />}</div>
    </header>;
}
export default Topbar;


