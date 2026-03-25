const {
  createCategoria,
  createProveedor,
  createCliente,
  createProducto
} = require('./factories');

async function seedOperationalFixtures(db) {
  const categorias = {
    carnes: await createCategoria(db, { nombre: 'Carnes Operativas' }),
    aves: await createCategoria(db, { nombre: 'Aves Operativas' }),
    insumos: await createCategoria(db, { nombre: 'Insumos Operativos' })
  };

  const proveedores = {
    ganado: await createProveedor(db, {
      nombre: 'Ganadera Sierra Norte',
      tiene_credito: true,
      dias_pago: 15
    }),
    aves: await createProveedor(db, {
      nombre: 'Avícola La Pradera',
      tiene_credito: true,
      dias_pago: 10
    }),
    insumos: await createProveedor(db, {
      nombre: 'Distribuidora Bodega Fría',
      tiene_credito: false,
      dias_pago: 0
    })
  };

  const cliente = await createCliente(db, {
    nombre: 'Restaurante Don Sazón',
    dias_credito: 7
  });

  const productos = {
    base: {
      res: await createProducto(db, {
        codigo: 'BASE-RES',
        nombre: 'Canal de res',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 4.1,
        precio_referencia: 6.3,
        stock_actual: 0,
        stock_minimo: 10
      }),
      cerdo: await createProducto(db, {
        codigo: 'BASE-CERDO',
        nombre: 'Cerdo entero',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 3.4,
        precio_referencia: 5.4,
        stock_actual: 0,
        stock_minimo: 10
      }),
      pollo: await createProducto(db, {
        codigo: 'BASE-POLLO',
        nombre: 'Pollo entero',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 2.2,
        precio_referencia: 3.7,
        stock_actual: 0,
        stock_minimo: 8
      })
    },
    hijos: {
      lomoFino: await createProducto(db, {
        codigo: 'HIJO-LOMO',
        nombre: 'Lomo fino',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 8.9,
        stock_actual: 0
      }),
      costillaRes: await createProducto(db, {
        codigo: 'HIJO-COST-RES',
        nombre: 'Costilla de res',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 6.9,
        stock_actual: 0
      }),
      molida: await createProducto(db, {
        codigo: 'HIJO-MOLIDA',
        nombre: 'Carne molida',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 5.8,
        stock_actual: 0
      }),
      hueso: await createProducto(db, {
        codigo: 'HIJO-HUESO',
        nombre: 'Hueso',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 1.4,
        stock_actual: 0
      }),
      chuleta: await createProducto(db, {
        codigo: 'HIJO-CHULETA',
        nombre: 'Chuleta de cerdo',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 6.4,
        stock_actual: 0
      }),
      costillaCerdo: await createProducto(db, {
        codigo: 'HIJO-COST-CERDO',
        nombre: 'Costilla de cerdo',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 5.9,
        stock_actual: 0
      }),
      fritada: await createProducto(db, {
        codigo: 'HIJO-FRITADA',
        nombre: 'Carne de cerdo para fritada',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 5.7,
        stock_actual: 0
      }),
      grasa: await createProducto(db, {
        codigo: 'HIJO-GRASA',
        nombre: 'Cuero y grasa de cerdo',
        categoria_id: categorias.carnes.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 1.1,
        stock_actual: 0
      }),
      pechuga: await createProducto(db, {
        codigo: 'HIJO-PECHUGA',
        nombre: 'Pechuga',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 4.9,
        stock_actual: 0
      }),
      muslo: await createProducto(db, {
        codigo: 'HIJO-MUSLO',
        nombre: 'Muslo',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 4.1,
        stock_actual: 0
      }),
      alas: await createProducto(db, {
        codigo: 'HIJO-ALAS',
        nombre: 'Alas',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 3.5,
        stock_actual: 0
      }),
      menudencia: await createProducto(db, {
        codigo: 'HIJO-MENUD',
        nombre: 'Menudencia',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 0,
        precio_referencia: 1.6,
        stock_actual: 0
      })
    },
    simples: {
      chorizo: await createProducto(db, {
        codigo: 'SIMPLE-CHORIZO',
        nombre: 'Chorizo',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'UND',
        costo_promedio: 0.9,
        precio_referencia: 1.45,
        stock_actual: 0,
        stock_minimo: 12
      }),
      chorizoArgentino: await createProducto(db, {
        codigo: 'SIMPLE-CHORIZO-ARG',
        nombre: 'Chorizo argentino',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'UND',
        costo_promedio: 1.15,
        precio_referencia: 1.8,
        stock_actual: 0,
        stock_minimo: 10
      }),
      milanesaPollo: await createProducto(db, {
        codigo: 'SIMPLE-MIL-POLLO',
        nombre: 'Milanesa de pollo',
        categoria_id: categorias.aves.id,
        unidad_medida: 'LB',
        costo_promedio: 2.35,
        precio_referencia: 3.9,
        stock_actual: 0,
        stock_minimo: 8
      }),
      platos: await createProducto(db, {
        codigo: 'SIMPLE-PLATO',
        nombre: 'Platos desechables',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'UND',
        costo_promedio: 0.12,
        precio_referencia: 0.25,
        stock_actual: 0,
        stock_minimo: 20
      }),
      condimento: await createProducto(db, {
        codigo: 'SIMPLE-COND',
        nombre: 'Condimento parrillero',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'UND',
        costo_promedio: 0.35,
        precio_referencia: 0.6,
        stock_actual: 0,
        stock_minimo: 10
      }),
      queso: await createProducto(db, {
        codigo: 'SIMPLE-QUESO',
        nombre: 'Queso fresco',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'LB',
        costo_promedio: 2.8,
        precio_referencia: 4.2,
        stock_actual: 0,
        stock_minimo: 5
      }),
      leche: await createProducto(db, {
        codigo: 'SIMPLE-LECHE',
        nombre: 'Fundas de leche',
        categoria_id: categorias.insumos.id,
        unidad_medida: 'UND',
        costo_promedio: 0.8,
        precio_referencia: 1.2,
        stock_actual: 0,
        stock_minimo: 12
      })
    }
  };

  return {
    categorias,
    proveedores,
    cliente,
    productos
  };
}

module.exports = {
  seedOperationalFixtures
};
