const NOMBRE_COOKIE = 'connect.sid';

function vencida(sesion, config) {
    const desde = config.rolling ? sesion.ultimoUso : sesion.creada;
    return (Date.now() - desde) > config.maxAge;
}

export function requiereSesion(config) {
    return (req, res, next) => {
        if (req.session.usuario && vencida(req.session, config)) {
            return req.session.destroy(() => {
                res.clearCookie(NOMBRE_COOKIE);
                return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' });
            });
        }

        if (!req.session.usuario) {
            return res.status(401).json({ error: 'No has iniciado sesión' });
        }

        req.session.ultimoUso = Date.now();
        next();
    };
}

export function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.session.usuario || !rolesPermitidos.includes(req.session.usuario.rol)) {
            return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso' });
        }
        next();
    };
}
