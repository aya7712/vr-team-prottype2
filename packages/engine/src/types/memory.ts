export type MemorySource = 'preset' | 'session';

export interface MemoryItem {
  id: string;
  source: MemorySource;
  owner: string;
  participants: string[];
  occurredAt?: string | null;
  occurredEra?: string | null;
  location?: string | null;
  summary: string;
  tags: string[];
  importance: number;
  emotion?: string | null;
  shareable: boolean;
  related?: string[] | null;
  body?: string;
}
