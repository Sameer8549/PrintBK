import React from 'react';
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

export interface ReceiptPrintData {
  orderNumber?: number | string;
  pickupCode?: string;
  total?: number;
  files?: Array<{ name: string; price?: number }>;
  services?: ServiceItem[];
  dateStr?: string;
  paymentMethod?: string;
  shopName?: string;
}

function printReceipt(receiptData?: ReceiptPrintData) {
  if (!receiptData || !receiptData.orderNumber) {
    notify("No active order receipt to print");
    return;
  }

  const popup = window.open("", "_blank", "width=460,height=760");
  if (!popup) {
    notify("Allow pop-ups to save the receipt as PDF");
    return;
  }

  const logoUrl = `${window.location.origin}${logo}`;
  const orderNumStr = String(receiptData.orderNumber);
  const codeStr = receiptData.pickupCode || "—";
  const total = Number(receiptData.total || 0);
  const shopName = receiptData.shopName || "HKBK Student Point";
  const dateStr = receiptData.dateStr || new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const paymentMethodStr = (receiptData.paymentMethod || "UPI").toUpperCase();

  const fileRows = (receiptData.files || []).map(f =>
    `<div class="row"><span>${f.name}</span><b>${f.price != null ? `₹${f.price}` : ""}</b></div>`
  ).join("");

  const serviceRows = (receiptData.services || []).map(s =>
    `<div class="row"><span>${s.name}</span><b>${s.price === null ? "Quote pending" : `₹${s.price}`}</b></div>`
  ).join("");

  popup.document.write(`<!doctype html><html><head><title>PrintBK receipt #${orderNumStr}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f4ee;color:#0b1020;font-family:Arial,sans-serif}
    .receipt{max-width:390px;margin:auto;padding:24px;border:2px solid #0b1020;background:#fff;box-shadow:5px 5px 0 #0b1020}
    header{display:flex;align-items:center;justify-content:space-between}img{width:52px;height:52px;object-fit:contain}
    h1{margin:0;font-size:25px}small{color:#6d7283}.dash{margin:20px 0;border-top:2px dashed #d5cdb9}
    .row{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:13px}.row b{font-family:monospace}
    .total{font-size:20px;font-weight:700}.code{text-align:center;padding:18px;border:2px solid #0b1020}
    .code b{display:block;font:700 40px monospace;letter-spacing:8px}.paid{color:#1f9d55;font-weight:700}
    footer{margin-top:22px;text-align:center;color:#7a7f90;font-size:10px}
    @media print{body{padding:0;background:#fff}.receipt{box-shadow:none;max-width:none}}
  </style></head><body><main class="receipt"><header><div><h1>PrintBK</h1><small>${shopName}</small></div><img src="${logoUrl}" alt="PrintBK"></header>
  <div class="dash"></div><div class="row"><span>Order</span><b>#${orderNumStr}</b></div><div class="row"><span>Paid</span><b class="paid">${paymentMethodStr} · ₹${total.toFixed(2)}</b></div>
  <div class="dash"></div>${fileRows}${serviceRows}
  <div class="dash"></div><div class="row total"><span>Total</span><b>₹${total.toFixed(2)}</b></div><div class="code"><small>PICKUP CODE</small><b>${codeStr}</b></div>
  <footer>Files auto-delete after printing.<br>${dateStr}</footer></main><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  popup.document.close();
}

async function shareReceipt(receiptData?: ReceiptPrintData) {
  if (!receiptData || !receiptData.orderNumber) {
    notify("No active order receipt to share");
    return;
  }
  const orderNumStr = String(receiptData.orderNumber);
  const total = Number(receiptData.total || 0);
  const codeStr = receiptData.pickupCode ? ` · Pickup code ${receiptData.pickupCode}` : "";
  const data = {
    title: `PrintBK receipt #${orderNumStr}`,
    text: `PrintBK order #${orderNumStr} · ₹${total.toFixed(2)}${codeStr}`
  };
  if (navigator.share) {
    await navigator.share(data).catch(() => undefined);
  } else {
    await navigator.clipboard?.writeText(data.text);
    notify("Receipt details copied");
  }
}

// Clean production export - no dummy files
const files: any[] = [];

export { notify, browseFiles, scanPages, printReceipt, shareReceipt, files };
