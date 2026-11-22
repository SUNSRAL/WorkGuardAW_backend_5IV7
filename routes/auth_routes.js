import { Router } from 'express';
import { login, verificarSesion, logout } from '../controllers/auth_controller.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';

const router = Router();

router.post('/login', login);
router.post('/logout', requiereSesion, logout);
router.get('/verificar', requiereSesion, verificarSesion);

router.get('/panel-admin', requiereSesion, requiereRol('administrador'), (req, res) => {
    res.json({ mensaje: 'Bienvenido al panel de Administrador', usuario: req.usuario });
});

router.get('/panel-consultor', requiereSesion, requiereRol('consultor'), (req, res) => {
    res.json({ mensaje: 'Bienvenido al panel de Consultor', usuario: req.usuario });
});

router.get('/panel-mipyme', requiereSesion, requiereRol('mipyme'), (req, res) => {
    res.json({ mensaje: 'Bienvenido al panel de MiPyME', usuario: req.usuario });
});

export default router;
