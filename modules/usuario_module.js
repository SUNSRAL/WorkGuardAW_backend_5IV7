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
