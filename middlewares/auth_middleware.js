import jwt from 'jsonwebtoken';

export const NOMBRE_COOKIE = 'workguard_token';
const tokensRevocados = new Set();

export function revocarToken(jti) {
    if (jti) tokensRevocados.add(jti);
}

export function requiereSesion(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = req.cookies?.[NOMBRE_COOKIE] || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!token) {
        return res.status(401).json({ error: 'No has iniciado sesión.' });
    }

    try {
        const datos = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        if (tokensRevocados.has(datos.jti)) {
            res.clearCookie(NOMBRE_COOKIE);
            return res.status(401).json({ error: 'Sesión revocada, vuelve a iniciar sesión.' });
        }

        req.usuario = {
            id: Number(datos.sub),
            usuario: datos.usuario,
            nombre: datos.nombre,
            rol: datos.rol,
            jti: datos.jti
        };

        next();
    } catch (error) {
        res.clearCookie(NOMBRE_COOKIE);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Tu sesión expiró, vuelve a iniciar sesión.' });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }
}

export function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: 'No has iniciado sesión.' });
        }

        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
        }

        next();
    };
}
