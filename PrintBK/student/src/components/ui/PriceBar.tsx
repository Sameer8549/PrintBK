import React from 'react';

export function PriceBar({ bw, color, discount, onClick }: any) {
  return (
    <button className="price-strip" onClick={onClick}>
      <span>B&W <b>₹{bw}</b></span><i /> <span>Colour <b>₹{color}</b></span><i /> <span>Double-side <b>{discount}</b></span>
    </button>
  );
}

