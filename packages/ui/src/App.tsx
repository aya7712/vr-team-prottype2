import { useEffect, useState } from 'react';
import type { CharacterSummary } from './api/client';
import { apiClient } from './api/client';
import { ConversationView } from './views/ConversationView';

function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function App() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);

  useEffect(() => {
    apiClient.listCharacters().then(setCharacters).catch(console.error);
  }, []);

  return (
    <div style={{ padding: 'var(--space-3)' }}>
      <h1>AI会話エンジン モニタリング</h1>
      <ConversationView wsUrl={buildWsUrl()} characters={characters} />
    </div>
  );
}
