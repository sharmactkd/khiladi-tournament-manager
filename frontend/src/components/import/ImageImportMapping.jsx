import React, { useEffect, useMemo, useState } from 'react';

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

const buildMappedPreviewRows = (rows, headers, mapping) => {
  if (!Array.isArray(rows) || !Array.isArray(headers)) return [];

  return rows.slice(0, 10).map((row) => {
    const mapped = {};
    headers.forEach((header) => {
      const target = mapping?.[header];
      if (target) {
        mapped[target] = row?.[header] ?? '';
      }
    });
    return mapped;
  });
};

const ImageImportMapping = ({ analysis, columnsDef, onConfirm, onBack, onClose, isConfirming }) => {
  const availableTargetColumns = useMemo(
    () =>
      columnsDef
        .filter((col) => col.id !== 'sr' && col.id !== 'actions')
        .map((col) => ({
          id: col.id,
          label: col.header || col.id,
        })),
    [columnsDef]
  );

  const [mapping, setMapping] = useState({});

  useEffect(() => {
    setMapping(analysis?.suggestedMapping || {});
  }, [analysis]);

  const headers = Array.isArray(analysis?.headers) ? analysis.headers : [];
  const rows = Array.isArray(analysis?.rows) ? analysis.rows : [];

  const previewRows = useMemo(() => buildMappedPreviewRows(rows, headers, mapping), [rows, headers, mapping]);

  const mappedFieldCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  const handleChangeMapping = (sourceHeader, targetField) => {
    setMapping((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        if (key !== sourceHeader && next[key] === targetField && targetField) {
          next[key] = '';
        }
      });

      next[sourceHeader] = targetField;
      return next;
    });
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '18px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>Review Column Mapping</h3>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Match detected source headers from the image to your existing entry table fields before importing.
          </p>
          {analysis?.documentTitle ? (
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#4b5563' }}>
              <strong>Detected Document:</strong> {analysis.documentTitle}
            </div>
          ) : null}
        </div>

        <div style={{ color: '#374151', fontSize: '14px', fontWeight: 600 }}>
          Mapped Fields: {mappedFieldCount}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: '20px',
        }}
      >
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#ffffff',
          }}
        >
          <div
            style={{
              background: '#f9fafb',
              padding: '14px 16px',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Source Headers
          </div>

          <div style={{ maxHeight: '420px', overflow: 'auto' }}>
            {headers.map((header) => (
              <div
                key={header}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px',
                  padding: '14px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>{header}</div>
                  <div style={{ color: '#6b7280', fontSize: '13px' }}>
                    Sample: {rows?.[0]?.[header] ? String(rows[0][header]).slice(0, 60) : '—'}
                  </div>
                </div>

                <select
                  value={mapping?.[header] || ''}
                  onChange={(e) => handleChangeMapping(header, e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Do not import</option>
                  {availableTargetColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {!headers.length && <div style={{ padding: '16px', color: '#6b7280' }}>No source headers found.</div>}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#ffffff',
          }}
        >
          <div
            style={{
              background: '#f9fafb',
              padding: '14px 16px',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Preview ({Math.min(rows.length, 10)} rows)
          </div>

          <div style={{ maxHeight: '420px', overflow: 'auto' }}>
            {previewRows.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    {Object.keys(previewRows[0]).map((key) => (
                      <th
                        key={key}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          background: '#f9fafb',
                          color: '#111827',
                          borderBottom: '1px solid #e5e7eb',
                          position: 'sticky',
                          top: 0,
                          zIndex: 1,
                        }}
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={`preview-row-${rowIndex}`}>
                      {Object.keys(previewRows[0]).map((key) => (
                        <td
                          key={`${rowIndex}-${key}`}
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid #f3f4f6',
                            color: '#374151',
                            verticalAlign: 'top',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row[key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '16px', color: '#6b7280' }}>
                Select target fields to see a mapped preview.
              </div>
            )}
          </div>
        </div>
      </div>

      {Array.isArray(analysis?.warnings) && analysis.warnings.length > 0 && (
        <div
          style={{
            marginTop: '18px',
            background: '#fff7ed',
            border: '1px solid #fdba74',
            color: '#9a3412',
            padding: '12px 14px',
            borderRadius: '10px',
            fontSize: '14px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '8px' }}>Analysis Warnings</strong>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {analysis.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginTop: '22px',
        }}
      >
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          Only mapped fields will be imported into the entry table.
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={secondaryButton} disabled={isConfirming}>
            Back
          </button>

          <button type="button" onClick={onClose} style={secondaryButton} disabled={isConfirming}>
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onConfirm(mapping)}
            style={primaryButton}
            disabled={isConfirming || mappedFieldCount === 0}
          >
            {isConfirming ? 'Importing...' : 'Confirm Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageImportMapping;