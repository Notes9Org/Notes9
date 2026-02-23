"use client";

import { useEffect, useRef, useState } from "react";

interface ExpandableTextProps {
  text: string;
  lines?: number;
  className?: string;
  buttonClassName?: string;
}

export default function ExpandableText({
  text,
  lines = 2,
  className = "",
  buttonClassName = "",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Wait for layout paint
    requestAnimationFrame(() => {
      if (!el) return;
      setShowButton(el.scrollHeight > el.clientHeight);
    });
  }, [text, lines]);

  const clampStyle: React.CSSProperties = expanded
    ? {}
    : {
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
      };

  return (
    <div>
      <div
        ref={ref}
        style={clampStyle}
        className={className}
      >
        {text}
      </div>

      {showButton && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={buttonClassName}
          style={{ marginTop: 4 }}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}