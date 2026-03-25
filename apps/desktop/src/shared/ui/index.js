export { posTokens, chartPalette } from '../tokens/posTokens';
export { uiClassTokens } from '../tokens/uiClassTokens';

// Primitives
export { default as Button } from './primitives/Button';
export { default as Input } from './primitives/Input';
export { default as Select } from './primitives/Select';
export { default as Textarea } from './primitives/Textarea';
export { default as Checkbox } from './primitives/Checkbox';
export { default as Switch } from './primitives/Switch';
export { default as IconButton } from './primitives/IconButton';
export { default as Field, FieldLabel, FieldHint, FieldStack } from './primitives/Field';

// Layout / Surface
export { default as Panel, PanelHeader, PanelSection } from './layout/Panel';
export { default as PageHeader } from './layout/PageHeader';
export { default as PageSection } from './layout/PageSection';
export { default as StatCard } from './layout/StatCard';

// Data display
export { Table, TableHead, TableBody, TableRow, TableCell } from './data-display/Table';
export { default as StatusChip, StatusBadge, TipoBadge, getStatusClasses, getTipoClasses, resolveStatusTone } from './data-display/StatusChip';
export { default as Paginador } from './data-display/Paginador';
export { default as KpiCard } from './data-display/KpiCard';
export { default as ChartCard } from './data-display/ChartCard';
export { default as MetricTile } from './data-display/MetricTile';

// Feedback
export { default as Alert } from './feedback/Alert';
export { default as LoadingState } from './feedback/LoadingState';
export { default as EmptyState } from './feedback/EmptyState';
export { default as Toast } from './feedback/Toast';

// Overlays
export { default as Modal } from './overlays/Modal';
export { default as Drawer } from './overlays/Drawer';
export { default as ConfirmDialog } from './overlays/ConfirmDialog';
export { default as DeactivateEntityDialogs } from './overlays/DeactivateEntityDialogs';

// Navigation
export { default as Dropdown } from './navigation/Dropdown';
export { default as SidebarItem } from './navigation/SidebarItem';
export { default as SidebarSection } from './navigation/SidebarSection';
export { default as TopbarAction } from './navigation/TopbarAction';
export { default as ModuleRail } from './navigation/ModuleRail';

// Compatibility aliases
export { default as Card } from './layout/Panel';
export { PanelHeader as CardHeader, PanelSection as CardSection } from './layout/Panel';
export { Table as Tabla, TableHead as TablaCabecera, TableBody as TablaCuerpo, TableRow as TablaFila, TableCell as TablaCelda } from './data-display/Table';
export { default as SidebarGroup } from './navigation/SidebarSection';
export { default as FieldInput } from './primitives/Input';
export { default as FieldSelect } from './primitives/Select';
export { default as FieldTextarea } from './primitives/Textarea';
