let currentCurrency = 'USD';
let moneyFormatter = buildFormatter(currentCurrency);

function buildFormatter(currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    });
  } catch (_) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  }
}

export function setMoneyCurrency(currency) {
  currentCurrency = String(currency || 'USD').toUpperCase();
  moneyFormatter = buildFormatter(currentCurrency);
}

export function getMoneyCurrency() {
  return currentCurrency;
}

export function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}
