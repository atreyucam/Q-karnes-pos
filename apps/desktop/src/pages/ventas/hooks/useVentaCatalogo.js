import { useEffect, useMemo, useState } from 'react';
import { parseApiError } from '../../../lib/apiClient';
import { fetchCategorias, fetchProductosVendiblesActivos } from '../../../services/catalogoService';

export function useVentaCatalogo({ enabled = true } = {}) {
  const [categorias, setCategorias] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [productosAll, setProductosAll] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const productosIndexados = useMemo(
    () => productosAll.map((producto) => ({
      ...producto,
      __search: [
        String(producto.codigo || '').toLowerCase(),
        String(producto.nombre || '').toLowerCase(),
        String(producto.sku || '').toLowerCase(),
        String(producto.barcode || producto.codigo_barras || '').toLowerCase()
      ].join(' ')
    })),
    [productosAll]
  );

  const productosOrdenadosPorStock = useMemo(
    () => [...productosIndexados].sort((a, b) => {
      const aOut = Number(a?.stock_actual || 0) <= 0 ? 1 : 0;
      const bOut = Number(b?.stock_actual || 0) <= 0 ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return 0;
    }),
    [productosIndexados]
  );

  useEffect(() => {
    if (!enabled) {
      setDebouncedSearch('');
      return undefined;
    }

    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 280);

    return () => clearTimeout(timer);
  }, [enabled, searchTerm]);

  useEffect(() => {
    if (!enabled) {
      setCategorias([]);
      setCategoriaActiva(null);
      setProductosAll([]);
      setLoadingCatalogo(false);
      setCatalogError('');
      return undefined;
    }

    async function initCatalogo() {
      setLoadingCatalogo(true);
      setCatalogError('');
      try {
        const [dataCategorias, dataProductos] = await Promise.all([
          fetchCategorias(),
          fetchProductosVendiblesActivos()
        ]);

        const categoriasActivas = (dataCategorias || []).filter((categoria) => Boolean(categoria.activo ?? true));
        const allowedCategoryIds = new Set(categoriasActivas.map((categoria) => Number(categoria.id)));
        const productosVendibles = (dataProductos || []).filter((producto) => (
          !producto.categoria_id || allowedCategoryIds.has(Number(producto.categoria_id))
        ));

        setCategorias(categoriasActivas);
        setProductosAll(productosVendibles);
        setCategoriaActiva(categoriasActivas[0]?.id || null);
      } catch (error) {
        setCatalogError(parseApiError(error) || 'No se pudo cargar catalogo');
      } finally {
        setLoadingCatalogo(false);
      }
    }

    initCatalogo();
  }, [enabled]);

  const productosMostrados = useMemo(() => {
    if (!enabled) return [];

    if (debouncedSearch) {
      return productosOrdenadosPorStock.filter((producto) => producto.__search.includes(debouncedSearch));
    }

    if (categoriaActiva == null) return productosOrdenadosPorStock;

    return productosOrdenadosPorStock.filter(
      (producto) => Number(producto.categoria_id) === Number(categoriaActiva)
    );
  }, [enabled, productosOrdenadosPorStock, categoriaActiva, debouncedSearch]);

  return {
    categorias,
    categoriaActiva,
    setCategoriaActiva,
    productosMostrados,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    loadingCatalogo,
    catalogError
  };
}
