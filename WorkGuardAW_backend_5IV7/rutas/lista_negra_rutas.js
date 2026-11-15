// rutas/lista_negra_rutas.js
import { Router } from 'express';
import { esUsuarioConSesion, apiUsuarioConSesion, apiAdministrador } from '../middlewares/auth_middleware.js';
import {
    mostrarListaNegra, obtenerListaNegra, enviarEmpresaAListaNegra
} from '../controlador/lista_negra_controlador.js';

const router = Router();

// Administrador y consultor pueden ver la lista
router.get('/lista-negra', esUsuarioConSesion, mostrarListaNegra);
router.get('/api/lista-negra', apiUsuarioConSesion, obtenerListaNegra);

// Solo el administrador envía empresas a ella
router.post('/api/admin/reportes/:id/lista-negra', apiAdministrador, enviarEmpresaAListaNegra);

export default router;
