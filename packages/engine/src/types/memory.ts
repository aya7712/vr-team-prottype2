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
  // 由来ファイルパス（'preset'のみ、data-design.md memory_preset_cache.raw_md_path用）。
  // 'session'由来（会話中に生成された記憶）はファイルを持たないためundefined。
  sourcePath?: string;
}
