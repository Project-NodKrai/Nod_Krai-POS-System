import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Store as StoreIcon, ArrowRight, AlertCircle } from 'lucide-react';

export function SetupStore() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const cleanSubdomain = subdomain.toLowerCase().trim();
      
      // Check for uniqueness
      const storesRef = collection(db, 'stores');
      const q = query(storesRef, where('subdomain', '==', cleanSubdomain));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setError('이미 사용 중인 서브도메인입니다. 다른 이름을 선택해주세요.');
        setLoading(false);
        return;
      }

      await addDoc(collection(db, 'stores'), {
        ownerId: user.uid,
        name,
        subdomain: cleanSubdomain,
        createdAt: serverTimestamp(),
      });
      
      // Redirect to subdomain after creation
      window.location.href = `https://${cleanSubdomain}.pos.n-e.kr`;
    } catch (error) {
      console.error('Store setup failed', error);
      setError('매장 설정 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl mb-4">
            <StoreIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900">매장 설정하기</h1>
          <p className="text-slate-500 mt-2">NodKrai POS를 시작하기 위해 매장 정보를 입력해주세요.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-600 animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">매장 이름</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 카페 넥스"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">서브도메인 설정</label>
            <div className="flex items-center">
              <input
                type="text"
                required
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder="my-store"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
              <span className="bg-slate-100 border border-l-0 border-slate-300 px-3 py-2 rounded-r-lg text-slate-500 text-sm">
                .pos.n-e.kr
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">영문, 숫자, 하이픈(-)만 사용 가능합니다.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {loading ? '설정 중...' : '시작하기'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
