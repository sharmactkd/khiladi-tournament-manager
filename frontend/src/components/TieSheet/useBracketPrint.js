import { useCallback, useState, useRef } from 'react';
import { sanitizeId } from './bracketUtils';

/**
 * Custom hook to handle printing of brackets with clean, print-friendly output
 * @param {{ showToast: Function, setStatusMessage: Function }} options
 * @returns {{ printBracket: Function, printPool: Function, isPrinting: boolean }}
 */
export const useBracketPrint = ({ showToast, setStatusMessage }) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const cleanupTimeoutRef = useRef(null);

  const showStatus = useCallback(
    (msg, duration = 4000) => {
      setStatusMessage(msg);
      if (duration > 0) {
        setTimeout(() => setStatusMessage(''), duration);
      }
    },
    [setStatusMessage]
  );

  const printWithHide = useCallback(
    (targetPages, isPool = false) => {
      if (isPrinting || !targetPages?.length) return;

      setIsPrinting(true);

      // Filter valid DOM elements
      const validPages = targetPages.filter((p) => p instanceof Element);
      if (validPages.length === 0) {
        showStatus('No valid pages found for printing', 5000);
        setIsPrinting(false);
        return;
      }

      if (import.meta.env.DEV) {
        console.log('🖨️ [useBracketPrint] printing pages:', {
          requested: targetPages?.length || 0,
          valid: validPages.length,
          isPool,
          keys: validPages.map((p) => p?.dataset?.bracketKey || p?.id || '(no-id)'),
        });
      }

      // Create container for print content
      const printContainer = document.createElement('div');
      printContainer.id = 'print-exact-container';
      printContainer.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: white; z-index: 99999;
        overflow: auto; padding: 20px; box-sizing: border-box;
        display: flex; flex-direction: column; align-items: center;
      `;

      // Clone and prepare each page
      validPages.forEach((page) => {
        const clone = page.cloneNode(true);

        // ✅ CRITICAL: Ensure a literal "page" class exists for print pagination
        // even when the original uses CSS Modules hashed class names.
        clone.classList.add('page');

        // Remove interactive elements
        clone
          .querySelectorAll('.buttonContainer, .bracketActions, .actionButtons, .toggleContainer, .toggleGroup, button')
          .forEach((el) => el.remove());

        // Apply print-friendly styles (NO scaling changes)
        clone.style.cssText = `
          position: relative !important;
          margin-bottom: 40px !important;
          background: #ffffff !important;
          padding: 2mm !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
          box-sizing: border-box !important;
          width: 297mm !important;
          height: 210mm !important;
          display: flex !important;
          flex-direction: column !important;
          page-break-inside: avoid !important;
          margin: 0 auto 20px auto !important;
          page-break-after: always !important;
          break-after: page !important;
          break-inside: avoid !important;
          min-height: 210mm !important;
          max-height: 210mm !important;
        `;

        // Double-ensure via direct properties (does not affect layout)
        try {
          clone.style.breakAfter = 'page';
          clone.style.pageBreakAfter = 'always';
          clone.style.breakInside = 'avoid';
          clone.style.pageBreakInside = 'avoid';
        } catch {}

        // Adjust inner containers
        const bracketContainer = clone.querySelector('.bracketContainer');
        if (bracketContainer) {
          bracketContainer.style.cssText = `
            width: 100% !important; flex: 1 !important;
            overflow: hidden !important; padding: 5px 0 !important;
            box-sizing: border-box !important; position: relative !important;
            display: flex !important; flex-direction: column !important;
            justify-content: flex-start !important; z-index: 1 !important;
          `;
        }

        const signatureSection = clone.querySelector('.signatureMedalSection');
        if (signatureSection) {
          signatureSection.style.cssText = `
            display: flex !important; flex-direction: column !important;
            justify-content: space-between !important; align-items: stretch !important;
            padding: 10px !important; flex-shrink: 0 !important;
            gap: 40px !important; background: white !important;
            margin-top: auto !important;
          `;
        }

        const footer = clone.querySelector('.footer');
        if (footer) {
          footer.style.cssText = `
            display: flex !important; justify-content: space-between !important;
            font-size: 12px !important; color: #555 !important;
            margin-left: 10px !important; padding-right: 10px !important;
            padding-top: 7px !important; border-top: 1px solid #e0e0e0 !important;
            flex-shrink: 0 !important;
          `;
        }

        printContainer.appendChild(clone);
      });

      document.body.appendChild(printContainer);

      // Hide main content
      const mainContent = document.querySelector('.tieSheetContainer');
      if (mainContent) mainContent.style.visibility = 'hidden';

      // Inject print-specific styles
      const style = document.createElement('style');
      style.id = 'print-exact-styles';
      style.textContent = `
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body, html { margin: 0 !important; padding: 0 !important; background: white !important; }
          body > *:not(#print-exact-container) { display: none !important; }
          #print-exact-container {
            display: flex !important; flex-direction: column !important;
            align-items: center !important; width: 100% !important; height: auto !important;
            background: white !important; margin: 0 !important; padding: 0 !important;
            overflow: visible !important;
          }

          /* ✅ CRITICAL: Do NOT rely only on ".page". Force breaks on direct children too. */
          #print-exact-container > * {
            page-break-after: always !important;
            break-after: page !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 0 !important;
          }

          #print-exact-container .page {
            page-break-after: always !important;
            break-after: page !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 0 !important;
          }
        }
      `;
      document.head.appendChild(style);

      // Multiple cleanup mechanisms for reliability
      const cleanup = () => {
        if (printContainer?.parentNode) {
          printContainer.parentNode.removeChild(printContainer);
        }
        const styleEl = document.getElementById('print-exact-styles');
        if (styleEl) styleEl.remove();
        if (mainContent) mainContent.style.visibility = '';
        setIsPrinting(false);

        // Clear any pending timeouts
        if (cleanupTimeoutRef.current) {
          clearTimeout(cleanupTimeoutRef.current);
          cleanupTimeoutRef.current = null;
        }

        // Remove event listeners
        window.removeEventListener('afterprint', cleanup);
        window.removeEventListener('focus', onFocusBack);
      };

      // 1. afterprint event (primary trigger)
      window.addEventListener('afterprint', cleanup, { once: true });

      // 2. Safety timeout (in case afterprint doesn't fire - Safari issue)
      cleanupTimeoutRef.current = setTimeout(() => {
        console.warn('afterprint did not fire - using timeout fallback');
        cleanup();
      }, 8000); // 8 seconds should be enough

      // 3. Focus back detection (user returns to tab)
      const onFocusBack = () => {
        setTimeout(cleanup, 1000);
        window.removeEventListener('focus', onFocusBack);
      };
      window.addEventListener('focus', onFocusBack);

      // Trigger print after layout has settled
      setTimeout(() => {
        try {
          window.print();
        } catch (err) {
          console.error('Print failed:', err);
          showToast?.error?.(`Print failed: ${err.message}`);
          cleanup(); // Cleanup on error too
        }
      }, 600); // Slightly longer delay for better layout settling
    },
    [isPrinting, showToast, showStatus]
  );

  const printBracket = useCallback(
    (bracketKey) => {
      const sanitized = sanitizeId(bracketKey);
      let page = document.getElementById(`bracket-${sanitized}`);
      if (!page) {
        page = document.querySelector(`[data-bracket-key="${sanitized}"]`);
      }

      if (!page) {
        showStatus('Bracket page not found. Wait for render?', 6000);
        return;
      }

      printWithHide([page]);
    },
    [printWithHide, showStatus]
  );

  const printPool = useCallback(
    (bracketKey) => {
      const baseKey = bracketKey.replace(/_Pool.*$/, '');
      const sanitizedBase = sanitizeId(baseKey);

      // CSS-modules safe: do not depend on ".page" existing in DOM
      const poolPages = Array.from(document.querySelectorAll('[id^="bracket-"][data-bracket-key]')).filter((page) => {
        const dataKey = page.dataset.bracketKey || '';
        return dataKey.includes(`${sanitizedBase}_pool`) || dataKey.includes(`${sanitizedBase}_poolfinal`);
      });

      if (poolPages.length === 0) {
        showStatus('No pool pages found', 4000);
        return;
      }

      if (import.meta.env.DEV) {
        console.log('🖨️ [useBracketPrint] pool pages found:', poolPages.length, {
          baseKey,
          sanitizedBase,
          keys: poolPages.map((p) => p?.dataset?.bracketKey || p?.id || '(no-id)'),
        });
      }

      printWithHide(poolPages, true);
    },
    [printWithHide, showStatus]
  );

  return {
    printBracket,
    printPool,
    isPrinting,
  };
};