import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerConsultor, registrarConsultor, editarConsultor } from '../controllers/usuario_controller.js';

const router = Router();


router.post('/consultores', registrarConsultor);
router.get('/consultores/:id', requiereSesion, requiereRol('consultor', 'admin'), obtenerConsultor);
router.put('/consultores/:id', requiereSesion, requiereRol('consultor'), editarConsultor);

export default router;
