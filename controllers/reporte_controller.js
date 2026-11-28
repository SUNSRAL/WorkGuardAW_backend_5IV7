import { crearReporte, listarReportes, obtenerReportePorId } from '../modules/reporte_module.js';

const MOTIVOS_VALIDOS = [
    'COBRO_POR_CONTRATACION',
    'OFERTA_FALSA',
    'SUPLANTACION_DE_IDENTIDAD',
    'CONDICIONES_ABUSIVAS',
    'EMPRESA_INEXISTENTE',
    'OTRO'
];
const MAX_DESCRIPCION = 2000;

export async function enviarReporte(req, res) {
    const idMipyme = Number.parseInt(req.body.id_mipyme, 10);
    const motivo = req.body.motivo;
    const descripcion = typeof req.body.descripcion === 'string' ? req.body.descripcion.trim() : '';

    if (!Number.isInteger(idMipyme)) {
        return res.status(400).json({ error: 'Identificador de MiPyME no válido.' });
    }
    if (!MOTIVOS_VALIDOS.includes(motivo)) {
        return res.status(400).json({ error: 'Selecciona un motivo válido.' });
    }
    if (descripcion === '') {
        return res.status(400).json({ error: 'Escribe la descripción del reporte.' });
    }
    if (descripcion.length > MAX_DESCRIPCION) {
        return res.status(400).json({ error: `La descripción no puede superar ${MAX_DESCRIPCION} caracteres.` });
    }

    try {
        const idReporte = await crearReporte({
            idMipyme,
            idConsultor: req.usuario.id,
            motivo,
            descripcion
        });
        return res.status(201).json({ ok: true, id_reporte: idReporte });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(404).json({ error: 'La MiPyME no existe.' });
        }
        console.error('Error al guardar el reporte:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function obtenerReportes(req, res) {
    try {
        const reportes = await listarReportes();
        const nuevos = reportes.filter(r => r.estado === 'PENDIENTE').length;
        return res.json({ nuevos, reportes });
    } catch (error) {
        console.error('Error al listar reportes:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function obtenerReporte(req, res) {
    const idReporte = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idReporte)) {
        return res.status(400).json({ error: 'Identificador de reporte no válido.' });
    }
    try {
        const reporte = await obtenerReportePorId(idReporte);
        if (!reporte) {
            return res.status(404).json({ error: 'El reporte no existe.' });
        }
        return res.json(reporte);
    } catch (error) {
        console.error('Error al consultar el reporte:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
