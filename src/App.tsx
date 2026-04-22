import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  limit
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Plus, 
  Sparkles, 
  User as UserIcon, 
  Send, 
  ChevronRight,
  Shield,
  Lightbulb,
  Search,
  WifiOff,
  CloudUpload,
  Zap,
  Globe,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  GraduationCap
} from 'lucide-react';
import { db, auth } from './lib/firebase';
import { analyzeQuestion } from './lib/gemini';
import { loadGemmaModel, localTriage, generateLocalNudge } from './lib/gemma';
import { addToQueue, getQueue, removeFromQueue } from './lib/offlineQueue';
import { addKarma, KARMA_REWARDS, UserLevel, getLevelFromKarma } from './lib/karma';
import Sidebar from './components/Sidebar';
import QuestionFeed from './components/QuestionFeed';
import MentorDashboard from './components/MentorDashboard';

// --- Types ---
interface UserProfile {
  uid: string;
  anonymousHandle: string;
  karma: number;
  levelName: UserLevel;
  role: 'student' | 'mentor';
  expertise?: string[];
}

// --- Types ---
interface Question {
  id: string;
  title: string;
  content: string;
  anonymousHandle: string;
  authorId: string;
  category: string;
  createdAt: any;
  aiNudge?: string;
  isOffline?: boolean;
  karmaAwarded?: number;
}

const ADJECTIVES = ['Silent', 'Curious', 'Brave', 'Thoughtful', 'Keen', 'Bright', 'Humble'];
const NOUNS = ['Seeker', 'Sage', 'Scholar', 'Mind', 'Spirit', 'Observer', 'Creator'];

const getRandomHandle = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
};

