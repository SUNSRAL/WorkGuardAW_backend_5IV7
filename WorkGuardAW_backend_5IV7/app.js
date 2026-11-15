import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { crearRutasAuth } from './rutas/auth_rutas.js';
import reporteRutas from './rutas/reporte_rutas.js';
import mipymeRutas from './rutas/mipyme_rutas.js';
import listaNegraRutas from './rutas/lista_negra_rutas.js';

app.use(reporteRutas);
app.use(mipymeRutas);
app.use(listaNegraRutas);

const NOMBRE_COOKIE = 'connect.sid';

export function crearApp(config = {}) {
    const app = express();
    const esProduccion = process.env.NODE_ENV === 'production';

    const sessionConfig = {
        maxAge: config.maxAge || 1000 * 60 * 60 * 24,
        rolling: config.rolling || false,
        secret: process.env.SESSION_SECRET || config.secret || 'secreto-workguard-dev'
    };

    if (esProduccion) {
        app.set('trust proxy', 1);
    }

    app.use(cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
    }));

    app.use(express.json());

    const almacen = new session.MemoryStore();
    app.locals.almacen = almacen;

    app.use(session({
        name: NOMBRE_COOKIE,
        secret: sessionConfig.secret,
        store: almacen,
        resave: false,
        saveUninitialized: false,
        rolling: sessionConfig.rolling,
        cookie: {
            maxAge: sessionConfig.maxAge,
            httpOnly: true,
            sameSite: esProduccion ? 'none' : 'lax',
            secure: esProduccion
        }
    }));

    app.use('/api/auth', crearRutasAuth(sessionConfig));

    app.get('/', (req, res) => {
        res.json({ estado: 'API WorkGuard funcionando' });
    });

    return app;
}
