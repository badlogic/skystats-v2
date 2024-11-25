import { LitElement, PropertyValueMap, PropertyValues, TemplateResult, html } from "lit";
import { map } from "lit-html/directives/map.js";
import { customElement, state } from "lit/decorators.js";
import { getProfileData, ProfileData } from "./bsky/data";
import { moonIcon, spinnerIcon, sunIcon } from "../utils/icons";
import { defaultAvatar, renderPost } from "./bsky/ui";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { calculateStats, Stats } from "./bsky/stats";
import { dom } from "../utils/ui-components";

import { Chart, registerables } from "chart.js";
import { WordCloudController, WordElement } from "chartjs-chart-wordcloud";
import { generateDates, generateHours, generateWeekdays } from "../utils/utils";
import { Store } from "../utils/store";

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
    loading = false;

    @state()
    error?: string;

    @state()
    data?: ProfileData;

    @state()
    stats?: Stats;

    constructor() {
        super();
        this.handle = new URL(location.href).searchParams.get("handle") ?? undefined;
        if (this.handle) this.handle = this.handle.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "");
        try {
            this.days = Number.parseInt(new URL(location.href).searchParams.get("days")!);
        } catch (e) {
            this.days = 30;
        }
        this.language = new URL(location.href).searchParams.get("language") ?? "English";
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    firstUpdate = true;
    protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.firstUpdate) {
            if (this.handle) this.load();
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
            const result = await calculateStats(this.data, this.language || "English");
            if (result instanceof Error) {
                this.error = result.message;
            } else {
                this.stats = result;
            }
        }
        this.loading = false;
    }

    viewAccount() {
        const accountElement = this.querySelector<HTMLInputElement>("#account");
        if (!accountElement) return;
        const daysElement = this.querySelector<HTMLInputElement>("#days");
        if (!daysElement) return;
        const languageElement = this.querySelector<HTMLInputElement>("#language");
        if (!languageElement) return;
        const newUrl = new URL(location.href);
        newUrl.searchParams.set("handle", accountElement.value.trim() ?? "");
        newUrl.searchParams.set("days", daysElement.value ?? "30");
        newUrl.searchParams.set("language", languageElement.value ?? "en");
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
            content = html` <div class="mx-auto max-w-[400px] flex flex-col items-center">
                <label
                    >BlueSky account stats for the last
                    <input
                        id="days"
                        type="number"
                        min="1"
                        max="365"
                        value="30"
                        class="bg-transparent text-center border rounded outline-none p-1 border-gray/75"
                    />
                    day(s)</label
                >
                <label class="mt-2"
                    >Summary language
                    <select id="language" class="bg-transparent text-center border rounded outline-none p-1 border-gray/75"></select
                ></label>
                <div class="w-full flex mt-4">
                    <input
                        id="account"
                        class="flex-1 bg-none border-l border-t border-b border-gray/75 outline-none rounded-l text-black px-2 py-2"
                        placeholder="Account, e.g. badlogic.bsky.social"
                    />
                    <button class="align-center rounded-r bg-primary text-[#fff] px-4" @click=${this.viewAccount}>View</button>
                </div>
            </div>`;
        }

        return html` <main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <div class="relative">
                <a class="w-full text-2xl flex items-center justify-center text-primary font-bold text-center mt-8 mb-4" href="/">
                    <i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i>
                    <span class="ml-2">Skystats</span>
                </a>
                <theme-toggle class="absolute right-0 top-0 w-10 h-10"></theme-toggle>
            </div>
            <span class="text-sm text-center mb-12">Entertained? Consider donating to our <a target="_blank" href="https://bsky.app/profile/badlogic.bsky.social/post/3lazjayqwfk2q">🇺🇦 charity</a></span>
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">
                <a href="https://skystats.mariozechner.at" target="_blank">Skystats</a>
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

        const statsDom = dom(html`<div class="">
            <div class="flex flex-col items-center">
                <a class="text-center" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                    ${author.avatar ? html`<img class="w-[6em] h-[6em] rounded-full" src="${author.avatar}" />` : defaultAvatar}
                </a>
                <a class="text-center mt-4" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                    <span class="text-xl">${author.displayName ?? author.handle}</span>
                </a>
            </div>
            <div class="mx-auto font-bold text-xl text-center mt-4">${this.days} day(s) activity</div>
            <div class="text-center text-lg flex flex-col">
                <span>Posted <span class="text-primary">${postsCount}</span> skeets</span>
                <span>Received <span class="text-primary">${repostsCount}</span> reposts</span>
                <span>Received <span class="text-primary">${quoteCount}</span> quotes</span>
                <span>Received <span class="text-primary">${likeCount}</span> likes</span>
                <span>Received <span class="text-primary">${replyCount}</span> replies</span>
            </div>
            ${summarySerious.trim().length > 0
                ? html`
                      <div class="font-bold text-xl underline mt-8 mb-4">Content Summary</div>
                      <div class="text-muted-fg text-sm mb-2">
                          This summary is AI-generated based on top 100 posts by engagement (<a
                              href="https://github.com/badlogic/skystats-v2/blob/main/src/server/llm.ts#L33-L48"
                              >Prompt</a
                          >). As with all AI models, it may contain errors and misrepresent users' statements. This is experimental - interpret with
                          caution.
                      </div>
                      <div class="whitespace-pre-wrap">${summarySerious}</div>
                  `
                : ""}
            ${summaryHumorous.trim().length > 0
                ? html`
                      <div class="font-bold text-xl underline mt-8 mb-4">🤡 Summary</div>
                      <div class="text-muted-fg text-sm mb-2">
                          This summary is AI-generated based on top 100 posts by engagement (<a
                              href="https://github.com/badlogic/skystats-v2/blob/main/src/server/llm.ts#L33-L48"
                              >Prompt</a
                          >). As with all AI models, it may contain errors and misrepresent users' statements. This is experimental - interpret with
                          caution.
                      </div>
                      <div class="whitespace-pre-wrap">${summaryHumorous}</div>
                  `
                : ""}
            <div class="font-bold text-xl underline mt-8 mb-4">Replied the most to</div>
            ${map(
                topRepliedTo,
                (interaction) => html`<div class="flex items-center gap-2 mb-2">
                    <a
                        class="flex items-center gap-2"
                        href="?handle=${interaction.profile!.handle ?? interaction.profile!.did}&days=${this.days}"
                        target="_blank"
                    >
                        ${interaction.profile!.avatar
                            ? html`<img class="w-[2em] h-[2em] rounded-full" src="${interaction.profile!.avatar}" />`
                            : defaultAvatar}
                        <span>${interaction.profile!.displayName ?? interaction.profile!.handle}</span>
                    </a>
                    <span class="text-lg">${interaction.count} times</span>
                </div> `
            )}
            <div class="font-bold text-xl underline mt-8 mb-4">Word cloud</div>
            <canvas id="wordCloud" class="mt-4 h-[500px] max-h-[500px]" height="500"></canvas>

            <div class="font-bold text-xl underline mt-8">Posts per day</div>
            <canvas id="postsPerDay" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Posts per time of day</div>
            <canvas id="postsPerTimeOfDay" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Posts per weekday</div>
            <canvas id="postsPerWeekday" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Received likes per day</div>
            <canvas id="likesPerDay" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Received reposts per day</div>
            <canvas id="repostsPerDay" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Received quotes per day</div>
            <canvas id="quotesPerDay" class="mt-4"></canvas>
            <div class="font-bold text-xl underline mt-8">Received replies per day</div>
            <canvas id="repliesPerDay" class="mt-4"></canvas>

            <div class="font-bold text-xl underline mt-8">Top 5 reposted posts</div>
            <div>${map(topReposted, (post) => renderPost(post))}</div>
            <div class="font-bold text-xl underline mt-8">Top 5 liked posts</div>
            <div>${map(topLiked, (post) => renderPost(post))}</div>
            <div class="font-bold text-xl underline mt-8">Top 5 most replied to posts</div>
            <div>${map(topReplied, (post) => renderPost(post))}</div>
            <div class="font-bold text-xl underline mt-8">Top 5 most quoted posts</div>
            <div>${map(topQuoted, (post) => renderPost(post))}</div>
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
