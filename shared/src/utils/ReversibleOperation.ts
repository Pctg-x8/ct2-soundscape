export class ReversibleOperation<T = void> implements AsyncDisposable {
    private rollback: (() => Promise<void>) | null;

    constructor(
        readonly value: T,
        rollback: () => Promise<void>
    ) {
        this.rollback = rollback;
    }

    confirm() {
        this.rollback = null;
    }

    async [Symbol.asyncDispose]() {
        await this.rollback?.();
    }
}
