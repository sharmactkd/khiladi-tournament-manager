import BillingInvoice from "../models/billingInvoice.js";
import logger from "../utils/logger.js";

const generateInvoiceNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return `INV-${timestamp}-${random}`;
};

export const createInvoice = async ({
  userId,
  paymentId = null,
  transactionId = null,
  invoiceType = "payment",
  planType = "",
  planSnapshot = null,
  amount = 0,
  currency = "INR",
  paymentGateway = "",
  couponCode = "",
  couponCategory = "",
  metadata = {},
} = {}) => {
  const invoice = await BillingInvoice.create({
    userId,
    paymentId,
    transactionId,
    invoiceNumber: generateInvoiceNumber(),
    invoiceType,
    planType,
    planSnapshot,
    amount,
    currency,
    paymentGateway,
    couponCode,
    couponCategory,
    metadata,
  });

  logger.info("Billing invoice created", {
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    userId,
    invoiceType,
  });

  return invoice;
};

export default createInvoice;