CREATE TABLE IF NOT EXISTS "posts" (
	"uri" varchar(8192) PRIMARY KEY NOT NULL,
	"cid" varchar(1024) NOT NULL,
	"likes" bigint DEFAULT 0,
	"replies" bigint DEFAULT 0,
	"quotereposts" bigint DEFAULT 0,
	"reposts" bigint DEFAULT 0,
	"touchedAt" bigint,
	"indexedAt" timestamp DEFAULT now(),
	"hydrated" boolean DEFAULT false,
	"locale" varchar(8)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptionState" (
	"service" varchar(1024) PRIMARY KEY NOT NULL,
	"cursor" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "indexedAtIndex" ON "posts" USING btree ("indexedAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "touchedAtIndex" ON "posts" USING btree ("touchedAt" DESC NULLS LAST);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."trendingPosts24" AS (with "scored" as (select "uri", "cid", "likes", "replies", "quotereposts", "reposts", "touchedAt", "indexedAt", "hydrated", "locale", log("likes"*0.1 + "replies"*4 + "reposts"*0.5 + "quotereposts"*6 + 1) * EXP(-0.0001 * ((EXTRACT(EPOCH FROM NOW()) * 1000) - "touchedAt")  / (60000) *(RANDOM()*10 + 0.001)) as "decayedScore" from "posts" where ("posts"."touchedAt" is not null and "posts"."indexedAt" > NOW() AT TIME ZONE 'UTC' - interval'1 day' and "posts"."locale" = 'en') order by "posts"."touchedAt" desc limit 100000) select "cid", "uri", "likes", "replies", "reposts", "quotereposts", ROW_NUMBER() OVER (ORDER BY "decayedScore" DESC) as "curser" from "scored" order by "decayedScore" desc);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."trendingPostsMonthly" AS (with "scored" as (select "uri", "cid", "likes", "replies", "quotereposts", "reposts", "touchedAt", "indexedAt", "hydrated", "locale", log("likes"*0.1 + "replies"*4 + "reposts"*0.5 + "quotereposts"*6 + 1) * EXP(-0.01 * ((EXTRACT(EPOCH FROM NOW()) * 1000) - "touchedAt")  / (86400000) *(RANDOM()*10 + 0.001)) as "decayedScore" from "posts" where ("posts"."touchedAt" is not null and "posts"."indexedAt" > NOW() AT TIME ZONE 'UTC' - interval'1 month' and "posts"."locale" = 'en') order by "posts"."touchedAt" desc limit 100000) select "cid", "uri", "likes", "replies", "reposts", "quotereposts", ROW_NUMBER() OVER (ORDER BY "decayedScore" DESC) as "curser" from "scored" order by "decayedScore" desc);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."trendingPostsWeekly" AS (with "scored" as (select "uri", "cid", "likes", "replies", "quotereposts", "reposts", "touchedAt", "indexedAt", "hydrated", "locale", log("likes"*0.1 + "replies"*4 + "reposts"*0.5 + "quotereposts"*6 + 1) * EXP(-0.001 * ((EXTRACT(EPOCH FROM NOW()) * 1000) - "touchedAt")  / (3600000) *(RANDOM()*10 + 0.001)) as "decayedScore" from "posts" where ("posts"."touchedAt" is not null and "posts"."indexedAt" > NOW() AT TIME ZONE 'UTC' - interval'7 days' and "posts"."locale" = 'en') order by "posts"."touchedAt" desc limit 100000) select "cid", "uri", "likes", "replies", "reposts", "quotereposts", ROW_NUMBER() OVER (ORDER BY "decayedScore" DESC) as "curser" from "scored" order by "decayedScore" desc);