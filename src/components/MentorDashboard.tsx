import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  updateDoc,
  increment,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  MessageSquare, 
  ShieldCheck, 
  TrendingUp,
  Cpu,
  Sparkles,
  Send
} from 'lucide-react';
import { addKarma, KARMA_REWARDS } from '../lib/karma';

interface Question {
  id: string;
  title: string;
  content: string;
  anonymousHandle: string;
  category: string;
  authorId: string;
}

interface UserProfile {
  uid: string;
  anonymousHandle: string;
  role: 'student' | 'mentor';
  expertise?: string[];
}

export default function MentorDashboard({ userProfile }: { userProfile: UserProfile }) {
  const [relevantQuestions, setRelevantQuestions] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEntryToast, setShowEntryToast] = useState(false);
  const [activeTab, setActiveTab] = useState<'focused' | 'global'>('focused');
  const [globalQuestions, setGlobalQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (!userProfile.expertise || userProfile.expertise.length === 0) return;

    // Fetch questions matching mentor expertise categories
    const qFocused = query(
      collection(db, 'questions'), 
      where('category', 'in', userProfile.expertise)
    );

    const unsubFocused = onSnapshot(qFocused, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setRelevantQuestions(data);
      if (data.length > 0) {
        setShowEntryToast(true);
        setTimeout(() => setShowEntryToast(false), 5000);
      }
    });

    // Fetch global questions for moderation
    const qGlobal = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
    const unsubGlobal = onSnapshot(qGlobal, (snap) => {
      setGlobalQuestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    });

    return () => {
      unsubFocused();
      unsubGlobal();
    };
  }, [userProfile.expertise]);

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion || !answer || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'answers'), {
        questionId: selectedQuestion.id,
        content: answer,
        authorId: userProfile.uid,
        authorRole: 'mentor',
        authorName: 'Faculty Mentor',
        isVerified: true,
        createdAt: serverTimestamp()
      });

      // Mark question as answered or verified
      await updateDoc(doc(db, 'questions', selectedQuestion.id), {
        hasVerifiedAnswer: true
      });

      // Reward mentor
      await addKarma(userProfile.uid, KARMA_REWARDS.MENTOR_VERIFIED_ANSWER);

      setAnswer('');
      setSelectedQuestion(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <AnimatePresence>
        {showEntryToast && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute -top-12 right-0 bg-saffron text-black px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xl z-20"
          >
            <Sparkles className="w-3 h-3 fill-black/20" />
            <span className="text-[10px] font-bold uppercase tracking-widest">System Signal: {relevantQuestions.length} New Inquiries Matched</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="p-8 rounded-3xl bg-white/[0.02] border border-glass-border">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-saffron/10 border border-saffron/20 flex items-center justify-center text-saffron">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-serif text-3xl font-light">Mentor Command</h2>
            <p className="stat-label">Faculty Dashboard • {userProfile.expertise?.join(', ')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
            <span className="stat-label">Pending Inquiries</span>
            <div className="text-3xl font-serif mt-1">{relevantQuestions.length}</div>
          </div>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
            <span className="stat-label">Verified Impacts</span>
            <div className="text-3xl font-serif mt-1">24</div>
          </div>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
            <span className="stat-label">Curiosity Matched</span>
            <div className="text-3xl font-serif mt-1">98%</div>
          </div>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex gap-4 border-b border-white/5 pb-4">
        <button 
          onClick={() => setActiveTab('focused')}
          className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${activeTab === 'focused' ? 'bg-saffron text-black shadow-lg shadow-saffron/20' : 'text-zinc-500 hover:text-white'}`}
        >
          Specialized Inquiries
        </button>
        <button 
          onClick={() => setActiveTab('global')}
          className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${activeTab === 'global' ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-500 hover:text-white'}`}
        >
          Global Moderation
        </button>
      </div>

      <div className="space-y-4">
        <span className="stat-label mb-2 block">
          {activeTab === 'focused' ? 'Prioritized for your Expertise' : 'Recent Community Pulse'}
        </span>
        {(activeTab === 'focused' ? relevantQuestions : globalQuestions).length === 0 ? (
          <div className="py-12 text-center border border-dashed border-white/10 rounded-2xl">
            <p className="text-sm text-zinc-500 font-light italic">No urgent inquiries found.</p>
          </div>
        ) : (
          (activeTab === 'focused' ? relevantQuestions : globalQuestions).map(q => (
            <div 
              key={q.id}
              onClick={() => setSelectedQuestion(q)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer ${selectedQuestion?.id === q.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
            >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> {q.anonymousHandle.toUpperCase()}
                  </span>
                  <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded italic">{q.category}</span>
                </div>
                <h4 className="font-serif text-lg mb-1">{q.title}</h4>
                <p className="text-xs text-accent line-clamp-1">{q.content}</p>
              </div>
            ))
          )}
        </div>

      <AnimatePresence>
        {selectedQuestion && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="p-8 rounded-3xl bg-white/5 border border-white/10"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-xl">Provide Faculty Insight</h3>
              <button 
                onClick={() => setSelectedQuestion(null)}
                className="text-xs text-zinc-500 uppercase tracking-widest hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mb-6 p-4 bg-black/20 rounded-xl italic text-sm text-zinc-400">
              "{selectedQuestion.content}"
            </div>

            <form onSubmit={submitAnswer}>
              <textarea 
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Share your structured guidance. Reference curriculum where possible."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-light focus:outline-none focus:border-saffron/40 transition-all min-h-[150px]"
              />
              <div className="flex justify-between items-center mt-6">
                <div className="flex items-center gap-2 text-saffron/60 text-[10px] font-mono">
                  <ShieldCheck className="w-3 h-3" /> VERIFIED BADGE WILL BE APPLIED
                </div>
                <button 
                  disabled={isSubmitting || !answer}
                  className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-all text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  <Send className="w-3 h-3" /> Publish Verification
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
