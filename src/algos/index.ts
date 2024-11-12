import { gte } from "drizzle-orm";
import { AppContext } from "../config";
import { trending24, trendingMonthly, trendingWeekly } from "../db/schema";
import { OutputSchema as AlgoOutput, QueryParams } from "../lexicons/types/app/bsky/feed/getFeedSkeleton";

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
  trending24: async (ctx, { limit, cursor }) => {
    try {
      const index = parseInt(cursor ?? "0");
      const view = await ctx.db
        .select()
        .from(trending24)
        .where(gte(trending24.curser, !index ? 0 : index))
        .limit(limit);
      return {
        cursor: view[view.length - 1].curser.toString(),
        feed: view.map((r) => ({ post: r.uri, feedContext: "" })),
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  },
  trendingWeekly: async (ctx, { limit, cursor }) => {
    const index = parseInt(cursor ?? "0");
    const view = await ctx.db
      .select()
      .from(trendingWeekly)
      .where(gte(trendingWeekly.curser, !index ? 0 : index))
      .limit(limit);
    return {
      cursor: view[view.length - 1].curser.toString(),
      feed: view.map((r) => ({ post: r.uri, feedContext: "" })),
    };
  },
  trendingMonthly: async (ctx, { limit, cursor }) => {
    const index = parseInt(cursor ?? "0");
    const view = await ctx.db
      .select()
      .from(trendingMonthly)
      .where(gte(trendingMonthly.curser, !index ? 0 : index))
      .limit(limit);
    return {
      cursor: view[view.length - 1].curser.toString(),
      feed: view.map((r) => ({ post: r.uri, feedContext: "" })),
    };
  },
};

export default algos;
