import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerListaNegra, enviarEmpresaAListaNegra } from '../controllers/lista_negra_controller.js';

const router = Router();

router.get('/', requiereSesion, requiereRol('admin', 'consultor'), obtenerListaNegra);
router.post('/reportes/:idReporte', requiereSesion, requiereRol('admin'), enviarEmpresaAListaNegra);


export default router;
