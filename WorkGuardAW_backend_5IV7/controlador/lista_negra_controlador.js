// controlador/lista_negra_controlador.js
// Lista Negra: la ven administrador y consultor; solo el administrador envía empresas a ella.
import path from 'path';
import { enviarALaListaNegra, listarEmpresasEnListaNegra } from '../modelo/lista_negra_modelo.js';

// CAMBIA ESTO si tus páginas HTML no están dentro de la carpeta desde donde arrancas el servidor.
const RAIZ_HTML = process.cwd();
const MAX_MOTIVO = 1000;

export function mostrarListaNegra(req, res) {
    res.sendFile(path.join(RAIZ_HTML, 'reportes', 'listanegra', 'lista-negra.html'));
}

export async function obtenerListaNegra(req, res) {
    try {
        const empresas = await listarEmpresasEnListaNegra();
        res.json({ empresas });
    } catch (error) {
        console.error('Error al consultar la lista negra:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// El id del administrador sale de la sesión, nunca del navegador.
export async function enviarEmpresaAListaNegra(req, res) {
    const idReporte = Number.parseInt(req.params.id, 10);
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
            idAdministrador: req.session.usuarioId,
            motivo
        });
        if (resultado === 'no_existe') return res.status(404).json({ error: 'El reporte no existe.' });
        if (resultado === 'ya_revisado') return res.status(409).json({ error: 'Este reporte ya fue revisado.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('Error al enviar a la lista negra:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
