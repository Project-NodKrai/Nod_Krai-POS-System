import React from 'react';
import { useAuth } from '../AuthContext';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { LogIn, LogOut, LayoutDashboard, ShoppingCart, Package, BarChart3, User, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const { user, store } = useAuth();
  const location = useLocation();

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const isActive = (path: string) => {
    return location.pathname.toLowerCase().endsWith(path.toLowerCase());
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link 
              to={store ? `/admin/${store.subdomain}/dashboard` : '/'}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span className="font-display font-bold text-xl tracking-tight">
                {store?.brandName || 'NodKrai POS'}
              </span>
            </Link>

            {user && store && (
              <div className="hidden md:flex items-center gap-1">
                <NavButton 
                  to={`/admin/${store.subdomain}/dashboard`}
                  active={isActive('/dashboard')} 
                  icon={<LayoutDashboard className="w-4 h-4" />}
                  label="대시보드"
                />
                <NavButton 
                  to={`/admin/${store.subdomain}/POS`}
                  active={isActive('/POS')} 
                  icon={<ShoppingCart className="w-4 h-4" />}
                  label="판매자 POS"
                />
                <NavButton 
                  to={`/kiosk/${store.subdomain}`}
                  active={false} 
                  icon={<User className="w-4 h-4" />}
                  label="키오스크"
                />
                <NavButton 
                  to={`/admin/${store.subdomain}/product`}
                  active={isActive('/product')} 
                  icon={<Package className="w-4 h-4" />}
                  label="제품"
                />
                <NavButton 
                  to={`/admin/${store.subdomain}/analytics`}
                  active={isActive('/analytics')} 
                  icon={<BarChart3 className="w-4 h-4" />}
                  label="분석 통계"
                />
                <NavButton 
                  to={`/admin/${store.subdomain}/setting`}
                  active={isActive('/setting')} 
                  icon={<SettingsIcon className="w-4 h-4" />}
                  label="설정"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{user.displayName}</p>
                  <p className="text-xs text-slate-500">{store?.name || '매장 미등록'}</p>
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full border border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                로그인
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavButton({ active, to, icon, label }: { active: boolean, to: string, icon: React.ReactNode, label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
        active 
          ? "bg-indigo-50 text-indigo-700" 
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
