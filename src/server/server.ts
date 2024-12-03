import bodyParser, { json } from "body-parser";
import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { summarize } from "./llm";

const port = process.env.PORT ?? 3333;
const openaiKey = process.env.OPENAI_KEY;
if (!openaiKey) {
    console.error("Please provide your OpenAI key via the env var OPENAI_KEY");
    process.exit(-1);
}

(async () => {
    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(json());
    app.use(bodyParser.urlencoded({ extended: true }));

    const BLOCKED_BOTS = ["googlebot", "bingbot", "yandexbot", "baiduspider"];

    app.use((req, res, next) => {
        const userAgent = req.get("User-Agent")?.toLowerCase() || "";
        if (BLOCKED_BOTS.some((bot) => userAgent.includes(bot))) {
            return res.status(403).send("Not allowed");
        }
        next();
    });

    let summaryCache: Record<string, string> = {};

    app.get("/api/clear", (req, res) => {
        summaryCache = {};
        res.json("OK");
    });

    app.post("/api/summarize", async (req, res) => {
        try {
            const body: { key: string; posts: string[]; language: string, brutal?: boolean } = req.body;
            const key = body.key + body.language + body.brutal;
            const summary = summaryCache[key] ? summaryCache[key] : await summarize(body.posts, body.language, body.brutal == true);
            if (summary) {
                summaryCache[key] = summary;
            }
            res.json({ summary });
        } catch (e) {
            console.error(e);
            res.status(500);
        }
    });

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);
})();

function setupLiveReload(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const clients: Set<WebSocket> = new Set();
    wss.on("connection", (ws: WebSocket) => {
        clients.add(ws);
        ws.on("close", () => {
            clients.delete(ws);
        });
    });

    chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
