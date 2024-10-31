import { AnyColumn, sql, SQLChunk } from "drizzle-orm";
import { TimeZone, Timezones } from "./timezone";

export const addOnUpdate = (column: AnyColumn) => {
  return sql.raw(`"posts".${column.name} + EXCLUDED.${column.name}`);
};

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`;
};

export const TIME_UNITS = ["year", "month", "day", "hour", "minute", "second"] as const;

export type TimeUnit = (typeof TIME_UNITS)[number];
export type PostgresInterval = {
  amount: number;
  unit: TimeUnit;
};

export function interval({ amount, unit }: PostgresInterval) {
  const s = amount > 1 ? `${amount} ${unit}s` : `${amount} ${unit}`;
  return sql`interval${s}`;
}

export function log(fieldSql: SQLChunk) {
  return sql`log(${fieldSql})`;
}
export type SmallTimeUnit =  "millisecond" | Exclude<TimeUnit, "year" | "month">;
export interface TimeStampProps {
  interval: PostgresInterval;
  direction: "past" | "future";
  timezone: TimeZone;
  unit: SmallTimeUnit | 'datetime';
}

export function timestampFromNow(props?: TimeStampProps) {
  if (!props) {
    return sql`now()`;
  }
  const { interval: i, direction, timezone, unit } = props;
  if (unit === "datetime") {
    return sql`now() at time zone ${Timezones[timezone]} ${direction === "past" ? "-" : "+"} ${interval(i)}`;
  }
  return sql`extract(epoch from now() at time zone ${Timezones[timezone]}) * ${calculateTimeUnitMultiplier("second", unit)}`;
}

const multipliers = [1000, 60, 60, 24] as const;

const step: Record<Exclude<SmallTimeUnit, "datetime">, number> = {
  millisecond: 0,
  second: 1,
  minute: 2,
  hour: 3,
  day: 4,
};

export function calculateTimeUnitMultiplier(
  startingUnit: SmallTimeUnit,
  endingUnit: SmallTimeUnit,
) {
  if (startingUnit === endingUnit) return 1;
  const increasing = step[startingUnit] < step[endingUnit];
  const [start, end] = increasing
    ? [step[startingUnit], step[endingUnit]]
    : [step[startingUnit], step[endingUnit] - 1];
  const m = increasing ? multipliers : multipliers.toReversed();
  return m.slice(start, end).reduce((amt, multiplier) => {
    if (increasing) {
      return amt * multiplier;
    }
    return amt / multiplier;
  }, 1);
}

export interface DurationProps {
  column: AnyColumn;
  timezone: TimeZone;
  unit: SmallTimeUnit;
  columnUnit: SmallTimeUnit;
}

