declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    version: string;
    text: string;
  };

  export default function pdfParse(
    dataBuffer: Buffer
  ): Promise<PdfParseResult>;
}
