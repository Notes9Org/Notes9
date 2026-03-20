type ZipEntryInput = {
  name: string
  data: string | Uint8Array
}

type PreparedEntry = {
  nameBytes: Uint8Array
  dataBytes: Uint8Array
  crc32: number
  size: number
}

const textEncoder = new TextEncoder()
const CRC32_TABLE = buildCrc32Table()

export function createZip(entries: ZipEntryInput[]): Uint8Array {
  const prepared = entries.map(prepareEntry)
  const chunks: Uint8Array[] = []
  const centralDirChunks: Uint8Array[] = []
  let localOffset = 0

  for (const entry of prepared) {
    const localHeader = createLocalHeader(entry)
    const localChunk = concat(localHeader, entry.nameBytes, entry.dataBytes)
    chunks.push(localChunk)

    const centralHeader = createCentralHeader(entry, localOffset)
    const centralChunk = concat(centralHeader, entry.nameBytes)
    centralDirChunks.push(centralChunk)

    localOffset += localChunk.length
  }

  const centralDirectory = concat(...centralDirChunks)
  const eocd = createEndOfCentralDirectory(prepared.length, centralDirectory.length, localOffset)

  return concat(...chunks, centralDirectory, eocd)
}

function prepareEntry(entry: ZipEntryInput): PreparedEntry {
  const nameBytes = textEncoder.encode(entry.name)
  const dataBytes = typeof entry.data === "string" ? textEncoder.encode(entry.data) : entry.data

  return {
    nameBytes,
    dataBytes,
    size: dataBytes.length,
    crc32: crc32(dataBytes),
  }
}

function createLocalHeader(entry: PreparedEntry): Uint8Array {
  const buffer = new Uint8Array(30)
  const view = new DataView(buffer.buffer)
  const date = dosDateTime(new Date())
  const utf8Flag = 0x0800

  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, utf8Flag, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, date.time, true)
  view.setUint16(12, date.date, true)
  view.setUint32(14, entry.crc32, true)
  view.setUint32(18, entry.size, true)
  view.setUint32(22, entry.size, true)
  view.setUint16(26, entry.nameBytes.length, true)
  view.setUint16(28, 0, true)
  return buffer
}

function createCentralHeader(entry: PreparedEntry, localOffset: number): Uint8Array {
  const buffer = new Uint8Array(46)
  const view = new DataView(buffer.buffer)
  const date = dosDateTime(new Date())
  const utf8Flag = 0x0800

  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, utf8Flag, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, date.time, true)
  view.setUint16(14, date.date, true)
  view.setUint32(16, entry.crc32, true)
  view.setUint32(20, entry.size, true)
  view.setUint32(24, entry.size, true)
  view.setUint16(28, entry.nameBytes.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, localOffset, true)
  return buffer
}

function createEndOfCentralDirectory(
  totalEntries: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const buffer = new Uint8Array(22)
  const view = new DataView(buffer.buffer)

  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, totalEntries, true)
  view.setUint16(10, totalEntries, true)
  view.setUint32(12, centralDirectorySize, true)
  view.setUint32(16, centralDirectoryOffset, true)
  view.setUint16(20, 0, true)

  return buffer
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const totalSize = parts.reduce((sum, part) => sum + part.length, 0)
  const buffer = new Uint8Array(totalSize)
  let offset = 0

  for (const part of parts) {
    buffer.set(part, offset)
    offset += part.length
  }

  return buffer
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildCrc32Table() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let current = i
    for (let j = 0; j < 8; j += 1) {
      if ((current & 1) === 1) {
        current = 0xedb88320 ^ (current >>> 1)
      } else {
        current >>>= 1
      }
    }
    table[i] = current >>> 0
  }
  return table
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  const dosTime = (hours << 11) | (minutes << 5) | seconds

  return { date: dosDate, time: dosTime }
}
