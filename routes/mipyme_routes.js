import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerMipyme,  obtenerTodasMipymes} from '../controllers/mipyme_controller.js';

const router = Router();

router.get('/', requiereSesion, requiereRol('administrador', 'consultor'), obtenerTodasMipymes);
router.get('/:id', requiereSesion, requiereRol('administrador', 'consultor'), obtenerMipyme);

export default router;
