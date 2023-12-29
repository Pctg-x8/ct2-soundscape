import { broadcastDevReady, createRequestHandler, logDevReady } from "@remix-run/cloudflare";
import type { Fetcher } from "@remix-run/react";
import * as build from "../build";
import __STATIC_CONTENT_MANIFEST from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import {
    CloudflareContentRepository,
    CloudflareLocalContentRepository,
    type ContentRepository,
    Skip32ContentIdObfuscator,
} from "soundscape-shared/src/content";
import { type D1Database, type R2Bucket } from "@cloudflare/workers-types";
// @ts-ignore
import { AwsClient } from "aws4fetch";
import { parseHexStringBytes } from "soundscape-shared/src/utils/hexstring";
import * as zod from "zod";
import * as cookie from "cookie";

const MANIFEST = JSON.parse(__STATIC_CONTENT_MANIFEST);
const handleRemixRequest = createRequestHandler(build, process.env.NODE_ENV);

const JWKSchema = zod.object({ kid: zod.string(), cert: zod.string() });
export type JWK = zod.infer<typeof JWKSchema>;
const JwksDocumentSchema = zod.object({ keys: zod.array(JWKSchema) });
type JwksDocument = zod.infer<typeof JwksDocumentSchema>;

class JwksClient {
    private loadedCerts: JwksDocument | undefined = undefined;
    private pendingLoaders: [(d: JwksDocument) => void, (e: unknown) => void][] = [];

    constructor(private readonly certUrl: URL) {}

    private requestData(): Promise<JwksDocument> {
        if (this.loadedCerts !== undefined) return Promise.resolve(this.loadedCerts);

        return new Promise((resolve, reject) => {
            this.pendingLoaders.push([resolve, reject]);
            if (this.pendingLoaders.length > 1) {
                // another request is ongoing
                return;
            }

            fetch(this.certUrl)
                .then((r) => r.json())
                .then(JwksDocumentSchema.parse)
                .then((r) => {
                    this.loadedCerts = r;
                    const pendings = this.pendingLoaders;
                    this.pendingLoaders = [];
                    for (const [s] of pendings) {
                        s(r);
                    }
                })
                .catch((e) => {
                    const pendings = this.pendingLoaders;
                    this.pendingLoaders = [];
                    for (const [, f] of pendings) {
                        f(e);
                    }
                });
        });
    }

    async getKey(kid?: string): Promise<JWK> {
        const doc = await this.requestData();

        if (kid === undefined) {
            // キー指定なし: とりあえず最初のを返す
            return doc.keys[0];
        }

        const res = doc.keys.find((k) => k.kid === kid);
        if (res === undefined) throw new Error("key not found");
        return res;
    }
}

function splitJWT(input: string): [string, string, string] {
    const [h, p, s] = input.split(".", 3);

    if (!h || !p || !s) throw new Error("malformed jwt");

    return [h, p, s];
}

function byteStringToArrayBuffer(bs: string): ArrayBuffer {
    const buffer = new ArrayBuffer(bs.length);
    const bufferView = new Uint8Array(buffer);
    for (let i = 0; i < bs.length; i++) {
        bufferView[i] = bs.charCodeAt(i);
    }

    return buffer;
}

function decodeBase64(b64: string): ArrayBuffer {
    return byteStringToArrayBuffer(atob(b64));
}

async function importRS256PemFormattedPublicKey(pem: string): Promise<CryptoKey> {
    const HEADER = "-----BEGIN CERTIFICATE-----\n";
    const FOOTER = "\n-----END CERTIFICATE-----\n";

    if (!pem.startsWith(HEADER) || !pem.endsWith(FOOTER)) throw new Error("invalid pem format");
    const pemBinaryPart = pem.slice(HEADER.length, -FOOTER.length);
    const pemBinaryString = atob(pemBinaryPart);
    const buffer = byteStringToArrayBuffer(pemBinaryString);

    return await crypto.subtle.importKey("pkcs8", buffer, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);
}

const HeaderSchema = zod.object({ alg: zod.string(), kid: zod.string().optional() });
export type Header = Readonly<zod.infer<typeof HeaderSchema>>;
const PayloadTemplateSchema = zod.object({ iat: zod.number().optional(), exp: zod.number().optional() });
export async function verifyJWT<T>(
    input: string,
    pubkeyProvider: (header: Header) => Promise<string>,
    payloadSchema: zod.ZodType<T>
): Promise<[Header, Readonly<T>]> {
    const [headerStr, payloadStr, signature] = splitJWT(input);

    const header = HeaderSchema.parse(JSON.parse(headerStr));
    if (header.alg === "RS256") {
        const pubkey = await pubkeyProvider(header).then(importRS256PemFormattedPublicKey);

        const result = await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            pubkey,
            decodeBase64(signature),
            byteStringToArrayBuffer(`${headerStr}.${payloadStr}`)
        );
        if (!result) throw new Error("verification failed");
    } else {
        throw new Error(`unsupported alg: ${header.alg}`);
    }

    const payload = JSON.parse(payloadStr);
    const payloadTemplate = PayloadTemplateSchema.safeParse(payload);
    const nowtime = new Date().getTime();
    if (payloadTemplate.success) {
        if (payloadTemplate.data.iat !== undefined) {
            if (payloadTemplate.data.iat > nowtime) throw new Error("token issued at the future");
        }
        if (payloadTemplate.data.exp !== undefined) {
            if (payloadTemplate.data.exp < nowtime) throw new Error("expired");
        }
    }

    return [header, payloadSchema.parse(payload)];
}

