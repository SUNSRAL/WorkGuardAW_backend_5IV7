import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth_routes.js';
import reporteRoutes from './routes/reporte_routes.js';
import mipymeRoutes from './routes/mipyme_routes.js';
import listaNegraRoutes from './routes/lista_negra_routes.js';
import usuarioRoutes from './routes/usuario_routes.js';

export function crearApp() {
    const app = express();
    const esProduccion = process.env.NODE_ENV === 'production';

    if (esProduccion) {
        app.set('trust proxy', 1);
    }

    app.use(cors({
        origin: process.env.FRONTEND_URL,
        credentials: true
    }));

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Rutas de la API
    app.use('/api/auth', authRoutes);
    app.use('/api/usuarios', usuarioRoutes);
    app.use('/api/mipymes', mipymeRoutes);
    app.use('/api/reportes', reporteRoutes);
    app.use('/api/lista-negra', listaNegraRoutes);

    app.get('/', (req, res) => {
        res.json({ estado: 'API WorkGuard funcionando' });
    });

    return app;
}
