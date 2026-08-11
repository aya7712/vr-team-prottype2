export type MemorySource = 'preset' | 'session';

export interface MemoryItem {
  id: string;
  source: MemorySource;
  owner: string;
  participants: string[];
  summary: string;
  tags: string[];
  importance: number;
  emotion?: string;
  shareable: boolean;
  body?: string;
}
