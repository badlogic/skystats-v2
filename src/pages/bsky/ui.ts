import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyEmbedVideo,
    AppBskyFeedDefs,
    AppBskyGraphDefs,
    AppBskyLabelerDefs,
    RichText,
} from "@atproto/api";
import { AppBskyFeedPost } from "@atproto/api/";
import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import Hls from "hls.js";
import { LitElement, PropertyValues, TemplateResult, html, nothing, svg } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, property } from "lit/decorators.js";
import { heartIcon, quoteIcon, reblogIcon, speechBubbleIcon } from "../../utils/icons";

@customElement("hls-video")
class HlsVideo extends LitElement {
    @property()
    src?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValues): void {
        const video = this.querySelector("video");
        if (!video) return;
        const hls = new Hls();
        hls.loadSource(this.src ?? "");
        hls.attachMedia(video);
    }

    protected render(): unknown {
        return html`<video class="w-full" controls></video>`;
    }
}

@customElement("text-overlay")
export class TextOverlay extends LitElement {
    @property()
    buttonText = "Click me";

    @property()
    show = false;

    @property()
    text = "";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected render(): TemplateResult {
        return html`<div class="relative">
            <button @click=${() => (this.show = !this.show)} class="rounded bg-hinted-fg p-1 text-white text-xs">${this.buttonText}</button>
            ${this.show
                ? html`<button @click=${() => (this.show = !this.show)} class="absolute bg-black text-white p-4 rounded-lg border border-muted">
                      <div class="w-[250px]">${this.text}</div>
                  </button>`
                : nothing}
        </div> `;
    }
}

function getTimeDifferenceString(inputDate: string): string {
    const currentDate = new Date();
    const inputDateTime = new Date(inputDate);

    const timeDifference = currentDate.getTime() - inputDateTime.getTime();
    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years}y}`;
    } else if (days > 0) {
        return `${days}d`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

function replaceHandles(text: string): string {
    const handleRegex = /@([\p{L}_.-]+)/gu;
    const replacedText = text.replace(handleRegex, (match, handle) => {
        return `<a href="https://bsky.app/profile/${handle}" target="_blank">@${handle}</a>`;
    });

    return replacedText;
}

function applyFacets(record: AppBskyFeedPost.Record) {
    if (!record.facets) {
        return record.text;
    }

    const rt = new RichText({
        text: record.text,
        facets: record.facets as any,
    });

    const text: string[] = [];

    for (const segment of rt.segments()) {
        if (segment.isMention()) {
            text.push(`<a href="https:///profile/${segment.mention?.did}" target="_blank">${segment.text}</a>`);
        } else if (segment.isLink()) {
            text.push(`<a href="${segment.link?.uri}" target="_blank">${segment.text}</a>`);
        } else if (segment.isTag()) {
            text.push(`<span class="text-blue-500">${segment.text}</span>`);
        } else {
            text.push(segment.text);
        }
    }
    const result = text.join("");
    return result;
}

function processText(record: AppBskyFeedPost.Record) {
    return replaceHandles(applyFacets(record)).trim().replaceAll("\n", "<br/>");
}

function renderEmbeddedRecord(record: AppBskyEmbedRecord.View["record"]): ReturnType<typeof html> {
    if (AppBskyEmbedRecord.isViewRecord(record)) {
        const postText =
            record.value && AppBskyFeedPost.isRecord(record.value) ? unsafeHTML(processText(record.value)) : html`<div>Unsupported record type</div>`;
        const embed = renderEmbed(record.embeds ? record.embeds[0] : undefined);
        return html`<div class="rounded-lg border border-muted mt-4 p-4">
            ${renderPostHeader(record.author, record.uri, record.indexedAt, true)}
            <div class="mb-2">${postText}</div>
            ${embed}
        </div>`;
    } else if (AppBskyEmbedRecord.isViewNotFound(record)) {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 text-red-500">Post not found</div>`;
    } else if (AppBskyEmbedRecord.isViewBlocked(record)) {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 text-yellow-500">This content is blocked</div>`;
    } else if (AppBskyEmbedRecord.isViewDetached(record)) {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 text-gray-500">Content no longer available</div>`;
    } else if (AppBskyFeedDefs.isGeneratorView(record)) {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 bg-blue-50 p-4">Feed Generator: ${record.displayName}</div>`;
    } else if (AppBskyGraphDefs.isListView(record)) {
        return html`<div class="flex flex-col items-centered rounded-lg border border-muted mt-4 p-4 p-4">
                <h2>${record.name ?? "(No name given)"}</h2>
                <div>${record.description ?? "(No description given)"}</div>
                <div class="mt-4 flex gap-2 text-muted-fg text-sm"><span>A list by</span> ${renderProfile(record.creator, true)}</div>
            </div>
        </div>`
    } else if (AppBskyLabelerDefs.isLabelerView(record)) {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 bg-green-50 p-4">Labeler: ${record.displayName}</div>`;
    } else if (AppBskyGraphDefs.isStarterPackViewBasic(record)) {
        return html`<div class="flex flex-col items-centered rounded-lg border border-muted mt-4 p-4 p-4">
                <h2>${(record.record as any).name ?? "(No name given)"}</h2>
                <div>${(record.record as any).description ?? "(No description given)"}</div>
                <div class="mt-4 flex gap-2 text-muted-fg text-sm"><span>A started pack by</span> ${renderProfile(record.creator, true)}</div>
            </div>
        </div>`;
    } else {
        return html`<div class="rounded-lg border border-muted mt-4 p-4 text-red-500">Unknown embedded record type: ${record.$type}</div>`;
    }
}

