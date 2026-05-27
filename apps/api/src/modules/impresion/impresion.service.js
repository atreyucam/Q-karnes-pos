const { spawn } = require('node:child_process');
const { AppError } = require('../../helpers/AppError');
const { createLogger } = require('../../helpers/logger');
const ventasService = require('../ventas/ventas.service');
const configuracionService = require('../configuracion/configuracion.service');

const printerLogger = createLogger({ channel: 'impresion-ticket' });

function normalizarTextoTicket(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Za-z0-9 $.,\-\/:()]/g, '');
}

function formatMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function padRight(text, width) {
  const input = String(text ?? '');
  if (input.length >= width) return input.slice(0, width);
  return input + ' '.repeat(width - input.length);
}

function padLeft(text, width) {
  const input = String(text ?? '');
  if (input.length >= width) return input.slice(0, width);
  return ' '.repeat(width - input.length) + input;
}

function centerText(text, width) {
  const input = String(text ?? '');
  if (input.length >= width) return input.slice(0, width);
  const left = Math.floor((width - input.length) / 2);
  return `${' '.repeat(left)}${input}`.padEnd(width, ' ');
}

function separator(width) {
  return '-'.repeat(width);
}

function wrapText(text, width) {
  const clean = normalizarTextoTicket(text);
  if (!clean) return [''];
  const words = clean.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) lines.push(current);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      current = '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function formatFechaLocal(fecha) {
  if (!fecha) return '-';
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return normalizarTextoTicket(String(fecha));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function construirTicketVenta(ticket, config = {}, options = {}) {
  const width = Number(options.width || 40);
  const lines = [];
  const negocioNombre = normalizarTextoTicket(ticket?.negocio?.nombre || config?.negocio_nombre || 'Q-KARNES POS') || 'Q-KARNES POS';
  const cliente = normalizarTextoTicket(ticket?.cliente?.nombre || 'Consumidor Final') || 'Consumidor Final';
  const vendedor = normalizarTextoTicket(ticket?.usuario?.nombre || 'Sistema') || 'Sistema';
  const metodo = normalizarTextoTicket(ticket?.metodo_pago || ticket?.metodo_pago_codigo || 'EFECTIVO') || 'EFECTIVO';
  const numero = normalizarTextoTicket(ticket?.ticket_config?.numero || ticket?.venta?.ticket_numero || `V-${String(ticket?.venta?.id || '').padStart(6, '0')}`);
  const fecha = formatFechaLocal(ticket?.venta?.fecha);

  lines.push('\x1B@');
  lines.push(centerText(negocioNombre, width));
  if (ticket?.negocio?.ruc) lines.push(`RUC: ${normalizarTextoTicket(ticket.negocio.ruc)}`);
  if (ticket?.negocio?.direccion) lines.push(`Direccion: ${normalizarTextoTicket(ticket.negocio.direccion)}`);
  if (ticket?.negocio?.telefono) lines.push(`Tel: ${normalizarTextoTicket(ticket.negocio.telefono)}`);
  lines.push(separator(width));
  lines.push(`Ticket: ${numero}`);
  lines.push(`Fecha: ${fecha}`);
  lines.push(`Vendedor: ${vendedor}`);
  lines.push(`Cliente: ${cliente}`);
  lines.push(separator(width));
  lines.push('Producto');
  lines.push(`${padRight('Cant x Precio', width - 12)}${padLeft('Subtotal', 12)}`);
  lines.push(separator(width));

  const detalle = Array.isArray(ticket?.detalle) ? ticket.detalle : [];
  for (const item of detalle) {
    const nombreLines = wrapText(item?.producto_nombre || '-', width);
    for (const l of nombreLines) lines.push(l);
    const qty = formatMoney(item?.cantidad || 0);
    const precio = formatMoney(item?.precio_unit || 0);
    const subtotal = formatMoney(item?.total_linea || 0);
    lines.push(`${padRight(`${qty} x ${precio}`, width - 12)}${padLeft(subtotal, 12)}`);
    lines.push('');
  }

  const subtotal = formatMoney(ticket?.totales?.subtotal ?? ticket?.venta?.subtotal ?? 0);
  const iva = formatMoney(ticket?.totales?.impuesto_estimado ?? 0);
  const total = formatMoney(ticket?.venta?.total ?? ticket?.totales?.total ?? 0);

  lines.push(separator(width));
  lines.push(`${padRight('SUBTOTAL:', width - 12)}${padLeft(subtotal, 12)}`);
  lines.push(`${padRight('IVA:', width - 12)}${padLeft(iva, 12)}`);
  lines.push(`${padRight('TOTAL:', width - 12)}${padLeft(total, 12)}`);
  lines.push(`Metodo: ${metodo}`);
  lines.push(separator(width));
  lines.push(centerText(normalizarTextoTicket(ticket?.ticket_config?.mensaje || config?.ticket_mensaje || 'Gracias por su compra'), width));
  lines.push('', '', '');

  return `${lines.join('\r\n')}\r\n`;
}

function isVentaIdValido(ventaId) {
  const value = String(ventaId || '').trim();
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createImpresionService(deps = {}) {
  const spawnFn = deps.spawnFn || spawn;
  const ventas = deps.ventasService || ventasService;
  const configSvc = deps.configuracionService || configuracionService;

  async function enviarRawACups(ticketRaw, printerName) {
    if (process.platform !== 'linux') {
      throw new AppError(400, 'Impresion directa disponible solo en Linux/CUPS o falta configurar CUPS');
    }

    return new Promise((resolve, reject) => {
      const lp = spawnFn('lp', ['-d', printerName, '-o', 'raw']);
      let stderr = '';

      lp.on('error', (error) => {
        if (error?.code === 'ENOENT') {
          reject(new AppError(400, 'Impresion directa disponible solo en Linux/CUPS o falta configurar CUPS'));
          return;
        }
        reject(new AppError(500, 'No se pudo imprimir el ticket', error.message));
      });

      lp.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });

      lp.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new AppError(500, 'No se pudo imprimir el ticket', (stderr || `lp exited with code ${code}`).trim()));
      });

      lp.stdin.write(Buffer.from(ticketRaw, 'utf8'));
      lp.stdin.end();
    });
  }

  async function imprimirTicketVenta(ventaId, actorUser) {
    if (!isVentaIdValido(ventaId)) throw new AppError(400, 'Identificador de venta invalido');
    const saleId = /^\d+$/.test(String(ventaId)) ? Number(ventaId) : ventaId;
    const [ticket, config] = await Promise.all([
      ventas.getTicket(saleId, actorUser),
      configSvc.getRuntimeConfig()
    ]);

    const printerName = String(process.env.PRINTER_NAME || 'EPSON_TMU220_RAW').trim() || 'EPSON_TMU220_RAW';
    const rawTicket = construirTicketVenta(ticket?.data || {}, config, { width: 40 });
    await enviarRawACups(rawTicket, printerName);

    printerLogger.info('ticket_print_sent', 'Ticket enviado a CUPS RAW', {
      ventaId: saleId,
      printerName,
      actorUserId: actorUser?.id || null
    });

    return { ok: true, message: 'Ticket enviado a impresion' };
  }

  return {
    imprimirTicketVenta,
    enviarRawACups
  };
}

const service = createImpresionService();

module.exports = {
  ...service,
  createImpresionService,
  __testables: {
    formatMoney,
    padLeft,
    padRight,
    centerText,
    separator,
    wrapText,
    normalizarTextoTicket,
    construirTicketVenta,
    isVentaIdValido
  }
};
