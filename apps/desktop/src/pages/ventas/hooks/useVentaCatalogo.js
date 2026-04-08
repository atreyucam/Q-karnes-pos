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

    if (debouncedSearch) {
      return productosAll.filter((producto) => {
        const codigo = String(producto.codigo || '').toLowerCase();
        const nombre = String(producto.nombre || '').toLowerCase();
        return codigo.includes(debouncedSearch) || nombre.includes(debouncedSearch);
      });
    }

    if (categoriaActiva == null) return productosAll;

    return productosAll.filter((producto) => Number(producto.categoria_id) === Number(categoriaActiva));
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
