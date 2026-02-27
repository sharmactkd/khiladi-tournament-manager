// src/components/TournamentForm/EventCategories.jsx

import React from 'react';
import { KYORUGI_SUB_EVENTS, POOMSAE_SUB_EVENTS } from './constants';
import CurrencyInput from 'react-currency-input-field';
import CurrencySelector from './CurrencySelector';
import { ErrorMessage } from 'formik';
import styles from "../../pages/TournamentForm.module.css";
import {
  handleKyorugiSubEventToggle,
  handlePoomsaeCategoryToggle,
  handleSelectAllKyorugi,
  handleSelectAllPoomsae
} from './helpers';

const EventCategories = ({
  values,
  setFieldValue,
  errors,
  touched,
  handleFeeTypeChange,
  handleAmountChange,
  currencyOptions,
}) => {
  return (
    <div className={styles.section}>
      {/* Section Header with Currency Selector */}
      <div className={styles.sectionHeader}>
        <h2>Event Categories & Entry Fees</h2>
        <CurrencySelector
          currencyOptions={currencyOptions}
          values={values}
          setFieldValue={setFieldValue}
          errors={errors}
          touched={touched}
        />
      </div>

      <div className={styles.eventContainer}>
        {/* ==================== KYORUGI ==================== */}
        <div
          className={`${styles.eventBox} ${
            values.eventCategories?.kyorugi?.selected ? styles.activeEvent : ''
          }`}
        >
          <div className={styles.eventHeader}>
            {/* Select All Button – अब helpers.js से */}
            <button
              type="button"
              className={`${styles.selectAllButtonEvent} ${styles.noContainerToggle}`}
              onClick={() => handleSelectAllKyorugi(values, setFieldValue)}
              aria-label="Select or deselect all Kyorugi sub-events"
            >
              Select All
            </button>

            <span className={styles.eventTitle}>Kyorugi</span>

            {/* Main Toggle for Kyorugi */}
            <label className={`${styles.eventToggle} ${styles.noContainerToggle}`}>
              <input
                type="checkbox"
                checked={values.eventCategories?.kyorugi?.selected || false}
                onChange={(e) => {
                  setFieldValue('eventCategories.kyorugi.selected', e.target.checked);
                }}
                aria-label="Enable Kyorugi event category"
              />
              <ErrorMessage name="eventCategories.kyorugi.selected" component="div" className={styles.errorText} />
            </label>
          </div>

          {/* Sub Events */}
          <div className={styles.subEventRow}>
            {KYORUGI_SUB_EVENTS.map((sub) => (
              <div key={sub.key} className={styles.subEventItem}>
                <button
                  type="button"
                  className={`${styles.subEventButton} ${
                    values.eventCategories?.kyorugi?.sub?.[sub.key] ? styles.selectedSubEvent : ''
                  }`}
                  onClick={() => handleKyorugiSubEventToggle(values, setFieldValue, sub.key)}
                  aria-pressed={values.eventCategories?.kyorugi?.sub?.[sub.key]}
                  aria-label={`Toggle ${sub.label} sub-event`}
                >
                  {sub.label}
                </button>

                {/* Fee Options when sub-event is selected */}
                {values.eventCategories?.kyorugi?.sub?.[sub.key] && (
                  <div className={styles.feeOptions}>
                    <div className={styles.feeButtons}>
                      <button
                        type="button"
                        className={`${styles.feeButton} ${
                          values.entryFees?.amounts?.kyorugi?.[sub.key]?.type === 'Free'
                            ? styles.selectedFee
                            : ''
                        }`}
                        onClick={() => handleFeeTypeChange('kyorugi', sub.key, 'Free')}
                        aria-pressed={values.entryFees?.amounts?.kyorugi?.[sub.key]?.type === 'Free'}
                        aria-label={`Set entry fee to free for ${sub.label}`}
                      >
                        FREE
                      </button>

                      <button
                        type="button"
                        className={`${styles.feeButton} ${
                          values.entryFees?.amounts?.kyorugi?.[sub.key]?.type === 'Paid'
                            ? styles.selectedFee
                            : ''
                        }`}
                        onClick={() => handleFeeTypeChange('kyorugi', sub.key, 'Paid')}
                        aria-pressed={values.entryFees?.amounts?.kyorugi?.[sub.key]?.type === 'Paid'}
                        aria-label={`Set entry fee to paid for ${sub.label}`}
                      >
                        Paid
                      </button>
                    </div>

                    {/* Amount Input when Paid */}
                    {values.entryFees?.amounts?.kyorugi?.[sub.key]?.type === 'Paid' && (
                      <div className={styles.fieldWrapper}>
                        <CurrencyInput
                          value={values.entryFees?.amounts?.kyorugi?.[sub.key]?.amount || 0}
                          onValueChange={(value) => handleAmountChange('kyorugi', sub.key, value)}
                          placeholder="Amount"
                          className={styles.amountInput}
                          prefix={values.entryFees?.currencySymbol || '₹'}
                          decimalsLimit={2}
                          aria-label={`Entry fee amount for ${sub.label}`}
                        />
                        <ErrorMessage
                          name={`entryFees.amounts.kyorugi.${sub.key}.amount`}
                          component="div"
                          className={styles.errorText}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ==================== POOMSAE ==================== */}
        <div
          className={`${styles.eventBox} ${
            values.eventCategories?.poomsae?.selected ? styles.activeEvent : ''
          }`}
        >
          <div className={styles.eventHeader}>
            {/* Select All Button – अब helpers.js से */}
            <button
              type="button"
              className={`${styles.selectAllButtonEvent} ${styles.noContainerToggle}`}
              onClick={() => handleSelectAllPoomsae(values, setFieldValue)}
              aria-label="Select or deselect all Poomsae categories"
            >
              Select All
            </button>

            <span className={styles.eventTitle}>Poomsae</span>

            {/* Main Toggle for Poomsae */}
            <label className={`${styles.eventToggle} ${styles.noContainerToggle}`}>
              <input
                type="checkbox"
                checked={values.eventCategories?.poomsae?.selected || false}
                onChange={(e) => {
                  setFieldValue('eventCategories.poomsae.selected', e.target.checked);
                }}
                aria-label="Enable Poomsae event category"
              />
              <ErrorMessage name="eventCategories.poomsae.selected" component="div" className={styles.errorText} />
            </label>
          </div>

          {/* Sub Categories */}
          <div className={styles.subEventRow}>
            {POOMSAE_SUB_EVENTS.map((sub) => (
              <div key={sub} className={styles.subEventItem}>
                <button
                  type="button"
                  className={`${styles.subEventButton} ${
                    values.eventCategories?.poomsae?.categories?.includes(sub) ? styles.selectedSubEvent : ''
                  }`}
                  onClick={() => handlePoomsaeCategoryToggle(values, setFieldValue, sub)}
                  aria-pressed={values.eventCategories?.poomsae?.categories?.includes(sub)}
                  aria-label={`Toggle Poomsae category: ${sub}`}
                >
                  {sub}
                </button>

                {/* Fee Options when category is selected */}
                {values.eventCategories?.poomsae?.categories?.includes(sub) && (
                  <div className={styles.feeOptions}>
                    <div className={styles.feeButtons}>
                      <button
                        type="button"
                        className={`${styles.feeButton} ${
                          values.entryFees?.amounts?.poomsae?.[sub]?.type === 'Free'
                            ? styles.selectedFee
                            : ''
                        }`}
                        onClick={() => handleFeeTypeChange('poomsae', sub, 'Free')}
                        aria-pressed={values.entryFees?.amounts?.poomsae?.[sub]?.type === 'Free'}
                        aria-label={`Set entry fee to free for ${sub}`}
                      >
                        FREE
                      </button>

                      <button
                        type="button"
                        className={`${styles.feeButton} ${
                          values.entryFees?.amounts?.poomsae?.[sub]?.type === 'Paid'
                            ? styles.selectedFee
                            : ''
                        }`}
                        onClick={() => handleFeeTypeChange('poomsae', sub, 'Paid')}
                        aria-pressed={values.entryFees?.amounts?.poomsae?.[sub]?.type === 'Paid'}
                        aria-label={`Set entry fee to paid for ${sub}`}
                      >
                        Paid
                      </button>
                    </div>

                    {/* Amount Input when Paid */}
                    {values.entryFees?.amounts?.poomsae?.[sub]?.type === 'Paid' && (
                      <div className={styles.fieldWrapper}>
                        <CurrencyInput
                          value={values.entryFees?.amounts?.poomsae?.[sub]?.amount || 0}
                          onValueChange={(value) => handleAmountChange('poomsae', sub, value)}
                          placeholder="Amount"
                          className={styles.amountInput}
                          prefix={values.entryFees?.currencySymbol || ''}
                          decimalsLimit={2}
                          aria-label={`Entry fee amount for Poomsae ${sub}`}
                        />
                        <ErrorMessage
                          name={`entryFees.amounts.poomsae.${sub}.amount`}
                          component="div"
                          className={styles.errorText}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventCategories;    