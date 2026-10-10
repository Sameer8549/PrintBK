import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

export function MobileNav({
  active,
  go
}: {
  active: Screen;
  go: (screen: Screen) => void;
}) {
  const items: Array<{
    label: string;
    icon: "home" | "basket" | "history" | "wallet" | "settings";
    screen: Screen;
  }> = [{
    label: "Home",
    icon: "home",
    screen: "entry"
  }, {
    label: "Basket",
    icon: "basket",
    screen: "basket"
  }, {
    label: "Orders",
    icon: "history",
    screen: "ticket"
  }, {
    label: "Wallet",
    icon: "wallet",
    screen: "history"
  }, {
    label: "Settings",
    icon: "settings",
    screen: "settings"
  }];
  return <nav className="mobile-nav" aria-label="Primary navigation">
      {items.map(item => <button className={active === item.screen || item.label === "Wallet" && active === "history" ? "active" : ""} onClick={() => go(item.screen)} key={item.label}><span><Icon name={item.icon} size={19} />{item.label === "Basket" && <i>3</i>}</span><b>{item.label}</b></button>)}
    </nav>;
}
export default MobileNav;


