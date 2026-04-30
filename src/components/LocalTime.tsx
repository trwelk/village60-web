"use client";

type Props = {
  utcMs: number;
  label: string;
};

/** Renders an instant stored in UTC using the browser local timezone (PRD story 36). */
export function LocalTime({ utcMs, label }: Props) {
  const d = new Date(utcMs);
  return (
    <p className="text-sm text-ink/65">
      {label}{" "}
      <time dateTime={d.toISOString()} suppressHydrationWarning>
        {d.toLocaleString()}
      </time>
    </p>
  );
}
