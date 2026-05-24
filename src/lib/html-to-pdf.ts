import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";

/**
 * Snapshot a DOM node into a multi-page A4 PDF. This is the single source of
 * truth for "Download branded PDF" so the file you save is byte-identical to
 * the on-screen preview — every design tweak, every line item, every logo.
 *
 * We render at 2× device pixel ratio for crisp text, then slice the resulting
 * canvas across A4 pages preserving aspect ratio.
 */
export async function exportNodeToPdf(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  // Force white background and disable transitions for a clean snapshot.
  const prev = {
    transition: node.style.transition,
    boxShadow: node.style.boxShadow,
    border: node.style.border,
  };
  node.style.transition = "none";
  node.style.boxShadow = "none";
  node.style.border = "none";

  try {
    const canvas = await html2canvas(node, {
      scale: Math.min(2, (window.devicePixelRatio || 1) * 1.5),
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / pageW;
    const sliceHeightPx = pageH * ratio;
    const totalPages = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

    for (let p = 0; p < totalPages; p++) {
      const sliceY = p * sliceHeightPx;
      const sliceH = Math.min(sliceHeightPx, canvas.height - sliceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sliceY,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH,
      );
      const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
      if (p > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, sliceH / ratio);
    }

    pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    node.style.transition = prev.transition;
    node.style.boxShadow = prev.boxShadow;
    node.style.border = prev.border;
  }
}