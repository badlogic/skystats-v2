import { LitElement, PropertyValueMap, PropertyValues, TemplateResult, html } from "lit";
import { map } from "lit-html/directives/map.js";
import { customElement, state } from "lit/decorators.js";
import { getProfileData, ProfileData } from "./bsky/data";
import { blueskyIcon, closeIcon, heartIcon, moonIcon, quoteIcon, reblogIcon, replyIcon, speechBubbleIcon, spinnerIcon, sunIcon } from "../utils/icons";
import { defaultAvatar, renderPost } from "./bsky/ui";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { calculateStats, Stats } from "./bsky/stats";
import { dom } from "../utils/ui-components";

import { Chart, registerables } from "chart.js";
import { WordCloudController, WordElement } from "chartjs-chart-wordcloud";
import { compressJSON, decompressJSON, generateDates, generateHours, generateWeekdays } from "../utils/utils";
import { Store } from "../utils/store";
import { stringifyLex } from "@atproto/api";

Chart.register(...registerables);
Chart.register(WordCloudController, WordElement);

type Theme = "dark" | "light";

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
    @state()
    theme: Theme = "dark";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.theme = Store.getTheme() ?? "dark";
        this.setTheme(this.theme);
    }

    setTheme(theme: Theme) {
        Store.setTheme(theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }

    toggleTheme() {
        this.theme = this.theme == "dark" ? "light" : "dark";
        this.setTheme(this.theme);
    }

    render() {
        return html`<button class="flex items-center justify-center w-10 h-10" @click=${this.toggleTheme}>
            <i class="icon w-5 h-5">${this.theme == "dark" ? moonIcon : sunIcon}</i>
        </button>`;
    }
}

interface Language {
    code: string;
    name: string;
}

function populateLanguageSelect(selectElement: HTMLSelectElement | null) {
    if (!selectElement) return;

    const languages: Language[] = [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "de", name: "German" },
        { code: "it", name: "Italian" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "zh", name: "Chinese" },
        { code: "ja", name: "Japanese" },
        { code: "ko", name: "Korean" },
    ];

    const currentLang = navigator.language.split("-")[0];
    const currentLangName = new Intl.DisplayNames([currentLang], { type: 'language' }).of(currentLang);

    if (!languages.some(lang => lang.code === currentLang)) {
        languages.unshift({ code: currentLang, name: currentLangName || currentLang });
    }

    selectElement.innerHTML = languages
        .map((lang) => `<option value="${lang.code}" ${lang.code === currentLang ? "selected" : ""}>${lang.name}</option>`)
        .join("");
}

@customElement("sky-stats")
class SkyStats extends LitElement {
    @state()
    handle?: string;

    @state()
    days = 30;

    @state()
    language = "English";

    @state()
    brutal = false;

    @state()
    loading = false;

    @state()
    error?: string;

    @state()
    data?: ProfileData;

    @state()
    stats?: Stats;

