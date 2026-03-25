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
        <td style="padding:6px 8px 6px 0; vertical-align:top;">
          <div style="font-weight:700; color:#171717;">${escapeHtml(row.producto_nombre)}</div>
          <div style="font-size:10px; color:#737373; text-transform:uppercase; letter-spacing:.08em;">${escapeHtml(row.producto_codigo)}</div>
        </td>
        <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${escapeHtml(formatTicketQty(row.cantidad, row.unidad_medida || 'UND'))}</td>
        <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${escapeHtml(formatMoney(row.precio_unit))}</td>
        <td style="padding:6px 0 6px 8px; text-align:right; white-space:nowrap;">${escapeHtml(formatMoney(row.total_linea))}</td>
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
          body {
            margin: 0;
            padding: 20px;
            font-family: Inter, "Segoe UI", Arial, sans-serif;
            color: #171717;
            background: #ffffff;
          }
          .ticket {
            max-width: 360px;
            margin: 0 auto;
            border: 1px solid #e5e5e5;
            border-radius: 18px;
            padding: 18px;
          }
          .muted { color: #737373; }
          .divider { border-top: 1px dashed #d4d4d4; margin: 12px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th {
            text-align: left;
            color: #737373;
            text-transform: uppercase;
            letter-spacing: .08em;
            font-size: 10px;
            padding-bottom: 6px;
          }
          .summary-row, .pay-row {
            display:flex;
            justify-content:space-between;
            gap:12px;
            font-size:12px;
            margin-bottom:4px;
          }
          .total {
            font-size: 16px;
            font-weight: 800;
            color: #171717;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div style="text-align:center;">
            <div style="font-size:18px; font-weight:800;">${escapeHtml(ticket.negocio?.nombre || 'QKarnes POS')}</div>
            <div class="muted" style="font-size:10px; text-transform:uppercase; letter-spacing:.12em;">Comprobante de venta</div>
            ${ticket.ticket_config?.numero ? `<div class="muted" style="font-size:11px; margin-top:4px;">${escapeHtml(ticket.ticket_config.numero)}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div style="font-size:12px; line-height:1.65;">
            <div><strong>Venta:</strong> #${escapeHtml(ticket.venta?.id || '-')}</div>
            <div><strong>Fecha:</strong> ${escapeHtml(ticketFecha)}</div>
            <div><strong>Cliente:</strong> ${escapeHtml(ticket.cliente?.nombre || 'Consumidor final')}</div>
            <div><strong>Cajero:</strong> ${escapeHtml(ticket.usuario?.nombre || '-')}</div>
            <div><strong>Metodo:</strong> ${escapeHtml(metodoPago)}</div>
            <div><strong>Referencia:</strong> ${escapeHtml(ticket.venta?.referencia || '-')}</div>
          </div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th>Detalle</th>
                <th style="text-align:right;">Cant</th>
                <th style="text-align:right;">P. Unit</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="divider"></div>

          <div class="summary-row muted"><span>Subtotal</span><span>${escapeHtml(formatMoney(ticket.venta?.subtotal))}</span></div>
          <div class="summary-row muted"><span>Descuento</span><span>${escapeHtml(formatMoney(ticket.venta?.descuento_total))}</span></div>
          <div class="summary-row total"><span>Total</span><span>${escapeHtml(formatMoney(ticket.venta?.total))}</span></div>
          ${saldoCredito > 0 ? `<div class="summary-row" style="margin-top:6px; font-weight:700; color:#b91c1c;"><span>Saldo pendiente</span><span>${escapeHtml(formatMoney(saldoCredito))}</span></div>` : ''}

          <div class="divider"></div>

          <div style="font-size:12px;">
            <div class="muted" style="margin-bottom:6px; text-transform:uppercase; letter-spacing:.08em;">Formas de pago</div>
            ${pagos || '<div class="muted">Sin pagos registrados</div>'}
          </div>

          <div class="divider"></div>

          <div class="muted" style="text-align:center; font-size:11px; line-height:1.5;">
            <div>${escapeHtml(ticket.ticket_config?.mensaje || 'Gracias por su compra')}</div>
            <div>Impresion simulada de ticket (offline desktop)</div>
          </div>
        </div>
        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 250);
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=760');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}
