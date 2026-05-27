const { asyncHandler } = require('../../helpers/asyncHandler');
const service = require('./impresion.service');
const { createLogger } = require('../../helpers/logger');

const printerLogger = createLogger({ channel: 'impresion-ticket' });

const imprimirTicketVenta = asyncHandler(async (req, res) => {
  try {
    await service.imprimirTicketVenta(req.params.ventaId, req.user);
    return res.status(200).json({
      ok: true,
      message: 'Ticket enviado a impresion'
    });
  } catch (error) {
    printerLogger.error('ticket_print_error', 'No se pudo imprimir ticket', {
      ventaId: req.params.ventaId,
      actorUserId: req.user?.id || null,
      error
    });

    return res.status(error?.status || 500).json({
      ok: false,
      message: 'No se pudo imprimir el ticket',
      error: error?.message || 'Error inesperado'
    });
  }
});

module.exports = {
  imprimirTicketVenta
};
