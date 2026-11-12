import React, { useState } from 'react';
import { ShoppingBag, Check, Edit, AlertTriangle } from 'lucide-react';
import { Product } from '../types.js';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onEdit?: (product: Product) => void;
}

export function ProductCard({ product, onSelect, onEdit }: ProductCardProps) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock || adding) return;

    try {
      setAdding(true);
      await addToCart(product, 1);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    } catch (err: any) {
      alert(err.message || 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      onClick={() => onSelect(product)}
      className="group flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-indigo-200 transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Product Image */}
      <div className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-slate-100 to-indigo-50 text-slate-400">
            <span className="font-semibold text-sm">{product.category || 'Product'}</span>
          </div>
        )}

        {/* Category Pill */}
        <span className="absolute top-3 left-3 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur-md rounded-full text-slate-800 shadow-xs">
          {product.category || 'General'}
        </span>

        {/* Stock Badge */}
        <div className="absolute top-3 right-3">
          {isOutOfStock ? (
            <span className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 text-white rounded-full shadow-xs">
              Out of Stock
            </span>
          ) : isLowStock ? (
            <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-500 text-white rounded-full shadow-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Only {product.stock} left
            </span>
          ) : (
            <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600/90 backdrop-blur-sm text-white rounded-full shadow-xs">
              {product.stock} in stock
            </span>
          )}
        </div>

        {/* Quick Admin Edit Overlay */}
        {user?.role === 'admin' && onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(product);
            }}
            className="absolute bottom-3 right-3 p-2 rounded-xl bg-white/90 backdrop-blur-md text-slate-700 hover:text-indigo-600 hover:bg-white shadow-md transition-colors cursor-pointer"
            title="Edit product"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Product Details */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 text-base">
            {product.name}
          </h3>
          <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Price</span>
            <span className="text-lg font-black text-slate-900 tracking-tight">
              ${price.toFixed(2)}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock || adding}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added</span>
              </>
            ) : isOutOfStock ? (
              <span>Unavailable</span>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{adding ? 'Adding...' : 'Add to Cart'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
