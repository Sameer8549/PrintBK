import { Basket, ShopConfig, OrderStatus, OrderItem, defaultShopConfig } from '@printbk/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/server/api';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('printbk_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('printbk_device_id', id);
    }
    return id;
  } catch {
    return 'anon_device';
  }
}

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

  async createOrder(basket: Basket & { payment?: string; expectedTotal?: number; settingsVersion?: number; phone?: string }): Promise<CreateOrderResponse> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId()
      },
      body: JSON.stringify(basket),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error || 'Failed to create order');
      Object.assign(errorObj, err);
      throw errorObj;
    }
    return res.json();
  },

  async getOrder(orderId: string, token?: string): Promise<any> {
    const headers: Record<string, string> = {
      'X-Device-Id': getDeviceId()
    };
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId()
    };
    let effectiveToken = token;
    if (!effectiveToken) {
      try {
        const stored = localStorage.getItem('printbk_history') || localStorage.getItem('printbk-basket-v4');
        if (stored) {
          const parsed = JSON.parse(stored);
          const orders = parsed?.state?.orders || parsed?.orders || (Array.isArray(parsed) ? parsed : []);
          const match = orders.find((o: any) => o.id === orderId);
          if (match?.accessToken) effectiveToken = match.accessToken;
        }
      } catch (_) {}
    }
    if (effectiveToken) {
      headers['X-Order-Token'] = effectiveToken;
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId()
    };
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId()
    };
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId()
    };
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
