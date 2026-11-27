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
    bw: { available: true },
    colour: { available: true },
    photos: { available: true },
    binding_spiral: { available: true },
    binding_comb: { available: true },
    binding_staple: { available: true },
    binding_soft: { available: true },
    binding_hard: { available: true },
    spiral: { available: true },
    comb: { available: true },
    staple: { available: true },
    soft: { available: true },
    hard: { available: true },
    lamination: { available: true },
    scanning: { available: true },
    photocopy: { available: true },
    typing: { available: true },
    rush: { available: true },
    custom: { available: true },
    something_else: { available: true }
  },
  paymentMethods: {
    cash: true,
    upi: true
  },
  upi: {
    enabled: true,
    payeeName: 'HKBK Student Point',
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

const API_BASE = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '/server/api').replace(/\/$/, '');

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

      const endpoint = API_BASE.endsWith('/server/api')
        ? `${API_BASE}/config`
        : `${API_BASE}/server/api/config`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        cache: 'no-store'
      }).catch(() => null);

      if (!res) return;

      // Handle HTTP 304 Not Modified cleanly without falling through
      if (res.status === 304) {
        return;
      }

      if (!res.ok) {
        return;
      }

      const newEtag = res.headers.get('ETag');
      const data = await res.json();
      const prevConfig = get().config;
      const mergedRates = {
        ...DEFAULT_EXTENDED_CONFIG.rates,
        ...(data.rates || {})
      };

      const pricesChanged = Boolean(
        prevConfig && prevConfig.rates && (
          Number(prevConfig.rates.bw) !== Number(mergedRates.bw) ||
          Number(prevConfig.rates.colour) !== Number(mergedRates.colour) ||
          Number(prevConfig.rates.duplex) !== Number(mergedRates.duplex) ||
          Number(prevConfig.rates.bindingSpiral) !== Number(mergedRates.bindingSpiral) ||
          Number(prevConfig.rates.bindingComb) !== Number(mergedRates.bindingComb) ||
          Number(prevConfig.rates.bindingHard) !== Number(mergedRates.bindingHard) ||
          Number(prevConfig.rates.laminationA4) !== Number(mergedRates.laminationA4) ||
          Number(prevConfig.rates.scanPerPage) !== Number(mergedRates.scanPerPage) ||
          Number(prevConfig.rates.photo4x6) !== Number(mergedRates.photo4x6)
        )
      );

      set({
        config: {
          ...DEFAULT_EXTENDED_CONFIG,
          ...data,
          rates: mergedRates,
          services: {
            ...DEFAULT_EXTENDED_CONFIG.services,
            ...(data.services || {})
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

      if (typeof window !== 'undefined') {
        (window as any).__printbk_config = data;
      }

      if (pricesChanged) {
        notify(`Prices updated by shop (B&W: ₹${Number(mergedRates.bw).toFixed(2)}, Colour: ₹${Number(mergedRates.colour).toFixed(2)})`);
      }
    } catch (_) {}
  }
}));

// Initialize polling every 1.0 second, plus on focus/visibility change
let pollingInitialized = false;
export function initShopConfigPolling() {
  if (typeof window === 'undefined' || pollingInitialized) return;
  pollingInitialized = true;

  // Immediate fetch
  useShopConfig.getState().fetchConfig();

  // 1.0 second interval for lightning-fast real-time synchronization
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      useShopConfig.getState().fetchConfig();
    }
  }, 1000);

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
