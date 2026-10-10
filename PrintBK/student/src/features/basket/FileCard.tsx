import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function FileCard({
  file,
  onClick,
  index,
  services
}: {
  file: typeof files[0];
  onClick: () => void;
  index: number;
  services: ServiceItem[];
}) {
  const attached = services.filter(service => service.mode === "addon" && service.attachTo === file.name);
  return <div className="file-card-group">
      <button className="file-card" onClick={onClick}>
        <span className="drag-handle">⠿</span>
        <span className={`file-thumb thumb-${index}`}>
          <Icon name="file" size={24} /><b>{file.kind}</b><i>{file.pages}</i>
        </span>
        <span className="file-copy">
          <span className={`file-badge badge-${index}`}>{file.badge}</span>
          <strong title={file.name}>{file.name}</strong>
          <small><b>{file.pages}</b> pages · {index === 0 ? "2 colour pages" : index === 1 ? "6 colour pages" : "colour"}</small>
          <span>{file.meta}</span>
        </span>
        <b className="file-price">₹{file.price}</b>
      </button>
      {attached.map(service => <div className="attached-service" key={service.id}><span><Icon name="check" size={14} /><b>{service.name}</b><small>{service.detail}</small></span><strong>₹{service.price}</strong></div>)}
    </div>;
}
export default FileCard;