const EXPERTISE_CATEGORIES = ['Conceptual', 'Exam/Academic', 'Practical', 'Career', 'Tech Stack', 'Research'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [handle, setHandle] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  const [showMentorDashboard, setShowMentorDashboard] = useState(false);
  const [connectionStatusNote, setConnectionStatusNote] = useState<string | null>(null);
  const [unreadMentorCount, setUnreadMentorCount] = useState(0);
  const [lastDashboardVisit, setLastDashboardVisit] = useState<number>(Date.now());
  const [isRoleSwitching, setIsRoleSwitching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [topContributors, setTopContributors] = useState<any[]>([]);
  
  // New Question Form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const toggleRole = async () => {
    if (!user || !userProfile || isRoleSwitching) return;
    
    if (userProfile.role === 'student') {
      // Trigger onboarding modal for expertise selection
      setSelectedExpertise([]);
      setShowRoleModal(true);
    } else {
      // Revert to student
      setIsRoleSwitching(true);
      setConnectionStatusNote('Transitioning to Student identity...');
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          role: 'student',
          expertise: []
        });
        setShowMentorDashboard(false);
        setConnectionStatusNote('Identity Reverted. Welcome back, Scholar.');
      } catch (err) {
        console.error(err);
        setConnectionStatusNote('Identity lock malfunctioned. Try again.');
      } finally {
        setIsRoleSwitching(false);
        setTimeout(() => setConnectionStatusNote(null), 3000);
      }
    }
  };

  const confirmMentorRole = async () => {
    if (!user || selectedExpertise.length === 0 || isRoleSwitching) return;
    
    setIsRoleSwitching(true);
    setConnectionStatusNote('Ascending to Mentor Sanctum...');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: 'mentor',
        expertise: selectedExpertise
      });
      setShowRoleModal(false);
      setConnectionStatusNote('Access Granted. Guide the next generation.');
    } catch (err) {
      console.error(err);
      setConnectionStatusNote('Ascension failed. Verify system nexus.');
    } finally {
      setIsRoleSwitching(false);
      setTimeout(() => setConnectionStatusNote(null), 3000);
    }
  };

  // Sync function
  const syncOfflineQueue = useCallback(async (currentUser: User) => {
    if (!navigator.onLine) return;
    const queue = await getQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
      try {
        let finalNudge = item.nudge;
        let finalCategory = item.category;

        // Attempt to regenerate with higher quality cloud model if connectivity is restored
        try {
          const freshAnalysis = await analyzeQuestion(item.title, item.content);
          if (freshAnalysis.nudge) {
            finalNudge = freshAnalysis.nudge;
            finalCategory = freshAnalysis.category;
          }
        } catch (confError) {
          console.warn("Retrying cloud analysis during sync failed, using local fallback.", confError);
          // Fallback is already set to item.nudge / item.category
        }

        await addDoc(collection(db, 'questions'), {
          title: item.title,
          content: item.content,
          anonymousHandle: item.handle,
          authorId: currentUser.uid,
          category: finalCategory,
          aiNudge: finalNudge,
          createdAt: serverTimestamp(),
          isAiFacilitated: true,
          syncedFromOffline: true,
          karmaAwarded: 0
        });
        
        // Reward for syncing back and contributing
        await addKarma(currentUser.uid, KARMA_REWARDS.POST_QUESTION);
        
        await removeFromQueue(item.id);
      } catch (err) {
        console.error("Sync error:", err);
      }
    }
    const updatedQueue = await getQueue();
    setOfflineQueueCount(updatedQueue.length);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Real-time user profile
        const userRef = doc(db, 'users', u.uid);
        const unsubProfile = onSnapshot(userRef, async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const profile: UserProfile = {
              uid: u.uid,
              anonymousHandle: data.anonymousHandle,
              karma: data.karma || 0,
              levelName: data.levelName || 'Newcomer',
              role: data.role || 'student',
              expertise: data.expertise || []
            };
            setUserProfile(profile);
            setHandle(data.anonymousHandle);
          } else {
            const newHandle = getRandomHandle();
            const initialProfile = {
              userId: u.uid,
              anonymousHandle: newHandle,
              karma: 0,
              levelName: 'Newcomer' as UserLevel,
              role: 'student',
              expertise: []
            };
            await setDoc(userRef, initialProfile);
          }
        });

        syncOfflineQueue(u);
        return () => unsubProfile();
      } else {
        setUserProfile(null);
      }
    });

    const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
    const unsubQuestions = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(data);
    });

    // Leaderboard
    const topQ = query(collection(db, 'users'), orderBy('karma', 'desc'), limit(5));
    const unsubTop = onSnapshot(topQ, (snap) => {
      setTopContributors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const handleOnline = () => {
      setIsOnline(true);
      setConnectionStatusNote('Nexus Restored. Syncing contributions...');
      if (user) syncOfflineQueue(user);
      setTimeout(() => setConnectionStatusNote(null), 5000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionStatusNote('Connection Severed. Gemma Local active.');
      setTimeout(() => setConnectionStatusNote(null), 5000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial queue check
    getQueue().then(q => setOfflineQueueCount(q.length));

    return () => {
      unsubAuth();
      unsubQuestions();
      unsubTop();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, syncOfflineQueue]);

  // Load Gemma model on first modal open
  useEffect(() => {
    if (showPostModal && !isAnalyzing) {
      setModelLoading(true);
      loadGemmaModel((p) => setModelProgress(p))
        .then(() => setModelLoading(false))
        .catch(() => setModelLoading(false));
    }
  }, [showPostModal]);

  // Mentor Notification Logic
  useEffect(() => {
    if (userProfile?.role !== 'mentor' || !userProfile.expertise) {
      setUnreadMentorCount(0);
      return;
    }

    const relevant = questions.filter(q => {
      // If it's a Firestore doc, it has a createdAt.toDate()
      // If it's local/offline, it might have a mock toDate()
      if (!q.createdAt) return false;
      const qTime = (q.createdAt as any).toDate ? (q.createdAt as any).toDate().getTime() : 0;
      return userProfile.expertise?.includes(q.category) && qTime > lastDashboardVisit;
    });

    setUnreadMentorCount(relevant.length);
  }, [questions, userProfile, lastDashboardVisit]);

  const toggleDashboard = () => {
    if (!showMentorDashboard) {
      if (unreadMentorCount > 0) {
        setConnectionStatusNote(`Greetings Mentor. ${unreadMentorCount} new queries match your expertise.`);
      } else {
        setConnectionStatusNote("Welcome to the Sanctum. Peer discussions are currently synchronized.");
      }
      setTimeout(() => setConnectionStatusNote(null), 4000);
    } else {
      setLastDashboardVisit(Date.now());
    }
    setShowMentorDashboard(!showMentorDashboard);
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle || !newContent) return;

    setIsAnalyzing(true);
    try {
      if (isOnline) {
        // Cloud Path: Gemini
        const analysis = await analyzeQuestion(newTitle, newContent);
        await addDoc(collection(db, 'questions'), {
          title: newTitle,
          content: newContent,
          anonymousHandle: handle,
          authorId: user.uid,
          category: analysis.category,
          aiNudge: analysis.nudge,
          createdAt: serverTimestamp(),
          isAiFacilitated: true,
          karmaAwarded: 0
        });
        
        await addKarma(user.uid, KARMA_REWARDS.POST_QUESTION);
      } else {
        // Offline Path: Gemma On-Device
        const category = await localTriage(newTitle, newContent);
        const nudge = await generateLocalNudge(newContent);
        
        await addToQueue({
          title: newTitle,
          content: newContent,
          handle: handle,
          category,
          nudge
        });
        
        const currentQueue = await getQueue();
        setOfflineQueueCount(currentQueue.length);
        
        // Optimistic update for UI (temporary)
        setQuestions(prev => [{
          id: 'offline-' + Date.now(),
          title: newTitle,
          content: newContent,
          anonymousHandle: handle,
          authorId: user.uid,
          category,
          aiNudge: nudge,
          createdAt: { toDate: () => new Date() },
          isOffline: true
        }, ...prev]);
      }

      setNewTitle('');
      setNewContent('');
      setShowPostModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-white font-sans">
      {/* Connection Notification */}
      <AnimatePresence>
        {connectionStatusNote && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none"
          >
            <div className={`px-6 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 ${
              isOnline 
                ? 'bg-electric/20 border-electric/40 text-electric shadow-electric/10' 
                : 'bg-saffron/20 border-saffron/40 text-saffron shadow-saffron/10'
            }`}>
              {isOnline ? <Globe className="w-4 h-4 animate-pulse" /> : <WifiOff className="w-4 h-4" />}
              <span className="text-xs font-bold uppercase tracking-widest">{connectionStatusNote}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-20 flex items-center justify-between px-10 border-b border-glass-border bg-black/60 shadow-lg shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl border border-saffron flex items-center justify-center font-bold text-lg text-saffron shadow-[0_0_15px_rgba(255,153,51,0.3)]">T</div>
          <span className="font-serif text-3xl tracking-tight uppercase bg-gradient-to-r from-white to-accent bg-clip-text text-transparent">TechTarak</span>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-6 mr-4">
            <div className={`flex flex-col items-end text-right px-4 py-2 rounded-2xl border transition-all duration-700 ${
              isOnline 
                ? 'bg-transparent border-transparent' 
                : 'bg-saffron/10 border-saffron/40 shadow-[0_0_20px_rgba(255,145,0,0.1)]'
            }`}>
              <span className={`stat-label ${!isOnline ? '!text-saffron' : ''}`}>System Nexus</span>
              <span className={`text-[10px] font-mono flex items-center gap-1.5 ${isOnline ? 'text-electric' : 'text-saffron font-bold'}`}>
                {isOnline ? (
                  <><Globe className="w-3 h-3" /> CLOUD-ACTIVE</>
                ) : (
                  <>
                    <motion.div 
                      animate={{ opacity: [1, 0.4, 1] }} 
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <WifiOff className="w-3 h-3" />
                    </motion.div>
                    OFFLINE (GEMMA LOCAL)
                  </>
                )}
              </span>
            </div>
            
            <AnimatePresence>
              {offlineQueueCount > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-start px-4 py-2 border border-saffron/30 rounded-2xl bg-saffron/5 shadow-[0_0_15px_rgba(255,145,0,0.05)]"
                >
                  <span className="stat-label !text-saffron font-bold">Sync Pending</span>
                  <span className="text-[10px] font-mono flex items-center gap-1.5 text-saffron/90">
                    <CloudUpload className="w-3.5 h-3.5" /> {offlineQueueCount} Contributions
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {user ? (
            <div className="flex items-center gap-6">
              <button 
                onClick={toggleRole}
                className="hidden sm:flex items-center gap-2 group transition-all"
              >
                <div className={`p-1.5 rounded-lg border transition-all ${userProfile?.role === 'mentor' ? 'bg-saffron/10 border-saffron/30 text-saffron shadow-[0_0_10px_rgba(255,153,51,0.2)]' : 'bg-white/5 border-white/10 text-white/40 group-hover:bg-electric/10 group-hover:border-electric/30 group-hover:text-electric'}`}>
                  {userProfile?.role === 'mentor' ? <GraduationCap className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] uppercase font-bold tracking-tighter opacity-40">Switch Role</span>
                  <span className={`text-[9px] uppercase font-mono ${userProfile?.role === 'mentor' ? 'text-saffron' : 'text-electric'}`}>{userProfile?.role}</span>
                </div>
              </button>

              <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-glass-border">
                <UserIcon className="w-4 h-4 text-electric" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-white">{handle}</span>
                  <span className="text-[8px] text-saffron uppercase font-bold">Lv. {userProfile?.levelName}</span>
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={login}
              className="bg-saffron text-black px-6 py-2 rounded-full text-xs font-bold hover:bg-saffron/80 transition-all uppercase tracking-wider shadow-lg shadow-saffron/20"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Navigation Bar */}
        <Sidebar 
          karma={userProfile?.karma || 0}
          levelName={userProfile?.levelName || 'Newcomer'}
          role={userProfile?.role || 'student'}
          expertise={userProfile?.expertise}
          onDashboardToggle={toggleDashboard}
          onToggleRole={toggleRole}
          showDashboard={showMentorDashboard}
          unreadCount={unreadMentorCount}
        />

        {/* Central Interaction Area */}
        <section className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-12">
          <div className="max-w-3xl mx-auto w-full">
            {showMentorDashboard && userProfile?.role === 'mentor' ? (
              <MentorDashboard userProfile={userProfile} />
            ) : (
              <>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-12"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-0.5 rounded bg-white/10 text-[8px] font-bold tracking-tighter uppercase border border-white/5">Solution Challenge 2026</span>
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="text-[8px] text-accent font-medium uppercase tracking-widest">98% SDG IMPACT SCORE</span>
                  </div>
                  <h1 className="font-serif text-4xl sm:text-6xl leading-[1.1] mb-6 font-light">
                    Dare to learn. <br/>
                    <span className="text-accent italic">Break the silence.</span>
                  </h1>
                  
                  {/* Quick Input Box */}
                  <div className={`p-6 rounded-3xl border transition-all ${isOnline ? 'bg-input-box border-glass-border' : 'bg-saffron/5 border-saffron/20 shadow-xl shadow-saffron/5'}`}>
                    <textarea 
                      value={newContent}
                      onChange={e => setNewContent(e.target.value)}
                      className="bg-transparent w-full border-none outline-none text-xl font-light placeholder:text-zinc-700 resize-none font-sans"
                      placeholder={isOnline ? "What's on your mind? Gemini is listening..." : "Gemma is ready. Ask offline."}
                      rows={2}
                    ></textarea>
                    <div className="flex flex-wrap justify-between items-center mt-4 pt-4 border-t border-white/5 gap-4">
                      <div className="flex gap-4">
                        <span className="stat-label flex items-center gap-1 uppercase text-accent"># {handle}</span>
                        <span className={`stat-label flex items-center gap-1 uppercase italic ${isOnline ? 'text-electric' : 'text-saffron'}`}>
                          {isOnline ? <><Sparkles className="w-3 h-3" /> Cloud-AI</> : <><Cpu className="w-3 h-3" /> On-Device</>}
                        </span>
                      </div>
                      <button 
                        onClick={() => user ? setShowPostModal(true) : login()}
                        className="px-8 py-2.5 bg-saffron text-black text-xs font-bold rounded-xl hover:bg-saffron/80 transition-all active:scale-95 uppercase tracking-widest shadow-lg shadow-saffron/20"
                      >
                        ASK INCOGNITO
                      </button>
                    </div>
                  </div>
                </motion.div>

                <div className="flex items-center justify-between mb-8">
                  <span className="stat-label">TechTarak Community Feed</span>
                  <span className="text-[10px] font-mono text-accent">{questions.length} CONTRIBUTIONS</span>
                </div>
                
                <QuestionFeed questions={questions} currentUserId={user?.uid} userProfile={userProfile} />
              </>
            )}
          </div>
        </section>

        {/* Right Sidebar: The Paradox Monitor */}
        <aside className="w-80 border-l border-glass-border hidden xl:flex flex-col p-8 bg-black/20">
          <div className="space-y-12">
            <div>
              <span className="stat-label">Your Standing</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-serif text-saffron">{userProfile?.karma || 0}</span>
                <span className="text-[10px] text-accent font-mono tracking-tighter uppercase italic">TOTAL KARMA</span>
              </div>
              <div className="w-full h-1 bg-zinc-800 mt-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-saffron transition-all duration-1000 shadow-[0_0_10px_rgba(255,145,0,0.5)]" 
                  style={{ width: `${Math.min((userProfile?.karma || 0) / 10, 100)}%` }}
                ></div>
              </div>
            </div>

            <div>
              <span className="stat-label">Top Scholars</span>
              <div className="mt-6 space-y-4">
                {topContributors.map((tc, idx) => (
                  <motion.div 
                    key={tc.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-white/20">0{idx + 1}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-accent group-hover:text-electric transition-colors">{tc.anonymousHandle}</span>
                        <span className="text-[8px] text-white/30 uppercase tracking-tighter">{tc.levelName}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-saffron">{tc.karma}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div>
              <span className="stat-label">Model Intelligence</span>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-accent uppercase font-mono">Gemma-IT</span>
                  <span className="text-[10px] text-green-500 font-mono font-bold tracking-widest">READY</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-accent uppercase font-mono">Gemini 1.5</span>
                  <span className={`text-[10px] font-mono font-bold tracking-widest ${isOnline ? 'text-green-500' : 'text-zinc-600'}`}>
                    {isOnline ? 'CONNECTED' : 'STANDBY'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <span className="stat-label block mb-2 text-zinc-500 uppercase tracking-tighter">SDG Achievement</span>
              <p className="text-xs italic font-light text-accent leading-relaxed font-serif">
                "Quality Education is built on the courage of students who refuse to remain silent."
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer Bar */}
      <footer className="h-12 border-t border-glass-border px-10 flex items-center justify-between text-[8px] sm:text-[10px] text-accent font-mono tracking-widest bg-black/40">
        <div className="flex items-center gap-2">
          <span className="flex w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
          <span>TECHTARAK_SESSION_LIVE</span>
        </div>
        <div className="flex gap-4 sm:gap-8">
          <span>SDG_GOAL: 4.0</span>
          <span>SILENCE_THRESHOLD: 0.00</span>
          <span>SYNC_ENGINE: {isOnline ? 'CLOUD' : 'LOCAL_GEMMA'}</span>
        </div>
        <span className="hidden sm:inline italic">2026_GOOGLE_SOLUTION_CHALLENGE</span>
      </footer>

      {/* Post Modal */}
      <AnimatePresence>
        {showPostModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPostModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0A0A0A] w-full max-w-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative z-10"
            >
              <form onSubmit={handlePost} className="p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className={`w-10 h-10 border rounded-xl flex items-center justify-center ${isOnline ? 'border-white/10' : 'border-orange-500/30 text-orange-500'}`}>
                    {isOnline ? <Lightbulb className="w-6 h-6" /> : <Cpu className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-serif text-2xl font-light">
                      {isOnline ? 'Post to Hub' : 'Save to Offline Queue'}
                    </h3>
                    <span className="stat-label !text-zinc-500 italic tracking-tight">
                      {isOnline ? 'Gemini 1.5 Cloud Processing' : 'Gemma On-Device Processing'}
                    </span>
                  </div>
                </div>

                {modelLoading && (
                  <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
                    <span className="stat-label block mb-2 font-mono">Waking up Gemma...</span>
                    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${modelProgress}%` }}
                        className="h-full bg-accent" 
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-6 text-white">
                  <div>
                    <label className="stat-label block mb-2">Subject Header</label>
                    <input 
                      required
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g., Quantum Physics Concept Doubt"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 placeholder:text-zinc-700 focus:outline-none focus:border-white/20 font-light font-sans"
                    />
                  </div>
                  <div>
                    <label className="stat-label block mb-2">The Inquiry</label>
                    <textarea 
                      required
                      value={newContent}
                      onChange={e => setNewContent(e.target.value)}
                      rows={5}
                      placeholder="Break your silence. No one will judge. AI will help phrase it right."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 placeholder:text-zinc-700 focus:outline-none focus:border-white/20 text-sm leading-relaxed font-light font-sans"
                    />
                  </div>
                </div>

                {!isOnline && (
                  <div className="mt-6 flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                    <WifiOff className="w-4 h-4 text-orange-400" />
                    <span className="text-[10px] text-orange-200 uppercase font-mono">You are offline. Your question will be processed locally and synced when you reconnect.</span>
                  </div>
                )}

                <div className="mt-10 flex items-center justify-end gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowPostModal(false)}
                    className="text-xs font-bold text-zinc-500 hover:text-white transition-colors tracking-widest uppercase"
                  >
                    Discard
                  </button>
                  <button 
                    disabled={isAnalyzing || modelLoading}
                    type="submit"
                    className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 disabled:opacity-50 transition-all text-xs uppercase tracking-widest shadow-lg shadow-white/5"
                  >
                    {isAnalyzing ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-spin text-zinc-900" />
                        {isOnline ? 'Triage Cloud...' : 'Triage Local...'}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> {isOnline ? 'Post Silently' : 'Store Offline'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Mentor Onboarding Modal */}
      <AnimatePresence>
        {showRoleModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRoleModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 w-full max-w-md rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative z-10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-saffron/10 border border-saffron/30 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(255,145,0,0.2)]">
                  <ShieldCheck className="w-10 h-10 text-saffron" />
                </div>
                <h3 className="font-serif text-3xl font-light mb-2">Apply as Mentor</h3>
                <p className="text-accent text-sm font-light mb-8 italic">"To teach is to learn twice." Choose your domains of guidance.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-10">
                {EXPERTISE_CATEGORIES.map(category => (
                  <button
                    key={category}
                    onClick={() => {
                      if (selectedExpertise.includes(category)) {
                        setSelectedExpertise(prev => prev.filter(c => c !== category));
                      } else {
                        setSelectedExpertise(prev => [...prev, category]);
                      }
                    }}
                    className={`p-3 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                      selectedExpertise.includes(category) 
                        ? 'bg-saffron text-black border-saffron shadow-lg shadow-saffron/20' 
                        : 'bg-white/5 border-white/5 text-accent hover:border-white/20'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 py-4 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  disabled={selectedExpertise.length === 0}
                  onClick={confirmMentorRole}
                  className="flex-1 bg-white text-black py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-30 shadow-xl"
                >
                  Verify Access
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
