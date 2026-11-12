

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==========================================
// RUTAS DE NAVEGACIÓN Y LOGIN
// ==========================================


// Procesar el login
app.post('/login', async (req, res) => {
    const { usuario, contrasena } = req.body;

    try {
        let usuarioEncontrado = null;
        let rol = '';

        // 1. Buscamos primero en la tabla 'administrador'
        const resultadoAdmin = await conexionDB.query(
            'SELECT * FROM administrador WHERE usuario = $1', 
            [usuario]
        );
        const rowsAdmin = resultadoAdmin.rows; 

        if (rowsAdmin.length > 0) {
            usuarioEncontrado = rowsAdmin[0];
            rol = 'administrador';
        } else {
            // 2. Si no está en administrador, buscamos en la tabla 'consultor'
            const resultadoCliente = await conexionDB.query(
                'SELECT * FROM consultor WHERE usuario = $1', 
                [usuario]
            );
            const rowsConsultor = resultadoCliente.rows; // Corregido de resultadoConsultor a resultadoCliente

            if (rowsConsultor.length > 0) {
                usuarioEncontrado = rowsConsultor[0];
                rol = 'consultor';
            }
        }

        // Si no aparece en ninguna de las dos tablas
        if (!usuarioEncontrado) {
            return res.send("<h1>Usuario no encontrado en el sistema. <a href='/login'>Volver</a></h1>");
        }

        // 3. Validar contraseña
        if (contrasena !== usuarioEncontrado.contrasena) {
            return res.send("<h1>Contraseña incorrecta. <a href='/login'>Volver</a></h1>");
        }

        // 4. Guardar los datos en la sesión
        req.session.usuarioId = usuarioEncontrado.id_consultor || usuarioEncontrado.id_administrador || usuarioEncontrado.id;
        req.session.nombreUsuario = usuarioEncontrado.usuario;
        req.session.rol = rol;

        // 5. Redirigir según el rol detectado
        if (rol === 'administrador') {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/consultor/dashboard');
        }

 } catch (error) {
        console.error("DETALLE DEL ERROR EN EL LOGIN:", error); // <--- Agrega esto
        res.status(500).send("Error interno en el servidor: " + error.message); // <--- Y esto para verlo en pantalla
    }
});

// ==========================================
// MIDDLEWARES DE SEGURIDAD (Filtros)
// ==========================================
function esAdministrador(req, res, next) {
    if (req.session && req.session.rol === 'administrador') {
        return next();
    }
    res.redirect('/login');
}

function esConsultor(req, res, next) {
    if (req.session && req.session.rol === 'consultor') {
        return next();
    }
    res.redirect('/login');
}

// ==========================================
// PANELES PROTEGIDOS
// ==========================================

// Panel del Administrador
// Ejemplo de cómo debe quedar la ruta del admin en tu server.js
app.get('/admin/dashboard', esAdministrador, (req, res) => {
    res.sendFile(path.join(__dirname, 'reportes', 'admin', 'dashboard-admin.html'));
});

// Panel del Consultor
app.get('/consultor/dashboard', esConsultor, (req, res) => {
res.sendFile(path.join(__dirname, 'reportes', 'consultor', 'dashboard-consultor.html'));});


// ==========================================
// REPORTES DE MIPYMES
// ==========================================

// Valores permitidos del enum enum_motivo_reporte en Supabase
const MOTIVOS_VALIDOS = [
    'COBRO_POR_CONTRATACION',
    'OFERTA_FALSA',
    'SUPLANTACION_DE_IDENTIDAD',
    'CONDICIONES_ABUSIVAS',
    'EMPRESA_INEXISTENTE',
    'OTRO'
];
const MAX_DESCRIPCION = 2000;

// Igual que esConsultor / esAdministrador, pero para fetch: responde JSON 401 en vez de redirigir
function apiConRol(rol) {
    return (req, res, next) => {
        if (req.session && req.session.rol === rol) return next();
        res.status(401).json({ error: 'Sesión no válida. Inicia sesión de nuevo.' });
    };
}
const apiConsultor = apiConRol('consultor');
const apiAdministrador = apiConRol('administrador');

