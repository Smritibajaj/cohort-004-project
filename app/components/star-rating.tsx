import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const STARS = [1, 2, 3, 4, 5];

type StarRatingDisplayProps = {
  average: number | null;
  count: number;
  size?: "sm" | "md";
  className?: string;
};

export function StarRatingDisplay({
  average,
  count,
  size = "md",
  className,
}: StarRatingDisplayProps) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";

  if (count === 0 || average === null) {
    return (
      <span
        className={cn(
          "flex items-center gap-1 text-muted-foreground",
          size === "sm" ? "text-xs" : "text-sm",
          className
        )}
      >
        <Star className={cn(iconSize, "text-muted-foreground/40")} />
        No ratings yet
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        size === "sm" ? "text-xs" : "text-sm",
        className
      )}
      aria-label={`Rated ${average} out of 5 from ${count} ${count === 1 ? "rating" : "ratings"}`}
    >
      <span className="flex items-center" aria-hidden="true">
        {STARS.map((star) => {
          // Fraction of this star to fill, 0–1
          const fill = Math.min(Math.max(average - (star - 1), 0), 1);
          return (
            <span key={star} className={cn("relative", iconSize)}>
              <Star
                className={cn("absolute inset-0", iconSize, "text-amber-400/30")}
              />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className={cn(iconSize, "fill-amber-400 text-amber-400")}
                />
              </span>
            </span>
          );
        })}
      </span>
      <span className="font-medium text-foreground">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

type StarRatingInputProps = {
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
};

export function StarRatingInput({
  value,
  onChange,
  disabled,
}: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className="flex items-center gap-1"
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
          disabled={disabled}
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(star)}
          className="rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star
            className={cn(
              "size-6",
              star <= shown
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  );
}
