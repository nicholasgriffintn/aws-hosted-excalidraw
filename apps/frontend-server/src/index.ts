import compression from "compression";
import express from "express";
import type { Request } from "express";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

const PORT = Number(process.env.PORT ?? 3000);
const API_BASE_URL = process.env.EXCALIDRAW_API_URL;
const WS_BASE_URL = process.env.EXCALIDRAW_WS_URL;
const AWS_REGION = process.env.AWS_REGION ?? "eu-west-1";
const AWS_PROFILE = process.env.AWS_PROFILE;

if (!API_BASE_URL) {
  throw new Error("EXCALIDRAW_API_URL must be configured");
}

if (!WS_BASE_URL) {
  throw new Error("EXCALIDRAW_WS_URL must be configured");
}

const credentialProvider = AWS_PROFILE
  ? fromNodeProviderChain({ profile: AWS_PROFILE })
  : fromNodeProviderChain();

class NodeCryptoSha256 {
  private readonly hash = createHash("sha256");

  update(data: Uint8Array): void {
    this.hash.update(data);
  }

  async digest(): Promise<Uint8Array> {
    return this.hash.digest();
  }
}

const signer = new SignatureV4({
  credentials: credentialProvider,
  region: AWS_REGION,
  service: "execute-api",
  sha256: NodeCryptoSha256,
});

const __filename = fileURLToPath(import.meta.url);

export function createFrontendServer() {
  const app = express();
  const distDir = path.resolve(process.cwd(), "apps/frontend/dist");
  const rawBodyParser = express.raw({ type: "*/*", limit: "10mb" });

  app.disable("x-powered-by");
  app.use(compression());
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use(express.static(distDir));

  const isStaticExtension = (path: string) => {
    return path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js") || path.endsWith(".json") || path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".gif") || path.endsWith(".svg") || path.endsWith(".ico") || path.endsWith(".webp") || path.endsWith(".woff") || path.endsWith(".woff2") || path.endsWith(".ttf") || path.endsWith(".eot") || path.endsWith(".otf") || path.endsWith(".webmanifest") || path.endsWith(".map");
  };

  app.get("/health", async (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", rawBodyParser, async (req, res): Promise<void> => {
    try {
      if (!API_BASE_URL) {
        res
          .status(500)
          .json({ message: "Excalidraw API upstream is not configured" });
        return;
      }

      const upstreamUrl = resolveUpstreamUrl(API_BASE_URL, req.originalUrl);
      const body =
        Buffer.isBuffer(req.body) && req.body.length > 0
          ? Buffer.from(req.body)
          : undefined;

      const headers = buildUpstreamHeaders(req.headers, upstreamUrl.host, body);

      const request = new HttpRequest({
        protocol: upstreamUrl.protocol as "http:" | "https:",
        hostname: upstreamUrl.hostname,
        port: Number(upstreamUrl.port) || undefined,
        method: req.method ?? "GET",
        path: upstreamUrl.pathname + upstreamUrl.search,
        headers,
        body,
      });

      const signedRequest = await signer.sign(request);
      const requestUrl = formatRequestUrl(signedRequest as HttpRequest);

      const fetchHeaders = new Headers();
      Object.entries(signedRequest.headers ?? {}).forEach(([key, value]) => {
        if (
          !value ||
          key.toLowerCase() === "host" ||
          key.toLowerCase() === "content-length"
        ) {
          return;
        }
        fetchHeaders.set(key, value as string);
      });
      if (body) {
        fetchHeaders.set("content-length", String(body.length));
      }

      const upstreamResponse = await fetch(requestUrl, {
        method: signedRequest.method,
        headers: fetchHeaders,
        body,
        redirect: "manual",
      });

      res.status(upstreamResponse.status);
      upstreamResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === "transfer-encoding") {
          return;
        }
        res.setHeader(key, value);
      });

      if (upstreamResponse.body) {
        const arrayBuffer = await upstreamResponse.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Proxy request failed", error);
      res
        .status(502)
        .json({ message: "Failed to reach Excalidraw API upstream" });
    }
  });

  app.get("/ws/presign", async (req, res) => {
    try {
      if (!WS_BASE_URL) {
        res
          .status(500)
          .json({ message: "Excalidraw WebSocket upstream is not configured" });
        return;
      }

      const upstreamUrl = new URL(WS_BASE_URL);
      const combinedQuery = new URLSearchParams(upstreamUrl.search);

      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) {
          if (value.length > 0 && typeof value[0] === "string") {
            combinedQuery.set(key, value[0]);
          }
        } else if (value !== undefined && typeof value === "string") {
          combinedQuery.set(key, value);
        }
      }

      const teamHeader = req.header("x-excalidraw-team-id");
      if (teamHeader && !combinedQuery.has("teamId")) {
        combinedQuery.set("teamId", teamHeader);
      }

      const userHeader = req.header("x-excalidraw-user-id");
      if (userHeader && !combinedQuery.has("userId")) {
        combinedQuery.set("userId", userHeader);
      }

      const presignRequest = new HttpRequest({
        protocol: "https:",
        hostname: upstreamUrl.hostname,
        port: Number(upstreamUrl.port) || undefined,
        method: "GET",
        path: upstreamUrl.pathname,
        headers: {
          host: upstreamUrl.host,
        },
        query: Object.fromEntries(combinedQuery.entries()),
      });

      const presigned = await signer.presign(presignRequest, { expiresIn: 60 });
      const signedUrl = formatRequestUrl(presigned as HttpRequest).replace(
        /^https:/,
        "wss:"
      );

      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Failed to presign websocket URL", error);
      res
        .status(500)
        .json({ message: "Unable to prepare realtime connection" });
    }
  });

  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health" || req.path.startsWith("/ws") || isStaticExtension(req.path)) {
      return next();
    }
    res.sendFile(path.join(distDir, "index.html"));
  });

  return app;
}

