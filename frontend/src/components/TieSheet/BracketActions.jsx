import React, { useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { shuffleBracket } from '../../store/bracketsSlice'; // Redux action
import styles from '../../pages/TieSheet.module.css';
import { sanitizeId } from './bracketUtils';
import { createPDFDoc, downloadPDF, getBracketFilename } from './pdfUtils';
import toast from 'react-hot-toast';
import LockButton from './LockButton';

const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const ActionButton = ({
  label,
  onClick,
  className = '',
  disabled = false,
  children
}) => (
  <button
    className={`${styles.toggleButton} ${className}`.trim()}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    type="button"
  >
    {children || label}
  </button>
);

const BracketActions = ({
  bracket,
  lockedBrackets,
  bracketsOutcomes,
  filteredBrackets,
  tournamentId,
  showToast,
  toggleLock
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const dispatch = useDispatch();

  const showStatus = (message, duration = 3000) => {
    console.log('[Status] Showing:', message);
    setStatusMessage(message);
    if (duration > 0) setTimeout(() => setStatusMessage(''), duration);
  };

  const baseKey = useMemo(() => {
    return (bracket?.key || '').replace(/_Pool.*$/, '');
  }, [bracket?.key]);

  const isPoolFinal = bracket?.pool === 'Final';
  const isPoolBracket = Boolean(bracket?.pool) && !isPoolFinal;

  // ✅ Lock should be based on baseKey (pool and non-pool consistent)
  const isLocked = useMemo(() => {
    if (!lockedBrackets || !baseKey) return false;
    return lockedBrackets.has(baseKey);
  }, [lockedBrackets, baseKey]);

  // ✅ Disable shuffle if ANY outcome exists in this category (normal + pool-safe)
  const hasAnyWinnerDeclared = useMemo(() => {
    const allOutcomes = bracketsOutcomes && typeof bracketsOutcomes === 'object' ? bracketsOutcomes : {};
    const keys = Object.keys(allOutcomes);

    const relevantKeys = new Set();
    if (bracket?.key) relevantKeys.add(bracket.key);

    if (baseKey) {
      const poolPrefix = `${baseKey}_Pool`;
      keys.forEach((k) => {
        if (k === baseKey) relevantKeys.add(k);
        if (k === `${baseKey}_PoolFinal`) relevantKeys.add(k);
        if (k.startsWith(poolPrefix)) relevantKeys.add(k);
      });
    }

    for (const k of relevantKeys) {
      const o = allOutcomes[k];
      if (o && typeof o === 'object' && Object.keys(o).length > 0) return true;
    }

    return false;
  }, [bracketsOutcomes, bracket?.key, baseKey]);

  const shuffleDisabled = isLocked || isPoolFinal || isProcessing || hasAnyWinnerDeclared;

  const buildBracketInfo = useCallback((br) => {
    if (!br) return {};
    return {
      gender: br.gender,
      ageCategory: br.ageCategory,
      weightCategory: br.weightCategory,
      pool: br.pool || '',
      playerCount: br.playerCount || 0,
      categoryPlayerCount: br.categoryPlayerCount || br.playerCount || 0,
    };
  }, []);

  const captureBracketHtml = useCallback((br) => {
    try {
      const key = br?.key;
      if (!key) return '';
      const el = document.getElementById(`bracket-${sanitizeId(key)}`);
      return el?.outerHTML || '';
    } catch {
      return '';
    }
  }, []);

  const safeSaveRecord = useCallback((br, actionType) => {
    try {
      const saver = window?.saveTieSheetRecord;
      if (typeof saver !== 'function') {
        if (isDev) console.warn('[BracketActions] saveTieSheetRecord not available on window.');
        return;
      }
      if (!br?.key) return;

      const htmlContent = captureBracketHtml(br);
      if (!htmlContent) {
        if (isDev) console.warn('[BracketActions] Record skipped: bracket DOM missing for', br.key);
        return;
      }

      const info = buildBracketInfo(br);
      Promise.resolve(saver(br.key, htmlContent, info, actionType)).catch((e) => {
        if (isDev) console.warn('[BracketActions] saveTieSheetRecord failed:', e);
      });
    } catch (e) {
      if (isDev) console.warn('[BracketActions] safeSaveRecord error:', e);
    }
  }, [buildBracketInfo, captureBracketHtml]);

  // Shuffle function
  const handleShuffle = useCallback(
    (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      console.group('🎯 SHUFFLE DEBUG');
      console.log('Bracket Key:', bracket.key);
      console.log('Locked (baseKey):', lockedBrackets.has(baseKey));
      console.log('Pool:', bracket.pool);
      console.log('Players:', bracket.shuffledPlayers?.length || 0);
      console.log('Has any winners:', hasAnyWinnerDeclared);
      console.groupEnd();

      if (shuffleDisabled) {
        return;
      }

      dispatch(shuffleBracket(bracket.key));
    },
    [bracket, lockedBrackets, dispatch, baseKey, shuffleDisabled, hasAnyWinnerDeclared]
  );

  /**
   * Print helper
   * NOTE: Browser APIs do not reliably tell "user actually printed vs canceled".
   * We log on afterprint (print dialog closed) because that's the only consistent signal.
   */
  const printWithHide = useCallback(
    (targetPages, isPool = false, { onAfterPrint } = {}) => {
      console.log('[Print Helper] शुरू — कुल पेज:', targetPages.length, ' | isPool:', isPool);

      if (isProcessing) {
        console.warn('[Print Helper] पहले से प्रोसेसिंग चल रही है');
        return;
      }

      setIsProcessing(true);

      const validPages = targetPages.filter((p) => p && p.nodeType === 1);
      console.log('[Print Helper] वैध पेज:', validPages.length);

      if (validPages.length === 0) {
        console.warn('[Print Helper] कोई वैध पेज नहीं मिला');
        setIsProcessing(false);
        showStatus('प्रिंट करने के लिए कोई पेज नहीं मिला', 5000);
        return;
      }

      const printContainer = document.createElement('div');
      printContainer.id = 'print-exact-container';
      printContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: white;
        z-index: 99999;
        overflow: auto;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
      `;

      validPages.forEach((page) => {
        const clone = page.cloneNode(true);
        clone.classList.add('page');
        clone.style.breakAfter = 'page';
        clone.style.pageBreakAfter = 'always';

        clone
          .querySelectorAll('.buttonContainer, .bracketActions, .actionButtons, .toggleContainer, .toggleGroup, button')
          .forEach((el) => el.remove());

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
          break-inside: avoid !important;
          min-height: 210mm !important;
          max-height: 210mm !important;
        `;

        const bracketContainer = clone.querySelector('.bracketContainer');
        if (bracketContainer) {
          bracketContainer.style.cssText = `
            width: 100% !important;
            flex: 1 !important;
            overflow: hidden !important;
            padding: 5px 0 !important;
            box-sizing: border-box !important;
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            z-index: 1 !important;
          `;
        }

        const signatureSection = clone.querySelector('.signatureMedalSection');
        if (signatureSection) {
          signatureSection.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            padding: 10px !important;
            flex-shrink: 0 !important;
            gap: 40px !important;
            background: white !important;
            margin-top: auto !important;
          `;
        }

        const footer = clone.querySelector('.footer');
        if (footer) {
          footer.style.cssText = `
            display: flex !important;
            justify-content: space-between !important;
            font-size: 12px !important;
            color: #555 !important;
            margin-left: 10px !important;
            padding-right: 10px !important;
            padding-top: 7px !important;
            border-top: 1px solid #e0e0e0 !important;
            flex-shrink: 0 !important;
          `;
        }

        printContainer.appendChild(clone);
      });

      document.body.appendChild(printContainer);

      const mainContent = document.querySelector('.tieSheetContainer');
      if (mainContent) {
        mainContent.style.visibility = 'hidden';
      }

      const style = document.createElement('style');
      style.id = 'print-exact-styles';
      style.textContent = `
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > *:not(#print-exact-container) { display: none !important; }
          #print-exact-container {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          #print-exact-container .page {
            page-break-after: always !important;
            break-after: page !important;
            break-inside: avoid !important;
            margin-bottom: 0 !important;
          }
          #print-exact-container > * {
            break-after: page !important;
            page-break-after: always !important;
          }
        }
      `;
      document.head.appendChild(style);

      setTimeout(() => {
        try {
          window.print();
          console.log('✅ Print dialog खुल गया');
        } catch (err) {
          console.error('Print error:', err);
          showToast.error('प्रिंट फेल: ' + err.message);
        }
      }, 600);

      const cleanup = () => {
        console.log('🧹 Print cleanup');
        try {
          if (typeof onAfterPrint === 'function') onAfterPrint();
        } catch (e) {
          if (isDev) console.warn('[Print Helper] onAfterPrint failed:', e);
        }

        if (printContainer.parentNode) printContainer.parentNode.removeChild(printContainer);
        const styleEl = document.getElementById('print-exact-styles');
        if (styleEl) styleEl.remove();
        if (mainContent) mainContent.style.visibility = '';
        setIsProcessing(false);
        window.removeEventListener('afterprint', cleanup);
      };

      window.addEventListener('afterprint', cleanup);
    },
    [isProcessing, showStatus, showToast]
  );

  // Print single bracket
  const handlePrintBracket = useCallback(() => {
    console.log('=== [PRINT START] Bracket:', bracket.key);
    const sanitized = sanitizeId(bracket.key);

    let page = document.querySelector(`.page[data-bracket-key="${sanitized}"]`);
    if (!page) {
      page = document.getElementById(`bracket-${sanitized}`);
    }

    if (!page) {
      const allPages = document.querySelectorAll('.page');
      for (const p of allPages) {
        if (p.id === `bracket-${sanitized}` || p.dataset.bracketKey === sanitized) {
          page = p;
          break;
        }
      }
    }

    if (!page) {
      console.error('FINAL: Page not found after all attempts');
      showStatus('Bracket ka page nahi mila – brackets render ho rahe hain?', 8000);
      return;
    }

    console.log('Page found, starting print...');

    printWithHide([page], false, {
      onAfterPrint: () => {
        // ✅ Log record for this bracket on afterprint
        safeSaveRecord(bracket, 'print');
      },
    });
  }, [bracket, printWithHide, showStatus, safeSaveRecord]);

  // Print pool brackets (all pool pages of same base category)
  const handlePrintPool = useCallback(() => {
    if (!bracket.pool || bracket.pool === 'Final') return;

    const baseKeyLocal = bracket.key.replace(/_Pool.*$/, '');
    const sanitizedBase = sanitizeId(baseKeyLocal);

    const poolPages = Array.from(document.querySelectorAll('.page')).filter((page) => {
      const dataKey = page.dataset.bracketKey;
      return dataKey && (dataKey.includes(sanitizedBase + '_pool') || dataKey.includes(sanitizedBase + '_poolfinal'));
    });

    if (poolPages.length === 0) {
      showStatus('Pool category ke pages nahi mile', 4000);
      return;
    }

    const poolBracketsToLog = Array.isArray(filteredBrackets)
      ? filteredBrackets.filter((b) => b?.key && (b.key === `${baseKeyLocal}_PoolFinal` || b.key.startsWith(`${baseKeyLocal}_Pool`)))
      : [];

    printWithHide(poolPages, true, {
      onAfterPrint: () => {
        // ✅ Log record for each pool bracket page
        for (const b of poolBracketsToLog) safeSaveRecord(b, 'print');
      },
    });
  }, [bracket.key, bracket.pool, filteredBrackets, printWithHide, showStatus, safeSaveRecord]);

  const handleSavePDF = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const toastId = showToast.loading('Generating PDF... 0%');

    let savedOk = false;

    try {
      console.log('[Save PDF] Starting for:', bracket.key);

      const bracketElement = document.getElementById(`bracket-${sanitizeId(bracket.key)}`);
      if (bracketElement) {
        bracketElement.classList.add('pdf-export-mode');
      }

      const doc = await createPDFDoc([bracket], (progress) => {
        showToast.update(toastId, `Generating PDF... ${progress}%`);
      });

      if (bracketElement) {
        bracketElement.classList.remove('pdf-export-mode');
      }

      const filename = getBracketFilename(bracket);

      // downloadPDF doesn't throw in most cases, but keep try/catch anyway
      try {
        downloadPDF(doc, filename);
        savedOk = true;
      } catch (e) {
        console.error('[Save PDF] downloadPDF failed:', e);
        savedOk = false;
      }

      if (savedOk) {
        showToast.success('PDF downloaded successfully!');
        // ✅ Log record only after save path succeeded
        safeSaveRecord(bracket, 'save');
      } else {
        showToast.error('PDF generation failed. Try Print instead.');
      }
    } catch (err) {
      console.error('[Save PDF] Failed:', err);
      showToast.error('PDF generation failed. Try Print instead.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => toast.dismiss(toastId), 1000);
    }
  }, [bracket, isProcessing, showToast, safeSaveRecord]);

  return (
    <div className={styles.buttonContainer} onClick={(e) => e.stopPropagation()}>
      {statusMessage && (
        <div className={`${styles.statusMessage} ${statusMessage.includes('failed') ? styles.error : ''}`}>
          {statusMessage}
        </div>
      )}

      <div className={styles.leftButtons}>
        <ActionButton
          label="Shuffle"
          onClick={handleShuffle}
          className={`${styles.shuffleButton} ${isProcessing ? styles.disabled : ''}`}
          disabled={shuffleDisabled}
        >
          🔀 Shuffle
        </ActionButton>

        <LockButton
          bracketKey={bracket.key}
          lockedBrackets={lockedBrackets}
          toggleLock={toggleLock}
          disabled={isProcessing || isPoolFinal}
        />
      </div>

      <div className={styles.centerButtonsWrapper}>
        <div className={styles.centerButtons}>
          <ActionButton
            label="Print Bracket"
            onClick={handlePrintBracket}
            className={`${styles.printButton} ${isProcessing ? styles.disabled : ''}`}
            disabled={isProcessing}
          >
            🖨️ Print Bracket
          </ActionButton>

          {isPoolBracket && (
            <ActionButton
              label="Print Pool"
              onClick={handlePrintPool}
              className={`${styles.printPoolButton} ${isProcessing ? styles.disabled : ''}`}
              disabled={isProcessing}
            >
              🏊 Print Pool
            </ActionButton>
          )}
        </div>
      </div>

      <div className={styles.rightButton}>
        <ActionButton
          label={isProcessing ? 'Generating...' : 'Save PDF'}
          onClick={handleSavePDF}
          className={`${styles.saveButton} ${isProcessing ? styles.processing : ''}`}
          disabled={isProcessing || !bracket?.gamesByRound?.length}
        >
          {isProcessing ? '⏳ Generating...' : '💾 Save PDF'}
        </ActionButton>
      </div>

      {isProcessing && (
        <div className={styles.processingOverlay}>
          <div className={styles.spinner}></div>
        </div>
      )}
    </div>
  );
};

export default BracketActions;