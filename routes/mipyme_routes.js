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

// Rutas públicas para el Registro de MiPyMEs (Evaluación en RAM por pasos + Registro final)
router.get('/catalogos', getCatalogosMipyme);
router.post('/evaluar-paso', subirDocumentosMipyme, evaluarPasoMipyme);
router.post('/registro', subirDocumentosMipyme, registrarMipyme);

// Rutas de consulta protegidas por sesión
router.get('/', requiereSesion, getMipymesPublicas);
router.get('/:id', requiereSesion, requiereRol('administrador', 'consultor', 'mipyme'), getDetalleMipyme);

export default router;
