import apiClient, { normalizeResponse } from '../lib/apiClient';

export function emptyDashboardData() {
  return {
    generated_at: null,
    business_date: null,
    kpis: {
      ventas_hoy: 0,
      transacciones_hoy: 0,
      stock_bajo: 0,
      deudas_clientes: 0,
      ticket_promedio: 0,
      variacion_ventas_vs_ayer: 0,
      variacion_transacciones_vs_ayer: 0,
      variacion_stock_vs_ayer: 0,
      variacion_deudas: 0,
      clientes_con_deuda: 0,
      caja_abierta: false
    },
    ventas_por_hora: Array.from({ length: 16 }, (_, index) => ({
      hora: `${String(index + 7).padStart(2, '0')}:00`,
      total: 0,
      transacciones: 0
    })),
    actividad_reciente: [],
    alertas_operativas: [],
    ultimas_ventas: []
  };
}

export function normalizeDashboardData(payload) {
  const base = emptyDashboardData();
  const data = payload && typeof payload === 'object' ? payload : {};

  return {
    generated_at: data.generated_at || null,
    business_date: data.business_date || null,
    kpis: {
      ...base.kpis,
      ...(data.kpis || {})
    },
    ventas_por_hora: Array.isArray(data.ventas_por_hora) && data.ventas_por_hora.length > 0
      ? data.ventas_por_hora.map((item) => ({
          hora: item?.hora || '00:00',
          total: Number(item?.total || 0),
          transacciones: Number(item?.transacciones || 0)
        }))
      : base.ventas_por_hora,
    actividad_reciente: Array.isArray(data.actividad_reciente)
      ? data.actividad_reciente.map((item) => ({
          id: Number(item?.id || 0),
          modulo: item?.modulo || 'SISTEMA',
          accion: item?.accion || 'EVENTO',
          titulo: item?.titulo || 'Actividad operativa',
          descripcion: item?.descripcion || 'Sin detalle disponible',
          usuario: item?.usuario || 'Sistema',
          fecha: item?.fecha || null,
          tone: item?.tone || 'info',
          href: item?.href || '/admin/auditoria'
        }))
      : [],
    alertas_operativas: Array.isArray(data.alertas_operativas || data.alertas)
      ? (data.alertas_operativas || data.alertas).map((item, index) => ({
          id: item?.id || `${item?.category || 'alert'}-${index + 1}`,
          tone: item?.tone || 'warning',
          category: item?.category || 'general',
          title: item?.title || 'Alerta operativa',
          description: item?.description || 'Sin detalle disponible',
          meta: item?.meta || null,
          href: item?.href || '/dashboard'
        }))
      : [],
    ultimas_ventas: Array.isArray(data.ultimas_ventas)
      ? data.ultimas_ventas.map((item) => ({
          id: Number(item?.id || 0),
          venta: item?.venta || '-',
          estado: item?.estado || 'EMITIDA',
          hora: item?.hora || '--:--',
          cliente: item?.cliente || 'Consumidor final',
          metodo: item?.metodo || 'CONTADO',
          total: Number(item?.total || 0),
          usuario: item?.usuario || '-'
        }))
      : []
  };
}

export async function fetchDashboardData() {
  const response = await apiClient.get('/api/reportes/dashboard');
  return normalizeDashboardData(normalizeResponse(response.data));
}
