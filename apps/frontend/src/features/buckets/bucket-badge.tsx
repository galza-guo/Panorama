import { useSettingsContext } from "@/lib/settings-provider";
import type { Bucket } from "@/lib/types";
import { Badge } from "@wealthfolio/ui";

function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();

  if (!normalized.startsWith("#")) {
    return color;
  }

  const hex = normalized.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : hex;

  if (expanded.length !== 6) {
    return color;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function BucketBadge({ bucket }: { bucket?: Bucket | null }) {
  const { settings } = useSettingsContext();

  if (!settings?.bucketsEnabled || !bucket) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className="h-5 rounded-full px-1.5 py-0 text-[10px] font-normal"
      style={{
        backgroundColor: withAlpha(bucket.color, 0.14),
        borderColor: withAlpha(bucket.color, 0.22),
        color: withAlpha(bucket.color, 0.92),
      }}
    >
      <span
        className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: bucket.color }}
      />
      {bucket.name}
    </Badge>
  );
}
