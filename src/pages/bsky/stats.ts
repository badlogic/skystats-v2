import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { getProfile, ProfileData } from "./data";
import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Feed } from "@atproto/api/dist/client/types/app/bsky/feed/describeFeedGenerator";
import { deu, eng, fra, removeStopwords } from "stopword";
import { AppBskyFeedDefs, AppBskyFeedPost } from "@atproto/api";
import { replaceSpecialChars } from "../../utils/utils";
import { Api } from "../../api";

type Interaction = { count: number; did: string; profile?: ProfileViewBasic };

type Word = { count: number; text: string };

export interface Stats {
    postsPerDate: Record<string, FeedViewPost[]>;
    postsPerTimeOfDay: Record<string, FeedViewPost[]>;
    postsPerWeekday: Record<string, FeedViewPost[]>;
    likesPerDate: Record<string, number>;
    repostsPerDate: Record<string, number>;
    quotesPerDate: Record<string, number>;
    repliesPerDate: Record<string, number>;
    interactedWith: Interaction[];
    words: Word[];
    receivedReposts: number;
    receivedQuotes: number;
    receivedLikes: number;
    receivedReplies: number;
    summary: string;
}

function generateDates(numDays: number): string[] {
    const dateArray: string[] = [];

    for (let i = 0; i < numDays; i++) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - i);

        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");

        dateArray.push(`${year}-${month}-${day}`);
    }

    return dateArray.reverse();
}

function generateHours(): string[] {
    const hours: string[] = [];
    for (let i = 0; i < 24; i++) {
        hours.push((i < 10 ? "0" : "") + i + ":00");
    }
    return hours;
}

function generateWeekdays(): string[] {
    return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
}

function getYearMonthDate(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export async function calculateStats(data: ProfileData) {
    const stats: Stats = {
        postsPerDate: {},
        postsPerWeekday: {},
        postsPerTimeOfDay: {},
        likesPerDate: {},
        repostsPerDate: {},
        quotesPerDate: {},
        repliesPerDate: {},
        interactedWith: [],
        words: [],
        receivedReposts: 0,
        receivedQuotes: 0,
        receivedLikes: 0,
        receivedReplies: 0,
        summary: ""
    }
    const weekdays = generateWeekdays();
    const hours = generateHours();
    const interactedWith: Record<string, Interaction> = {};
    const stopWords = [...eng, ...deu, ...fra];
    const words: Record<string, Word> = {};

    for (const post of data.posts) {
        const record = post.post.record;
        if (!AppBskyFeedPost.isRecord(record)) continue;

        const date = getYearMonthDate(record.createdAt);
        let array = stats.postsPerDate[date];
        if (!array) {
            array = [];
            stats.postsPerDate[date] = array;
        }
        array.push(post);
        stats.likesPerDate[date] = (stats.likesPerDate[date] ?? 0) + (post.post.likeCount ?? 0);
        stats.repostsPerDate[date] = (stats.repostsPerDate[date] ?? 0) + (post.post.repostCount ?? 0);
        stats.quotesPerDate[date] = (stats.quotesPerDate[date] ?? 0) + (post.post.quoteCount ?? 0);
        stats.repliesPerDate[date] = (stats.repliesPerDate[date] ?? 0) + (post.post.replyCount ?? 0);

        const hour = new Date(record.createdAt).getHours();
        const hourKey = (hour < 10 ? "0" : "") + hour + ":00";
        array = stats.postsPerTimeOfDay[hourKey];
        if (!array) {
            array = [];
            stats.postsPerTimeOfDay[hourKey] = array;
        }
        array.push(post);

        const day = weekdays[new Date(record.createdAt).getDay()];
        array = stats.postsPerWeekday[day];
        if (!array) {
            array = [];
            stats.postsPerWeekday[day] = array;
        }
        array.push(post);

        if (post.reply && AppBskyFeedDefs.isPostView(post.reply.parent)) {
            const did = post.reply.parent.author.did;
            if (data.profile.did == did) continue;
            let interaction = interactedWith[did];
            if (!interaction) {
                interaction = {
                    count: 0,
                    did: did,
                    profile: post.reply.parent.author,
                };
                interactedWith[did] = interaction;
            }
            interaction.count++;
        }

        const tokens = removeStopwords(
            replaceSpecialChars(record.text)
                .split(" ")
                .filter((token) => !(token.startsWith("http") || token.includes("/") || token.includes("bsky.social")))
                .map((token) => (token.endsWith(".") ? token.substring(0, token.length - 1) : token))
                .map((token) => token.toLowerCase()),
            stopWords
        );

        for (let token of tokens) {
            token = token.toLowerCase().trim();
            if (token.length < 2) continue;
            if (/^\d+$/.test(token)) continue;
            if (token.startsWith("@")) continue;
            let word = words[token];
            if (!word) {
                word = {
                    count: 0,
                    text: token,
                };
                words[token] = word;
            }
            word.count++;
        }
    }

    const interactions: Interaction[] = [];
    for (const interaction of Object.values(interactedWith)) {
        interactions.push(interaction);
    }
    interactions.sort((a, b) => b.count - a.count);

    stats.interactedWith = interactions;
    stats.words = Object.values(words).sort((a, b) => b.count - a.count);

    for (const post of data.posts) {
        stats.receivedLikes += post.post.likeCount ?? 0;
        stats.receivedReposts += post.post.repostCount ?? 0;
        stats.receivedQuotes += post.post.quoteCount ?? 0;
        stats.receivedReplies += post.post.replyCount ?? 0;
    }

    const texts: string[] = [];
    const scorePost = (post: FeedViewPost) => (post.post.repostCount ?? 0) + (post.post.likeCount ?? 0) + (post.post.quoteCount ?? 0);
    const postsForLLM = [...data.posts].sort((a, b) => scorePost(b) - scorePost(a)).slice(0, 100);
    for (const post of postsForLLM) {
        const record = post.post.record;
        texts.push(AppBskyFeedPost.isRecord(record) ? record.text : "");
    }

    if (postsForLLM.length > 0) {
        const response = await Api.summarize(postsForLLM[0].post.uri, texts);
        if (response instanceof Error) {
            console.error("Could not generate AI summary: " + response.message);
            return stats;
        }
        stats.summary = response.summary;
    }
    return stats;
}