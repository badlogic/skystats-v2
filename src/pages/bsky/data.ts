import { Agent, AppBskyFeedGetAuthorFeed } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";

const agent = new Agent(new URL("https://api.bsky.app"));

export type ProfileData = {
    profile: ProfileViewDetailed;
    posts: FeedViewPost[];
};

function isWithinLastNumDays(dateString: string, numDays: number): boolean {
    const currentDate = new Date();
    const targetDate = new Date(dateString);
    const timeDifference = currentDate.getTime() - targetDate.getTime();
    const daysDifference = timeDifference / (1000 * 60 * 60 * 24);
    return daysDifference <= numDays;
}

export async function getProfileData(handle: string, numDays: number = 30): Promise<ProfileData | Error> {
    const response = await agent.getProfile({ actor: handle });
    if (!response.success) {
        return Error("Could not fetch profile " + handle);
    }
    const profile = response.data;
    const posts: FeedViewPost[] = [];

    let cursor: string | undefined;
    while (true) {
        const queryParams: AppBskyFeedGetAuthorFeed.QueryParams = {
            actor: profile.did,
            filter: "posts_with_replies",
        };
        if (cursor) queryParams.cursor = cursor;
        const response = await agent.getAuthorFeed(queryParams);
        if (!response.success) {
            return Error("Could not fetch posts by profile " + handle);
        }
        cursor = response.data.cursor;

        for (const post of response.data.feed) {
            if (post.post.author.handle != handle) continue;
            if (!isWithinLastNumDays(post.post.indexedAt, numDays)) {
                cursor = undefined;
                break;
            }
            posts.push(post);
        }
        if (!cursor) break;
    }
    return { profile, posts };
}

export async function getProfile(handle: string): Promise<ProfileViewDetailed | Error> {
    const response = await agent.getProfile({ actor: handle });
    if (!response.success) {
        return Error("Could not fetch profile " + handle);
    }
    return response.data;
}
