process.env.TZ = process.env.TZ || 'America/Guayaquil';

const express = require('express');
const cors = require('cors');
const { port } = require('./config/env');
const { notFound, errorHandler } = require('./middlewares/errorHandlers');
const authRoutes = require('./modules/auth/auth.routes');
const cajaRoutes = require('./modules/caja/caja.routes');
const ventasRoutes = require('./modules/ventas/ventas.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');
const comprasRoutes = require('./modules/compras/compras.routes');
const proveedoresRoutes = require('./modules/proveedores/proveedores.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const reportesRoutes = require('./modules/reportes/reportes.routes');
const categoriasRoutes = require('./modules/categorias/categorias.routes');
const productosRoutes = require('./modules/productos/productos.routes');
const cxpRoutes = require('./modules/cxp/cxp.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'qkarnes-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/compras/ordenes', comprasRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/cxp', cxpRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}`);
});
