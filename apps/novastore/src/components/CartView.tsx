import React, { useState } from 'react';
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, ShieldCheck, CheckCircle2, ArrowLeft, AlertCircle } from 'lucide-react';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';

interface CartViewProps {
  onContinueShopping: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOrderSuccess: (orderId: number) => void;
}

export function CartView({ onContinueShopping, onOpenAuth, onOrderSuccess }: CartViewProps) {
  const { items, total, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const [shippingAddress, setShippingAddress] = useState('742 Evergreen Terrace, Springfield');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const getHeaders = () => {
    const token = localStorage.getItem('novastore_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);

    if (!user) {
      onOpenAuth('login');
      return;
    }

    if (items.length === 0) return;

    try {
      setIsPlacingOrder(true);
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ shippingAddress }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order');
      }

      await clearCart();
      onOrderSuccess(data.orderId);
    } catch (err: any) {
      console.error('Error placing order:', err);
      setOrderError(err.message || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Your Cart is Empty</h2>
        <p className="mt-2 text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
          Looks like you haven't added anything to your cart yet. Explore our collection of premium tech and lifestyle gear.
        </p>
        <button
          onClick={onContinueShopping}
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-100 transition-all cursor-pointer hover:-translate-y-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Browse Products</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Shopping Cart</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review your selected items and complete your order. Stock is reserved upon order placement.
          </p>
        </div>
        <button
          onClick={onContinueShopping}
          className="hidden sm:flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Continue Shopping</span>
        </button>
      </div>

      {orderError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          <div>
            <p className="font-bold">Order Placement Failed</p>
            <p className="mt-0.5">{orderError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Cart Items List */}
        <div className="lg:col-span-8 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                      {item.category || 'Product'}
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                    {item.category || 'Item'}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-1">
                    {item.name}
                  </h3>
                  <p className="text-sm font-semibold text-slate-500 mt-0.5">
                    ${item.price.toFixed(2)} each
                  </p>
                  {item.stock < item.quantity && (
                    <span className="text-xs font-bold text-rose-600 block mt-1">
                      Only {item.stock} in stock! Please reduce quantity.
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity Controls & Subtotal */}
              <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-l-xl transition-colors cursor-pointer"
                    title="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="px-3 text-sm font-bold text-slate-800">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    disabled={item.quantity >= item.stock}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-r-xl transition-colors disabled:opacity-30 cursor-pointer"
                    title="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-right min-w-[80px]">
                  <span className="text-xs text-slate-400 block font-medium">Subtotal</span>
                  <span className="text-base font-black text-slate-900">
                    ${item.subtotal.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="Remove from cart"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => clearCart()}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              Clear entire cart
            </button>
          </div>
        </div>

        {/* Order Summary Checkout Card */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-black text-slate-900 tracking-tight pb-4 border-b border-slate-100">
              Order Summary
            </h2>

            <div className="space-y-3 py-4 text-sm text-slate-600 border-b border-slate-100">
              <div className="flex justify-between">
                <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span className="font-semibold text-slate-900">${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Shipping</span>
                <span className="font-semibold">Free Delivery</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Estimated Taxes</span>
                <span>$0.00 (Included)</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-4 text-slate-900">
              <span className="text-base font-bold">Total Amount</span>
              <span className="text-2xl font-black text-indigo-600">${total.toFixed(2)}</span>
            </div>

            {/* Delivery address input */}
            <form onSubmit={handlePlaceOrder} className="mt-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Shipping Destination
                </label>
                <input
                  type="text"
                  required
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Street address, city, postal code"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {!user && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <p className="font-bold">Log in required to checkout</p>
                  <p className="mt-0.5">Please sign in or create an account to place this order.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPlacingOrder}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-100 transition-all cursor-pointer hover:-translate-y-0.5 disabled:opacity-50"
              >
                {isPlacingOrder ? (
                  <span>Processing Order...</span>
                ) : !user ? (
                  <>
                    <span>Log In to Place Order</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>Place Order (${total.toFixed(2)})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Demo store: no real payment required
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
