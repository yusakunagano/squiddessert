import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

type Point = { x: number; y: number };
type Stroke = Point[];

export interface HandwritingHandle {
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
  /** 罫線なし・白背景の PNG (base64, ヘッダなし) を返す */
  toPngBase64: () => string;
}

const HEIGHT = 200;

/**
 * 英語ノートのような4本線つきの手書きキャンバス。
 * 指・ペン・マウスで書ける（Pointer Events）。
 */
export const HandwritingCanvas = forwardRef<HandwritingHandle>(function HandwritingCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, HEIGHT);
    drawGuides(ctx, w);
    drawStrokes(ctx, strokes.current);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement!.clientWidth;
    canvas.width = w * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${HEIGHT}px`;
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    current.current = [pos(e)];
    strokes.current.push(current.current);
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!current.current) return;
    e.preventDefault();
    current.current.push(pos(e));
    redraw();
  };
  const onUp = () => {
    current.current = null;
  };

  useImperativeHandle(ref, () => ({
    clear() {
      strokes.current = [];
      redraw();
    },
    undo() {
      strokes.current.pop();
      redraw();
    },
    isEmpty: () => strokes.current.length === 0,
    toPngBase64() {
      const src = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const out = document.createElement("canvas");
      out.width = src.width / dpr;
      out.height = HEIGHT;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, out.width, out.height);
      drawStrokes(ctx, strokes.current, "#000");
      return out.toDataURL("image/png").split(",")[1];
    },
  }));

  return (
    <div className="hw-wrap">
      <canvas
        ref={canvasRef}
        className="hw-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      />
    </div>
  );
});

function drawGuides(ctx: CanvasRenderingContext2D, w: number) {
  // 4本線: 上線・中線（点線）・基線（赤）・下線
  const lines: { y: number; color: string; dash: number[] }[] = [
    { y: 40, color: "#94a3b8", dash: [] },
    { y: 85, color: "#cbd5e1", dash: [6, 6] },
    { y: 130, color: "#f87171", dash: [] },
    { y: 175, color: "#94a3b8", dash: [] },
  ];
  for (const l of lines) {
    ctx.beginPath();
    ctx.setLineDash(l.dash);
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 1;
    ctx.moveTo(0, l.y);
    ctx.lineTo(w, l.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], color = "#1e293b") {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0].x, s[0].y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}
