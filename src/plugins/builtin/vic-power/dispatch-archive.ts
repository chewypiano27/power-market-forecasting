/** Decode the CSV in an AEMO dispatch ZIP using the browser's built-in inflater. */
export async function dispatchArchiveCsv(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 22 || bytes.length > 4_000_000) throw new Error("Invalid dispatch archive size");
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("Dispatch archive directory missing");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 100 || offset >= end) throw new Error("Invalid dispatch archive directory");
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid dispatch archive entry");
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extra + comment > bytes.length) throw new Error("Truncated dispatch archive entry");
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extra + comment;
    if (!/\.csv$/i.test(name)) continue;
    if ((flags & 1) || size > 8_000_000 || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error("Unsupported dispatch archive entry");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > bytes.length) throw new Error("Truncated dispatch archive data");
    const data = bytes.slice(start, start + compressed);
    const plain = method === 0 ? data : method === 8
      ? new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer())
      : null;
    if (!plain || plain.length !== size) throw new Error("Invalid dispatch archive contents");
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  }
  throw new Error("Dispatch archive has no CSV");
}
