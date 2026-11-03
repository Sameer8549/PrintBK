import { get, set, del, clear } from 'idb-keyval';
import type { PrintFile } from '@printbk/shared';

const PREFIX = 'pbk_file_';

/**
 * Persist raw File or Blob in IndexedDB so previews and printing remain
 * 100% intact even if the user refreshes, exits, or closes their browser tab.
 */
export async function saveFileBlob(id: string, fileOrBlob: Blob | File): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    await set(`${PREFIX}${id}`, fileOrBlob);
  } catch (err) {
    console.warn(`[FileStorage] Failed to persist file ${id} to IndexedDB:`, err);
  }
}

/**
 * Retrieve raw File or Blob from IndexedDB.
 */
export async function getFileBlob(id: string): Promise<File | Blob | null> {
  try {
    if (typeof window === 'undefined') return null;
    const blob = await get(`${PREFIX}${id}`);
    return blob || null;
  } catch (err) {
    console.warn(`[FileStorage] Failed to read file ${id} from IndexedDB:`, err);
    return null;
  }
}

/**
 * Delete a specific file from IndexedDB.
 */
export async function deleteFileBlob(id: string): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    await del(`${PREFIX}${id}`);
  } catch (err) {
    console.warn(`[FileStorage] Failed to delete file ${id} from IndexedDB:`, err);
  }
}

/**
 * Clear all persisted files from IndexedDB.
 */
export async function clearAllFileBlobs(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    await clear();
  } catch (err) {
    console.warn('[FileStorage] Failed to clear IndexedDB:', err);
  }
}

/**
 * Ensures a File object is loaded in rawMap for the given PrintFile.
 * Resolves in order:
 * 1. In-memory rawMap
 * 2. IndexedDB persistent storage
 * 3. Catalyst Cloud FileStore backup (via cloudId)
 */
export async function ensureFileInMemory(
  file: PrintFile,
  rawMap: Map<string, File>
): Promise<File | null> {
  if (!file || !file.id) return null;

  // 1. Check in-memory map
  if (rawMap.has(file.id)) {
    return rawMap.get(file.id)!;
  }

  // 2. Check IndexedDB persistent cache
  try {
    const cachedBlob = await getFileBlob(file.id);
    if (cachedBlob) {
      let restoredFile: File;
      if (cachedBlob instanceof File) {
        restoredFile = cachedBlob;
      } else {
        const mimeType = cachedBlob.type || (file.type === 'pdf' ? 'application/pdf' : 'application/octet-stream');
        restoredFile = new File([cachedBlob], file.name || 'document.pdf', { type: mimeType });
      }
      rawMap.set(file.id, restoredFile);
      return restoredFile;
    }
  } catch (idbErr) {
    console.warn(`[FileStorage] IndexedDB retrieval failed for ${file.id}:`, idbErr);
  }

  // 3. Fallback to Cloud Backup if available
  const cloudId = (file as any).cloudId;
  if (cloudId) {
    try {
      const candidates = [
        `/server/api/files/${cloudId}`,
        `/server/api/files/download/${cloudId}`
      ];
      for (const url of candidates) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            const restoredFile = new File([blob], file.name || 'document.pdf', {
              type: blob.type || (file.type === 'pdf' ? 'application/pdf' : 'application/octet-stream')
            });
            rawMap.set(file.id, restoredFile);
            // Re-save into IndexedDB for subsequent instant loads
            await saveFileBlob(file.id, restoredFile);
            return restoredFile;
          }
        } catch (_) {}
      }
    } catch (cloudErr) {
      console.warn(`[FileStorage] Cloud fallback retrieval failed for ${file.id}:`, cloudErr);
    }
  }

  return null;
}