interface Authenticator {
    authenticate(token?: string): Promise<void>;
}
interface JWTContentAuthenticator<P> {
    authenticate(payload: P): void;
}
class CloudflareAccessJWTAuthenticator implements Authenticator {
    static readonly TOKEN_PAYLOAD_SCHEMA = zod.object({ email: zod.string() });
    private readonly jwksClient: JwksClient;

    constructor(
        teamDomain: URL,
        private readonly appID: string,
        private readonly contentAuthenticators: JWTContentAuthenticator<
            typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA._output
        >[]
    ) {
        this.jwksClient = new JwksClient(new URL("/cdn-cgi/access/certs", teamDomain));
    }

    async authenticate(token?: string): Promise<void> {
        if (!token) throw new Error("missing token");

        const [, result] = await verifyJWT(
            token,
            (h) => this.jwksClient.getKey(h.kid).then((r) => r.cert),
            zod.object({ aud: zod.string() }).merge(CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA)
        );
        if (result.aud !== this.appID) throw new Error("unknown audience");

        for (const a of this.contentAuthenticators) a.authenticate(result);
    }
}
class EmailAllowanceAuthenticator
    implements JWTContentAuthenticator<typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA._output>
{
    constructor(private readonly allowedEmails: string[]) {}

    authenticate(input: typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA._output): void {
        const allowed = this.allowedEmails.some((x) => x.toLowerCase() === input.email);
        if (!allowed) {
            throw new Error("email not allowed");
        }
    }
}

class PassthroughAuthenticator implements Authenticator {
    async authenticate(_?: string): Promise<void> {}
}

if (process.env.NODE_ENV === "development") {
    logDevReady(build);
    broadcastDevReady(build);
}

type FetchEnv = {
    readonly __STATIC_CONTENT: Fetcher;
    readonly INFO_STORE: D1Database;
    readonly OBJECT_STORE: R2Bucket;
    readonly CONTENT_ID_OBFUSCATOR_KEY: string;
    readonly OBJECT_STORE_S3_ACCESS_KEY: string;
    readonly OBJECT_STORE_S3_SECRET_ACCESS_KEY: string;
    readonly OBJECT_STORE_S3_ENDPOINT: string;
    readonly CLOUDFLARE_ACCESS_APP_ID: string;
};

export default {
    async fetch(req: Request, env: FetchEnv, ctx: ExecutionContext): Promise<Response> {
        const authenticator =
            process.env.NODE_ENV === "development"
                ? new PassthroughAuthenticator()
                : new CloudflareAccessJWTAuthenticator(
                      new URL("https://ct2.cloudflareaccess.com/"),
                      env.CLOUDFLARE_ACCESS_APP_ID,
                      [new EmailAllowanceAuthenticator(["Syn.Tri.Naga@gmail.com"])]
                  );

        try {
            authenticator.authenticate(cookie.parse(req.headers.get("Cookie") ?? "")["CF_Authorization"]);
        } catch (e) {
            console.error("Authentication Failed", e);
            return new Response("Authentication Failed", { status: 403 });
        }

        try {
            const url = new URL(req.url);
            const ttl = url.pathname.startsWith("/build/") ? 60 * 60 * 24 * 365 : 60 * 5;

            return await getAssetFromKV(
                { request: req, waitUntil: ctx.waitUntil.bind(ctx) },
                {
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: MANIFEST,
                    cacheControl: { browserTTL: ttl, edgeTTL: ttl },
                }
            );
        } catch (e) {}

        if (process.env.NODE_ENV === "development") {
            // forwarding local r2 repository
            const matches = new URLPattern("/r2-local/:path", req.url).exec(req.url);
            if (matches) {
                const object = await env.OBJECT_STORE.get(matches.pathname.groups["path"]);
                if (!object) {
                    return new Response("", { status: 404 });
                }

                return new Response(object.body as ReadableStream);
            }
        }

        try {
            const idObfuscator = new Skip32ContentIdObfuscator(parseHexStringBytes(env.CONTENT_ID_OBFUSCATOR_KEY));

            let contentRepository: ContentRepository;
            if (process.env.NODE_ENV === "development") {
                contentRepository = new CloudflareLocalContentRepository(
                    idObfuscator,
                    env.INFO_STORE,
                    env.OBJECT_STORE,
                    "/r2-local"
                );
            } else {
                const objectStoreS3Client = new AwsClient({
                    accessKeyId: env.OBJECT_STORE_S3_ACCESS_KEY,
                    secretAccessKey: env.OBJECT_STORE_S3_SECRET_ACCESS_KEY,
                });

                contentRepository = new CloudflareContentRepository(
                    idObfuscator,
                    env.INFO_STORE,
                    env.OBJECT_STORE,
                    objectStoreS3Client,
                    new URL(env.OBJECT_STORE_S3_ENDPOINT)
                );
            }

            return await handleRemixRequest(req, { contentRepository });
        } catch (e) {
            console.error(e);
            return new Response("An unexpected error occured", { status: 500 });
        }
    },
};
