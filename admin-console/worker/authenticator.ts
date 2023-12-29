
import * as zod from "zod";
import { JwksClient } from "./jwksClient";
import { verifyJWT } from "./jwt";
import * as cookie from "cookie";

export interface Authenticator {
    authenticate(req: Request): Promise<void>;
}
export interface JWTContentAuthenticator<P> {
    authenticate(payload: P): void;
}
export class CloudflareAccessJWTAuthenticator implements Authenticator {
    static readonly TOKEN_PAYLOAD_SCHEMA = zod.object({ email: zod.string() });
    private readonly jwksClient: JwksClient;

    constructor(
        teamDomain: URL,
        private readonly appID: string,
        private readonly contentAuthenticators: JWTContentAuthenticator<
            zod.infer<typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA>
        >[]
    ) {
        this.jwksClient = new JwksClient(new URL("/cdn-cgi/access/certs", teamDomain));
    }

    async authenticate(req: Request): Promise<void> {
        const token = cookie.parse(req.headers.get("Cookie") ?? "")["CF_Authorization"];
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

export class PassthroughAuthenticator implements Authenticator {
    async authenticate(_: Request): Promise<void> {}
}

export class EmailAllowanceAuthenticator
    implements JWTContentAuthenticator<zod.infer<typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA>>
{
    constructor(private readonly allowedEmails: string[]) {}

    authenticate(input: zod.infer<typeof CloudflareAccessJWTAuthenticator.TOKEN_PAYLOAD_SCHEMA>): void {
        const allowed = this.allowedEmails.some((x) => x.toLowerCase() === input.email);
        if (!allowed) {
            throw new Error("email not allowed");
        }
    }
}
