import bcrypt from 'bcryptjs';
import { buscarUsuarioPorCredenciales } from '../modules/auth_module.js';
import { NOMBRE_COOKIE } from '../app.js';

export async function login(req, res) {
    try {
        const { usuario, contrasena } = req.body;

        if (!usuario || !contrasena) {
            return res.status(400).json({ error: 'Debes ingresar usuario y contraseña.' });
        }

        const cuenta = await buscarUsuarioPorCredenciales(usuario);
        if (!cuenta) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        // Contraseñas encriptadas con bcrypt y contraseñas de prueba en texto plano
        const esHash = cuenta.contrasena.startsWith('$2');
        const contrasenaValida = esHash
            ? await bcrypt.compare(contrasena, cuenta.contrasena)
            : cuenta.contrasena === contrasena;

        if (!contrasenaValida) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        const ahora = Date.now();
        req.session.usuario = {
            id: cuenta.id,
            usuario: cuenta.usuario,
            nombre: cuenta.nombre,
            rol: cuenta.rol
        };
        req.session.creada = ahora;
        req.session.ultimoUso = ahora;

        return res.json({
            mensaje: 'Inicio de sesión exitoso',
            usuario: req.session.usuario
        });
    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export function verificarSesion(req, res) {
    return res.json({
        autenticado: true,
        usuario: req.session.usuario
    });
}

export function logout(req, res) {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
        }
        res.clearCookie(NOMBRE_COOKIE);
        return res.json({ mensaje: 'Sesión cerrada correctamente.' });
    });
}
