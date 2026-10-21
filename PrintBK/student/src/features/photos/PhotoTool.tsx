import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket, fileFromRaw, rawFileMap, type PrintFile } from '../../store/basket';
import { useShopConfig } from '../../store/shopConfig';
import { api } from '../../services/api';
import { generateUltraHdPhotoSheet } from '../../lib/photoSheet';

function PhotoTool({
  go,
  initialLayout = "Passport 8-up"
}: {
  go: (screen: Screen) => void;
  initialLayout?: string;
}) {
  const addService = useBasket(s => s.addService);
  const addFile = useBasket(s => s.addFile);
  const rawFileRef = React.useRef<File | null>(null);
  const secondaryFileRef = React.useRef<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [layout, setLayout] = useState<string>(initialLayout || "Passport 8-up");
  const [colorMode, setColorMode] = useState<'colour' | 'bw'>('colour');
  const [cloudId, setCloudId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const uploadPromiseRef = useRef<Promise<{ cloudId: string }> | null>(null);

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

  const shopConfig = useShopConfig(s => s.config);
  const shopRates = (shopConfig?.rates as any) || {};

  const getLayoutBasePrice = (key: string, defaultVal: number) => {
    if (key === "Passport 8-up" && typeof shopRates.photoPassport === 'number') return shopRates.photoPassport;
    if (key === "4×6" && typeof shopRates.photo4x6 === 'number') return shopRates.photo4x6;
    if (shopRates.photoRates && typeof shopRates.photoRates[key] === 'number') return shopRates.photoRates[key];
    return defaultVal;
  };

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
      price: getLayoutBasePrice("1", 10),
      ratio: "Auto"
    },
    "2": {
      slots: 2,
      className: "layout-two",
      label: "Two large photos",
      price: getLayoutBasePrice("2", 15),
      ratio: "Auto"
    },
    "4": {
      slots: 4,
      className: "layout-four",
      label: "Four equal photos",
      price: getLayoutBasePrice("4", 20),
      ratio: "Auto"
    },
    "Passport 8-up": {
      slots: 8,
      className: "layout-passport",
      label: "35 × 45 mm passport",
      price: getLayoutBasePrice("Passport 8-up", 40),
      ratio: "3:4"
    },
    "4×6": {
      slots: 2,
      className: "layout-4x6",
      label: "Two 4 × 6 inch prints",
      price: getLayoutBasePrice("4×6", 30),
      ratio: "2:3"
    },
    "ID card": {
      slots: 2,
      className: "layout-id",
      label: "Front and back · 85.6 × 54 mm",
      price: getLayoutBasePrice("ID card", 20),
      ratio: "Card"
    },
    "Aadhaar": {
      slots: 2,
      className: "layout-aadhaar",
      label: "Front and back · exact size",
      price: getLayoutBasePrice("Aadhaar", 20),
      ratio: "Card"
    },
    "Resume": {
      slots: 1,
      className: "layout-resume",
      label: "One full A4 page",
      price: getLayoutBasePrice("Resume", 10),
      ratio: "Auto"
    },
    "Custom": {
      slots: customSlots,
      className: "layout-custom",
      label: `${customColumns} × ${customRows} custom grid`,
      price: getLayoutBasePrice("Custom", 20) + customSlots * 3,
      ratio: ratio
    }
  };

  const config = layouts[layout] || layouts["Passport 8-up"];
  const finalPrice = colorMode === 'bw' ? Math.max(5, Math.round(config.price * 0.5)) : config.price;

  const selectLayout = (value: string) => {
    setLayout(value);
    setSelectedSlot(0);
    setFilledAll(true);
    setSlotScale(100);
    setPhotoOffset({
      x: 0,
      y: 0
    });
    if (layouts[value]?.ratio === "3:4") setRatio("3:4");
    notify(`${layouts[value]?.label || value} selected`);
  };

  const importPhoto = (file?: File) => {
    if (!file) return;
    if (isCardLayout && selectedSlot === 1) {
      secondaryFileRef.current = file;
    } else {
      rawFileRef.current = file;
    }
    const url = URL.createObjectURL(file);
    if (isCardLayout) {
      setCardPhotos(photos => photos.map((photo, index) => index === selectedSlot ? url : photo));
    } else {
      setPhotoSrc(url);
    }
    setFilledAll(true);
    notify(isCardLayout ? `${selectedSlot === 0 ? "Front" : "Back"} image added` : "Photo imported and fitted");

    // Fast background cloud upload immediately — zero wait at checkout!
    setIsUploading(true);
    const p = api.uploadFile(file);
    uploadPromiseRef.current = p;
    p.then(res => {
      if (res?.cloudId) {
        setCloudId(res.cloudId);
      }
      setIsUploading(false);
    }).catch(err => {
      console.warn('Background photo upload warning:', err);
      setIsUploading(false);
    });
  };

  const imageStyle: React.CSSProperties = {
    objectFit: fit === "Fit" ? "contain" : fit === "Fill" ? "cover" : "fill",
    transform: `translate(${photoOffset.x}px, ${photoOffset.y}px) scale(${1 + zoom / 180}) rotate(${rotation}deg)`,
    filter: colorMode === 'bw' ? 'grayscale(100%) contrast(1.15)' : 'none',
    imageRendering: 'high-quality' as any,
    WebkitBackfaceVisibility: 'hidden',
    backfaceVisibility: 'hidden',
    transition: 'filter 0.2s ease, transform 0.12s ease',
  };

  return (
    <main className="page has-dock photo-page">
      <Topbar title="Photo print" back onBack={() => go("entry")} />
      <input
        ref={photoInput}
        className="visually-hidden"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
        onChange={event => importPhoto(event.target.files?.[0])}
      />
      <section className="photo-context">
        <div>
          <span className="kicker">A4 PHOTO SHEET</span>
          <h1>Place it once.<br />We’ll size the rest.</h1>
        </div>
        <button type="button" onClick={() => photoInput.current?.click()}>
          <Icon name="camera" />
          <span>
            {isCardLayout
              ? (cardPhotos[selectedSlot] ? "Replace image" : `Choose ${selectedSlot === 0 ? "front" : "back"}`)
              : photoSrc ? "Change photo" : "Choose photo"}
            <small>{isUploading ? "Uploading in background…" : "JPG, PNG, WEBP, HEIC"}</small>
          </span>
        </button>
      </section>

      <div className="photo-preview">
        <div className="sheet-toolbar">
          <span>LIVE PREVIEW</span>
          <b>{config.slots} SLOT{config.slots > 1 ? "S" : ""}</b>
        </div>
        <div
          className={`photo-sheet ${config.className}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (file) importPhoto(file);
          }}
          style={layout === "Custom" ? {
            gridTemplateColumns: `repeat(${customColumns}, 1fr)`,
            gridTemplateRows: `repeat(${customRows}, 1fr)`
          } : undefined}
        >
          {Array.from({ length: config.slots }, (_, i) => {
            const slotPhoto = isCardLayout ? cardPhotos[i] : photoSrc;
            const hasPhoto = Boolean(slotPhoto) && (isCardLayout ? true : filledAll || i === 0);

            return (
              <div
                key={`photo-slot-${layout || "empty"}-${i}`}
                role="button"
                tabIndex={0}
                className={`photo-slot ${i === selectedSlot ? "selected" : ""} ${hasPhoto ? "filled" : "empty"}`}
                style={i === selectedSlot ? { transform: `scale(${slotScale / 100})` } : undefined}
                onClick={() => {
                  setSelectedSlot(i);
                  if (!hasPhoto && !slotPhoto) {
                    photoInput.current?.click();
                  }
                }}
                onKeyDown={event => event.key === "Enter" && setSelectedSlot(i)}
                onPointerDown={event => {
                  if (!hasPhoto) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragState.current = {
                    x: event.clientX,
                    y: event.clientY,
                    originX: photoOffset.x,
                    originY: photoOffset.y
                  };
                }}
                onPointerMove={event => {
                  if (!dragState.current) return;
                  setPhotoOffset({
                    x: Math.max(-45, Math.min(45, dragState.current.originX + event.clientX - dragState.current.x)),
                    y: Math.max(-45, Math.min(45, dragState.current.originY + event.clientY - dragState.current.y))
                  });
                }}
                onPointerUp={() => {
                  dragState.current = null;
                }}
              >
                {slotPhoto && hasPhoto ? (
                  <img src={slotPhoto} alt="" style={imageStyle} />
                ) : !isCardLayout && hasPhoto ? (
                  <span className="avatar-shape" style={{ transform: `scale(${1 + zoom / 180}) rotate(${rotation}deg)` }} />
                ) : (
                  <span className="empty-slot" onClick={() => photoInput.current?.click()}>
                    <strong>+</strong>
                    <small>{isCardLayout ? (i === 0 ? "Add front" : "Add back") : "Add photo"}</small>
                  </span>
                )}
                {i === selectedSlot && (
                  <span className="slot-handles" key={`slot-handles-${i}`}>
                    <i />
                    <b
                      className="resize-handle"
                      onPointerDown={event => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        resizeState.current = {
                          x: event.clientX,
                          origin: slotScale
                        };
                      }}
                      onPointerMove={event => {
                        if (resizeState.current) setSlotScale(Math.max(72, Math.min(100, resizeState.current.origin + (event.clientX - resizeState.current.x) / 2)));
                      }}
                      onPointerUp={event => {
                        event.stopPropagation();
                        resizeState.current = null;
                      }}
                    />
                  </span>
                )}
                {(layout === "ID card" || layout === "Aadhaar") && <em>{i === 0 ? "FRONT" : "BACK"}</em>}
              </div>
            );
          })}
        </div>
        <div className="sheet-caption">
          <span>A4 · {config.label} · {colorMode === 'bw' ? 'B&W' : 'Colour'}</span>
          <b>{ratio} crop</b>
        </div>
        <div className="edit-hint">Drag photo to reposition · pull lime corner to resize · tap empty slot to pick photo</div>
      </div>

      <div className="photo-section-title">
        <label>Print mode &amp; Color</label>
        <span>{colorMode === 'bw' ? '50% B&W Rate' : 'Full Colour'}</span>
      </div>
      <div style={{ margin: "0 0 16px" }}>
        <Segmented
          values={["Colour", "Black & White"]}
          selected={colorMode === 'colour' ? "Colour" : "Black & White"}
          onSelect={v => setColorMode(v === "Colour" ? 'colour' : 'bw')}
        />
      </div>

      <div className="photo-section-title">
        <label>Choose layout</label>
        <span>Exact print sizes</span>
      </div>
      <div className="layout-scroll">
        {Object.keys(layouts).map(value => (
          <button
            key={value}
            type="button"
            className={layout === value ? "active" : ""}
            onClick={() => selectLayout(value)}
          >
            <b>{value}</b>
            <small>{layouts[value].slots} slot{layouts[value].slots > 1 ? "s" : ""}</small>
          </button>
        ))}
      </div>

      {isCardLayout && (
        <div className="card-side-switch">
          <button type="button" className={selectedSlot === 0 ? "active" : ""} onClick={() => setSelectedSlot(0)}>
            <span>1</span><b>Front</b><small>{cardPhotos[0] ? "Image ready" : "Add image"}</small>
          </button>
          <button type="button" className={selectedSlot === 1 ? "active" : ""} onClick={() => setSelectedSlot(1)}>
            <span>2</span><b>Back</b><small>{cardPhotos[1] ? "Image ready" : "Add image"}</small>
          </button>
        </div>
      )}

      {layout === "Custom" && (
        <div className="custom-grid-controls">
          <div>
            <span><b>Columns</b><small>Across the page</small></span>
            <div className="stepper">
              <button type="button" onClick={() => setCustomColumns(Math.max(1, customColumns - 1))}>−</button>
              <b>{customColumns}</b>
              <button type="button" onClick={() => setCustomColumns(Math.min(4, customColumns + 1))}>+</button>
            </div>
          </div>
          <div>
            <span><b>Rows</b><small>Down the page</small></span>
            <div className="stepper">
              <button type="button" onClick={() => setCustomRows(Math.max(1, customRows - 1))}>−</button>
              <b>{customRows}</b>
              <button type="button" onClick={() => setCustomRows(Math.min(5, customRows + 1))}>+</button>
            </div>
          </div>
        </div>
      )}

      <div className="tool-panel">
        <div>
          <label>Crop ratio <span>Slot {selectedSlot + 1}</span></label>
          <div className="chip-row">
            {["Original", "3:4", "1:1"].map(value => (
              <button
                key={value}
                type="button"
                className={ratio === value ? "active" : ""}
                onClick={() => setRatio(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Image fit</label>
          <Segmented values={["Fit", "Fill", "Stretch"]} selected={fit} onSelect={setFit} />
        </div>
        <label className="zoom-control">
          <span>Zoom <b>{zoom}%</b></span>
          <input type="range" min="0" max="100" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
        </label>
        <div className="action-pair">
          <button type="button" onClick={() => setRotation((rotation + 90) % 360)}>↻ Rotate 90°</button>
          {isCardLayout ? (
            <button type="button" onClick={() => photoInput.current?.click()}>Replace {selectedSlot === 0 ? "front" : "back"}</button>
          ) : (
            <button
              type="button"
              className={filledAll ? "active" : ""}
              onClick={() => {
                setFilledAll(!filledAll);
                notify(filledAll ? "Only the first slot is filled" : `Filled all ${config.slots} slots`);
              }}
            >
              {filledAll ? "Clear repeats" : "Fill all slots"}
            </button>
          )}
        </div>
      </div>

      <div className={`photo-safe-note ${!layout || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc) ? "pending" : ""}`}>
        <Icon name={!layout || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc) ? "camera" : "check"} />
        {isCardLayout && cardPhotos.some(photo => !photo)
          ? "Add both front and back to continue."
          : !photoSrc
          ? "Tap Choose photo or tap any empty slot to add photo."
          : `Photo ready · ${colorMode === 'bw' ? 'Black & White' : 'Colour'} print verified.`}
      </div>

      <div className="bottom-dock">
        <div className="total-block">
          <span>{layout ? `1 A4 sheet · ${config.slots} slot${config.slots !== 1 ? 's' : ''} · ${colorMode === 'bw' ? 'B&W' : 'Colour'}` : "Choose a layout"}</span>
          <b>₹{finalPrice}.00</b>
          <small>{colorMode === 'bw' ? "50% B&W discount applied" : "Standard photo rate"}</small>
        </div>
        <button
          type="button"
          className="primary"
          disabled={isGenerating || (isCardLayout ? cardPhotos.some(photo => !photo) : !photoSrc)}
          onClick={async () => {
            if (isGenerating) return;
            setIsGenerating(true);
            try {
              const fileId = crypto.randomUUID();
              let targetFile: File | null = rawFileRef.current;
              let finalPreviewUrl: string = photoSrc;

              if (rawFileRef.current) {
                notify("Generating Ultra HD 300 DPI photo sheet…");
                try {
                  const hdResult = await generateUltraHdPhotoSheet({
                    primaryFile: rawFileRef.current,
                    secondaryFile: secondaryFileRef.current,
                    layout,
                    colorMode,
                    zoom,
                    rotation,
                    photoOffset,
                    fit,
                    customRows,
                    customColumns,
                    slotScale,
                    filledAll
                  });
                  targetFile = hdResult.file;
                  finalPreviewUrl = hdResult.previewUrl;
                } catch (genErr) {
                  console.warn("Ultra HD generation error, falling back to original:", genErr);
                }
              }

              const pFile: PrintFile = {
                id: fileId,
                name: `Photo Sheet — ${config.label} (${colorMode === 'bw' ? 'B&W' : 'Colour'})`,
                size: targetFile?.size || 2048,
                type: 'jpg',
                pages: 1,
                colorPages: colorMode === 'bw' ? 0 : 1,
                colorDetection: 'done',
                settings: {
                  copies: 1,
                  colorMode: colorMode === 'bw' ? 'bw' : 'colour',
                  paper: 'A4',
                  sided: 'single',
                  orientation: 'auto',
                  nUp: 1,
                  layout: 'standard',
                  pageRotations: {},
                  booklet: false,
                  range: 'all',
                },
              };

              (pFile as any).isPhotoSheet = true;
              (pFile as any).photoLayout = layout;
              (pFile as any).photoUnitPrice = finalPrice;
              if (finalPreviewUrl) (pFile as any).previewUrl = finalPreviewUrl;

              if (targetFile) {
                rawFileMap.set(fileId, targetFile);
                try {
                  const uploadRes = await api.uploadFile(targetFile);
                  if (uploadRes?.cloudId) {
                    (pFile as any).cloudId = uploadRes.cloudId;
                  }
                } catch (err) {
                  console.warn("Ultra HD sheet upload warning:", err);
                }
              }

              useBasket.getState().addFile(pFile);

              addService({
                id: crypto.randomUUID(),
                type: 'addon',
                name: `Photo print — ${config.label}`,
                detail: `A4 · ${config.slots} slot${config.slots > 1 ? 's' : ''} · ${colorMode === 'bw' ? 'B&W' : 'Colour'}`,
                price: finalPrice,
                qty: 1,
                attachTo: fileId,
              });

              notify(`${config.label} (${colorMode === 'bw' ? 'B&W' : 'Colour'}) added to basket`);
              go("basket");
            } finally {
              setIsGenerating(false);
            }
          }}
        >
          {isGenerating
            ? "Generating Ultra HD…"
            : (isCardLayout && cardPhotos.some(photo => !photo) ? "Add front + back" : "Add photo sheet")}
        </button>
      </div>
    </main>
  );
}

export default PhotoTool;
