import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buscarUsuarioPorCredenciales } from '../modules/auth_module.js';
import { NOMBRE_COOKIE, revocarToken } from '../middlewares/auth_middleware.js';

const EXPIRA_SEGUNDOS = 60 * 60 * 2; // 2 horas

function opcionesCookie() {
    const esProduccion = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        sameSite: esProduccion ? 'none' : 'lax',
        secure: esProduccion,
        maxAge: EXPIRA_SEGUNDOS * 1000
    };
}

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

        const esHash = cuenta.contrasena.startsWith('$2');
        const contrasenaValida = esHash
            ? await bcrypt.compare(contrasena, cuenta.contrasena)
            : cuenta.contrasena === contrasena;

        if (!contrasenaValida) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        const token = jwt.sign(
            {
                sub: String(cuenta.id),
                usuario: cuenta.usuario,
                nombre: cuenta.nombre,
                rol: cuenta.rol
            },
            process.env.JWT_SECRET,
            {
                algorithm: 'HS256',
                expiresIn: EXPIRA_SEGUNDOS,
                jwtid: crypto.randomUUID()
            }
        );

        res.cookie(NOMBRE_COOKIE, token, opcionesCookie());

        return res.json({
            mensaje: 'Inicio de sesión exitoso',
            usuario: {
                id: cuenta.id,
                usuario: cuenta.usuario,
                nombre: cuenta.nombre,
                rol: cuenta.rol
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export function verificarSesion(req, res) {
    return res.json({
        autenticado: true,
        usuario: req.usuario
    });
}

export function logout(req, res) {
    if (req.usuario?.jti) {
        revocarToken(req.usuario.jti);
    }
    res.clearCookie(NOMBRE_COOKIE, opcionesCookie());
    return res.json({ mensaje: 'Sesión cerrada correctamente.' });
}
