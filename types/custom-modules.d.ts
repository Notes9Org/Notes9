declare module "html-docx-js/dist/html-docx";
declare module "pdfjs-dist/legacy/build/pdf";
declare module "pdfjs-dist/legacy/build/pdf.mjs";
declare module "pdfjs-dist/build/pdf.worker.min.mjs";

declare module "utif" {
  /** An IFD (Image File Directory) — one page in a TIFF document. */
  export interface IFD {
    width: number
    height: number
    t256?: number[] // ImageWidth
    t257?: number[] // ImageLength
    data?: Uint8Array
    [tag: string]: unknown
  }

  /** Decode all IFDs (pages) from a TIFF arraybuffer. */
  export function decode(buf: ArrayBuffer | Uint8Array): IFD[]

  /** Populate `ifd.data` with raw pixel bytes for the given IFD. */
  export function decodeImage(buf: ArrayBuffer | Uint8Array, ifd: IFD, ifds?: IFD[]): void

  /** Convert decoded IFD pixel data to canvas-ready RGBA8 (length = width*height*4). */
  export function toRGBA8(ifd: IFD): Uint8Array

  const _default: {
    decode: typeof decode
    decodeImage: typeof decodeImage
    toRGBA8: typeof toRGBA8
  }
  export default _default
}
