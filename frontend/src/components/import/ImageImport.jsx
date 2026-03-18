import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeImageImport, confirmImageImport } from '../../api';
import ImageImportMapping from './ImageImportMapping';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  padding: '20px',
};

const modalStyle = {
  width: '100%',
  maxWidth: '1180px',
  maxHeight: '92vh',
  overflow: 'auto',
  background: '#ffffff',
  borderRadius: '14px',
  boxShadow: '0 30px 80px rgba(0, 0, 0, 0.22)',
};

const sectionStyle = {
  padding: '20px 24px',
  borderBottom: '1px solid #e5e7eb',
};

const buttonBase = {
  border: 'none',
  borderRadius: '8px',
  padding: '10px 16px',
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButton = {
  ...buttonBase,
  background: '#111827',
  color: '#ffffff',
};

const secondaryButton = {
  ...buttonBase,
  background: '#f3f4f6',
  color: '#111827',
};

const dangerButton = {
  ...buttonBase,
  background: '#fee2e2',
  color: '#991b1b',
};

const formatError = (error) => {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;

  const rawMessage = String(error.message || '').trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    error.status === 429 ||
    normalizedMessage.includes('temporarily rate-limited') ||
    normalizedMessage.includes('rate limit reached') ||
    normalizedMessage.includes('too many requests')
  ) {
    return 'Image analysis is temporarily rate-limited. Please wait a few seconds and try again.';
  }

  if (
    normalizedMessage.includes('temporarily unavailable') ||
    normalizedMessage.includes('service unavailable')
  ) {
    return 'Image analysis is temporarily unavailable. Please wait a few seconds and try again.';
  }

  return rawMessage || 'Something went wrong.';
};

const ImageImport = ({ show, onClose, onImportSuccess, columnsDef }) => {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');

  const availableFields = useMemo(
    () =>
      columnsDef
        .filter((col) => col.id !== 'sr' && col.id !== 'actions')
        .map((col) => ({
          id: col.id,
          header: col.header || col.id,
        })),
    [columnsDef]
  );

  const resetState = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setAnalysis(null);
    setIsAnalyzing(false);
    setIsConfirming(false);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isAnalyzing || isConfirming) return;
    resetState();
    onClose();
  };

  useEffect(() => {
    if (!show) {
      resetState();
    }
  }, [show]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const handleSelectFile = (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAnalysis(null);
    setError('');
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError('Please select an image first.');
      return;
    }

    if (isAnalyzing || isConfirming) {
      return;
    }

    try {
      setIsAnalyzing(true);
      setError('');

      const formData = new FormData();
      formData.append('image', selectedFile);

      const result = await analyzeImageImport(formData);
      setAnalysis(result);

      if (!Array.isArray(result?.rows) || result.rows.length === 0) {
        setError('No usable rows were detected from this image. Please try a clearer image.');
      }
    } catch (err) {
      console.error('Image analyze failed:', err);
      setError(formatError(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmImport = async (mapping) => {
    try {
      if (!analysis?.headers?.length || !analysis?.rows?.length) {
        setError('No analyzed data available to import.');
        return;
      }

      setIsConfirming(true);
      setError('');

      const payload = {
        headers: analysis.headers,
        rows: analysis.rows,
        mapping,
      };

      const result = await confirmImageImport(payload);
      const finalRows = Array.isArray(result?.rows) ? result.rows : [];

      if (!finalRows.length) {
        const rejectedMessage =
          typeof result?.rejectedRowsCount === 'number' && result.rejectedRowsCount > 0
            ? ` All detected rows were rejected (${result.rejectedRowsCount}).`
            : '';
        throw new Error(`No valid rows found for import.${rejectedMessage}`);
      }

      if (Array.isArray(result?.warnings) && result.warnings.length) {
        alert(result.warnings.join('\n'));
      }

      onImportSuccess(finalRows);
      handleClose();
    } catch (err) {
      console.error('Image confirm import failed:', err);
      setError(formatError(err));
    } finally {
      setIsConfirming(false);
    }
  };

  if (!show) return null;

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            ...sectionStyle,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#111827' }}>Import Data From Image</h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
              Upload an image, analyze it with OpenAI vision, review the detected columns, then import rows into the
              existing entry table.
            </p>
          </div>

          <button type="button" onClick={handleClose} style={secondaryButton} disabled={isAnalyzing || isConfirming}>
            Close
          </button>
        </div>

        <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div
            style={{
              border: '1px dashed #cbd5e1',
              borderRadius: '12px',
              padding: '18px',
              background: '#f8fafc',
            }}
          >
            <div style={{ marginBottom: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={primaryButton}>
                Choose Image
              </button>

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  style={primaryButton}
                  disabled={isAnalyzing || isConfirming}
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze Image'}
                </button>
              )}

              {selectedFile && !isAnalyzing && !isConfirming && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setAnalysis(null);
                    setError('');
                  }}
                  style={dangerButton}
                >
                  Remove
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              style={{ display: 'none' }}
              onChange={handleSelectFile}
            />

            {!selectedFile && (
              <div
                style={{
                  minHeight: '240px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  color: '#6b7280',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                }}
              >
                Select a clear image containing table data, result sheets, or typed / handwritten entry information.
              </div>
            )}

            {selectedFile && (
              <div>
                <div style={{ marginBottom: '10px', color: '#111827', fontWeight: 600 }}>
                  Selected File: {selectedFile.name}
                </div>

                {previewUrl ? (
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      background: '#ffffff',
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt="Selected import preview"
                      style={{
                        width: '100%',
                        maxHeight: '420px',
                        objectFit: 'contain',
                        display: 'block',
                        background: '#ffffff',
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '18px',
              background: '#ffffff',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#111827' }}>Detection Summary</h3>

            <div style={{ display: 'grid', gap: '10px', fontSize: '14px', color: '#374151' }}>
              <div>
                <strong>Status:</strong>{' '}
                {isAnalyzing ? 'Analyzing image...' : analysis ? 'Analysis completed' : 'Waiting for image'}
              </div>

              <div>
                <strong>Document Title:</strong> {analysis?.documentTitle || '—'}
              </div>

              <div>
                <strong>Detected Headers:</strong> {Array.isArray(analysis?.headers) ? analysis.headers.length : 0}
              </div>

              <div>
                <strong>Detected Rows:</strong> {Array.isArray(analysis?.rows) ? analysis.rows.length : 0}
              </div>

              <div>
                <strong>Available Target Fields:</strong> {availableFields.length}
              </div>
            </div>

            {Array.isArray(analysis?.warnings) && analysis.warnings.length > 0 && (
              <div
                style={{
                  marginTop: '16px',
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  color: '#9a3412',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '14px',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '8px' }}>Warnings</strong>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {analysis.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: '16px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {error}
              </div>
            )}

            {!analysis && !error && (
              <div
                style={{
                  marginTop: '16px',
                  color: '#6b7280',
                  fontSize: '14px',
                  lineHeight: 1.6,
                }}
              >
                After selecting an image, click <strong>Analyze Image</strong>. The detected source headers and rows
                will appear below for mapping and review.
              </div>
            )}
          </div>
        </div>

        {analysis && Array.isArray(analysis.rows) && analysis.rows.length > 0 && (
          <ImageImportMapping
            analysis={analysis}
            columnsDef={columnsDef}
            onConfirm={handleConfirmImport}
            onBack={() => {
              setAnalysis(null);
              setError('');
            }}
            onClose={handleClose}
            isConfirming={isConfirming}
          />
        )}
      </div>
    </div>
  );
};

export default ImageImport;