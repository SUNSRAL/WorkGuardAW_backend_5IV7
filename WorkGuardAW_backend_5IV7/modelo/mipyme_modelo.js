// modelo/mipyme_modelo.js
// Consultas a Supabase para las MiPyMEs (versión supabase-js).
import { supabase } from '../bd.js';

// Datos de la tarjeta de la MiPyME. Devuelve null si no existe.
export async function obtenerMipymePorId(idMipyme) {
    const { data, error } = await supabase
        .from('mipyme')
        .select('id_mipyme, nombre_comercial')
        .eq('id_mipyme', idMipyme)
        .maybeSingle();
    if (error) throw error;
    return data;
}
