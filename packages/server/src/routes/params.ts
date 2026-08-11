// Express 5のreq.paramsは（path-to-regexpのワイルドカード対応により）
// string | string[] 型になっているが、本プロジェクトの全ルートは単一セグメントの
// 名前付きパラメータのみを使うため、実行時には常にstringになる。
export function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    throw new Error('unexpected array route param');
  }
  if (value === undefined) {
    throw new Error('missing route param');
  }
  return value;
}
