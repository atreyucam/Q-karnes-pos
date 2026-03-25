const productosRepository = require('../modules/productos/productos.repository');
const { createDomainError, DOMAIN_ERROR_CODES } = require('./domainErrors');
const { assertSupportedUnit } = require('./quantityRules');

function isActive(product) {
  return Boolean(product && (product.activo === true || product.activo === 1 || product.activo === '1'));
}

function normalizeOperableProduct(product) {
  const unidadOperativa = assertSupportedUnit(product?.unidad_medida || product?.unidad, {
    field: 'unidad_medida',
    product_id: product?.id ?? null,
    codigo: product?.codigo ?? null
  });

  return {
    ...product,
    activo: isActive(product),
    unidad_operativa: unidadOperativa
  };
}

function assertProductoOperable(product, options = {}) {
  const {
    productId = product?.id,
    field = 'producto_id'
  } = options;

  if (!product) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.PRODUCT_NOT_FOUND,
      { field, product_id: productId ?? null }
    );
  }

  if (!isActive(product)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.PRODUCT_INACTIVE,
      {
        field,
        product_id: product.id,
        codigo: product.codigo || null
      }
    );
  }

  return normalizeOperableProduct(product);
}

async function getProductoOperableById(productId, options = {}) {
  const {
    trx,
    field = 'producto_id',
    getById = productosRepository.getById
  } = options;

  const product = await getById(productId, trx);
  return assertProductoOperable(product, { productId, field });
}

module.exports = {
  isActive,
  normalizeOperableProduct,
  assertProductoOperable,
  getProductoOperableById
};
