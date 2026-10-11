import { notify } from './store';
import { fileFromRaw, useBasket } from '../store/basket';
import { countPages } from './pdfPages';
import { api } from '../services/api';
import type { PrintFile } from '../store/basket';

let fileInputRef: HTMLInputElement | null = null;

export function browseAndAddFiles(
  go: (screen: string) => void,
  addFile: (f: PrintFile) => void
) {
  if (!fileInputRef) {
    fileInputRef = document.createElement('input');
    fileInputRef.type = 'file';
    fileInputRef.multiple = true;
    fileInputRef.accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png';
  }
  fileInputRef.onchange = async () => {
    if (!fileInputRef?.files?.length) return;
    const files = Array.from(fileInputRef.files);
    fileInputRef.value = '';

    // 1. Immediately switch screen with processing status
    useBasket.getState().setProcessing(true);
    go('basket');
    notify(`Processing ${files.length} file(s)…`);

    try {
      // 2. Count pages in parallel (super fast locally)
      await Promise.all(
        files.map(async (raw) => {
          try {
            const pages = await countPages(raw);
            const pFile = fileFromRaw(raw);
            pFile.pages = pages;
            addFile(pFile);

            // 3. Silent background cloud upload (never blocks the student)
            api.uploadFile(raw).then((res) => {
              if (res?.cloudId) {
                (pFile as any).cloudId = res.cloudId;
                useBasket.getState().updateFile(pFile.id, { cloudId: res.cloudId } as any);
              }
            }).catch((err) => {
              console.warn('Background cloud backup skipped:', err);
            });
          } catch (err) {
            console.warn('Failed to parse pages for', raw.name, err);
            addFile(fileFromRaw(raw)); // graceful 1-page fallback
          }
        })
      );
    } finally {
      useBasket.getState().setProcessing(false);
    }

    notify(`${files.length} file(s) ready`);
  };
  fileInputRef.click();
}
