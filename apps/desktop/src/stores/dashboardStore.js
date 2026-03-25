import { create } from 'zustand';
import { parseApiError } from '../lib/apiClient';
import { emptyDashboardData, fetchDashboardData } from '../services/dashboardService';

export const useDashboardStore = create((set) => ({
  dashboardData: emptyDashboardData(),
  loading: false,
  error: null,
  hasLoaded: false,
  async cargarDashboard() {
    set((state) => ({
      loading: true,
      error: null,
      dashboardData: state.hasLoaded ? state.dashboardData : emptyDashboardData()
    }));

    try {
      const dashboardData = await fetchDashboardData();
      set({
        dashboardData,
        loading: false,
        error: null,
        hasLoaded: true
      });
      return dashboardData;
    } catch (error) {
      const message = parseApiError(error);
      set((state) => ({
        loading: false,
        error: message,
        hasLoaded: true,
        dashboardData: state.dashboardData || emptyDashboardData()
      }));
      return emptyDashboardData();
    }
  }
}));
