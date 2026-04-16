import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, History, Landmark, X, Calculator, Loader2, CheckCircle2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function POSSeller() {
  const { store } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'products' | 'pending'>('products');
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);
  
  // Change Calculator State
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [isDirectCheckout, setIsDirectCheckout] = useState(false);

  useEffect(() => {
    if (!store) return;
    const unsubProducts = onSnapshot(collection(db, `stores/${store.id}/products`), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCategories = onSnapshot(collection(db, `stores/${store.id}/categories`), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubSales = onSnapshot(collection(db, `stores/${store.id}/sales`), (snapshot) => {
      setPendingSales(snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((s: any) => s.status === 'pending')
        .sort((a: any, b: any) => b.timestamp?.seconds - a.timestamp?.seconds)
      );
    });
    return () => {
      unsubProducts();
      unsubCategories();
      unsubSales();
    };
  }, [store]);

  const [longPressTimer, setLongPressTimer] = useState<any>(null);

  const startLongPress = (product: any) => {
    const timer = setTimeout(() => {
      addToCart(product, true);
      setLongPressTimer(null);
    }, 600);
    setLongPressTimer(timer);
  };

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const categoryOptions = ['전체', ...categories.map(c => c.name)];

  const getEffectiveStock = (product: any) => {
    if (!product.isSet || !product.components || product.components.length === 0) {
      return product.stock;
    }
    const stocks = product.components.map((comp: any) => {
      const p = products.find(prod => prod.id === comp.id);
      if (!p) return 0;
      return Math.floor(p.stock / comp.quantity);
    });
    return Math.min(...stocks);
  };

  const addToCart = (product: any, isService: boolean = false) => {
    const effectiveStock = getEffectiveStock(product);
    if (effectiveStock <= 0) return;
    setCart(prev => {
      const cartItemId = isService ? `${product.id}-service` : product.id;
      const existing = prev.find(item => item.cartItemId === cartItemId);
      
      // Calculate total quantity of this product already in cart (regular + service)
      const totalInCart = prev
        .filter(item => item.id === product.id)
        .reduce((acc, item) => acc + item.quantity, 0);

      if (totalInCart >= effectiveStock) {
        alert('재고가 부족합니다.');
        return prev;
      }

      if (existing) {
        return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { 
        ...product, 
        cartItemId, 
        isService, 
        price: isService ? 0 : product.price,
        quantity: 1 
      }];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    const itemInCart = cart.find(i => i.cartItemId === cartItemId);
    if (!itemInCart) return;

    const product = products.find(p => p.id === itemInCart.id);
    if (!product) return;

    const effectiveStock = getEffectiveStock(product);

    setCart(prev => {
      const newQty = itemInCart.quantity + delta;
      if (newQty < 1) return prev;

      // Check total stock for this product across all cart items
      const otherItemsQty = prev
        .filter(item => item.id === product.id && item.cartItemId !== cartItemId)
        .reduce((acc, item) => acc + item.quantity, 0);

      if (otherItemsQty + newQty > effectiveStock) {
        alert('재고가 부족합니다.');
        return prev;
      }

      return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item);
    });
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const discountTotal = cart.reduce((acc, item) => {
    if (item.isService) {
      const originalProduct = products.find(p => p.id === item.id);
      return acc + ((originalProduct?.price || 0) * item.quantity);
    }
    return acc;
  }, 0);

  const handleCheckout = async (method: 'cash' | 'card' | 'transfer') => {
    if (!store || cart.length === 0 || isProcessing) return;
    
    if (method === 'cash') {
      setSelectedSale({
        id: 'DIRECT',
        items: cart,
        totalAmount: total,
        discountAmount: discountTotal,
        paymentMethod: 'cash'
      });
      setIsDirectCheckout(true);
      setReceivedAmount('');
      setIsCalculatorOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      // Final Stock Check
      const stockCheckMap: Record<string, number> = {};
      for (const item of cart) {
        if (item.isSet && item.components) {
          item.components.forEach((comp: any) => {
            stockCheckMap[comp.id] = (stockCheckMap[comp.id] || 0) + (comp.quantity * item.quantity);
          });
        } else {
          stockCheckMap[item.id] = (stockCheckMap[item.id] || 0) + item.quantity;
        }
      }
      
      for (const [productId, totalQty] of Object.entries(stockCheckMap)) {
        const p = products.find(prod => prod.id === productId);
        if (p && p.stock < totalQty) {
          alert(`${p.name}의 재고가 부족합니다. (현재 재고: ${p.stock})`);
          setIsProcessing(false);
          return;
        }
      }

        // 1. Record Sale
        await addDoc(collection(db, `stores/${store.id}/sales`), {
          storeId: store.id,
          items: cart.map(item => ({ 
            id: item.id, 
            name: item.isService ? `[서비스] ${item.name}` : item.name, 
            price: item.price, 
            quantity: item.quantity,
            isService: item.isService 
          })),
          totalAmount: total,
          discountAmount: discountTotal,
          paymentMethod: method,
          status: 'completed',
          timestamp: serverTimestamp(),
          type: 'seller'
        });

      // 2. Update Inventory
      for (const item of cart) {
        if (item.isSet && item.components) {
          for (const comp of item.components) {
            await updateDoc(doc(db, `stores/${store.id}/products`, comp.id), {
              stock: increment(-(comp.quantity * item.quantity))
            });
          }
        } else {
          await updateDoc(doc(db, `stores/${store.id}/products`, item.id), {
            stock: increment(-item.quantity)
          });
        }
      }

      setCart([]);
    } catch (error) {
      console.error('Checkout failed', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompletePending = async () => {
    if (!store || !selectedSale || isProcessing) return;
    
    const received = Number(receivedAmount);
    if (selectedSale.paymentMethod === 'cash' && received < selectedSale.totalAmount) {
      alert('받은 금액이 부족합니다.');
      return;
    }

    setIsProcessing(true);
    try {
      if (isDirectCheckout) {
        // Final Stock Check
        const stockCheckMap: Record<string, number> = {};
        for (const item of cart) {
          if (item.isSet && item.components) {
            item.components.forEach((comp: any) => {
              stockCheckMap[comp.id] = (stockCheckMap[comp.id] || 0) + (comp.quantity * item.quantity);
            });
          } else {
            stockCheckMap[item.id] = (stockCheckMap[item.id] || 0) + item.quantity;
          }
        }
        
        for (const [productId, totalQty] of Object.entries(stockCheckMap)) {
          const p = products.find(prod => prod.id === productId);
          if (p && p.stock < totalQty) {
            alert(`${p.name}의 재고가 부족합니다. (현재 재고: ${p.stock})`);
            setIsProcessing(false);
            return;
          }
        }

        // Direct POS Checkout
        await addDoc(collection(db, `stores/${store.id}/sales`), {
          storeId: store.id,
          items: cart.map(item => ({ 
            id: item.id, 
            name: item.isService ? `[서비스] ${item.name}` : item.name, 
            price: item.price, 
            quantity: item.quantity,
            isService: item.isService 
          })),
          totalAmount: total,
          discountAmount: discountTotal,
          paymentMethod: 'cash',
          status: 'completed',
          receivedAmount: received,
          changeAmount: received - total,
          timestamp: serverTimestamp(),
          type: 'seller'
        });

        for (const item of cart) {
          if (item.isSet && item.components) {
            for (const comp of item.components) {
              await updateDoc(doc(db, `stores/${store.id}/products`, comp.id), {
                stock: increment(-(comp.quantity * item.quantity))
              });
            }
          } else {
            await updateDoc(doc(db, `stores/${store.id}/products`, item.id), {
              stock: increment(-item.quantity)
            });
          }
        }
        setCart([]);
        setIsDirectCheckout(false);
      } else {
        // Final Stock Check for Kiosk Sale
        const stockCheckMap: Record<string, number> = {};
        for (const item of selectedSale.items) {
          if (item.isSet && item.components) {
            item.components.forEach((comp: any) => {
              stockCheckMap[comp.id] = (stockCheckMap[comp.id] || 0) + (comp.quantity * item.quantity);
            });
          } else {
            stockCheckMap[item.id] = (stockCheckMap[item.id] || 0) + item.quantity;
          }
        }

        for (const [productId, totalQty] of Object.entries(stockCheckMap)) {
          const p = products.find(prod => prod.id === productId);
          if (p && p.stock < totalQty) {
            alert(`${p.name}의 재고가 부족합니다. (현재 재고: ${p.stock})\n주문을 거절하거나 재고를 확인해주세요.`);
            setIsProcessing(false);
            return;
          }
        }

        // Pending Kiosk Sale
        await updateDoc(doc(db, `stores/${store.id}/sales`, selectedSale.id), {
          status: 'completed',
          receivedAmount: selectedSale.paymentMethod === 'cash' ? received : selectedSale.totalAmount,
          changeAmount: selectedSale.paymentMethod === 'cash' ? (received - selectedSale.totalAmount) : 0,
          completedAt: serverTimestamp()
        });

        for (const item of selectedSale.items) {
          if (item.isSet && item.components) {
            for (const comp of item.components) {
              await updateDoc(doc(db, `stores/${store.id}/products`, comp.id), {
                stock: increment(-(comp.quantity * item.quantity))
              });
            }
          } else {
            await updateDoc(doc(db, `stores/${store.id}/products`, item.id), {
              stock: increment(-item.quantity)
            });
          }
        }
      }

      setIsCalculatorOpen(false);
      setSelectedSale(null);
      setReceivedAmount('');
    } catch (error) {
      console.error('Complete checkout failed', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectPending = async (saleId: string) => {
    if (!store || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, `stores/${store.id}/sales`, saleId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      });
      if (isCalculatorOpen) {
        setIsCalculatorOpen(false);
        setSelectedSale(null);
      }
    } catch (error) {
      console.error('Reject pending failed', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const openCalculator = (sale: any) => {
    setSelectedSale(sale);
    setReceivedAmount('');
    setIsDirectCheckout(false);
    setIsCalculatorOpen(true);
  };

  const filteredProducts = products.filter(p => 
    (category === '전체' || (p.category || '전체') === category) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* Left: Product Selection or Pending List */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-4 bg-white p-1 rounded-xl border border-slate-200 w-fit">
          <button 
            onClick={() => setActiveTab('products')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'products' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            상품 선택
          </button>
          <button 
            onClick={() => setActiveTab('pending')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'pending' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            결제 대기
            {pendingSales.length > 0 && (
              <span className={cn(
                "w-5 h-5 rounded-full text-[10px] flex items-center justify-center",
                activeTab === 'pending' ? "bg-white text-indigo-600" : "bg-red-500 text-white"
              )}>
                {pendingSales.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setIsComingSoonOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
          >
            선입금
          </button>
        </div>

        {activeTab === 'products' ? (
          <>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="상품 검색..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    onMouseDown={() => startLongPress(product)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(product)}
                    onTouchEnd={cancelLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      addToCart(product, true);
                    }}
                    disabled={getEffectiveStock(product) <= 0}
                    className={cn(
                      "flex flex-col text-left bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all group relative overflow-hidden active:scale-95",
                      getEffectiveStock(product) <= 0 && "opacity-60 grayscale cursor-not-allowed"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{product.category || '전체'}</span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        getEffectiveStock(product) <= (store?.lowStockThreshold || 5) ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                      )}>
                        재고: {getEffectiveStock(product)}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1 line-clamp-2">{product.name}</h4>
                    <p className="text-indigo-600 font-display font-bold mt-auto">{formatCurrency(product.price)}</p>
                    
                    {getEffectiveStock(product) <= 0 && (
                      <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-full">품절</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {pendingSales.map(sale => (
              <div key={sale.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-500 transition-all">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    sale.paymentMethod === 'cash' ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {sale.paymentMethod === 'cash' ? <Banknote className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Order #{sale.id.slice(-4).toUpperCase()}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className="text-xs text-slate-500">{sale.timestamp?.toDate().toLocaleTimeString()}</span>
                    </div>
                    <h4 className="font-bold text-slate-900">
                      {sale.items[0].name} {sale.items.length > 1 ? `외 ${sale.items.length - 1}건` : ''}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">결제 금액</p>
                    <p className="text-xl font-display font-black text-indigo-600">{formatCurrency(sale.totalAmount)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleRejectPending(sale.id)}
                      className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="주문 거절"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={() => openCalculator(sale)}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                    >
                      <Calculator className="w-5 h-5" />
                      결제 승인
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {pendingSales.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                <History className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm italic">대기 중인 결제가 없습니다.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Cart & Checkout */}
      <div className="w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold">주문 내역</h3>
          </div>
          <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full">
            {cart.reduce((acc, i) => acc + i.quantity, 0)}개
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence initial={false}>
            {cart.map(item => (
              <motion.div 
                key={item.cartItemId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center justify-between group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.isService && (
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1 rounded">서비스</span>
                    )}
                    <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                  </div>
                  <p className="text-xs text-slate-500">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-100 rounded-lg p-1">
                    <button onClick={() => updateQuantity(item.cartItemId, -1)} className="p-1 hover:bg-white rounded transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.cartItemId, 1)} className="p-1 hover:bg-white rounded transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button onClick={() => removeFromCart(item.cartItemId)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm italic">장바구니가 비어있습니다.</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">총 결제 금액</span>
            <span className="text-2xl font-display font-bold text-indigo-600">{formatCurrency(total)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              disabled={cart.length === 0 || isProcessing}
              onClick={() => handleCheckout('cash')}
              className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 p-4 rounded-xl hover:border-indigo-500 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <Banknote className="w-6 h-6" />
              <span className="text-xs font-bold">현금 결제</span>
            </button>
            <button 
              disabled={cart.length === 0 || isProcessing}
              onClick={() => handleCheckout('transfer')}
              className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 p-4 rounded-xl hover:border-indigo-500 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <Landmark className="w-6 h-6" />
              <span className="text-xs font-bold">계좌 이체</span>
            </button>
          </div>
        </div>
      </div>

      {/* Change Calculator Modal */}
      {isCalculatorOpen && selectedSale && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {isDirectCheckout ? '현금 결제 거스름돈' : '결제 승인 및 거스름돈'}
                </h2>
                <p className="text-slate-500">
                  {isDirectCheckout ? '직접 판매 주문' : `주문 번호: #${selectedSale.id.slice(-4).toUpperCase()}`}
                </p>
              </div>
              <button onClick={() => setIsCalculatorOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Order Items Summary */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2 bg-slate-100/50 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">주문 상품 내역</span>
                  <span className="text-[10px] font-bold text-slate-500">{selectedSale.items.reduce((acc: number, i: any) => acc + i.quantity, 0)}개</span>
                </div>
                <div className="p-4 max-h-32 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {selectedSale.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        {item.isService && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1 rounded">서비스</span>}
                        <span className="font-medium text-slate-700">{item.name}</span>
                      </div>
                      <span className="font-bold text-slate-900">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">결제 금액</p>
                  <p className="text-2xl font-display font-black text-slate-900">{formatCurrency(selectedSale.totalAmount)}</p>
                </div>
                {selectedSale.paymentMethod === 'cash' && (
                  <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">거스름돈</p>
                    <p className="text-2xl font-display font-black text-indigo-600">
                      {Number(receivedAmount) > selectedSale.totalAmount 
                        ? formatCurrency(Number(receivedAmount) - selectedSale.totalAmount)
                        : formatCurrency(0)}
                    </p>
                  </div>
                )}
                {selectedSale.paymentMethod === 'transfer' && (
                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">결제 수단</p>
                    <p className="text-2xl font-bold text-blue-600">계좌 이체</p>
                  </div>
                )}
              </div>

              {selectedSale.paymentMethod === 'cash' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">받은 금액 입력</label>
                    <div className="relative">
                      <input 
                        type="number"
                        autoFocus
                        value={receivedAmount}
                        onChange={(e) => setReceivedAmount(e.target.value)}
                        placeholder="금액을 입력하세요"
                        className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-display font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">원</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[1000, 5000, 10000, 50000].map(val => (
                      <button 
                        key={val}
                        onClick={() => setReceivedAmount(String((Number(receivedAmount) || 0) + val))}
                        className="py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all active:scale-95"
                      >
                        +{val/1000}천
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedSale.paymentMethod === 'transfer' && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <p className="text-slate-600 font-medium">
                    손님이 <span className="font-bold text-indigo-600">{store?.bankName}</span> 계좌로<br/>
                    <span className="text-xl font-black">{formatCurrency(selectedSale.totalAmount)}</span> 입금을 완료했는지 확인해주세요.
                  </p>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => {
                    if (isDirectCheckout) {
                      setIsCalculatorOpen(false);
                      setSelectedSale(null);
                    } else {
                      handleRejectPending(selectedSale.id);
                    }
                  }}
                  className="flex-1 px-6 py-5 bg-slate-100 text-slate-500 rounded-2xl font-bold text-lg hover:bg-red-50 hover:text-red-600 transition-all"
                >
                  {isDirectCheckout ? '취소' : '주문 거절'}
                </button>
                <button 
                  disabled={isProcessing || (selectedSale.paymentMethod === 'cash' && Number(receivedAmount) < selectedSale.totalAmount)}
                  onClick={handleCompletePending}
                  className="flex-[2] bg-indigo-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                  {selectedSale.paymentMethod === 'cash' ? '결제 완료' : '입금 확인 및 승인'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Coming Soon Modal */}
      {isComingSoonOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
                <Loader2 className="w-10 h-10 animate-spin" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">준비 중인 기능입니다</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  선입금 관리 기능은 현재 개발 중입니다.<br/>
                  조금만 더 기다려주세요!
                </p>
              </div>
              <button 
                onClick={() => setIsComingSoonOpen(false)}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
