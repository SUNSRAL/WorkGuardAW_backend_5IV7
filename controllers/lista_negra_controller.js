import { enviarALaListaNegra, listarEmpresasEnListaNegra } from '../modules/lista_negra_module.js';

const MAX_MOTIVO = 1000;

export async function obtenerListaNegra(req, res) {
    try {
        const empresas = await listarEmpresasEnListaNegra();
        return res.json({ empresas });
    } catch (error) {
        console.error('Error al consultar la lista negra:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function enviarEmpresaAListaNegra(req, res) {
    const idReporte = Number.parseInt(req.params.idReporte, 10);
    const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : '';

    if (!Number.isInteger(idReporte)) {
        return res.status(400).json({ error: 'Identificador de reporte no válido.' });
    }
    if (motivo === '') {
        return res.status(400).json({ error: 'Escribe el motivo por el cual se envía a la lista negra.' });
    }
    if (motivo.length > MAX_MOTIVO) {
        return res.status(400).json({ error: `El motivo no puede superar ${MAX_MOTIVO} caracteres.` });
    }

    try {
        const resultado = await enviarALaListaNegra({
            idReporte,
            idAdministrador: req.session.usuario.id,
            motivo
        });
        if (resultado === 'no_existe') return res.status(404).json({ error: 'El reporte no existe.' });
        if (resultado === 'ya_revisado') return res.status(409).json({ error: 'Este reporte ya fue revisado.' });
        return res.json({ ok: true });
    } catch (error) {
        console.error('Error al enviar a la lista negra:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
