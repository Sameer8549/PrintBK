import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ServiceItem } from '../lib/types';

interface BasketState {
  files: any[];
  services: ServiceItem[];
  addFile: (file: any) => void;
  addService: (service: ServiceItem) => void;
  clear: () => void;
}

export const useBasket = create<BasketState>()(
  persist(
    (set) => ({
      files: [],
      services: [],
      addFile: (file) => set((state) => ({ files: [...state.files, file] })),
      addService: (service) => set((state) => ({ services: [...state.services, service] })),
      clear: () => set({ files: [], services: [] })
    }),
    {
      name: 'printbk-basket',
    }
  )
);
