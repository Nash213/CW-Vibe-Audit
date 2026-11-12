import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { CartItem, Product } from '../types.js';
import { useAuth } from './AuthContext.js';

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  total: number;
  isLoading: boolean;
  addToCart: (product: Product, quantity?: number) => Promise<void>;
  updateQuantity: (productId: number, quantity: number) => Promise<void>;
  removeFromCart: (productId: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('novastore_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const refreshCart = useCallback(async () => {
    if (!user) {
      // Load from localStorage for guest
      try {
        const saved = localStorage.getItem('novastore_guest_cart');
        if (saved) {
          setItems(JSON.parse(saved));
        } else {
          setItems([]);
        }
      } catch (e) {
        setItems([]);
      }
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/cart', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch cart from server:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, getHeaders]);

  // Sync guest cart to server on login
  useEffect(() => {
    const syncGuestCart = async () => {
      if (user) {
        const guestSaved = localStorage.getItem('novastore_guest_cart');
        if (guestSaved) {
          try {
            const guestItems: CartItem[] = JSON.parse(guestSaved);
            for (const item of guestItems) {
              await fetch('/api/cart', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ productId: item.productId, quantity: item.quantity }),
              });
            }
            localStorage.removeItem('novastore_guest_cart');
          } catch (e) {
            console.error('Error syncing guest cart:', e);
          }
        }
        await refreshCart();
      } else {
        refreshCart();
      }
    };
    syncGuestCart();
  }, [user, getHeaders, refreshCart]);

  const addToCart = async (product: Product, quantity = 1) => {
    const numPrice = typeof product.price === 'string' ? parseFloat(product.price) : product.price;

    if (!user) {
      // Guest cart in localStorage
      setItems((prev) => {
        const existingIndex = prev.findIndex((i) => i.productId === product.id);
        let updated: CartItem[];
        if (existingIndex > -1) {
          const currentQty = prev[existingIndex].quantity;
          const newQty = Math.min(product.stock, currentQty + quantity);
          updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: newQty,
            subtotal: Math.round(newQty * numPrice * 100) / 100,
          };
        } else {
          const initQty = Math.min(product.stock, quantity);
          updated = [
            ...prev,
            {
              productId: product.id,
              name: product.name,
              description: product.description,
              price: numPrice,
              stock: product.stock,
              imageUrl: product.image_url,
              category: product.category,
              quantity: initQty,
              subtotal: Math.round(initQty * numPrice * 100) / 100,
            },
          ];
        }
        localStorage.setItem('novastore_guest_cart', JSON.stringify(updated));
        return updated;
      });
      return;
    }

    // Authenticated user cart API call
    const res = await fetch('/api/cart', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ productId: product.id, quantity }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to add item to cart');
    }

    await refreshCart();
  };

  const updateQuantity = async (productId: number, quantity: number) => {
    if (!user) {
      setItems((prev) => {
        let updated: CartItem[];
        if (quantity <= 0) {
          updated = prev.filter((i) => i.productId !== productId);
        } else {
          updated = prev.map((item) => {
            if (item.productId === productId) {
              const clamped = Math.min(item.stock, quantity);
              return {
                ...item,
                quantity: clamped,
                subtotal: Math.round(clamped * item.price * 100) / 100,
              };
            }
            return item;
          });
        }
        localStorage.setItem('novastore_guest_cart', JSON.stringify(updated));
        return updated;
      });
      return;
    }

    const res = await fetch(`/api/cart/${productId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ quantity }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update quantity');
    }

    await refreshCart();
  };

  const removeFromCart = async (productId: number) => {
    if (!user) {
      setItems((prev) => {
        const updated = prev.filter((i) => i.productId !== productId);
        localStorage.setItem('novastore_guest_cart', JSON.stringify(updated));
        return updated;
      });
      return;
    }

    const res = await fetch(`/api/cart/${productId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to remove item');
    }

    await refreshCart();
  };

  const clearCart = async () => {
    if (!user) {
      setItems([]);
      localStorage.removeItem('novastore_guest_cart');
      return;
    }

    await fetch('/api/cart', {
      method: 'DELETE',
      headers: getHeaders(),
    });
    setItems([]);
  };

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        total,
        isLoading,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
