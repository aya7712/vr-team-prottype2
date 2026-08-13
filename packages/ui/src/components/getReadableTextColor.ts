function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 背景色とのコントラスト比が高くなる方（白/黒）を返す（WCAG AA 4.5:1目安）。
 */
export function getReadableTextColor(hex: string): '#000000' | '#FFFFFF' {
  const bgLuminance = relativeLuminance(hex);
  const contrastWithBlack = contrastRatio(bgLuminance, relativeLuminance('#000000'));
  const contrastWithWhite = contrastRatio(bgLuminance, relativeLuminance('#FFFFFF'));
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#FFFFFF';
}
