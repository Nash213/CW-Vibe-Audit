import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Filter, CheckCircle2, ArrowRight, Shield, Layers, Package, ShoppingBag } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { CartProvider, useCart } from './context/CartContext.js';
import { Navbar } from './components/Navbar.js';
import { ProductCard } from './components/ProductCard.js';
import { ProductDetailModal } from './components/ProductDetailModal.js';
import { CartView } from './components/CartView.js';
import { OrdersView } from './components/OrdersView.js';
import { AdminView } from './components/AdminView.js';
import { AuthModal } from './components/AuthModal.js';
import { FirstAdminModal } from './components/FirstAdminModal.js';
import { Product } from './types.js';

function StoreApp() {
  const { user, hasAdmin, refreshAuthStatus } = useAuth();
  const { itemCount } = useCart();

  // Navigation state
  const [currentView, setCurrentView] = useState<'products' | 'cart' | 'orders' | 'admin'>('products');

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [firstAdminModalOpen, setFirstAdminModalOpen] = useState(false);

  // Order success state
  const [justPlacedOrderId, setJustPlacedOrderId] = useState<number | null>(null);

  // Products catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('featured');
  const [onlyInStock, setOnlyInStock] = useState(false);

  const fetchProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (sortBy) params.set('sort', sortBy);

      const res = await fetch(`/api/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, sortBy]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleOrderSuccess = (orderId: number) => {
    setJustPlacedOrderId(orderId);
    setCurrentView('orders');
    // Refresh products to get updated stock counts
    fetchProducts();
  };

  const handleAdminEdit = (product: Product) => {
    setEditingProduct(product);
    setCurrentView('admin');
  };

  // Filter products by in-stock toggle
  const displayedProducts = onlyInStock ? products.filter((p) => p.stock > 0) : products;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-indigo-100 selection:text-indigo-900">
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        onOpenAuth={handleOpenAuth}
        onOpenFirstAdmin={() => setFirstAdminModalOpen(true)}
        hasAdmin={hasAdmin}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Order success notification toast */}
        {justPlacedOrderId && (
          <div className="max-w-4xl mx-auto px-4 mt-6">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-sm">
                    Success! Order #{justPlacedOrderId} placed.
                  </p>
                  <p className="text-xs text-emerald-700">
                    Product stock counts have been automatically updated in PostgreSQL.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setJustPlacedOrderId(null)}
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-2 py-1 rounded-md"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* View Router */}
        {currentView === 'products' && (
          <div>
            {/* Hero Section */}
            <div className="relative bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-900 text-white overflow-hidden py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="relative max-w-5xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Real-time PostgreSQL Inventory</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
                  Premium Gear for the <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
                    Modern Workspace
                  </span>
                </h1>

                <p className="mt-4 text-slate-300 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
                  Browse authentic tech essentials, verify live stock availability, and place demo orders instantly.
                </p>

                {/* Quick Stats Banner */}
                <div className="mt-8 grid grid-cols-3 max-w-lg mx-auto gap-4 pt-6 border-t border-slate-800/80 text-center">
                  <div>
                    <span className="block text-xl font-black text-white">{products.length}</span>
                    <span className="text-xs text-slate-400">Available Products</span>
                  </div>
                  <div>
                    <span className="block text-xl font-black text-indigo-400">
                      {products.reduce((acc, p) => acc + p.stock, 0)}
                    </span>
                    <span className="text-xs text-slate-400">Units in Stock</span>
                  </div>
                  <div>
                    <span className="block text-xl font-black text-emerald-400">PostgreSQL</span>
                    <span className="text-xs text-slate-400">ACID Transactions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Catalog Controls */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by product name or description..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Sort & In-stock Filter */}
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-3 py-2 rounded-xl border border-slate-200 cursor-pointer shadow-xs">
                    <input
                      type="checkbox"
                      checked={onlyInStock}
                      onChange={(e) => setOnlyInStock(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span>In-Stock Only</span>
                  </label>

                  <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs text-xs font-semibold text-slate-700">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="bg-transparent focus:outline-none text-indigo-600 font-bold cursor-pointer"
                    >
                      <option value="featured">Featured</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="stock">Highest Stock</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-2 overflow-x-auto py-4 scrollbar-none">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === 'All'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  All Products
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              {isLoadingProducts ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <div key={n} className="h-80 bg-slate-200 rounded-2xl animate-pulse"></div>
                  ))}
                </div>
              ) : displayedProducts.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 mt-6 p-8">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-800">No matching products found</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Try adjusting your filters, searching for a different keyword, or resetting category filters.
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('All');
                      setOnlyInStock(false);
                    }}
                    className="mt-4 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                  {displayedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={(p) => setSelectedProduct(p)}
                      onEdit={user?.role === 'admin' ? handleAdminEdit : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'cart' && (
          <CartView
            onContinueShopping={() => setCurrentView('products')}
            onOpenAuth={handleOpenAuth}
            onOrderSuccess={handleOrderSuccess}
          />
        )}

        {currentView === 'orders' && (
          <OrdersView
            onContinueShopping={() => setCurrentView('products')}
            highlightOrderId={justPlacedOrderId}
          />
        )}

        {currentView === 'admin' && (
          <AdminView
            onBackToShop={() => {
              setCurrentView('products');
              fetchProducts();
            }}
            editingProductFromCard={editingProduct}
            onClearEditingProduct={() => setEditingProduct(null)}
          />
        )}
      </main>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEdit={user?.role === 'admin' ? handleAdminEdit : undefined}
      />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onOpenFirstAdmin={() => {
          setAuthModalOpen(false);
          setFirstAdminModalOpen(true);
        }}
        hasAdmin={hasAdmin}
      />

      {/* First Admin Initialization Wizard Modal */}
      <FirstAdminModal
        isOpen={firstAdminModalOpen}
        onClose={() => setFirstAdminModalOpen(false)}
        onSuccess={() => {
          setFirstAdminModalOpen(false);
          refreshAuthStatus();
          fetchProducts();
          setCurrentView('admin');
        }}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-20 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">NovaStore</span>
            <span>•</span>
            <span>PostgreSQL & Express Full-Stack Application</span>
          </div>

          <div className="flex items-center gap-6">
            <span>Single Web Port (3000)</span>
            <span>•</span>
            <span>Role-Based Access Control</span>
            <span>•</span>
            <span>Docker Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <StoreApp />
      </CartProvider>
    </AuthProvider>
  );
}
