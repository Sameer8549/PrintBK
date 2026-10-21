import { create } from 'zustand';
import { defaultShopConfig, ShopConfig } from '@printbk/shared';
import { notify } from '../lib/store';

export interface ExtendedShopConfig extends ShopConfig {
  version: number;
  open: boolean;
  closedSince: number | null;
  reopenAt?: string | null;
  reason?: string;
  announcement: string;
  shopName: string;
  address: string;
  hours: string;
  phone: string;
  shopInfo: {
    name?: string;
    address?: string;
    hours?: string;
    phone?: string;
    logo?: string;
    payee?: string;
    upi?: string;
    [key: string]: any;
  };
  services: Record<string, { available: boolean; reason?: string }>;
  paymentMethods: {
    cash: boolean;
    upi: boolean;
    razorpay: boolean;
  };
  upi: {
    enabled: boolean;
    payeeName: string;
    upiId: string;
  };
  deleteDelayMinutes: number;
  printerStatus: {
    online: boolean;
    count: number;
    paperLow?: boolean;
    summary: string;
  };
  updatedAt: number;
}

const DEFAULT_EXTENDED_CONFIG: ExtendedShopConfig = {
  ...defaultShopConfig,
  version: 1,
  open: true,
  closedSince: null,
  reopenAt: null,
  reason: 'open',
  announcement: '',
  shopName: 'HKBK Student Point',
  address: 'HKBK College Campus, Nagawara, Bengaluru',
  hours: '8:30 AM – 6:00 PM (Mon–Sat)',
  phone: '',
  shopInfo: {
    name: 'HKBK Student Point',
    address: 'HKBK College Campus, Nagawara, Bengaluru',
    hours: '8:30 AM – 6:00 PM (Mon–Sat)',
    phone: '',
    logo: '/printbk-logo.svg'
  },
  services: {
    document_bw: { available: true },
    document_colour: { available: true },
    photos: { available: true },
    binding_spiral: { available: true },
    binding_soft: { available: true },
    binding_hard: { available: true },
    lamination: { available: true },
    scanning: { available: true },
    photocopy: { available: true },
    typing: { available: true }
  },
  paymentMethods: {
    cash: true,
    upi: true,
    razorpay: false
  },
  upi: {
    enabled: true,
    payeeName: 'PrintBK HKBK',
    upiId: 'Q098686787@ybl'
  },
  deleteDelayMinutes: 5,
  printerStatus: {
    online: false,
    count: 0,
    paperLow: false,
    summary: 'Connecting to printer...'
  },
  updatedAt: Math.floor(Date.now() / 1000)
};

interface ShopConfigStore {
  config: ExtendedShopConfig;
  lastEtag: string | null;
  pricesUpdatedNotice: boolean;
  fetchConfig: () => Promise<void>;
  dismissPriceNotice: () => void;
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export const useShopConfig = create<ShopConfigStore>((set, get) => ({
  config: DEFAULT_EXTENDED_CONFIG,
  lastEtag: null,
  pricesUpdatedNotice: false,
  dismissPriceNotice: () => set({ pricesUpdatedNotice: false }),
  fetchConfig: async () => {
    try {
      const headers: Record<string, string> = {};
      const currentEtag = get().lastEtag;
      if (currentEtag) {
        headers['If-None-Match'] = currentEtag;
      }

      let res = await fetch(`${API_BASE}/server/api/config`, {
        method: 'GET',
        headers
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${API_BASE}/config`, {
          method: 'GET',
          headers
        }).catch(() => null);
      }

      if (!res) return;

      if (res.status === 304) {
        return; // Not modified
      }

      if (res.ok) {
        const newEtag = res.headers.get('ETag');
        const data = await res.json();
        const prevConfig = get().config;

        const isNewVersion = prevConfig && data.version && data.version !== prevConfig.version;
        const pricesChanged = isNewVersion && JSON.stringify(prevConfig.rates) !== JSON.stringify(data.rates);

        set({
          config: {
            ...DEFAULT_EXTENDED_CONFIG,
            ...data,
            rates: {
              ...DEFAULT_EXTENDED_CONFIG.rates,
              ...(data.rates || {})
            },
            shopInfo: {
              ...DEFAULT_EXTENDED_CONFIG.shopInfo,
              ...(data.shopInfo || data.shop_info || {})
            },
            upi: {
              ...DEFAULT_EXTENDED_CONFIG.upi,
              ...(data.upi || {})
            }
          },
          lastEtag: newEtag || currentEtag,
          pricesUpdatedNotice: pricesChanged ? true : get().pricesUpdatedNotice
        });

        if (pricesChanged) {
          notify('Prices updated by shop.');
        }
      }
    } catch (_) {}
  }
}));

// Initialize polling every 5 seconds, plus on focus/visibility change
let pollingInitialized = false;
export function initShopConfigPolling() {
  if (typeof window === 'undefined' || pollingInitialized) return;
  pollingInitialized = true;

  // Immediate fetch
  useShopConfig.getState().fetchConfig();

  // 5 second interval
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      useShopConfig.getState().fetchConfig();
    }
  }, 5000);

  // Focus & visibility change listener
  window.addEventListener('focus', () => {
    useShopConfig.getState().fetchConfig();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useShopConfig.getState().fetchConfig();
    }
  });
  window.addEventListener('online', () => {
    useShopConfig.getState().fetchConfig();
  });
}
