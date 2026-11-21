import { supabase } from '../config/supabase.js';

export async function obtenerMipymePorId(idMipyme) {
    const { data, error } = await supabase
        .from('mipyme')
        .select(`
            id_mipyme,
            nombre_comercial,
            tipo_persona,
            numero_trabajadores,
            catalogo_tamano(opcion_tamano_empresa),
            existencia_fiscal(rfc, catalogo_giro(opcion_giro)),
            actividad(facebook, instagram, twitter, pagina_web)
        `)
        .eq('id_mipyme', idMipyme)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function listarMipymes() {
    const { data, error } = await supabase
        .from('mipyme')
        .select(`
            id_mipyme, nombre_comercial, tipo_persona, numero_trabajadores,
            catalogo_tamano(opcion_tamano_empresa),
            existencia_fiscal(rfc, catalogo_giro(opcion_giro))
        `)
        .order('id_mipyme', { ascending: false });

    if (error) throw error;
    return data || [];
}