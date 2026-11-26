import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerConsultor, registrarConsultor, editarConsultor } from '../controllers/usuario_controller.js';
import multer from 'multer'; 
import { cambiarFotoPerfil } from '../controllers/usuario_controller.js';

const router = Router();
const subirFoto = multer({
    storage: multer.memoryStorage(),
    limits:{
        fileSize:2 *1024*1024
    }
})

router.post('/consultores', registrarConsultor);
router.get('/consultores/:id', requiereSesion, requiereRol('consultor', 'administrador'), obtenerConsultor);
router.put('/consultores/:id', requiereSesion, requiereRol('consultor'), editarConsultor);

export default router;
