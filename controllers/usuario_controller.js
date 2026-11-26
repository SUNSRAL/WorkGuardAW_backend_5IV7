import bcrypt from 'bcryptjs';
import { obtenerConsultorPorId, crearConsultor, actualizarConsultor } from '../modules/usuario_module.js';

export async function obtenerConsultor(req, res) {

    const idConsultor = Number.parseInt(req.params.id, 10);

    // Comprobar que el identificador sea válido
    if (!Number.isInteger(idConsultor)) {
        return res.status(400).json({
            error: 'Identificador de consultor no válido.'
        });
    }

    // El consultor solo puede consultar su propia cuenta
    if (
        req.usuario.rol === 'consultor' &&
        req.usuario.id !== idConsultor
    ) {
        return res.status(403).json({
            error: 'No puedes consultar la cuenta de otro consultor.'
        });
    }

    try {

        const consultor = await obtenerConsultorPorId(idConsultor);

        if (!consultor) {
            return res.status(404).json({
                error: 'Consultor no encontrado.'
            });
        }

        return res.json(consultor);

    } catch (error) {

        console.error('Error al obtener consultor:', error);

        return res.status(500).json({
            error: 'Error interno del servidor.'
        });
    }
}

export async function registrarConsultor(req, res) {
    const { usuario, contrasena, correo_electronico, nombre_completo } = req.body;

    if (!usuario || !contrasena || !correo_electronico || !nombre_completo) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const contrasenaHash = await bcrypt.hash(contrasena, 10);
        const nuevo = await crearConsultor({
            usuario: usuario.trim(),
            contrasenaHash,
            correoElectronico: correo_electronico.trim(),
            nombreCompleto: nombre_completo.trim()
        });
        return res.status(201).json({ mensaje: 'Consultor registrado correctamente.', consultor: nuevo });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'El usuario o correo electrónico ya está registrado.' });
        }
        console.error('Error al registrar consultor:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function editarConsultor(req, res) {
    const idConsultor = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idConsultor)) {
        return res.status(400).json({ error: 'Identificador de consultor no válido.' });
    }
    try {
        const actualizado = await actualizarConsultor(idConsultor, req.body);
        if (!actualizado) {
            return res.status(404).json({ error: 'Consultor no encontrado.' });
        }
        return res.json({ mensaje: 'Perfil actualizado.', consultor: actualizado });
    } catch (error) {
        console.error('Error al actualizar consultor:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
