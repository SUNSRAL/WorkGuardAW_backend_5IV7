import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { enviarReporte, obtenerReportes, obtenerReporte } from '../controllers/reporte_controller.js';

const router = Router();

router.post('/', requiereSesion, requiereRol('consultor'), enviarReporte);
router.get('/', requiereSesion, requiereRol('administrador'), obtenerReportes);
router.get('/:id', requiereSesion, requiereRol('administrador'), obtenerReporte);

export default router;
