export interface StatBarProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
}

/**
 * 0〜1（既定）の数値の強弱を`--data-scale-low`〜`--data-scale-high`の連続スケールで表す
 * バー（`ui-design-rules.md` 2.3: キャラクターカラーとは独立した中間色スケール）。
 * 色だけに依存しないよう、常に数値ラベルを併記する。
 */
export function StatBar({ label, value, min = 0, max = 1 }: StatBarProps) {
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const percent = Math.round(ratio * 100);

  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>{label}</span>
        <span className="mono">{value.toFixed(2)}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--color-border)',
          overflow: 'hidden',
          marginTop: 2,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: `color-mix(in oklab, var(--data-scale-low), var(--data-scale-high) ${percent}%)`,
          }}
        />
      </div>
    </div>
  );
}
