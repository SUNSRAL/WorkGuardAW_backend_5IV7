import { supabase } from '../config/supabase.js';

export async function buscarUsuarioPorCredenciales(usuario) {
    // 1. Buscar en administrador
    const { data: admin } = await supabase
        .from('administrador')
        .select('id_administrador, usuario, contrasena')
        .eq('usuario', usuario)
        .maybeSingle();

    if (admin) {
        return {
            id: admin.id_administrador,
            usuario: admin.usuario,
            nombre: 'Administrador WorkGuard',
            contrasena: admin.contrasena,
            rol: 'admin'
        };
    }

    // 2. Buscar en consultor
    const { data: consultor } = await supabase
        .from('consultor')
        .select('id_consultor, usuario, nombre_completo, contrasena')
        .eq('usuario', usuario)
        .maybeSingle();

    if (consultor) {
        return {
            id: consultor.id_consultor,
            usuario: consultor.usuario,
            nombre: consultor.nombre_completo,
            contrasena: consultor.contrasena,
            rol: 'consultor'
        };
    }

    // 3. Buscar en mipyme
    const { data: mipyme } = await supabase
        .from('mipyme')
        .select('id_mipyme, usuario, nombre_comercial, contrasena')
        .eq('usuario', usuario)
        .maybeSingle();

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
