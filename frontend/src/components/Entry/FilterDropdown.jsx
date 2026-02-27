import React, { useRef, useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import styles from '../../pages/Entry.module.css';

const FilterDropdown = ({
  columnId,
  data = [],
  onFilterChange,
  currentFilters = {},
  onClose,
}) => {
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const [searchValue, setSearchValue] = useState('');
  const [selectedValues, setSelectedValues] = useState(currentFilters[columnId] || []);

  // Unique values
  const uniqueValues = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const values = data
      .map(row => row?.[columnId]?.toString()?.trim() || '')
      .filter(val => val !== '');
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [data, columnId]);

  // Filtered values
  const filteredValues = useMemo(() => {
    if (!searchValue.trim()) return uniqueValues;
    const lowerSearch = searchValue.toLowerCase().trim();
    return uniqueValues.filter(val => val.toLowerCase().includes(lowerSearch));
  }, [uniqueValues, searchValue]);

  // Toggle value
 const toggleValue = (value) => {
    setSelectedValues(prev => {
      return prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value];
    });
  };

  const removeValue = (value) => {
    setSelectedValues(prev => prev.filter(v => v !== value));
  };

  const applyFilters = () => {
    const newFilters = { ...currentFilters };
    if (selectedValues.length === 0) {
      delete newFilters[columnId];
    } else {
      newFilters[columnId] = selectedValues;
    }
    onFilterChange(newFilters);
    onClose();
  };

  // Clear search
  const clearSearch = () => {
    setSearchValue('');
    searchInputRef.current?.focus();
  };

  // Close on outside click / Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    searchInputRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
 <div
  ref={dropdownRef}
  className={styles.filterDropdown}
  style={{
    position: 'relative', // Relative to th
    width: '100%',        // Column की full width
    background: '#fff',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  }}
>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#f8f9fa'
      }}>
        <h5 style={{ margin: 0, fontSize: '1rem' }}>Filter by {columnId.replace(/([A-Z])/g, ' $1').trim()}</h5>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      {/* Selected Values - Pinned at Top */}
      {selectedValues.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          background: '#f0f7ff'
        }}>
          {selectedValues.map(value => (
            <div
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#cf0006',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '0.85rem',
                gap: '6px'
              }}
            >
              <span>{value}</span>
              <button
                onClick={() => removeValue(value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  padding: '0 2px',
                  lineHeight: 1
                }}
                title="Remove filter"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{
        position: 'relative',
        padding: '12px 16px'
      }}>
        <FontAwesomeIcon 
          icon={faSearch} 
          style={{ position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} 
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search values..."
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 10px 10px 36px',
            border: '1px solid #ced4da',
            borderRadius: '6px',
            fontSize: '0.95rem'
          }}
        />
        {searchValue && (
          <button
            onClick={clearSearch}
            style={{
              position: 'absolute',
              right: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer'
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        )}
      </div>

      {/* Values List */}
      <div style={{
        maxHeight: selectedValues.length > 0 ? '280px' : '320px',
        overflowY: 'auto',
        padding: '0 8px 8px'
      }}>
        {filteredValues.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
            No matching values found
          </div>
        ) : (
          filteredValues.map(value => {
            const isSelected = selectedValues.includes(value);
            return (
              <div
                key={value}
                onClick={() => toggleValue(value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: isSelected ? '#e3f2fd' : 'transparent',
                  borderRadius: '6px',
                  marginBottom: '4px',
                  transition: 'background 0.2s',
                  color: 'black'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.background = '#f5f5f5';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  style={{ marginRight: '12px', pointerEvents: 'none' }}
                />
                <span>{value || '(empty)'}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Buttons */}
     <div style={{
  position: 'sticky',
  bottom: 0,
  background: '#fff',
  padding: '12px 16px',
  borderTop: '1px solid #eee',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  zIndex: 10,  // Ensure buttons stay on top
  boxShadow: '0 -2px 8px rgba(0,0,0,0.1)'  // Optional shadow for separation
}}>
  <button
    onClick={onClose}
    style={{
      padding: '8px 16px',
      background: '#f5f5f5',
      border: '1px solid #ccc',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.95rem'
    }}
  >
    Cancel
  </button>
        <button
    onClick={applyFilters}
    style={{
      padding: '8px 16px',
      background: '#cf0006',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.95rem'
    }}
  >
    Apply
  </button>
</div>
    </div>
  );
};

export default FilterDropdown;