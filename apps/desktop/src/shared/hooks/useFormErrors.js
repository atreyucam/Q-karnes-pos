import { useCallback, useState } from 'react';

function omitKey(source, key) {
  const next = { ...source };
  delete next[key];
  return next;
}

export default function useFormErrors(initialState = {}) {
  const [errors, setErrors] = useState(initialState);

  const setFieldError = useCallback((field, message) => {
    setErrors((current) => {
      if (!message) return omitKey(current, field);
      if (current[field] === message) return current;
      return { ...current, [field]: message };
    });
  }, []);

  const clearFieldError = useCallback((field) => {
    setErrors((current) => (current[field] ? omitKey(current, field) : current));
  }, []);

  const replaceErrors = useCallback((nextErrors = {}) => {
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, []);

  const resetErrors = useCallback(() => {
    setErrors({});
  }, []);

  return {
    errors,
    hasErrors: Object.keys(errors).length > 0,
    setErrors: replaceErrors,
    setFieldError,
    clearFieldError,
    resetErrors
  };
}
