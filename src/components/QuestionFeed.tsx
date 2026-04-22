import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Sparkles, Cpu, ShieldCheck, Heart, Send, MessageCircle, Trash2 } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { addKarma, KARMA_REWARDS } from '../lib/karma';

interface Answer {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: 'student' | 'mentor';
  isVerified: boolean;
  createdAt: any;
  karmaAwarded?: number;
}

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

export default function QuestionFeed({ questions, currentUserId, userProfile }: { questions: Question[], currentUserId?: string, userProfile: any }) {
  return (
    <div className="space-y-8 pb-12">
      <AnimatePresence mode="popLayout">
        {questions.map((q, i) => (
          <QuestionItem key={q.id} q={q} i={i} currentUserId={currentUserId} userProfile={userProfile} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function QuestionItem({ q, i, currentUserId, userProfile }: { q: Question, i: number, currentUserId?: string, userProfile: any, key?: string }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLiking, setIsLiking] = useState(false);
  const [showAnswerInput, setShowAnswerInput] = useState(false);
  const [newAnswer, setNewAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (q.isOffline) return;
    const ansQ = query(
      collection(db, 'answers'),
      where('questionId', '==', q.id),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(ansQ, (snap) => {
      setAnswers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Answer)));
    });
    return () => unsub();
  }, [q.id, q.isOffline]);

  const verifyAnswer = async (ansId: string, authorId: string) => {
    if (userProfile?.role !== 'mentor' || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'answers', ansId), {
        isVerified: true
      });
      // Reward the author of the good answer
      await addKarma(authorId, KARMA_REWARDS.MENTOR_VERIFIED_ANSWER);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteQuestion = async () => {
    if (!currentUserId || isSubmitting) return;
    const canDelete = currentUserId === q.authorId || userProfile?.role === 'mentor';
    if (!canDelete) return;

    if (!window.confirm("Terminal Removal: Are you certain? This action is immutable.")) return;

    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'questions', q.id));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAnswer = async (ansId: string, authorId: string) => {
    if (!currentUserId || isSubmitting) return;
    const canDelete = currentUserId === authorId || userProfile?.role === 'mentor';
    if (!canDelete) return;

    if (!window.confirm("Remove Insight? This action is immutable.")) return;

    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'answers', ansId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const awardKarma = async (targetId: string, type: 'question' | 'answer', docId: string) => {
    if (!currentUserId || isLiking) return;
    setIsLiking(true);
    try {
      await addKarma(targetId, KARMA_REWARDS.RECEIVE_UPVOTE);
      await addKarma(currentUserId, KARMA_REWARDS.VOTE_HELPFUL);
      
      const collectionName = type === 'question' ? 'questions' : 'answers';
      await updateDoc(doc(db, collectionName, docId), {
        karmaAwarded: increment(1)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsLiking(false), 800);
    }
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !newAnswer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'answers'), {
        questionId: q.id,
        content: newAnswer,
        authorId: currentUserId,
        authorName: userProfile?.anonymousHandle || 'Anonymous Peer',
        authorRole: userProfile?.role || 'student',
        isVerified: false,
        createdAt: serverTimestamp(),
        karmaAwarded: 0
      });

      await addKarma(currentUserId, KARMA_REWARDS.POST_ANSWER);
      setNewAnswer('');
      setShowAnswerInput(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: i * 0.05 }}
      className={`border p-6 rounded-3xl transition-all ${q.isOffline ? 'bg-saffron/5 border-saffron/20 italic' : 'bg-white/[0.01] border-glass-border shadow-black/40 shadow-xl hover:border-glass-border/40 hover:bg-white/[0.02]'}`}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase font-bold tracking-widest text-electric font-mono">
            {q.anonymousHandle}
          </span>
          <div className="w-1 h-1 rounded-full bg-electric/20" />
          <span className="text-[10px] text-zinc-500 font-mono uppercase">
            {q.isOffline ? 'OFFLINE QUEUED' : q.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-saffron border border-saffron/20 px-2 py-0.5 rounded italic">
            {q.category}
          </span>
          {(currentUserId === q.authorId || userProfile?.role === 'mentor') && !q.isOffline && (
            <button 
              onClick={deleteQuestion}
              className="text-zinc-600 hover:text-red-500 transition-colors p-1"
              title="Moderate Question"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <h4 className="font-serif text-2xl font-light mb-3 tracking-tight">
        {q.title}
      </h4>
      
      <p className="text-accent text-sm font-light leading-relaxed mb-6 font-sans">
        {q.content}
      </p>

      {q.aiNudge && (
        <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 mb-6">
          <div className="flex items-center gap-1.5 mb-2 text-white/50">
            {q.isOffline ? <Cpu className="w-3 h-3 text-saffron" /> : <Sparkles className="w-3 h-3 text-electric" />}
            <span className="stat-label !text-white/30 tracking-tight">
              {q.isOffline ? 'Gemma Local Facilitator' : 'Gemini Cloud Facilitator'}
            </span>
          </div>
          <p className="text-xs italic text-accent leading-relaxed font-serif">
            "{q.aiNudge}"
          </p>
        </div>
      )}

      {/* Answers Section */}
      {answers.length > 0 && (
        <div className="mt-8 space-y-6 border-t border-white/5 pt-6">
          <span className="stat-label block mb-4">Community Insights ({answers.length})</span>
          {answers.map(ans => (
            <div key={ans.id} className="group relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-white/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold tracking-widest uppercase ${ans.authorRole === 'mentor' ? 'text-saffron' : 'text-electric/60'}`}>
                    {ans.authorName}
                  </span>
                  {ans.isVerified ? (
                    <span className="flex items-center gap-1.5 text-[10px] bg-saffron/20 border border-saffron/30 text-saffron px-2.5 py-1 rounded-full font-bold shadow-lg shadow-saffron/10">
                      <ShieldCheck className="w-3 h-3" /> FACULTY VERIFIED
                    </span>
                  ) : userProfile?.role === 'mentor' && (
                    <button 
                      onClick={() => verifyAnswer(ans.id, ans.authorId)}
                      disabled={isSubmitting}
                      className="text-[10px] bg-saffron text-black border border-saffron px-3 py-1 rounded-full hover:bg-white hover:border-white transition-all uppercase font-black tracking-widest flex items-center gap-1.5 shadow-xl shadow-saffron/20"
                    >
                      <ShieldCheck className="w-3 h-3" /> Verify Insight
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => awardKarma(ans.authorId, 'answer', ans.id)}
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-saffron transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Heart className="w-2.5 h-2.5" />
                    <span>{ans.karmaAwarded || 0}</span>
                  </button>
                  {(currentUserId === ans.authorId || userProfile?.role === 'mentor') && (
                    <button 
                      onClick={() => deleteAnswer(ans.id, ans.authorId)}
                      className="text-zinc-700 hover:text-red-500 transition-colors p-1 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-accent/80 font-light leading-relaxed">
                {ans.content}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => awardKarma(q.authorId, 'question', q.id)}
            disabled={isLiking}
            className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 transition-all ${isLiking ? 'text-saffron scale-110' : 'text-accent hover:text-white'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${isLiking || q.karmaAwarded ? 'fill-saffron text-saffron' : ''}`} /> 
            <span>{isLiking ? 'Awarding...' : (q.karmaAwarded || 0) + ' Karma'}</span>
          </button>
          
          <button 
            onClick={() => setShowAnswerInput(!showAnswerInput)}
            className="text-accent text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 hover:text-white transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {showAnswerInput ? 'Cancel' : 'Share Insight'}
          </button>
        </div>

        <button className="text-white text-[10px] font-bold tracking-widest uppercase flex items-center gap-1 hover:gap-2 transition-all group">
          Join Thread <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <AnimatePresence>
        {showAnswerInput && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={submitAnswer}
            className="mt-6 pt-6 border-t border-white/5 overflow-hidden"
          >
            <textarea 
              value={newAnswer}
              onChange={e => setNewAnswer(e.target.value)}
              placeholder="Break the silence. Your insight matters..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-xs font-light focus:outline-none focus:border-electric/30 transition-all min-h-[100px] resize-none"
            />
            <div className="flex justify-end mt-3">
              <button 
                disabled={isSubmitting || !newAnswer.trim()}
                className="bg-electric text-black px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-electric/80 transition-all disabled:opacity-50"
              >
                <Send className="w-3 h-3" /> Post Interaction
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
