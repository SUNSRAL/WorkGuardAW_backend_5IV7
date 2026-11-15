import 'dotenv/config';
import { crearApp } from './app.js';
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3001;

const app = crearApp({
    maxAge: 1000 * 60 * 60 * 8,
    rolling: true
});

app.listen(PORT, () => {
    console.log(`Servidor WorkGuard corriendo en el puerto ${PORT}`);
});

// Importar los archivos de rutas que agrupan tus controladores
import autenticacionRutas from './modulos/autenticacion/autenticacionRutas.js';
import mipymeRutas from './modulos/mipymes/mipymeRutas.js';
import reporteRutas from './modulos/reportes/reporteRutas.js';
import listaNegraRutas from './modulos/listaNegra/listaNegraRutas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares básicos globales
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'clave_secreta_super_segura_123',
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(__dirname));

// Rutas estáticas de vistas principales si deseas mantenerlas aquí
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Montar las rutas modularizadas (Toda la lógica pesada se fue a los controladores/rutas)
app.use(autenticacionRutas);
app.use(mipymeRutas);
app.use(reporteRutas);
app.use(listaNegraRutas);

