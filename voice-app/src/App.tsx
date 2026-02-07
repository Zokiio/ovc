import { useState } from 'react';
import { LoginView } from './components/features/auth/LoginView';
import { MainApp } from './components/MainApp';
import { ThemeProvider } from './context/ThemeContext';
import { useConnection } from './hooks/useConnection';
import { useInitializeAudioDevices } from './hooks/useAudioDevices';
import { useConnectionStore } from './stores/connectionStore';

function AppContent() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [user, setUser] = useState<{ name: string; server: string } | null>(null);
  const {
    connect,
    disconnect,
    createGroup,
    joinGroup,
    leaveGroup,
    status,
  } = useConnection();
  const connectionError = useConnectionStore((s) => s.errorMessage);

  useInitializeAudioDevices();

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
        <LoginView
          onConnect={handleConnect}
          connect={connect}
          connectionStatus={status}
          connectionError={connectionError}
        />
      ) : (
        user && (
          <MainApp
            user={user}
            onLogout={handleLogout}
            disconnect={disconnect}
            createGroup={createGroup}
            joinGroup={joinGroup}
            leaveGroup={leaveGroup}
          />
        )
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
