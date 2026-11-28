import {
  listarComentariosMipyme,
  crearComentarioMipyme,
  toggleLikeComentario,
} from "../modules/comentario_module.js";

export async function getComentariosMipyme(req, res) {
  try {
    const comentarios = await listarComentariosMipyme(req.params.id, req.usuario?.id);
    return res.json(comentarios);
  } catch (error) {
    console.error("Error al listar comentarios:", error);
    return res.status(500).json({ error: "No se pudieron cargar los comentarios." });
  }
}

export async function postComentarioMipyme(req, res) {
  try {
    const texto = (req.body?.contenido || req.body?.comentario || "").trim();
    if (texto.length < 3) {
      return res
        .status(400)
        .json({ error: "Escribe un comentario de al menos 3 caracteres." });
    }

    const nuevo = await crearComentarioMipyme({
      idMipyme: req.params.id,
      idConsultor: req.usuario.id,
      contenido: texto,
    });

    return res.status(201).json(nuevo);
  } catch (error) {
    console.error("Error al publicar comentario:", error);
    return res.status(500).json({ error: "No se pudo publicar el comentario." });
  }
}

export async function postLikeComentario(req, res) {
  try {
    const resultado = await toggleLikeComentario({
      idComentario: req.params.idComentario,
      idConsultor: req.usuario.id,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("Error al procesar like:", error);
    return res.status(500).json({ error: "No se pudo registrar tu voto útil." });
  }
}