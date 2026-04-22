import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { Store, CreditCard, Shield, Database, Save, AlertTriangle, Download, Trash2, QrCode, Banknote, Eye, EyeOff, CheckCircle2, X, Image as ImageIcon, Palette, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import imageCompression from 'browser-image-compression';

export function Settings() {
  const { store, user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  
  const [formData, setFormData] = useState({
    name: store?.name || '',
    bankName: store?.bankName || '',
    accountNumber: store?.accountNumber || '',
    accountHolder: store?.accountHolder || '',
    qrCodeUrl: store?.qrCodeUrl || '',
    allowCash: store?.allowCash ?? true,
    hideOutOfStock: store?.hideOutOfStock ?? false,
    lowStockThreshold: store?.lowStockThreshold ?? 5,
    adminPin: store?.adminPin || '',
    brandName: store?.brandName || 'NodKrai POS',
    kioskBackgroundUrl: store?.kioskBackgroundUrl || '',
  });

  const handleSave = async () => {
    if (!store) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'stores', store.id), formData);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !store) return;

    setIsUploadingQr(true);
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
      const uploadUrl = `https://pos-db.columbina.kr/images/other/${encodeURIComponent(filename)}`;
      
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

      setFormData(prev => ({ ...prev, qrCodeUrl: uploadUrl }));
      
      // Auto-save the QR URL immediately
      await updateDoc(doc(db, 'stores', store.id), { qrCodeUrl: uploadUrl });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('QR upload error:', error);
      if (error.message === 'Failed to fetch') {
        alert('이미지 서버 연결 실패 (Failed to fetch)\n\n서버의 CORS 설정을 확인해주세요.');
      } else {
        alert(`이미지 업로드에 실패했습니다: ${error.message}`);
      }
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !store) return;

    setIsUploadingBg(true);
    try {
      const options = {
        maxSizeMB: 2, // 배경화면은 조금 더 고화질 허용
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.9,
      };
      
      const compressedBlob = await imageCompression(file, options);
      const webpFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
        type: 'image/webp',
      });
      
      const filename = `${Date.now()}_kiosk_bg_${webpFile.name}`;
      const uploadUrl = `https://pos-db.columbina.kr/images/UI/${encodeURIComponent(filename)}`;
      
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

      setFormData(prev => ({ ...prev, kioskBackgroundUrl: uploadUrl }));
      
      // Auto-save immediately
      await updateDoc(doc(db, 'stores', store.id), { kioskBackgroundUrl: uploadUrl });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('BG upload error:', error);
      alert(`이미지 업로드에 실패했습니다: ${error.message}`);
    } finally {
      setIsUploadingBg(false);
    }
  };

  const removeBgImage = async () => {
    if (!store) return;
    
    if (formData.kioskBackgroundUrl && formData.kioskBackgroundUrl.startsWith('https://pos-db.columbina.kr/')) {
      try {
        await fetch(formData.kioskBackgroundUrl, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete old BG image', e);
      }
    }
    
    setFormData(prev => ({ ...prev, kioskBackgroundUrl: '' }));
    
    // Auto-save
    try {
      await updateDoc(doc(db, 'stores', store.id), { kioskBackgroundUrl: '' });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update store doc', error);
    }
  };

  const removeQrImage = async () => {
    if (!store) return;
    
    if (formData.qrCodeUrl && formData.qrCodeUrl.startsWith('https://pos-db.columbina.kr/')) {
      try {
        await fetch(formData.qrCodeUrl, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete old QR image', e);
      }
    }
    
    setFormData(prev => ({ ...prev, qrCodeUrl: '' }));
    
    // Auto-save the removal immediately
    try {
      await updateDoc(doc(db, 'stores', store.id), { qrCodeUrl: '' });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update store doc', error);
    }
  };

  const handleResetData = async () => {
    if (!store || resetConfirmText !== '초기화') return;
    
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // Delete all products
      const productsSnap = await getDocs(collection(db, `stores/${store.id}/products`));
      productsSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete all sales
      const salesSnap = await getDocs(collection(db, `stores/${store.id}/sales`));
      salesSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete all categories
      const categoriesSnap = await getDocs(collection(db, `stores/${store.id}/categories`));
      categoriesSnap.forEach(doc => batch.delete(doc.ref));
      
      await batch.commit();
      alert('모든 데이터가 초기화되었습니다.');
      setIsResetModalOpen(false);
      setResetConfirmText('');
    } catch (error) {
      console.error('Reset failed', error);
      alert('초기화 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const exportToExcel = async () => {
    if (!store) return;
    
    const wb = XLSX.utils.book_new();
    
    const salesSnap = await getDocs(collection(db, `stores/${store.id}/sales`));
    const sales = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 1. 판매 요약 (주문별)
    const summaryData = sales.map((s: any) => ({
      '주문 ID': s.id,
      '일시': s.timestamp?.toDate().toLocaleString(),
      '주문 방식': s.type === 'seller' ? '판매자 POS' : '키오스크',
      '결제수단': s.paymentMethod === 'card' ? '카드' : s.paymentMethod === 'cash' ? '현금' : '계좌이체',
      '품목 요약': s.items?.map((i: any) => `${i.name}(${i.quantity})`).join(', '),
      '총 품목 수': s.items?.reduce((acc: number, i: any) => acc + i.quantity, 0) || 0,
      '할인 금액': s.discountAmount || 0,
      '총 결제 금액': s.totalAmount,
      '받은 금액': s.receivedAmount || 0,
      '거스름돈': s.changeAmount || 0,
      '상태': s.status === 'completed' ? '완료' : s.status === 'pending' ? '대기' : '취소',
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "판매 요약");

    // 2. 판매 상세 (품목별)
    const detailData: any[] = [];
    sales.forEach((sale: any) => {
      sale.items?.forEach((item: any) => {
        detailData.push({
          '주문 ID': sale.id,
          '판매 일시': sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleString() : '-',
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

    const productsSnap = await getDocs(collection(db, `stores/${store.id}/products`));
    const allProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    const getEffectiveStock = (product: any) => {
      if (!product.isSet || !product.components || product.components.length === 0) {
        return product.stock;
      }
      const stocks = product.components.map((comp: any) => {
        const p = allProducts.find(prod => prod.id === comp.id);
        if (!p) return 0;
        return Math.floor(p.stock / comp.quantity);
      });
      return Math.min(...stocks);
    };

    const inventoryData = allProducts.map(p => ({
      '상품명': p.name,
      '카테고리': p.category,
      '세트 여부': p.isSet ? 'Y' : 'N',
      '원가': p.cost || 0,
      '판매가': p.price,
      '현재 재고': getEffectiveStock(p),
      '안전 재고': p.minStock || 5
    }));
    const inventoryWs = XLSX.utils.json_to_sheet(inventoryData);
    XLSX.utils.book_append_sheet(wb, inventoryWs, "제품 현황");

    XLSX.writeFile(wb, `${store.name}_전체데이터_${new Date().toLocaleDateString()}.xlsx`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">설정</h1>
          <p className="text-slate-500">매장 운영 및 결제 방식을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-4">
          {showSaveSuccess && (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-100 animate-in fade-in slide-in-from-right-4 duration-300">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-bold">설정이 저장되었습니다!</span>
            </div>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            설정 저장하기
          </button>
        </div>
      </div>

      {/* 1. 매장 기본 정보 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Store className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold">매장 기본 정보</h3>
        </div>
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">매장명</label>
              <input 
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">키오스크 접속 주소 (변경 불가)</label>
              <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-mono text-sm flex items-center justify-between">
                <span>{window.location.origin}/#/kiosk/{store?.subdomain}</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/#/kiosk/${store?.subdomain}`);
                    alert('주소가 복사되었습니다.');
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-bold text-xs"
                >
                  복사하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 테마 및 브랜딩 설정 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Palette className="w-5 h-5 text-purple-600" />
          <h3 className="font-bold">테마 및 브랜딩 설정</h3>
        </div>
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">브랜드 이름</h4>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">상단 바 표시 이름</label>
                <div className="relative">
                  <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    value={formData.brandName}
                    onChange={(e) => setFormData({...formData, brandName: e.target.value})}
                    placeholder="예: NodKrai POS"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">관리자 페이지 상단 바에 표시될 텍스트입니다.</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">키오스크 배경</h4>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">배경화면 이미지</label>
                <div className="flex gap-4 items-start border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  {formData.kioskBackgroundUrl ? (
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
                      <img src={formData.kioskBackgroundUrl} alt="Kiosk Background Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={removeBgImage}
                        className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full hover:bg-red-600 transition-colors backdrop-blur-sm shadow-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full aspect-video rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white relative transition-all hover:bg-slate-50 hover:border-slate-400 shadow-sm">
                      {isUploadingBg ? (
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                          <span className="text-xs font-medium">배경 이미지 업로드</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBgUpload}
                        disabled={isUploadingBg}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  키오스크 모드에서 배경화면으로 사용될 이미지입니다.<br/>
                   이미지를 첨부하면 <span className="font-bold text-indigo-600">즉시 저장</span>되며 WebP 포맷으로 변환됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 결제 및 정산 설정 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold">결제 및 정산 설정</h3>
        </div>
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">송금 계좌 정보</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">은행명</label>
                  <input 
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                    placeholder="예: 신한은행"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">계좌번호</label>
                  <input 
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                    placeholder="000-000-000000"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">입금자 명 (예금주)</label>
                  <input 
                    type="text"
                    value={formData.accountHolder}
                    onChange={(e) => setFormData({...formData, accountHolder: e.target.value})}
                    placeholder="예: 홍길동"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">QR 코드 등록</h4>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">송금 QR 이미지</label>
                <div className="flex gap-4 items-start border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  {formData.qrCodeUrl ? (
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-white shadow-sm">
                      <img src={formData.qrCodeUrl} alt="QR Code Preview" className="w-full h-full object-contain p-2" />
                      <button
                        type="button"
                        onClick={removeQrImage}
                        className="absolute top-1 right-1 p-1.5 bg-red-500/90 text-white rounded-full hover:bg-red-600 transition-colors backdrop-blur-sm shadow-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white relative shrink-0 transition-all hover:bg-slate-50 hover:border-slate-400 shadow-sm">
                      {isUploadingQr ? (
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-xs font-medium">QR 업로드</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrUpload}
                        disabled={isUploadingQr}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <h5 className="font-semibold text-slate-700 text-sm">결제용 QR 코드</h5>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      카카오페이 또는 토스페이의 송금 QR 코드 이미지를 업로드해주세요.<br/><br/>
                      <span className="font-medium text-slate-700">안내:</span> 이미지를 첨부하면 <span className="font-bold text-indigo-600">즉시 저장</span>되며 WebP 포맷으로 자동 변환됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">현금 결제 허용</h4>
                <p className="text-sm text-slate-500">키오스크에서 현금 결제 버튼을 활성화합니다.</p>
              </div>
              <button 
                onClick={() => setFormData({...formData, allowCash: !formData.allowCash})}
                className={cn(
                  "w-14 h-8 rounded-full transition-all relative",
                  formData.allowCash ? "bg-indigo-600" : "bg-slate-200"
                )}
              >
                <div className={cn(
                  "w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm",
                  formData.allowCash ? "left-7" : "left-1"
                )} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 키오스크 보안 및 운영 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold">키오스크 운영 설정</h3>
        </div>
        <div className="p-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900">품절 상품 숨기기</h4>
              <p className="text-sm text-slate-500">재고가 0인 상품을 키오스크 메뉴에서 아예 숨깁니다.</p>
            </div>
            <button 
              onClick={() => setFormData({...formData, hideOutOfStock: !formData.hideOutOfStock})}
              className={cn(
                "w-14 h-8 rounded-full transition-all relative",
                formData.hideOutOfStock ? "bg-indigo-600" : "bg-slate-200"
              )}
            >
              <div className={cn(
                "w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm",
                formData.hideOutOfStock ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">낮은 재고 알림 임계값</h4>
                <p className="text-sm text-slate-500">재고가 설정값 미만일 때 키오스크에 "품절 임박" 표시를 띄웁니다.</p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="number"
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({...formData, lowStockThreshold: Number(e.target.value)})}
                  className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-lg text-center font-bold"
                />
                <span className="text-slate-500 font-medium">개</span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">어드민 PIN 번호</h4>
                <p className="text-sm text-slate-500">키오스크 모드에서 나갈 때 필요한 4자리 숫자입니다.</p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="password"
                  maxLength={4}
                  value={formData.adminPin}
                  onChange={(e) => setFormData({...formData, adminPin: e.target.value.replace(/[^0-9]/g, '')})}
                  placeholder="0000"
                  className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-center font-mono font-bold tracking-widest"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 데이터 및 백업 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden border-red-100">
        <div className="p-6 border-b border-slate-100 bg-red-50/30 flex items-center gap-3">
          <Database className="w-5 h-5 text-red-600" />
          <h3 className="font-bold">데이터 및 백업</h3>
        </div>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <h4 className="font-bold text-slate-900">전체 데이터 백업</h4>
              <p className="text-sm text-slate-500">모든 판매 기록과 재고 현황을 엑셀로 다운로드합니다.</p>
            </div>
            <button 
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              엑셀 다운로드
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
            <div>
              <h4 className="font-bold text-red-900">데이터 초기화</h4>
              <p className="text-sm text-red-600/70">상품, 판매 기록, 카테고리를 모두 삭제합니다. (복구 불가)</p>
            </div>
            <button 
              onClick={() => setIsResetModalOpen(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
            >
              <Trash2 className="w-4 h-4" />
              전체 초기화
            </button>
          </div>
        </div>
      </section>

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">정말 초기화하시겠습니까?</h2>
              <p className="text-slate-500 mb-8">
                모든 상품, 판매 기록, 카테고리가 삭제됩니다.<br/>
                이 작업은 되돌릴 수 없습니다.
              </p>
              
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-700">확인을 위해 아래에 <span className="text-red-600">"초기화"</span>를 입력하세요.</p>
                <input 
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="초기화"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-center font-bold outline-none focus:border-red-500 transition-all"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    취소
                  </button>
                  <button 
                    disabled={resetConfirmText !== '초기화' || isSaving}
                    onClick={handleResetData}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
                  >
                    데이터 삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
