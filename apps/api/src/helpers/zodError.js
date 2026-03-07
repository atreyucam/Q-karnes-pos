function zodError(error) {
  const details = error?.flatten ? error.flatten() : {};
  return {
    error: 'Datos inválidos',
    details
  };
}

module.exports = { zodError };
