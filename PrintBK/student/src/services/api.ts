import { Basket, ShopConfig, OrderStatus, defaultShopConfig } from '@printbk/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export const api = {
  async getConfig(): Promise<ShopConfig> {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) return res.json();
    } catch (err) {
      console.error('Failed to fetch config, using default', err);
    }
    return defaultShopConfig;
  },

  async getUploadUrl(): Promise<{ url: string; id: string }> {
    const res = await fetch(`${API_BASE}/upload-url`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to get upload URL');
    return res.json();
  },

  async uploadFile(url: string, file: File): Promise<void> {
    const isRelative = url.startsWith('/');
    const finalUrl = isRelative ? `${API_BASE}${url}` : url;
    const res = await fetch(finalUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
    if (!res.ok) throw new Error('Failed to upload file');
  },

  async createOrder(basket: Basket): Promise<{ orderId: string; status: OrderStatus; breakdown: any }> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(basket),
    });
    if (!res.ok) throw new Error('Failed to create order');
    return res.json();
  },

  async getOrder(orderId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    return res.json();
  }
};