    constructor() {
        super();
        const searchParams = new URL(location.href).searchParams;
        this.handle = searchParams.get("handle") ?? undefined;
        if (this.handle) this.handle = this.handle.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "");
        try {
            this.days = Number.parseInt(searchParams.get("days")!);
        } catch (e) {
            this.days = 30;
        }
        this.language = searchParams.get("language") ?? "English";
        this.brutal = searchParams.get("brutal") == "true";
        const cacheKey = "cache:" + this.handle;
        if (searchParams.get("cache") == "true" && localStorage.getItem(cacheKey)) {
            try {
                const {data, stats} = decompressJSON<{ data: ProfileData, stats: Stats}>(localStorage.getItem(cacheKey)!);
                this.data = data;
                this.stats = stats;
                this.loading = false;
            } catch (e) {
                console.error("Could not load cached data");
            }
        }
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    firstUpdate = true;
    protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.firstUpdate) {
            if (this.handle && !(this.data && this.stats)) this.load();
            this.firstUpdate = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValues): void {
        populateLanguageSelect(this.querySelector<HTMLSelectElement>("#language"));
    }

    async load() {
        this.loading = true;

        let handle = (this.handle ?? "").trim().replace("@", "");
        if (handle.length == 0) {
            this.error = "No account given";
            return;
        }
        if (!handle.includes(".")) handle += ".bsky.social";

        const result = await getProfileData(handle ?? "", this.days);
        if (result instanceof Error) {
            this.error = result.message;
        } else {
            this.data = result;
        }

        if (this.data) {
            const result = await calculateStats(this.data, this.language || "English", this.brutal);
            if (result instanceof Error) {
                this.error = result.message;
            } else {
                this.stats = result;
            }
        }
        this.loading = false;

        if (new URL(location.href).searchParams.get("cache") == "true") {
            const cacheKey = "cache:" + this.handle;
            const cacheItem = compressJSON({data: this.data, stats: this.stats});
            localStorage.setItem(cacheKey, cacheItem);
        }
    }

    viewAccount() {
        const accountElement = this.querySelector<HTMLInputElement>("#account");
        if (!accountElement) return;
        const daysElement = this.querySelector<HTMLInputElement>("#days");
        if (!daysElement) return;
        const languageElement = this.querySelector<HTMLInputElement>("#language");
        if (!languageElement) return;
        const brutalElement = this.querySelector<HTMLInputElement>("#brutal");
        if (!brutalElement) return;
        const newUrl =new URL(location.href);
        newUrl.searchParams.set("handle", accountElement.value.trim() ?? "");
        newUrl.searchParams.set("days", daysElement.value ?? "30");
        newUrl.searchParams.set("language", languageElement.value ?? "en");
        newUrl.searchParams.set("brutal", brutalElement.value ?? "false");
        location.href = newUrl.href;
    }

    render() {
        let content: TemplateResult | HTMLElement = html``;

        if (this.error) {
            content = html`<div>Sorry, something went wrong loading statistics for ${this.handle}</div>`;
        } else if (this.loading) {
            content = html` <div class="mx-auto">Fetching posts, calculating stats</div>
                <div class="mx-auto">This could take a little while (up to 30 seconds)</div>
                <div class="w-full mt-8 flex items-center justify-center">
                    <i class="icon !w-8 !h-8 text-link animate-spin">${spinnerIcon}</i>
                </div>`;
        } else if (this.data) {
            content = this.renderStats();
        } else {
            content = html` <div class="w-full max-w-[400px] border border-gray-300 rounded-lg shadow-2xl px-4 py-4 mx-auto flex flex-col gap-4 items-center">
                <div class="flex flex-col gap-1 items-start w-full">
                    <span class="text-gray-500 font-bold">Bluesky Account</span>
                    <input
                        id="account"
                        class="px-4 py-2 border border-gray-300 rounded-lg w-full"
                        placeholder="E.g. badlogic.bsky.social"
                    />
                </div>
                <div class="flex flex-col gap-2 items-start w-full">
                <span class="text-gray-500 font-bold">Timeframe</span>
                    <select id="days" class="px-4 py-2 border border-gray-300 text-gray-500 rounded-lg w-full">
                        <option value="7">Past 7 days</option>
                        <option value="30" selected>Past 30 days</option>
                        <option value="90">Past 90 days</option>
                        <option value="365">Past year</option>
                    </select>
                </div>
                <div class="flex flex-col gap-2 items-start w-full">
                    <span class="text-gray-500 font-bold">Style</span>
                    <select id="brutal" class="px-4 py-2 border border-gray-300 text-gray-500 rounded-lg w-full">
                        <option selected value="false">Gentle</option>
                        <option value="true">Brutal</option>
                    </select>
                </div>
                <div class="flex flex-col gap-2 items-start w-full">
                    <span class="text-gray-500 font-bold">Language</span>
                    <select id="language" class="px-4 py-2 border border-gray-300 text-gray-500 rounded-lg w-full"></select>
                </div>
                <button class="bg-blue-500 text-[#fff] shadow-md py-2 px-4 w-full rounded" @click=${this.viewAccount}>Let's GO!</button>
            </div>`;
        }

        return html` <main class="flex flex-col m-auto pb-8 h-full">
            <a target="_blank" href="https://bsky.app/profile/badlogic.bsky.social/post/3lazjayqwfk2q"
                class="mx-auto px-4 py-2 bg-yellow-50 border-b border-yellow-300 shadow-md text-xs font-bold text-blue-400 w-full text-center">
                Entertained? Consider donating to our 🇺🇦 charity
            </a>

            <a class="flex gap-2 items-center justify-center mt-12 px-8" href="/">
                <i class="w-[48px] inline-block">${blueskyIcon}</i>
                <h1 class="py-2 font-bold text-5xl bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Skystats</h1>
            </a>

            <!--<p class="text-center font-bold text-3xl my-4 text-gray-600">Summarize any Bluesky account</p>-->
            <p class="mt-2 px-8 font-bold text-center bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Summaries and statistics for any Bluesky account</p>

            <div class="flex-grow flex flex-col mt-14 px-4">${content}</div>

            <span class="flex-grow"></span>
            <div class="text-center text-gray-400 italic pb-4 max-w-[600px] mx-auto mt-16" style="font-size: 8px;">
                <a class="text-current" href="https://skystats.mariozechner.at" target="_blank">Skystats</a>
                is lovingly made by
                <a href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                Analyzed posts are sent to OpenAI for summarization, who may store the data for up to 30 days, but will not share it or use it for training or improving their services or models.</br>
                No data is collected by Skystats itself, not even your IP address.<br />
                <a href="https://github.com/badlogic/skystats-v2" target="_blank">Source code</a>
            </div>
        </main>`;
    }

    renderStats() {
        if (!this.data || !this.stats) return html``;

        const author = this.data.profile;
        const postsCount = this.data.posts.length;
        const repostsCount = this.stats.receivedReposts;
        const likeCount = this.stats.receivedLikes;
        const replyCount = this.stats.receivedReplies;
        const quoteCount = this.stats.receivedQuotes;
        const topRepliedTo = [...this.stats.interactedWith].filter((interaction) => interaction.profile).slice(0, 10);
        const topReposted = [...this.data.posts].sort((a, b) => (b.post.repostCount ?? 0) - (a.post.repostCount ?? 0)).slice(0, 5);
        const topQuoted = [...this.data.posts].sort((a, b) => (b.post.quoteCount ?? 0) - (a.post.quoteCount ?? 0)).slice(0, 5);
        const topLiked = [...this.data.posts].sort((a, b) => (b.post.likeCount ?? 0) - (a.post.likeCount ?? 0)).slice(0, 5);
        const topReplied = [...this.data.posts].sort((a, b) => (b.post.replyCount ?? 0) - (a.post.replyCount ?? 0)).slice(0, 5);
        const summaries = this.stats.summary.split(">>>").filter((s) => s.trim().length > 0);
        const summarySerious = summaries[0] ? summaries[0].replaceAll(">", "").trim() : "";
        const summaryHumorous = summaries[1] ? summaries[1].replaceAll(">", "").trim() : "";

        const statsDom = dom(html`
        <div class="flex flex-col gap-8 w-full max-w-[600px] mx-auto">
            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col gap-4 p-8">
                    <div class="flex items-center gap-4">
                        <a href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                            ${author.avatar ? html`<img class="w-16 h-16 rounded-full shadow-lg" src="${author.avatar}" />` : defaultAvatar}
                        </a>
                        <div class="flex flex-col items-start">
                            <a class="text-lg font-bold" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">${author.displayName ?? author.handle}</a>
                            <span class="text-xs text-gray-400">@${author.handle}</span>
                        </div>
                    </div>
                    <div class="text-sm text-gray-700 break-word">
                        ${this.data.profile.description ?? "No bio"}
                    </div>
                    <div class="flex gap-4 items-baseline">
                        <div>
                            <span class="text-sm font-bold">${this.data.profile.followsCount}</span>
                            <span class="text-sm text-gray-500">Following</span>
                        </div>
                        <div>
                            <span class="text-sm font-bold">${this.data.profile.followersCount}</span>
                            <span class="text-sm text-gray-500">Followers</span>
                        </div>
                    </div>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col gap-4 p-8">
                <div class="font-bold text-xl text-gray-700">Engagement past ${this.days} days</div>
                <div class="text-xs text-gray-400">Number of received reposts, quotes, replies, and likes.</div>
                <div class="w-full p-2 bg-green-100 border border-green-200 rounded-lg flex items-center justify-center gap-3 shadow-md">
                    <i class="icon w-6 h-6 text-green-600">${speechBubbleIcon}</i>
                    <span class="font-bold text-green-600">${postsCount}</span>
                    <span class="text-xs text-green-700 font-bold">Skeets</span>
                </div>
                <div class="w-full p-2 bg-cyan-100 border border-cyan-200 rounded-lg flex items-center justify-center gap-3 shadow-md">
                    <i class="icon w-6 h-6 text-cyan-600">${reblogIcon}</i>
                    <span class="font-bold text-cyan-600">${repostsCount}</span>
                    <span class="text-xs text-cyan-700 font-bold">Reposts</span>
                </div>
                <div class="w-full p-2 bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center gap-3 shadow-md">
                    <i class="icon w-6 h-6 text-blue-800">${quoteIcon}</i>
                    <span class="font-bold text-blue-800">${quoteCount}</span>
                    <span class="text-xs text-blue-700 font-bold">Quotes</span>
                </div>
                <div class="w-full p-2 bg-purple-100 border border-purple-200 rounded-lg flex items-center justify-center gap-3 shadow-md">
                    <i class="icon w-6 h-6 text-purple-600">${replyIcon}</i>
                    <span class="font-bold text-purple-600">${replyCount}</span>
                    <span class="text-xs text-purple-700 font-bold">Replies</span>
                </div>
                <div class="w-full p-2 bg-pink-100 border border-pink-200 rounded-lg flex items-center justify-center gap-3 shadow-md">
                    <i class="icon w-6 h-6 text-pink-600">${heartIcon}</i>
                    <span class="font-bold text-pink-600">${likeCount}</span>
                    <span class="text-xs text-pink-700 font-bold">Likes</span>
                </div>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col gap-4 p-8">
            ${summarySerious.trim().length > 0
                ? html`
                      <div class="font-bold text-xl text-gray-700">Content Summary</div>
                      <div class="text-gray-500 text-sm mb-2">
                          This summary is AI-generated based on top 100 posts by engagement (<a
                              href="https://github.com/badlogic/skystats-v2/blob/main/src/server/llm.ts#L33-L48"
                              >Prompt</a
                          >). As with all AI models, it may contain errors and misrepresent users' statements. This is experimental - interpret with
                          caution.
                      </div>
                      <div class="whitespace-pre-wrap leading-7">${summarySerious}</div>
                  `
                : ""}
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col gap-4 p-8">
            ${summaryHumorous.trim().length > 0
                ? html`
                      <div class="font-bold text-xl text-gray-700">🤡 Summary</div>
                      <div class="text-gray-500 text-sm mb-2">
                          This summary is AI-generated based on top 100 posts by engagement (<a
                              href="https://github.com/badlogic/skystats-v2/blob/main/src/server/llm.ts#L33-L48"
                              >Prompt</a
                          >). As with all AI models, it may contain errors and misrepresent users' statements. This is experimental - interpret with
                          caution.
                      </div>
                      <div class="whitespace-pre-wrap leading-7">${summaryHumorous}</div>
                  `
                : ""}

            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Replied the most to</div>
                ${map(
                    topRepliedTo,
                    (interaction) => html`<div class="flex items-center gap-2 py-4 px-8 text-blue-400 border-t border-gray-200">
                        <a class="flex items-center gap-2" target="_blank"
                            href="?handle=${interaction.profile!.handle ?? interaction.profile!.did}&days=${this.days}">
                            ${interaction.profile!.avatar
                                ? html`<img class="w-12 h-12 rounded-full shadow-lg" src="${interaction.profile!.avatar}" />`
                                : defaultAvatar}
                            <span class="font-bold text-md">${interaction.profile!.displayName ?? interaction.profile!.handle}</span>
                        </a>
                        <div class="ml-auto flex items-center text-green-600">
                            <span class="font-bold text-lg">${interaction.count}</span>
                            <i class="icon w-5 h-5">${closeIcon}</i>
                        </div>
                    </div> `
                )}
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Word cloud</div>
                <canvas id="wordCloud" class="border-t border-gray-300 h-[500px] max-h-[500px]" height="500"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Posts per day</div>
                <canvas id="postsPerDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Posts per time of day</div>
                <canvas id="postsPerTimeOfDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Posts per weekday</div>
                <canvas id="postsPerWeekday" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Received likes per day</div>
                <canvas id="likesPerDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Received reposts per day</div>
                <canvas id="repostsPerDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Received quotes per day</div>
                <canvas id="quotesPerDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Received replies per day</div>
                <canvas id="repliesPerDay" class="px-8 pb-4"></canvas>
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Top 5 reposted posts</div>
                ${map(topReposted, (post) => html`<div class="border-t border-gray-300 p-8">${renderPost(post)}</div>`)}
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Top 5 liked posts</div>
                ${map(topLiked, (post) => html`<div class="border-t border-gray-300 p-8">${renderPost(post)}</div>`)}
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Top 5 most replied to posts</div>
                ${map(topReplied, (post) => html`<div class="border-t border-gray-300 p-8">${renderPost(post)}</div>`)}
            </div>

            <div class="border border-gray-300 rounded-lg shadow-lg flex flex-col pt-4">
                <div class="px-8 pb-4 font-bold text-xl text-gray-700">Top 5 most quoted posts</div>
                ${map(topQuoted, (post) => html`<div class="border-t border-gray-300 p-8">${renderPost(post)}</div>`)}
            </div>
        </div>`)[0];

        this.renderWordCloud(this.stats, statsDom.querySelector<HTMLCanvasElement>("#wordCloud"));
        this.renderCharts(this.stats, statsDom);

        return statsDom;
    }

    renderWordCloud(stats: Stats, wordCloudCanvas: HTMLCanvasElement | null) {
        if (!wordCloudCanvas || !this.stats) return;
        const words = stats.words.map((word) => word.text).slice(0, 100);
        const maxCount = stats.words.reduce((prevWord, word) => (prevWord.count < word.count ? word : prevWord)).count;
        const wordFrequencies = stats.words.map((word) => 12 + (word.count / maxCount) * 72).slice(0, 100);
        const maxSize = 82;
        let ctx = wordCloudCanvas.getContext("2d");

        if (ctx) {
            new Chart(ctx, {
                type: WordCloudController.id,
                data: {
                    labels: words,
                    datasets: [
                        {
                            data: wordFrequencies,
                            color: wordFrequencies.map((w) => {
                                const scale = w / maxSize;
                                return `hsl(210, ${50 + scale * 30}%, ${85 - scale * 40}%)`;
                            }),
                        },
                    ],
                },
                options: {
                    plugins: {
                        tooltip: {
                            enabled: false,
                        },
                        legend: {
                            display: false,
                        },
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1000,
                        easing: "easeInOutQuart",
                    },
                },
            });
        }
    }

    renderCharts(stats: Stats, statsDom: Element) {
        const chartOptions = {
            scales: {
                x: {
                    grid: { display: false },
                },
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                },
            },
            plugins: {
                legend: {
                    display: false, // Hide the legend box and all labels
                },
            },
        };

        const postsPerDayCanvas = statsDom.querySelector("#postsPerDay") as HTMLCanvasElement;
        const dates = generateDates(this.days);
        const postsPerDay = dates.map((date) => (stats.postsPerDate[date] ? stats.postsPerDate[date].length : 0));
        let ctx = postsPerDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: dates,
                    datasets: [
                        {
                            data: postsPerDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const postsPerTimeOfDayCanvas = statsDom.querySelector("#postsPerTimeOfDay") as HTMLCanvasElement;
        const hours = generateHours();
        const postsPerTimeOfDay = hours.map((hour) => (stats.postsPerTimeOfDay[hour] ? stats.postsPerTimeOfDay[hour].length : 0));
        ctx = postsPerTimeOfDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: hours,
                    datasets: [
                        {
                            data: postsPerTimeOfDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const postsPerWeekdayCanvas = statsDom.querySelector("#postsPerWeekday") as HTMLCanvasElement;
        const days = generateWeekdays();
        const postsPerWeekday = days.map((day) => (stats.postsPerWeekday[day] ? stats.postsPerWeekday[day].length : 0));
        ctx = postsPerWeekdayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: days,
                    datasets: [
                        {
                            data: postsPerWeekday,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const likesPerDayCanvas = statsDom.querySelector("#likesPerDay") as HTMLCanvasElement;
        const likesPerDay = dates.map((day) => (stats.likesPerDate[day] ? stats.likesPerDate[day] : 0));
        ctx = likesPerDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: dates,
                    datasets: [
                        {
                            data: likesPerDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const repostsPerDayCanvas = statsDom.querySelector("#repostsPerDay") as HTMLCanvasElement;
        const repostsPerDay = dates.map((day) => (stats.repostsPerDate[day] ? stats.repostsPerDate[day] : 0));
        ctx = repostsPerDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: dates,
                    datasets: [
                        {
                            data: repostsPerDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const quotesPerDayCanvas = statsDom.querySelector("#quotesPerDay") as HTMLCanvasElement;
        const quotesPerDay = dates.map((day) => (stats.quotesPerDate[day] ? stats.quotesPerDate[day] : 0));
        ctx = quotesPerDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: dates,
                    datasets: [
                        {
                            data: quotesPerDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }

        const repliesPerDayCanvas = statsDom.querySelector("#repliesPerDay") as HTMLCanvasElement;
        const repliesPerDay = dates.map((day) => (stats.repliesPerDate[day] ? stats.repliesPerDate[day] : 0));
        ctx = repliesPerDayCanvas.getContext("2d");
        if (ctx) {
            new Chart(ctx, {
                type: "bar",
                data: {
                    labels: dates,
                    datasets: [
                        {
                            data: repliesPerDay,
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                        },
                    ],
                },
                options: chartOptions,
            });
        }
    }
}
