import { useState } from 'react';
import { LoginView } from './components/features/auth/LoginView';
import { MainApp } from './components/MainApp';
import { ThemeProvider } from './context/ThemeContext';

function AppContent() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [user, setUser] = useState<{ name: string; server: string } | null>(null);

  const handleConnect = (name: string, server: string) => {
    setUser({ name, server });
    setView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setView('landing');
  };

  return (
    <>
      {view === 'landing' ? (
        <LoginView onConnect={handleConnect} />
      ) : (
        user && <MainApp user={user} onLogout={handleLogout} />
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
