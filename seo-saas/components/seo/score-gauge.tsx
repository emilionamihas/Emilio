import { cn, scoreTone } from "@/lib/utils";

const TONE_CLASSES = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TRACK_CLASSES = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
};

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: number;
}

/** Anillo de progreso circular para mostrar un score 0-100. */
export function ScoreGauge({ score, label, size = 128 }: ScoreGaugeProps) {
  const tone = scoreTone(score);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(score, 0), 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={10}
            className="fill-none stroke-secondary"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("fill-none transition-all duration-700 ease-out", TRACK_CLASSES[tone])}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", TONE_CLASSES[tone])}>{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
