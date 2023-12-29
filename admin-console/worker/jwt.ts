
import * as zod from "zod";

function splitToken(input: string): [string, string, string] {
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
    const [headerStr, payloadStr, signature] = splitToken(input);

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
