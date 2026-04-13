import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, ShoppingBag, Users, DollarSign, Download } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import * as XLSX from 'xlsx';

export function Dashboard() {
  const { store } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;

    const salesQuery = query(
      collection(db, `stores/${store.id}/sales`),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const productsQuery = query(
      collection(db, `stores/${store.id}/products`)
    );

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSales();
      unsubProducts();
    };
  }, [store]);

  const exportToExcel = () => {
    if (!store) return;

    const wb = XLSX.utils.book_new();

    // 1. 판매 요약 (주문별)
    const summaryData = sales.map(s => ({
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
    sales.forEach(sale => {
      sale.items?.forEach((item: any) => {
        detailData.push({
          '주문 ID': sale.id,
          '판매 일시': sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleString() : '-',
          '주문 방식': sale.type === 'seller' ? '판매자 POS' : '키오스크',
          '상품명': item.name,
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
      '원가': p.cost || 0,
      '판매가': p.price,
      '현재 재고': p.stock,
      '안전 재고': p.minStock || 5
    }));
    const inventoryWs = XLSX.utils.json_to_sheet(inventoryData);
    XLSX.utils.book_append_sheet(wb, inventoryWs, "제품 현황");

    XLSX.writeFile(wb, `${store.name}_종합리포트_${new Date().toLocaleDateString()}.xlsx`);
  };

  const completedSales = sales.filter(s => s.status === 'completed');

  const todaySales = completedSales.filter(s => {
    const today = new Date();
    const saleDate = s.timestamp?.toDate();
    return saleDate && saleDate.toDateString() === today.toDateString();
  });

  const totalRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);

  // Prepare chart data (last 7 days)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    const daySales = completedSales.filter(s => s.timestamp?.toDate().toDateString() === date.toDateString());
    return {
      name: dateStr,
      revenue: daySales.reduce((acc, s) => acc + s.totalAmount, 0)
    };
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">통합 대시보드</h1>
          <p className="text-slate-500">매장의 실시간 현황을 확인하세요.</p>
        </div>
        <button 
          onClick={exportToExcel}
          className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          엑셀 내보내기
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="오늘 매출" 
          value={formatCurrency(totalRevenue)} 
          icon={<DollarSign className="w-6 h-6" />}
          color="bg-emerald-500"
        />
        <StatCard 
          title="오늘 주문" 
          value={`${todaySales.length}건`} 
          icon={<ShoppingBag className="w-6 h-6" />}
          color="bg-blue-500"
        />
        <StatCard 
          title="전체 상품" 
          value={`${products.length}개`} 
          icon={<TrendingUp className="w-6 h-6" />}
          color="bg-indigo-500"
        />
        <StatCard 
          title="재고 부족" 
          value={`${products.filter(p => p.stock <= (p.minStock || 5)).length}개`} 
          icon={<Users className="w-6 h-6" />}
          color="bg-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">최근 7일 매출 추이</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `${value/10000}만`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '매출']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">최근 판매 내역</h3>
          <div className="space-y-4">
            {completedSales.slice(0, 5).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">주문 #{sale.id.slice(-4)}</p>
                    <p className="text-xs text-slate-500">{sale.timestamp?.toDate().toLocaleTimeString()}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(sale.totalAmount)}</p>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="text-center py-8 text-slate-400 italic">내역이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg", color)}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-display font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
