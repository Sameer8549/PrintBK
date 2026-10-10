import React from 'react';

import { useEffect, useMemo, useRef, useState } from "react";

import { Screen, Sheet, ServiceItem } from './types';

const logo = "/assets/printbk-logo.svg";

function notify(message: string) {
  window.dispatchEvent(new CustomEvent("printbk:toast", {
    detail: message
  }));
}

function browseFiles(go: (screen: Screen) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png";
  input.onchange = () => {
    if (input.files?.length) go("uploading");
  };
  input.click();
}

function scanPages(go: (screen: Screen) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.onchange = () => {
    if (input.files?.length) {
      notify(`${input.files.length} page${input.files.length > 1 ? "s" : ""} captured`);
      go("uploading");
    }
  };
  input.click();
}

function printReceipt(services: ServiceItem[] = []) {
  const popup = window.open("", "_blank", "width=460,height=760");
  if (!popup) {
    notify("Allow pop-ups to save the receipt as PDF");
    return;
  }
  const logoUrl = `${window.location.origin}${logo}`;
  const serviceRows = services.map(service => `<div class="row"><span>${service.name}</span><b>${service.price === null ? "Quote pending" : `₹${service.price}`}</b></div>`).join("");
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  popup.document.write(`<!doctype html><html><head><title>PrintBK receipt #1042</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f4ee;color:#0b1020;font-family:Arial,sans-serif}
    .receipt{max-width:390px;margin:auto;padding:24px;border:2px solid #0b1020;background:#fff;box-shadow:5px 5px 0 #0b1020}
    header{display:flex;align-items:center;justify-content:space-between}img{width:52px;height:52px;object-fit:contain}
    h1{margin:0;font-size:25px}small{color:#6d7283}.dash{margin:20px 0;border-top:2px dashed #d5cdb9}
    .row{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:13px}.row b{font-family:monospace}
    .total{font-size:20px;font-weight:700}.code{text-align:center;padding:18px;border:2px solid #0b1020}
    .code b{display:block;font:700 40px monospace;letter-spacing:8px}.paid{color:#1f9d55;font-weight:700}
    footer{margin-top:22px;text-align:center;color:#7a7f90;font-size:10px}
    @media print{body{padding:0;background:#fff}.receipt{box-shadow:none;max-width:none}}
  </style></head><body><main class="receipt"><header><div><h1>PrintBK</h1><small>HKBK Student Point</small></div><img src="${logoUrl}" alt="PrintBK"></header>
  <div class="dash"></div><div class="row"><span>Order</span><b>#1042</b></div><div class="row"><span>Paid</span><b class="paid">UPI · ₹${total}.00</b></div>
  <div class="dash"></div><div class="row"><span>Engineering Mathematics</span><b>₹18</b></div><div class="row"><span>Thermodynamics Lab</span><b>₹54</b></div><div class="row"><span>ID card front</span><b>₹14</b></div>${serviceRows}
  <div class="dash"></div><div class="row total"><span>Total paid</span><b>₹${total}.00</b></div><div class="code"><small>PICKUP CODE</small><b>4821</b></div>
  <footer>Files auto-delete 10 minutes after printing.<br>04 September 2025 · 12:42 PM</footer></main><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  popup.document.close();
}

async function shareReceipt(total = 86) {
  const data = {
    title: "PrintBK receipt #1042",
    text: `PrintBK order #1042 · Paid ₹${total}.00 · Pickup code 4821`
  };
  if (navigator.share) await navigator.share(data).catch(() => undefined);else {
    await navigator.clipboard?.writeText(data.text);
    notify("Receipt details copied");
  }
}

const files = [{
  name: "Engineering_Mathematics_Unit-4.pdf",
  pages: 40,
  meta: "Pages 1–12 · B&W · 2-up · Double-side",
  price: 18,
  kind: "PDF",
  badge: "Recognized"
}, {
  name: "Thermodynamics_Lab_Record.docx",
  pages: 18,
  meta: "All pages · Auto colour · Single-side",
  price: 54,
  kind: "DOCX",
  badge: "Saves ₹14 with 2-up"
}, {
  name: "ID_card_front.png",
  pages: 1,
  meta: "Colour · A4 · ID card size",
  price: 14,
  kind: "PNG",
  badge: "You already added this"
}];
export { notify, browseFiles, scanPages, printReceipt, shareReceipt, files };

