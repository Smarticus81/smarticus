import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../../../shared/voice/whiteboard";
import { Icon } from "../components/Icon";
import { INK, renderBoard, simplifyStroke, STUDENT_INK, type BoardOp } from "./whiteboardEngine";
import { useWhiteboard, whiteboard } from "./whiteboardStore";

const PEN_COLORS = [
  { name: "Blue", value: STUDENT_INK },
  { name: "Ink", value: INK },
  { name: "Red", value: "#c2452b" },
  { name: "Green", value: "#2e8b57" },
];

export function Whiteboard({ onClose }: { onClose?: () => void }) {
  const state = useWhiteboard();
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const strokeRef = useRef<number[] | null>(null);
  const [penColor, setPenColor] = useState(STUDENT_INK);
  const [penWidth, setPenWidth] = useState(4);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const penRef = useRef({ color: penColor, width: penWidth });
  penRef.current = { color: penColor, width: penWidth };

  useEffect(() => {
    whiteboard.setInstant(Boolean(reduced));
  }, [reduced]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      setSize({ width, height: Math.floor((width * BOARD_HEIGHT) / BOARD_WIDTH) });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return { animating: false };
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const ops: BoardOp[] = whiteboard.getSnapshot().ops;
    const live = strokeRef.current;
    const preview: BoardOp[] = live && live.length >= 4
      ? [
          ...ops,
          {
            id: -1,
            author: "student",
            step: { kind: "path", points: live, closed: false, width: penRef.current.width, color: penRef.current.color },
            startedAt: 0,
            duration: 0,
          },
        ]
      : ops;
    const now = performance.now();
    const { animating: ticking } = whiteboard.tick(now);
    const result = renderBoard(context, preview, now, size.width, size.height);
    return { animating: ticking || result.animating };
  }, [size.height, size.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    whiteboard.registerCanvas(canvas);
    let frame = 0;
    const loop = () => {
      const { animating } = paint();
      if (animating || strokeRef.current) frame = requestAnimationFrame(loop);
      else frame = 0;
    };
    loop();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [paint, size, state.version]);

  useEffect(() => () => whiteboard.registerCanvas(null), []);

  const boardPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / BOARD_WIDTH, rect.height / BOARD_HEIGHT) || 1;
    return [
      Math.round(((event.clientX - rect.left) / scale) * 10) / 10,
      Math.round(((event.clientY - rect.top) / scale) * 10) / 10,
    ];
  };

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeRef.current = boardPoint(event);
    paint();
  };
  const extendStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!strokeRef.current) return;
    const events = typeof event.nativeEvent.getCoalescedEvents === "function"
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / BOARD_WIDTH, rect.height / BOARD_HEIGHT) || 1;
    for (const pointer of events) {
      strokeRef.current.push(
        Math.round(((pointer.clientX - rect.left) / scale) * 10) / 10,
        Math.round(((pointer.clientY - rect.top) / scale) * 10) / 10,
      );
    }
    paint();
  };
  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const points = strokeRef.current;
    strokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (points && points.length >= 4) {
      whiteboard.addStroke(simplifyStroke(points), penColor, penWidth);
    } else paint();
  };

  const studentStrokes = state.ops.filter((op) => op.author === "student").length;

  return (
    <section className="whiteboard" aria-label="Shared whiteboard" data-testid="whiteboard">
      <div className="whiteboard-top">
        <div>
          <span className="eyebrow">SHARED WHITEBOARD</span>
          <p className="whiteboard-caption" role="status" aria-live="polite">
            {state.caption ?? (state.ops.length ? "Draw back with the pen. Virgil can look at what you add." : "Ask Virgil to sketch it, or draw your own idea here.")}
          </p>
        </div>
        <div className="whiteboard-tools" role="toolbar" aria-label="Pen tools">
          {PEN_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className="pen-swatch"
              style={{ background: color.value }}
              aria-label={`${color.name} pen`}
              aria-pressed={penColor === color.value}
              onClick={() => setPenColor(color.value)}
            />
          ))}
          <button
            type="button"
            className="text-button"
            aria-pressed={penWidth > 4}
            onClick={() => setPenWidth(penWidth > 4 ? 4 : 9)}
          >
            {penWidth > 4 ? "Bold pen" : "Fine pen"}
          </button>
          <button type="button" className="text-button" onClick={() => whiteboard.clear()} disabled={!state.ops.length}>
            Clear
          </button>
          {onClose && (
            <button type="button" className="text-button" onClick={onClose} aria-label="Close whiteboard">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="whiteboard-frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          data-testid="whiteboard-canvas"
          style={{ width: size.width, height: size.height, touchAction: "none" }}
          aria-label={`Whiteboard with ${state.ops.length} drawings, ${studentStrokes} by you`}
          onPointerDown={beginStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
    </section>
  );
}
