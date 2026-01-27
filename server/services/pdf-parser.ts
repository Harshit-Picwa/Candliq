import { PDFParse } from "pdf-parse";

/**
 * Validates that a buffer contains a valid PDF file
 */
export function validatePDF(buffer: Buffer): boolean {
  // Check PDF magic number: %PDF
  const pdfHeader = buffer.slice(0, 4).toString();
  return pdfHeader === "%PDF";
}

/**
 * Extracts text content from a PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || "";
  } catch (error: any) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}
