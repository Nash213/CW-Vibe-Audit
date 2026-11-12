import React, { useState, useEffect } from 'react';
import { Package, Calendar, MapPin, ChevronRight, ChevronDown, CheckCircle2, Clock, ArrowLeft, ShoppingBag } from 'lucide-react';
import { Order } from '../types.js';
import { useAuth } from '../context/AuthContext.js';

interface OrdersViewProps {
  onContinueShopping: () => void;
  highlightOrderId?: number | null;
}

export function OrdersView({ onContinueShopping, highlightOrderId }: OrdersViewProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(highlightOrderId || null);
  const [orderDetails, setOrderDetails] = useState<Record<number, Order>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);
  const [viewAll, setViewAll] = useState(false);

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

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const url = user?.role === 'admin' && viewAll ? '/api/orders?all=true' : '/api/orders';
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);

        // If highlightOrderId is set, automatically fetch its details
        if (highlightOrderId) {
          fetchOrderDetail(highlightOrderId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user, viewAll]);

  const fetchOrderDetail = async (orderId: number) => {
    if (orderDetails[orderId]) return;

    try {
      setLoadingDetail(orderId);
      const res = await fetch(`/api/orders/${orderId}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOrderDetails((prev) => ({ ...prev, [orderId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch order detail:', err);
    } finally {
      setLoadingDetail(null);
    }
  };

  const toggleExpand = (orderId: number) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(orderId);
      fetchOrderDetail(orderId);
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Please Log In to View Orders</h2>
        <p className="mt-2 text-slate-500 text-sm">
          Your orders and receipts are safely tied to your customer account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Order History</h1>
            {user.role === 'admin' && (
              <span className="text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                Admin View
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track and view receipt details for past purchases.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user.role === 'admin' && (
            <button
              onClick={() => setViewAll(!viewAll)}
              className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                viewAll
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {viewAll ? 'Viewing All Customer Orders' : 'View All Orders (Admin)'}
            </button>
          )}

          <button
            onClick={onContinueShopping}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Storefront</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 bg-slate-100 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">No Orders Found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {viewAll
              ? 'No customer has placed any orders yet.'
              : "You haven't placed any orders yet. Discover our latest items and try placing a demo order!"}
          </p>
          <button
            onClick={onContinueShopping}
            className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm cursor-pointer"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const detail = orderDetails[order.id];

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                  order.id === highlightOrderId
                    ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md'
                    : 'border-slate-200 shadow-xs hover:border-slate-300'
                }`}
              >
                {/* Order Summary Header Card */}
                <div
                  onClick={() => toggleExpand(order.id)}
                  className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-base">
                          Order #{order.id}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          {order.status.toUpperCase()}
                        </span>
                        {viewAll && order.customerName && (
                          <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                            Customer: {order.customerName} ({order.customerEmail})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(order.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>•</span>
                        <span>{order.itemCount} item(s)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-medium">Total Paid</span>
                      <span className="text-lg font-black text-slate-900">
                        ${order.totalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-2 text-slate-400 hover:text-indigo-600">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Order Items Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-6">
                    {loadingDetail === order.id ? (
                      <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
                        Loading receipt items...
                      </div>
                    ) : detail ? (
                      <div className="space-y-6">
                        {/* Delivery address info */}
                        <div className="flex items-start gap-2 text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200">
                          <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800">Shipping Address: </span>
                            <span>{detail.shippingAddress}</span>
                          </div>
                        </div>

                        {/* Items Table */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600 flex justify-between">
                            <span>Purchased Item</span>
                            <div className="flex gap-8">
                              <span className="w-16 text-center">Unit Price</span>
                              <span className="w-12 text-center">Qty</span>
                              <span className="w-16 text-right">Subtotal</span>
                            </div>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {detail.items?.map((item) => (
                              <div
                                key={item.id}
                                className="px-4 py-3 flex items-center justify-between text-sm gap-4"
                              >
                                <div className="flex items-center gap-3">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.productName}
                                      className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-500 shrink-0">
                                      Item
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-bold text-slate-900 leading-tight">
                                      {item.productName}
                                    </p>
                                    <span className="text-[10px] text-slate-400">
                                      ID: {item.productId}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-8 shrink-0">
                                  <span className="w-16 text-center text-slate-600 text-xs">
                                    ${item.unitPrice.toFixed(2)}
                                  </span>
                                  <span className="w-12 text-center font-bold text-slate-800">
                                    × {item.quantity}
                                  </span>
                                  <span className="w-16 text-right font-black text-slate-900">
                                    ${item.subtotal.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end pt-2 text-right">
                          <div>
                            <span className="text-xs text-slate-400 block">Total Billed</span>
                            <span className="text-xl font-black text-indigo-600">
                              ${detail.totalAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