function renderEmbeddedimages(images: AppBskyEmbedImages.View) {
    return html`<div class="flex flex-col gap-2">${images.images.map((img) =>
        html`<div class="rounded-lg relative flex flex-col items-center">
            <img class="w-full rounded-lg" src="${img.thumb}" alt="${img.alt}" />
            ${img.alt && img.alt.length > 0
                            ? html`<text-overlay buttonText="ALT" text="${img.alt}" class="absolute left-1 bottom-1 cursor-pointer">
                              </text-overlay>`
                            : nothing}
        </div>`)}</div>`;
}

export const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

function renderProfile(profile: ProfileViewBasic, small: boolean = false) {
    if (!small) {
        return html`<a class="flex items-center gap-2" href="https://bsky.app/profile/${profile.handle ?? profile.did}" target="_blank">
            ${profile.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${profile.avatar}" />` : defaultAvatar}
            <span>${profile.displayName ?? profile.handle}</span>
        </a>`;
    } else {
        return html`<a class="flex items-center gap-2" href="https://bsky.app/profile/${profile.handle ?? profile.did}" target="_blank">
            ${profile.avatar ? html`<img class="w-[1.5em] h-[1.5em] rounded-full" src="${profile.avatar}" />` : defaultAvatar}
            <span class="text-sm">${profile.displayName ?? profile.handle}</span>
        </a>`;
    }
}

function renderEmbed(embed: PostView["embed"] | undefined): ReturnType<typeof html> {
    if (embed) {
        if (AppBskyEmbedImages.isView(embed)) {
            return renderEmbeddedimages(embed);
        } else if (AppBskyEmbedVideo.isView(embed)) {
            return html` <hls-video src="${embed.playlist}"></hls-video> `;
        } else if (AppBskyEmbedRecord.isView(embed)) {
            return html`<div class="quote">${renderEmbeddedRecord(embed.record)}</div>`;
        } else if (AppBskyEmbedRecordWithMedia.isView(embed)) {
            return html`
                ${renderEmbed(embed.media)}
                <div class="quote">${renderEmbeddedRecord(embed.record.record)}</div>
            `;
        } else if (AppBskyEmbedExternal.isView(embed)) {
            return html`
                <a href="${embed.external.uri}" class="border border-muted rounded-lg" target="_blank" style="display: block">
                    ${embed.external.thumb ? html`<img class="rounded-t-lg" src="${embed.external.thumb}" alt="${embed.external.title}" />` : html``}
                    <div class="p-4 ${embed.external.thumb ? "border-t border-muted" : ""}">
                        <div class="text-primary-fg truncate">${embed.external.title}</div>
                        <div class="text-xs text-muted-fg truncate">${embed.external.uri}</div>
                    </div>
                </a>
            `;
        } else {
            return html``;
        }
    } else {
        return html``;
    }
}

export function renderPostHeader(profile: ProfileViewBasic, uri: string, createdAt: string, small: boolean) {
    return html`<div class="flex items-center gap-2 mb-2">
        ${renderProfile(profile, small)}
        <div class="flex-grow"></div>
        <a class="text-xs" href="https://bsky.app/profile/${profile.did}/post/${uri.replace("at://", "").split("/")[2]}" target="_blank"
            >${getTimeDifferenceString(createdAt)}</a
        >
    </div>`;
}

export function renderPost(post: FeedViewPost): ReturnType<typeof html> {
    const record = post.post.record;
    if (!AppBskyFeedPost.isRecord(record)) return html`<div>Expected a feed post record</div>`;

    const postText = unsafeHTML(processText(record));
    const embedContent = renderEmbed(post.post.embed);
    let inReplyTo: ReturnType<typeof html> = html``;
    if (post.reply) {
        if (AppBskyFeedDefs.isPostView(post.reply.parent)) {
            inReplyTo = html`<div class="flex items-center gap-2 text-xs text-muted-fg mb-2"><div>In reply to</div>${renderProfile(post.reply.parent.author)}</div>`
        }
    }

    const postClicked = (ev: Event) => {
        const target = ev.target as HTMLElement;
        const isClickableElement = target.closest('a') || target.closest('button') || target.closest('video') || target.closest('text-overlay');

        if (!isClickableElement) {
            ev.preventDefault();
            window.open(`https://bsky.app/profile/${post.post.author.did}/post/${post.post.uri.replace("at://", "").split("/")[2]}`, '_blank');
        }
    };

    return html`<div class="rounded-lg border border-muted mt-4 p-4 cursor-pointer w-full" @click=${(ev: Event) => postClicked(ev)}>
        ${renderPostHeader(post.post.author, post.post.uri, record.createdAt, false)}
        ${inReplyTo}
        <div class="mb-2">${postText}</div>
        ${embedContent}
        <div class="flex items-center gap-4 mt-4">
            <span class="flex items-center gap-2"><i class="icon h-4">${speechBubbleIcon}</i> ${post.post.replyCount ?? 0}</span>
            <span class="flex items-center gap-2"><i class="icon h-4">${reblogIcon}</i> ${post.post.repostCount ?? 0}</span>
            <span class="flex items-center gap-2"><i class="icon h-4">${quoteIcon}</i> ${post.post.quoteCount ?? 0}</span>
            <span class="flex items-center gap-2"><i class="icon h-4">${heartIcon}</i> ${post.post.likeCount ?? 0}</span>
            <div></div>
        </div>
    </div> `;
}