declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number]
    filename?: string
    image?: {
      type?: 'jpeg' | 'png' | 'webp'
      quality?: number
    }
    html2canvas?: {
      scale?: number
      useCORS?: boolean
      letterRendering?: boolean
      logging?: boolean
      dpi?: number
      width?: number
      height?: number
    }
    jsPDF?: {
      unit?: string
      format?: string | number[]
      orientation?: 'portrait' | 'landscape'
      compress?: boolean
    }
    pagebreak?: {
      mode?: string | string[]
      before?: string | string[]
      after?: string | string[]
      avoid?: string | string[]
    }
  }

  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf
    from(element: HTMLElement | string): Html2Pdf
    save(): Promise<void>
    output(type: string, options?: any): Promise<any>
    outputPdf(type?: string): Promise<any>
    outputImg(type?: string): Promise<any>
    then(callback: (pdf: any) => void): Promise<any>
    toPdf(): Html2Pdf
    toImg(): Html2Pdf
    toContainer(): Html2Pdf
    toCanvas(): Html2Pdf
    get(key: string): any
  }

  function html2pdf(): Html2Pdf
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Html2Pdf

  export default html2pdf
}

