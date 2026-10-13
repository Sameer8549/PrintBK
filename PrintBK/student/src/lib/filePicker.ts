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
    fileInputRef.style.display = 'none';
    document.body.appendChild(fileInputRef);
  }
  fileInputRef.onchange = () => {
    if (!fileInputRef?.files?.length) return;
    const files = Array.from(fileInputRef.files);
    fileInputRef.value = '';

    // 1. Immediately create and add all files to basket so user gets instant UI
    const createdFiles: PrintFile[] = [];
    for (const raw of files) {
      const pFile = fileFromRaw(raw);
      // Fast heuristic for images
      if (raw.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(raw.name)) {
        pFile.pages = 1;
      }
      addFile(pFile);
      createdFiles.push(pFile);
    }

    if (createdFiles.length > 0) {
      useBasket.getState().setActiveFileId(createdFiles[createdFiles.length - 1].id);
    }

    // 2. Instantly navigate to basket — zero blocking delay
    go('basket');
    notify(`${files.length} file(s) added`);

    // 3. Count exact pages & background cloud backup asynchronously
    for (let i = 0; i < files.length; i++) {
      const raw = files[i];
      const pFile = createdFiles[i];

      countPages(raw)
        .then((pages) => {
          if (pages && pages > 0 && pages !== pFile.pages) {
            useBasket.getState().updateFile(pFile.id, { pages });
          }
        })
        .catch((err) => {
          console.warn('Background page count failed for', raw.name, err);
        });

      api.uploadFile(raw)
        .then((res) => {
          if (res?.cloudId) {
            (pFile as any).cloudId = res.cloudId;
            useBasket.getState().updateFile(pFile.id, { cloudId: res.cloudId } as any);
          }
        })
        .catch((err) => {
          console.warn('Background cloud backup skipped:', err);
        });
    }
  };
  fileInputRef.click();
}
