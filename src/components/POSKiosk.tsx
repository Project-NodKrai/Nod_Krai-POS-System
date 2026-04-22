import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { ShoppingCart, ArrowLeft, CheckCircle2, CreditCard, Plus, Minus, Banknote, Landmark, Loader2, QrCode, Shield, Settings, Power } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function POSKiosk({ onExit, storeOverride }: { onExit: () => void, storeOverride?: any }) {
  const { store: authStore } = useAuth();
  const store = storeOverride || authStore;
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [category, setCategory] = useState('전체');
  const [step, setStep] = useState<'menu' | 'checkout' | 'waiting' | 'success'>('menu');
  const [orderNumber, setOrderNumber] = useState('');
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'cash' | 'transfer' | null>(null);
  const [changeAmount, setChangeAmount] = useState(0);

  // Admin PIN State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (isAdminModalOpen && pinInput.length === 4) {
      const targetPin = store?.adminPin || '0000';
      if (pinInput === targetPin) {
        onExit();
      } else {
        setPinError(true);
        setPinInput('');
        setTimeout(() => setPinError(false), 1000);
      }
    }
  }, [pinInput, store?.adminPin, onExit, isAdminModalOpen]);

  useEffect(() => {
    if (!store || !currentSaleId || step !== 'waiting') return;
    
    const unsub = onSnapshot(doc(db, `stores/${store.id}/sales`, currentSaleId), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'completed') {
        setChangeAmount(data.changeAmount || 0);
        setStep('success');
        setCart([]);
        setCurrentSaleId(null);
        setSelectedMethod(null);
        // Auto reset after 10 seconds for kiosk
        setTimeout(() => setStep('menu'), 10000);
      } else if (data.status === 'cancelled') {
        alert('주문이 취소 또는 거절되었습니다.');
        setStep('menu');
        setCurrentSaleId(null);
        setSelectedMethod(null);
        setCart([]);
      }
    });
    
    return unsub;
  }, [store, currentSaleId, step]);

  useEffect(() => {
    if (!store) return;
    const unsubProducts = onSnapshot(collection(db, `stores/${store.id}/products`), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCategories = onSnapshot(collection(db, `stores/${store.id}/categories`), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubProducts();
      unsubCategories();
    };
  }, [store]);

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

  const filteredProducts = products.filter(p => {
    const effectiveStock = getEffectiveStock(p);
    const matchesCategory = category === '전체' || (p.category || '전체') === category;
    const isVisible = !store?.hideOutOfStock || effectiveStock > 0;
    return matchesCategory && isVisible;
  });

  const addToCart = (product: any) => {
    const effectiveStock = getEffectiveStock(product);
    if (effectiveStock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= effectiveStock) {
          alert('재고가 부족합니다.');
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const effectiveStock = getEffectiveStock(product);

    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty > effectiveStock) {
          alert('재고가 부족합니다.');
          return item;
        }
        return { ...item, quantity: Math.max(0, newQty) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  if (!store?.isOpen) {
    return (
      <div className="fixed inset-0 bg-slate-50 z-[200] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center mb-8">
          <Power className="w-12 h-12" />
        </div>
        <h1 className="text-4xl font-display font-bold text-slate-900 mb-4">현재 영업 종료 상태입니다</h1>
        <p className="text-xl text-slate-500 mb-12">
          영업 시간에 다시 방문해 주세요.<br/>감사합니다.
        </p>
        <button 
          onClick={() => {
            setPinInput('');
            setIsAdminModalOpen(true);
          }}
          className="px-8 py-4 bg-white border border-slate-200 text-slate-400 font-bold rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
        >
          관리자 인증
        </button>

        {/* Admin PIN Modal (copied from below for access when closed) */}
        {isAdminModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">관리자 인증</h2>
              <p className="text-slate-500 mb-8 text-sm">판매자 모드로 돌아가려면<br/>4자리 PIN 번호를 입력하세요.</p>
              
              <form onSubmit={handlePinSubmit} className="space-y-6">
                <div className="flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div 
                      key={i}
                      className={cn(
                        "w-12 h-16 border-2 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all",
                        pinInput.length > i ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-slate-50",
                        pinError && "border-red-500 bg-red-50 text-red-600 animate-shake"
                      )}
                    >
                      {pinInput.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                
                <input 
                  type="password"
                  maxLength={4}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    if (val.length <= 4) setPinInput(val);
                  }}
                  className="absolute opacity-0 pointer-events-none"
                />

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        if (pinInput.length < 4) setPinInput(prev => prev + num);
                      }}
                      className="h-14 bg-slate-50 rounded-xl text-xl font-bold hover:bg-slate-100 active:scale-95 transition-all"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsAdminModalOpen(false)}
                    className="h-14 text-slate-400 font-bold hover:text-slate-600"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pinInput.length < 4) setPinInput(prev => prev + '0');
                    }}
                    className="h-14 bg-slate-50 rounded-xl text-xl font-bold hover:bg-slate-100 active:scale-95 transition-all"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinInput(prev => prev.slice(0, -1))}
                    className="h-14 text-slate-400 font-bold hover:text-slate-600"
                  >
                    삭제
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleCheckout = async (method: 'card' | 'cash' | 'transfer') => {
    if (!store || cart.length === 0) return;
    
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
        return;
      }
    }
    
    try {
      const saleData = {
        storeId: store.id,
        items: cart.map(item => ({ 
          id: item.id, 
          name: item.name, 
          price: item.price, 
          quantity: item.quantity,
          isSet: item.isSet || false,
          components: item.components || []
        })),
        totalAmount: total,
        paymentMethod: method,
        status: method === 'card' ? 'completed' : 'pending',
        timestamp: serverTimestamp(),
        type: 'kiosk'
      };

      const saleRef = await addDoc(collection(db, `stores/${store.id}/sales`), saleData);
      setOrderNumber(saleRef.id.slice(-4).toUpperCase());
      setSelectedMethod(method);

      if (method === 'card') {
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
        setStep('success');
        setCart([]);
        setTimeout(() => setStep('menu'), 5000);
      } else {
        setCurrentSaleId(saleRef.id);
        setStep('waiting');
      }
    } catch (error) {
      console.error('Kiosk checkout failed', error);
    }
  };

  const handleCancelOrder = async () => {
    if (!store || !currentSaleId) {
      setStep('menu');
      return;
    }
    
    try {
      await updateDoc(doc(db, `stores/${store.id}/sales`, currentSaleId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      });
      setStep('menu');
      setCurrentSaleId(null);
      setCart([]);
    } catch (error) {
      console.error('Cancel order failed', error);
      setStep('menu');
    }
  };

  if (step === 'waiting') {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
        {/* Admin Exit Button */}
        <button 
          onClick={() => {
            setPinInput('');
            setIsAdminModalOpen(true);
          }}
          className="absolute top-4 right-4 z-50 p-3 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-2xl transition-all active:scale-90"
          title="관리자 설정"
        >
          <Settings className="w-6 h-6" />
        </button>

        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <h1 className="text-4xl font-display font-bold text-slate-900 mb-2">결제 대기 중...</h1>
        <p className="text-lg text-slate-500 mb-8">
          카운터에서 결제를 도와드리고 있습니다.<br/>잠시만 기다려 주세요.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full mb-10">
          <div className={cn(
            "bg-slate-50 border-2 border-dashed border-slate-200 rounded-[40px] p-10 flex flex-col justify-center items-center",
            selectedMethod === 'cash' && "md:col-span-2"
          )}>
            <p className="text-slate-400 font-bold uppercase tracking-widest mb-4">Order Number</p>
            <p className="text-8xl font-display font-black text-indigo-600">{orderNumber}</p>
          </div>

          {selectedMethod === 'transfer' && (
            <div className="bg-indigo-600 text-white rounded-[40px] p-10 flex flex-col items-center justify-center shadow-2xl shadow-indigo-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Landmark className="w-32 h-32" />
              </div>
              
              <h3 className="text-xl font-bold mb-8 flex items-center gap-2 relative z-10">
                <Landmark className="w-6 h-6" />
                송금 결제 정보
              </h3>
              
              {store?.qrCodeUrl ? (
                <div className="bg-white p-4 rounded-[32px] shadow-inner mb-8 relative z-10">
                  <img 
                    src={store.qrCodeUrl} 
                    alt="QR Code" 
                    className="w-48 h-48 object-contain" 
                    referrerPolicy="no-referrer" 
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-indigo-500/30 rounded-[32px] flex items-center justify-center mb-8 relative z-10">
                  <QrCode className="w-16 h-16 text-indigo-200" />
                </div>
              )}

              <div className="text-center relative z-10">
                <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Bank Account</p>
                <p className="text-lg font-medium mb-1">{store?.bankName || '은행 정보 없음'}</p>
                <p className="text-xl font-display font-bold tracking-tight opacity-90 mb-1">{store?.accountNumber || '계좌 정보 없음'}</p>
                {store?.accountHolder && (
                  <p className="text-sm font-bold text-indigo-100">(예금주: {store.accountHolder})</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={handleCancelOrder}
          className="px-8 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
        >
          주문 취소하기
        </button>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-8 text-center">
        {/* Admin Exit Button */}
        <button 
          onClick={() => {
            setPinInput('');
            setIsAdminModalOpen(true);
          }}
          className="absolute top-4 right-4 z-50 p-3 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-2xl transition-all active:scale-90"
          title="관리자 설정"
        >
          <Settings className="w-6 h-6" />
        </button>

        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-8"
        >
          <CheckCircle2 className="w-12 h-12" />
        </motion.div>
        <h1 className="text-4xl font-display font-bold text-slate-900 mb-2">주문이 완료되었습니다!</h1>
        <p className="text-xl text-slate-500 mb-8">주문 번호를 확인해주세요.</p>
        
        {changeAmount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 animate-bounce">
            <p className="text-amber-800 font-bold text-xl">
              거스름돈 {formatCurrency(changeAmount)}을 꼭 챙겨주세요!
            </p>
          </div>
        )}

        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 mb-12">
          <p className="text-slate-400 font-bold uppercase tracking-widest mb-2">Order Number</p>
          <p className="text-8xl font-display font-black text-indigo-600">{orderNumber}</p>
        </div>

        <button 
          onClick={() => setStep('menu')}
          className="bg-indigo-600 text-white px-12 py-4 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
        >
          처음으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div 
      className="flex h-full bg-slate-100 relative overflow-hidden"
      style={store?.kioskBackgroundUrl ? {
        backgroundImage: `url(${store.kioskBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      } : {}}
    >
      {/* Admin Exit Button (Visible gear icon) */}
      <button 
        onClick={() => {
          setPinInput('');
          setIsAdminModalOpen(true);
        }}
        className="absolute top-4 right-4 z-50 p-3 bg-white/50 hover:bg-white text-slate-400 hover:text-indigo-600 rounded-2xl shadow-sm border border-slate-200/50 transition-all active:scale-90"
        title="관리자 설정"
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* Categories Sidebar */}
      <div className={cn(
        "w-32 border-r border-slate-200 flex flex-col py-8 overflow-y-auto",
        store?.kioskBackgroundUrl ? "bg-white/80 backdrop-blur-md" : "bg-white"
      )}>
        {categoryOptions.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "py-6 px-2 text-center transition-all border-r-4",
              category === c 
                ? "bg-indigo-50 border-indigo-600 text-indigo-600 font-bold" 
                : "border-transparent text-slate-400 font-medium"
            )}
          >
            <span className="text-sm break-keep">{c}</span>
          </button>
        ))}
      </div>

      {/* Main Menu Area */}
      <div className={cn(
        "flex-1 p-8 overflow-y-auto",
        store?.kioskBackgroundUrl ? "bg-slate-900/10" : ""
      )}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => {
            const effectiveStock = getEffectiveStock(product);
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={effectiveStock <= 0}
                className={cn(
                  "bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col text-left transition-all active:scale-95",
                  effectiveStock <= 0 && "opacity-50 grayscale"
                )}
              >
                <div className="aspect-square bg-slate-50 relative">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200">
                      <ShoppingCart className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    {product.isSet && (
                      <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                        세트
                      </div>
                    )}
                    {effectiveStock <= (store?.lowStockThreshold || 5) && effectiveStock > 0 && (
                      <div className="bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                        품절 임박
                      </div>
                    )}
                  </div>
                  {effectiveStock <= 0 && (
                    <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center backdrop-blur-sm">
                      <span className="text-white font-black text-2xl rotate-[-15deg] border-4 border-white px-4 py-1">품절</span>
                    </div>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h4 className="text-lg font-bold text-slate-900 mb-1 line-clamp-2">{product.name}</h4>
                  <p className="text-xl font-display font-black text-indigo-600 mt-auto">{formatCurrency(product.price)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart Summary Bar (Bottom) */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className={cn(
              "absolute bottom-0 left-32 right-0 border-t border-slate-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] p-6 flex items-center gap-8",
              store?.kioskBackgroundUrl ? "bg-white/90 backdrop-blur-md" : "bg-white"
            )}
          >
            <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center bg-slate-50 rounded-2xl p-2 pr-4 border border-slate-100 shrink-0">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-600 font-bold mr-3 border border-slate-100">
                    {item.quantity}
                  </div>
                  <div className="mr-4">
                    <p className="text-sm font-bold text-slate-900 truncate max-w-[120px]">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 bg-white rounded-lg shadow-sm border border-slate-200"><Plus className="w-3 h-3" /></button>
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 bg-white rounded-lg shadow-sm border border-slate-200"><Minus className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex items-center gap-8 shrink-0">
              <div className="text-right">
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Total</p>
                <p className="text-3xl font-display font-black text-indigo-600">{formatCurrency(total)}</p>
              </div>
              <button 
                onClick={() => setStep('checkout')}
                className="bg-indigo-600 text-white px-12 py-5 rounded-2xl font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
              >
                결제하기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout Modal Overlay */}
      {step === 'checkout' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-8">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-10 text-center">
              <h2 className="text-3xl font-display font-bold mb-8">결제 방법을 선택해주세요</h2>
              <div className="grid grid-cols-1 gap-4">
                {store?.allowCash !== false && (
                  <button 
                    onClick={() => handleCheckout('cash')}
                    className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Banknote className="w-7 h-7 text-emerald-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold text-slate-900">현금 결제</p>
                        <p className="text-sm text-slate-500">카운터에서 현금으로 결제</p>
                      </div>
                    </div>
                    <div className="text-xl font-display font-black text-indigo-600">{formatCurrency(total)}</div>
                  </button>
                )}

                <button 
                  onClick={() => handleCheckout('transfer')}
                  className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Landmark className="w-7 h-7 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-bold text-slate-900">계좌 이체</p>
                      <p className="text-sm text-slate-500">
                        {store?.bankName} {store?.accountNumber}
                      </p>
                    </div>
                  </div>
                  <div className="text-xl font-display font-black text-indigo-600">{formatCurrency(total)}</div>
                </button>
              </div>
              
              <button 
                onClick={() => setStep('menu')}
                className="mt-12 flex items-center gap-2 text-slate-400 font-bold hover:text-slate-600 mx-auto"
              >
                <ArrowLeft className="w-5 h-5" />
                뒤로가기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin PIN Modal */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">관리자 인증</h2>
            <p className="text-slate-500 mb-8 text-sm">판매자 모드로 돌아가려면<br/>4자리 PIN 번호를 입력하세요.</p>
            
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={cn(
                      "w-12 h-16 border-2 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all",
                      pinInput.length > i ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-slate-50",
                      pinError && "border-red-500 bg-red-50 text-red-600 animate-shake"
                    )}
                  >
                    {pinInput.length > i ? '●' : ''}
                  </div>
                ))}
              </div>
              
              <input 
                type="password"
                maxLength={4}
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  if (val.length <= 4) setPinInput(val);
                }}
                className="absolute opacity-0 pointer-events-none"
              />

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (pinInput.length < 4) setPinInput(prev => prev + num);
                    }}
                    className="h-14 bg-slate-50 rounded-xl text-xl font-bold hover:bg-slate-100 active:scale-95 transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsAdminModalOpen(false)}
                  className="h-14 text-slate-400 font-bold hover:text-slate-600"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 4) setPinInput(prev => prev + '0');
                  }}
                  className="h-14 bg-slate-50 rounded-xl text-xl font-bold hover:bg-slate-100 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput(prev => prev.slice(0, -1))}
                  className="h-14 text-slate-400 font-bold hover:text-slate-600"
                >
                  삭제
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
