import { and, desc, eq, getTableColumns, gt, isNotNull, lt, sql } from "drizzle-orm";
import { bigint, boolean, index, pgMaterializedView, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { PostgresInterval, interval, calculateTimeUnitMultiplier, SmallTimeUnit } from "./sql";
import { Language, LanguageCodes } from "../util/language";
import { Timezones } from "./timezone";
export const posts = pgTable(
  "posts",
  {
    uri: varchar({ length: 1024 * 8 })
      .primaryKey()
      .notNull(),
    cid: varchar({ length: 1024 }).notNull(),
    likes: bigint({ mode: "number" }).default(0),
    replies: bigint({ mode: "number" }).default(0),
    quotereposts: bigint({ mode: "number" }).default(0),
    reposts: bigint({ mode: "number" }).default(0),
    touchedAt: bigint({ mode: "number" }),
    indexedAt: timestamp().defaultNow(),
    hydrated: boolean().default(false),
    locale: varchar({ length: 8 }),
  },
  (table) => {
    return [index("indexedAtIndex").on(table.indexedAt.desc()).concurrently(), index("touchedAtIndex").on(table.touchedAt.desc()).concurrently()];
  },
);

export type InsertPost = typeof posts.$inferInsert;

export const subscriptionStates = pgTable("subscriptionState", {
  service: varchar({ length: 1024 }).primaryKey(),
  cursor: bigint({ mode: "number" }).notNull(),
});

interface TrendingViewProps {
  nameSuffix: string;
  duration: PostgresInterval;
  likeWeight: number;
  repliesWeight: number;
  repostsWeight: number;
  quoteWeight: number;
  language: Language;
  scoreDecayUnit: SmallTimeUnit;
  totalScannedRecords: number;
  finalViewRecords: number;
  decayStrength: number;
}

function createTrendingView(props: TrendingViewProps) {
  const { decayStrength, duration, likeWeight, repliesWeight, repostsWeight, quoteWeight, language, scoreDecayUnit, totalScannedRecords, finalViewRecords, nameSuffix } = props;
  return pgMaterializedView(`trendingPosts${nameSuffix}`).as((qb) => {
    const scored = qb.$with("scored").as(
      qb
        .select({
          ...getTableColumns(posts),
          decayedScore:
            sql`log(${posts.likes}*${likeWeight} + ${posts.replies}*${repliesWeight} + ${posts.reposts}*${repostsWeight} + ${posts.quotereposts}*${quoteWeight} + 1) * EXP(${decayStrength} * ((EXTRACT(EPOCH FROM NOW()) * 1000) - ${posts.touchedAt})  / (${calculateTimeUnitMultiplier("millisecond", scoreDecayUnit)}) *(RANDOM()*10 + 0.001))`.as(
              "decayedScore",
            ),
        })
        .from(posts)
        .where(
          and(
            isNotNull(posts.touchedAt),
            gt(posts.indexedAt, sql`NOW() AT TIME ZONE ${Timezones["Universal Time, Coordinated"]} - ${interval(duration)}`),
            eq(posts.locale, LanguageCodes[language]),
          ),
        )
        .orderBy(desc(posts.touchedAt))
        .limit(totalScannedRecords),
    );
    const { cid, uri, likes, replies, reposts, quotereposts } = scored;
    return qb
      .with(scored)
      .select({
        cid,
        uri,
        likes,
        replies,
        reposts,
        quotereposts,
        curser: sql<number>`ROW_NUMBER() OVER (ORDER BY "decayedScore" DESC)`.as("curser"),
      })
      .from(scored)
      .orderBy(desc(sql`"decayedScore"`))
      .limit(finalViewRecords);
  });
}

export const trending24 = createTrendingView({
  decayStrength: -0.0001,
  duration: { amount: 1, unit: "day" },
  language: "English",
  likeWeight: 0.1,
  repliesWeight: 4,
  repostsWeight: 0.5,
  quoteWeight: 6,
  scoreDecayUnit: "minute",
  totalScannedRecords: 100_000,
  finalViewRecords: 10_000,
  nameSuffix: "24",
});

export const trendingWeekly = createTrendingView({
  decayStrength: -0.001,
  duration: { amount: 7, unit: "day" },
  language: "English",
  likeWeight: 0.1,
  repliesWeight: 4,
  repostsWeight: 0.5,
  quoteWeight: 6,
  scoreDecayUnit: "hour",
  totalScannedRecords: 100_000,
  finalViewRecords: 10_000,
  nameSuffix: "Weekly",
});

export const trendingMonthly = createTrendingView({
  decayStrength: -0.01,
  duration: { amount: 1, unit: "month" },
  language: "English",
  likeWeight: 0.1,
  repliesWeight: 4,
  repostsWeight: 0.5,
  quoteWeight: 6,
  scoreDecayUnit: "day",
  totalScannedRecords: 100_000,
  finalViewRecords: 10_000,
  nameSuffix: "Monthly",
});
