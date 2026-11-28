import {
    crearReporte,
    listarReportes,
    obtenerReportePorId,
    rechazarReportePorId
} from '../modules/reporte_module.js';

const MOTIVOS_VALIDOS = [
    'COBRO_POR_CONTRATACION',
    'OFERTA_FALSA',
    'SUPLANTACION_DE_IDENTIDAD',
    'CONDICIONES_ABUSIVAS',
    'EMPRESA_INEXISTENTE',
    'OTRO'
];

const MAX_DESCRIPCION = 2000;
const MAX_ARCHIVO = 5 * 1024 * 1024;

export async function enviarReporte(req, res) {

    // Obtenemos los datos enviados por el frontend.
    const idMipyme = Number(req.body.id_mipyme);
    const motivo = req.body.motivo;

    const otroMotivo = typeof req.body.otroMotivo === 'string'
        ? req.body.otroMotivo.trim()
        : '';

    const descripcion = typeof req.body.descripcion === 'string'
        ? req.body.descripcion.trim()
        : '';

    // El consultor se obtiene de la sesión, no del frontend.
    const idConsultor = req.usuario.id;

    // VALIDAR ID DE LA MIPYME.
    if (!Number.isSafeInteger(idMipyme) || idMipyme <= 0) {
        return res.status(400).json({
            error: 'Identificador de MiPyME no válido.'
        });
    }

    // VALIDAR MOTIVO.
    if (!MOTIVOS_VALIDOS.includes(motivo)) {
        return res.status(400).json({
            error: 'Selecciona un motivo válido.'
        });
    }

    // VALIDAR OTRO MOTIVO.
    if (motivo === 'OTRO' && otroMotivo === '') {
        return res.status(400).json({
            error: 'Debes especificar el motivo del reporte.'
        });
    }

    if (motivo !== 'OTRO' && otroMotivo !== '') {
        return res.status(400).json({
            error: 'No debes especificar otro motivo si seleccionaste una opción diferente.'
        });
    }

    // VALIDAR DESCRIPCIÓN.
    if (descripcion === '') {
        return res.status(400).json({
            error: 'Escribe la descripción del reporte.'
        });
    }

    if (descripcion.length > MAX_DESCRIPCION) {
        return res.status(400).json({
            error: `La descripción no puede superar ${MAX_DESCRIPCION} caracteres.`
        });
    }

    // VALIDAR ARCHIVO.
    if (!req.file) {
        return res.status(400).json({
            error: 'Debes adjuntar un archivo PDF.'
        });
    }

    if (req.file.size > MAX_ARCHIVO) {
        return res.status(400).json({
            error: 'El PDF no debe superar los 5 MB.'
        });
    }

    // Comprobamos la firma del archivo PDF.
    const firmaPDF = req.file.buffer
        .subarray(0, 5)
        .toString('ascii');

    if (
        req.file.mimetype !== 'application/pdf' ||
        !req.file.originalname.toLowerCase().endsWith('.pdf') ||
        firmaPDF !== '%PDF-'
    ) {
        return res.status(400).json({
            error: 'El archivo adjunto no es un PDF válido.'
        });
    }

    if (!req.file){
        return res.status(400).json({
            error: 'No se recibió elarchivo PDF'
        }); 
    }

    try {

        // Guardamos el reporte y su evidencia.
        const idReporte = await crearReporte({
            idMipyme,
            idConsultor,
            motivo,
            otroMotivo: motivo === 'OTRO' ? otroMotivo : null,
            descripcion,
            archivo: req.file
        });

        return res.status(201).json({
            ok: true,
            mensaje: 'Reporte enviado exitosamente.',
            id_reporte: idReporte
        });

    } catch (error) {

        if (error.code === '23503') {
            return res.status(404).json({
                error: 'La MiPyME o el consultor no existen.'
            });
        }

        console.error('Error al guardar el reporte:', error);

        return res.status(500).json({
            error: 'Error interno al registrar el reporte.'
        });
    }
}


// OBTENER TODOS LOS REPORTES.
export async function obtenerReportes(req, res) {

    try {

        const reportes = await listarReportes();

        const nuevos = reportes.filter(
            reporte => reporte.estado === 'PENDIENTE'
        ).length;

        return res.json({
            nuevos,
            reportes
        });

    } catch (error) {

        console.error('Error al listar reportes:', error);

        return res.status(500).json({
            error: 'Error interno del servidor.'
        });
    }
}


// OBTENER UN REPORTE POR SU ID.
export async function obtenerReporte(req, res) {

    const idReporte = Number(req.params.id);

    if (!Number.isSafeInteger(idReporte) || idReporte <= 0) {
        return res.status(400).json({
            error: 'Identificador de reporte no válido.'
        });
    }

    try {

        const reporte = await obtenerReportePorId(idReporte);

        if (!reporte) {
            return res.status(404).json({
                error: 'El reporte no existe.'
            });
        }

        return res.json(reporte);

    } catch (error) {

        console.error('Error al consultar el reporte:', error);

        return res.status(500).json({
            error: 'Error interno del servidor.'
        });
    }
}

export async function rechazarReporte(req, res) {
    const idReporte = Number(req.params.id);
    const motivoRechazo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';

    if (!Number.isSafeInteger(idReporte) || idReporte <= 0) {
        return res.status(400).json({ error: 'Identificador de reporte no válido.' });
    }

    try {
        const actualizado = await rechazarReportePorId({
            idReporte,
            idAdministrador: req.usuario.id,
            motivoRechazo
        });

        if (!actualizado) {
            return res.status(404).json({ error: 'El reporte no existe o ya fue revisado.' });
        }

        return res.json({ ok: true, reporte: actualizado });
    } catch (error) {
        console.error('Error al rechazar el reporte:', error);
        return res.status(500).json({ error: 'Error interno al rechazar el reporte.' });
    }
}
