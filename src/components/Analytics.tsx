import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area, LabelList
} from 'recharts';
import { 
  TrendingUp, PieChart as PieChartIcon, BarChart3, Clock, Calendar, 
  Users, AlertCircle, ArrowUpRight, ArrowDownRight, Package, ShoppingBag,
  RefreshCcw, Filter, Heart, Percent
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

export function Analytics() {
  const { store } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryView, setCategoryView] = useState<'revenue' | 'profit' | 'volume'>('revenue');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    if (!store) return;

    const salesQuery = query(
      collection(db, `stores/${store.id}/sales`),
      orderBy('timestamp', 'desc')
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

  const filteredSales = useMemo(() => {
    if (dateRange === 'all') return sales;
    const now = new Date();
    const days = dateRange === '7d' ? 7 : 30;
    const cutoff = new Date(now.setDate(now.getDate() - days));
    return sales.filter(s => s.timestamp?.toDate() >= cutoff);
  }, [sales, dateRange]);

  const completedSales = useMemo(() => filteredSales.filter(s => s.status === 'completed'), [filteredSales]);
  const cancelledSales = useMemo(() => filteredSales.filter(s => s.status === 'cancelled'), [filteredSales]);

  // 1. Hourly Revenue/Profit
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}시`,
      revenue: 0,
      profit: 0,
      count: 0
    }));

    completedSales.forEach(sale => {
      const date = sale.timestamp?.toDate();
      if (!date) return;
      const hour = date.getHours();
      hours[hour].revenue += sale.totalAmount;
      hours[hour].count += 1;
      
      // Calculate profit: totalAmount - cost of items
      let saleCost = 0;
      sale.items?.forEach((item: any) => {
        const p = products.find(prod => prod.id === item.id);
        saleCost += (p?.cost || 0) * item.quantity;
      });
      hours[hour].profit += (sale.totalAmount - saleCost);
    });

    return hours;
  }, [completedSales, products]);

  // 2. Category Sales
  const categoryData = useMemo(() => {
    const catMap: Record<string, { name: string, revenue: number, profit: number, volume: number }> = {};

    completedSales.forEach(sale => {
      sale.items?.forEach((item: any) => {
        const p = products.find(prod => prod.id === item.id);
        const cat = p?.category || '기타';
        if (!catMap[cat]) {
          catMap[cat] = { name: cat, revenue: 0, profit: 0, volume: 0 };
        }
        const itemRevenue = item.price * item.quantity;
        const itemCost = (p?.cost || 0) * item.quantity;
        catMap[cat].revenue += itemRevenue;
        catMap[cat].profit += (itemRevenue - itemCost);
        catMap[cat].volume += item.quantity;
      });
    });

    return Object.values(catMap).sort((a, b) => b[categoryView] - a[categoryView]);
  }, [completedSales, products, categoryView]);

  // 3. ABC Analysis
  const abcData = useMemo(() => {
    const productStats = products.map(p => {
      const pSales = completedSales.flatMap(s => s.items || []).filter((i: any) => i.id === p.id);
      const volume = pSales.reduce((acc, i: any) => acc + i.quantity, 0);
      const revenue = pSales.reduce((acc, i: any) => acc + (i.price * i.quantity), 0);
      const profit = revenue - (volume * (p.cost || 0));
      return { ...p, volume, revenue, profit };
    }).filter(p => p.revenue > 0 || p.stock > 0);

    // Sort by revenue for ABC classification
    const sorted = [...productStats].sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = sorted.reduce((acc, p) => acc + p.revenue, 0);
    
    let cumulativeRevenue = 0;
    return sorted.map(p => {
      cumulativeRevenue += p.revenue;
      const ratio = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) : 1;
      let grade = 'D';
      if (ratio <= 0.7) grade = 'A';
      else if (ratio <= 0.9) grade = 'B';
      else if (ratio <= 0.98) grade = 'C';
      
      return { ...p, grade };
    });
  }, [completedSales, products]);

  // 4. Weekly Pattern
  const weeklyData = useMemo(() => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const data = days.map(day => ({ day, revenue: 0, categories: {} as Record<string, number> }));

    completedSales.forEach(sale => {
      const date = sale.timestamp?.toDate();
      if (!date) return;
      const dayIdx = date.getDay();
      data[dayIdx].revenue += sale.totalAmount;
      
      sale.items?.forEach((item: any) => {
        const p = products.find(prod => prod.id === item.id);
        const cat = p?.category || '기타';
        data[dayIdx].categories[cat] = (data[dayIdx].categories[cat] || 0) + (item.price * item.quantity);
      });
    });

    return data;
  }, [completedSales, products]);

  // 5. ATV Trend (Average Transaction Value)
  const atvTrend = useMemo(() => {
    const dailyMap: Record<string, { revenue: number, count: number }> = {};
    
    completedSales.forEach(sale => {
      const date = sale.timestamp?.toDate();
      if (!date) return;
      const dateStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      if (!dailyMap[dateStr]) dailyMap[dateStr] = { revenue: 0, count: 0 };
      dailyMap[dateStr].revenue += sale.totalAmount;
      dailyMap[dateStr].count += 1;
    });

    return Object.entries(dailyMap).map(([date, data]) => ({
      date,
      atv: Math.round(data.revenue / data.count)
    })).reverse();
  }, [completedSales]);

  // 6. Cancellation/Refund Analysis
  const cancellationData = useMemo(() => {
    const cancelMap: Record<string, { name: string, count: number, amount: number }> = {};

    cancelledSales.forEach(sale => {
      sale.items?.forEach((item: any) => {
        if (!cancelMap[item.id]) {
          cancelMap[item.id] = { name: item.name, count: 0, amount: 0 };
        }
        cancelMap[item.id].count += item.quantity;
        cancelMap[item.id].amount += (item.price * item.quantity);
      });
    });

    return Object.values(cancelMap).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [cancelledSales]);

  // 7. Best Combination Analysis
  const combinationData = useMemo(() => {
    const pairs: Record<string, { count: number, names: [string, string], images: [string, string], ids: [string, string] }> = {};
    
    completedSales.forEach(sale => {
      const items = sale.items || [];
      if (items.length < 2) return;
      
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const id1 = items[i].id;
          const id2 = items[j].id;
          if (id1 === id2) continue;
          
          const key = [id1, id2].sort().join('_');
          if (!pairs[key]) {
            const p1 = products.find(p => p.id === id1);
            const p2 = products.find(p => p.id === id2);
            pairs[key] = { 
              count: 0, 
              names: [items[i].name, items[j].name],
              images: [p1?.imageUrl || '', p2?.imageUrl || ''],
              ids: [id1, id2]
            };
          }
          pairs[key].count += 1;
        }
      }
    });

    // Filter out combinations that already exist as a set
    const filteredPairs = Object.values(pairs).filter(pair => {
      const [id1, id2] = pair.ids;
      const existingSet = products.find(p => {
        if (!p.isSet || !p.components || p.components.length !== 2) return false;
        const compIds = p.components.map((c: any) => c.id);
        return compIds.includes(id1) && compIds.includes(id2);
      });
      return !existingSet;
    });

    return filteredPairs.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [completedSales, products]);

  // 8. Profit Margin Analysis
  const profitStats = useMemo(() => {
    let totalRevenue = 0;
    let totalProfit = 0;
    
    completedSales.forEach(sale => {
      totalRevenue += sale.totalAmount;
      let saleCost = 0;
      sale.items?.forEach((item: any) => {
        const p = products.find(prod => prod.id === item.id);
        saleCost += (p?.cost || 0) * item.quantity;
      });
      totalProfit += (sale.totalAmount - saleCost);
    });

    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const productMargins = products.map(p => {
      const margin = p.price > 0 ? ((p.price - (p.cost || 0)) / p.price) * 100 : 0;
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        cost: p.cost || 0,
        margin
      };
    }).sort((a, b) => b.margin - a.margin);

    return { totalRevenue, totalProfit, averageMargin, productMargins };
  }, [completedSales, products]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">분석 통계</h1>
          <p className="text-slate-500">실시간 판매 데이터를 기반으로 최적화된 상품 전략과 운영 인사이트를 제공합니다.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm self-start">
            {(['7d', '30d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  dateRange === range ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {range === '7d' ? '최근 7일' : range === '30d' ? '최근 30일' : '전체'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 8. Profit Margin Analysis */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Percent className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">순이익률 분석</h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">평균 순이익률</p>
              <p className="text-2xl font-display font-black text-emerald-600">{profitStats.averageMargin.toFixed(1)}%</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-slate-400 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="pb-2">상품명</th>
                    <th className="pb-2 text-right">판매가</th>
                    <th className="pb-2 text-right">원가</th>
                    <th className="pb-2 text-right">이익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profitStats.productMargins.map(p => (
                    <tr key={p.id} className="group">
                      <td className="py-3 font-medium text-slate-700">{p.name}</td>
                      <td className="py-3 text-right text-slate-500">{formatCurrency(p.price)}</td>
                      <td className="py-3 text-right text-slate-500">{formatCurrency(p.cost)}</td>
                      <td className="py-3 text-right">
                        <span className={cn(
                          "font-bold",
                          p.margin >= 50 ? "text-emerald-600" :
                          p.margin >= 30 ? "text-blue-600" :
                          p.margin >= 15 ? "text-amber-600" : "text-red-600"
                        )}>
                          {p.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* 1. Hourly Revenue/Profit */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">시간대별 수익</h3>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} tickFormatter={(v: number) => `${v/10000}만`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                <Area type="monotone" dataKey="revenue" name="매출액" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" name="순이익" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* 7. Best Combination Analysis */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-50 text-pink-600 rounded-xl">
                <Heart className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">찰떡궁합 상품 분석</h3>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-slate-500 mb-4">함께 구매되는 빈도가 높은 상품 조합입니다. 세트 메뉴 구성에 활용해 보세요!</p>
            {combinationData.length > 0 ? (
              <div className="space-y-3">
                {combinationData.map((pair, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-pink-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-3">
                        {pair.images.map((img, i) => (
                          <div key={i} className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden bg-slate-100 flex items-center justify-center">
                            {img ? (
                              <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Package className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{pair.names[0]} + {pair.names[1]}</p>
                        <p className="text-xs text-slate-500">동시 구매 횟수: {pair.count}회</p>
                      </div>
                    </div>
                    <div className="bg-pink-100 text-pink-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                      세트 추천
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 italic text-sm">
                충분한 조합 데이터가 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 2. Category Sales */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-50 text-pink-600 rounded-xl">
                <PieChartIcon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">카테고리별 판매 분석</h3>
            </div>
            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
              {(['revenue', 'profit', 'volume'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setCategoryView(view)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-bold transition-all",
                    categoryView === view ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  {view === 'revenue' ? '매출' : view === 'profit' ? '순이익' : '판매량'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-96 w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey={categoryView}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={true}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [categoryView === 'volume' ? `${value}개` : formatCurrency(value), '']}
                />
                <Legend 
                  layout="horizontal" 
                  align="center" 
                  verticalAlign="bottom"
                  formatter={(value, entry: any) => {
                    const { payload } = entry;
                    const total = categoryData.reduce((acc, cur) => acc + cur[categoryView], 0);
                    const percent = total > 0 ? ((payload[categoryView] / total) * 100).toFixed(1) : 0;
                    return <span className="text-xs text-slate-600 font-medium">{value} ({percent}%)</span>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Smart Product Diagnosis */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">스마트 상품 진단</h3>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">🥇 효자 상품</p>
                <p className="text-xl font-display font-black text-amber-700">{abcData.filter(p => p.grade === 'A').length}개</p>
                <p className="text-[9px] text-amber-600 mt-1">매출의 70% 책임</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">🥈 양호 상품</p>
                <p className="text-xl font-display font-black text-emerald-700">{abcData.filter(p => p.grade === 'B').length}개</p>
                <p className="text-[9px] text-emerald-600 mt-1">매출의 20% 기여</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-2xl border border-yellow-100">
                <p className="text-[10px] font-bold text-yellow-600 uppercase mb-1">🥉 관심 필요</p>
                <p className="text-xl font-display font-black text-yellow-700">{abcData.filter(p => p.grade === 'C').length}개</p>
                <p className="text-[9px] text-yellow-600 mt-1">매출의 8% 차지</p>
              </div>
              <div className="p-3 bg-red-50 rounded-2xl border border-red-100">
                <p className="text-[10px] font-bold text-red-600 uppercase mb-1">❌ 정리 후보</p>
                <p className="text-xl font-display font-black text-red-700">{abcData.filter(p => p.grade === 'D').length}개</p>
                <p className="text-[9px] text-red-600 mt-1">하위 2%</p>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-slate-400 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="pb-2">상품명</th>
                    <th className="pb-2 text-right">매출액</th>
                    <th className="pb-2 text-center">진단 결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {abcData.map(p => (
                    <tr key={p.id} className="group">
                      <td className="py-2">
                        <div className="font-medium text-slate-700">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {p.grade === 'A' && "없어서 못 팔면 손해! 재고를 넉넉히 챙기세요!"}
                          {p.grade === 'B' && "꾸준히 잘 팔리고 있어요."}
                          {p.grade === 'C' && "판매가 뜸하네요. 세트로 묶어서 더 파는 건 어떨까요?"}
                          {p.grade === 'D' && "공간만 차지하고 있어요. 과감한 할인이나 단종 추천!"}
                        </div>
                      </td>
                      <td className="py-2 text-right font-display align-top">{formatCurrency(p.revenue)}</td>
                      <td className="py-2 text-center align-top">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black",
                          p.grade === 'A' ? "bg-amber-100 text-amber-700" :
                          p.grade === 'B' ? "bg-emerald-100 text-emerald-700" :
                          p.grade === 'C' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                        )}>
                          {p.grade === 'A' ? '🥇 A' : p.grade === 'B' ? '🥈 B' : p.grade === 'C' ? '🥉 C' : '❌ D'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 4. Weekly Pattern */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">요일별 매출 패턴 분석</h3>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} tickFormatter={(v: number) => `${v/10000}만`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '매출']}
                />
                <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40}>
                  <LabelList 
                    dataKey="revenue" 
                    position="top" 
                    formatter={(v: number) => v > 0 ? `${(v/10000).toFixed(1)}만` : ''} 
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#6366f1' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500 font-bold uppercase mb-2">요일별 주요 카테고리</p>
            <div className="flex flex-wrap gap-2">
              {weeklyData.map(d => {
                const topCat = Object.entries(d.categories).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
                return topCat ? (
                  <div key={d.day} className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-xs font-bold text-indigo-600 mr-2">{d.day}</span>
                    <span className="text-xs text-slate-700">{topCat[0]}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>

        {/* 5. ATV Trend */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">객단가(ATV) 추이</h3>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={atvTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '평균 결제액']}
                />
                <Line type="monotone" dataKey="atv" stroke="#10b981" strokeWidth={4} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6. Cancellation/Refund Analysis */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-xl">
                <RefreshCcw className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">취소/환불 분석 (Top 10)</h3>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cancellationData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={100} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => [name === 'amount' ? formatCurrency(value) : `${value}건`, name === 'amount' ? '취소 금액' : '취소 수량']}
                />
                <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20}>
                  <LabelList 
                    dataKey="count" 
                    position="right" 
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#f43f5e' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
