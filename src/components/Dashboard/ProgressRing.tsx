import React from "react";

export const ProgressRing: React.FC<{ 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  label?: string;
  color?: string;
  showValue?: boolean;
}> = ({ progress, size = 120, strokeWidth = 8, label, color = "#3b82f6", showValue = true }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="rotate-[-90deg]" width={size} height={size}>
          <circle
            className="text-white/5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-display">{Math.round(progress)}%</span>
          </div>
        )}
      </div>
      {label && <span className="text-xs font-medium text-gray-400">{label}</span>}
    </div>
  );
};
