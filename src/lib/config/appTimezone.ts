export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || "UTC";
}

type ZonedSecondParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ZonedDateParts = Pick<ZonedSecondParts, "year" | "month" | "day">;

const formatterByTimezone = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterByTimezone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterByTimezone.set(timeZone, formatter);
  }
  return formatter;
}

function zonedPartsAtUtcMs(utcMs: number, timeZone: string): ZonedSecondParts {
  const values: Partial<ZonedSecondParts> = {};
  for (const part of getFormatter(timeZone).formatToParts(new Date(utcMs))) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  }
  return values as ZonedSecondParts;
}

export function zonedDateAtUtcMs(
  utcMs: number,
  timeZone = getAppTimezone(),
): ZonedDateParts {
  const { year, month, day } = zonedPartsAtUtcMs(utcMs, timeZone);
  return { year, month, day };
}

function utcMsForZonedLocalSecond(
  target: ZonedSecondParts,
  timeZone: string,
): number {
  let guess = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  for (let i = 0; i < 5; i += 1) {
    const observed = zonedPartsAtUtcMs(guess, timeZone);
    const deltaMs =
      Date.UTC(
        target.year,
        target.month - 1,
        target.day,
        target.hour,
        target.minute,
        target.second,
      ) -
      Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
    if (deltaMs === 0) {
      return guess;
    }
    guess += deltaMs;
  }

  const observed = zonedPartsAtUtcMs(guess, timeZone);
  if (
    observed.year !== target.year ||
    observed.month !== target.month ||
    observed.day !== target.day ||
    observed.hour !== target.hour ||
    observed.minute !== target.minute ||
    observed.second !== target.second
  ) {
    throw new Error(`Could not resolve wall-clock time for timezone ${timeZone}.`);
  }
  return guess;
}

export function lastInstantOfMonthUtcMs(
  year: number,
  month1Based: number,
  timeZone = getAppTimezone(),
): number {
  if (!Number.isInteger(year) || !Number.isInteger(month1Based)) {
    throw new Error("year and month1Based must be integers.");
  }
  if (month1Based < 1 || month1Based > 12) {
    throw new Error("month1Based must be between 1 and 12.");
  }
  if (timeZone === "UTC") {
    return Date.UTC(year, month1Based, 1) - 1;
  }

  const nextMonthYear = month1Based === 12 ? year + 1 : year;
  const nextMonth = month1Based === 12 ? 1 : month1Based + 1;
  return (
    utcMsForZonedLocalSecond(
      {
        year: nextMonthYear,
        month: nextMonth,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ) - 1
  );
}
