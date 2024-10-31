# Bluesky Trending Feed Builder
This project is based on the [AT Protocol feed generator template](https://github.com/bluesky-social/feed-generator). The primary goal of this project is to provide feeds for bluesky that are 'trending' based and eventually allow people to simply create new feeds through a web UI.

### Current Feeds
- Trending 24: Top engaged posts on blue sky that have seen activity in the last 24 hours.
- Trending Weekly: Top engaged posts on blue sky that have seen activity in the last week.
- Trending Monthly: Top engaged posts on blue sky that have seen activity in the last month.

## Goals
- Trending feeds of various types
- A web interface for creating new feeds ad hoc
- Ability to create feeds that are associated with topics through the interface

## Development
Fill out onces workflow is more established.
## Deployment
Details deployment steps.
Will be using Docker, with GitHub actions and Watchtower to trigger updates of my changes and automatically deploy to my server.
## Design & Algorithm
There are basically three main points of consideration with a feed generator:
- Storage
- Data Processing
- Querying
The design choices being made will take these pieces into account to attempt to optimize for speed of development, performance of user queries and infrastructure costs.

### Storage
I have decided on Postgres for my storage layer. It is a first class database, that has reasonable opportunities to scale when using optimized data structures. It also will take full advantage of the hardware that it is provided.

### Data Processing
The folks at bluesky have their example template in typescript, using Express. As such I have started with this solution. 
My implementation extended on theirs, where I batch the event messages received from the firehose, keep them in memory and then flush them all at once to the database. There is still room for improving the writing process to the database though.

That said, I am interested in the idea of moving to Go, especially if memory overhead or multithreading become an issue from processing the firehose.

### Querying
One of the larger loads on the host will be if the feed becomes popular and we have many people querying the different feeds.
To provide fast querying and paging solutions, I will be using materialized views.

A materialized view caches the output of a query as it's own pseudo table, which can be refreshed manually when desired. By using materialized views I gain the following:
- Optimized queries - the data is already in the order allowed for the query, no other calculations need to be done other then paging.
- Optimized paging - I can create a column that I index on for each view, at query time, that is the ordering of the data. This allows us to use Cursor based index + data optimized in order, for fastest possible read times.
- Reduced storage - While the views themselves require storage, by using them, we can periodically query our larger dataset, then slice it to a smaller reasonable sizes for each feed.

When using materialized views, we will need a cronjob like process that periodically refreshes and runs all view queries. Ideally these would be staggered so as to not overwhelm the database.

### Algorithm
The current design for trending is to multiply each posts like, reply, repost, quote counts by some weights and then add up these values. This gives us an initial engagement score. Then that score is squished by taking the log of it, then an exponential decay is applied that scales to the amount of time since last activity on the post. A slight random element is added to the calculation, making the ordering not always deterministic.


#### Discussion
- Weights
The reason for the weights on the engagement metrics, is it is much easier to like something, then it is to reply, so from an engaging post standpoint likes should be weighted less then replies. 
What I have found is different types of posts will land with different types of engagement. In the future I plan to release trending feeds that focus on one engagement metric.
- Exponential decay
The exponential decay for the score makes sure posts that are receiving activity most recently are more likely to be pushed to the top.
- Randomness
The randomness is to make sure the posts don't always seem exactly in the same order, as that gets boring for users.

### UI/UX
Eventually, I'd like to provide an interface where either just myself, or perhaps eventually others, can make new feeds through a nice simple UI. 
Something along the lines of choosing a type of algorithm: Trending, Friends, ect then applying tuning and optional filtering to that algorithm.
This would allow easy creation of topic based trending algorithms. 


#### Future Scaling
If needed these components could be broken into each their own component with their own compute. A data processor, a database and a query service.
If there was large query loads, you could do replication and caching. I don't think we will get there anytime soon but it wouldn't be challenging to break out each piece. The biggest issue at that point would likely be cost.

## Technologies
- Docker & Docker Compose
- Postgres
- Express
- Drizzle
- AT Proto

## Useful Links
[AT Protocol](https://atproto.com/)
[BlueSky](https://docs.bsky.app/docs/get-started)

