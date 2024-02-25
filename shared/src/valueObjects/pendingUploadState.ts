export namespace PendingUploadState {
    export const Ongoing = 0 as const;
    export const Completed = 1 as const;
    export const Aborted = -1 as const;

    export type Type = typeof Ongoing | typeof Completed | typeof Aborted;

    export function fromDBValue(value: number): Type {
        switch (value) {
            case Ongoing:
            case Completed:
            case Aborted:
                return value;
            default:
                throw new Error("invalid pendingUploads.state value");
        }
    }

    export function toDBValue(value: Type): number {
        return value;
    }
}
