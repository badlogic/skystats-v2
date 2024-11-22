import { getEncoding } from "js-tiktoken";
import {OpenAI} from "openai";
import { ChatCompletionMessage, ChatCompletionMessageParam } from "openai/resources";

const openaiKey = process.env.OPENAI_KEY;
if (!openaiKey) {
    console.error("Please provide your OpenAI key via the env var OPENAI_KEY");
    process.exit(-1);
}

const openAI = new OpenAI({ apiKey: openaiKey });
const modelName = "gpt-4o-mini";
const maxTokens = 4096;
const temperature = 0.75;

const enc = getEncoding("cl100k_base");
const getNumTokens = (message: string) => enc.encode(message).length;

export async function summarize(texts: string[]) {
    let concatenatedTexts = "";
    let numTokens = 0;

    for (const text of texts.map((text) => text.replace('`', ''))) {
        const textToAppend = "```\n" + text + "\n```\n\n";
        let numTextTokens = getNumTokens(textToAppend);
        if (numTokens + numTextTokens > maxTokens) {
            break;
        }
        concatenatedTexts += textToAppend;
        numTokens += numTextTokens;
    }

    const prompt = `
    You are given posts from a single account on BlueSky, in descending order by engagement. Each post is delimited
    by three backticks. The posts were on BlueSky, not Twitter. Here are the posts.

    ${concatenatedTexts}

    Create a serious and a humorous summary of the account's content, each 2-3 paragraphs long. Separate the two summaries
    by a single line with the content ">>>>>>>>>>>>>".

    The serious summary should highlight topics the account discusses. Readers of the summary should get a good idea what
    specific topics they can expect from the account.

    The humorous summary can make fun of the account, but should not be mean, discriminatory, or otherwise offensive or hurtful. Do not use
    phrases like "swiss army knife", "roller coaster", "buffet", "Welcome to the ... world", "soap opera", "grab your popcorn", and so on. Stay away from bland, stereotypical
    analogies.

    Only output the summaries as instructed. Write in English. Do not output headers like "Serious Summary:" or similar.
    `
    const messages: ChatCompletionMessageParam[] = [{
        role: "system",
        content: prompt
    }]
    const response = await openAI.chat.completions.create({
        model: modelName,
        messages,
        temperature
    })
    return response.choices[0].message.content;
}