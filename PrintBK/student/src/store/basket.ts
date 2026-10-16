import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { priceOrder, defaultShopConfig, PriceBreakdown, PrintFile, ServiceLine } from '@printbk/shared';
import { countPages } from '../lib/pdfPages';
import { useShopConfig } from './shopConfig';

// Re-export PrintFile so other files can import from here
export type { PrintFile };

interface BasketState {
  files: PrintFile[];
  services: ServiceLine[];
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  isProcessing: boolean;
  setProcessing: (val: boolean) => void;
  addFile: (file: PrintFile) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<PrintFile>) => void;
  addService: (service: ServiceLine) => void;
  removeService: (id: string) => void;
  clear: () => void;
}

export const useBasket = create<BasketState>()(
  persist(
    (set, get) => ({
      files: [],
      services: [],
      activeFileId: null,
      setActiveFileId: (activeFileId) => set({ activeFileId }),
      isProcessing: false,
      setProcessing: (isProcessing) => set({ isProcessing }),
      addFile: (file) => set((state) => ({ files: [...state.files, file], activeFileId: file.id })),
      removeFile: (id) => {
        try { rawFileMap.delete(id); } catch (_) {}
        set((state) => {
          const remaining = state.files.filter(f => f.id !== id);
          return {
            files: remaining,
            activeFileId: state.activeFileId === id ? (remaining[0]?.id || null) : state.activeFileId
          };
        });
      },
      updateFile: (id, updates) => set((state) => ({
        files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
      })),
      addService: (service) => set((state) => ({ services: [...state.services, service] })),
      removeService: (id) => set((state) => ({ services: state.services.filter(s => s.id !== id) })),
      clear: () => set({ files: [], services: [], activeFileId: null, isProcessing: false }),
    }),
    { name: 'printbk-basket-v4' }
  )
);

// Reactive pricing hook — recalculates on every basket change and dynamic shop rate change
export function usePricing(): PriceBreakdown {
  const files = useBasket(s => s.files);
  const services = useBasket(s => s.services);
  const config = useShopConfig(s => s.config);
  try {
    return priceOrder({ files, services, rush: false }, config, new Date());
  } catch {
    return { lines: [], subtotal: 0, rushFee: 0, gatewayFee: 0, total: 0, savingsTip: null, quotePending: false };
  }
}

// In-memory cache of raw File objects for live preview and canvas rendering
export const rawFileMap = new Map<string, File>();

/**
 * Build a PrintFile from a raw browser File object.
 * The raw File is stored in rawFileMap so live previews and sliders can render it.
 */
export function fileFromRaw(raw: File): PrintFile {
  const ext = (raw.name || '').split('.').pop()?.toLowerCase() ?? '';
  const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

  // Cache File object in memory
  rawFileMap.set(id, raw);

  return {
    id,
    name: raw.name,
    size: raw.size,
    type: ext,
    pages: 1,       // placeholder — real count applied in addFile()
    colorPages: 0,
    colorDetection: 'pending',
    settings: {
      copies: 1,
      colorMode: 'bw',
      sided: 'double',
      paper: 'A4',
      orientation: 'auto',
      nUp: 1,
      layout: 'standard',
      pageRotations: {},
      booklet: false,
      range: 'all',
    },
  };
}

// Order history stored locally
export interface OrderRecord {
  id: string;
  orderNumber?: number;
  date: number;
  files: string[];
  total: number;
  pickupCode: string;
  status: string;
  paymentMethod?: string;
  accessToken?: string;
  deleteAfter?: number;
  filesDeletedAt?: number;
}

interface HistoryState {
  orders: OrderRecord[];
  addOrder: (order: OrderRecord) => void;
  updateOrder: (id: string, updates: Partial<OrderRecord>) => void;
  clearHistory: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      orders: [],
      addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
      updateOrder: (id, updates) =>
        set((state) => ({
          orders: state.orders.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        })),
      clearHistory: () => set({ orders: [] }),
    }),
    { name: 'printbk-history-v1' }
  )
);
