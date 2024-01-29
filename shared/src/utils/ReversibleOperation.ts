export class ReversibleOperation<T = void> implements AsyncDisposable {
    private rollback: (() => Promise<void>) | null;

    constructor(
        readonly value: T,
        rollback: () => Promise<void>
    ) {
        this.rollback = rollback;
    }

    neutralize() {
        this.rollback = null;
    }

    moveout(): ReversibleOperation<T> {
        const op2 = new ReversibleOperation(this.value, this.rollback ?? (() => Promise.resolve()));
        this.neutralize();

        return op2;
    }

    moveoutWithValue<U>(value: U): ReversibleOperation<U> {
        const op2 = new ReversibleOperation(value, this.rollback ?? (() => Promise.resolve()));
        this.neutralize();

        return op2;
    }

    async [Symbol.asyncDispose]() {
        await this.rollback?.();
    }
}
