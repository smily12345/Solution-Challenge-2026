import { get, set, del, keys } from 'idb-keyval';

export interface QueuedQuestion {
  id: string;
  title: string;
  content: string;
  handle: string;
  category: string;
  nudge: string;
  timestamp: number;
}

const QUEUE_KEY = 'techtarak_offline_queue';

export async function addToQueue(question: Omit<QueuedQuestion, 'id' | 'timestamp'>) {
  const queue: QueuedQuestion[] = (await get(QUEUE_KEY)) || [];
  const newEntry: QueuedQuestion = {
    ...question,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  queue.push(newEntry);
  await set(QUEUE_KEY, queue);
  return newEntry;
}

export async function getQueue(): Promise<QueuedQuestion[]> {
  return (await get(QUEUE_KEY)) || [];
}

export async function removeFromQueue(id: string) {
  const queue: QueuedQuestion[] = (await get(QUEUE_KEY)) || [];
  const filtered = queue.filter(item => item.id !== id);
  await set(QUEUE_KEY, filtered);
}

export async function clearQueue() {
  await del(QUEUE_KEY);
}
