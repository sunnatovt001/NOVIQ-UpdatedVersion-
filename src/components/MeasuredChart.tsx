import React, { useLayoutEffect, useRef, useState } from "react";

// Recharts receives explicit positive sizes, never a hidden/unsized container.
export const MeasuredChart = ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const next = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="h-full min-w-0 w-full">
    {size.width > 0 && size.height > 0 ? React.cloneElement(children, size) : <span role="status" className="text-sm text-slate-500">Preparing chart…</span>}
  </div>;
};
