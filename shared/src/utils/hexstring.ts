export function parseHexStringBytes(hex: string): Uint8Array {
    if (hex.length % 2 != 0) {
        throw new Error("length of hexstring is not multiplication of 2");
    }
    
    const byteArray = Array.from({ length: hex.length / 2 }).map((_, n) => parseInt(hex.slice(n * 2, n * 2 + 2), 16));

    return new Uint8Array(byteArray);
}
