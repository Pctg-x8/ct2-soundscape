export function shiftDataViewHead(dataView: DataView, offset: number): DataView {
    return new DataView(dataView.buffer, dataView.byteOffset + offset, dataView.byteLength - offset);
}

export function subsliceDataView(dataView: DataView, offset: number, length: number): DataView {
    return new DataView(dataView.buffer, dataView.byteOffset + offset, length);
}
