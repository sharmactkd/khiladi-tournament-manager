import jsPDF from 'jspdf';
import { toSvg } from 'html-to-image';
import html2canvas from 'html2canvas';
import { sanitizeId } from './bracketUtils';

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'https://khiladi-khoj.com';
const WEBSITE_TEXT = WEBSITE_URL.replace(/^https?:\/\//, '');

const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const raf = () =>
  new Promise((resolve) => {
    try {
      requestAnimationFrame(() => resolve());
    } catch {
      resolve();
    }
  });

const waitForFonts = async () => {
  try {
    if (document?.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // ignore
  }
};

const waitForImagesInElement = async (rootEl, timeoutMs = 4000) => {
  try {
    if (!rootEl) return;

    const imgs = Array.from(rootEl.querySelectorAll('img'));
    if (imgs.length === 0) return;

    const start = Date.now();

    await Promise.race([
      Promise.all(
        imgs.map(async (img) => {
          try {
            if (!img) return;
            if (img.complete && img.naturalWidth > 0) return;

            // Prefer decode if supported (more reliable)
            if (typeof img.decode === 'function') {
              await img.decode();
              return;
            }

            // Fallback to load/error listeners
            await new Promise((resolve) => {
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            });
          } catch {
            // ignore single image errors
          }
        })
      ),
      (async () => {
        // timeout safety
        while (Date.now() - start < timeoutMs) {
          const allOk = imgs.every((img) => img?.complete);
          if (allOk) break;
          await sleep(120);
        }
      })(),
    ]);
  } catch {
    // ignore
  }
};

const waitForLayoutStability = async (rootEl) => {
  // Keep existing behavior (stability delay) but make it more reliable without changing layout.
  await waitForFonts();
  await waitForImagesInElement(rootEl);

  // Let browser apply final layout/paint
  await raf();
  await raf();

  // Small extra settle time (bounded)
  await sleep(180);
};

const findBracketElementWithRetry = async (bracketKey, { tries = 12, intervalMs = 180 } = {}) => {
  const id = `bracket-${sanitizeId(bracketKey)}`;

  for (let i = 0; i < tries; i += 1) {
    const el = document.getElementById(id) || document.querySelector(`#${CSS?.escape ? CSS.escape(id) : id}`);
    if (el) return el;
    await sleep(intervalMs);
  }

  return null;
};

// Main function to render bracket to canvas (using html2canvas for table layout)
export const renderBracketToCanvas = async (bracketKey) => {
  console.log(`[PDF Render] Starting canvas capture for: ${bracketKey}`);

  const targetElement = await findBracketElementWithRetry(bracketKey, { tries: 12, intervalMs: 180 });

  if (!targetElement) {
    console.error(`Element not found after retry: #bracket-${sanitizeId(bracketKey)}`);
    return null;
  }

  // Wait for fonts/images/layout stability (Chrome reliability)
  await waitForLayoutStability(targetElement);

  try {
    const canvas = await html2canvas(targetElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,

      // Make capture independent of current scroll position (helps blank/shifted renders)
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    });

    console.log(`[PDF Render] Success - Canvas captured`);
    return canvas;
  } catch (err) {
    console.error(`[PDF Render] Failed for ${bracketKey}:`, err);
    return null;
  }
};

// Fit image to A4 landscape page with proper margins
export const fitImageToPage = (width, height) => {
  const pdfW = 297; // A4 landscape width in mm
  const pdfH = 210; // A4 landscape height in mm
  const margin = 2; // 2mm margin
  const availW = pdfW - margin * 2;
  const availH = pdfH - margin * 2;
  const ratio = Math.min(availW / width, availH / height);
  const w = width * ratio;
  const h = height * ratio;
  return {
    width: w,
    height: h,
    x: margin + (availW - w) / 2,
    y: margin + (availH - h) / 2,
  };
};

// Generate multi-page PDF with all brackets using canvas
export const createPDFDoc = async (bracketsToRender, onProgress = () => {}) => {
  if (!Array.isArray(bracketsToRender) || bracketsToRender.length === 0) {
    throw new Error('No brackets provided');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const total = bracketsToRender.length;

  for (let i = 0; i < total; i++) {
    const bracket = bracketsToRender[i];
    const key = bracket?.key;

    // progress: keep compatible signature (progress, current, total)
    const progress = Math.round((i / total) * 100);
    onProgress(progress, i + 1, total);

    if (!key) {
      if (i > 0) doc.addPage();
      doc.setFontSize(12);
      doc.text(`Invalid bracket at index ${i + 1}`, 20, 100);
      continue;
    }

    try {
      if (isDev) {
        console.log(`[PDF] Processing ${i + 1}/${total}:`, key);
      }

      const canvas = await renderBracketToCanvas(key);

      if (!canvas) {
        console.warn(`Skipped ${key} — no render result`);
        if (i > 0) doc.addPage();
        doc.setFontSize(12);
        doc.text(`Bracket render failed: ${key}`, 20, 100);
        continue;
      }

      const imgData = canvas.toDataURL('image/png', 1.0);
      const fit = fitImageToPage(canvas.width, canvas.height);

      if (i > 0) doc.addPage();

      doc.addImage(imgData, 'PNG', fit.x, fit.y, fit.width, fit.height, undefined, 'FAST');
      console.log(`Added PNG ${key} to PDF`);

      // Website link overlay
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(10);
      const textWidth = doc.getTextWidth(WEBSITE_TEXT);
      const x = (pageWidth - textWidth) / 2;
      const y = pageHeight - 8;
      doc.link(x, y - 3, textWidth, 6, { url: WEBSITE_URL });
    } catch (err) {
      console.error(`Error processing ${key}:`, err);
      if (i > 0) doc.addPage();
      doc.setFontSize(12);
      doc.text(`Error rendering: ${key}`, 20, 80);
      doc.text(`${err?.message || 'Unknown error'}`, 20, 100);
    }
  }

  onProgress(100, total, total);
  return doc;
};

// Generate PDF for a single bracket
export const createSingleBracketPDF = async (bracket) => {
  if (!bracket?.key) throw new Error('Invalid bracket');
  return await createPDFDoc([bracket]);
};

// Download PDF file
export const downloadPDF = (doc, filename = 'brackets.pdf') => {
  if (!doc) {
    console.error('No PDF document to download');
    return;
  }

  try {
    doc.save(filename);
  } catch (err) {
    console.error('PDF save failed:', err);

    // Fallback: open in new window
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.onload = () => {
          win.focus();
          win.print();
        };
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
      alert('PDF download failed. Please try again.');
    }
  }
};

// Print PDF
export const printPDF = (doc) => {
  if (!doc) return;

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (win) {
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// Get filename for a bracket
export const getBracketFilename = (bracket) => {
  if (!bracket) return 'bracket.pdf';

  const parts = [bracket.gender || 'Unknown', bracket.ageCategory || 'Unknown', bracket.weightCategory || 'Unknown'].filter(
    Boolean
  );

  if (bracket.pool) {
    parts.push(bracket.pool === 'Final' ? 'Final' : `Pool-${bracket.pool}`);
  }

  const cleanParts = parts.map((p) => p.replace(/[^a-zA-Z0-9-_]/g, '').replace(/\s+/g, '-'));

  return cleanParts.join('_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
};

// Get filename for multiple brackets
export const getMultipleBracketsFilename = (brackets = []) => {
  if (!brackets.length) return 'brackets.pdf';
  if (brackets.length === 1) return getBracketFilename(brackets[0]);
  const date = new Date().toISOString().slice(0, 10);
  return `all-brackets-${date}.pdf`;
};

/**
 * Open a jsPDF document in a NEW window/tab (no auto-print).
 * Popup blocked => fallback to download.
 * Also revokes Blob URL after some time to avoid memory leaks.
 */
export const openPDFInNewTab = (doc, filename = 'brackets.pdf', revokeAfterMs = 60_000) => {
  if (!doc) return false;

  let url = '';
  try {
    const blob = doc.output('blob');
    url = URL.createObjectURL(blob);

    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked -> fallback to download
      try {
        doc.save(filename);
      } catch (e) {
        console.error('[PDF] Popup blocked + save failed:', e);
        alert('Popup was blocked and download failed. Please allow popups and try again.');
      } finally {
        try {
          setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
        } catch {}
      }
      return false;
    }

    // Do NOT auto-print. User decides.
    try {
      win.focus();
    } catch {}

    // Cleanup URL later
    try {
      setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
    } catch {}

    return true;
  } catch (err) {
    console.error('[PDF] Failed to open in new tab:', err);

    // Fallback to download
    try {
      doc.save(filename);
    } catch (saveErr) {
      console.error('[PDF] Download fallback failed:', saveErr);
      alert('PDF open/download failed. Please try again.');
    }

    if (url) {
      try {
        setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
      } catch {}
    }

    return false;
  }
};

const togglePdfExportModeForBrackets = (bracketsToRender, enabled) => {
  const toggledEls = [];

  for (const br of bracketsToRender || []) {
    const key = br?.key;
    if (!key) continue;

    const el = document.getElementById(`bracket-${sanitizeId(key)}`);
    if (!el) continue;

    if (enabled) {
      el.classList.add('pdf-export-mode');
      toggledEls.push(el);
    } else {
      el.classList.remove('pdf-export-mode');
    }
  }

  return toggledEls;
};

/**
 * PRINT ALL helper:
 * - toggles "pdf-export-mode" on ALL bracket elements while rendering
 * - generates multi-page PDF using existing createPDFDoc (A4 landscape)
 * - opens PDF in NEW tab/window (no auto-print)
 * - popup blocked => download fallback
 */
export const createAndOpenPDFInNewTab = async (
  bracketsToRender,
  { showToast, filename, revokeAfterMs = 60_000 } = {}
) => {
  if (!Array.isArray(bracketsToRender) || bracketsToRender.length === 0) {
    const msg = 'No brackets to export.';
    if (showToast?.error) showToast.error(msg);
    throw new Error(msg);
  }

  const finalFilename = filename || getMultipleBracketsFilename(bracketsToRender);
  const toastId = showToast?.loading ? showToast.loading('Generating PDF... 0%') : null;

  let toggledEls = [];

  try {
    toggledEls = togglePdfExportModeForBrackets(bracketsToRender, true);

    const doc = await createPDFDoc(bracketsToRender, (progress, current, total) => {
      if (toastId && showToast?.update) {
        showToast.update(toastId, `Generating PDF... ${progress}% (${current}/${total})`);
      }
    });

    openPDFInNewTab(doc, finalFilename, revokeAfterMs);

    if (toastId && showToast?.success) {
      showToast.success('PDF opened in new tab.');
    }

    return doc;
  } catch (err) {
    console.error('[Print All PDF] Failed:', err);
    if (toastId && showToast?.error) {
      showToast.error('PDF generation failed. Please try again.');
    }
    throw err;
  } finally {
    try {
      // remove export mode
      for (const el of toggledEls) {
        try {
          el.classList.remove('pdf-export-mode');
        } catch {}
      }
      // safety pass (in case something was missed)
      togglePdfExportModeForBrackets(bracketsToRender, false);
    } catch {}
  }
};

/**
 * SAVE ALL helper:
 * - toggles "pdf-export-mode" on ALL bracket elements while rendering
 * - generates multi-page PDF using existing createPDFDoc (A4 landscape)
 * - downloads via doc.save(filename)
 * - shows progress via showToast
 */
export const createAndDownloadPDF = async (bracketsToRender, { showToast, filename } = {}) => {
  if (!Array.isArray(bracketsToRender) || bracketsToRender.length === 0) {
    const msg = 'No brackets to export.';
    if (showToast?.error) showToast.error(msg);
    throw new Error(msg);
  }

  const finalFilename = filename || getMultipleBracketsFilename(bracketsToRender);
  const toastId = showToast?.loading ? showToast.loading('Generating PDF... 0%') : null;

  let toggledEls = [];

  try {
    toggledEls = togglePdfExportModeForBrackets(bracketsToRender, true);

    const doc = await createPDFDoc(bracketsToRender, (progress, current, total) => {
      if (toastId && showToast?.update) {
        showToast.update(toastId, `Generating PDF... ${progress}% (${current}/${total})`);
      }
    });

    // Download (keep same behavior as single Save PDF)
    try {
      doc.save(finalFilename);
    } catch (err) {
      console.error('[Save All PDF] doc.save failed:', err);
      // fallback: open in new tab (user can save)
      openPDFInNewTab(doc, finalFilename);
    }

    if (toastId && showToast?.success) {
      showToast.success('PDF downloaded successfully!');
    }

    return doc;
  } catch (err) {
    console.error('[Save All PDF] Failed:', err);
    if (toastId && showToast?.error) {
      showToast.error('PDF generation failed. Please try again.');
    }
    throw err;
  } finally {
    try {
      for (const el of toggledEls) {
        try {
          el.classList.remove('pdf-export-mode');
        } catch {}
      }
      togglePdfExportModeForBrackets(bracketsToRender, false);
    } catch {}
  }
};