// rutas/reporte_rutas.js
import { Router } from 'express';
import { esAdministrador, apiConsultor, apiAdministrador } from '../middlewares/auth_middleware.js';
import {
    mostrarCentroReportes, mostrarDetalleReporte,
    enviarReporte, obtenerReportes, obtenerReporte
} from '../controlador/reporte_controlador.js';

const router = Router();

router.get('/admin/reportes', esAdministrador, mostrarCentroReportes);
router.get('/admin/reportes/detalle', esAdministrador, mostrarDetalleReporte);

router.post('/api/reportes', apiConsultor, enviarReporte);
router.get('/api/admin/reportes', apiAdministrador, obtenerReportes);
router.get('/api/admin/reportes/:id', apiAdministrador, obtenerReporte);

export default router;
