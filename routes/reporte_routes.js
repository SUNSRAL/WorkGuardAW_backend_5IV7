import { Router } from 'express';
import { enviarReporte, obtenerReportes, obtenerReporte } from '../controllers/reporte_controller.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { subirArchivoreporte } from '../middlewares/upload_middleware.js';

const router = Router();

/** Registrar un reporte */
router.post('/', requiereSesion, requiereRol('consultor'), subirArchivoreporte, enviarReporte);
router.get('/', requiereSesion, requiereRol('admin', 'administrador'), obtenerReportes);
router.get('/:id', requiereSesion, requiereRol('admin', 'administrador'), obtenerReporte);

export default router;
