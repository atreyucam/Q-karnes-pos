const TOLERANCE = 0.01;

function moneyRound(n) {
  const value = Number(n || 0);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountsEqual(a, b, tolerance = TOLERANCE) {
  return Math.abs(moneyRound(a) - moneyRound(b)) <= tolerance;
}

module.exports = {
  moneyRound,
  amountsEqual,
  TOLERANCE
};
