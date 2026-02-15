import * as z from "zod";
import { skip32 } from "../skip32";

export interface ContentIdObfuscator {
    obfuscate(internalId: number): number;
    deobfuscate(externalId: number): number;
}

export class Skip32ContentIdObfuscator implements ContentIdObfuscator {
    constructor(private readonly key: Uint8Array) {}

    obfuscate(internalId: number): number {
        return skip32(this.key, internalId, true);
    }

    deobfuscate(externalId: number): number {
        return skip32(this.key, externalId, false);
    }
}

/**
 * Value for dentifying a content.
 */
export namespace ContentId {
    export interface Untyped {
        toInternal(ctx: ContentIdObfuscator): Internal;
        toExternal(ctx: ContentIdObfuscator): External;
    }

    /**
     * Internal formatted(for accessing DB) ID
     */
    export class Internal implements Untyped {
        constructor(readonly internalValue: number) {}

        toInternal(_ctx: ContentIdObfuscator): Internal {
            return this;
        }
        toExternal(ctx: ContentIdObfuscator): External {
            return new External(ctx.obfuscate(this.internalValue));
        }
    }

    /**
     * External formatted(for user-visible) ID
     */
    export class External implements Untyped {
        static readonly ZodSchema = z.int().transform(x => new External(x));
        static readonly ZodPathParamSchema = z
            .string()
            .regex(/^[0-9]+$/)
            .transform(x => new External(Number(x)));

        constructor(readonly value: number) {}

        toInternal(ctx: ContentIdObfuscator): Internal {
            return new Internal(ctx.deobfuscate(this.value));
        }
        toExternal(_ctx: ContentIdObfuscator): External {
            return this;
        }
    }
}
