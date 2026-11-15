// MiPyMEs: página de la tarjeta de la empresa y sus datos.
import path from 'path';
import { obtenerMipymePorId } from '../modelo/mipyme_modelo.js';

// CAMBIA ESTO si tus páginas HTML no están dentro de la carpeta desde donde arrancas el servidor.
const RAIZ_HTML = process.cwd();

// Página con la tarjeta de la MiPyME (panel del consultor)
export function mostrarTarjetaMipyme(req, res) {
    res.sendFile(path.join(RAIZ_HTML, 'reportes', 'consultor', 'dashboard-consultor.html'));
}

// Datos de la tarjeta de la MiPyME
export async function obtenerMipyme(req, res) {
    const idMipyme = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idMipyme)) {
        return res.status(400).json({ error: 'Identificador de MiPyME no válido.' });
    }
    try {
        const mipyme = await obtenerMipymePorId(idMipyme);
        if (!mipyme) {
            return res.status(404).json({ error: 'La MiPyME no existe.' });
        }
        res.json(mipyme);
    } catch (error) {
        console.error('Error al consultar la MiPyME:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
