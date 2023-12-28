export function unwrapNullishOr<T>(value: T | undefined | null, alter: () => T): T {
    return value === null || value === undefined ? alter() : value;
}
