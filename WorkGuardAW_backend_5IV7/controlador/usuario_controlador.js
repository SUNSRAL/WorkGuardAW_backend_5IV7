import * as usuario_modelo from '../modelo/usuario_modelo.js'
import * as mipyme_modelo from '../modelo/mipyme_modelo.js'

import bcrypt from 'bcrypt';


async function obtenerConsultorPorId(req, res) {
    try {
        const usuario = await usuario_modelo.obtenerConsultorPorId(req.params.id);
        
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(usuario);
    } catch (error) {
        console.error("Error al obtener usuario:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

import * as usuario_modelo from '../modelo/usuario_modelo.js';
import * as mipyme_modelo from '../modelo/mipyme_modelo.js';
import bcrypt from 'bcrypt';

async function obtenerConsultorPorId(req, res) {
    try {
        const usuario = await usuario_modelo.obtenerConsultorPorId(req.params.id);
        
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Eliminamos la contraseña del objeto antes de enviarlo al cliente
        const { contrasena, ...usuarioSinContrasena } = usuario;
        res.json(usuarioSinContrasena);
    } catch (error) {
        console.error("Error al obtener usuario:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function loginUsuario(req, res) {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
        return res.status(400).json({ error: 'Por favor ingresa usuario y contraseña' });
    }

    try {
        let usuarioEncontrado = null;
        let rol = '';

        const [admin, consultor, mipyme] = await Promise.all([
            usuario_modelo.obtenerAdminPorId(usuario),
            usuario_modelo.obtenerConsultorPorId(usuario),
            mipyme_modelo.obtenerMipymePorId(usuario)
        ]);

        if (admin) {
            usuarioEncontrado = admin;
            rol = 'administrador';
        } else if (consultor) {
            usuarioEncontrado = consultor;
            rol = 'consultor';
        } else if (mipyme) {
            usuarioEncontrado = mipyme;
            rol = 'mipyme';
        }

        if (!usuarioEncontrado) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        const contrasenaValida = await bcrypt.compare(contrasena, usuarioEncontrado.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }


        const rutasPorRol = {
            administrador: '/admin/dashboard',
            consultor: '/consultor/dashboard',
            mipyme: '/mipyme/dashboard'
        };

        return res.json({
            mensaje: 'Inicio de sesión exitoso',
            rol: rol,
            redirectTo: rutasPorRol[rol]
        });

    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

export { obtenerConsultorPorId, loginUsuario };