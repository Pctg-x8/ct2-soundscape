export async function guard(observer: (loading: boolean) => void, op: Promise<void>) {
    observer(true);
    await op.finally(() => observer(false));
}
