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

    const ordenarConSinStockAlFinal = (items) => (
      [...items].sort((a, b) => {
        const aOut = Number(a?.stock_actual || 0) <= 0 ? 1 : 0;
        const bOut = Number(b?.stock_actual || 0) <= 0 ? 1 : 0;
        if (aOut !== bOut) return aOut - bOut;
        return 0;
      })
    );

    if (debouncedSearch) {
      const filtrados = productosAll.filter((producto) => {
        const codigo = String(producto.codigo || '').toLowerCase();
        const nombre = String(producto.nombre || '').toLowerCase();
        const sku = String(producto.sku || '').toLowerCase();
        const barcode = String(producto.barcode || producto.codigo_barras || '').toLowerCase();
        return (
          codigo.includes(debouncedSearch)
          || nombre.includes(debouncedSearch)
          || sku.includes(debouncedSearch)
          || barcode.includes(debouncedSearch)
        );
      });
      return ordenarConSinStockAlFinal(filtrados);
    }

    if (categoriaActiva == null) return ordenarConSinStockAlFinal(productosAll);

    const filtradosCategoria = productosAll.filter(
      (producto) => Number(producto.categoria_id) === Number(categoriaActiva)
    );
    return ordenarConSinStockAlFinal(filtradosCategoria);
  }, [enabled, productosAll, categoriaActiva, debouncedSearch]);

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
