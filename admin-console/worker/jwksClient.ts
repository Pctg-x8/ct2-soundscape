
import * as zod from "zod";

const JWKSchema = zod.object({ kid: zod.string(), cert: zod.string() });
const JwksDocumentSchema = zod.object({ keys: zod.array(JWKSchema) });

export type JWK = zod.infer<typeof JWKSchema>;
type JwksDocument = zod.infer<typeof JwksDocumentSchema>;

export class JwksClient {
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
