
import { listarMipymes, obtenerMipymePorId } from '../modules/mipyme_module.js';


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
        return res.json(mipyme);
    } catch (error) {
        console.error('Error al consultar la MiPyME:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function obtenerTodasMipymes(req, res) {
    try {
        const empresas = await listarMipymes();
        res.json(empresas);
    } catch (error) {
        console.error('Error al listar MiPyMEs:', error);
        res.status(500).json({ error: 'Error al obtener la lista de empresas.' });
    }
}

