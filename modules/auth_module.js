import { supabase } from '../config/supabase.js';

export async function buscarUsuarioPorCredenciales(usuario) {
    const { data: admin, error: errAdmin } = await supabase
        .from('administrador')
        .select('id_administrador, usuario, contrasena')
        .eq('usuario', usuario)
        .maybeSingle();
    if (errAdmin) throw errAdmin;

    if (admin) {
        return {
            id: admin.id_administrador,
            usuario: admin.usuario,
            nombre: 'Administrador',
            contrasena: admin.contrasena,
            rol: 'administrador'
        };
    }

    const { data: consultor, error: errCons } = await supabase
        .from('consultor')
        .select('id_consultor, usuario, contrasena, nombre_completo')
        .eq('usuario', usuario)
        .maybeSingle();
    if (errCons) throw errCons;

    if (consultor) {
        return {
            id: consultor.id_consultor,
            usuario: consultor.usuario,
            nombre: consultor.nombre_completo,
            contrasena: consultor.contrasena,
            rol: 'consultor'
        };
    }

    const { data: mipyme, error: errMipyme } = await supabase
        .from('mipyme')
        .select('id_mipyme, usuario, contrasena, nombre_comercial')
        .eq('usuario', usuario)
        .maybeSingle();
    if (errMipyme) throw errMipyme;

    if (mipyme) {
        return {
            id: mipyme.id_mipyme,
            usuario: mipyme.usuario,
            nombre: mipyme.nombre_comercial,
            contrasena: mipyme.contrasena,
            rol: 'mipyme'
        };
    }

    return null;
}
