import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import { PrintFile, Basket } from '@printbk/shared';

const execAsync = util.promisify(exec);
const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const POLL_INTERVAL = 5000;
const WORK_DIR = path.join(process.cwd(), 'work');

if (!fs.existsSync(WORK_DIR)) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
}

async function convertToPdf(inputPath: string, outputPath: string) {
  console.log(`Converting ${inputPath} to PDF via LibreOffice...`);
  // Mocking libreoffice execution for now, just copy as PDF if we are in mock env
  // Actual command: await execAsync(`soffice --headless --convert-to pdf "${inputPath}" --outdir "${path.dirname(outputPath)}"`);
  fs.copyFileSync(inputPath, outputPath);
}

async function processPdf(inputPath: string, outputPath: string, settings: any) {
  console.log(`Processing PDF for layout (N-up/Booklet/Ranges) using pdf-lib...`);
  // Stub for actual pdf-lib modification
  // const pdfDoc = await PDFDocument.load(fs.readFileSync(inputPath));
  // ... page extraction, n-up canvas logic ...
  // fs.writeFileSync(outputPath, await pdfDoc.save());
  fs.copyFileSync(inputPath, outputPath);
}

async function printFile(pdfPath: string, settings: any) {
  console.log(`Printing ${pdfPath} to system printer...`);
  // Actual command depends on OS.
  // Windows: SumatraPDF.exe -print-to-default
  // Linux: lp -d default
  // Mac: lpr
  // await execAsync(`lp "${pdfPath}"`);
}

async function pollOrders() {
  try {
    const res = await fetch(`${API_BASE}/agent/orders`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    
    const orders: any[] = await res.json();
    for (const order of orders) {
      console.log(`Processing order ${order.id}...`);
      
      const basket: Basket = JSON.parse(order.basket);
      for (const file of basket.files) {
        console.log(`Downloading ${file.name}...`);
        const fileRes = await fetch(`${API_BASE}/agent/files/${file.id}`);
        if (!fileRes.ok) continue;
        
        const ext = path.extname(file.name).toLowerCase();
        const rawPath = path.join(WORK_DIR, `${file.id}_raw${ext}`);
        const pdfPath = path.join(WORK_DIR, `${file.id}_source.pdf`);
        const finalPdfPath = path.join(WORK_DIR, `${file.id}_final.pdf`);
        
        const buffer = await fileRes.buffer();
        fs.writeFileSync(rawPath, buffer);
        
        if (ext !== '.pdf') {
          await convertToPdf(rawPath, pdfPath);
        } else {
          fs.copyFileSync(rawPath, pdfPath);
        }
        
        await processPdf(pdfPath, finalPdfPath, file.settings);
        await printFile(finalPdfPath, file.settings);
        
        // Clean up
        fs.unlinkSync(rawPath);
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        fs.unlinkSync(finalPdfPath);
      }
      
      // Mark as completed
      await fetch(`${API_BASE}/agent/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      console.log(`Order ${order.id} marked as completed.`);
    }
  } catch (err) {
    console.error('Error polling orders:', err);
  }
  
  setTimeout(pollOrders, POLL_INTERVAL);
}

console.log('Starting PrintBK Agent...');
pollOrders();
