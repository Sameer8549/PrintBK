import { Basket, ShopConfig, OrderStatus, defaultShopConfig } from '@printbk/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/server/api';

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
  },

  async getOrders(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/orders`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  },

  async payOrder(orderId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/pay`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to update payment');
    return res.json();
  },

  async updateOrderStatus(orderId: string, status: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update order status');
    return res.json();
  }
};
