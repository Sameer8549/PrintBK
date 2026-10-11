import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';

function PhotoTool({
  go,
  initialLayout
}: {
  go: (screen: Screen) => void;
  initialLayout: string;
}) {
  const addService = useBasket(s => s.addService);
  const rawFileRef = React.useRef<File | null>(null);
  const [layout, setLayout] = useState(''); // always start empty — user must choose

  const [ratio, setRatio] = useState("3:4");
  const [fit, setFit] = useState("Fill");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(42);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [filledAll, setFilledAll] = useState(true);
  const [photoSrc, setPhotoSrc] = useState("");
  const [cardPhotos, setCardPhotos] = useState<string[]>(["", ""]);
  const [customRows, setCustomRows] = useState(3);
  const [customColumns, setCustomColumns] = useState(3);
  const [photoOffset, setPhotoOffset] = useState({
    x: 0,
    y: 0
  });
  const [slotScale, setSlotScale] = useState(100);
  const photoInput = useRef<HTMLInputElement>(null);
  const dragState = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeState = useRef<{
    x: number;
    origin: number;
  } | null>(null);
  const isCardLayout = layout === "ID card" || layout === "Aadhaar";
  const customSlots = customRows * customColumns;
  const layouts: Record<string, {
    slots: number;
    className: string;
    label: string;
    price: number;
    ratio: string;
  }> = {
    "1": {
      slots: 1,
      className: "layout-one",
      label: "Full-page photo",
      price: 10,
      ratio: "Auto"
    },
    "2": {
      slots: 2,
      className: "layout-two",
      label: "Two large photos",
      price: 15,
      ratio: "Auto"
    },
    "4": {
      slots: 4,
      className: "layout-four",
      label: "Four equal photos",
      price: 20,
      ratio: "Auto"
    },
    "Passport 8-up": {
      slots: 8,
      className: "layout-passport",
      label: "35 × 45 mm passport",
      price: 40,
      ratio: "3:4"
    },
    "4×6": {
      slots: 2,
      className: "layout-4x6",
      label: "Two 4 × 6 inch prints",
      price: 30,
      ratio: "2:3"
    },
    "ID card": {
      slots: 2,
      className: "layout-id",
      label: "Front and back · 85.6 × 54 mm",
      price: 20,
      ratio: "Card"
    },
    "Aadhaar": {
      slots: 2,
      className: "layout-aadhaar",
      label: "Front and back · exact size",
      price: 20,
      ratio: "Card"
    },
    "Resume": {
      slots: 1,
      className: "layout-resume",
      label: "One full A4 page",
      price: 10,
      ratio: "Auto"
    },
    "Custom": {
      slots: customSlots,
      className: "layout-custom",
      label: `${customColumns} × ${customRows} custom grid`,
      price: 20 + customSlots * 3,
      ratio: ratio
    }
  };
  const config = layout ? layouts[layout] : {
    slots: 1,
    className: "layout-one empty-layout",
    label: "Choose a layout below",
    price: 0,
    ratio: "Auto"
  };
  const selectLayout = (value: string) => {
    setLayout(value);
    setSelectedSlot(0);
    setFilledAll(true);
    setSlotScale(100);
    setPhotoOffset({
      x: 0,
      y: 0
    });
    if (layouts[value].ratio === "3:4") setRatio("3:4");
    notify(`${layouts[value].label} selected`);
  };
  const importPhoto = (file?: File) => { if (!file) return; rawFileRef.current = file;
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (isCardLayout) setCardPhotos(photos => photos.map((photo, index) => index === selectedSlot ? url : photo));else setPhotoSrc(url);
    setFilledAll(true);
    notify(isCardLayout ? `${selectedSlot === 0 ? "Front" : "Back"} image added` : "Photo imported and fitted");
  };
  const imageStyle: React.CSSProperties = {
    objectFit: fit === "Fit" ? "contain" : fit === "Fill" ? "cover" : "fill",
    transform: `translate(${photoOffset.x}px, ${photoOffset.y}px) scale(${1 + zoom / 180}) rotate(${rotation}deg)`
  };
  return <main className="page has-dock photo-page">
      <Topbar title="Photo print" back onBack={() => go("entry")} />
      <input ref={photoInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/heic,image/heif" onChange={event => importPhoto(event.target.files?.[0])} />
      <section className="photo-context">
        <div><span className="kicker">A4 PHOTO SHEET</span><h1>Place it once.<br />We’ll size the rest.</h1></div>
        <button onClick={() => photoInput.current?.click()}><Icon name="camera" /><span>{isCardLayout ? `${selectedSlot === 0 ? "Front" : "Back"} image` : photoSrc ? "Change photo" : "Choose photo"}<small>JPG, PNG or HEIC</small></span></button>
      </section>
      <div className="photo-preview">
        <div className="sheet-toolbar"><span>LIVE PREVIEW</span><b>{config.slots} SLOT{config.slots > 1 ? "S" : ""}</b></div>
        <div className={`photo-sheet ${config.className}`} style={layout === "Custom" ? {
        gridTemplateColumns: `repeat(${customColumns}, 1fr)`,
        gridTemplateRows: `repeat(${customRows}, 1fr)`
      } : undefined}>
          {Array.from({
          length: config.slots
        }, (_, i) => {
          const slotPhoto = isCardLayout ? cardPhotos[i] : photoSrc;
          const hasPhoto = Boolean(layout) && (isCardLayout ? Boolean(slotPhoto) : filledAll || i === 0);
          return <div key={`photo-slot-${layout || "empty"}-${i}`} role="button" tabIndex={0} className={`photo-slot ${i === selectedSlot ? "selected" : ""} ${hasPhoto ? "filled" : "empty"}`} style={i === selectedSlot ? {
            transform: `scale(${slotScale / 100})`
          } : undefined} onClick={() => setSelectedSlot(i)} onKeyDown={event => event.key === "Enter" && setSelectedSlot(i)} onPointerDown={event => {
            if (!hasPhoto) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragState.current = {
              x: event.clientX,
              y: event.clientY,
              originX: photoOffset.x,
              originY: photoOffset.y
            };
          }} onPointerMove={event => {
            if (!dragState.current) return;
            setPhotoOffset({
              x: Math.max(-45, Math.min(45, dragState.current.originX + event.clientX - dragState.current.x)),
              y: Math.max(-45, Math.min(45, dragState.current.originY + event.clientY - dragState.current.y))
            });
          }} onPointerUp={() => {
            dragState.current = null;
          }}>
              {slotPhoto && hasPhoto ? <img src={slotPhoto} alt="" style={imageStyle} /> : !isCardLayout && hasPhoto ? <span className="avatar-shape" style={{
              transform: `scale(${1 + zoom / 180}) rotate(${rotation}deg)`
            }} /> : <span className="empty-slot"><strong>+</strong><small>Add {i === 0 ? "front" : "back"}</small></span>}
              {i === selectedSlot && <span className="slot-handles" key={`slot-handles-${i}`}><i /><b className="resize-handle" onPointerDown={event => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeState.current = {
                  x: event.clientX,
                  origin: slotScale
                };
              }} onPointerMove={event => {
                if (resizeState.current) setSlotScale(Math.max(72, Math.min(100, resizeState.current.origin + (event.clientX - resizeState.current.x) / 2)));
              }} onPointerUp={event => {
                event.stopPropagation();
                resizeState.current = null;
              }} /></span>}
              {(layout === "ID card" || layout === "Aadhaar") && <em>{i === 0 ? "FRONT" : "BACK"}</em>}
            </div>;
        })}
        </div>
        <div className="sheet-caption"><span>A4 · {config.label}</span><b>{ratio} crop</b></div>
        {layout && <div className="edit-hint">Drag the photo to position it · pull the lime corner to resize</div>}
      </div>
      <div className="photo-section-title"><label>Choose layout</label><span>Exact print sizes</span></div>
      <div className="layout-scroll">{Object.keys(layouts).map(value => <button className={layout === value ? "active" : ""} onClick={() => selectLayout(value)} key={value}><b>{value}</b><small>{layouts[value].slots} slot{layouts[value].slots > 1 ? "s" : ""}</small></button>)}</div>
      {isCardLayout && <div className="card-side-switch"><button className={selectedSlot === 0 ? "active" : ""} onClick={() => setSelectedSlot(0)}><span>1</span><b>Front</b><small>{cardPhotos[0] ? "Image ready" : "Add image"}</small></button><button className={selectedSlot === 1 ? "active" : ""} onClick={() => setSelectedSlot(1)}><span>2</span><b>Back</b><small>{cardPhotos[1] ? "Image ready" : "Add image"}</small></button></div>}
      {layout === "Custom" && <div className="custom-grid-controls"><div><span><b>Columns</b><small>Across the page</small></span><div className="stepper"><button onClick={() => setCustomColumns(Math.max(1, customColumns - 1))}>−</button><b>{customColumns}</b><button onClick={() => setCustomColumns(Math.min(4, customColumns + 1))}>+</button></div></div><div><span><b>Rows</b><small>Down the page</small></span><div className="stepper"><button onClick={() => setCustomRows(Math.max(1, customRows - 1))}>−</button><b>{customRows}</b><button onClick={() => setCustomRows(Math.min(5, customRows + 1))}>+</button></div></div></div>}
      <div className="tool-panel">
        <div><label>Crop ratio <span>Slot {selectedSlot + 1}</span></label><div className="chip-row">{["Original", "3:4", "1:1"].map(value => <button className={ratio === value ? "active" : ""} onClick={() => setRatio(value)} key={value}>{value}</button>)}</div></div>
        <div><label>Image fit</label><Segmented values={["Fit", "Fill", "Stretch"]} selected={fit} onSelect={setFit} /></div>
        <label className="zoom-control"><span>Zoom <b>{zoom}%</b></span><input type="range" min="0" max="100" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
        <div className="action-pair"><button onClick={() => setRotation((rotation + 90) % 360)}>↻ Rotate 90°</button>{isCardLayout ? <button onClick={() => photoInput.current?.click()}>Replace {selectedSlot === 0 ? "front" : "back"}</button> : <button className={filledAll ? "active" : ""} onClick={() => {
          setFilledAll(!filledAll);
          notify(filledAll ? "Only the first slot is filled" : `Filled all ${config.slots} slots`);
        }}>{filledAll ? "Clear repeats" : "Fill all slots"}</button>}</div>
      </div>
      <div className={`photo-safe-note ${!layout || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc) ? "pending" : ""}`}><Icon name={!layout || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc) ? "camera" : "check"} /> {!layout ? "Choose a layout to build your sheet." : isCardLayout && cardPhotos.some(photo => !photo) ? "Add both front and back to continue." : !photoSrc ? "Choose a photo to start editing." : "Faces, edges and print size checked."}</div>
      <div className="bottom-dock"><div className="total-block"><span>{layout ? `1 A4 sheet · ${config.slots} slot${config.slots !== 1 ? 's' : ''}` : "Choose a layout"}</span><b>{layout ? `₹${config.price}.00` : "—"}</b><small>{layout ? "No hidden charges" : "Price appears here"}</small></div><button className="primary" disabled={!layout || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc)} onClick={() => {
        // Add as a fixed-price service (not a file) so pricing is exact
        addService({
          id: crypto.randomUUID(),
          type: 'addon',
          name: `Photo print — ${config.label}`,
          detail: `A4 · ${config.slots} slot${config.slots > 1 ? 's' : ''} · Colour`,
          price: config.price,
          qty: 1,
        });
        notify(`${config.label} added to basket`);
        go("basket");
      }}>{isCardLayout && cardPhotos.some(photo => !photo) ? "Add front + back" : "Add photo sheet"}</button></div>
    </main>;
}
export default PhotoTool;





