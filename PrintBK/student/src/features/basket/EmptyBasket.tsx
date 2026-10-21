import React from 'react';
import { Icon, Brand } from '../../components/ui';
import { Screen } from '../../lib/types';
import { browseFiles } from '../../lib/store';
import { useShopConfig } from '../../store/shopConfig';

function EmptyBasket({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const cfg = useShopConfig(s => s.config);
  const shopName = cfg.shopInfo?.name || 'HKBK Student Point';

  return (
    <main className="state-page empty-state">
      <Brand />
      <div className="empty-paper"><Icon name="file" size={34} /><span /></div>
      <span className="kicker">BASKET EMPTY</span>
      <h1>Nothing queued yet.</h1>
      <p>Drop in class notes, lab records or photos. We’ll check them before you pay.</p>
      <button className="primary" onClick={() => browseFiles(go)}>Choose files</button>
      <button className="quiet-action" onClick={() => go("entry")}>Back to {shopName}</button>
    </main>
  );
}

export default EmptyBasket;
