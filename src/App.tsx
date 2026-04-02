import { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import Login from './components/Login';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<{ username: string; isDeveloper: boolean } | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('nursing_app_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user:", e);
        localStorage.removeItem('nursing_app_user');
      }
    }
    setIsAuthChecking(false);
  }, []);

  const handleLogin = (userData: { username: string; isDeveloper: boolean }) => {
    setUser(userData);
    localStorage.setItem('nursing_app_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('nursing_app_user');
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {user ? (
        <ChatInterface user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}
