import { useState } from 'react';
import { PiCheck, PiDownload, PiEye, PiPencilSimple, PiTrash, PiX } from 'react-icons/pi';
import {
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusChip,
  Switch,
  TableActionButton,
  TableActions,
  Tabs,
  Textarea,
  Toast
} from '../../shared/ui';

const buttonVariants = ['primary', 'secondary', 'neutral', 'ghost', 'danger'];
const statusExamples = [
  { label: 'Activo', tone: 'success' },
  { label: 'Inactivo', tone: 'neutral' },
  { label: 'Pendiente', tone: 'warning' },
  { label: 'Sin deuda', tone: 'neutral' },
  { label: 'Sin stock', tone: 'danger' },
  { label: 'Bajo mínimo', tone: 'warning' },
  { label: 'Pagada', tone: 'success' },
  { label: 'Emitida', tone: 'success' }
];

const sidebarExamples = [
  { label: 'Dashboard', state: 'active', icon: 'D' },
  { label: 'Caja', state: 'idle', icon: 'C' },
  { label: 'Ventas', state: 'idle', icon: 'V' }
];

export default function DesignSystemPage() {
  const [tab, setTab] = useState('general');
  const [segmented, setSegmented] = useState('listado');
  const [switchValue, setSwitchValue] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="space-y-8 bg-background p-6">
      <PageHeader
        title="Design System Dev"
        description="Superficie local para validar estados visuales e interacciones base. Disponible solo en desarrollo."
      />

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
        <h2 className="text-lg font-semibold text-text">Buttons</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {buttonVariants.map((variant) => (
            <div key={variant} className="rounded-xl border border-border bg-surface-alt p-4">
              <p className="text-sm font-semibold capitalize text-text">{variant}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button data-testid={`button-${variant}`} variant={variant}>{variant}</Button>
                <Button data-testid={`button-${variant}-disabled`} variant={variant} disabled>{variant} disabled</Button>
                <Button data-testid={`button-${variant}-loading`} variant={variant} loading>{variant} loading</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <IconButton data-testid="icon-button-neutral" ariaLabel="Abrir vista previa">
            <PiEye />
          </IconButton>
          <IconButton data-testid="icon-button-danger" variant="danger" ariaLabel="Eliminar registro">
            <PiTrash />
          </IconButton>
          <Button data-testid="button-icon-size" variant="neutral" size="icon" aria-label="Descargar reporte">
            <PiDownload />
          </Button>
          <IconButton data-testid="icon-button-loading" ariaLabel="Procesando acción" loading>
            <PiCheck />
          </IconButton>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
        <h2 className="text-lg font-semibold text-text">Table Actions</h2>
        <TableActions className="mt-4">
          <TableActionButton data-testid="table-action-view" variant="view" icon={<PiEye />}>Ver</TableActionButton>
          <TableActionButton data-testid="table-action-edit" variant="edit" icon={<PiPencilSimple />}>Editar</TableActionButton>
          <TableActionButton data-testid="table-action-primary" variant="primary" icon={<PiCheck />}>Abonar</TableActionButton>
          <TableActionButton data-testid="table-action-danger" variant="danger" icon={<PiTrash />}>Eliminar</TableActionButton>
        </TableActions>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusExamples.map((status) => (
              <StatusChip key={status.label} data-testid={`status-${status.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} tone={status.tone}>{status.label}</StatusChip>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Tabs y segmentos</h2>
          <Tabs
            className="mt-4"
            ariaLabel="Pestañas de ejemplo"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'general', label: 'General', tabId: 'tab-general', panelId: 'panel-general' },
              { key: 'pagos', label: 'Pagos', tabId: 'tab-pagos', panelId: 'panel-pagos', badge: '3' },
              { key: 'riesgo', label: 'Riesgo', tabId: 'tab-riesgo', panelId: 'panel-riesgo' }
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button data-testid="segment-listado" type="button" variant={segmented === 'listado' ? 'primary' : 'secondary'} onClick={() => setSegmented('listado')}>Listado</Button>
            <Button data-testid="segment-resumen" type="button" variant={segmented === 'resumen' ? 'primary' : 'secondary'} onClick={() => setSegmented('resumen')}>Resumen</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Navegación activa</h2>
          <div className="mt-4 max-w-sm rounded-2xl border border-border bg-surface-alt p-3">
            {sidebarExamples.map((item) => (
              <div key={item.label} className={`ui-sidebar-item ${item.state === 'active' ? 'ui-sidebar-item-active' : 'ui-sidebar-item-idle'} mb-2`} data-testid={`sidebar-${item.label.toLowerCase()}`}>
                <span className={`ui-sidebar-active-rail ${item.state === 'active' ? 'ui-sidebar-active-rail-visible' : ''}`} aria-hidden={item.state !== 'active'} />
                <span className="ui-sidebar-item-content min-w-0">
                  <span className="ui-sidebar-icon-wrap">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Form controls</h2>
          <div className="mt-4 space-y-4">
            <Input data-testid="input-sample" placeholder="Buscar cliente" />
            <Select data-testid="select-sample" defaultValue="credito">
              <option value="credito">Crédito</option>
              <option value="contado">Contado</option>
            </Select>
            <Textarea data-testid="textarea-sample" rows={4} placeholder="Observación operativa" />
            <Switch checked={switchValue} onChange={setSwitchValue} label="Estado activo" description="El estado inactivo debe verse neutral." />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Toasts</h2>
          <div className="mt-4 space-y-3">
            <Toast tone="success" title="Producto actualizado" description="Producto actualizado correctamente" />
            <Toast tone="warning" title="Pendiente" description="Hay productos por debajo del mínimo" />
            <Toast tone="danger" title="No se pudo completar" description="La acción crítica requiere confirmación" />
            <Toast tone="info" title="Sincronización" description="Vista de desarrollo disponible en modo local" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-posSm">
          <h2 className="text-lg font-semibold text-text">Modales</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button data-testid="open-modal" onClick={() => setShowModal(true)}>Abrir modal</Button>
            <Button data-testid="open-confirm" variant="danger" onClick={() => setShowConfirm(true)}>Abrir confirmación</Button>
          </div>
        </div>
      </section>

      <Modal open={showModal} onClose={() => setShowModal(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Modal de ejemplo</h3>
              <p className="ui-panel-description">Superficie para validar padding, header y footer.</p>
            </div>
            <IconButton variant="ghost" ariaLabel="Cerrar modal" onClick={() => setShowModal(false)}>
              <PiX />
            </IconButton>
          </div>
          <p className="text-sm text-text-muted">Esta ruta permite revisar rápidamente botones, estados y navegación sin tocar producción.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button loading>Guardar cambios</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => setShowConfirm(false)}
        title="Confirmar eliminación"
        description="El botón de peligro principal debe ser rojo sólido solo en acciones destructivas reales."
        confirmLabel="Eliminar"
        confirmVariant="danger"
      />
    </div>
  );
}
