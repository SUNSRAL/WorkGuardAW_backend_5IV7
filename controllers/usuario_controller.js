import bcrypt from 'bcryptjs';
import { obtenerConsultorPorId, crearConsultor, actualizarConsultor, guardarFotoPerfil,
    listarFavoritosConsultor, verificarFavorito,toggleFavoritoMipyme
} from '../modules/usuario_module.js';


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
        return res.status(400).json({
            error: 'Identificador de consultor no válido.'
        });
    }

    // Comprobar que solamente edite su propia cuenta
    if (req.usuario.id !== idConsultor) {
        return res.status(403).json({
            error: 'No puedes modificar la cuenta de otro consultor.'
        });
    }

    // Obtener únicamente los campos permitidos
    const { correo_electronico, nombre_completo } = req.body;

    if (
        correo_electronico === undefined &&
        nombre_completo === undefined
    ) {
        return res.status(400).json({
            error: 'No proporcionaste información para actualizar.'
        });
    }

    // Validar correo si se proporcionó
    if (correo_electronico !== undefined) {

        const correo = correo_electronico.trim();

        const expresionCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!expresionCorreo.test(correo)) {
            return res.status(400).json({
                error: 'El correo electrónico no es válido.'
            });
        }
    }

    try {

        const actualizado = await actualizarConsultor(idConsultor, {
            correo_electronico,
            nombre_completo
        });

        if (!actualizado) {
            return res.status(404).json({
                error: 'Consultor no encontrado.'
            });
        }

        return res.json({
            mensaje: 'Perfil actualizado correctamente.',
            consultor: actualizado
        });

    } catch (error) {

        console.error('Error al actualizar consultor:', error);

        return res.status(500).json({
            error: 'Error interno del servidor.'
        });
    }
}

export async function cambiarFotoPerfil(req, res) {

    const idConsultor = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(idConsultor)) {
        return res.status(400).json({
            error: 'Identificador de consultor no válido.'
        });
    }
    if (req.usuario.id !== idConsultor) {
        return res.status(403).json({
            error: 'No puedes modificar la fotografía de otro consultor.'
        });
    }
    if (!req.file) {
        return res.status(400).json({
            error: 'Debes seleccionar una fotografía.'
        });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
        return res.status(400).json({
            error: 'Formato de imagen no permitido.'
        });
    }
    try {
        const consultor = await guardarFotoPerfil(
            idConsultor,
            req.file
        );

        return res.json({
            mensaje: 'Fotografía actualizada correctamente.',
            foto_perfil: consultor.foto_perfil
        });
    } catch (error) {
        console.error('Error al guardar fotografía:', error);
        return res.status(500).json({
            error: 'No fue posible guardar la fotografía.'
        });
    }
}

export async function getMisFavoritos(req, res) {
  try {
    const empresas = await listarFavoritosConsultor(req.usuario.id);
    return res.json(empresas);
  } catch (error) {
    console.error("Error al listar favoritos:", error);
    return res.status(500).json({ error: "No se pudieron cargar tus empresas guardadas." });
  }
}

export async function getEstadoFavorito(req, res) {
  try {
    const guardado = await verificarFavorito({
      idConsultor: req.usuario.id,
      idMipyme: req.params.idMipyme,
    });
    return res.json({ guardado });
  } catch (error) {
    console.error("Error al verificar favorito:", error);
    return res.status(500).json({ error: "No se pudo verificar el estado de guardado." });
  }
}

export async function postToggleFavorito(req, res) {
  try {
    const resultado = await toggleFavoritoMipyme({
      idConsultor: req.usuario.id,
      idMipyme: req.params.idMipyme,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("Error al guardar favorito:", error);
    return res.status(500).json({ error: "No se pudo actualizar favoritos." });
  }
}