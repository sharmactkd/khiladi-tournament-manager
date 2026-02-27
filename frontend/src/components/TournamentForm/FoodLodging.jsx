// src/components/TournamentForm/FoodLodging.jsx

import React from 'react';
import CurrencyInput from 'react-currency-input-field';
import { ErrorMessage } from 'formik'; // Formik se error message
import styles from "../../pages/TournamentForm.module.css";

const FoodLodging = ({ values, setFieldValue, errors, touched }) => {
  const handleOptionChange = (option) => {
    setFieldValue('foodAndLodging.option', option);
    setFieldValue('foodAndLodging.type', option === 'No' ? 'Free' : 'Free');
    setFieldValue('foodAndLodging.paymentMethod', '');
    setFieldValue('foodAndLodging.amount', undefined);
  };

  const handleTypeChange = (type) => {
    setFieldValue('foodAndLodging.type', type);
    setFieldValue('foodAndLodging.paymentMethod', type === 'Paid' ? 'per day' : '');
    setFieldValue('foodAndLodging.amount', type === 'Paid' ? (values.foodAndLodging?.amount || '0') : undefined);
  };

  const handlePaymentMethodChange = (method) => {
    setFieldValue('foodAndLodging.paymentMethod', method);
  };

  const handleAmountChange = (value) => {
    setFieldValue('foodAndLodging.amount', value ? Number(value) : undefined);
  };

  return (
    <div className={styles.section}>
      <h2>Food & Lodging</h2>
      <div className={styles.foodingContainer}>
        {/* Options */}
        <div className={styles.foodingOptions}>
          {['No', 'Only Food', 'Only Stay', 'Food and Stay'].map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.foodingOption} ${
                values.foodAndLodging?.option === option ? styles.selectedFooding : ''
              }`}
              onClick={() => handleOptionChange(option)}
              aria-pressed={values.foodAndLodging?.option === option}
              aria-label={`Food and lodging option: ${option}`}
            >
              {option === 'No' ? 'No Food, No Stay' : option}
            </button>
          ))}
        </div>

        {/* Type & Payment */}
        {values.foodAndLodging?.option !== 'No' && (
          <div className={styles.typeAndPaymentRow}>
            {/* Free / Inclusive */}
            <button
              type="button"
              className={`${styles.typeButton} ${
                values.foodAndLodging?.type === 'Free' ? styles.selectedType : ''
              }`}
              onClick={() => handleTypeChange('Free')}
              aria-pressed={values.foodAndLodging?.type === 'Free'}
              aria-label="Free / Inclusive food and lodging"
            >
              Free / Inclusive
            </button>

            {/* Paid */}
            <button
              type="button"
              className={`${styles.typeButton} ${
                values.foodAndLodging?.type === 'Paid' ? styles.selectedType : ''
              }`}
              onClick={() => handleTypeChange('Paid')}
              aria-pressed={values.foodAndLodging?.type === 'Paid'}
              aria-label="Paid food and lodging"
            >
              Paid
            </button>

            {values.foodAndLodging?.type === 'Paid' && (
              <>
                {/* Amount */}
                <div className={styles.fieldWrapper}>
                  <CurrencyInput
                    value={values.foodAndLodging?.amount || '0'}
                    onValueChange={(value) => handleAmountChange(value)}
                    placeholder="Amount"
                    className={touched.foodAndLodging?.amount && errors.foodAndLodging?.amount ? styles.errorInput : styles.amountInput}
                    prefix={values.entryFees?.currencySymbol || '₹'}
                    decimalsLimit={2}
                    aria-label="Food and lodging amount"
                  />
                  <ErrorMessage name="foodAndLodging.amount" component="div" className={styles.errorText} />
                </div>

                {/* Per Day */}
                <button
                  type="button"
                  className={`${styles.paymentButton} ${
                    values.foodAndLodging?.paymentMethod === 'per day' ? styles.selectedPayment : ''
                  }`}
                  onClick={() => handlePaymentMethodChange('per day')}
                  aria-pressed={values.foodAndLodging?.paymentMethod === 'per day'}
                  aria-label="Payment per day"
                >
                  Per Day
                </button>

                {/* Total */}
                <button
                  type="button"
                  className={`${styles.paymentButton} ${
                    values.foodAndLodging?.paymentMethod === 'total' ? styles.selectedPayment : ''
                  }`}
                  onClick={() => handlePaymentMethodChange('total')}
                  aria-pressed={values.foodAndLodging?.paymentMethod === 'total'}
                  aria-label="Total payment"
                >
                  Total
                </button>

                {/* Error for payment method */}
                <ErrorMessage name="foodAndLodging.paymentMethod" component="div" className={styles.errorText} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FoodLodging;