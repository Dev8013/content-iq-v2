
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisType, HistoryItem, User } from './types';
import Header from './components/Header';
import Hero from './components/Hero';
import Analyzer from './components/Analyzer';
import Footer from './components/Footer';
import { GoogleDriveService } from './services/googleDriveService';

// Add global type declaration for window.google
declare global {
  interface Window {
    google: any;
  }
}

// Updated with the provided production Client ID
const GOOGLE_CLIENT_ID = "1079066491562-i89tqtte8hrmlgt8jumv3lm0qhhdd1t5.apps.googleusercontent.com";

const App: React.FC = () => {
  const [user, setUser] = useState<User>({
    name: '',
    email: '',
    picture: '',
    isLoggedIn: false,
    accessToken: ''
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  
  const tokenClientRef = useRef<any>(null);

  // Initialize Google Identity Services
  useEffect(() => {
    const savedUser = localStorage.getItem('ciq_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      if (parsed.accessToken) {
        GoogleDriveService.setToken(parsed.accessToken);
        syncFromDrive();
      }
    }

    const initGsi = () => {
      if (window.google) {
        // Token Client is required for accessing non-identity APIs like Google Drive
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file email profile',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error !== undefined) {
              console.error("GSI Error:", tokenResponse);
              return;
            }
            
            // Fetch User Info using the Access Token
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
            });
            const userInfo = await userInfoResponse.json();

            const newUser: User = {
              name: userInfo.name,
              email: userInfo.email,
              picture: userInfo.picture,
              isLoggedIn: true,
              accessToken: tokenResponse.access_token
            };

            setUser(newUser);
            GoogleDriveService.setToken(newUser.accessToken!);
            localStorage.setItem('ciq_user', JSON.stringify(newUser));
            syncFromDrive();
          },
        });
      }
    };

    // Load or wait for GSI script
    if (window.google) {
      initGsi();
    } else {
      const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (script) script.addEventListener('load', initGsi);
    }
  }, []);

  const syncFromDrive = async () => {
    setIsSyncing(true);
    try {
      const driveData = await GoogleDriveService.fetchHistoryFromDrive();
      if (driveData && driveData.length > 0) {
        setHistory(driveData);
        localStorage.setItem('ciq_history', JSON.stringify(driveData));
      }
    } catch (e) {
      console.warn("Drive sync suspended: re-authorization may be required.");
    } finally {
      setIsSyncing(false);
    }
  };

  const saveToHistory = async (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem('ciq_history', JSON.stringify(newHistory));

    if (user.isLoggedIn) {
      setIsSyncing(true);
      await GoogleDriveService.syncToDrive(item);
      setIsSyncing(false);
    }
  };

  const handleLogin = () => {
    if (tokenClientRef.current) {
      // Request a fresh access token from the user with specific Drive scopes
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } else {
      console.error("Google Auth Token Client not initialized yet.");
      // Minimal fallback alert if script loading is delayed
      alert("Authenticating... Please try again in a moment as the security layers initialize.");
    }
  };

  const handleLogout = useCallback(() => {
    if (user.accessToken && !user.accessToken.startsWith('G-DRIVE')) {
      window.google?.accounts.oauth2.revoke(user.accessToken, () => {
        console.log('Access token revoked');
      });
    }
    
    setUser({ name: '', email: '', picture: '', isLoggedIn: false, accessToken: '' });
    GoogleDriveService.setToken('');
    localStorage.removeItem('ciq_user');
    localStorage.removeItem('ciq_history');
    setHistory([]);
    setResetCounter(c => c + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [user.accessToken]);

  const handleHomeClick = () => {
    setResetCounter(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header 
        user={user} 
        onLogin={handleLogin} 
        onLogout={handleLogout} 
        isSyncing={isSyncing}
        onNavigate={scrollToSection}
        onHomeClick={handleHomeClick}
      />
      
      <main className="flex-grow">
        {!user.isLoggedIn ? (
          <Hero onStartClick={handleLogin} />
        ) : (
          <section id="workspace-section" className="py-24 px-6 max-w-[1440px] mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
              <div>
                <h2 className="text-5xl font-black uppercase tracking-tighter">Neural <span className="text-violet-500">Suite</span></h2>
                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {isSyncing ? 'Syncing Drive Buffer...' : 'Google Drive Status: Online'}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-4">
                 <div className="px-6 py-3 glass rounded-2xl border border-white/5 flex flex-col items-center min-w-[120px]">
                    <span className="text-[9px] font-black text-slate-500 uppercase mb-1">Archive Size</span>
                    <span className="text-xl font-black">{history.length} <span className="text-xs text-slate-600">/ 50</span></span>
                 </div>
              </div>
            </div>

            <Analyzer 
              key={`analyzer-${resetCounter}`}
              onResultSaved={saveToHistory} 
              history={history} 
              onClearHistory={() => {
                setHistory([]);
                localStorage.removeItem('ciq_history');
              }} 
            />
          </section>
        )}

        <section id="features-section" className="py-20 border-t border-white/5 bg-slate-950/50">
           <div className="max-w-7xl mx-auto px-6">
              <div className="text-center mb-16">
                 <h3 className="text-[10px] font-black text-violet-500 uppercase tracking-[0.4em] mb-4">Core Protocol</h3>
                 <h2 className="text-4xl font-black uppercase tracking-tighter">Analysis <span className="text-slate-500">Infrastructure</span></h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <CapabilityCard title="Visual Intelligence" desc="Generative imagery via Gemini-2.5-Flash for thumbnail prototyping." icon="🎨" />
                 <CapabilityCard title="Semantic Audit" desc="Deep context extraction and YouTube SEO scoring engine." icon="📺" />
                 <CapabilityCard title="Cloud Mirror" desc="Every log is automatically mirrored to your Google Drive Archive." icon="☁️" />
              </div>
           </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

const CapabilityCard = ({ title, desc, icon }: { title: string; desc: string; icon: string }) => (
  <div className="glass p-8 rounded-[2rem] border border-white/5 hover:border-violet-500/20 transition-all group">
    <div className="text-4xl mb-6 group-hover:scale-110 transition-transform">{icon}</div>
    <h4 className="text-lg font-black uppercase mb-3 tracking-tight">{title}</h4>
    <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
  </div>
);

export default App;
