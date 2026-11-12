import React from 'react';
import { ShoppingBag, ShieldCheck, User as UserIcon, LogOut, Package, Sparkles, Store, PlusCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useCart } from '../context/CartContext.js';

interface NavbarProps {
  currentView: 'products' | 'cart' | 'orders' | 'admin';
  setCurrentView: (view: 'products' | 'cart' | 'orders' | 'admin') => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenFirstAdmin: () => void;
  hasAdmin: boolean;
}

export function Navbar({
  currentView,
  setCurrentView,
  onOpenAuth,
  onOpenFirstAdmin,
  hasAdmin,
}: NavbarProps) {
  const { user, logout, seedDemoData } = useAuth();
  const { itemCount } = useCart();
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedDemoData();
      window.location.reload();
    } catch (e: any) {
      alert(e.message || 'Failed to seed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Banner if no admin exists yet */}
      {!hasAdmin && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 text-sm text-center font-medium shadow-inner flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 animate-spin text-amber-100" />
          <span>No administrator account found.</span>
          <button
            onClick={onOpenFirstAdmin}
            className="ml-2 underline font-bold hover:text-amber-100 transition-colors"
          >
            Create the First Admin Account &rarr;
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => setCurrentView('products')}
              className="flex items-center gap-2.5 group text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-md shadow-indigo-100 group-hover:scale-105 transition-transform">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-slate-900 to-indigo-900 bg-clip-text text-transparent">
                  NovaStore
                </span>
                <span className="block text-[10px] font-semibold tracking-wider uppercase text-indigo-600 -mt-1">
                  Postgres Shop
                </span>
              </div>
            </button>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setCurrentView('products')}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  currentView === 'products'
                    ? 'bg-slate-100 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                Products
              </button>

              {user && (
                <button
                  onClick={() => setCurrentView('orders')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    currentView === 'orders'
                      ? 'bg-slate-100 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  My Orders
                </button>
              )}

              {user?.role === 'admin' && (
                <button
                  onClick={() => setCurrentView('admin')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    currentView === 'admin'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Admin Inventory</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-600 text-white ml-0.5">
                    Admin
                  </span>
                </button>
              )}
            </nav>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Seed */}
            <button
              onClick={handleSeed}
              disabled={seeding}
              title="Re-seed demo products & accounts"
              className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{seeding ? 'Seeding...' : 'Reset Demo Data'}</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={() => setCurrentView('cart')}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                currentView === 'cart'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">Cart</span>
              {itemCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-indigo-600 rounded-full shadow-sm animate-pulse">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Auth section */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white cursor-pointer shadow-xs transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center uppercase">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[110px]">
                      {user.name}
                    </p>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1 rounded ${
                        user.role === 'admin'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs text-slate-400">Signed in as</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{user.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        Role: {user.role}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setCurrentView('orders');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Package className="w-4 h-4 text-slate-400" />
                      <span>My Orders</span>
                    </button>

                    {user.role === 'admin' && (
                      <button
                        onClick={() => {
                          setCurrentView('admin');
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-indigo-700 font-medium hover:bg-indigo-50 flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-indigo-600" />
                        <span>Manage Products</span>
                      </button>
                    )}

                    <div className="border-t border-slate-100 my-1"></div>

                    <button
                      onClick={() => {
                        logout();
                        setIsUserMenuOpen(false);
                        setCurrentView('products');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-3 py-2 text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  Log In
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-3.5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-indigo-200"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
