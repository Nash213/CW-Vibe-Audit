export interface User {
  id: number;
  email: string;
  name: string;
  role: 'customer' | 'admin';
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number | string;
  stock: number;
  image_url?: string | null;
  category: string;
  created_at?: string;
  updated_at?: string;
}

export interface CartItem {
  id?: number;
  productId: number;
  name: string;
  description?: string;
  price: number;
  stock: number;
  imageUrl?: string | null;
  category?: string;
  quantity: number;
  subtotal: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  imageUrl?: string | null;
  category?: string;
}

export interface Order {
  id: number;
  userId: number;
  totalAmount: number;
  status: string;
  shippingAddress: string;
  createdAt: string;
  customerName?: string;
  customerEmail?: string;
  itemCount: number;
  items?: OrderItem[];
}
