import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { enviarReporte, obtenerReportes, obtenerReporte } from '../controllers/reporte_controller.js';
import { subirArchivoreporte } from '../middlewares/upload_middleware.js'; 

const router = Router();
/**Registrar un reporte */
router.post('/', requiereSesion, requiereRol('consultor'), subirArchivoreporte, enviarReporte); 


router.get('/', requiereSesion, requiereRol('administrador'), obtenerReportes);
router.get('/:id', requiereSesion, requiereRol('administrador'), obtenerReporte);

export default router;
