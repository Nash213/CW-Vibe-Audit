import React, { useState } from 'react';
import { X, ShoppingBag, Check, ShieldCheck, AlertTriangle, Truck, RefreshCw, Sparkles, Plus, Minus } from 'lucide-react';
import { Product } from '../types.js';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onEdit?: (product: Product) => void;
}

export function ProductDetailModal({ product, onClose, onEdit }: ProductDetailModalProps) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  if (!product) return null;

  const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;

  const handleAdd = async () => {
    if (isOutOfStock || adding) return;

    try {
      setAdding(true);
      await addToCart(product, quantity);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 shadow-md backdrop-blur-md transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Product Image */}
          <div className="relative aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-6 text-slate-400">
                <Sparkles className="w-12 h-12 mx-auto text-indigo-300 mb-2" />
                <span className="font-semibold text-sm">{product.category}</span>
              </div>
            )}
            <span className="absolute top-4 left-4 px-3 py-1 text-xs font-bold uppercase tracking-wider bg-white/90 backdrop-blur-md rounded-full text-slate-800 shadow-xs">
              {product.category || 'General'}
            </span>
          </div>

          {/* Product Info & Action */}
          <div className="p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {isOutOfStock ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-rose-100 text-rose-700 rounded-full">
                    Out of Stock
                  </span>
                ) : isLowStock ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low Stock: {product.stock} units left
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full">
                    In Stock ({product.stock} units)
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-snug">
                {product.name}
              </h2>

              <p className="mt-3 text-2xl font-black text-indigo-600">
                ${price.toFixed(2)}
              </p>

              <div className="mt-4 prose prose-sm text-slate-600 leading-relaxed max-h-40 overflow-y-auto pr-1">
                <p>{product.description}</p>
              </div>

              {/* Perks */}
              <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-500" />
                  <span>Free Demo Shipping</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-500" />
                  <span>30-Day Guarantee</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 pt-4 border-t border-slate-100">
              {!isOutOfStock && (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Quantity
                  </span>
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      className="p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 text-sm font-bold text-slate-800">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                      disabled={quantity >= product.stock}
                      className="p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAdd}
                  disabled={isOutOfStock || adding}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-bold text-sm shadow-md transition-all cursor-pointer ${
                    isOutOfStock
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                      : justAdded
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200 hover:-translate-y-0.5'
                  }`}
                >
                  {justAdded ? (
                    <>
                      <Check className="w-5 h-5" />
                      <span>Added {quantity} to Cart!</span>
                    </>
                  ) : isOutOfStock ? (
                    <span>Currently Out of Stock</span>
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5" />
                      <span>{adding ? 'Adding...' : `Add to Cart • $${(price * quantity).toFixed(2)}`}</span>
                    </>
                  )}
                </button>

                {user?.role === 'admin' && onEdit && (
                  <button
                    onClick={() => {
                      onClose();
                      onEdit(product);
                    }}
                    className="p-3 rounded-2xl border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                    title="Edit Product Details"
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
