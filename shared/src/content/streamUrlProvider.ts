import { ContentId } from "./id";
// @ts-ignore なぜか定義が見つけられないので一旦封じる
import type { AwsClient } from "aws4fetch";

export interface ContentStreamingUrlProvider {
    getUrl(id: ContentId.Internal): Promise<string | undefined>;
}

export class LocalContentStreamingUrlProvider implements ContentStreamingUrlProvider {
    constructor(private readonly mountPath: string) {}

    getUrl(id: ContentId.Internal): Promise<string | undefined> {
        const url = new URL("http://localhost:8787/");
        url.pathname = `${this.mountPath}/${id.internalValue}`;

        return Promise.resolve(url.toString());
    }
}

export class SignedContentStreamingUrlProvider implements ContentStreamingUrlProvider {
    constructor(
        private readonly s3Client: AwsClient,
        private readonly s3Endpoint: URL,
        private readonly eventContext: ExecutionContext,
    ) {}

    async getUrl(id: ContentId.Internal): Promise<string | undefined> {
        const url = new URL(this.s3Endpoint);
        url.pathname = `soundscape/${id.internalValue}`;
        // available for 1 hour
        url.searchParams.set("X-Amz-Expires", "3600");

        const cached = await caches.default.match(new Request(url));
        if (cached !== undefined) {
            return await cached.text();
        }

        const signed = await this.s3Client
            .sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } })
            .then((x: Request) => x.url);
        this.eventContext.waitUntil(
            caches.default.put(
                new Request(url),
                new Response(signed, { headers: new Headers({ "Cache-Control": "max-age=3540, must-revalidate" }) }),
            ),
        );

        return signed;
    }
}
