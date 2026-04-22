import { doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type UserLevel = 'Newcomer' | 'Seeker' | 'Scholar' | 'Pioneer';

export const KARMA_THRESHOLDS: Record<UserLevel, number> = {
  'Newcomer': 0,
  'Seeker': 100,
  'Scholar': 500,
  'Pioneer': 1000
};

export function getLevelFromKarma(karma: number): UserLevel {
  if (karma >= KARMA_THRESHOLDS.Pioneer) return 'Pioneer';
  if (karma >= KARMA_THRESHOLDS.Scholar) return 'Scholar';
  if (karma >= KARMA_THRESHOLDS.Seeker) return 'Seeker';
  return 'Newcomer';
}

export const KARMA_REWARDS = {
  POST_QUESTION: 10,
  POST_ANSWER: 15,
  VOTE_HELPFUL: 2,
  RECEIVE_UPVOTE: 5,
  MENTOR_VERIFIED_ANSWER: 100
};

export async function addKarma(userId: string, amount: number) {
  if (!userId) return null;
  const userRef = doc(db, 'users', userId);
  
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      // Create profile if missing (resilience)
      const newKarma = amount;
      const newLevel = getLevelFromKarma(newKarma);
      await setDoc(userRef, {
        userId,
        karma: newKarma,
        levelName: newLevel,
        role: 'student',
        anonymousHandle: 'New Contributor'
      });
      return { karma: newKarma, level: newLevel };
    }

    const data = snap.data();
    const newKarma = (data.karma || 0) + amount;
    const newLevel = getLevelFromKarma(newKarma);
    
    await updateDoc(userRef, {
      karma: increment(amount),
      levelName: newLevel
    });
    return { karma: newKarma, level: newLevel };
  } catch (err) {
    console.error("Error adding karma:", err);
    return null;
  }
}
