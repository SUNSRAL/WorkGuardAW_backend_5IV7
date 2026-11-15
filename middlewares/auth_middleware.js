import { NOMBRE_COOKIE } from '../app.js';

export function requiereSesion(req, res, next) {
    const config = req.app.locals.sessionConfig;

    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ error: 'No has iniciado sesión.' });
    }

    const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
    if ((Date.now() - desde) > config.maxAge) {
        return req.session.destroy(() => {
            res.clearCookie(NOMBRE_COOKIE);
            return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión.' });
        });
    }

    req.session.ultimoUso = Date.now();
    next();
}

export function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.session || !req.session.usuario) {
            return res.status(401).json({ error: 'No has iniciado sesión.' });
        }

        if (!rolesPermitidos.includes(req.session.usuario.rol)) {
            return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
        }

        next();
    };
}
