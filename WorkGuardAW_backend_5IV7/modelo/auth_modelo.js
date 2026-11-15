import { supabase } from '../bd.js';

async function buscarUsuarioPorCredenciales(usuario) {
    const { data: admin } = await supabase
        .from('administrador')
        .select('id_administrador, usuario, contrasena')
        .eq('usuario', usuario)
        .maybeSingle();

    if (admin) {
        return {
            id: admin.id_administrador,
            usuario: admin.usuario,
            nombre: 'Administrador',
            contrasena: admin.contrasena,
            rol: 'admin'
        };
    }

    const { data: consultor } = await supabase
        .from('consultor')
        .select('id_consultor, usuario, contrasena, nombre_completo')
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

    const { data: mipyme } = await supabase
        .from('mipyme')
        .select('id_mipyme, usuario, contrasena, nombre_comercial')
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

export { buscarUsuarioPorCredenciales };


// modulos/autenticacion/autenticacionModelo.js
// Módulo: Autenticación — consultas a la base de datos.
import conexionDB from '../../config/baseDeDatos.js';

// Devuelve el administrador con ese usuario, o null si no existe.
export async function buscarAdministradorPorUsuario(usuario) {
    const { rows } = await conexionDB.query(
        'SELECT * FROM administrador WHERE usuario = $1',
        [usuario]
    );
    return rows[0] || null;
}

// Devuelve el consultor con ese usuario, o null si no existe.
export async function buscarConsultorPorUsuario(usuario) {
    const { rows } = await conexionDB.query(
        'SELECT * FROM consultor WHERE usuario = $1',
        [usuario]
    );
    return rows[0] || null;
}

