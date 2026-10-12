import { Basket, ShopConfig, OrderStatus, OrderItem, defaultShopConfig } from '@printbk/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/server/api';

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: number;
  status: OrderStatus;
  breakdown: any;
  pickupCode?: string | null;
  accessToken: string;
  items?: OrderItem[];
}

export const api = {
  async getConfig(): Promise<ShopConfig & { paymentMethods?: { cash: boolean; razorpay: boolean } }> {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) return res.json();
    } catch (err) {
      console.error('Failed to fetch config, using default', err);
    }
    return defaultShopConfig;
  },

  async uploadFile(file: File): Promise<{ cloudId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload file');
    }
    return res.json();
  },

  async createOrder(basket: Basket & { payment?: string }): Promise<CreateOrderResponse> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(basket),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create order');
    }
    return res.json();
  },

  async getOrder(orderId: string, token?: string): Promise<any> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Order-Token'] = token;
    }
    const res = await fetch(`${API_BASE}/orders/${orderId}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch order');
    }
    return res.json();
  },

  async deleteFiles(orderId: string, token?: string): Promise<{ ok: boolean; deletedAt: number }> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Order-Token'] = token;
    }
    const res = await fetch(`${API_BASE}/orders/${orderId}/delete-files`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete files');
    }
    return res.json();
  },

  async chooseCash(orderId: string, token?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Order-Token'] = token;
    const res = await fetch(`${API_BASE}/orders/${orderId}/choose-cash`, {
      method: 'POST',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to select cash payment');
    }
    return res.json();
  },

  async startUpi(orderId: string, token?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Order-Token'] = token;
    const res = await fetch(`${API_BASE}/orders/${orderId}/start-upi`, {
      method: 'POST',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to initiate UPI payment');
    }
    return res.json();
  },

  async upiReturn(orderId: string, token?: string, utr?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Order-Token'] = token;
    const res = await fetch(`${API_BASE}/orders/${orderId}/upi-return`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ utr })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to claim UPI payment');
    }
    return res.json();
  },
};
