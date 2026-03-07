export function defaultAction(set, action, mapSuccess = (d) => d) {
  return async (...args) => {
    set({ loading: true, error: null });
    try {
      const data = await action(...args);
      const mapped = mapSuccess(data);
      set({ loading: false, ...mapped });
      return data;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  };
}
