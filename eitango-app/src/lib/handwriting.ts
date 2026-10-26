// Google の手書き入力（Google 入力ツールと同じ認識エンジン）で手書き文字を読み取る。
// APIキー不要・推論なしで、通常 0.5 秒前後で返る。非公式の窓口なので、使えなくなる可能性はある。

export type Stroke = { x: number; y: number }[];

/** 認識候補（よさそうな順）を返す */
export async function recognizeStrokes(strokes: Stroke[], width: number, height: number): Promise<string[]> {
  const res = await fetch("https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      options: "enable_pre_space",
      requests: [
        {
          writing_guide: { writing_area_width: Math.round(width), writing_area_height: Math.round(height) },
          ink: strokes.map((s) => [s.map((p) => Math.round(p.x)), s.map((p) => Math.round(p.y))]),
          language: "en",
          max_num_results: 8,
          max_completions: 0,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`手書きの読み取りに失敗しました（${res.status}）`);
  const data = (await res.json()) as [string, [string, string[]][]];
  if (data[0] !== "SUCCESS") throw new Error("手書きの読み取りに失敗しました。");
  return data[1]?.[0]?.[1] ?? [];
}
