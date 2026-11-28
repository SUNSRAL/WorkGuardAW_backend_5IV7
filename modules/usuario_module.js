import { supabase } from '../config/supabase.js';

export async function obtenerConsultorPorId(idConsultor) {
    const { data, error } = await supabase
        .from('consultor')
        .select('id_consultor, usuario, correo_electronico, nombre_completo, foto_perfil')
        .eq('id_consultor', idConsultor)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function crearConsultor({ usuario, contrasenaHash, correoElectronico, nombreCompleto }) {
    const { data, error } = await supabase
        .from('consultor')
        .insert([{
            usuario,
            contrasena: contrasenaHash,
            correo_electronico: correoElectronico,
            nombre_completo: nombreCompleto
        }])
        .select('id_consultor, usuario, correo_electronico, nombre_completo');
    if (error) throw error;
    return data[0];
}

export async function actualizarConsultor(idConsultor, { usuario, correo_electronico, nombre_completo }) {
    const cambios = {};
    if (usuario !== undefined) cambios.usuario = usuario;
    if (correo_electronico !== undefined) cambios.correo_electronico = correo_electronico;
    if (nombre_completo !== undefined) cambios.nombre_completo = nombre_completo;
    if (Object.keys(cambios).length === 0) {
        return await obtenerConsultorPorId(idConsultor);
    }
    const { data, error } = await supabase
        .from('consultor')
        .update(cambios)
        .eq('id_consultor', idConsultor)
        .select('id_consultor, usuario, correo_electronico, nombre_completo, foto_perfil');
    if (error) throw error;
    return data?.[0] || null;
}

export async function guardarFotoPerfil(idConsultor, archivo) {
    const nombreArchivo = `${idConsultor}/${Date.now()}.webp`;
    // Subir la imagen al bucket
    const { error: errorSubida } = await supabase
        .storage
        .from('workguard_perfiles')
        .upload(nombreArchivo, archivo.buffer, {
            contentType: archivo.mimetype,
            upsert: true
        });
    if (errorSubida) throw errorSubida;

    // Obtener URL pública
    const { data } = supabase
        .storage
        .from('workguard_perfiles')
        .getPublicUrl(nombreArchivo);
    const fotoPerfil = data.publicUrl;

    // Guardar URL en la tabla consultor
    const { data: consultor, error } = await supabase
        .from('consultor')
        .update({ foto_perfil: fotoPerfil })
        .eq('id_consultor', idConsultor)
        .select('id_consultor, foto_perfil')
        .single();
    if (error) throw error;
    return consultor;
}

export async function listarFavoritosConsultor(idConsultor) {
  // Obtener IDs de empresas sancionadas en la lista negra
  const { data: sancionadas, error: errLn } = await supabase
    .from("listado_negro")
    .select("id_mipyme");

  if (errLn) throw errLn;

  const idsSancionadas = new Set(
    (sancionadas || []).map((item) => Number(item.id_mipyme))
  );

  // Obtener los favoritos del consultor
  const { data, error } = await supabase
    .from("favorito_mipyme")
    .select(`
      id_favorito,
      fecha_guardado,
      mipyme:id_mipyme (
        id_mipyme,
        nombre_comercial,
        descripcion,
        logo_url,
        numero_trabajadores,
        estatus_verificacion,
        catalogo_tamano ( opcion_tamano_empresa ),
        existencia_fiscal (
          catalogo_giro ( opcion_giro )
        ),
        fotos_mipyme ( url_imagen )
      )
    `)
    .eq("id_consultor", Number(idConsultor))
    .order("fecha_guardado", { ascending: false });

  if (error) throw error;

  // Filtrar las que existan y NO estén en la lista negra
  return (data || [])
    .map((f) => f.mipyme)
    .filter((m) => m && !idsSancionadas.has(Number(m.id_mipyme)));
}

export async function verificarFavorito({ idConsultor, idMipyme }) {
  const { data, error } = await supabase
    .from("favorito_mipyme")
    .select("id_favorito")
    .eq("id_consultor", Number(idConsultor))
    .eq("id_mipyme", Number(idMipyme))
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function toggleFavoritoMipyme({ idConsultor, idMipyme }) {
  const idCons = Number(idConsultor);
  const idEmp = Number(idMipyme);

  const { data: existente, error: errBusq } = await supabase
    .from("favorito_mipyme")
    .select("id_favorito")
    .eq("id_consultor", idCons)
    .eq("id_mipyme", idEmp)
    .maybeSingle();

  if (errBusq) throw errBusq;

  if (existente) {
    const { error: errDel } = await supabase
      .from("favorito_mipyme")
      .delete()
      .eq("id_favorito", existente.id_favorito);
    if (errDel) throw errDel;
    return { guardado: false };
  }

  const { error: errIns } = await supabase
    .from("favorito_mipyme")
    .insert({ id_consultor: idCons, id_mipyme: idEmp });
  if (errIns) throw errIns;

  return { guardado: true };
}