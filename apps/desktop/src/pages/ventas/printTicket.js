import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { getUnidad, formatQtyByUnit } from '../../lib/formatQty';

function formatTicketQty(value, unidad) {
  const unit = getUnidad(unidad);
  return `${formatQtyByUnit(value, unit)} ${unit}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printSaleTicketDocument(ticket, options = {}) {
  if (typeof window === 'undefined' || !ticket) return false;

  const metodoPago = options.metodoLabel || ticket.metodo_pago || '-';
  const ticketFecha = ticket?.venta?.fecha ? formatDateQuito(ticket.venta.fecha) : '-';
  const rows = (ticket.detalle || [])
    .map((row) => `
      <tr>
        <td style="padding:4px 6px 4px 0; vertical-align:top;">
          <div class="detail-name">${escapeHtml(row.producto_nombre)}</div>
          <div class="detail-code">${escapeHtml(row.producto_codigo)}</div>
        </td>
        <td style="padding:4px 6px 4px 0; text-align:right; vertical-align:top; white-space:nowrap;">${escapeHtml(formatTicketQty(row.cantidad, row.unidad_medida || 'UND'))}</td>
        <td style="padding:4px 6px 4px 0; text-align:right; vertical-align:top; white-space:nowrap;">${escapeHtml(formatMoney(row.precio_unit))}</td>
        <td style="padding:4px 0 4px 0; text-align:right; vertical-align:top; white-space:nowrap;">${escapeHtml(formatMoney(row.total_linea))}</td>
      </tr>
    `)
    .join('');

  const pagos = (ticket.pagos || [])
    .map((pago) => `
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <span>${escapeHtml(String(pago.tipo || '-').toUpperCase())}</span>
        <span>${escapeHtml(formatMoney(pago.monto))}</span>
      </div>
    `)
    .join('');
  const saldoCredito = Number(ticket?.credito?.saldo_pendiente || 0);

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${escapeHtml(ticket.ticket_config?.numero || ticket.venta?.ticket_numero || '')}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 4mm 3mm;
          }
          html {
            background: #ffffff;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: "Courier New", Courier, monospace;
            font-size: 12px;
            line-height: 1.45;
            color: #000000;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: 800;
          }
          .ticket {
            width: 72mm;
            margin: 0 auto;
            padding: 0;
          }
          .muted { color: #000000; }
          .divider { border-top: 1.5px dashed #000000; margin: 8px 0; }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 11px;
          }
          th {
            text-align: left;
            color: #000000;
            text-transform: uppercase;
            letter-spacing: .04em;
            font-size: 10px;
            font-weight: 800;
            padding-bottom: 4px;
          }
          .summary-row, .pay-row {
            display:flex;
            justify-content:space-between;
            gap:12px;
            font-size:13px;
            margin-bottom:2px;
            font-weight: 800;
          }
          .total {
            font-size: 18px;
            font-weight: 800;
            color: #000000;
          }
          .center { text-align: center; }
          .meta-row {
            margin: 0 0 2px;
            font-size: 12px;
            font-weight: 800;
          }
          .detail-name {
            font-weight: 800;
            color: #000000;
            word-break: break-word;
            font-size: 11px;
          }
          .detail-code {
            font-size: 10px;
            color: #000000;
            text-transform: uppercase;
            letter-spacing: .03em;
            font-weight: 800;
          }
          .text-right { text-align: right; }
          .footer-note {
            text-align: center;
            font-size: 11px;
            line-height: 1.4;
          }
          strong {
            font-weight: 800;
            color: #000000;
          }
          td, th, span, div, p {
            font-weight: 800;
            color: #000000;
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
          <div class="center">
            <div style="font-size:19px; font-weight:800;">${escapeHtml(ticket.negocio?.nombre || 'QKarnes POS')}</div>
            <div class="muted" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em;">Comprobante de venta</div>
            ${ticket.ticket_config?.numero ? `<div class="muted" style="font-size:12px; font-weight:700; margin-top:2px;">${escapeHtml(ticket.ticket_config.numero)}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div style="font-size:12px; font-weight:800;">
            <div class="meta-row"><strong>Venta:</strong> #${escapeHtml(ticket.venta?.id || '-')}</div>
            <div class="meta-row"><strong>Fecha:</strong> ${escapeHtml(ticketFecha)}</div>
            <div class="meta-row"><strong>Cliente:</strong> ${escapeHtml(ticket.cliente?.nombre || 'Consumidor final')}</div>
            <div class="meta-row"><strong>Cajero:</strong> ${escapeHtml(ticket.usuario?.nombre || '-')}</div>
            <div class="meta-row"><strong>Metodo:</strong> ${escapeHtml(metodoPago)}</div>
            <div class="meta-row"><strong>Referencia:</strong> ${escapeHtml(ticket.venta?.referencia || '-')}</div>
          </div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th style="width:48%;">Detalle</th>
                <th class="text-right" style="width:16%;">Cant</th>
                <th class="text-right" style="width:18%;">P. Unit</th>
                <th class="text-right" style="width:18%;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="divider"></div>

          <div class="summary-row muted"><span>Subtotal</span><span><strong>${escapeHtml(formatMoney(ticket.venta?.subtotal))}</strong></span></div>
          <div class="summary-row muted"><span>Descuento</span><span><strong>${escapeHtml(formatMoney(ticket.venta?.descuento_total))}</strong></span></div>
          <div class="summary-row total"><span>Total</span><span>${escapeHtml(formatMoney(ticket.venta?.total))}</span></div>
          ${saldoCredito > 0 ? `<div class="summary-row" style="margin-top:6px; font-weight:700; color:#000000;"><span>Saldo pendiente</span><span>${escapeHtml(formatMoney(saldoCredito))}</span></div>` : ''}

          <div class="divider"></div>

          <div style="font-size:12px; font-weight:800;">
            <div class="muted" style="margin-bottom:6px; text-transform:uppercase; letter-spacing:.08em; font-weight:800;">Formas de pago</div>
            ${pagos || '<div class="muted">Sin pagos registrados</div>'}
          </div>

          <div class="divider"></div>

          <div class="muted footer-note">
            <div>${escapeHtml(ticket.ticket_config?.mensaje || 'Gracias por su compra')}</div>
            <div>Impresion simulada de ticket (offline desktop)</div>
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

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 150);
  };

  iframe.onload = () => {
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
