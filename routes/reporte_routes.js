import { Router } from 'express';
import {
  getCatalogosMipyme,
  evaluarPasoMipyme,
  registrarMipyme,
  getMipymesPublicas,
  getDetalleMipyme
} from '../controllers/mipyme_controller.js';
import { subirDocumentosMipyme } from '../middlewares/upload_middleware.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';

const router = Router();

router.post('/', requiereSesion, requiereRol('consultor'), enviarReporte);
router.get('/', requiereSesion, requiereRol('admin'), obtenerReportes);
router.get('/:id', requiereSesion, requiereRol('admin'), obtenerReporte);

// Rutas de consulta protegidas por sesión
router.get('/', requiereSesion, getMipymesPublicas);
router.get('/:id', requiereSesion, requiereRol('admin', 'consultor', 'mipyme'), getDetalleMipyme);

export default router;