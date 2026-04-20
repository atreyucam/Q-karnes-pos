import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Field,
  FiltersBar,
  Input,
  Modal,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';
import { useAuthStore } from '../../stores/authStore';
import { useTransformacionesStore } from '../../stores/transformacionesStore';
import { getTransformacionStatusLabel } from './transformacionesUi';

const PAGE_SIZE = 12;

function AuthActionModal({
  open,
  requiresAuth,
  item,
  auth,
  setAuth,
  novedad,
  setNovedad,
  onClose,
  onConfirm,
  loading
}) {
  if (!open || !item) return null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Anular transformación</h3>
          <p className="text-sm text-text-muted">
            {requiresAuth
              ? `Confirma anular ${item.numero}. Esta acción requiere autorización ADMIN.`
              : `Confirma anular ${item.numero}.`}
          </p>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-text-muted">Novedad de anulación</label>
          <Textarea
            className="mt-1"
            rows={3}
            value={novedad}
            onChange={(e) => setNovedad(e.target.value)}
            placeholder="Describe por qué se anula"
          />
        </div>

        {requiresAuth && (
          <div className="rounded-xl border border-warning bg-warning-soft p-3">
            <p className="text-sm font-semibold text-warning">Autorización ADMIN</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <Input
                className="border-warning"
                placeholder="Usuario admin"
                value={auth.usuario}
                onChange={(e) => setAuth((s) => ({ ...s, usuario: e.target.value }))}
              />
              <Input
                type="password"
                className="border-warning"
                placeholder="Clave admin"
                value={auth.password}
                onChange={(e) => setAuth((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Procesando...' : 'Anular'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TransformacionesListPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const { items, loading, saving, error, listar, anular } = useTransformacionesStore();
  const [localError, setLocalError] = useState('');
  const [filters, setFilters] = useState({
    desde: '',
    hasta: '',
    estado: '',
    tipo_proceso: '',
    search: ''
  });
  const [pagina, setPagina] = useState(1);
  const [actionModal, setActionModal] = useState({ open: false, mode: null, item: null });
  const [auth, setAuth] = useState({ usuario: '', password: '' });
  const [novedad, setNovedad] = useState('');
  const isAdminUser = String(currentUser?.rol?.nombre || currentUser?.rol || '').trim().toUpperCase() === 'ADMIN';

  const fetchData = useCallback(async () => {
    setLocalError('');
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => String(value || '').trim() !== '')
    );
    await listar(params).catch((e) => setLocalError(e.message));
  }, [filters, listar]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPagina(1);
  }, [items.length, filters.search, filters.estado, filters.tipo_proceso, filters.desde, filters.hasta]);

  const rows = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, pagina]);
  const totalPaginas = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const openModal = (item) => {
    setAuth({ usuario: '', password: '' });
    setNovedad('');
    setActionModal({ open: true, mode: 'anular', item });
  };

  const onConfirmAction = async () => {
    if (!actionModal.item) return;
    if (!isAdminUser && (!auth.usuario.trim() || !auth.password)) {
      setLocalError('Debes ingresar usuario y clave ADMIN para continuar');
      return;
    }
    if (actionModal.mode === 'anular' && !novedad.trim()) {
      setLocalError('Debes ingresar la novedad de anulación');
      return;
    }

    setLocalError('');
    try {
      await anular(actionModal.item.id, {
        novedad: novedad.trim(),
        ...(isAdminUser ? {} : { autorizacion: { usuario: auth.usuario.trim(), password: auth.password } })
      });
      setActionModal({ open: false, mode: null, item: null });
      await fetchData();
      navigate(`/transformaciones/${actionModal.item.id}`);
    } catch (e) {
      setLocalError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transformaciones"
        description="Listado de transformaciones listas para aplicar, aplicadas y anuladas con trazabilidad operativa."
        actions={(
          <Link to="/transformaciones/nueva">
            <Button>Nueva transformación</Button>
          </Link>
        )}
      />

      {(error || localError) && (
        <Alert tone="error">
          {localError || error}
        </Alert>
      )}

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              placeholder="Número o producto padre"
              value={filters.search}
              onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
            />
          </Field>
        )}
        actions={(
          <>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                const reset = { desde: '', hasta: '', estado: '', tipo_proceso: '', search: '' };
                setFilters(reset);
              }}
              disabled={loading}
            >
              Limpiar filtros
            </Button>
            <Button variant="ghost" onClick={fetchData} disabled={loading}>
              {loading ? 'Filtrando...' : 'Aplicar filtros'}
            </Button>
          </>
        )}
      >
        <Field label="Desde">
          <Input
            type="date"
            value={filters.desde}
            onChange={(e) => setFilters((s) => ({ ...s, desde: e.target.value }))}
          />
        </Field>

        <Field label="Hasta">
          <Input
            type="date"
            value={filters.hasta}
            onChange={(e) => setFilters((s) => ({ ...s, hasta: e.target.value }))}
          />
        </Field>

        <Field label="Estado">
          <Select
            value={filters.estado}
            onChange={(e) => setFilters((s) => ({ ...s, estado: e.target.value }))}
          >
            <option value="">Todos los estados</option>
            <option value="BORRADOR">BORRADOR</option>
            <option value="APLICADA">APLICADA</option>
            <option value="ANULADA">ANULADA</option>
          </Select>
        </Field>

        <Field label="Tipo de proceso">
          <Input
            placeholder="Tipo de proceso"
            value={filters.tipo_proceso}
            onChange={(e) => setFilters((s) => ({ ...s, tipo_proceso: e.target.value }))}
          />
        </Field>
      </FiltersBar>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Código</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Padre</TablaCelda>
              <TablaCelda as="th">Total consumido</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th">Usuario</TablaCelda>
              <TablaCelda as="th">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {rows.map((row) => (
              <TablaFila key={row.id}>
                <TablaCelda>{row.numero}</TablaCelda>
                <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                <TablaCelda>
                  <div className="space-y-1">
                    <p className="font-semibold text-text">{row.insumo?.producto_nombre || '-'}</p>
                    <p className="text-xs text-text-muted">{row.insumo?.producto_codigo || '-'}</p>
                  </div>
                </TablaCelda>
                <TablaCelda>
                  {`${formatQtyByUnit(row.metricas?.total_consumido ?? row.resumen?.entrada_total, row.insumo?.unidad_medida, { fixedWeight: true })} ${row.insumo?.unidad_medida || ''}`.trim()}
                </TablaCelda>
                <TablaCelda>
                  <StatusBadge status={row.estado}>
                    {getTransformacionStatusLabel(row.estado)}
                  </StatusBadge>
                </TablaCelda>
                <TablaCelda>{row.actor?.nombre || row.actor?.usuario || '-'}</TablaCelda>
                <TablaCelda>
                  <TableActions>
                    <TableActionButton variant="neutral" onClick={() => navigate(`/transformaciones/${row.id}`)}>
                      Ver
                    </TableActionButton>
                    {row.acciones?.puede_editar && (
                      <TableActionButton variant="warning" onClick={() => navigate(`/transformaciones/${row.id}/editar`)}>
                        Editar
                      </TableActionButton>
                    )}
                    {row.acciones?.puede_anular && (
                      <TableActionButton variant="danger" onClick={() => openModal(row)} disabled={saving}>
                        Anular
                      </TableActionButton>
                    )}
                  </TableActions>
                </TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>

        <Paginador
          paginaActual={pagina}
          totalPaginas={totalPaginas}
          totalRegistros={items.length}
          mostrarSiempre
          onPageChange={setPagina}
        />

      <AuthActionModal
        open={actionModal.open}
        requiresAuth={!isAdminUser}
        item={actionModal.item}
        auth={auth}
        setAuth={setAuth}
        novedad={novedad}
        setNovedad={setNovedad}
        onClose={() => setActionModal({ open: false, mode: null, item: null })}
        onConfirm={onConfirmAction}
        loading={saving}
      />
    </div>
  );
}
