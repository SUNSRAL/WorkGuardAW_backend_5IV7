import { supabase } from "../config/supabase.js";

export async function listarComentariosMipyme(idMipyme, idConsultorActual = null) {
  const { data, error } = await supabase
    .from("comentario")
    .select(`
      id_comentario,
      contenido,
      fecha_creacion,
      consultor:id_consultor (
        id_consultor,
        usuario,
        nombre_completo,
        foto_perfil
      ),
      comentario_like (
        id_consultor
      )
    `)
    .eq("id_mipyme", Number(idMipyme))
    .order("fecha_creacion", { ascending: false });

  if (error) throw error;

  return (data || []).map((c) => {
    const listaLikes = Array.isArray(c.comentario_like) ? c.comentario_like : [];
    return {
      id_comentario: c.id_comentario,
      contenido: c.contenido,
      fecha_creacion: c.fecha_creacion,
      consultor: c.consultor,
      likes: listaLikes.length,
      liked: idConsultorActual
        ? listaLikes.some((l) => Number(l.id_consultor) === Number(idConsultorActual))
        : false,
    };
  });
}

export async function crearComentarioMipyme({ idMipyme, idConsultor, contenido }) {
  const { data, error } = await supabase
    .from("comentario")
    .insert({
      id_mipyme: Number(idMipyme),
      id_consultor: Number(idConsultor),
      contenido,
    })
    .select(`
      id_comentario,
      contenido,
      fecha_creacion,
      consultor:id_consultor (
        id_consultor,
        usuario,
        nombre_completo,
        foto_perfil
      )
    `)
    .single();

  if (error) throw error;
  return { ...data, likes: 0, liked: false };
}

export async function toggleLikeComentario({ idComentario, idConsultor }) {
  const idCom = Number(idComentario);
  const idCons = Number(idConsultor);

  const { data: existente, error: errBusq } = await supabase
    .from("comentario_like")
    .select("id_like")
    .eq("id_comentario", idCom)
    .eq("id_consultor", idCons)
    .maybeSingle();

  if (errBusq) throw errBusq;

  let liked = false;
  if (existente) {
    const { error: errDel } = await supabase
      .from("comentario_like")
      .delete()
      .eq("id_like", existente.id_like);
    if (errDel) throw errDel;
    liked = false;
  } else {
    const { error: errIns } = await supabase
      .from("comentario_like")
      .insert({ id_comentario: idCom, id_consultor: idCons });
    if (errIns) throw errIns;
    liked = true;
  }

  const { count, error: errCount } = await supabase
    .from("comentario_like")
    .select("id_like", { count: "exact", head: true })
    .eq("id_comentario", idCom);

  if (errCount) throw errCount;

  return { liked, likes: count || 0 };
}