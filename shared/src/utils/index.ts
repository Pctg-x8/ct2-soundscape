export function _let<T, U>(value: T, op: (value: T) => U): U {
    return op(value);
}
