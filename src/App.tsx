/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { Navbar } from './components/Navbar';
import { SetupStore } from './components/SetupStore';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { POSSeller } from './components/POSSeller';
import { POSKiosk } from './components/POSKiosk';
import { Settings } from './components/Settings';
import { Analytics } from './components/Analytics';
import { LogIn, Store as StoreIcon } from 'lucide-react';
import { auth, db } from './firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { cn } from './lib/utils';
import { HashRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';

function KioskWrapper() {
  const { subdomain } = useParams();
  const [store, setStore] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchStore() {
      if (!subdomain) return;
      const q = query(collection(db, 'stores'), where('subdomain', '==', subdomain.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setStore({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
      setLoading(false);
    }
    fetchStore();
  }, [subdomain]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">키오스크 로딩 중...</p>
      </div>
    </div>
  );
  
  if (!store) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">매장을 찾을 수 없습니다</h2>
        <p className="text-slate-500">주소가 정확한지 확인해주세요.</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden">
      <POSKiosk storeOverride={store} onExit={() => window.location.href = '/'} />
    </div>
  );
}

function AdminGuard() {
  const { user, store: authStore, loading } = useAuth();
  const { subdomain } = useParams();
  const [targetStore, setTargetStore] = React.useState<any>(null);
  const [fetchingStore, setFetchingStore] = React.useState(true);

  React.useEffect(() => {
    async function checkStore() {
      if (!subdomain) return;
      
      // If the current authStore matches the subdomain, we're good
      if (authStore && authStore.subdomain === subdomain.toLowerCase()) {
        setTargetStore(authStore);
        setFetchingStore(false);
        return;
      }

      // Otherwise, fetch store by subdomain to check ownership
      const q = query(collection(db, 'stores'), where('subdomain', '==', subdomain.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setTargetStore({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
      setFetchingStore(false);
    }
    checkStore();
  }, [subdomain, authStore]);

  if (loading || fetchingStore) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user) return <Navigate to="/" replace />;

  if (!targetStore) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">매장을 찾을 수 없습니다</h2>
        <p className="text-slate-500">주소가 정확한지 확인해주세요.</p>
      </div>
    </div>
  );

  // Security Check: ownerId must match current user's UID
  if (targetStore.ownerId !== user.uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">접근 권한이 없습니다</h2>
          <p className="text-slate-500 mb-6">해당 매장의 관리자 계정으로 로그인해주세요.</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return <AppContent />;
}

function AppContent() {
  const { user, store, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { subdomain } = useParams();

  React.useEffect(() => {
    if (!loading && user && (location.pathname === '/' || location.pathname === '')) {
      if (store) {
        navigate(`/admin/${store.subdomain}/dashboard`, { replace: true });
      }
    }
  }, [user, store, loading, navigate, location]);

  // If we're at /admin/:subdomain without a sub-path, redirect to dashboard
  React.useEffect(() => {
    if (subdomain && (location.pathname === `/admin/${subdomain}` || location.pathname === `/admin/${subdomain}/`)) {
      navigate(`/admin/${subdomain}/dashboard`, { replace: true });
    }
  }, [subdomain, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">NodKrai POS 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="bg-indigo-600 p-4 rounded-3xl shadow-xl shadow-indigo-200">
              <StoreIcon className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-display font-bold tracking-tight text-slate-900">NodKrai POS</h1>
            <p className="text-slate-500 text-lg">스마트한 올인원 POS 시스템</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">시작하기</h2>
              <p className="text-sm text-slate-500">구글 계정으로 간편하게 로그인하고 사용해보세요.</p>
            </div>
            <button 
              onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
              className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <LogIn className="w-6 h-6" />
              Google로 로그인
            </button>
          </div>
          
          <p className="text-slate-400 text-sm">
            로그인 시 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <>
        <Navbar />
        <SetupStore />
      </>
    );
  }

  const isKioskMode = location.pathname.includes('/kiosk/');

  return (
    <div className="min-h-screen bg-slate-50">
      {!isKioskMode && <Navbar />}
      <main className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8",
        isKioskMode && "max-w-none px-0 py-0 h-screen"
      )}>
        <Routes>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="product" element={<Inventory />} />
          <Route path="POS" element={<POSSeller />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="setting" element={<Settings />} />
          <Route path="/" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/kiosk/:subdomain" element={<KioskWrapper />} />
          <Route path="/admin/:subdomain/*" element={<AdminGuard />} />
          <Route path="/*" element={<AppContent />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
