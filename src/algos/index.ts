import { AppContext } from "../config";
import { OutputSchema as AlgoOutput, QueryParams } from "../lexicons/types/app/bsky/feed/getFeedSkeleton";

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {};

export default algos;
