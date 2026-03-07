import { useEffect, useMemo, useState } from 'react';
import { parseApiError } from '../../../lib/apiClient';
import { fetchCategorias, fetchProductosActivos } from '../../../services/catalogoService';

export function useVentaCatalogo() {
  const [categorias, setCategorias] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [productosAll, setProductosAll] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 280);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    async function initCatalogo() {
      setLoadingCatalogo(true);
      setCatalogError('');
      try {
        const [dataCategorias, dataProductos] = await Promise.all([
          fetchCategorias(),
          fetchProductosActivos()
        ]);

        setCategorias(dataCategorias);
        setProductosAll(dataProductos);
        setCategoriaActiva(dataCategorias[0]?.id || null);
      } catch (error) {
        setCatalogError(parseApiError(error) || 'No se pudo cargar catalogo');
      } finally {
        setLoadingCatalogo(false);
      }
    }

    initCatalogo();
  }, []);

  const productosMostrados = useMemo(() => {
    if (debouncedSearch) {
      return productosAll.filter((producto) => {
        const codigo = String(producto.codigo || '').toLowerCase();
        const nombre = String(producto.nombre || '').toLowerCase();
        return codigo.includes(debouncedSearch) || nombre.includes(debouncedSearch);
      });
    }

    return productosAll.filter((producto) => Number(producto.categoria_id) === Number(categoriaActiva));
  }, [productosAll, categoriaActiva, debouncedSearch]);

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
