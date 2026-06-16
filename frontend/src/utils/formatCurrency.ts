/**
 * Formats a numeric amount as Indian Rupees (INR) using en-IN digit grouping.
 * Example: 2720.57 -> ₹2,720.57, 123456.78 -> ₹1,23,456.78
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};
