/**
 * `Pick<T, M>` に対応する実装
 */
export function pick<T extends object, M extends keyof T>(object: T, ...members: M[]): Pick<T, M> {
    return Object.fromEntries(Object.entries(object).filter(([k]) => (members as string[]).includes(k))) as Pick<T, M>;
}