const app = createFrontendServer();

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  app.listen(PORT, () => {
    console.log(
      `Excalidraw frontend server listening on port ${PORT} (region=${AWS_REGION}${AWS_PROFILE ? `, profile=${AWS_PROFILE}` : ""
      })`
    );
  });
}

function resolveUpstreamUrl(baseUrl: string, originalPath: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const relativePath = originalPath.replace(/^\/api/, "");
  const trimmedRelative =
    relativePath.length > 0 ? relativePath.replace(/^\//, "") : "";
  return new URL(trimmedRelative, normalizedBase);
}

function buildUpstreamHeaders(
  requestHeaders: Request["headers"],
  host: string,
  body?: Buffer
): Record<string, string> {
  const headers: Record<string, string> = {
    host,
    accept: "application/json",
  };

  const passThroughHeaders = [
    "content-type",
    "accept",
    "x-excalidraw-team-id",
    "x-excalidraw-user-id",
  ];

  for (const header of passThroughHeaders) {
    const value = requestHeaders[header];
    if (typeof value === "string") {
      headers[header] = value;
    }
  }

  if (body) {
    headers["content-length"] = String(body.length);
  }

  return headers;
}

function formatRequestUrl(request: HttpRequest): string {
  const protocol = request.protocol ?? "https:";
  const hostname = request.hostname ?? request.headers?.host;

  if (!hostname) {
    throw new Error("Signed request missing hostname");
  }

  const portSegment = request.port ? `:${request.port}` : "";

  let pathname = request.path ?? "/";
  let existingQuery = "";
  if (pathname.includes("?")) {
    const [pathPart, queryPart] = pathname.split("?", 2);
    pathname = pathPart;
    existingQuery = queryPart ?? "";
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  const url = new URL(`${protocol}//${hostname}${portSegment}`);
  url.pathname = pathname;

  if (existingQuery) {
    new URLSearchParams(existingQuery).forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  const queryBag = request.query;
  if (queryBag) {
    for (const [key, value] of Object.entries(queryBag)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry !== undefined) {
            url.searchParams.append(key, entry);
          }
        });
      } else if (typeof value === "string") {
        url.searchParams.append(key, value);
      }
    }
  }

  return url.toString();
}
