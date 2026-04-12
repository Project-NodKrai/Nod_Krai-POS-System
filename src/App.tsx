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
import { LogIn, Store as StoreIcon } from 'lucide-react';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { cn } from './lib/utils';

function AppContent() {
  const { user, store, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Redirect to subdomain if logged in and store exists, and not already on that subdomain
  React.useEffect(() => {
    if (user && store && store.subdomain) {
      const currentHost = window.location.hostname;
      const targetSubdomain = `${store.subdomain}.pos.n-e.kr`;
      
      // Only redirect if we are on the main domain or a different subdomain
      // Note: In development/preview, we might not want to redirect if it breaks the environment
      // But based on user request "로그인하면 (서브도메인이름).pos.n-e.kr으로 링크가 되게끔 해줘"
      if (currentHost !== targetSubdomain && !currentHost.includes('run.app')) {
        window.location.href = `https://${targetSubdomain}`;
      }
    }
  }, [user, store]);

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
            <p className="text-slate-500 text-lg">스마트한 매장 관리를 위한 올인원 POS 시스템</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">시작하기</h2>
              <p className="text-sm text-slate-500">구글 계정으로 간편하게 로그인하고 매장을 관리하세요.</p>
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
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        <SetupStore />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {activeTab !== 'pos-kiosk' && (
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      )}
      <main className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8",
        activeTab === 'pos-kiosk' && "max-w-none px-0 py-0 h-screen"
      )}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'pos-seller' && <POSSeller />}
        {activeTab === 'pos-kiosk' && <POSKiosk onExit={() => setActiveTab('dashboard')} />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
