export class ReversibleOperation<T = void> implements AsyncDisposable {
    private rollback: (() => Promise<void>) | null;

    constructor(
        readonly value: T,
        rollback: () => Promise<void>,
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

    combineWith<U, V>(other: ReversibleOperation<U>, combiner: (t: T, u: U) => V): ReversibleOperation<V> {
        const r = new ReversibleOperation(combiner(this.value, other.value), async () => {
            await other.rollback?.();
            await this.rollback?.();
        });
        this.neutralize();
        other.neutralize();

        return r;
    }

    combineDrop(other: ReversibleOperation<unknown>): ReversibleOperation {
        return this.combineWith(other, () => void 0);
    }

    async [Symbol.asyncDispose]() {
        await this.rollback?.();
    }
}
