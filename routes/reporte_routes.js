import { Router } from 'express';
import { enviarReporte, obtenerReportes, obtenerReporte, rechazarReporte } from '../controllers/reporte_controller.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { subirArchivoreporte } from '../middlewares/upload_middleware.js';

const router = Router();

router.post('/', requiereSesion, requiereRol('consultor'), subirArchivoreporte, enviarReporte);
router.get('/', requiereSesion, requiereRol('admin', 'administrador'), obtenerReportes);
router.get('/:id', requiereSesion, requiereRol('admin', 'administrador'), obtenerReporte);
router.patch('/:id/rechazar', requiereSesion, requiereRol('admin', 'administrador'), rechazarReporte);

export default router;
