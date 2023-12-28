export namespace License {
    export const PublicDomain = 0 as const;
    export namespace CreativeCommons4 {
        export const BY = 1 as const;
        export const BY_SA = 2 as const;
        export const BY_NC = 3 as const;
        export const BY_NC_SA = 4 as const;
        export const BY_ND = 5 as const;
        export const BY_NC_ND = 6 as const;
    }
    export type Custom = string;
    const CustomTypeEnum = 999;

    export type Type =
        | typeof PublicDomain
        | typeof CreativeCommons4.BY
        | typeof CreativeCommons4.BY_SA
        | typeof CreativeCommons4.BY_NC
        | typeof CreativeCommons4.BY_NC_SA
        | typeof CreativeCommons4.BY_ND
        | typeof CreativeCommons4.BY_NC_ND
        | Custom;

    export function fromDBValues(type: number, text?: string | null): Type | undefined {
        if (
            type == PublicDomain ||
            type == CreativeCommons4.BY ||
            type == CreativeCommons4.BY_SA ||
            type == CreativeCommons4.BY_NC ||
            type == CreativeCommons4.BY_NC_SA ||
            type == CreativeCommons4.BY_ND ||
            type == CreativeCommons4.BY_NC_ND
        )
            return type;

        switch (type) {
            case CustomTypeEnum:
                return text ?? "";
            default:
                return undefined;
        }
    }

    export function toDBValues(l: License.Type): [number, string | null] {
        if (typeof l === "string") {
            return [CustomTypeEnum, l];
        }

        return [l, null];
    }
}
