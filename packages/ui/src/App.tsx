import { useEffect, useState } from 'react';
import type { CharacterSummary } from './api/client';
import { apiClient } from './api/client';
import { ConversationView } from './views/ConversationView';
import { LayerInspector } from './views/LayerInspector';
import { LogBrowser } from './views/LogBrowser';
import { ParameterDashboard } from './views/ParameterDashboard';

function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

type Mode = 'live' | 'log';

export function App() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [mode, setMode] = useState<Mode>('live');

  useEffect(() => {
    apiClient.listCharacters().then(setCharacters).catch(console.error);
  }, []);

  const wsUrl = buildWsUrl();

  return (
    <div style={{ padding: 'var(--space-3)' }}>
      <h1 style={{ fontSize: 18 }}>AI会話エンジン モニタリング</h1>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <button type="button" onClick={() => setMode('live')} disabled={mode === 'live'}>
          リアルタイム
        </button>
        <button type="button" onClick={() => setMode('log')} disabled={mode === 'log'}>
          ログ閲覧
        </button>
      </div>

      {mode === 'live' ? (
        // ui-design-rules.md 3章: 左＝会話タイムライン、右＝パラメータ/計算過程パネル
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ConversationView wsUrl={wsUrl} characters={characters} />
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <ParameterDashboard wsUrl={wsUrl} characters={characters} />
            <LayerInspector wsUrl={wsUrl} />
          </div>
        </div>
      ) : (
        <LogBrowser characters={characters} />
      )}
    </div>
  );
}
