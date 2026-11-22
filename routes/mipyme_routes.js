import { Router } from 'express';
import {
    getCatalogosMipyme,
    evaluarPasoMipyme,
    registrarMipyme,
    getMipymesPublicas,
    getSolicitudesMipymeAdmin,
    getDetalleMipyme,
    dictaminarMipyme
} from '../controllers/mipyme_controller.js';
import { subirDocumentosMipyme } from '../middlewares/upload_middleware.js';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';

const router = Router();

// Rutas públicas para el flujo de registro de una nueva MiPyME
router.get('/catalogos', getCatalogosMipyme);
router.post('/evaluar-paso', subirDocumentosMipyme, evaluarPasoMipyme);
router.post('/registro', subirDocumentosMipyme, registrarMipyme);

// Rutas protegidas para Administrador (revisión, aprobación o rechazo con motivo)
router.get('/admin/solicitudes', requiereSesion, requiereRol('administrador'), getSolicitudesMipymeAdmin);
router.put('/:id/dictamen', requiereSesion, requiereRol('administrador'), dictaminarMipyme);

// Rutas protegidas para Consultores, Administradores y la propia MiPyME
router.get('/', requiereSesion, getMipymesPublicas);
router.get('/:id', requiereSesion, requiereRol('administrador', 'consultor', 'mipyme'), getDetalleMipyme);

export default router;