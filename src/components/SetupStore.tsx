import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Store as StoreIcon, ArrowRight } from 'lucide-react';

export function SetupStore() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Check if subdomain is already taken
      const q = query(collection(db, 'stores'), where('subdomain', '==', subdomain.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert('이미 사용 중인 서브도메인입니다. 다른 이름을 입력해주세요.');
        return;
      }

      await addDoc(collection(db, 'stores'), {
        ownerId: user.uid,
        name,
        subdomain: subdomain.toLowerCase(),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Store setup failed', error);
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
                /kiosk/{subdomain || '...'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              키오스크 주소: {window.location.origin}/#/kiosk/{subdomain || 'my-store'}
            </p>
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
