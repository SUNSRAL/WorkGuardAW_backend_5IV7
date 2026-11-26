import { Router } from 'express';
import { requiereSesion, requiereRol } from '../middlewares/auth_middleware.js';
import { obtenerConsultor, registrarConsultor, editarConsultor } from '../controllers/usuario_controller.js';
import multer from 'multer'; 


const router = Router();

const subirFoto = multer({
    storage: multer.memoryStorage(),
    limits:{
        fileSize: 2 *1024*1024
    }, 
    fileFilter: (req, file, callback) => {
        const formatos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if(formatos.includes(file.mimetype)){
            callback(null, true); 
        } else {
            callback(new Error('Formato de imagen no permitido')); 
        }
    }
}); 

router.post('/consultores', registrarConsultor);
router.get('/consultores/:id', requiereSesion, requiereRol('consultor', 'administrador'), obtenerConsultor);
router.put('/consultores/:id', requiereSesion, requiereRol('consultor'), editarConsultor);
router.put('/consultores/:id/foto', requiereSesion, requiereRol('consultor'), subirFoto.single('foto'), cambiarFotoPerfil); 
export default router;