// --- Consultor: datos de la tarjeta de la MIPyME ---
app.get('/api/mipymes/:id', apiConsultor, async (req, res) => {
    const idMipyme = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idMipyme)) {
        return res.status(400).json({ error: 'Identificador de MiPyME no válido.' });
    }
    try {
        const { rows } = await conexionDB.query(
            'SELECT id_mipyme, nombre_comercial FROM mipyme WHERE id_mipyme = $1',
            [idMipyme]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'La MiPyME no existe.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al consultar la MiPyME:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// --- Consultor: enviar un reporte ---
// El id del consultor sale de la sesión, nunca del navegador.
// estado, fecha_reporte y anonimo toman su valor por defecto en la base de datos.
app.post('/api/reportes', apiConsultor, async (req, res) => {
    const idMipyme = Number.parseInt(req.body.id_mipyme, 10);
    const motivo = req.body.motivo;
    const descripcion = typeof req.body.descripcion === 'string' ? req.body.descripcion.trim() : '';

    if (!Number.isInteger(idMipyme)) {
        return res.status(400).json({ error: 'Identificador de MiPyME no válido.' });
    }
    if (!MOTIVOS_VALIDOS.includes(motivo)) {
        return res.status(400).json({ error: 'Selecciona un motivo válido.' });
    }
    if (descripcion === '') {
        return res.status(400).json({ error: 'Escribe la descripción del reporte.' });
    }
    if (descripcion.length > MAX_DESCRIPCION) {
        return res.status(400).json({ error: `La descripción no puede superar ${MAX_DESCRIPCION} caracteres.` });
    }

    try {
        const { rows } = await conexionDB.query(
            `INSERT INTO reportes (id_mipyme, id_consultor, motivo, descripcion)
             VALUES ($1, $2, $3, $4)
             RETURNING id_reporte`,
            [idMipyme, req.session.usuarioId, motivo, descripcion]
        );
        res.status(201).json({ ok: true, id_reporte: rows[0].id_reporte });
    } catch (error) {
        if (error.code === '23503') { // violación de llave foránea: la MiPyME (o el consultor) no existe
            return res.status(404).json({ error: 'La MiPyME no existe.' });
        }
        console.error('Error al guardar el reporte:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// --- Administrador: lista de reportes (pendientes primero) ---
app.get('/api/admin/reportes', apiAdministrador, async (req, res) => {
    try {
        const { rows } = await conexionDB.query(
            `SELECT r.id_reporte, r.id_consultor, r.motivo, r.descripcion, r.estado, r.fecha_reporte,
                    c.usuario AS consultor_usuario,
                    m.nombre_comercial
             FROM reportes r
             JOIN consultor c ON c.id_consultor = r.id_consultor
             JOIN mipyme m ON m.id_mipyme = r.id_mipyme
             ORDER BY (r.estado = 'PENDIENTE') DESC, r.fecha_reporte DESC
             LIMIT 200`
        );
        const nuevos = rows.filter(r => r.estado === 'PENDIENTE').length;
        res.json({ nuevos, reportes: rows });
    } catch (error) {
        console.error('Error al listar reportes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// --- Administrador: un reporte completo ---
app.get('/api/admin/reportes/:id', apiAdministrador, async (req, res) => {
    const idReporte = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idReporte)) {
        return res.status(400).json({ error: 'Identificador de reporte no válido.' });
    }
    try {
        const { rows } = await conexionDB.query(
            `SELECT r.id_reporte, r.id_mipyme, r.id_consultor, r.motivo, r.otro_motivo, r.descripcion,
                    r.estado, r.id_administrador,
                    -- las columnas son "timestamp without time zone" y Supabase guarda la hora en UTC;
                    -- se indica para que el navegador la muestre correctamente en la hora local
                    (r.fecha_reporte AT TIME ZONE 'UTC') AS fecha_reporte,
                    (r.fecha_revision AT TIME ZONE 'UTC') AS fecha_revision,
                    c.usuario AS consultor_usuario, c.nombre_completo AS consultor_nombre,
                    c.correo_electronico AS consultor_correo,
                    m.nombre_comercial, m.tipo_persona, m.numero_trabajadores
             FROM reportes r
             JOIN consultor c ON c.id_consultor = r.id_consultor
             JOIN mipyme m ON m.id_mipyme = r.id_mipyme
             WHERE r.id_reporte = $1`,
            [idReporte]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'El reporte no existe.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al consultar el reporte:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// --- Páginas del administrador (protegidas) ---
app.get('/admin/reportes', esAdministrador, (req, res) => {
    res.sendFile(path.join(__dirname, 'reportes', 'admin', 'dashreportes.html'));
});

app.get('/admin/reportes/detalle', esAdministrador, (req, res) => {
    res.sendFile(path.join(__dirname, 'reportes', 'admin', 'detalle-reporte.html'));
});

// Cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


//Servidor//
import app from './src/app.js';

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}/login`);
});