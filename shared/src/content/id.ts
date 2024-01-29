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

export namespace ContentId {
    export interface Untyped {
        get value(): number;
        toInternal(ctx: ContentIdObfuscator): Internal;
        toExternal(ctx: ContentIdObfuscator): External;
    }
    export class Internal implements Untyped {
        constructor(readonly value: number) {}

        toInternal(_ctx: ContentIdObfuscator): Internal {
            return this;
        }
        toExternal(ctx: ContentIdObfuscator): External {
            return new External(ctx.obfuscate(this.value));
        }
    }
    export class External implements Untyped {
        constructor(readonly value: number) {}

        toInternal(ctx: ContentIdObfuscator): Internal {
            return new Internal(ctx.deobfuscate(this.value));
        }
        toExternal(_ctx: ContentIdObfuscator): External {
            return this;
        }
    }
}
