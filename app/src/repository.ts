import { AwsClient } from "aws4fetch";
import { CloudflareContentRepository, type ContentRepository } from "soundscape-shared/src/content";
import { Skip32ContentIdObfuscator } from "soundscape-shared/src/content/id";
import {
    type ContentStreamingUrlProvider,
    LocalContentStreamingUrlProvider,
    SignedContentStreamingUrlProvider,
} from "soundscape-shared/src/content/streamUrlProvider";
import { parseHexStringBytes } from "soundscape-shared/src/utils/hexstring";

export function createRepositoryAccess(env: Env, ec: ExecutionContext): ContentRepository {
    const idObfuscator = new Skip32ContentIdObfuscator(parseHexStringBytes(env.CONTENT_ID_OBFUSCATOR_KEY));

    return new CloudflareContentRepository(
        idObfuscator,
        env.INFO_STORE,
        env.OBJECT_STORE,
        createContentStreamingUrlProvider(env, ec),
    );
}

function createContentStreamingUrlProvider(env: Env, ctx: ExecutionContext): ContentStreamingUrlProvider {
    if (process.env.NODE_ENV === "development") {
        return new LocalContentStreamingUrlProvider("/r2-local");
    }

    const s3Client = new AwsClient({
        accessKeyId: env.OBJECT_STORE_S3_ACCESS_KEY,
        secretAccessKey: env.OBJECT_STORE_S3_SECRET_ACCESS_KEY,
    });
    return new SignedContentStreamingUrlProvider(s3Client, new URL(env.OBJECT_STORE_S3_ENDPOINT), ctx);
}
