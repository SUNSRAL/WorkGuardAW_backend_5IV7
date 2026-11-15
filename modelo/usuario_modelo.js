import { supabase } from '../bd.js';


async function obtenerConsultorPorId(idUsuario) {
    const { data, error } = await supabase
        .from('consultor')
        .select('*')
        .eq('id_consultor', idUsuario)
        .single();
    if (error) throw error;
    return data;
}

async function obtenerAdminPorId(idUsuario) {
    const { data, error } = await supabase
        .from('administrador')
        .select('*')
        .eq('id_administrador', idUsuario)
        .single();
    if (error) throw error;
    return data;
}

export async function crearConsultor({ usuario, contrasenaHash, correoElectronico, nombreCompleto }) {
    const { data, error } = await supabase
        .from('consultor')
        .insert([
            {
                usuario: usuario,
                contrasena: contrasenaHash, 
                correo_electronico: correoElectronico,
                nombre_completo: nombreCompleto
            }
        ])
        .select('id_consultor, usuario, correo_electronico, nombre_completo');

    if (error) throw error;
    return data[0];
}

async function actualizarConsultor(idConsultor, { usuario, correo_electronico, nombre_completo, rol }) {
    const consultorAnterior = await obtenerPorId(idConsultor);
    if (!consultorAnterior) return undefined;

    const usuarioAnterior = consultorAnterior.usuario;

    //Verificamos los cambios y regresamos si no hubo//

    const cambios = {};
    if (usuario !== undefined) cambios.usuario = usuario;
    if (correo_electronico !== undefined) cambios.correo_electronico = correo_electronico;
    if (nombre_completo !== undefined) cambios.nombre_completo = nombre_completo;

    if (Object.keys(cambios).length === 0) return consultorAnterior;


    const { data, error } = await supabase
        .from('consultor')
        .update(cambios)
        .eq('id_consultor', idConsultor)
        .select();

    if (error) throw error;
    if (!data || data.length === 0) return undefined;

    return data[0];
}



export { obtenerConsultorPorId, obtenerAdminPorId, crearConsultor, actualizarConsultor };