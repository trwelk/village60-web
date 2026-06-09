import QRCode from "qrcode";

export async function renderResidentQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
