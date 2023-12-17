export namespace LocalStorage {
    export class Key<T> {
        constructor(
            private readonly key: string,
            private readonly toStorage: (value: T) => string,
            private readonly fromStorage: (value: string) => T
        ) {}

        get(): T | null {
            if (typeof window === "undefined") return null;

            const storageValue = window.localStorage.getItem(this.key);

            return storageValue === null ? null : this.fromStorage(storageValue);
        }

        set(value: T) {
            if (typeof window === "undefined") return;

            window.localStorage.setItem(this.key, this.toStorage(value));
        }

        remove() {
            if (typeof window === "undefined") return;

            window.localStorage.removeItem(this.key);
        }
    }

    export const Volume = new Key("volume", String, Number);
}
