import { useRef, useState } from "react";
import VideoFeed from "./VideoFeed";
import "./ResizableVideoFeed.css";

interface Size {
  width: number;
  height: number;
}

interface ResizableVideoFeedProps {
  children?: React.ReactNode; // overlay content, forwarded to VideoFeed (e.g. GestureToast, ProgressRing)
  defaultSize?: Size;
  minSize?: Size;
  maxSize?: Size;
}

const DEFAULT_SIZE: Size = { width: 760, height: 570 };
const MIN_SIZE: Size = { width: 300, height: 225 };
const MAX_SIZE: Size = { width: 1000, height: 800 };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Drag-resizable wrapper around VideoFeed, shared by every screen that shows the camera. */
export default function ResizableVideoFeed({
  children,
  defaultSize = DEFAULT_SIZE,
  minSize = MIN_SIZE,
  maxSize = MAX_SIZE,
}: ResizableVideoFeedProps) {
  const [size, setSize] = useState(defaultSize);
  const dragStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Pointer capture keeps the drag going even if the cursor outruns the
  // small handle - no window-level listeners to add/clean up. Driven by
  // React state (not the native CSS `resize` property) because native
  // resize only changes the element's own box and doesn't grow an ancestor
  // grid/flex container during an interactive drag, which let an enlarged
  // feed overflow on top of neighboring cards.
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY, ...size };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    setSize({
      width: clamp(start.width + (e.clientX - start.x), minSize.width, maxSize.width),
      height: clamp(start.height + (e.clientY - start.y), minSize.height, maxSize.height),
    });
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="resizable-video" style={{ width: size.width, height: size.height }}>
      <VideoFeed>{children}</VideoFeed>
      <div
        className="resizable-video-handle"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />
    </div>
  );
}
