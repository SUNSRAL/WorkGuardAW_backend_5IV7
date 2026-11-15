import express from 'express';
import { login, verificarSesion, logout } from '../controlador/auth_controlador.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';

export function crearRutasAuth(config) {
    const router = express.Router();
    const validarSesion = requiereSesion(config);

    router.post('/login', login);
    router.post('/logout', logout);
    router.get('/verificar', validarSesion, verificarSesion);

    router.get('/panel-admin', validarSesion, requiereRol('admin'), (req, res) => {
        res.json({ mensaje: 'Bienvenido al panel de Administrador', usuario: req.session.usuario });
    });

    router.get('/panel-consultor', validarSesion, requiereRol('consultor'), (req, res) => {
        res.json({ mensaje: 'Bienvenido al panel de Consultor', usuario: req.session.usuario });
    });

    router.get('/panel-mipyme', validarSesion, requiereRol('mipyme'), (req, res) => {
        res.json({ mensaje: 'Bienvenido al panel de MiPyME', usuario: req.session.usuario });
    });

    return router;
}
