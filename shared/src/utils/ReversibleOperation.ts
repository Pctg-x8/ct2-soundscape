export interface IReversibleOperation<T = void> extends AsyncDisposable {
    readonly value: T;
    neutralize(): T;
}

export class ReversibleOperation<TReverseContext, TValue = void> implements IReversibleOperation<TValue> {
    private rollback: ((context: TReverseContext) => Promise<void>) | null;

    constructor(
        readonly value: TValue,
        readonly reverseContext: TReverseContext,
        rollback: (context: TReverseContext) => Promise<void>,
    ) {
        this.rollback = rollback;
    }

    static async perform<T>(
        action: () => Promise<T>,
        rollback: (context: T) => Promise<void>,
    ): Promise<ReversibleOperation<T, T>> {
        const value = await action();
        return new ReversibleOperation<T, T>(value, value, rollback);
    }

    neutralize(): TValue {
        this.rollback = null;
        return this.value;
    }

    moveout(): ReversibleOperation<TReverseContext, TValue> {
        const op2 = new ReversibleOperation(
            this.value,
            this.reverseContext,
            this.rollback ?? (() => Promise.resolve()),
        );
        this.neutralize();

        return op2;
    }

    moveoutWithValue<U>(value: U): ReversibleOperation<TReverseContext, U> {
        const op2 = new ReversibleOperation(value, this.reverseContext, this.rollback ?? (() => Promise.resolve()));
        this.neutralize();

        return op2;
    }

    combineWith<TReverseContext2, U, V>(
        other: ReversibleOperation<TReverseContext2, U>,
        combiner: (t: TValue, u: U) => V,
    ): ReversibleOperation<
        { readonly reverseContext1: TReverseContext; readonly reverseContext2: TReverseContext2 },
        V
    > {
        const r = new ReversibleOperation(
            combiner(this.value, other.value),
            { reverseContext1: this.reverseContext, reverseContext2: other.reverseContext },
            async ctx => {
                await other.rollback?.(ctx.reverseContext2);
                await this.rollback?.(ctx.reverseContext1);
            },
        );
        this.neutralize();
        other.neutralize();

        return r;
    }

    combineDrop<TReverseContext2>(
        other: ReversibleOperation<TReverseContext2, unknown>,
    ): ReversibleOperation<
        { readonly reverseContext1: TReverseContext; readonly reverseContext2: TReverseContext2 },
        void
    > {
        return this.combineWith(other, () => void 0);
    }

    async [Symbol.asyncDispose]() {
        await this.rollback?.(this.reverseContext);
    }
}
