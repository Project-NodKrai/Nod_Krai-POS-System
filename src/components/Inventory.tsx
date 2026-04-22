import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { Plus, Search, Edit2, Trash2, Package, Image as ImageIcon, Tag, X, History, ShoppingBag, Minus, Download, CheckCircle2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import imageCompression from 'browser-image-compression';

export function Inventory() {
  const { store } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'history'>('inventory');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isSaleDeleteModalOpen, setIsSaleDeleteModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Form state
  const [formData, setFormData] = useState<any>({
    name: '',
    category: '',
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 5,
    imageUrl: '',
    isSet: false,
    components: []
  });

  useEffect(() => {
    if (!store) return;
    const unsubProducts = onSnapshot(collection(db, `stores/${store.id}/products`), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCategories = onSnapshot(collection(db, `stores/${store.id}/categories`), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubSales = onSnapshot(
      query(collection(db, `stores/${store.id}/sales`), orderBy('timestamp', 'desc')),
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );
    return () => {
      unsubProducts();
      unsubCategories();
      unsubSales();
    };
  }, [store]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;

    try {
      if (editingProduct) {
        await updateDoc(doc(db, `stores/${store.id}/products`, editingProduct.id), formData);
      } else {
        await addDoc(collection(db, `stores/${store.id}/products`), {
          ...formData,
          storeId: store.id,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ 
        name: '', 
        category: '', 
        price: 0, 
        cost: 0, 
        stock: 0, 
        minStock: 5, 
        imageUrl: '',
        isSet: false,
        components: []
      });
    } catch (error) {
      console.error('Save failed', error);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, `stores/${store.id}/categories`), {
        name: newCategoryName.trim()
      });
      setNewCategoryName('');
    } catch (error) {
      console.error('Category add failed', error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!store || !window.confirm('카테고리를 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, `stores/${store.id}/categories`, id));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8,
      };
      
      const compressedBlob = await imageCompression(file, options);
      const webpFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
        type: 'image/webp',
      });
      
      const filename = `${Date.now()}_${webpFile.name}`;
      const uploadUrl = `https://pos-db.columbina.kr/images/product/${encodeURIComponent(filename)}`;
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/webp'
        },
        body: webpFile
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      setFormData((prev: any) => ({ ...prev, imageUrl: uploadUrl }));
      
      // 사용자 요청: 저장 버튼을 누르지 않아도 예외적으로 즉시 반영 처리
      if (store) {
        if (editingProduct) {
          // 기존 상품인 경우 바로 해당 상품 문서 업데이트
          await updateDoc(doc(db, `stores/${store.id}/products`, editingProduct.id), { imageUrl: uploadUrl });
          // editingProduct 상태도 동기화
          setEditingProduct((prev: any) => ({ ...prev, imageUrl: uploadUrl }));
        } else {
          // 새 상품 작성 중이었을 경우, 이 시점에 임시 문서 (상품) 생성해두어 이탈해도 저장되게 함
          const newDocRef = await addDoc(collection(db, `stores/${store.id}/products`), {
            ...formData,
            name: formData.name || '새 상품 (이미지 임시저장)', // 이름이 비어있을 경우 방지
            imageUrl: uploadUrl,
            storeId: store.id,
            createdAt: serverTimestamp()
          });
          // 이후 저장 버튼 누를 때 새 상품이 또 생성되지 않도록 editingProduct로 전환
          setEditingProduct({ id: newDocRef.id, ...formData, imageUrl: uploadUrl });
        }
      }
    } catch (error: any) {
      console.error('Image upload error:', error);
      if (error.message === 'Failed to fetch') {
        alert('이미지 서버 연결 실패 (Failed to fetch)\n\n서버(pos-db.columbina.kr)가 응답하지 않거나 브라우저의 CORS(교차 출처 리소스 공유) 보안 정책에 의해 차단되었습니다.\n서버에서 외부 도메인의 PUT 요청을 허용하도록 CORS 설정을 확인해주세요.');
      } else {
        alert(`이미지 업로드에 실패했습니다: ${error.message}`);
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeImage = async () => {
    if (formData.imageUrl && formData.imageUrl.startsWith('https://pos-db.columbina.kr/')) {
      try {
        await fetch(formData.imageUrl, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete old image', e);
      }
    }
    setFormData((prev: any) => ({ ...prev, imageUrl: '' }));
    
    // 삭제 시에도 동일하게 즉시 반영
    if (store && editingProduct) {
      try {
        await updateDoc(doc(db, `stores/${store.id}/products`, editingProduct.id), { imageUrl: '' });
        setEditingProduct((prev: any) => ({ ...prev, imageUrl: '' }));
      } catch (error) {
        console.error('Failed to update product document on image removal', error);
      }
    }
  };

  const handleDelete = async () => {
    if (!store || !productToDelete) return;
    
    // Close modal immediately for better UX
    const id = productToDelete;
    setIsDeleteModalOpen(false);
    setProductToDelete(null);

    try {
      const product = products.find(p => p.id === id);
      if (product?.imageUrl && product.imageUrl.startsWith('https://pos-db.columbina.kr/')) {
        fetch(product.imageUrl, { method: 'DELETE' }).catch(console.error);
      }
      await deleteDoc(doc(db, `stores/${store.id}/products`, id));
    } catch (error) {
      console.error('Delete failed', error);
      alert('삭제 권한이 없거나 오류가 발생했습니다.');
    }
  };

  const confirmDelete = (id: string) => {
    setProductToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !editingSale) return;

    try {
      const saleRef = doc(db, `stores/${store.id}/sales`, editingSale.id);
      await updateDoc(saleRef, {
        items: editingSale.items,
        totalAmount: editingSale.totalAmount,
        paymentMethod: editingSale.paymentMethod
      });
      setIsSaleModalOpen(false);
      setEditingSale(null);
    } catch (error) {
      console.error('Sale update failed', error);
      alert('수정 권한이 없거나 오류가 발생했습니다.');
    }
  };

  const handleDeleteSale = async () => {
    if (!store || !saleToDelete) return;
    const id = saleToDelete;
    setIsSaleDeleteModalOpen(false);
    setSaleToDelete(null);

    try {
      await deleteDoc(doc(db, `stores/${store.id}/sales`, id));
    } catch (error) {
      console.error('Sale delete failed', error);
      alert('삭제 권한이 없거나 오류가 발생했습니다.');
    }
  };

  const updateSaleItemQuantity = (index: number, newQuantity: number) => {
    if (!editingSale) return;
    const newItems = [...editingSale.items];
    newItems[index] = { ...newItems[index], quantity: Math.max(1, newQuantity) };
    
    // Recalculate total
    const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    setEditingSale({ ...editingSale, items: newItems, totalAmount: newTotal });
  };

  const updateSaleItemPrice = (index: number, newPrice: number) => {
    if (!editingSale) return;
    const newItems = [...editingSale.items];
    newItems[index] = { ...newItems[index], price: Math.max(0, newPrice) };
    
    // Recalculate total
    const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    setEditingSale({ ...editingSale, items: newItems, totalAmount: newTotal });
  };

  const exportSalesToExcel = () => {
    if (!store || sales.length === 0) return;
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      
      // 1. 판매 요약 (주문별)
      const summaryData = sales.map(sale => ({
        '주문 ID': sale.id,
        '판매 일시': sale.timestamp?.toDate ? format(sale.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : '-',
        '주문 방식': sale.type === 'seller' ? '판매자 POS' : '키오스크',
        '결제 수단': sale.paymentMethod === 'cash' ? '현금' : sale.paymentMethod === 'card' ? '카드' : '계좌이체',
        '품목 요약': sale.items?.map((i: any) => `${i.name}(${i.quantity})`).join(', '),
        '총 품목 수': sale.items?.reduce((acc: number, i: any) => acc + i.quantity, 0) || 0,
        '할인 금액': sale.discountAmount || 0,
        '총 결제 금액': sale.totalAmount,
      }));
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "판매 요약");

      // 2. 판매 상세 (품목별)
      const detailData: any[] = [];
      sales.forEach(sale => {
        sale.items?.forEach((item: any) => {
          detailData.push({
            '주문 ID': sale.id,
            '판매 일시': sale.timestamp?.toDate ? format(sale.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : '-',
            '주문 방식': sale.type === 'seller' ? '판매자 POS' : '키오스크',
            '상품명': item.name,
            '서비스 여부': item.isService ? 'Y' : 'N',
            '단가': item.price,
            '수량': item.quantity,
            '소계': item.price * item.quantity
          });
        });
      });
      const detailWs = XLSX.utils.json_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, detailWs, "판매 상세");

      // 3. 제품 현황
      const inventoryData = products.map(p => ({
        '상품명': p.name,
        '카테고리': p.category,
        '세트 여부': p.isSet ? 'Y' : 'N',
        '구성 상품': p.isSet ? p.components?.map((c: any) => `${c.name}(${c.quantity})`).join(', ') : '-',
        '원가': p.cost || 0,
        '판매가': p.price,
        '현재 재고': getEffectiveStock(p),
        '안전 재고': p.minStock || 5
      }));
      const inventoryWs = XLSX.utils.json_to_sheet(inventoryData);
      XLSX.utils.book_append_sheet(wb, inventoryWs, "제품 현황");

      XLSX.writeFile(wb, `${store.name}_종합리포트_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    } catch (error) {
      console.error('Excel export failed', error);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

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

  useEffect(() => {
    if (formData.isSet && formData.components.length > 0) {
      const calculatedCost = formData.components.reduce((acc: number, comp: any) => {
        const p = products.find(prod => prod.id === comp.id);
        return acc + ((p?.cost || 0) * comp.quantity);
      }, 0);
      // Only update if it's different to avoid unnecessary state updates
      if (calculatedCost !== formData.cost) {
        setFormData(prev => ({ ...prev, cost: calculatedCost }));
      }
    }
  }, [formData.components]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">제품 관리</h1>
          <p className="text-slate-500">제품 재고와 최근 판매 내역을 확인하세요.</p>
        </div>
        <div className="flex gap-3">
          {activeSubTab === 'inventory' ? (
            <>
              <button 
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm"
              >
                <Tag className="w-5 h-5" />
                카테고리 관리
              </button>
              <button 
                onClick={() => { 
                  setIsModalOpen(true); 
                  setEditingProduct(null); 
                  setFormData({ 
                    name: '', 
                    category: '', 
                    price: 0, 
                    cost: 0, 
                    stock: 0, 
                    minStock: 5, 
                    imageUrl: '',
                    isSet: true,
                    components: []
                  }); 
                }}
                className="flex items-center gap-2 bg-amber-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
              >
                <ShoppingBag className="w-5 h-5" />
                세트 추가
              </button>
              <button 
                onClick={() => { 
                  setIsModalOpen(true); 
                  setEditingProduct(null); 
                  setFormData({ 
                    name: '', 
                    category: '', 
                    price: 0, 
                    cost: 0, 
                    stock: 0, 
                    minStock: 5, 
                    imageUrl: '',
                    isSet: false,
                    components: []
                  }); 
                }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                <Plus className="w-5 h-5" />
                상품 등록
              </button>
            </>
          ) : (
            <button 
              onClick={exportSalesToExcel}
              disabled={isExporting || sales.length === 0}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              엑셀로 내보내기
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('inventory')}
          className={cn(
            "px-6 py-3 font-bold text-sm transition-all border-b-2",
            activeSubTab === 'inventory' 
              ? "border-indigo-600 text-indigo-600" 
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            재고 현황
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={cn(
            "px-6 py-3 font-bold text-sm transition-all border-b-2",
            activeSubTab === 'history' 
              ? "border-indigo-600 text-indigo-600" 
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            최근 판매 내역
          </div>
        </button>
      </div>

      {activeSubTab === 'inventory' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="상품명 또는 카테고리 검색..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">상품 정보</th>
                  <th className="px-6 py-4">카테고리</th>
                  <th className="px-6 py-4">가격</th>
                  <th className="px-6 py-4">재고</th>
                  <th className="px-6 py-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => { setEditingProduct(product); setFormData(product); setIsModalOpen(true); }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            {product.name}
                            {product.isSet && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded">세트</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                        {product.category || '전체'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(product.price)}</p>
                      <p className="text-xs text-slate-400">원가: {formatCurrency(product.cost)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-bold",
                          getEffectiveStock(product) <= (product.minStock || 5) ? "text-red-500" : "text-slate-900"
                        )}>
                          {getEffectiveStock(product)}
                        </span>
                        {getEffectiveStock(product) <= (product.minStock || 5) && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-bold uppercase">Low</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingProduct(product); setFormData(product); setIsModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmDelete(product.id); }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length === 0 && (
              <div className="py-20 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">등록된 상품이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">판매 일시</th>
                  <th className="px-6 py-4">판매 내역</th>
                  <th className="px-6 py-4">결제 금액</th>
                  <th className="px-6 py-4">결제 수단</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale) => (
                  <tr 
                    key={sale.id} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={() => { setEditingSale(JSON.parse(JSON.stringify(sale))); setIsSaleModalOpen(true); }}
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900">
                        {sale.timestamp?.toDate ? format(sale.timestamp.toDate(), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-tighter">ID: {sale.id.slice(0, 8)}...</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {sale.items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-700">{item.name}</span>
                            <span className="text-slate-400">x</span>
                            <span className="font-bold text-indigo-600">{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(sale.totalAmount)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          sale.paymentMethod === 'cash' ? "bg-emerald-50 text-emerald-600" :
                          sale.paymentMethod === 'card' ? "bg-blue-50 text-blue-600" :
                          "bg-amber-50 text-amber-600"
                        )}>
                          {sale.paymentMethod === 'cash' ? '현금' : 
                           sale.paymentMethod === 'card' ? '카드' : '계좌이체'}
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSaleToDelete(sale.id);
                            setIsSaleDeleteModalOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sales.length === 0 && (
              <div className="py-20 text-center">
                <ShoppingBag className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">최근 판매 내역이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sale Edit Modal */}
      {isSaleModalOpen && editingSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">주문 상세 및 수정</h2>
                <p className="text-xs text-slate-500 font-mono mt-1 uppercase">Order ID: {editingSale.id}</p>
              </div>
              <button onClick={() => setIsSaleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdateSale} className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">품목 리스트</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {editingSale.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-500">단가:</span>
                          <input 
                            type="number"
                            value={item.price}
                            onChange={(e) => updateSaleItemPrice(idx, Number(e.target.value))}
                            className="w-24 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => updateSaleItemQuantity(idx, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-bold text-slate-900">{item.quantity}</span>
                        <button 
                          type="button"
                          onClick={() => updateSaleItemQuantity(idx, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-sm font-bold text-indigo-600">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">결제 수단</label>
                  <div className="flex gap-2">
                    {['cash', 'card', 'transfer'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEditingSale({ ...editingSale, paymentMethod: method })}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all border",
                          editingSale.paymentMethod === method 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {method === 'cash' ? '현금' : method === 'card' ? '카드' : '이체'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">총 결제 금액</label>
                  <p className="text-3xl font-display font-bold text-indigo-600">{formatCurrency(editingSale.totalAmount)}</p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setIsSaleModalOpen(false);
                    setSaleToDelete(editingSale.id);
                    setIsSaleDeleteModalOpen(true);
                  }}
                  className="px-4 py-3 border border-red-200 text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  결제 취소
                </button>
                <div className="flex-1 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsSaleModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    수정 내용 저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Delete Confirmation Modal */}
      {isSaleDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">결제 취소 (삭제)</h2>
              <p className="text-slate-500 mb-6">정말 이 판매 내역을 삭제하시겠습니까?<br/>재고는 자동으로 복구되지 않으니 주의하세요.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsSaleDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handleDeleteSale}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  삭제하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {editingProduct ? '상품 수정' : formData.isSet ? '새 세트 등록' : '새 상품 등록'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    {formData.isSet ? '세트명' : '상품명'}
                  </label>
                  <input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
                {formData.isSet && (
                  <div className="col-span-2 space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase">구성 상품 설정</label>
                    <div className="space-y-2">
                      {formData.components.map((comp: any, idx: number) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={comp.id}
                            onChange={(e) => {
                              const selected = products.find(p => p.id === e.target.value);
                              const newComps = [...formData.components];
                              newComps[idx] = { ...newComps[idx], id: e.target.value, name: selected?.name || '' };
                              setFormData({ ...formData, components: newComps });
                            }}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none"
                          >
                            <option value="">상품 선택</option>
                            {products.filter(p => !p.isSet).map(p => (
                              <option key={p.id} value={p.id}>{p.name} (재고: {p.stock})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={comp.quantity}
                            onChange={(e) => {
                              const newComps = [...formData.components];
                              newComps[idx] = { ...newComps[idx], quantity: Number(e.target.value) };
                              setFormData({ ...formData, components: newComps });
                            }}
                            className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newComps = formData.components.filter((_: any, i: number) => i !== idx);
                              setFormData({ ...formData, components: newComps });
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, components: [...formData.components, { id: '', name: '', quantity: 1 }] })}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> 구성 상품 추가
                      </button>
                    </div>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">카테고리</label>
                  <select 
                    value={formData.category} 
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">전체 (기본)</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">제품 사진</label>
                  <div className="flex gap-4 items-start">
                    {formData.imageUrl ? (
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                        <img src={formData.imageUrl} alt="preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors backdrop-blur-sm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 bg-slate-50 relative shrink-0 transition-all hover:bg-slate-100 hover:border-slate-300">
                        {isUploadingImage ? (
                          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <ImageIcon className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-medium">사진 첨부</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploadingImage}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <input 
                        value={formData.imageUrl} 
                        onChange={e => setFormData({...formData, imageUrl: e.target.value})}
                        placeholder="또는 이미지 URL 직접 입력 (https://...)"
                        readOnly={formData.imageUrl?.startsWith('https://pos-db.columbina.kr/')}
                        className={cn(
                          "w-full px-4 py-2 border rounded-lg text-sm outline-none transition-all",
                          formData.imageUrl?.startsWith('https://pos-db.columbina.kr/')
                            ? "bg-slate-100 border-transparent text-slate-500 cursor-not-allowed shadow-inner"
                            : "bg-white border-slate-200 focus:ring-2 focus:ring-indigo-500"
                        )}
                      />
                      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                        파일을 업로드하면 <span className="font-bold text-indigo-600">WebP 포맷으로 자동 변환</span>되어 서버에 저장됩니다.<br/>
                        업로드된 이미지는 상품 삭제 시 함께 삭제됩니다.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">판매가 (₩)</label>
                  <input 
                    type="number" 
                    required 
                    value={formData.price} 
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">원가 (₩)</label>
                  <input 
                    type="number" 
                    value={formData.cost} 
                    onChange={e => setFormData({...formData, cost: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    {formData.isSet ? '최대 가능 재고 (자동계산)' : '현재 재고'}
                  </label>
                  <input 
                    type="number" 
                    required 
                    readOnly={formData.isSet}
                    value={formData.isSet ? (() => {
                      if (formData.components.length === 0) return 0;
                      const stocks = formData.components.map((comp: any) => {
                        const p = products.find(prod => prod.id === comp.id);
                        if (!p) return 0;
                        return Math.floor(p.stock / comp.quantity);
                      });
                      return Math.min(...stocks);
                    })() : formData.stock} 
                    onChange={e => !formData.isSet && setFormData({...formData, stock: Number(e.target.value)})}
                    className={cn(
                      "w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500",
                      formData.isSet && "bg-slate-50 text-slate-500 cursor-not-allowed"
                    )} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">알림 재고</label>
                  <input 
                    type="number" 
                    value={formData.minStock} 
                    onChange={e => setFormData({...formData, minStock: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">카테고리 관리</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input 
                  required 
                  placeholder="새 카테고리 이름"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all"
                >
                  추가
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <button 
                      onClick={() => handleDeleteCategory(c.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-slate-400 py-4 italic">등록된 카테고리가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">상품 삭제</h2>
              <p className="text-slate-500 mb-6">정말 이 상품을 삭제하시겠습니까?<br/>삭제된 데이터는 복구할 수 없습니다.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  삭제하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
