function isServiceEnvelope(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      Object.prototype.hasOwnProperty.call(payload, 'ok') &&
      Object.prototype.hasOwnProperty.call(payload, 'data')
  );
}

function normalizeSuccessData(payload) {
  if (isServiceEnvelope(payload)) return payload.data;
  return payload;
}

function successResponse(res, payload, status = 200, meta = undefined) {
  const body = {
    ok: true,
    data: normalizeSuccessData(payload)
  };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

function buildErrorPayload(message, details = undefined, code = undefined) {
  const body = {
    ok: false,
    error: message
  };
  if (code !== undefined) body.code = code;
  if (details !== undefined) body.details = details;
  return body;
}

function errorResponse(res, status, message, details = undefined, code = undefined) {
  return res.status(status).json(buildErrorPayload(message, details, code));
}

module.exports = {
  normalizeSuccessData,
  successResponse,
  buildErrorPayload,
  errorResponse
};
