import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerMipyme } from '../controllers/mipyme_controller.js';

const router = Router();


router.get('/:id', requiereSesion, requiereRol('consultor', 'administrador'), obtenerMipyme);

export default router;
