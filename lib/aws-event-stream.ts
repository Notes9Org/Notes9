const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8");

export interface EventStreamMessage {
  headers: Record<string, string>;
  payload: Uint8Array;
}

// CRC32 implementation compatible with AWS event stream (GZIP polynomial).
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  // Unsigned 32-bit
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, false);
}

function encodeHeaders(headers: Record<string, string>): Uint8Array {
  const bytes: number[] = [];

  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = TEXT_ENCODER.encode(name);
    const valueBytes = TEXT_ENCODER.encode(value);

    if (nameBytes.length > 255) {
      throw new Error("Header name too long for event stream");
    }

    // Header name length (1 byte) + name bytes
    bytes.push(nameBytes.length);
    for (let i = 0; i < nameBytes.length; i++) {
      bytes.push(nameBytes[i]);
    }

    // Header value type: 7 = string
    bytes.push(7);

    // String length (2 bytes, big-endian)
    const len = valueBytes.length;
    bytes.push((len >>> 8) & 0xff, len & 0xff);

    // String bytes
    for (let i = 0; i < valueBytes.length; i++) {
      bytes.push(valueBytes[i]);
    }
  }

  return new Uint8Array(bytes);
}

function decodeHeaders(bytes: Uint8Array): Record<string, string> {
  const headers: Record<string, string> = {};
  let offset = 0;

  while (offset < bytes.length) {
    const nameLen = bytes[offset];
    offset += 1;

    const nameBytes = bytes.subarray(offset, offset + nameLen);
    offset += nameLen;
    const name = TEXT_DECODER.decode(nameBytes);

    const type = bytes[offset];
    offset += 1;

    if (type !== 7) {
      // Skip unsupported types following the spec format.
      // bools (0,1) have no body, others are fixed/var length.
      // For simplicity, we don't expect non-string headers from Transcribe.
      throw new Error(`Unsupported event stream header type: ${type}`);
    }

    const len = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    const valueBytes = bytes.subarray(offset, offset + len);
    offset += len;

    const value = TEXT_DECODER.decode(valueBytes);
    headers[name] = value;
  }

  return headers;
}

export function encodeEventStreamMessage(
  headers: Record<string, string>,
  payload: Uint8Array
): ArrayBuffer {
  const headerBytes = encodeHeaders(headers);
  const headersLength = headerBytes.length;

  // Total message length includes: prelude (8) + prelude CRC (4) + headers + payload + message CRC (4)
  const totalLength = 16 + headersLength + payload.length;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Prelude: total length + headers length
  writeUint32BE(view, 0, totalLength);
  writeUint32BE(view, 4, headersLength);

  // Prelude CRC (over first 8 bytes)
  const preludeCrc = crc32(bytes.subarray(0, 8));
  writeUint32BE(view, 8, preludeCrc);

  // Headers
  let offset = 12;
  bytes.set(headerBytes, offset);
  offset += headersLength;

  // Payload
  bytes.set(payload, offset);
  offset += payload.length;

  // Message CRC (over everything except the final 4 bytes)
  const messageCrc = crc32(bytes.subarray(0, totalLength - 4));
  writeUint32BE(view, totalLength - 4, messageCrc);

  return buffer;
}

export function decodeEventStreamMessage(
  input: ArrayBuffer | Uint8Array
): EventStreamMessage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength < 16) {
    throw new Error("Event stream message too short");
  }

  const totalLength = view.getUint32(0, false);
  const headersLength = view.getUint32(4, false);

  if (totalLength !== bytes.byteLength) {
    // Some transports may deliver exactly one message per frame.
    // We assume that's the case here, but log mismatch via error.
    throw new Error("Event stream length mismatch");
  }

  const headersStart = 12;
  const headersEnd = headersStart + headersLength;
  if (headersEnd > bytes.byteLength - 4) {
    throw new Error("Invalid event stream headers length");
  }

  const headersBytes = bytes.subarray(headersStart, headersEnd);
  const headers = decodeHeaders(headersBytes);

  const payloadLength = totalLength - 16 - headersLength;
  const payloadStart = headersEnd;
  const payloadEnd = payloadStart + payloadLength;
  if (payloadEnd > bytes.byteLength - 4) {
    throw new Error("Invalid event stream payload length");
  }

  const payload = bytes.subarray(payloadStart, payloadEnd);

  return { headers, payload };
}

export function encodeAudioEvent(pcmChunk: Uint8Array): ArrayBuffer {
  return encodeEventStreamMessage(
    {
      ":message-type": "event",
      ":event-type": "AudioEvent",
      ":content-type": "application/octet-stream",
    },
    pcmChunk
  );
}

