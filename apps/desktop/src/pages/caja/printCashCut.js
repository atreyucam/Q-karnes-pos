import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveCloseSummary(summary, turno) {
  const efectivoEsperado = Number(summary?.efectivo_esperado || 0);
  return summary?.resumen_cierre || {
    apertura: Number(summary?.resumen_caja?.saldo_inicial || turno?.fondo_inicial || 0),
    efectivo_esperado: efectivoEsperado,
    transferencias: Number(summary?.resumen_ventas?.transferencia || 0),
    credito: Number(summary?.resumen_ventas?.credito || 0),
    total_vendido: Number(summary?.resumen_ventas?.total_ventas || 0),
    total_cobrado: Number(
      Number(summary?.resumen_ventas?.efectivo || 0)
      + Number(summary?.resumen_ventas?.transferencia || 0)
      + Number(summary?.cobranzas_clientes || 0)
    ),
    ingresos: Number(summary?.resumen_caja?.ingresos_efectivo || 0),
    egresos: Number(summary?.resumen_caja?.egresos_efectivo || 0),
    ventas_efectivo: Number(summary?.resumen_ventas?.efectivo || 0),
    cobros_credito_efectivo: Number(summary?.cobranzas_clientes || 0),
    ingresos_manuales: Number(summary?.ingresos_manuales || 0),
    egresos_manuales: Number(summary?.egresos_manuales || 0)
  };
}

function buildRow(label, value, strong = false) {
  return `
    <div class="summary-row${strong ? ' strong-row' : ''}">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(formatMoney(value))}</span>
    </div>
  `;
}

export function printCashCutDocument(summary, options = {}) {
  if (typeof window === 'undefined' || !summary) return false;

  const turno = options.turno || {};
  const closeSummary = resolveCloseSummary(summary, turno);
  const generatedAt = formatDateQuito(new Date().toISOString());
  const turnoLabel = turno?.id ? `Turno #${turno.id}` : 'Turno activo';
  const negocioNombre = options.negocioNombre || 'QKarnes POS';
  const usuarioNombre = options.usuarioNombre || turno?.usuario_nombre || 'Usuario no identificado';

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Corte X ${escapeHtml(turnoLabel)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 4mm 3mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: "Courier New", Courier, monospace;
            color: black;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 12px;
            line-height: 1.45;
            font-weight: 800;
          }
          .ticket {
            width: 72mm;
            margin: 0 auto;
          }
          .header {
            text-align: center;
          }
          .brand {
            font-size: 19px;
            font-weight: 800;
          }
          .meta {
            margin-top: 6px;
            font-size: 12px;
            line-height: 1.4;
          }
          .title {
            text-align: center;
            margin-top: 4px;
          }
          .title h1 {
            margin: 0;
            font-size: 17px;
            font-weight: 800;
          }
          .title p {
            margin: 2px 0 0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .08em;
          }
          .divider {
            border-top: 1.5px dashed black;
            margin: 8px 0;
          }
          .section-title {
            margin: 0 0 6px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: .08em;
            font-weight: 800;
          }
          .summary-row {
            display:flex;
            justify-content:space-between;
            gap:12px;
            font-size:13px;
            margin-bottom:2px;
            font-weight:800;
          }
          .summary-row span:last-child {
            white-space: nowrap;
          }
          .block {
            margin-top: 6px;
          }
          .muted {
            color: black;
          }
          .total {
            font-size: 16px;
            font-weight: 800;
          }
          .footer-note {
            text-align: center;
            font-size: 11px;
            line-height: 1.4;
          }
          strong {
            font-weight: 800;
            color: black;
          }
          div, span, p {
            font-weight: 800;
            color: black;
          }
          @media print {
            body {
              width: 80mm;
            }
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <div class="brand">${escapeHtml(negocioNombre)}</div>
            <div class="title">
              <h1>Corte X</h1>
              <p>Resumen del turno</p>
            </div>
            <div class="meta">
              <div><strong>Turno:</strong> ${escapeHtml(turnoLabel)}</div>
              <div><strong>Cajero:</strong> ${escapeHtml(usuarioNombre)}</div>
              <div><strong>Fecha:</strong> ${escapeHtml(generatedAt)}</div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="block">
            <div class="section-title">Caja física</div>
            ${buildRow('Apertura', closeSummary.apertura)}
            ${buildRow('Ventas efectivo', closeSummary.ventas_efectivo)}
            ${buildRow('Cobros crédito', closeSummary.cobros_credito_efectivo)}
            ${buildRow('Ingresos manuales', closeSummary.ingresos_manuales)}
            ${buildRow('Egresos manuales', closeSummary.egresos_manuales)}
            ${buildRow('Ingresos efectivo', closeSummary.ingresos)}
            ${buildRow('Egresos efectivo', closeSummary.egresos)}
            <div class="divider"></div>
            <div class="summary-row total"><span>Efectivo esperado</span><span>${escapeHtml(formatMoney(closeSummary.efectivo_esperado))}</span></div>
          </div>

          <div class="divider"></div>

          <div class="block">
            <div class="section-title">Métodos de pago</div>
            ${buildRow('Efectivo', closeSummary.ventas_efectivo)}
            ${buildRow('Transferencia', closeSummary.transferencias)}
            ${buildRow('Crédito', closeSummary.credito)}
            <div class="divider"></div>
            ${buildRow('Total vendido', closeSummary.total_vendido)}
            ${buildRow('Total cobrado', closeSummary.total_cobrado)}
          </div>

          <div class="divider"></div>

          <div class="muted footer-note">
            <div>Documento generado desde Caja</div>
            <div>Resumen del turno del día</div>
          </div>
        </div>
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  let hasPrinted = false;

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 150);
  };

  iframe.onload = () => {
    if (hasPrinted) return;
    hasPrinted = true;

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    const onAfterPrint = () => {
      frameWindow.removeEventListener('afterprint', onAfterPrint);
      cleanup();
    };

    frameWindow.addEventListener('afterprint', onAfterPrint);
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(cleanup, 1500);
    }, 80);
  };

  document.body.appendChild(iframe);
  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    cleanup();
    return false;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  return true;
}
