// rutas/mipyme_rutas.js
import { Router } from 'express';
import { esConsultor, apiConsultor } from '../middlewares/auth_middleware.js';
import { mostrarTarjetaMipyme, obtenerMipyme } from '../controlador/mipyme_controlador.js';

const router = Router();

router.get('/consultor/dashboard', esConsultor, mostrarTarjetaMipyme);
router.get('/api/mipymes/:id', apiConsultor, obtenerMipyme);

export default router;
